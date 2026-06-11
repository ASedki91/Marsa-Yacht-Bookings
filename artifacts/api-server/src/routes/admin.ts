import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  usersTable,
  hostProfilesTable,
  hostDocumentsTable,
  yachtsTable,
  bookingsTable,
  reviewsTable,
  withdrawalRequestsTable,
  earningsLedgerTable,
  auditLogsTable,
  categoriesTable,
  addOnsTable,
  bookingTemplatesTable,
  photographerRequestsTable,
  exampleYachtPhotosTable,
} from "@workspace/db";
import { and, eq, sql, desc, asc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  requireAuth,
  requireRole,
  validateBody,
  validateQuery,
  auditLog,
} from "../middlewares/index";
import { notify } from "../lib/notify";

const router: IRouter = Router();

// Scope the admin guard to /admin paths only. Mounting it path-less would make
// requireAuth/requireRole intercept EVERY request that reaches this router
// (it's mounted before other routers), breaking unrelated routes like /dev/*.
router.use("/admin", requireAuth, requireRole("admin"));

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/admin/stats", async (_req: Request, res: Response): Promise<void> => {
  const [
    [usersRow],
    [hostsRow],
    [yachtsRow],
    [bookingsRow],
    [revenueRow],
    [pendingHostsRow],
    [pendingYachtsRow],
    [pendingWithdrawalsRow],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable),
    db.select({ count: sql<number>`count(*)::int` }).from(hostProfilesTable),
    db.select({ count: sql<number>`count(*)::int` }).from(yachtsTable),
    db.select({ count: sql<number>`count(*)::int` }).from(bookingsTable),
    db
      .select({ total: sql<string>`COALESCE(SUM(total_amount_egp), 0)::text` })
      .from(bookingsTable)
      .where(sql`status NOT IN ('pending_payment','cancelled')`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.verificationStatus, "pending")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(yachtsTable)
      .where(eq(yachtsTable.status, "pending_review")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.status, "withdrawal_requested")),
  ]);

  res.json({
    totalUsers: usersRow?.count ?? 0,
    totalHosts: hostsRow?.count ?? 0,
    totalYachts: yachtsRow?.count ?? 0,
    totalBookings: bookingsRow?.count ?? 0,
    totalRevenueEgp: revenueRow?.total ?? "0",
    pendingHostApplications: pendingHostsRow?.count ?? 0,
    pendingYachtReviews: pendingYachtsRow?.count ?? 0,
    pendingWithdrawals: pendingWithdrawalsRow?.count ?? 0,
  });
});

// ── Users ─────────────────────────────────────────────────────────────────────
const adminListUsersQuery = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  role: z.enum(["guest", "host", "admin"]).optional(),
});

