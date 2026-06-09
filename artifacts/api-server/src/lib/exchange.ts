import { db, exchangeRatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "./logger";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PAIR = "USDEGP";

// In-memory fallback rate (updated whenever we fetch successfully)
let cachedRate: { rate: number; fetchedAt: Date } | null = null;

/**
 * Returns the USD→EGP exchange rate.
 * Tries DB cache first (1-hour TTL), then free public API, then falls back to last known.
 */
export async function getEgpUsdRate(): Promise<{ rate: number; fetchedAt: Date }> {
  // Try DB cache
  try {
    const [row] = await db
      .select()
      .from(exchangeRatesTable)
      .where(eq(exchangeRatesTable.currencyPair, PAIR))
      .limit(1);

    if (row) {
      const age = Date.now() - new Date(row.fetchedAt).getTime();
      if (age < CACHE_TTL_MS) {
        cachedRate = { rate: parseFloat(row.rate), fetchedAt: new Date(row.fetchedAt) };
        return cachedRate;
      }
    }
  } catch (err) {
    logger.warn({ err }, "exchange: DB lookup failed, trying API");
  }

  // Fetch from public API (no key required)
  try {
    const resp = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=EGP",
      { signal: AbortSignal.timeout(5000) },
    );
    if (resp.ok) {
      const data = (await resp.json()) as { rates?: { EGP?: number }; date?: string };
      const rate = data.rates?.EGP;
      if (typeof rate === "number" && rate > 0) {
        cachedRate = { rate, fetchedAt: new Date() };

        // Upsert into DB
        await db
          .insert(exchangeRatesTable)
          .values({ id: randomUUID(), currencyPair: PAIR, rate: String(rate) })
          .onConflictDoUpdate({
            target: exchangeRatesTable.currencyPair,
            set: { rate: String(rate), fetchedAt: new Date() },
          })
          .catch((err) => logger.warn({ err }, "exchange: failed to persist rate"));

        return cachedRate;
      }
    }
  } catch (err) {
    logger.warn({ err }, "exchange: API fetch failed");
  }

  // Fall back to in-memory cached value or a hard-coded safe default
  if (cachedRate) return cachedRate;
  const fallback = { rate: 51, fetchedAt: new Date() };
  logger.warn({ fallback }, "exchange: using hard-coded fallback rate");
  return fallback;
}

/**
 * Convert EGP amount to USD for Stripe (returns cents).
 */
export async function egpToUsdCents(egpAmount: number): Promise<number> {
  const { rate } = await getEgpUsdRate();
  const usd = egpAmount / rate;
  return Math.round(usd * 100); // Stripe expects integer cents
}
