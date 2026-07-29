import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  auditLogsTable,
  db,
  notificationCampaignsTable,
  notificationDeliveriesTable,
  notificationsTable,
  userPushTokensTable,
  usersTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requireRole, validateBody } from "../middlewares";

const router: IRouter = Router();
const campaignInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  audience: z.literal("all").optional().default("all"),
});

router.use("/admin/notification-campaigns", requireAuth, requireRole("admin"));

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

router.get(
  "/admin/notification-campaigns",
  async (_req: Request, res: Response): Promise<void> => {
    const campaigns = await db
      .select()
      .from(notificationCampaignsTable)
      .orderBy(desc(notificationCampaignsTable.createdAt));
    res.json({ campaigns });
  },
);

router.get(
  "/admin/notification-campaigns/:id",
  async (req: Request, res: Response): Promise<void> => {
    const [campaign] = await db
      .select()
      .from(notificationCampaignsTable)
      .where(eq(notificationCampaignsTable.id, String(req.params.id)))
      .limit(1);
    if (!campaign) {
      res.status(404).json({ error: "Notification campaign not found" });
      return;
    }
    res.json(campaign);
  },
);

router.post(
  "/admin/notification-campaigns",
  validateBody(campaignInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const input = req.body as z.infer<typeof campaignInputSchema>;
    const campaignId = randomUUID();
    const [users, pushTokens] = await Promise.all([
      db.select({ id: usersTable.id }).from(usersTable),
      db
        .select({
          id: userPushTokensTable.id,
          userId: userPushTokensTable.userId,
        })
        .from(userPushTokensTable)
        .where(eq(userPushTokensTable.isActive, true)),
    ]);
    const now = new Date();
    const [campaign] = await db
      .insert(notificationCampaignsTable)
      .values({
        id: campaignId,
        title: input.title,
        message: input.message,
        audience: input.audience,
        status: "sending",
        createdBy: user.id,
        totalRecipients: users.length,
        startedAt: now,
      })
      .returning();

    try {
      for (const userBatch of chunks(users, 500)) {
        const notificationRows = userBatch.map((recipient) => ({
          id: randomUUID(),
          userId: recipient.id,
          type: "broadcast",
          title: input.title,
          message: input.message,
          relatedEntityType: "notification_campaign",
          relatedEntityId: campaignId,
        }));
        await db.transaction(async (tx) => {
          if (notificationRows.length) {
            await tx.insert(notificationsTable).values(notificationRows);
            await tx.insert(notificationDeliveriesTable).values(
              notificationRows.map((notification) => ({
                id: randomUUID(),
                campaignId,
                userId: notification.userId,
                channel: "in_app",
                notificationId: notification.id,
                status: "sent",
                attemptCount: 1,
                sentAt: now,
              })),
            );
          }
        });
      }
      for (const tokenBatch of chunks(pushTokens, 500)) {
        if (!tokenBatch.length) continue;
        await db.insert(notificationDeliveriesTable).values(
          tokenBatch.map((token) => ({
            id: randomUUID(),
            campaignId,
            userId: token.userId,
            channel: "push",
            pushTokenId: token.id,
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: now,
          })),
        );
      }
      const completedAt = pushTokens.length === 0 ? new Date() : null;
      const [ready] = await db
        .update(notificationCampaignsTable)
        .set({
          status: pushTokens.length ? "sending" : "completed",
          inAppSentCount: users.length,
          completedAt,
        })
        .where(eq(notificationCampaignsTable.id, campaignId))
        .returning();
      await db.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        action: "notification_campaign.created",
        entityType: "notification_campaign",
        entityId: campaignId,
        newValue: {
          audience: input.audience,
          totalRecipients: users.length,
          pushDeliveries: pushTokens.length,
        },
        ipAddress: req.ip,
      });
      res.status(201).json(ready);
    } catch (error) {
      await db
        .update(notificationCampaignsTable)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(notificationCampaignsTable.id, campaignId));
      req.log.error({ err: error, campaignId }, "Failed to queue notification campaign");
      res.status(500).json({
        error: "Campaign was created but could not be fully queued",
        campaign,
      });
    }
  },
);

export default router;
