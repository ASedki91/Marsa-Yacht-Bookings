# MARSA — Developer Documentation

> Yacht booking marketplace for El Gouna, Egypt.  
> Guests discover and book yachts; hosts list their vessels and manage bookings; admins oversee the platform.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Tech Stack](#3-tech-stack)
4. [Environment Setup](#4-environment-setup)
5. [Running the Project](#5-running-the-project)
6. [Database Schema](#6-database-schema)
7. [API Reference](#7-api-reference)
8. [Mobile App (Expo)](#8-mobile-app-expo)
9. [Admin Dashboard (React + Vite)](#9-admin-dashboard-react--vite)
10. [Authentication](#10-authentication)
11. [Payments & Currency](#11-payments--currency)
12. [File Storage](#12-file-storage)
13. [Notifications](#13-notifications)
14. [Code Generation Workflow](#14-code-generation-workflow)
15. [Key Architectural Decisions](#15-key-architectural-decisions)
16. [Known Gotchas & Pitfalls](#16-known-gotchas--pitfalls)
17. [Progress Tracker](#17-progress-tracker)

---

## 1. Project Overview

MARSA is a yacht charter marketplace MVP for El Gouna, Egypt. The product has three personas:

| Persona | Core journey |
|---------|-------------|
| **Guest** | Search by location/date → browse or wishlist yachts → book through the configured payment gateway → review the experience |
| **Host** | Apply to list → upload documents → add yachts → set availability & pricing → confirm/reject bookings → withdraw earnings |
| **Admin** | Approve/reject hosts and yachts → moderate reviews → process withdrawal requests → view platform stats and audit logs |

Prices are displayed in **EGP** (Egyptian Pound). New checkout uses a
provider-neutral gateway. The development-only test gateway records successful
EGP test payments without charging a card; the preserved Stripe adapter still
uses a stored EGP/USD exchange-rate snapshot when explicitly enabled.

The active marketplace-preparation architecture and Replit rollout procedure
are documented in
[`MARKETPLACE_UPDATE_IMPLEMENTATION_GUIDE.md`](MARKETPLACE_UPDATE_IMPLEMENTATION_GUIDE.md).
The future sale-listing module is not implemented yet; only neutral discovery
seams and a disabled **Buy — Soon** choice are present.

### Current stabilization checkpoint (2026-07-31)

- Mobile authentication now uses `@clerk/expo` v3.7.8 as an application
  dependency. Password sign-in first identifies the account with
  `signIn.create({ identifier })`, confirms that the account supports a
  password factor, submits `signIn.password({ password })`, handles any
  required second factor, and calls `signIn.finalize()` only when Clerk reports
  `complete`. This fixes the invalid-identifier/incomplete-session behavior
  caused by sending the email directly to the password factor.
- Email addresses are normalized and validated consistently across sign-in,
  sign-up, and password reset. Sign-in also supports an email-code fallback and
  Clerk second factors (email code, phone code, TOTP, and backup code), with
  reusable Clerk error extraction and visible retryable errors.
- Guest and host profile surfaces use the shared `ConfirmActionModal` for sign
  out. Push-token deactivation is best-effort, Clerk sign-out remains the
  authoritative operation, the local development bypass is cleared, and users
  are routed back to sign-in only after sign-out succeeds.
- Development checkout is active when `PAYMENT_GATEWAY=test` and
  `ENABLE_TEST_PAYMENT_GATEWAY=true`. The mobile action completes a virtual
  payment, the API persists a unique `test_pay_*` transaction as `succeeded`,
  and the booking advances to `paid_under_review` without collecting card
  details or moving real money. Production and published Replit deployments
  still fail closed.

### UI identity, calendar, and legal checkpoint (2026-08-17)

- Guest date selection is standardized on
  `artifacts/marsa-mobile/components/DateMatrixPicker.tsx`. Booking keeps its
  existing 21-day window, Home search keeps its 30-day window, and Explore
  keeps its 8-day window; only the presentation changed from horizontal date
  cards/chips to an accessible month matrix. The component uses local
  `YYYY-MM-DD` helpers to avoid UTC day rollover. The host per-yacht calendar
  was already a matrix and remains functionally unchanged.
- Privacy Policy and Terms of Use copy is stored in
  `artifacts/marsa-mobile/constants/legal.ts` and rendered by the public
  `/legal/privacy` and `/legal/terms` routes. These routes are available before
  sign-up and from guest, host, compatibility, and full-profile surfaces. Keep
  the runtime copy synchronized with approved legal text; do not substitute
  the booking-specific cancellation terms with these general documents.
- Mobile and admin now share the MARSA identity from
  `https://marsa-identity-standalone.vercel.app/`: Navy `#243F5D`, Deep Blue
  `#254E7B`, Dune Gold `#C2924F`, Warm Sand `#ECDCC0`, Paper `#F4EDDF`, and
  Card `#FBF7EF`. Hanken Grotesk is the UI/body face, Marcellus is the
  wordmark/display face, Space Mono is used for labels/details, and Tajawal is
  loaded for Arabic text.
- The canonical yacht/sun/sea mark is preserved as SVG in each client and as a
  1024px PNG for Expo native icon/splash usage. `app.json`, authentication,
  Explore, Clerk Admin sign-in, the admin sidebar, and browser favicons all use
  the new mark. Admin font files are packaged with `@fontsource`; Replit does
  not need Google Fonts network access at runtime.
- This checkpoint is UI/content-only. It adds no API endpoint, migration,
  database table, environment variable, or payment behavior change.

### Support, production operations, and publishing checkpoint (2026-08-21)

- WhatsApp support is now a durable marketplace setting. Admins configure the
  support number from Settings; the singleton value is stored in
  `platform_settings` and exposed publicly through `GET /api/support-config`.
  Admin reads and updates use `/api/admin/support-config`. Numbers accept an
  optional `+`, spaces, and dashes, then normalize to 7–15 digits. The safe
  fallback remains `201030303030`.
- Support placement is intentional: booking detail, checkout failure/pending
  states, cancellation/refund contexts, general Profile/Account help, and host
  onboarding/verification. It is not shown on booking cards or booking lists.
  The Profile/Account action uses the shared account-row treatment; contextual
  support actions retain the green button treatment.
- Agent-assisted production operations are implemented behind the
  production-only `/api/internal/operator/*` routes. They support Clerk
  invitations and local role provisioning, locations, categories, booking
  templates, and yacht draft creation with optional photos and pricing.
  Operations are typed, rate-limited, dry-run first, explicitly confirmed,
  idempotent by request ID, and recorded in `operator_operations` and the
  admin activity trail. Yacht operations always create `draft` listings.
- Operator access requires the server-only `AGENT_OPERATOR_TOKEN` and the
  production `CLERK_SECRET_KEY`; the routes return 404 outside production and
  never accept arbitrary SQL or passwords. Clerk-to-local account relinking
  uses the authenticated Clerk user’s verified primary email, not an
  untrusted client email. Local emails have a case-insensitive unique index.
- Admin yacht approval is restricted to `pending_review`, so an operator-created
  draft must pass the normal host submission and moderation flow before it can
  become live. See [`docs/production-operator.md`](docs/production-operator.md)
  for the operational runbook.
- Publishing routing is path-based: the Expo web experience is served at `/`,
  the admin dashboard at `/marsa-admin/`, and the API at `/api/`. The mobile
  artifact’s registered `previewPath`, service path, and `BASE_PATH` are `/`;
  the admin artifact remains `/marsa-admin/`. The mobile production build
  exports a browser bundle alongside the iOS and Android Expo manifests.
- The published browser root serves the exported Expo web app, including
  client-side route fallbacks. Requests with an `expo-platform` header still
  receive the native iOS or Android manifest, so the same artifact continues
  to support Expo Launch and App Store iOS publishing.
- Security hardening now includes a repository threat model in
  `threat_model.md`, header-only internal service authentication, signed
  user/path-bound upload intents, owner-preserving object ACL updates, and
  safe object-path handling for host verification documents.

---

## 2. Repository Structure

```
artifacts-monorepo/
├── artifacts/
│   ├── api-server/          # Express 5 API (port from $PORT, default 8080)
│   ├── marsa-admin/         # React + Vite admin dashboard (path: /marsa-admin/)
│   ├── marsa-mobile/        # Expo React Native + web app (path: /)
│   └── mockup-sandbox/      # Design prototyping sandbox (internal use)
├── lib/
│   ├── api-spec/            # OpenAPI 3.1 spec + Orval codegen config
│   ├── api-client-react/    # Generated React Query hooks (from codegen)
│   ├── api-zod/             # Generated Zod schemas (from codegen)
│   └── db/                  # Drizzle ORM schemas & DB client
├── scripts/                 # Utility scripts (seed, etc.)
├── pnpm-workspace.yaml      # Workspace catalog + overrides
├── tsconfig.base.json       # Shared strict TypeScript config
└── tsconfig.json            # Root solution file (composite libs only)
```

Each `artifacts/*` package is a standalone deployable application. They share libraries via `lib/*` workspace packages.

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24, TypeScript 5.9 |
| Package manager | pnpm workspaces |
| API server | Express 5, `@clerk/express` |
| Auth | Clerk (Google OAuth + email/password/email-code via Expo Future/signal API) |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4, `drizzle-zod` |
| API contract | OpenAPI 3.1 → Orval codegen → React Query hooks + Zod schemas |
| Payments | Provider adapter (`test`, `disabled`, preserved `stripe`) |
| File storage | Google Cloud Storage (via object storage lib) |
| Mobile | Expo SDK 54, React Native 0.81, expo-router v6 |
| Admin UI | React 19, Vite, TailwindCSS v4, shadcn/ui (Radix primitives), Wouter |
| Logging | Pino (structured JSON); use `req.log` in handlers, `logger` elsewhere |
| Build | esbuild (API server CJS bundle) |
| Testing | Vitest (API server unit tests) |

---

## 4. Environment Setup

### Required secrets / environment variables

| Variable | Where used | Description |
|----------|-----------|-------------|
| `DATABASE_URL` | API server | PostgreSQL connection string |
| `CLERK_PUBLISHABLE_KEY` | API server | Clerk publishable key |
| `CLERK_SECRET_KEY` | API server | Clerk secret key |
| `CLERK_PROXY_URL` | Mobile production build | Root-relative Clerk proxy path; use `/api/__clerk` so Replit and custom domains share one web bundle |
| `VITE_CLERK_PUBLISHABLE_KEY` | Admin (Vite build) | Same Clerk key for browser |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | API server | GCS bucket ID |
| `PRIVATE_OBJECT_DIR` | API server | Private object storage prefix |
| `PUBLIC_OBJECT_SEARCH_PATHS` | API server | Public object storage search paths |
| `SESSION_SECRET` | API server | Session signing secret |
| `INTERNAL_SECRET_TOKEN` | API workers | Bearer token for scheduled delivery/hold workers |
| `AGENT_OPERATOR_TOKEN` | API server (Production only) | Server-only token for confirmed agent-assisted marketplace operations |
| `PAYMENT_GATEWAY` | API server | `test`, `disabled`, or `stripe`; use `test` only for local/Replit development |
| `ENABLE_TEST_PAYMENT_GATEWAY` | API server | Must be exactly `true` to permit test checkout outside a published deployment |
| `DEFAULT_MARKET_TIME_ZONE` | API server | Fallback IANA time zone, normally `Africa/Cairo` |
| `STRIPE_SECRET_KEY` | API server | Optional; only needed when the preserved Stripe adapter is selected or historical Stripe refunds are processed |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Mobile | Injected at dev time from `$CLERK_PUBLISHABLE_KEY` |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Mobile | Required in a development build when testing Expo push notifications |

All secrets are managed through Replit Secrets (never committed to code).

### First-time setup

```bash
# Install all workspace dependencies
pnpm install

# Push the DB schema to the database (dev only — uses DATABASE_URL)
pnpm --filter @workspace/db run push

# Backfill additive marketplace fields (safe and idempotent)
pnpm --filter @workspace/scripts run backfill:marketplace-update

# Seed the database with booking templates, categories, add-ons, and example photos
pnpm --filter @workspace/scripts run seed

# (Optional) Re-run API codegen if you changed the OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

Schema application is intentionally not part of `scripts/post-merge.sh`.
After syncing to Replit, apply it deliberately to the **development** database
using the prompt in the implementation guide. Do not run the general seed
command against an existing business database.

---

## 5. Running the Project

All services are managed through Replit Workflows. **Do not run `pnpm dev` at the workspace root.**

| Workflow name | Command | What it runs |
|--------------|---------|-------------|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | Express API on `$PORT` |
| `artifacts/marsa-admin: web` | `pnpm --filter @workspace/marsa-admin run dev` | Vite dev server for admin |
| `artifacts/marsa-mobile: expo` | `pnpm --filter @workspace/marsa-mobile run dev` | Expo Metro bundler |

### Useful dev commands

```bash
# Full typecheck (all packages)
pnpm run typecheck

# API codegen (after changing openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push

# Run API server unit tests
pnpm --filter @workspace/api-server run test

# Typecheck a single package
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/marsa-admin run typecheck
pnpm --filter @workspace/marsa-mobile run typecheck
```

### Routing / proxy

A shared reverse proxy routes traffic by path prefix. In the dev shell, use `localhost:80` (not service ports directly):

```bash
curl localhost:80/api/healthz       # API health
curl localhost:80/marsa-admin/      # Admin dashboard
curl localhost:80/                  # Expo web app
# Expo native/dev-domain access remains available through $REPLIT_EXPO_DEV_DOMAIN
```

The registered artifact paths are:

| Artifact | Path | Config source |
|----------|------|--------------|
| `marsa-mobile` | `/` | `artifacts/marsa-mobile/.replit-artifact/artifact.toml` |
| `marsa-admin` | `/marsa-admin/` | `artifacts/marsa-admin/.replit-artifact/artifact.toml` |
| `api-server` | `/api/` | API artifact configuration |

Publish all artifacts together and attach the custom domain to the project.
Replit routes each artifact by its registered path; do not add a second legacy
workflow or hardcode service ports.

---

## 6. Database Schema

All schema files are in `lib/db/src/schema/`. The DB client is exported from `@workspace/db`.

### Tables at a glance

| Table | File | Purpose |
|-------|------|---------|
| `users` | `users.ts` | All users (guests, hosts, admins) |
| `host_profiles` | `hostProfiles.ts` | Host application & verification state |
| `host_documents` | `hostDocuments.ts` | Documents uploaded during host onboarding |
| `categories` | `categories.ts` | Yacht categories (sailboat, motorboat, etc.) |
| `yachts` | `yachts.ts` | Yacht listings |
| `yacht_photos` | `yachtPhotos.ts` | Photos for each yacht |
| `booking_templates` | `bookingTemplates.ts` | Duration packages (e.g. "3-hour trip") |
| `yacht_template_pricing` | `yachtTemplatePricing.ts` | Per-yacht price for each template |
| `availability_slots` | `availabilitySlots.ts` | Open time slots for bookings |
| `bookings` | `bookings.ts` | Booking records |
| `booking_add_ons` | `addOns.ts` | Add-ons selected per booking |
| `add_ons` | `addOns.ts` | Global add-on catalogue |
| `payments` | `payments.ts` | Stripe payment records |
| `refunds` | `refunds.ts` | Refund records |
| `reviews` | `reviews.ts` | Bidirectional reviews (guest↔host) |
| `earnings_ledger` | `finance.ts` | Per-booking host earnings tracking |
| `withdrawal_requests` | `finance.ts` | Host withdrawal requests |
| `notifications` | `notifications.ts` | In-app notification feed |
| `audit_logs` | `auditLogs.ts` | Admin action audit trail |
| `photographer_requests` | `misc.ts` | Host requests for MARSA photographer |
| `referral_codes` | `misc.ts` | Referral code system (scaffolded) |
| `example_yacht_photos` | `misc.ts` | Admin-curated example photos for listings |
| `exchange_rates` | `misc.ts` | Cached EGP/USD exchange rates |
| `locations` | `locations.ts` | Admin-managed searchable locations and IANA time zones |
| `wishlist_items` | `wishlistItems.ts` | Per-user saved rental yachts |
| `admin_events`, `admin_section_views` | `adminActivity.ts` | Per-admin unseen activity |
| `user_push_tokens` | `userPushTokens.ts` | Owned Expo device tokens |
| `operator_operations` | `operatorOperations.ts` | Idempotent, audited agent-assisted production operations |
| `notification_campaigns`, `notification_deliveries` | `notificationCampaigns.ts` | Broadcast queue and channel delivery history |
| `cancellation_policies`, `cancellation_policy_rules` | `cancellationPolicies.ts` | Immutable, versioned fee tiers |
| `booking_cancellation_terms` | `bookingCancellationTerms.ts` | Policy snapshot accepted with each new booking |
| `booking_cancellations` | `bookingCancellations.ts` | Durable cancellation request, quote, review, and refund state |

### Key schema details

#### `users`
```
id (PK, text/uuid) | clerkId (unique) | email (case-insensitive unique) | phone | fullName
nationality | avatarUrl | role: guest|host|admin
```
All users start as `guest`. Hosts must apply and be approved by an admin. Roles are **additive** — a host can also book as a guest.

#### `host_profiles`
```
id (PK) | userId → users | bio | verificationStatus: pending|verified|rejected
stripeConnectId | bankInfoEncrypted
```
One profile per user. Created when a user submits a host application. `bankInfoEncrypted` stores bank details for withdrawal processing.

#### `yachts`
```
id (PK) | hostId → host_profiles | categoryId → categories
title | description | location | city (default: "Gouna")
latitude | longitude | capacity | lengthFt | yearBuilt | manufacturer
features (jsonb string[]) | status: draft|pending_review|changes_requested|approved|live|rejected|suspended
avgRating | reviewCount
```

#### `bookings`
```
id (PK) | guestId → users | yachtId → yachts | templateId → booking_templates
slotId → availability_slots | bookingDate | startTime | guestCount
guestName | guestPhone | guestEmail | guestNationality | specialRequests
baseAmountEgp | baseAmountUsd | exchangeRateUsed | platformFeeEgp (20%)
hostEarningsEgp (80%) | totalAmountEgp
status: pending_payment|paid_under_review|confirmed|rejected_refunded|
        cancel_requested|cancelled|completed|closed
confirmedBy → users | confirmedAt | completedAt
```

#### `earnings_ledger`
```
id (PK) | hostId → host_profiles | bookingId → bookings
amountEgp | type: earning|payout|adjustment
status: pending|available|withdrawn|adjustment | eligibleAt
```
Earnings become `available` after the configured hold period (policy: 7 days after booking completion per `replit.md`; note Task #17 proposes changing to 3 days automatically).

#### `withdrawal_requests`
```
id (PK) | hostId → host_profiles | amountEgp
status: not_eligible|eligible|withdrawal_requested|under_review|paid|rejected
eligibleAt | requestedAt | reviewedBy → users | reviewedAt
payoutMethod | payoutReference | notes
```

#### `payments`
```
id (PK) | bookingId → bookings | stripePaymentIntentId (unique)
amountEgp | amountUsd | currency | status: created|succeeded|refund_pending|refunded|failed
stripeChargeId | receiptUrl
```

---

## 7. API Reference

Base path: `/api`  
All routes are defined in `artifacts/api-server/src/routes/`.

### Auth / User

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/sync` | Clerk JWT | Sync Clerk user to local DB using the verified Clerk primary email |
| `GET` | `/api/auth/me` | Required | Return current user profile |
| `GET` | `/api/healthz` | None | Shallow health check |
| `GET` | `/api/health` | None | Deep health check (DB connectivity) |

### Yachts (public)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/yachts` | Optional | List live yachts (filter by category, capacity, location, date) |
| `GET` | `/api/yachts/:id` | Optional | Yacht detail (photos, pricing, templates, host info) |
| `GET` | `/api/yachts/:id/slots` | Optional | Available time slots for a yacht |
| `GET` | `/api/yachts/availability` | Optional | Batch availability check |
| `GET` | `/api/categories` | None | List all categories |
| `GET` | `/api/booking-templates` | None | List all booking templates (duration packages) |
| `GET` | `/api/add-ons` | None | List all active add-ons |
| `GET` | `/api/exchange-rate` | None | Current EGP/USD rate |

### Bookings (guest)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/bookings` | Required | Create booking + Stripe PaymentIntent |
| `GET` | `/api/bookings/me` | Required | List caller's bookings (as guest or host) |
| `GET` | `/api/bookings/:id` | Required | Booking detail |
| `POST` | `/api/bookings/:id/cancel` | Required | Request cancellation |
| `POST` | `/api/bookings/:id/confirm` | host/admin | Confirm a paid booking |
| `POST` | `/api/bookings/:id/reject` | host/admin | Reject a paid booking (triggers refund) |
| `POST` | `/api/bookings/:id/review` | Required | Submit a review for a completed booking |

### Host

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/host/apply` | Required | Submit host application |
| `GET` | `/api/host/profile` | Required | Get own host profile + verification status |
| `PATCH` | `/api/host/profile` | Required | Update bio |
| `GET` | `/api/host/documents` | Required | List uploaded verification documents |
| `POST` | `/api/host/documents` | Required | Upload a verification document |
| `GET` | `/api/host/yachts` | host | List own yachts |
| `POST` | `/api/host/yachts` | host | Create a new yacht draft |
| `GET` | `/api/host/yachts/:id` | host | Get own yacht detail |
| `PATCH` | `/api/host/yachts/:id` | host | Update yacht details |
| `DELETE` | `/api/host/yachts/:id` | host | Delete yacht |
| `POST` | `/api/host/yachts/:id/submit` | host | Submit yacht for admin review |
| `PUT` | `/api/host/yachts/:id/availability` | host | Set availability slots (batch upsert) |
| `PUT` | `/api/host/yachts/:id/pricing` | host | Set per-template pricing |
| `GET` | `/api/host/earnings` | host | Earnings summary (total, available, pending) |
| `GET` | `/api/host/earnings/ledger` | host | Paginated ledger entries |
| `POST` | `/api/host/earnings/withdraw` | host | Request a withdrawal |
| `GET` | `/api/host/withdrawals` | host | List own withdrawal requests |
| `GET` | `/api/host/documents` | host | List own verification documents |
| `POST` | `/api/host/photographer-request` | host | Request a MARSA photographer |

### Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/notifications` | Required | List own notifications (unread first) |
| `POST` | `/api/notifications/:id/read` | Required | Mark a notification as read |

### Storage

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/storage/uploads/request-url` | Required | Get a signed GCS upload URL |
| `POST` | `/api/storage/uploads/finalize` | Required | Confirm upload with its short-lived user/path-bound intent and set ACL |

### Payments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/payments/config` | None | Return Stripe publishable key (from Replit connector) |

### Admin

All admin routes require `role = admin`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/users` | List all users (paginated, filterable) |
| `PATCH` | `/api/admin/users/:id/role` | Change a user's role |
| `GET` | `/api/admin/yachts` | List all yachts (any status) |
| `POST` | `/api/admin/yachts/:id/approve` | Approve a submitted `pending_review` yacht (sets status → live) |
| `POST` | `/api/admin/yachts/:id/reject` | Reject a yacht |
| `POST` | `/api/admin/yachts/:id/request-changes` | Request changes to a yacht listing |
| `POST` | `/api/admin/yachts/:id/suspend` | Suspend a live yacht |
| `GET` | `/api/admin/bookings` | List all bookings |
| `GET` | `/api/admin/hosts` | List all host applications |
| `POST` | `/api/admin/hosts/:id/verify` | Approve or reject a host application |
| `GET` | `/api/admin/withdrawals` | List withdrawal requests |
| `POST` | `/api/admin/withdrawals/:id/process` | Mark withdrawal as paid or rejected |
| `GET` | `/api/admin/reviews` | List all reviews |
| `POST` | `/api/admin/reviews/:id/moderate` | Approve, reject, or hide a review |
| `GET` | `/api/admin/audit-logs` | View audit trail |
| `GET` | `/api/admin/stats` | Platform dashboard stats |
| `GET` | `/api/admin/documents` | List host verification documents |
| `POST` | `/api/admin/documents/:id/review` | Approve or reject a document |
| `GET` | `/api/admin/photographer-requests` | List photographer requests |
| `PATCH` | `/api/admin/photographer-requests/:id` | Update photographer request status |
| `GET` | `/api/admin/example-photos` | List example yacht photos |
| `POST` | `/api/admin/example-photos` | Add an example photo |
| `PATCH` | `/api/admin/example-photos/:id` | Update example photo |
| `DELETE` | `/api/admin/example-photos/:id` | Delete example photo |
| `GET` | `/api/admin/categories` | List categories |
| `POST` | `/api/admin/categories` | Create category |
| `PATCH` | `/api/admin/categories/:id` | Update category |
| `DELETE` | `/api/admin/categories/:id` | Delete category |
| `GET` | `/api/admin/add-ons` | List add-ons |
| `POST` | `/api/admin/add-ons` | Create add-on |
| `PATCH` | `/api/admin/add-ons/:id` | Update add-on |
| `DELETE` | `/api/admin/add-ons/:id` | Delete add-on |
| `GET` | `/api/admin/booking-templates` | List booking templates |
| `POST` | `/api/admin/booking-templates` | Create booking template |
| `PATCH` | `/api/admin/booking-templates/:id` | Update booking template |
| `DELETE` | `/api/admin/booking-templates/:id` | Delete booking template |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/webhooks/stripe` | Stripe webhook handler (payment_intent.succeeded, charge.refunded, etc.) |

### Dev-only (not in production)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/dev/complete-booking/:id` | Force-complete a booking for testing |
| `POST` | `/api/dev/seed` | Trigger DB seed |

### Marketplace preparation endpoints

- Guest discovery: `GET /api/locations`, `GET /api/discovery/home`, live-only
  yacht filters, and authenticated `/api/wishlist` routes.
- Host calendar: `GET /api/host/yacht-availability` and
  `POST /api/host/yachts/:id/availability` with per-slot prices.
- Payments: `GET /api/payments/config` returns the active provider,
  checkout availability, and test-mode status. `POST /api/bookings` requires a
  concrete slot and accepted cancellation-policy ID.
- Cancellation: current policy, per-booking quote/request routes, versioned
  admin policy routes, and durable admin cancellation processing.
- Admin operations: managed locations, yacht reactivation/featuring,
  per-admin activity counts, notification campaigns, and campaign status.
- Push: authenticated push-token registration/deactivation and internal
  bounded delivery/receipt workers.
- Security hardening: internal worker credentials are accepted only as
  `Authorization: Bearer ...` headers, never as URL query parameters.

`lib/api-spec/openapi.yaml` remains the exact contract source of truth; consult
the generated hooks rather than copying endpoint shapes from this overview.

### Internal production operator endpoints

These routes are server-to-server operational endpoints and are intentionally
not exposed through the mobile/admin client or generated OpenAPI hooks. They
require the `x-marsa-operator-token` header, `NODE_ENV=production`, and
`AGENT_OPERATOR_TOKEN`.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/internal/operator/users` | Invite a Clerk user and provision a local role |
| `POST` | `/api/internal/operator/locations` | Create a managed location |
| `POST` | `/api/internal/operator/categories` | Create a yacht category |
| `POST` | `/api/internal/operator/booking-templates` | Create a duration/pricing template |
| `POST` | `/api/internal/operator/yachts` | Create a verified-host yacht draft with optional photos/pricing |

Every request includes a UUID `requestId` and `confirm` boolean. First send
`confirm: false` for validation; only resend the exact request with
`confirm: true` after explicit confirmation. Completed request IDs replay their
stored result; running or failed IDs remain locked to avoid duplicate side
effects. For production setup and schema rollout, follow
[`docs/production-operator.md`](docs/production-operator.md).

---

## 8. Mobile App (Expo)

**Package:** `@workspace/marsa-mobile`  
**Framework:** Expo SDK 54, expo-router v6, React Native 0.81  
**Web path:** `/`

**Native/development domain:** determined by Expo

### Published web and native delivery

The mobile artifact produces three production outputs in one build:

| Output | Location | Served to |
|--------|----------|-----------|
| Expo web export | `static-build/web/` | Ordinary browser requests to `/` |
| iOS Expo bundle + manifest | `static-build/<build-id>/` and `static-build/ios/manifest.json` | Requests carrying `expo-platform: ios` |
| Android Expo bundle + manifest | `static-build/<build-id>/` and `static-build/android/manifest.json` | Requests carrying `expo-platform: android` |

`scripts/build.js` exports the browser app first, then generates the native
bundles and rewrites their asset URLs for the deployed domain. `server/serve.js`
serves web assets and Expo Router client-side routes from `static-build/web/`;
it preserves the platform-aware manifest responses required by Expo Launch and
App Store iOS publishing. The web export also copies
`assets/images/marsa-social-preview.png` to the web root and uses it for
Open Graph and Twitter link previews. The optional `EXPO_METRO_PORT` build
variable changes only the local Metro port used while generating native
bundles; production defaults to `8081`.

For published web authentication, the Expo `ClerkProvider` receives
`EXPO_PUBLIC_CLERK_PROXY_URL`. The production build expands
`CLERK_PROXY_URL=/api/__clerk` against the published app domain, so Clerk JS
loads through the API server's local proxy. Development intentionally leaves
this value empty and uses Clerk's development endpoint directly.

### Screen map

```
app/
├── index.tsx                    → Redirect: authenticated → /(home), unauthenticated → /(auth)
├── _layout.tsx                  → Root layout: ClerkProvider, QueryClientProvider, fonts
├── +not-found.tsx               → 404 screen
│
├── (auth)/
│   ├── _layout.tsx              → Auth stack layout
│   ├── sign-in.tsx              → Password/email-code sign-in, MFA + Google SSO
│   ├── sign-up.tsx              → Email/password sign-up + email verification
│   └── forgot-password.tsx      → Password reset (send code → verify → new password)
│
└── (home)/
    ├── _layout.tsx              → Authenticated providers and shared detail routes
    ├── index.tsx                → Redirect to the remembered permitted app mode
    ├── notifications.tsx        → In-app notification list
    ├── profile.tsx              → Full profile edit screen
    ├── become-host.tsx          → Host application flow (bio, documents)
    ├── new-yacht.tsx            → Create a new yacht listing (host only)
    ├── book/[id].tsx            → Slot checkout + accepted cancellation terms
    ├── booking/[id].tsx         → Booking detail, test/Stripe receipt, cancellation quote
    ├── review/[id].tsx          → Post-trip review submission
    ├── yacht/[id].tsx           → Public yacht detail page
    │
    ├── guest/(tabs)/
    │   ├── home.tsx             → Location/date search + discovery rails
    │   ├── explore.tsx          → Live-only rental search and filters
    │   ├── wishlist.tsx         → Saved yachts
    │   ├── bookings.tsx         → Guest bookings
    │   └── profile.tsx          → Guest profile and Host-mode switch
    └── host/
        ├── (tabs)/              → Dashboard, bookings, yachts, earnings, profile
        └── yacht/[id]/calendar.tsx → Explicit date/time slots and per-slot price
```

The root `legal/[document].tsx` route renders the public `/legal/privacy` and
`/legal/terms` readers outside the authenticated route group.

The legacy `(home)/(tabs)` files are compatibility implementations reused by
the separated route trees; they are no longer presented as one mixed tab bar.
Mode is client state persisted per Clerk user, while the server role remains
the authorization capability.

### Key dependencies

| Package | Purpose |
|---------|---------|
| `@clerk/expo` v3.7.8 | Auth (Future/signal API — see gotchas) |
| `expo-secure-store` | Clerk token cache |
| `@tanstack/react-query` | Server state |
| `@workspace/api-client-react` | Generated API hooks |
| `@expo-google-fonts/hanken-grotesk` | Mobile UI/body typography |
| `@expo-google-fonts/marcellus` | Mobile wordmark/display typography |
| `@expo-google-fonts/space-mono` | Mobile label/detail typography |
| `@expo-google-fonts/tajawal` | Mobile Arabic typography |
| `@stripe/stripe-react-native` | Preserved optional Stripe payment sheet (platform-specific web stub) |
| `expo-notifications` | Device permission, Expo token registration, and push deep links |
| `expo-image-picker` | Yacht photo upload |
| `react-native-reanimated` | Animations |
| `expo-router` v6 | File-based routing |

### Auth pattern (important)

Clerk Expo v3 uses the **Future/signal API**, not the legacy resource API. The `/legacy` import silently no-ops on Replit-managed Clerk. Always use:

```typescript
const { signIn } = useSignIn();
const { error: identifierError } = await signIn.create({
  identifier: normalizedEmail,
});

if (!identifierError) {
  const supportsPassword = signIn.supportedFirstFactors.some(
    (factor) => factor.strategy === "password",
  );
  if (supportsPassword) {
    const { error: passwordError } = await signIn.password({ password });
    if (!passwordError && signIn.status === "complete") {
      await signIn.finalize();
      router.replace("/(home)");
    }
  }
}
```

Do not pass the email directly to `signIn.password()`. Establish the sign-in
attempt with `signIn.create({ identifier })`, inspect the supported factors,
then invoke the chosen factor. For passwordless email sign-in, use
`signIn.emailCode.sendCode()` / `verifyCode()` on that same attempt. Handle
`needs_second_factor` and `needs_client_trust` before finalizing the session.
Shared normalization and Clerk error parsing live in `lib/clerkAuth.ts`.

See `.agents/memory/clerk-expo-v3-api.md` for the full canonical pattern.

### Payment provider on mobile

`@stripe/stripe-react-native` cannot be bundled for web. The project uses platform-specific files:
- `StripeProvider.tsx` — re-exports the real Stripe provider (used on native)
- `StripeProvider.web.tsx` — no-op stub (used in web/Expo Go web builds)

The selected provider and optional Stripe publishable key are fetched at
runtime from `/api/payments/config`. Test mode never mounts Stripe or collects
fake card details. On the payment step, **Complete Virtual Payment** calls the
ordinary booking endpoint; only the server may return a successful test
transaction. The client requires the returned payment status to be
`succeeded`, shows the virtual-payment confirmation, and exposes a retry action
when runtime payment configuration could not be loaded.

---

## 9. Admin Dashboard (React + Vite)

**Package:** `@workspace/marsa-admin`  
**Framework:** React 19, Vite, TailwindCSS v4, shadcn/ui, Wouter  
**Path:** `/marsa-admin/`

### Pages

| File | Route | Purpose |
|------|-------|---------|
| `Dashboard.tsx` | `/` | Platform stats: revenue, bookings count, pending items |
| `Users.tsx` | `/users` | All users list; role management |
| `Hosts.tsx` | `/hosts` | Host applications; approve / reject; shows bank details on withdrawal cards |
| `Yachts.tsx` | `/yachts` | Moderation, suspension/reactivation, and featured placement |
| `Bookings.tsx` | `/bookings` | All bookings across platform |
| `Withdrawals.tsx` | `/withdrawals` | Withdrawal requests; mark paid / rejected |
| `Reviews.tsx` | `/reviews` | Review moderation (approve / reject / hide) |
| `AuditLog.tsx` | `/audit-log` | Admin action audit trail |
| `Documents.tsx` | `/documents` | Host verification documents |
| `PhotographerRequests.tsx` | `/photographer-requests` | MARSA photographer scheduling |
| `ExamplePhotos.tsx` | `/example-photos` | Admin-curated example yacht photos |
| `Categories.tsx` | `/categories` | Yacht category management |
| `AddOns.tsx` | `/add-ons` | Add-on catalogue management |
| `BookingTemplates.tsx` | `/booking-templates` | Duration package management |
| `Cancellations.tsx` | `/cancellations` | Durable cancellation/refund request review |
| `CancellationPolicies.tsx` | `/cancellation-policy` | Draft, validate, activate, and inspect policy versions |
| `Locations.tsx` | `/locations` | Managed/default locations and ordering |
| `NotificationCampaigns.tsx` | `/notifications` | Broadcast compose, confirmation, and delivery history |
| `not-found.tsx` | `*` | 404 fallback |

### Key dependencies

| Package | Purpose |
|---------|---------|
| `@clerk/react` + `@clerk/themes` | Admin auth |
| `wouter` | Client-side routing |
| `@tanstack/react-query` | Server state |
| `@workspace/api-client-react` | Generated API hooks |
| `shadcn/ui` (Radix primitives) | UI component library |
| `recharts` | Charts on dashboard |
| `react-hook-form` + `@hookform/resolvers` | Form validation |
| `framer-motion` | Animations |
| `sonner` | Toast notifications |

---

## 10. Authentication

MARSA uses **Clerk** for authentication (not Replit Auth or JWT). Three layers:

### 1. Clerk (identity provider)
Users sign up with email/password or Google OAuth. Existing users can sign in
with password, email code, or Google OAuth. Clerk issues JWTs.

### Mobile Clerk session lifecycle

1. Normalize and validate the email before sending it to Clerk.
2. Start a Clerk sign-in attempt with `signIn.create({ identifier })`.
3. Inspect `supportedFirstFactors`, then run the selected password or email-code
   factor. If Clerk reports `needs_second_factor` or `needs_client_trust`,
   prepare and verify the supported MFA factor.
4. Call `signIn.finalize()` only after `signIn.status === "complete"`, then let
   the authenticated app call `POST /api/auth/sync`.
5. On sign-out, show the cross-platform confirmation modal, attempt push-token
   deactivation without allowing cleanup failure to trap the session, await
   Clerk `signOut()`, clear the local development bypass, and replace the route
   with `/(auth)/sign-in`.

### 2. `POST /api/auth/sync`
Called by clients after sign-in. Creates (or updates) the local `users` DB record from Clerk data. The server fetches the authenticated Clerk user and requires a verified primary email; it compares the submitted email to that server-authoritative value and only relinks a pre-provisioned `invited:*` local record when normalized emails match. Must be called before any other authenticated request — otherwise `requireAuth` returns 401 "User not found."

### 3. `requireAuth` middleware
Validates the Clerk JWT on each request, looks up the local user, and attaches it to `req.localUser`. Routes that also need a specific role use `requireRole("host")` or `requireRole("admin")` after `requireAuth`.

### Router guard scoping (important gotcha)

`router.use(requireAuth)` without a path prefix intercepts **all** requests passing through that router, including public routes in later routers. Always scope it to a path:

```typescript
router.use("/host", requireAuth);   // ✅ only /host/* routes
router.use(requireAuth);            // ❌ intercepts everything
```

### Roles

| Role | Access |
|------|--------|
| `guest` | Browse, book, review |
| `host` | All guest permissions + manage own yachts, availability, earnings |
| `admin` | All host permissions + platform management |

Roles are stored in the local `users` table and set by admins via `PATCH /api/admin/users/:id/role`.

---

## 11. Payments & Currency

### Flow

1. Client fetches `/api/payments/config`; the server alone selects `test`,
   `disabled`, or `stripe`.
2. Guest chooses a concrete available slot and accepts the current
   cancellation-policy version.
3. The API atomically claims the slot, snapshots slot/add-on prices and
   cancellation terms, and creates booking/payment rows.
4. The development test adapter returns a successful EGP test payment without
   a card or external call. It generates a unique virtual provider ID, persists
   the payment with `isTest=true`, and records `succeededAt`. It is disabled
   whenever `NODE_ENV=production` or `REPLIT_DEPLOYMENT=1`.
5. The preserved Stripe adapter alone fetches EGP/USD, creates a PaymentIntent,
   and returns a payment-sheet action.
6. Successful payment moves the booking to `paid_under_review`; host
   confirmation, earnings, cancellation, rejection, and audit logic are
   provider-neutral.

### Platform fee

The server currently snapshots a 20% platform fee and 80% host earning. The
host listing UI shows only the resulting **You receive** calculation, not
redundant fee copy.

```typescript
const PLATFORM_FEE_PCT = 0.20;
const platformFeeEgp = totalAmount * PLATFORM_FEE_PCT;
const hostEarningsEgp = totalAmount - platformFeeEgp;
```

### Refunds and cancellation

Refunds resolve the adapter from the payment row so historical Stripe payments
remain refundable after new Stripe checkout is disabled. The test adapter
records a logical test refund. Approved cancellations use the immutable policy
snapshot and reopen a future slot only after refund processing succeeds (or
when no provider refund is required).

### Runtime safety

- `PAYMENT_GATEWAY=test` also requires
  `ENABLE_TEST_PAYMENT_GATEWAY=true`.
- Add both values to the local `.env` or Replit Development Secrets and restart
  the API before testing. The mobile app does not select or override them.
- Published Replit or production environments fail closed to `disabled`.
- Stripe dependencies, schema fields, webhooks, and native plugin remain in
  place but new checkout does not use them unless `PAYMENT_GATEWAY=stripe`.
- A Stripe publishable key, when needed, is returned at runtime by
  `/api/payments/config`; it is not required for local test checkout.

---

## 12. File Storage

**Provider:** Google Cloud Storage (via `@google-cloud/storage`)  
**Pattern:** Two-step upload

1. Client calls `POST /api/storage/uploads/request-url` → receives a signed GCS upload URL
   plus a short-lived upload intent bound to the authenticated user and object path.
2. Client uploads directly to GCS
3. Client calls `POST /api/storage/uploads/finalize` with the object path and
   upload intent → server verifies the intent, moves the file, sets ACL
   (public or private), and returns the permanent URL.

Upload intents are signed with `SESSION_SECRET` and expire after 15 minutes.
Finalization cannot be used to assign an object to another user, and an
existing object’s ACL owner cannot be replaced by a different user.
Host verification documents accept only MARSA object paths under
`/objects/uploads/`; the API checks ownership before attaching a document.
The admin document UI resolves those paths through the authenticated storage
proxy and does not render arbitrary stored URLs.

Relevant env vars: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`

---

## 13. Notifications

- `notify()` creates ordinary per-user in-app notifications.
- Admin broadcasts create one in-app notification per current user and durable
  push deliveries per active device token.
- Internal-token workers claim push rows in bounded, concurrency-safe batches,
  record Expo tickets/receipts, retry temporary failures, and deactivate
  unregistered devices.
- Mobile push is opt-in and requires an Expo project ID plus a native
  development/production build; web preview intentionally reports push as
  unsupported.
- Notification data uses validated related-entity fields for deep links.
- The delivery channel model already permits `email`, but no email provider or
  email delivery is enabled in this release.

---

## 14. Code Generation Workflow

The API contract lives in `lib/api-spec/openapi.yaml` and is the **single source of truth** for all endpoints. Frontend packages must not hand-write API calls — they use the generated hooks.

```
lib/api-spec/openapi.yaml
        ↓  pnpm --filter @workspace/api-spec run codegen
lib/api-client-react/src/generated/api.ts        ← React Query hooks
lib/api-client-react/src/generated/api.schemas.ts← Zod schemas
```

**After any change to `openapi.yaml`**, run codegen before touching frontend code:

```bash
pnpm --filter @workspace/api-spec run codegen
```

### OpenAPI rules (avoid breaking codegen)

- Never inline request bodies — always `$ref` to named component schemas (e.g. `BookingInput`, not `CreateBookingBody`)
- Endpoints with BOTH path params AND query params cause Orval TS2308 collisions → move extra params to query-only (e.g. `/yachts/availability?yachtId=...` not `/yachts/{id}/availability?...`)
- Do not change `info.title` in the YAML — it controls generated filenames

### Hook import pattern

```typescript
import { useGetBooking, getGetBookingQueryKey } from "@workspace/api-client-react";
// Not from relative paths. Hooks return T directly (not wrapped).
const booking = useGetBooking(id, { query: { enabled: !!id } });
```

---

## 15. Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Provider-neutral payment rows | New checkout can move from the test adapter to a replacement gateway while historical Stripe references and refunds remain usable. |
| Test gateway fails closed | Free test checkout is allowed only with an explicit development flag and is disabled in production or published Replit deployments. |
| Immutable cancellation terms | New bookings snapshot the active policy/rules and trip-start instant, so later admin policy versions are never retroactive. |
| Roles additive, not exclusive | Hosts need to be able to book as guests. A single `role` column with `guest < host < admin` hierarchy would block this; the current enum + middleware check allows any role to access lower-tier endpoints. |
| Auth sync endpoint | Clerk is the identity source; we keep a local `users` table for FKs, roles, and profile data Clerk doesn't own. Sync is explicit (called by client after login) not implicit (webhook), to avoid cold-start race conditions. |
| Booking templates | Duration packages (e.g. "3-hour trip", "full day") are platform-wide and admin-managed. Hosts set a price per template. This lets the platform control the product surface while hosts set rates. |
| Availability as explicit slots | Hosts create explicit date/time/template slots in a per-yacht calendar; each slot may override its template price. |
| Production operator channel | Typed, production-only, dry-run/confirm operations with atomic request claims, Clerk invitations, verified-host checks, audit history, and draft-only yacht creation provide controlled agent-assisted setup without exposing database credentials or arbitrary SQL. |
| Path-based multi-artifact publishing | The Expo web app owns `/`, the admin owns `/marsa-admin/`, and the API owns `/api/`; each artifact’s validated configuration supplies `BASE_PATH` and service routing. |
| Drizzle `inArray` not `ANY` | `sql\`col = ANY(${array})\`` generates invalid SQL in Drizzle. Always use `inArray(col, array)` from `drizzle-orm`. |
| `@stripe/stripe-react-native` web stub | The native Stripe SDK cannot be bundled for web builds. A `.web.tsx` no-op file is resolved by the Metro bundler on web/Expo Go web. |

---

## 16. Known Gotchas & Pitfalls

1. **Clerk Expo Future API** — Import `useSignIn`, `useSignUp` from
   `@clerk/expo` (main export). The `/legacy` path silently no-ops on
   Replit-managed Clerk. For password sign-in, call
   `signIn.create({ identifier })`, verify the password factor is supported,
   then call `signIn.password({ password })`. Read status from the signal and
   call `signIn.finalize()` only after it becomes `complete`.

2. **Express 5 syntax** — Wildcard routes: `/{*splat}`. Optional params: `{/:id}`. Async handlers must be typed `Promise<void>`.

3. **Drizzle ANY bug** — Use `inArray(col, array)` not `sql\`col = ANY(${array})\``.

4. **Router guard scoping** — Always scope `router.use(requireAuth)` to a path prefix like `router.use("/host", requireAuth)`. A path-less guard intercepts everything including public routes mounted later.

5. **Alert.alert in Replit canvas** — `Alert.alert()` can be suppressed inside
   Replit's canvas iframe. Actions that must work on web should use visible
   inline error state or a cross-platform modal such as `ConfirmActionModal`.

6. **MARSA API response shapes** — Yacht list/detail responses return nested or string fields. Mobile screens must map them explicitly; never assume flat camelCase from the generated types.

7. **Codegen must re-run after spec changes** — Generated files are checked in but must be regenerated whenever `openapi.yaml` changes. Forgetting this causes type mismatches between the spec and the frontend.

8. **No `console.log` in server code** — Use `req.log` (Pino) in route handlers and the singleton `logger` for non-request code. `console.log` is never used in `artifacts/api-server/`.

9. **Typecheck, not build** — Verify packages with `pnpm --filter @workspace/<slug> run typecheck`, not `build`. `build` requires workflow-provided `PORT` and `BASE_PATH` env vars that aren't available in a plain shell.

10. **Payment selection is server-side** — Clients must never choose the test
    gateway or claim payment success. Always fetch runtime state from
    `/api/payments/config`.

11. **No automatic schema push after sync** — `scripts/post-merge.sh` installs
    dependencies only. Apply additive schema and the marketplace backfill
    deliberately to Replit Development using the implementation guide.

12. **Cancellation policies are versioned** — Never edit active/retired rules
    or calculate fees in React. Activate a new draft and use each booking's
    stored quote/terms.

13. **Expo port conflicts after restart** — A stale Metro process can retain
    the managed port and cause Expo to silently offer the next port, producing
    a blank preview. Check the workflow log and kill only the stale Expo/Metro
    process before restarting the managed `artifacts/marsa-mobile: expo`
    workflow. Do not create a replacement workflow.

14. **Production operator actions are not development actions** — The operator
    routes intentionally return 404 unless `NODE_ENV=production`. Configure
    `AGENT_OPERATOR_TOKEN` only in Production and use the dry-run/confirmation
    protocol; never paste the token into source, a client, or chat.

15. **Internal tokens must stay out of URLs** — Scheduled worker endpoints
    accept service credentials only in the `Authorization: Bearer ...` header.
    Never use a `?token=` query parameter because URLs can be retained by
    proxies, browsers, logs, and referrers.

16. **Upload finalization requires intent and ownership** — A signed upload
    intent binds the authenticated user to the normalized object path for
    15 minutes. Finalization must verify that intent, and ACL replacement must
    preserve the existing object owner.

17. **Host document URLs are not arbitrary URLs** — Accept only finalized
    MARSA upload paths and check ownership before attaching them. Admin
    previews must resolve through the authenticated storage proxy rather than
    rendering a stored URL directly.

18. **Keep the Expo web Clerk proxy origin-relative** — Production
    `CLERK_PROXY_URL` must be a root-relative path such as `/api/__clerk`.
    The web export embeds that path unchanged so it follows whichever host the
    user opened (`getmarsa.replit.app` or `getmarsa.app`); native bundles expand
    it to an absolute deployment URL. Prefixing the web value with Replit's
    internal hostname makes Clerk reject requests from the custom domain.

---

## 17. Progress Tracker

### ✅ Completed features

| Feature | Notes |
|---------|-------|
| User authentication (password/email-code + Google) | Clerk Expo v3.7 Future API; identify-then-factor sign-in, MFA handling, sign-up, password reset, normalized email/error handling, and reliable cross-platform sign-out |
| Yacht browsing & search | Filter by category, capacity, date |
| Yacht detail page | Photos, templates, availability, reviews |
| Provider-neutral booking flow | Development test gateway completes and persists virtual successful payments; Stripe is preserved but disabled by configuration |
| Booking confirmation / rejection by host | With refund on rejection |
| Guest booking history | With booking detail and receipt |
| Host yacht management | Create/edit listings plus explicit per-yacht slot calendar and slot price overrides |
| Host earnings & withdrawal | Ledger, summary, withdrawal request |
| Host documents upload | national_id, yacht_ownership, yacht_license, insurance |
| Host become-host onboarding | Bio + document upload flow |
| Bidirectional reviews | Guest → host, host → guest; per booking |
| In-app and push notifications | Typed feed, owned device tokens, broadcast queue, Expo tickets/receipts |
| Admin dashboard | Platform stats (revenue, bookings, pending items) |
| Admin: user management | List, role change |
| Admin: yacht moderation | Approve, reject, request changes, suspend |
| Admin: host verification | Approve/reject host applications |
| Admin: withdrawal processing | Mark paid/rejected; shows host bank details |
| Admin: review moderation | Approve, reject, hide |
| Admin: document review | Approve/reject host documents |
| Admin: audit log | Full admin action trail |
| Admin: content management | Categories, add-ons, booking templates, example photos |
| WhatsApp support | Admin-configured durable number, public support config, and contextual mobile support actions |
| Agent-assisted production operations | Production-only Clerk invitations, typed marketplace setup, verified-host yacht drafts, atomic request IDs, and audit history |
| Publishing path routing | Mobile web at `/`, admin at `/marsa-admin/`, API at `/api/` |
| Security threat model and storage hardening | Threat model, header-only internal tokens, signed upload intents, owner-bound ACL finalization, and safe host-document URL handling |
| Admin: photographer requests | Scheduling workflow |
| File storage | GCS two-step signed upload |
| Exchange rate caching | EGP/USD live rate, cached in DB |
| Payment receipt in mobile | Receipt URL shown on booking detail screen |
| Booking history in mobile | Full payment history per booking |
| Host name + bank details on withdrawal (admin) | Shown on admin withdrawal card |
| Guest/host mode split | Separate five-tab interfaces with per-user remembered mode |
| Guest discovery home | Location/date search, disabled Buy — Soon seam, featured/most-booked rails |
| Matrix date selection | Shared accessible month grid in booking, Home search, and Explore filters; host calendar retained |
| Privacy Policy and Terms of Use | Public in-app readers plus pre-sign-up and profile navigation |
| MARSA identity system | Canonical logo, palette, and Marcellus/Hanken Grotesk/Space Mono/Tajawal typography across mobile and admin |
| Wishlist | Live-only saved yachts across Home, Explore, detail, and Wishlist |
| Managed locations | Admin activation/default/order plus host custom “Other” location |
| Cancellation policies | Dynamic immutable tiers, checkout snapshot, quote, durable admin processing |
| Admin unseen badges | Per-admin event counters cleared after successful section load |
| Yacht reactivation/featuring | Admin controls with audit logs and host notification |

### 🔲 Proposed / pending tasks

| Task # | Feature | Status | Notes |
|--------|---------|--------|-------|
| #12 | Fix mobile bookings screen crashes | PROPOSED | |
| #13 | Fix host bookings 500 error | PROPOSED | |
| #14 | Add search and filtering to admin yacht and host lists | PROPOSED | |
| #17 | Scheduled job to auto-release host earnings after 3 days | PROPOSED | Currently manual / 7-day policy |
| #19 | Add filters to withdrawals list (status, date range, amount) | PROPOSED | Admin side |
| #20 | Show booking receipt as shareable/downloadable PDF | PROPOSED | |
| #21 | Send guests an email receipt after booking is paid | PROPOSED | No email sending yet |
| #22 | Let hosts see per-booking earnings breakdown in mobile | PROPOSED | |

### ❌ Cancelled tasks

| Task # | Feature | Reason |
|--------|---------|--------|
| #23 | Let hosts add bank details when setting up profile | Cancelled |
| #24 | Make bank details copyable on admin withdrawal card | Cancelled |

### 🚧 Known limitations / not yet built

- No email sending (email receipts, booking confirmations) — Task #21
- Push cannot be tested in Expo web/Expo Go; use a configured native development build
- No photographer booking system (requests exist but scheduling is manual)
- Referral code system is scaffolded in DB but has no UI or logic
- No recurring availability rules — hosts set slots day-by-day
- Earnings auto-release is manual — Task #17 would automate this
- No boat-sale listings or owner sale-subscription portal yet; Buy remains disabled
- No multi-currency support beyond EGP/USD

---

*Last updated: August 21, 2026. See `replit.md` for quick-reference stack info and `replit.md > Gotchas` for Express/Drizzle-specific pitfalls.*
