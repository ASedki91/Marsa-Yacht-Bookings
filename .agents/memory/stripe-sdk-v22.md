---
name: Stripe SDK v22 patterns
description: Correct API version, missing-key handling, and webhook raw-body setup for Stripe SDK v22.
---

## API version

`2026-05-27.dahlia` — confirmed from `node_modules/stripe/cjs/apiVersion.js`.

## Missing key handling

Warn (don't crash) when `STRIPE_SECRET_KEY` is absent — use `"sk_missing"` as fallback so the module loads but payment calls fail gracefully:

```ts
if (!process.env.STRIPE_SECRET_KEY) {
  logger.warn("STRIPE_SECRET_KEY is not set — payment features will fail");
}
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_missing", {
  apiVersion: "2026-05-27.dahlia",
});
```

**Why:** Crashing on missing key kills the whole server, blocking non-payment routes during development.

## Webhook raw body capture

Stripe signature verification requires the raw request body (before JSON parsing). Capture it in the `express.json()` verify callback:

```ts
app.use(express.json({
  verify: (req: any, _res, buf) => {
    if (req.originalUrl?.includes("/webhooks/stripe")) {
      req.rawBody = buf.toString("utf8");
    }
  },
}));
```

Then in the webhook handler: `const rawBody = (req as any).rawBody as string | undefined`.

**How to apply:** `app.ts` must mount this before any body-parser alternatives; the webhook route reads `req.rawBody`.
