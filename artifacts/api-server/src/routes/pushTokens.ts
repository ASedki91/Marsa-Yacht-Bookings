import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db, userPushTokensTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, validateBody } from "../middlewares";

const router: IRouter = Router();
const pushTokenInput = z.object({
  expoPushToken: z.string().min(1).max(500),
  deviceId: z.string().min(1).max(200).optional(),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().max(50).optional(),
});

router.post(
  "/push-tokens",
  requireAuth,
  validateBody(pushTokenInput),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const input = req.body as z.infer<typeof pushTokenInput>;
    const now = new Date();

    const [tokenOwner] = await db
      .select({
        id: userPushTokensTable.id,
        userId: userPushTokensTable.userId,
      })
      .from(userPushTokensTable)
      .where(eq(userPushTokensTable.expoPushToken, input.expoPushToken))
      .limit(1);

    if (tokenOwner && tokenOwner.userId !== user.id) {
      res.status(409).json({
        error: "This push token is already registered to another account",
      });
      return;
    }

    const [deviceToken] = input.deviceId
      ? await db
          .select({ id: userPushTokensTable.id })
          .from(userPushTokensTable)
          .where(
            and(
              eq(userPushTokensTable.userId, user.id),
              eq(userPushTokensTable.deviceId, input.deviceId),
            ),
          )
          .limit(1)
      : [];

    if (deviceToken) {
      const [token] = await db
        .update(userPushTokensTable)
        .set({
          expoPushToken: input.expoPushToken,
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          isActive: true,
          deactivatedAt: null,
          lastRegisteredAt: now,
          updatedAt: now,
        })
        .where(eq(userPushTokensTable.id, deviceToken.id))
        .returning();
      res.json(token);
      return;
    }

    const [token] = await db
      .insert(userPushTokensTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        ...input,
        isActive: true,
        lastRegisteredAt: now,
      })
      .onConflictDoUpdate({
        target: userPushTokensTable.expoPushToken,
        set: {
          deviceId: input.deviceId ?? null,
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          isActive: true,
          deactivatedAt: null,
          lastRegisteredAt: now,
          updatedAt: now,
        },
      })
      .returning();
    res.json(token);
  },
);

router.delete(
  "/push-tokens/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [token] = await db
      .update(userPushTokensTable)
      .set({ isActive: false, deactivatedAt: new Date() })
      .where(
        and(
          eq(userPushTokensTable.id, String(req.params.id)),
          eq(userPushTokensTable.userId, user.id),
        ),
      )
      .returning();
    if (!token) {
      res.status(404).json({ error: "Push token not found" });
      return;
    }
    res.json(token);
  },
);

export default router;
