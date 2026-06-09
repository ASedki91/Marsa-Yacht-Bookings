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

export default router;
