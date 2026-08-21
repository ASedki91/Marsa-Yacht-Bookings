import { Router, type IRouter, type Request, type Response } from "express";
import {
  availabilitySlotsTable,
  bookingsTable,
  db,
  earningsLedgerTable,
  hostProfilesTable,
  notificationCampaignsTable,
  notificationDeliveriesTable,
  paymentsTable,
  userPushTokensTable,
} from "@workspace/db";
import {
  and,
  eq,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { getEgpUsdRate } from "../lib/exchange";
import { notify } from "../lib/notify";

const router: IRouter = Router();

const INTERNAL_TOKEN = process.env.INTERNAL_SECRET_TOKEN;

function requireInternalToken(
  req: Request,
  res: Response,
  next: () => void,
): void {
  if (!INTERNAL_TOKEN) {
    // Fail-closed: if no secret is configured, mutation endpoints are unavailable.
    // Only allow through on explicitly read-only paths (exchange-rate GET).
    if (req.method === "GET" && req.path === "/internal/exchange-rate") {
      next();
      return;
    }
    res.status(503).json({
      error:
        "Internal endpoint unavailable: INTERNAL_SECRET_TOKEN is not configured",
    });
    return;
  }
  const auth = req.headers["authorization"] ?? "";
  // Internal credentials must stay in the Authorization header. Never accept
  // them from the URL, where proxies, schedulers, browsers, and referrers may
  // retain the full request target.
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
  if (token !== INTERNAL_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

async function refreshCampaignStatus(campaignId: string): Promise<void> {
  const rows = await db
    .select({
      status: notificationDeliveriesTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(notificationDeliveriesTable)
    .where(
      and(
        eq(notificationDeliveriesTable.campaignId, campaignId),
        eq(notificationDeliveriesTable.channel, "push"),
      ),
    )
    .groupBy(notificationDeliveriesTable.status);
  const counts = new Map(rows.map((row) => [row.status, row.count]));
  const sent = counts.get("sent") ?? 0;
  const failed = (counts.get("failed") ?? 0) + (counts.get("skipped") ?? 0);
  const pending = counts.get("pending") ?? 0;
  const finished = pending === 0;
  const status = !finished
    ? "sending"
    : failed === 0
      ? "completed"
      : sent > 0
        ? "partial_failed"
        : "failed";
  await db
    .update(notificationCampaignsTable)
    .set({
      status,
      pushSentCount: sent,
      pushFailedCount: failed,
      completedAt: finished ? new Date() : null,
    })
    .where(eq(notificationCampaignsTable.id, campaignId));
}

// ── GET /internal/exchange-rate ───────────────────────────────────────────────
router.get(
  "/internal/exchange-rate",
  requireInternalToken,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const { rate, fetchedAt } = await getEgpUsdRate();
      const ageMs = Date.now() - new Date(fetchedAt).getTime();
      res.json({
        currencyPair: "USDEGP",
        rate,
        fetchedAt,
        ageMinutes: Math.round(ageMs / 60000),
        stale: ageMs > 60 * 60 * 1000,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "Failed to fetch exchange rate", detail: err?.message });
    }
  },
);

// ── POST /internal/process-eligible-earnings ─────────────────────────────────
// Cron endpoint: flip pending earnings whose eligible_at has passed to available
// and notify hosts. Call this once per hour via a scheduled job.
router.post(
  "/internal/process-eligible-earnings",
  requireInternalToken,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const updated = await db
        .update(earningsLedgerTable)
        .set({ status: "available" })
        .where(
          and(
            eq(earningsLedgerTable.status, "pending"),
            sql`${earningsLedgerTable.eligibleAt} IS NOT NULL`,
            sql`${earningsLedgerTable.eligibleAt} <= NOW()`,
          ),
        )
        .returning();

      if (updated.length === 0) {
        res.json({ processed: 0, message: "No earnings ready to release" });
        return;
      }

      // Group by host and notify each once
      const byHost: Record<string, typeof updated> = {};
      for (const entry of updated) {
        if (!byHost[entry.hostId]) byHost[entry.hostId] = [];
        byHost[entry.hostId].push(entry);
      }

      const hostIds = Object.keys(byHost);
      const profiles = hostIds.length
        ? await db
            .select()
            .from(hostProfilesTable)
            .where(sql`${hostProfilesTable.id} = ANY(${hostIds})`)
        : [];

      for (const profile of profiles) {
        const entries = byHost[profile.id] ?? [];
        const totalEgp = entries
          .reduce((sum, e) => sum + parseFloat(e.amountEgp), 0)
          .toFixed(2);

        try {
          notify({
            userId: profile.userId,
            type: "earnings.available",
            title: "Earnings Available!",
            message: `EGP ${totalEgp} from ${entries.length} booking(s) is now available for withdrawal.`,
            relatedEntityType: "earnings_ledger",
            relatedEntityId: entries[0]?.id ?? "",
          });
        } catch (_notifyErr) {
          // notification failure should not abort the earnings release
        }
      }

      res.json({
        processed: updated.length,
        hostsNotified: profiles.length,
        entries: updated.map((e) => ({
          id: e.id,
          hostId: e.hostId,
          amountEgp: e.amountEgp,
        })),
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "Failed to process earnings", detail: err?.message });
    }
  },
);

router.post(
  "/internal/process-notification-deliveries",
  requireInternalToken,
  async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 5 * 60_000);
    const claimed = await db.transaction(async (tx) => {
      const candidates = await tx
        .select({ id: notificationDeliveriesTable.id })
        .from(notificationDeliveriesTable)
        .where(
          and(
            eq(notificationDeliveriesTable.channel, "push"),
            eq(notificationDeliveriesTable.status, "pending"),
            or(
              isNull(notificationDeliveriesTable.nextAttemptAt),
              lte(notificationDeliveriesTable.nextAttemptAt, now),
            ),
          ),
        )
        .orderBy(notificationDeliveriesTable.createdAt)
        .limit(100)
        .for("update", { skipLocked: true });
      if (!candidates.length) return [];

      return tx
        .update(notificationDeliveriesTable)
        .set({
          attemptCount: sql`${notificationDeliveriesTable.attemptCount} + 1`,
          nextAttemptAt: leaseUntil,
        })
        .where(
          inArray(
            notificationDeliveriesTable.id,
            candidates.map((item) => item.id),
          ),
        )
        .returning({ id: notificationDeliveriesTable.id });
    });
    if (!claimed.length) {
      res.json({ processed: 0, sent: 0, failed: 0, skipped: 0 });
      return;
    }

    const deliveries = await db
      .select({
        id: notificationDeliveriesTable.id,
        campaignId: notificationDeliveriesTable.campaignId,
        pushTokenId: notificationDeliveriesTable.pushTokenId,
        attemptCount: notificationDeliveriesTable.attemptCount,
        expoPushToken: userPushTokensTable.expoPushToken,
        tokenActive: userPushTokensTable.isActive,
        title: notificationCampaignsTable.title,
        message: notificationCampaignsTable.message,
      })
      .from(notificationDeliveriesTable)
      .leftJoin(
        userPushTokensTable,
        eq(notificationDeliveriesTable.pushTokenId, userPushTokensTable.id),
      )
      .innerJoin(
        notificationCampaignsTable,
        eq(
          notificationDeliveriesTable.campaignId,
          notificationCampaignsTable.id,
        ),
      )
      .where(
        inArray(
          notificationDeliveriesTable.id,
          claimed.map((item) => item.id),
        ),
      )
      .limit(100);

    const skipped = deliveries.filter(
      (delivery) => !delivery.expoPushToken || !delivery.tokenActive,
    );
    for (const delivery of skipped) {
      await db
        .update(notificationDeliveriesTable)
        .set({
          status: "skipped",
          lastError: "Push token is missing or inactive",
          nextAttemptAt: null,
        })
        .where(eq(notificationDeliveriesTable.id, delivery.id));
    }
    const sendable = deliveries.filter(
      (delivery) => delivery.expoPushToken && delivery.tokenActive,
    );
    let sent = 0;
    let failed = 0;
    if (sendable.length) {
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            sendable.map((delivery) => ({
              to: delivery.expoPushToken,
              sound: "default",
              title: delivery.title,
              body: delivery.message,
              data: {
                campaignId: delivery.campaignId,
                relatedEntityType: "notification_campaign",
                relatedEntityId: delivery.campaignId,
              },
            })),
          ),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok)
          throw new Error(`Expo push API returned ${response.status}`);
        const payload = (await response.json()) as {
          data?: Array<{
            status: "ok" | "error";
            id?: string;
            message?: string;
            details?: { error?: string };
          }>;
        };
        const tickets = payload.data ?? [];
        for (let index = 0; index < sendable.length; index += 1) {
          const delivery = sendable[index];
          const ticket = tickets[index];
          if (ticket?.status === "ok" && ticket.id) {
            sent += 1;
            await db
              .update(notificationDeliveriesTable)
              .set({
                status: "sent",
                providerReference: ticket.id,
                lastError: null,
                nextAttemptAt: null,
                sentAt: new Date(),
              })
              .where(eq(notificationDeliveriesTable.id, delivery.id));
            continue;
          }
          const finalAttempt = delivery.attemptCount >= 3;
          if (finalAttempt) failed += 1;
          await db
            .update(notificationDeliveriesTable)
            .set({
              status: finalAttempt ? "failed" : "pending",
              lastError: ticket?.message ?? "Expo did not return a push ticket",
              nextAttemptAt: finalAttempt
                ? null
                : new Date(Date.now() + delivery.attemptCount * 5 * 60_000),
            })
            .where(eq(notificationDeliveriesTable.id, delivery.id));
          if (
            ticket?.details?.error === "DeviceNotRegistered" &&
            delivery.pushTokenId
          ) {
            await db
              .update(userPushTokensTable)
              .set({ isActive: false, deactivatedAt: new Date() })
              .where(eq(userPushTokensTable.id, delivery.pushTokenId));
          }
        }
      } catch (error) {
        req.log.error({ err: error }, "Expo push batch failed");
        for (const delivery of sendable) {
          const finalAttempt = delivery.attemptCount >= 3;
          if (finalAttempt) failed += 1;
          await db
            .update(notificationDeliveriesTable)
            .set({
              status: finalAttempt ? "failed" : "pending",
              lastError:
                error instanceof Error
                  ? error.message
                  : "Expo push batch failed",
              nextAttemptAt: finalAttempt
                ? null
                : new Date(Date.now() + 5 * 60_000),
            })
            .where(eq(notificationDeliveriesTable.id, delivery.id));
        }
      }
    }
    const campaignIds = [
      ...new Set(deliveries.map((delivery) => delivery.campaignId)),
    ];
    for (const campaignId of campaignIds)
      await refreshCampaignStatus(campaignId);
    res.json({
      processed: deliveries.length,
      sent,
      failed,
      skipped: skipped.length,
    });
  },
);

