import Stripe from "stripe";
import { logger } from "./logger";

let _cachedClient: Stripe | null = null;
let _cachedPublishable: string | null = null;

interface StripeCredentials {
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
}

async function fetchStripeCredentialsFromConnector(): Promise<StripeCredentials | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const replIdentity = process.env.REPL_IDENTITY;
  const deplRenewal = process.env.WEB_REPL_RENEWAL;

  const xReplitToken = replIdentity
    ? `repl ${replIdentity}`
    : deplRenewal
      ? `depl ${deplRenewal}`
      : null;

  if (!hostname || !xReplitToken) return null;

  try {
    const resp = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
      {
        headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!resp.ok) {
      logger.warn({ status: resp.status }, "stripe connector: credential fetch failed");
      return null;
    }

    const data = await resp.json() as { items?: { settings?: Record<string, string> }[] };
    const settings = data.items?.[0]?.settings;
    if (!settings?.secret) return null;

    return {
      secretKey: settings.secret,
      publishableKey: settings.publishable ?? undefined,
      webhookSecret: settings.webhook_secret ?? undefined,
    };
  } catch (err) {
    logger.warn({ err }, "stripe connector: fetch error");
    return null;
  }
}

/**
 * Returns an authenticated Stripe client.
 * Prefers Replit connector credentials, falls back to env vars.
 * Cached for the process lifetime (keys are stable within a deployment).
 */
export async function getStripeClient(): Promise<Stripe> {
  if (_cachedClient) return _cachedClient;

  const fromConnector = await fetchStripeCredentialsFromConnector();
  const secretKey =
    fromConnector?.secretKey ?? process.env.STRIPE_SECRET_KEY ?? "sk_missing";

  if (secretKey === "sk_missing") {
    logger.warn("STRIPE_SECRET_KEY not available — payment features will fail");
  }

  _cachedClient = new Stripe(secretKey, { apiVersion: "2026-05-27.dahlia" });

  if (fromConnector?.publishableKey) {
    _cachedPublishable = fromConnector.publishableKey;
  }

  return _cachedClient;
}

/**
 * Returns the Stripe publishable key (for passing to clients).
 */
export async function getStripePublishableKey(): Promise<string> {
  if (_cachedPublishable) return _cachedPublishable;
  await getStripeClient();
  return _cachedPublishable ?? process.env.STRIPE_PUBLISHABLE_KEY ?? "";
}

/**
 * Returns the Stripe webhook secret.
 * Prefers connector, falls back to env var.
 */
export async function getStripeWebhookSecret(): Promise<string | undefined> {
  const fromConnector = await fetchStripeCredentialsFromConnector();
  return fromConnector?.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
}

// Synchronous client for backwards compatibility — initialised lazily.
// Use getStripeClient() in new code for the full async flow.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    throw new Error(
      `stripe.${String(prop)} was called synchronously — use getStripeClient() instead`,
    );
  },
});
