# MARSA

A yacht booking marketplace for Egypt. Guests search, wishlist, and book rental
yachts; hosts use a separate mode to manage listings and per-yacht calendars;
admins manage marketplace configuration and operations. The future boat-sale
module is not implemented yet, and **Buy — Soon** remains disabled.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run backfill:marketplace-update` — run the idempotent additive backfill
- `pnpm --filter @workspace/scripts run seed` — seed the database with booking templates, categories, add-ons, and example photos
- Required core env: `DATABASE_URL`, Clerk keys, and `INTERNAL_SECRET_TOKEN`
- Local test checkout: `PAYMENT_GATEWAY=test` and `ENABLE_TEST_PAYMENT_GATEWAY=true`
- Published deployments fail closed if the test gateway is selected

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, Clerk Auth (Google OAuth + Email/Password)
- DB: PostgreSQL + Drizzle ORM (34 tables)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Payments: provider adapter (`test`, `disabled`, preserved `stripe`)

## Where things live

- `lib/db/src/schema/` — one file per table, barrel-exported from `index.ts`
- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/` — auth, validate, auditLog, Clerk proxy
- `scripts/src/seed.ts` — idempotent DB seed
- `scripts/src/backfill-marketplace-update.ts` — additive marketplace backfill
- `UPDATE_IMPLEMENTATION_PLAN.md` — approved product/architecture plan
- `MARKETPLACE_UPDATE_IMPLEMENTATION_GUIDE.md` — file-level implementation and Replit rollout guide

## Architecture decisions

- Money is calculated in integer piasters and persisted as EGP decimals. Only
  the optional Stripe adapter takes an EGP/USD snapshot.
- Clerk Auth is used for authentication (not Replit Auth). The proxy middleware at `/api/__clerk` is production-only.
- All users start with role `guest`; hosts must apply and be verified by an admin.
- Hosts can also book as guests. Role is a server capability; remembered
  guest/host mode controls separate client tab trees.
- Cancellation policies are versioned and immutable after activation. Every
  new booking stores the accepted rules and trip-start instant.
- Availability uses explicit date/time/template rows with optional per-slot
  pricing; slot claiming is atomic.
- Earnings become available for withdrawal 7 days after a booking completes.

## Product

- **Guests**: Home search by location/date, Explore, Wishlist, bookings, cancellation quotes, and reviews.
- **Hosts**: separate dashboard/bookings/yachts/earnings/profile tabs, managed/custom locations, and per-yacht slot calendars.
- **Admins**: moderation plus yacht reactivation/featuring, locations,
  per-admin unseen badges, broadcast notifications, cancellation policy
  versions, and durable cancellation processing.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pnpm --filter @workspace/api-spec run codegen` must be re-run after every OpenAPI spec change.
- OpenAPI: never inline request bodies; always `$ref` to entity-shaped component names (e.g. `YachtInput`, not `CreateYachtBody`).
- Endpoints with BOTH path params AND query params cause an Orval TS2308 collision. Move such endpoints to query-params-only (e.g. `/yachts/availability?yachtId=...` instead of `/yachts/{id}/availability?...`).
- Express 5: wildcard routes use `/{*splat}`, optional params use `{/:id}`, async handlers annotated `Promise<void>`.
- Never use `console.log` in server code — use `req.log` in handlers, `logger` elsewhere.
- Express `trust proxy` is set to `1` — required for `express-rate-limit` when running behind a reverse proxy.
- `scripts/post-merge.sh` intentionally installs only. Apply schema/backfill
  deliberately to the Replit **development** database using the implementation
  guide; never auto-run a force push.
- Stripe remains installed but is disabled for new checkout unless
  `PAYMENT_GATEWAY=stripe`. Test checkout must never be enabled on a published
  deployment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- DB schema: `lib/db/src/schema/` — source files covering all 34 tables