router.post(
  "/internal/check-push-receipts",
  requireInternalToken,
  async (req: Request, res: Response): Promise<void> => {
    const deliveries = await db
      .select({
        id: notificationDeliveriesTable.id,
        campaignId: notificationDeliveriesTable.campaignId,
        pushTokenId: notificationDeliveriesTable.pushTokenId,
        receiptId: notificationDeliveriesTable.providerReference,
      })
      .from(notificationDeliveriesTable)
      .where(
        and(
          eq(notificationDeliveriesTable.channel, "push"),
          eq(notificationDeliveriesTable.status, "sent"),
          isNull(notificationDeliveriesTable.lastError),
          sql`${notificationDeliveriesTable.providerReference} is not null`,
        ),
      )
      .limit(100);
    if (!deliveries.length) {
      res.json({ checked: 0, failed: 0 });
      return;
    }
    const response = await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: deliveries.map((delivery) => delivery.receiptId),
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      res
        .status(502)
        .json({ error: `Expo receipt API returned ${response.status}` });
      return;
    }
    const payload = (await response.json()) as {
      data?: Record<
        string,
        {
          status: "ok" | "error";
          message?: string;
          details?: { error?: string };
        }
      >;
    };
    let failed = 0;
    for (const delivery of deliveries) {
      const receipt = delivery.receiptId
        ? payload.data?.[delivery.receiptId]
        : undefined;
      if (receipt?.status === "error") {
        failed += 1;
        await db
          .update(notificationDeliveriesTable)
          .set({
            status: "failed",
            lastError: receipt.message ?? "Push delivery failed",
          })
          .where(eq(notificationDeliveriesTable.id, delivery.id));
        if (
          receipt.details?.error === "DeviceNotRegistered" &&
          delivery.pushTokenId
        ) {
          await db
            .update(userPushTokensTable)
            .set({ isActive: false, deactivatedAt: new Date() })
            .where(eq(userPushTokensTable.id, delivery.pushTokenId));
        }
      } else {
        await db
          .update(notificationDeliveriesTable)
          .set({ lastError: "receipt_confirmed" })
          .where(eq(notificationDeliveriesTable.id, delivery.id));
      }
    }
    const campaignIds = [
      ...new Set(deliveries.map((delivery) => delivery.campaignId)),
    ];
    for (const campaignId of campaignIds)
      await refreshCampaignStatus(campaignId);
    res.json({ checked: deliveries.length, failed });
  },
);

