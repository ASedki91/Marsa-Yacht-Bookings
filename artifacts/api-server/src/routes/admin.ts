import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  usersTable,
  hostProfilesTable,
  yachtsTable,
  bookingsTable,
  reviewsTable,
  withdrawalRequestsTable,
  earningsLedgerTable,
  auditLogsTable,
} from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, requireRole, validateBody, validateQuery, auditLog } from "../middlewares/index";
import { notify } from "../lib/notify";

const router: IRouter = Router();

router.use(requireAuth, requireRole("admin"));

// ── Stats ───────────────────────────────────────────────────────────────────
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

// ── Users ───────────────────────────────────────────────────────────────────
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

// ── Hosts ───────────────────────────────────────────────────────────────────
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

// ── Yachts ──────────────────────────────────────────────────────────────────
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

// ── Bookings ────────────────────────────────────────────────────────────────
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

    const [bookings, [countRow]] = await Promise.all([
      db
        .select()
        .from(bookingsTable)
        .where(where)
        .orderBy(desc(bookingsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(bookingsTable).where(where),
    ]);
    res.json({ bookings, total: countRow?.count ?? 0, page });
  },
);

// ── Reviews ─────────────────────────────────────────────────────────────────
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

    // Recalculate yacht avg_rating when a review changes moderation state
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

// ── Withdrawals ─────────────────────────────────────────────────────────────
router.get("/admin/withdrawals", async (_req: Request, res: Response): Promise<void> => {
  const withdrawals = await db
    .select()
    .from(withdrawalRequestsTable)
    .orderBy(desc(withdrawalRequestsTable.createdAt))
    .limit(200);
  res.json({ withdrawals, total: withdrawals.length });
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
    const { status, payoutReference, notes } = req.body as z.infer<typeof withdrawalProcessSchema>;

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

    // Resolve userId from hostId for notification
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

// ── Audit Logs ──────────────────────────────────────────────────────────────
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

export default router;
