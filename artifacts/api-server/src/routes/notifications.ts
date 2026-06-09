import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db, notificationsTable } from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { requireAuth, validateQuery } from "../middlewares/index";

const router: IRouter = Router();

const listNotificationsQuery = z.object({
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

// ── GET /notifications ────────────────────────────────────────────────────────
router.get(
  "/notifications",
  requireAuth,
  validateQuery(listNotificationsQuery),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const { unreadOnly } = req.query as unknown as z.infer<typeof listNotificationsQuery>;

    const where = unreadOnly
      ? and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false))
      : eq(notificationsTable.userId, user.id);

    const [notifications, [unreadRow]] = await Promise.all([
      db
        .select()
        .from(notificationsTable)
        .where(where)
        .orderBy(desc(notificationsTable.createdAt))
        .limit(50),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(notificationsTable)
        .where(
          and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false)),
        ),
    ]);

    res.json({ notifications, unreadCount: unreadRow?.count ?? 0 });
  },
);

// ── POST /notifications/:id/read ──────────────────────────────────────────────
// Client generated code and OpenAPI spec both define this as POST.
// PATCH alias retained for backward-compat with consumers built before spec alignment.
router.post(
  "/notifications/:id/read",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [notification] = await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)))
      .returning();

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json(notification);
  },
);

// Backward-compatible alias — some consumers were built expecting PATCH.
router.patch("/notifications/:id/read", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).localUser;
  const id = String(req.params.id);
  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)))
    .returning();
  if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json(notification);
});

// ── PATCH /notifications/read-all ─────────────────────────────────────────────
router.patch(
  "/notifications/read-all",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;

    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false)));

    res.json({ ok: true });
  },
);

export default router;
