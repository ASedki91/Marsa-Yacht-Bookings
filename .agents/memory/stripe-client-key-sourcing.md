---
name: Stripe client publishable key sourcing
description: Where the mobile/client Stripe publishable key must come from in MARSA, and why build-time env fails.
---

# Stripe client publishable key sourcing

Client apps (the Expo mobile app) must fetch the Stripe **publishable** key from the API at runtime
(`GET /api/payments/config` → `{ publishableKey }`), not from a build-time `EXPO_PUBLIC_*` env var.

**Why:** The real Stripe `pk_test_…`/`sk_test_…` keys live only in the Replit **Stripe connector**
(server-side, fetched in `api-server/src/lib/stripe.ts` via the connectors credential proxy). The mobile
workflow command defaults `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` to `pk_test_placeholder` when the
`STRIPE_PUBLISHABLE_KEY` secret is unset — which it is — so any code reading that env hits
"Invalid API Key provided: pk_test_…lder" at payment time. `STRIPE_PUBLISHABLE_KEY`/`STRIPE_SECRET_KEY`
are NOT set as secrets; the connector is the source of truth.

**How to apply:** Server exposes the publishable key via `getStripePublishableKey()` (connector-backed,
falls back to env). The publishable key is public, so the `/api/payments/config` endpoint is intentionally
unauthenticated. The mobile root (`app/_layout.tsx`) fetches it and feeds `StripeProvider` (starting from
`""`, updated once fetched). Never reintroduce a build-time publishable-key dependency for the client.
