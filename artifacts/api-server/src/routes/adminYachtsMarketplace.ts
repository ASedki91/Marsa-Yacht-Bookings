import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  auditLogsTable,
  db,
  hostProfilesTable,
  yachtsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireRole, validateBody } from "../middlewares";
import { notify } from "../lib/notify";

const router: IRouter = Router();
const featuredSchema = z
  .object({
    isFeatured: z.boolean(),
    featuredSortOrder: z.number().int().min(0).optional().default(0),
    featuredFrom: z.string().datetime({ offset: true }).nullable().optional(),
    featuredUntil: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine(
    (value) =>
      !value.featuredFrom ||
      !value.featuredUntil ||
      Date.parse(value.featuredFrom) <= Date.parse(value.featuredUntil),
    {
      message: "featuredFrom must be before featuredUntil",
      path: ["featuredUntil"],
    },
  );

router.use("/admin/yachts", requireAuth, requireRole("admin"));

router.post(
  "/admin/yachts/:id/reactivate",
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.id);
    const [yacht] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(yachtsTable)
        .set({ status: "live" })
        .where(
          and(
            eq(yachtsTable.id, yachtId),
            eq(yachtsTable.status, "suspended"),
          ),
        )
        .returning();
      if (!updated) return [];
      await tx.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        action: "admin.reactivate_yacht",
        entityType: "yacht",
        entityId: yachtId,
        oldValue: { status: "suspended" },
        newValue: { status: "live" },
        ipAddress: req.ip,
      });
      return [updated];
    });
    if (!yacht) {
      res.status(409).json({ error: "Only suspended yachts can be reactivated" });
      return;
    }
    const [host] = await db
      .select({ userId: hostProfilesTable.userId })
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.id, yacht.hostId))
      .limit(1);
    if (host) {
      notify({
        userId: host.userId,
        type: "yacht.reactivated",
        title: "Yacht listing reactivated",
        message: `Your yacht "${yacht.title}" is live again.`,
        relatedEntityType: "yacht",
        relatedEntityId: yacht.id,
      });
    }
    res.json(yacht);
  },
);

router.patch(
  "/admin/yachts/:id/featured",
  validateBody(featuredSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.id);
    const input = req.body as z.infer<typeof featuredSchema>;
    const [existing] = await db
      .select()
      .from(yachtsTable)
      .where(eq(yachtsTable.id, yachtId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }
    if (input.isFeatured && existing.status !== "live") {
      res.status(409).json({ error: "Only live yachts can be featured" });
      return;
    }
    const updates = {
      isFeatured: input.isFeatured,
      featuredSortOrder: input.featuredSortOrder,
      featuredFrom:
        input.isFeatured && input.featuredFrom
          ? new Date(input.featuredFrom)
          : null,
      featuredUntil:
        input.isFeatured && input.featuredUntil
          ? new Date(input.featuredUntil)
          : null,
    };
    const [yacht] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(yachtsTable)
        .set(updates)
        .where(eq(yachtsTable.id, yachtId))
        .returning();
      await tx.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        action: "admin.update_yacht_featured",
        entityType: "yacht",
        entityId: yachtId,
        oldValue: {
          isFeatured: existing.isFeatured,
          featuredSortOrder: existing.featuredSortOrder,
          featuredFrom: existing.featuredFrom,
          featuredUntil: existing.featuredUntil,
        },
        newValue: updates,
        ipAddress: req.ip,
      });
      return [updated];
    });
    res.json(yacht);
  },
);

export default router;
