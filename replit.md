# MARSA

A yacht booking marketplace MVP for El Gouna, Egypt. Guests discover and book yachts; hosts list their vessels and manage bookings; admins oversee the platform. Prices are displayed in EGP but Stripe PaymentIntents are created in USD using a daily live exchange rate.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed the database with booking templates, categories, add-ons, and example photos
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, Clerk Auth (Google OAuth + Email/Password)
- DB: PostgreSQL + Drizzle ORM (22 tables)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Payments: Stripe (PaymentIntents in USD, displayed in EGP)

## Where things live

- `lib/db/src/schema/` — one file per table, barrel-exported from `index.ts`
- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/` — auth, validate, auditLog, Clerk proxy
- `scripts/src/seed.ts` — idempotent DB seed

## Architecture decisions

- Prices stored and processed in EGP decimals; Stripe PaymentIntents are created in USD using a live exchange rate fetched at booking time.
- Clerk Auth is used for authentication (not Replit Auth). The proxy middleware at `/api/__clerk` is production-only.
- All users start with role `guest`; hosts must apply and be verified by an admin.
- Hosts can also browse and book yachts as guests — roles are additive, not exclusive tabs.
- Earnings become available for withdrawal 7 days after a booking completes.

## Product

- **Guests**: browse yachts, filter by duration/capacity/date, book with add-ons (birthday decor, fishing, snorkeling, catering), pay via Stripe, review experience.
- **Hosts**: list yachts, set per-template pricing, manage availability slots, confirm/reject bookings, view earnings and request withdrawals, request a MARSA photographer.
- **Admins**: approve/reject yachts and host applications, moderate reviews, process withdrawals, view audit logs and dashboard stats.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pnpm --filter @workspace/api-spec run codegen` must be re-run after every OpenAPI spec change.
- OpenAPI: never inline request bodies; always `$ref` to entity-shaped component names (e.g. `YachtInput`, not `CreateYachtBody`).
- Endpoints with BOTH path params AND query params cause an Orval TS2308 collision. Move such endpoints to query-params-only (e.g. `/yachts/availability?yachtId=...` instead of `/yachts/{id}/availability?...`).
- Express 5: wildcard routes use `/{*splat}`, optional params use `{/:id}`, async handlers annotated `Promise<void>`.
- Never use `console.log` in server code — use `req.log` in handlers, `logger` elsewhere.
- Express `trust proxy` is set to `1` — required for `express-rate-limit` when running behind a reverse proxy.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- DB schema: `lib/db/src/schema/` — 18 source files covering all 22 tables