router.post(
  "/internal/release-expired-payment-holds",
  requireInternalToken,
  async (_req: Request, res: Response): Promise<void> => {
    const expired = await db
      .select({
        slotId: availabilitySlotsTable.id,
        bookingId: bookingsTable.id,
      })
      .from(availabilitySlotsTable)
      .innerJoin(
        bookingsTable,
        eq(bookingsTable.slotId, availabilitySlotsTable.id),
      )
      .where(
        and(
          eq(bookingsTable.status, "pending_payment"),
          sql`${availabilitySlotsTable.holdExpiresAt} is not null`,
          lte(availabilitySlotsTable.holdExpiresAt, new Date()),
        ),
      );
    let released = 0;
    for (const item of expired) {
      const [succeeded] = await db
        .select({ id: paymentsTable.id })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.bookingId, item.bookingId),
            eq(paymentsTable.status, "succeeded"),
          ),
        )
        .limit(1);
      if (succeeded) continue;
      await db.transaction(async (tx) => {
        const [slot] = await tx
          .update(availabilitySlotsTable)
          .set({ isAvailable: true, holdExpiresAt: null })
          .where(
            and(
              eq(availabilitySlotsTable.id, item.slotId),
              lte(availabilitySlotsTable.holdExpiresAt, new Date()),
            ),
          )
          .returning({ id: availabilitySlotsTable.id });
        if (!slot) return;
        await tx
          .update(bookingsTable)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(bookingsTable.id, item.bookingId),
              eq(bookingsTable.status, "pending_payment"),
            ),
          );
        await tx
          .update(paymentsTable)
          .set({ status: "failed" })
          .where(
            and(
              eq(paymentsTable.bookingId, item.bookingId),
              notInArray(paymentsTable.status, ["succeeded", "refunded"]),
            ),
          );
        released += 1;
      });
    }
    res.json({ examined: expired.length, released });
  },
);

export default router;
