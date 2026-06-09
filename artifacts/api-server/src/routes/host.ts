import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  hostProfilesTable,
  hostDocumentsTable,
  yachtsTable,
  yachtTemplatePricingTable,
  bookingTemplatesTable,
  availabilitySlotsTable,
  earningsLedgerTable,
  withdrawalRequestsTable,
  photographerRequestsTable,
  auditLogsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, sql, sum, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, requireRole, validateBody } from "../middlewares/index";

const router: IRouter = Router();

router.use(requireAuth);

// ── Host Application ────────────────────────────────────────────────────────
const hostApplySchema = z.object({
  bio: z.string().min(10).max(2000),
});

router.post(
  "/host/apply",
  validateBody(hostApplySchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;

    const [existing] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Host application already exists", profile: existing });
      return;
    }

    const [profile] = await db
      .insert(hostProfilesTable)
      .values({ id: randomUUID(), userId: user.id, bio: req.body.bio, verificationStatus: "pending" })
      .returning();

    await db
      .insert(auditLogsTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        action: "host.apply",
        entityType: "host_profile",
        entityId: profile.id,
        ipAddress: req.ip,
      })
      .catch(() => {});

    res.status(201).json(profile);
  },
);

// ── Host Profile ────────────────────────────────────────────────────────────
router.get(
  "/host/profile",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }
    res.json(profile);
  },
);

const hostProfileUpdateSchema = z.object({
  bio: z.string().min(10).max(2000).optional(),
});

router.put(
  "/host/profile",
  requireRole("host", "admin"),
  validateBody(hostProfileUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .update(hostProfilesTable)
      .set({ bio: req.body.bio })
      .where(eq(hostProfilesTable.userId, user.id))
      .returning();
    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }
    res.json(profile);
  },
);

// ── Host Documents ──────────────────────────────────────────────────────────
const documentSchema = z.object({
  documentType: z.enum(["national_id", "yacht_ownership", "yacht_license", "insurance"]),
  fileUrl: z.string().url(),
});

router.post(
  "/host/documents",
  requireRole("host", "admin"),
  validateBody(documentSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }

    const [doc] = await db
      .insert(hostDocumentsTable)
      .values({
        id: randomUUID(),
        hostId: profile.id,
        documentType: req.body.documentType,
        fileUrl: req.body.fileUrl,
        status: "pending",
      })
      .returning();
    res.status(201).json(doc);
  },
);

// ── Photographer Request ────────────────────────────────────────────────────
const photographerSchema = z.object({
  yachtId: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

router.post(
  "/host/photographer-request",
  requireRole("host", "admin"),
  validateBody(photographerSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }

    const [request] = await db
      .insert(photographerRequestsTable)
      .values({
        id: randomUUID(),
        hostId: profile.id,
        yachtId: req.body.yachtId ?? null,
        preferredDate: req.body.preferredDate ?? null,
        preferredTime: req.body.preferredTime ?? null,
        notes: req.body.notes ?? null,
        status: "pending",
      })
      .returning();
    res.status(201).json(request);
  },
);

// ── Host Yachts ─────────────────────────────────────────────────────────────
router.get(
  "/host/yachts",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }

    const yachts = await db
      .select()
      .from(yachtsTable)
      .where(eq(yachtsTable.hostId, profile.id))
      .orderBy(desc(yachtsTable.createdAt));
    res.json({ yachts, total: yachts.length, page: 1, limit: 100 });
  },
);

const yachtInputSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  location: z.string().min(2).max(200),
  categoryId: z.string().optional(),
  capacity: z.number().int().min(1).max(200),
  lengthFt: z.number().positive().optional(),
  yearBuilt: z.number().int().optional(),
  manufacturer: z.string().max(100).optional(),
  features: z.array(z.string()).optional(),
});

router.post(
  "/host/yachts",
  requireRole("host", "admin"),
  validateBody(yachtInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found. Apply to become a host first." });
      return;
    }

    const body = req.body as z.infer<typeof yachtInputSchema>;
    const [yacht] = await db
      .insert(yachtsTable)
      .values({
        id: randomUUID(),
        hostId: profile.id,
        title: body.title,
        description: body.description ?? null,
        location: body.location,
        city: "Gouna",
        categoryId: body.categoryId ?? null,
        capacity: body.capacity,
        lengthFt: body.lengthFt ? String(body.lengthFt) : null,
        yearBuilt: body.yearBuilt ?? null,
        manufacturer: body.manufacturer ?? null,
        features: body.features ?? [],
        status: "draft",
      })
      .returning();
    res.status(201).json(yacht);
  },
);

const yachtUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  location: z.string().min(2).max(200).optional(),
  categoryId: z.string().optional(),
  capacity: z.number().int().min(1).max(200).optional(),
  features: z.array(z.string()).optional(),
});

router.patch(
  "/host/yachts/:id",
  requireRole("host", "admin"),
  validateBody(yachtUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }

    const [yacht] = await db
      .select()
      .from(yachtsTable)
      .where(and(eq(yachtsTable.id, id), eq(yachtsTable.hostId, profile.id)))
      .limit(1);
    if (!yacht) { res.status(404).json({ error: "Yacht not found" }); return; }

    if (!["draft", "changes_requested"].includes(yacht.status)) {
      res.status(400).json({ error: "Yacht cannot be edited in its current status" });
      return;
    }

    const body = req.body as z.infer<typeof yachtUpdateSchema>;
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.location !== undefined) updates.location = body.location;
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (body.capacity !== undefined) updates.capacity = body.capacity;
    if (body.features !== undefined) updates.features = body.features;

    const [updated] = await db
      .update(yachtsTable)
      .set(updates as any)
      .where(eq(yachtsTable.id, id))
      .returning();
    res.json(updated);
  },
);

// ── Availability Slots (batch upsert) ───────────────────────────────────────
const availabilityBatchSchema = z.object({
  slots: z.array(
    z.object({
      templateId: z.string(),
      date: z.string(),
      startTime: z.string(),
      isAvailable: z.boolean(),
    }),
  ),
});

router.post(
  "/host/yachts/:id/availability",
  requireRole("host", "admin"),
  validateBody(availabilityBatchSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    const [yacht] = profile
      ? await db
          .select()
          .from(yachtsTable)
          .where(and(eq(yachtsTable.id, yachtId), eq(yachtsTable.hostId, profile.id)))
          .limit(1)
      : [];

    if (!yacht) { res.status(404).json({ error: "Yacht not found" }); return; }

    const slots = req.body.slots as z.infer<typeof availabilityBatchSchema>["slots"];

    // Manual upsert per slot (partial unique index can't be used in onConflictDoUpdate)
    const results = await Promise.all(
      slots.map(async (slot) => {
        const [existing] = await db
          .select()
          .from(availabilitySlotsTable)
          .where(
            and(
              eq(availabilitySlotsTable.yachtId, yachtId),
              eq(availabilitySlotsTable.templateId, slot.templateId),
              eq(availabilitySlotsTable.date, slot.date),
              eq(availabilitySlotsTable.startTime, slot.startTime),
            ),
          )
          .limit(1);

        if (existing) {
          const [updated] = await db
            .update(availabilitySlotsTable)
            .set({ isAvailable: slot.isAvailable })
            .where(eq(availabilitySlotsTable.id, existing.id))
            .returning();
          return updated;
        }

        const [inserted] = await db
          .insert(availabilitySlotsTable)
          .values({
            id: randomUUID(),
            yachtId,
            templateId: slot.templateId,
            date: slot.date,
            startTime: slot.startTime,
            isAvailable: slot.isAvailable,
          })
          .returning();
        return inserted;
      }),
    );

    res.json({ slots: results });
  },
);

// ── Pricing (batch upsert) ──────────────────────────────────────────────────
const pricingBatchSchema = z.object({
  pricing: z.array(
    z.object({
      templateId: z.string(),
      priceEgp: z.string().regex(/^\d+(\.\d{1,2})?$/),
    }),
  ),
});

router.put(
  "/host/yachts/:id/pricing",
  requireRole("host", "admin"),
  validateBody(pricingBatchSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    const [yacht] = profile
      ? await db
          .select()
          .from(yachtsTable)
          .where(and(eq(yachtsTable.id, yachtId), eq(yachtsTable.hostId, profile.id)))
          .limit(1)
      : [];

    if (!yacht) { res.status(404).json({ error: "Yacht not found" }); return; }

    const pricing = req.body.pricing as z.infer<typeof pricingBatchSchema>["pricing"];

    const upserted = await Promise.all(
      pricing.map((item) =>
        db
          .insert(yachtTemplatePricingTable)
          .values({
            id: randomUUID(),
            yachtId,
            templateId: item.templateId,
            price: item.priceEgp,
            currency: "EGP",
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [yachtTemplatePricingTable.yachtId, yachtTemplatePricingTable.templateId],
            set: { price: item.priceEgp, isActive: true },
          })
          .returning(),
      ),
    );

    const templateIds = upserted.flat().map((r) => r.templateId);
    const templates = await db
      .select()
      .from(bookingTemplatesTable)
      .where(sql`${bookingTemplatesTable.id} = ANY(${templateIds})`);

    const result = upserted.flat().map((p) => {
      const tmpl = templates.find((t) => t.id === p.templateId);
      return {
        templateId: p.templateId,
        templateName: tmpl?.name ?? "",
        durationHours: tmpl?.durationHours ?? 0,
        priceEgp: p.price,
      };
    });

    res.json({ pricing: result });
  },
);