router.get(
  "/admin/users",
  validateQuery(adminListUsersQuery),
  async (req: Request, res: Response): Promise<void> => {
    const { page, role } = req.query as unknown as z.infer<typeof adminListUsersQuery>;
    const limit = 50;
    const offset = (page - 1) * limit;
    const where = role ? eq(usersTable.role, role) : sql`true`;

    const [users, [countRow]] = await Promise.all([
      db
        .select()
        .from(usersTable)
        .where(where)
        .orderBy(desc(usersTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(where),
    ]);
    res.json({ users, total: countRow?.count ?? 0 });
  },
);

const roleUpdateSchema = z.object({
  role: z.enum(["guest", "host", "admin"]),
});

router.patch(
  "/admin/users/:id/role",
  validateBody(roleUpdateSchema),
  auditLog({
    action: "admin.set_user_role",
    entityType: "user",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [user] = await db
      .update(usersTable)
      .set({ role: req.body.role })
      .where(eq(usersTable.id, id))
      .returning();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  },
);

// ── Hosts ─────────────────────────────────────────────────────────────────────
const adminListHostsQuery = z.object({
  status: z.enum(["pending", "verified", "rejected"]).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
});

router.get(
  "/admin/hosts",
  validateQuery(adminListHostsQuery),
  async (req: Request, res: Response): Promise<void> => {
    const { status, page } = req.query as unknown as z.infer<typeof adminListHostsQuery>;
    const limit = 50;
    const offset = (page - 1) * limit;
    const where = status ? eq(hostProfilesTable.verificationStatus, status) : sql`true`;

    const [hosts, [countRow]] = await Promise.all([
      db
        .select()
        .from(hostProfilesTable)
        .where(where)
        .orderBy(desc(hostProfilesTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(hostProfilesTable).where(where),
    ]);
    res.json({ hosts, total: countRow?.count ?? 0 });
  },
);

const hostVerificationSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  reason: z.string().max(500).optional(),
});

router.post(
  "/admin/hosts/:id/verify",
  validateBody(hostVerificationSchema),
  auditLog({
    action: "admin.verify_host",
    entityType: "host_profile",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const { status, reason } = req.body as z.infer<typeof hostVerificationSchema>;

    const [profile] = await db
      .update(hostProfilesTable)
      .set({ verificationStatus: status })
      .where(eq(hostProfilesTable.id, id))
      .returning();

    if (!profile) { res.status(404).json({ error: "Host profile not found" }); return; }

    if (status === "verified") {
      await db.update(usersTable).set({ role: "host" }).where(eq(usersTable.id, profile.userId));
    }

    notify({
      userId: profile.userId,
      type: `host.${status}`,
      title: status === "verified" ? "Host application approved!" : "Host application rejected",
      message:
        reason ??
        (status === "verified"
          ? "You are now a verified host on MARSA."
          : "Your host application was not approved."),
      relatedEntityType: "host_profile",
      relatedEntityId: id,
    });

    res.json(profile);
  },
);

// ── Yachts ────────────────────────────────────────────────────────────────────
router.get("/admin/yachts", async (_req: Request, res: Response): Promise<void> => {
  const yachts = await db
    .select()
    .from(yachtsTable)
    .orderBy(desc(yachtsTable.createdAt))
    .limit(200);
  res.json({ yachts, total: yachts.length, page: 1, limit: 200 });
});

router.post(
  "/admin/yachts/:id/approve",
  auditLog({
    action: "admin.approve_yacht",
    entityType: "yacht",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [yacht] = await db
      .update(yachtsTable)
      .set({ status: "live" })
      .where(eq(yachtsTable.id, id))
      .returning();
    if (!yacht) { res.status(404).json({ error: "Yacht not found" }); return; }

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.id, yacht.hostId))
      .limit(1);
    if (profile) {
      notify({
        userId: profile.userId,
        type: "yacht.approved",
        title: "Yacht listing approved!",
        message: `Your yacht "${yacht.title}" is now live on MARSA.`,
        relatedEntityType: "yacht",
        relatedEntityId: id,
      });
    }
    res.json(yacht);
  },
);

const rejectionBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

router.post(
  "/admin/yachts/:id/reject",
  validateBody(rejectionBodySchema),
  auditLog({
    action: "admin.reject_yacht",
    entityType: "yacht",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [yacht] = await db
      .update(yachtsTable)
      .set({ status: "rejected" })
      .where(eq(yachtsTable.id, id))
      .returning();
    if (!yacht) { res.status(404).json({ error: "Yacht not found" }); return; }

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.id, yacht.hostId))
      .limit(1);
    if (profile) {
      notify({
        userId: profile.userId,
        type: "yacht.rejected",
        title: "Yacht listing rejected",
        message:
          (req.body as any).reason ??
          `Your yacht "${yacht.title}" was not approved. Please make changes and resubmit.`,
        relatedEntityType: "yacht",
        relatedEntityId: id,
      });
    }
    res.json(yacht);
  },
);

// ── Bookings ──────────────────────────────────────────────────────────────────
const adminListBookingsQuery = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
});

