import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  auditLogsTable,
  cancellationPoliciesTable,
  cancellationPolicyRulesTable,
  db,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole, validateBody } from "../middlewares";
import {
  getActiveCancellationPolicy,
  getCancellationPolicyById,
  listCancellationPolicies,
  validateCancellationRuleSet,
} from "../lib/cancellations/policy";

const router: IRouter = Router();
const CANCELLATION_POLICY_WRITE_LOCK = 4_620_777;

const createPolicySchema = z.object({
  name: z.string().trim().min(1).max(120),
  clonePolicyId: z.string().min(1).optional(),
});
const updatePolicySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
const ruleInputSchema = z.object({
  minimumMinutesBeforeTrip: z.number().int().min(0),
  feePercentage: z.number().min(0).max(100),
});
const rulesInputSchema = z.object({
  rules: z.array(ruleInputSchema).min(1),
});

router.get(
  "/cancellation-policy/current",
  async (_req: Request, res: Response): Promise<void> => {
    const policy = await getActiveCancellationPolicy();
    if (!policy) {
      res
        .status(503)
        .json({ error: "No active cancellation policy is configured" });
      return;
    }
    res.json(policy);
  },
);

router.use("/admin/cancellation-policies", requireAuth, requireRole("admin"));

router.get(
  "/admin/cancellation-policies",
  async (_req: Request, res: Response): Promise<void> => {
    res.json({ policies: await listCancellationPolicies() });
  },
);

router.post(
  "/admin/cancellation-policies",
  validateBody(createPolicySchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const body = req.body as z.infer<typeof createPolicySchema>;
    const clone = body.clonePolicyId
      ? await getCancellationPolicyById(body.clonePolicyId)
      : null;
    if (body.clonePolicyId && !clone) {
      res
        .status(404)
        .json({ error: "Cancellation policy to clone was not found" });
      return;
    }

    const policyId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${CANCELLATION_POLICY_WRITE_LOCK})`,
      );
      const [versionRow] = await tx
        .select({
          nextVersion: sql<number>`coalesce(max(${cancellationPoliciesTable.version}), 0)::int + 1`,
        })
        .from(cancellationPoliciesTable);
      await tx.insert(cancellationPoliciesTable).values({
        id: policyId,
        name: body.name,
        version: versionRow?.nextVersion ?? 1,
        status: "draft",
        createdBy: user.id,
      });
      if (clone?.rules.length) {
        await tx.insert(cancellationPolicyRulesTable).values(
          clone.rules.map((rule) => ({
            id: randomUUID(),
            policyId,
            minimumMinutesBeforeTrip: rule.minimumMinutesBeforeTrip,
            feePercentage: rule.feePercentage,
          })),
        );
      }
    });
    const policy = await getCancellationPolicyById(policyId);
    res.status(201).json(policy);
  },
);

router.patch(
  "/admin/cancellation-policies/:id",
  validateBody(updatePolicySchema),
  async (req: Request, res: Response): Promise<void> => {
    const policyId = String(req.params.id);
    const [policy] = await db
      .update(cancellationPoliciesTable)
      .set({ name: (req.body as z.infer<typeof updatePolicySchema>).name })
      .where(
        and(
          eq(cancellationPoliciesTable.id, policyId),
          eq(cancellationPoliciesTable.status, "draft"),
        ),
      )
      .returning();
    if (!policy) {
      res
        .status(409)
        .json({ error: "Only draft cancellation policies can be edited" });
      return;
    }
    res.json(await getCancellationPolicyById(policyId));
  },
);

router.put(
  "/admin/cancellation-policies/:id/rules",
  validateBody(rulesInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const policyId = String(req.params.id);
    const body = req.body as z.infer<typeof rulesInputSchema>;
    const validationError = validateCancellationRuleSet(body.rules);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [draft] = await tx
        .select({ id: cancellationPoliciesTable.id })
        .from(cancellationPoliciesTable)
        .where(
          and(
            eq(cancellationPoliciesTable.id, policyId),
            eq(cancellationPoliciesTable.status, "draft"),
          ),
        )
        .limit(1)
        .for("update");
      if (!draft) return false;
      await tx
        .delete(cancellationPolicyRulesTable)
        .where(eq(cancellationPolicyRulesTable.policyId, policyId));
      await tx.insert(cancellationPolicyRulesTable).values(
        [...body.rules]
          .sort(
            (left, right) =>
              right.minimumMinutesBeforeTrip - left.minimumMinutesBeforeTrip,
          )
          .map((rule) => ({
            id: randomUUID(),
            policyId,
            minimumMinutesBeforeTrip: rule.minimumMinutesBeforeTrip,
            feePercentage: rule.feePercentage.toFixed(2),
          })),
      );
      return true;
    });
    if (!updated) {
      res
        .status(409)
        .json({ error: "Only draft cancellation policies can be edited" });
      return;
    }
    res.json(await getCancellationPolicyById(policyId));
  },
);

router.post(
  "/admin/cancellation-policies/:id/activate",
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const policyId = String(req.params.id);
    const now = new Date();
    const activation = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${CANCELLATION_POLICY_WRITE_LOCK})`,
      );
      const [policy] = await tx
        .select()
        .from(cancellationPoliciesTable)
        .where(
          and(
            eq(cancellationPoliciesTable.id, policyId),
            eq(cancellationPoliciesTable.status, "draft"),
          ),
        )
        .limit(1)
        .for("update");
      if (!policy) {
        return { error: "Only a draft policy can be activated", status: 409 };
      }
      const rules = await tx
        .select()
        .from(cancellationPolicyRulesTable)
        .where(eq(cancellationPolicyRulesTable.policyId, policyId))
        .orderBy(desc(cancellationPolicyRulesTable.minimumMinutesBeforeTrip));
      const validationError = validateCancellationRuleSet(rules);
      if (validationError) {
        return { error: validationError, status: 400 };
      }

      await tx
        .update(cancellationPoliciesTable)
        .set({ status: "retired", retiredAt: now })
        .where(eq(cancellationPoliciesTable.status, "active"));
      const [activated] = await tx
        .update(cancellationPoliciesTable)
        .set({ status: "active", activatedAt: now, retiredAt: null })
        .where(
          and(
            eq(cancellationPoliciesTable.id, policyId),
            eq(cancellationPoliciesTable.status, "draft"),
          ),
        )
        .returning({ id: cancellationPoliciesTable.id });
      if (!activated)
        throw new Error("Cancellation policy changed during activation");
      await tx.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        action: "cancellation_policy.activated",
        entityType: "cancellation_policy",
        entityId: policyId,
        newValue: { version: policy.version },
        ipAddress: req.ip,
      });
      return { policy };
    });
    if ("error" in activation) {
      res.status(activation.status ?? 409).json({ error: activation.error });
      return;
    }
    res.json(await getCancellationPolicyById(policyId));
  },
);

export default router;