// ── Submit for Review ───────────────────────────────────────────────────────
router.post(
  "/host/yachts/:id/submit",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    const [yacht] = profile
      ? await db
          .select()
          .from(yachtsTable)
          .where(and(eq(yachtsTable.id, id), eq(yachtsTable.hostId, profile.id)))
          .limit(1)
      : [];

    if (!yacht) { res.status(404).json({ error: "Yacht not found" }); return; }

    if (!["draft", "changes_requested"].includes(yacht.status)) {
      res.status(400).json({ error: "Yacht is already submitted or approved" });
      return;
    }

    const [updated] = await db
      .update(yachtsTable)
      .set({ status: "pending_review" })
      .where(eq(yachtsTable.id, id))
      .returning();

    await db
      .insert(auditLogsTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        action: "yacht.submit_for_review",
        entityType: "yacht",
        entityId: id,
        ipAddress: req.ip,
      })
      .catch(() => {});

    res.json(updated);
  },
);

// ── Earnings ────────────────────────────────────────────────────────────────
router.get(
  "/host/earnings",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }

    // Auto-release earnings past their eligibility date
    await db
      .update(earningsLedgerTable)
      .set({ status: "available" })
      .where(
        and(
          eq(earningsLedgerTable.hostId, profile.id),
          eq(earningsLedgerTable.status, "pending"),
          sql`${earningsLedgerTable.eligibleAt} <= NOW()`,
        ),
      )
      .catch(() => {});

    const ledger = await db
      .select()
      .from(earningsLedgerTable)
      .where(eq(earningsLedgerTable.hostId, profile.id))
      .orderBy(desc(earningsLedgerTable.createdAt))
      .limit(100);

    const totals = await db
      .select({
        status: earningsLedgerTable.status,
        total: sql<string>`COALESCE(SUM(${earningsLedgerTable.amountEgp}), 0)::text`,
      })
      .from(earningsLedgerTable)
      .where(
        and(
          eq(earningsLedgerTable.hostId, profile.id),
          eq(earningsLedgerTable.type, "earning"),
        ),
      )
      .groupBy(earningsLedgerTable.status);

    const byStatus: Record<string, string> = {};
    for (const row of totals) byStatus[row.status] = row.total;

    res.json({
      totalEarnedEgp: String(
        (
          parseFloat(byStatus["available"] ?? "0") +
          parseFloat(byStatus["pending"] ?? "0") +
          parseFloat(byStatus["withdrawn"] ?? "0")
        ).toFixed(2),
      ),
      availableEgp: byStatus["available"] ?? "0",
      pendingEgp: byStatus["pending"] ?? "0",
      withdrawnEgp: byStatus["withdrawn"] ?? "0",
      ledger,
    });
  },
);

// ── Withdrawals ─────────────────────────────────────────────────────────────
router.get(
  "/host/withdrawals",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }

    const withdrawals = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.hostId, profile.id))
      .orderBy(desc(withdrawalRequestsTable.createdAt));
    res.json({ withdrawals, total: withdrawals.length });
  },
);

const withdrawalInputSchema = z.object({
  amountEgp: z.string().regex(/^\d+(\.\d{1,2})?$/),
  payoutMethod: z.string().min(1),
});

router.post(
  "/host/withdrawals",
  requireRole("host", "admin"),
  validateBody(withdrawalInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }

    const [available] = await db
      .select({ total: sql<string>`COALESCE(SUM(${earningsLedgerTable.amountEgp}), 0)::text` })
      .from(earningsLedgerTable)
      .where(
        and(eq(earningsLedgerTable.hostId, profile.id), eq(earningsLedgerTable.status, "available")),
      );

    const availableAmount = parseFloat(available?.total ?? "0");
    const requestedAmount = parseFloat(req.body.amountEgp);

    if (requestedAmount > availableAmount) {
      res.status(400).json({
        error: "Insufficient available balance",
        available: availableAmount.toFixed(2),
      });
      return;
    }

    const [withdrawal] = await db
      .insert(withdrawalRequestsTable)
      .values({
        id: randomUUID(),
        hostId: profile.id,
        amountEgp: req.body.amountEgp,
        status: "withdrawal_requested",
        requestedAt: new Date(),
        payoutMethod: req.body.payoutMethod,
      })
      .returning();
    res.status(201).json(withdrawal);
  },
);

export default router;