router.get(
  "/admin/bookings",
  validateQuery(adminListBookingsQuery),
  async (req: Request, res: Response): Promise<void> => {
    const { status, page } = req.query as unknown as z.infer<typeof adminListBookingsQuery>;
    const limit = 50;
    const offset = (page - 1) * limit;
    const where = status ? eq(bookingsTable.status, status as any) : sql`true`;

    const [rawBookings, [countRow]] = await Promise.all([
      db
        .select()
        .from(bookingsTable)
        .leftJoin(yachtsTable, eq(bookingsTable.yachtId, yachtsTable.id))
        .where(where)
        .orderBy(desc(bookingsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(bookingsTable).where(where),
    ]);
    const bookings = rawBookings.map(r => ({ ...r.bookings, yachtName: r.yachts?.title ?? null }));
    res.json({ bookings, total: countRow?.count ?? 0, page });
  },
);

// ── Process Cancellation Request ──────────────────────────────────────────────
const processCancellationSchema = z.object({
  action: z.enum(["approve", "reject"]),
  notes: z.string().max(500).optional(),
});

router.post(
  "/admin/bookings/:id/process-cancellation",
  validateBody(processCancellationSchema),
  auditLog({
    action: "admin.process_cancellation",
    entityType: "booking",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const { action, notes } = req.body as z.infer<typeof processCancellationSchema>;

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, "cancel_requested")))
      .limit(1);

    if (!booking) { res.status(404).json({ error: "Booking not in cancel_requested state" }); return; }

    const hoursOld = (Date.now() - new Date(String(booking.createdAt)).getTime()) / 3600000;
    const feePct = hoursOld < 24 ? 0.05 : 0;
    const cancellationFeeEgp = (parseFloat(String(booking.totalAmountEgp ?? "0")) * feePct).toFixed(2);

    const newStatus = action === "approve" ? "cancelled" : "confirmed";
    const [updated] = await db
      .update(bookingsTable)
      .set({ status: newStatus })
      .where(eq(bookingsTable.id, id))
      .returning();

    notify({
      userId: booking.guestId,
      type: `booking.cancellation_${action === "approve" ? "approved" : "rejected"}`,
      title: action === "approve" ? "Cancellation approved" : "Cancellation request rejected",
      message: action === "approve"
        ? `Your booking has been cancelled.${feePct > 0 ? ` A ${feePct * 100}% cancellation fee (EGP ${cancellationFeeEgp}) applies.` : ""}`
        : (notes ?? "Your cancellation request was reviewed — the booking remains confirmed."),
      relatedEntityType: "booking",
      relatedEntityId: id,
    });

    res.json({ ...updated, cancellationFeeEgp });
  },
);

// ── Reviews ───────────────────────────────────────────────────────────────────
router.get("/admin/reviews", async (_req: Request, res: Response): Promise<void> => {
  const reviews = await db
    .select()
    .from(reviewsTable)
    .orderBy(desc(reviewsTable.createdAt))
    .limit(200);
  res.json({ reviews, total: reviews.length });
});

const reviewModerationSchema = z.object({
  status: z.enum(["approved", "rejected", "hidden"]),
  reason: z.string().max(500).optional(),
});

