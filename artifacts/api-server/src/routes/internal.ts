import { Router, type IRouter, type Request, type Response } from "express";
import { db, earningsLedgerTable, hostProfilesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { getEgpUsdRate } from "../lib/exchange";
import { notify } from "../lib/notify";

const router: IRouter = Router();

const INTERNAL_TOKEN = process.env.INTERNAL_SECRET_TOKEN;

function requireInternalToken(req: Request, res: Response, next: () => void): void {
  if (!INTERNAL_TOKEN) {
    next();
    return;
  }
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.query.token as string;
  if (token !== INTERNAL_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
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
      res.status(500).json({ error: "Failed to fetch exchange rate", detail: err?.message });
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
        entries: updated.map((e) => ({ id: e.id, hostId: e.hostId, amountEgp: e.amountEgp })),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to process earnings", detail: err?.message });
    }
  },
);

export default router;