router.post(
  "/admin/reviews/:id/moderate",
  validateBody(reviewModerationSchema),
  auditLog({
    action: "admin.moderate_review",
    entityType: "review",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);
    const { status } = req.body as z.infer<typeof reviewModerationSchema>;

    const [review] = await db
      .update(reviewsTable)
      .set({ status, moderatedBy: user.id })
      .where(eq(reviewsTable.id, id))
      .returning();

    if (!review) { res.status(404).json({ error: "Review not found" }); return; }

    if (review.yachtId) {
      const [ratingRow] = await db
        .select({
          avg: sql<string>`ROUND(AVG(rating)::numeric, 2)::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(reviewsTable)
        .where(
          and(eq(reviewsTable.yachtId, review.yachtId), eq(reviewsTable.status, "approved")),
        );

      await db
        .update(yachtsTable)
        .set({
          avgRating: ratingRow?.avg ?? "0",
          reviewCount: ratingRow?.count ?? 0,
        })
        .where(eq(yachtsTable.id, review.yachtId));
    }

    res.json(review);
  },
);

// ── Withdrawals ───────────────────────────────────────────────────────────────
router.get("/admin/withdrawals", async (_req: Request, res: Response): Promise<void> => {
  const withdrawals = await db
    .select()
    .from(withdrawalRequestsTable)
    .orderBy(desc(withdrawalRequestsTable.createdAt))
    .limit(200);

  const hostIds = [...new Set(withdrawals.map(w => w.hostId))];
  const earnings = hostIds.length
    ? await db.select().from(earningsLedgerTable).where(inArray(earningsLedgerTable.hostId, hostIds))
    : [];
  const earningsByHost: Record<string, typeof earnings> = {};
  for (const e of earnings) {
    if (!earningsByHost[e.hostId]) earningsByHost[e.hostId] = [];
    earningsByHost[e.hostId].push(e);
  }
  const enriched = withdrawals.map(w => ({ ...w, earningsBreakdown: earningsByHost[w.hostId] ?? [] }));

  res.json({ withdrawals: enriched, total: enriched.length });
});

const withdrawalProcessSchema = z.object({
  status: z.enum(["paid", "rejected"]),
  payoutReference: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

router.post(
  "/admin/withdrawals/:id/process",
  validateBody(withdrawalProcessSchema),
  auditLog({
    action: "admin.process_withdrawal",
    entityType: "withdrawal_request",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);
    const { status, payoutReference, notes } = req.body as z.infer<
      typeof withdrawalProcessSchema
    >;

    const [withdrawal] = await db
      .update(withdrawalRequestsTable)
      .set({
        status: status === "paid" ? "paid" : "rejected",
        reviewedBy: user.id,
        reviewedAt: new Date(),
        payoutReference: payoutReference ?? null,
        notes: notes ?? null,
      })
      .where(eq(withdrawalRequestsTable.id, id))
      .returning();

    if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }

    if (status === "paid") {
      await db
        .update(earningsLedgerTable)
        .set({ status: "withdrawn" })
        .where(
          and(
            eq(earningsLedgerTable.hostId, withdrawal.hostId),
            eq(earningsLedgerTable.status, "available"),
          ),
        );
    }

    const [hostProfile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.id, withdrawal.hostId))
      .limit(1);

    if (hostProfile) {
      notify({
        userId: hostProfile.userId,
        type: `withdrawal.${status}`,
        title: status === "paid" ? "Withdrawal processed!" : "Withdrawal rejected",
        message:
          status === "paid"
            ? `Your withdrawal of EGP ${withdrawal.amountEgp} has been processed.`
            : (notes ?? "Your withdrawal request was rejected."),
        relatedEntityType: "withdrawal_request",
        relatedEntityId: id,
      });
    }

    res.json(withdrawal);
  },
);

// ── Audit Logs ────────────────────────────────────────────────────────────────
const auditLogsQuery = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
});

router.get(
  "/admin/audit-logs",
  validateQuery(auditLogsQuery),
  async (req: Request, res: Response): Promise<void> => {
    const { entityType, entityId, page } = req.query as unknown as z.infer<typeof auditLogsQuery>;
    const limit = 100;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (entityType) conditions.push(eq(auditLogsTable.entityType, entityType));
    if (entityId) conditions.push(eq(auditLogsTable.entityId, entityId));
    const where = conditions.length > 0 ? and(...conditions) : sql`true`;

    const [logs, [countRow]] = await Promise.all([
      db
        .select()
        .from(auditLogsTable)
        .where(where)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(auditLogsTable).where(where),
    ]);
    res.json({ logs, total: countRow?.count ?? 0 });
  },
);

// ── Categories CRUD ───────────────────────────────────────────────────────────
const categorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  iconUrl: z.string().url().optional(),
  sortOrder: z.number().int().optional().default(0),
});

router.get("/admin/categories", async (_req: Request, res: Response): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.sortOrder));
  res.json({ categories });
});

router.post(
  "/admin/categories",
  validateBody(categorySchema),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as z.infer<typeof categorySchema>;
    const [category] = await db
      .insert(categoriesTable)
      .values({
        id: randomUUID(),
        name: body.name,
        slug: body.slug,
        iconUrl: body.iconUrl ?? null,
        sortOrder: body.sortOrder,
      })
      .returning();
    res.status(201).json(category);
  },
);

router.patch(
  "/admin/categories/:id",
  validateBody(categorySchema.partial()),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [category] = await db
      .update(categoriesTable)
      .set(req.body)
      .where(eq(categoriesTable.id, id))
      .returning();
    if (!category) { res.status(404).json({ error: "Category not found" }); return; }
    res.json(category);
  },
);

router.delete(
  "/admin/categories/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [deleted] = await db
      .delete(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Category not found" }); return; }
    res.json({ deleted: true });
  },
);

// ── Add-ons CRUD ──────────────────────────────────────────────────────────────
const addOnSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priceEgp: z.string().regex(/^\d+(\.\d{1,2})?$/),
  templateId: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

router.get("/admin/add-ons", async (_req: Request, res: Response): Promise<void> => {
  const addOns = await db.select().from(addOnsTable).orderBy(asc(addOnsTable.name));
  res.json({ addOns });
});

router.post(
  "/admin/add-ons",
  validateBody(addOnSchema),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as z.infer<typeof addOnSchema>;
    const [addOn] = await db
      .insert(addOnsTable)
      .values({
        id: randomUUID(),
        name: body.name,
        description: body.description ?? null,
        priceEgp: body.priceEgp,
        templateId: body.templateId ?? null,
        isActive: body.isActive,
      })
      .returning();
    res.status(201).json(addOn);
  },
);

router.patch(
  "/admin/add-ons/:id",
  validateBody(addOnSchema.partial()),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [addOn] = await db
      .update(addOnsTable)
      .set(req.body)
      .where(eq(addOnsTable.id, id))
      .returning();
    if (!addOn) { res.status(404).json({ error: "Add-on not found" }); return; }
    res.json(addOn);
  },
);

router.delete(
  "/admin/add-ons/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [deleted] = await db
      .delete(addOnsTable)
      .where(eq(addOnsTable.id, id))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Add-on not found" }); return; }
    res.json({ deleted: true });
  },
);

// ── Host Document Review Queue ────────────────────────────────────────────────
const documentListQuery = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
});

router.get(
  "/admin/documents",
  validateQuery(documentListQuery),
  async (req: Request, res: Response): Promise<void> => {
    const { status, page } = req.query as unknown as z.infer<typeof documentListQuery>;
    const limit = 50;
    const offset = (page - 1) * limit;
    const where = status ? eq(hostDocumentsTable.status, status) : sql`true`;

    const [documents, [countRow]] = await Promise.all([
      db
        .select()
        .from(hostDocumentsTable)
        .where(where)
        .orderBy(desc(hostDocumentsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(hostDocumentsTable).where(where),
    ]);
    res.json({ documents, total: countRow?.count ?? 0 });
  },
);

const documentReviewSchema = z.object({
  status: z.enum(["approved", "rejected", "pending"]),
  reason: z.string().max(500).optional(),
});

router.post(
  "/admin/documents/:id/review",
  validateBody(documentReviewSchema),
  auditLog({
    action: "admin.review_document",
    entityType: "host_document",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const adminUser = (req as any).localUser;
    const id = String(req.params.id);
    const { status, reason } = req.body as z.infer<typeof documentReviewSchema>;

    const [document] = await db
      .update(hostDocumentsTable)
      .set({ status, reviewedBy: adminUser.id, reviewedAt: new Date() })
      .where(eq(hostDocumentsTable.id, id))
      .returning();

    if (!document) { res.status(404).json({ error: "Document not found" }); return; }

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.id, document.hostId))
      .limit(1);

    if (profile) {
      notify({
        userId: profile.userId,
        type: `document.${status}`,
        title: status === "approved" ? "Document approved" : "Document rejected",
        message:
          reason ??
          (status === "approved"
            ? "Your document has been verified."
            : "Your document was rejected. Please resubmit a clearer copy."),
        relatedEntityType: "host_document",
        relatedEntityId: id,
      });
    }
    res.json(document);
  },
);

// ── Listing Moderation (request-changes / suspend) ────────────────────────────
const requestChangesSchema = z.object({
  feedback: z.string().min(10).max(2000),
});

router.post(
  "/admin/yachts/:id/request-changes",
  validateBody(requestChangesSchema),
  auditLog({
    action: "admin.request_changes",
    entityType: "yacht",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const { feedback } = req.body as z.infer<typeof requestChangesSchema>;

    const [yacht] = await db
      .update(yachtsTable)
      .set({ status: "changes_requested" })
      .where(eq(yachtsTable.id, id))
      .returning();

    if (!yacht) { res.status(404).json({ error: "Yacht not found" }); return; }

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.id, yacht.hostId))
      .limit(1);

    if (profile) {
      notify({
        userId: profile.userId,
        type: "yacht.changes_requested",
        title: "Changes requested for your listing",
        message: feedback,
        relatedEntityType: "yacht",
        relatedEntityId: id,
      });
    }
    res.json(yacht);
  },
);

router.post(
  "/admin/yachts/:id/suspend",
  validateBody(z.object({ reason: z.string().max(500).optional() })),
  auditLog({
    action: "admin.suspend_yacht",
    entityType: "yacht",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);

    const [yacht] = await db
      .update(yachtsTable)
      .set({ status: "suspended" as any })
      .where(eq(yachtsTable.id, id))
      .returning();

    if (!yacht) { res.status(404).json({ error: "Yacht not found" }); return; }

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.id, yacht.hostId))
      .limit(1);

    if (profile) {
      notify({
        userId: profile.userId,
        type: "yacht.suspended",
        title: "Listing suspended",
        message:
          (req.body as any).reason ??
          `Your yacht "${yacht.title}" has been suspended. Please contact support.`,
        relatedEntityType: "yacht",
        relatedEntityId: id,
      });
    }
    res.json(yacht);
  },
);

// ── Photographer Request Queue ─────────────────────────────────────────────────
const photographerListQuery = z.object({
  status: z
    .enum(["pending", "contacted", "scheduled", "completed", "cancelled"])
    .optional(),
  page: z.coerce.number().int().positive().optional().default(1),
});

router.get(
  "/admin/photographer-requests",
  validateQuery(photographerListQuery),
  async (req: Request, res: Response): Promise<void> => {
    const { status, page } = req.query as unknown as z.infer<typeof photographerListQuery>;
    const limit = 50;
    const offset = (page - 1) * limit;
    const where = status ? eq(photographerRequestsTable.status, status) : sql`true`;

    const [requests, [countRow]] = await Promise.all([
      db
        .select()
        .from(photographerRequestsTable)
        .where(where)
        .orderBy(desc(photographerRequestsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(photographerRequestsTable)
        .where(where),
    ]);
    res.json({ requests, total: countRow?.count ?? 0 });
  },
);

const photographerUpdateSchema = z.object({
  status: z.enum(["contacted", "scheduled", "completed", "cancelled"]),
  notes: z.string().max(1000).optional(),
});

router.patch(
  "/admin/photographer-requests/:id",
  validateBody(photographerUpdateSchema),
  auditLog({
    action: "admin.update_photographer_request",
    entityType: "photographer_request",
    getEntityId: (r) => String(r.params.id),
  }),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const { status } = req.body as z.infer<typeof photographerUpdateSchema>;

    const [updated] = await db
      .update(photographerRequestsTable)
      .set({ status })
      .where(eq(photographerRequestsTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Photographer request not found" }); return; }
    res.json(updated);
  },
);

// ── Example Yacht Photos CRUD ─────────────────────────────────────────────────
const examplePhotoSchema = z.object({
  url: z.string().url(),
  caption: z.string().max(500).optional(),
  category: z.string().max(100).optional(),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

router.get("/admin/example-photos", async (_req: Request, res: Response): Promise<void> => {
  const photos = await db
    .select()
    .from(exampleYachtPhotosTable)
    .orderBy(asc(exampleYachtPhotosTable.sortOrder));
  res.json({ photos });
});

router.post(
  "/admin/example-photos",
  validateBody(examplePhotoSchema),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as z.infer<typeof examplePhotoSchema>;
    const [photo] = await db
      .insert(exampleYachtPhotosTable)
      .values({
        id: randomUUID(),
        url: body.url,
        caption: body.caption ?? null,
        category: body.category ?? null,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
      })
      .returning();
    res.status(201).json(photo);
  },
);

router.patch(
  "/admin/example-photos/:id",
  validateBody(examplePhotoSchema.partial()),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [photo] = await db
      .update(exampleYachtPhotosTable)
      .set(req.body)
      .where(eq(exampleYachtPhotosTable.id, id))
      .returning();
    if (!photo) { res.status(404).json({ error: "Photo not found" }); return; }
    res.json(photo);
  },
);

router.delete(
  "/admin/example-photos/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [deleted] = await db
      .delete(exampleYachtPhotosTable)
      .where(eq(exampleYachtPhotosTable.id, id))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Photo not found" }); return; }
    res.json({ deleted: true });
  },
);

// ── Booking Templates CRUD ────────────────────────────────────────────────────
const templateSchema = z.object({
  name: z.string().min(1).max(200),
  durationHours: z.number().int().min(1).max(24),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

router.get("/admin/booking-templates", async (_req: Request, res: Response): Promise<void> => {
  const templates = await db
    .select()
    .from(bookingTemplatesTable)
    .orderBy(asc(bookingTemplatesTable.sortOrder));
  res.json({ templates });
});

router.post(
  "/admin/booking-templates",
  validateBody(templateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as z.infer<typeof templateSchema>;
    const [template] = await db
      .insert(bookingTemplatesTable)
      .values({
        id: randomUUID(),
        name: body.name,
        durationHours: body.durationHours,
        description: body.description ?? null,
        isActive: body.isActive,
        sortOrder: body.sortOrder,
      })
      .returning();
    res.status(201).json(template);
  },
);

router.patch(
  "/admin/booking-templates/:id",
  validateBody(templateSchema.partial()),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [template] = await db
      .update(bookingTemplatesTable)
      .set(req.body)
      .where(eq(bookingTemplatesTable.id, id))
      .returning();
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    res.json(template);
  },
);

router.delete(
  "/admin/booking-templates/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const [deleted] = await db
      .delete(bookingTemplatesTable)
      .where(eq(bookingTemplatesTable.id, id))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Template not found" }); return; }
    res.json({ deleted: true });
  },
);

export default router;
