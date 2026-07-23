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
| **Guest** | Browse yachts → pick a date/template → add extras → pay via Stripe → review the experience |
| **Host** | Apply to list → upload documents → add yachts → set availability & pricing → confirm/reject bookings → withdraw earnings |
| **Admin** | Approve/reject hosts and yachts → moderate reviews → process withdrawal requests → view platform stats and audit logs |

Prices are displayed in **EGP** (Egyptian Pound). Stripe charges are settled in **USD** using a live exchange rate fetched at booking time.

---

## 2. Repository Structure

```
artifacts-monorepo/
├── artifacts/
│   ├── api-server/          # Express 5 API (port from $PORT, default 8080)
│   ├── marsa-admin/         # React + Vite admin dashboard (path: /marsa-admin/)
│   ├── marsa-mobile/        # Expo React Native mobile app (path: /marsa-mobile/)
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
| Auth | Clerk (Google OAuth + Email/Password via Future/signal API) |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4, `drizzle-zod` |
| API contract | OpenAPI 3.1 → Orval codegen → React Query hooks + Zod schemas |
| Payments | Stripe (PaymentIntents in USD; displayed in EGP) |
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
| `VITE_CLERK_PUBLISHABLE_KEY` | Admin (Vite build) | Same Clerk key for browser |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | API server | GCS bucket ID |
| `PRIVATE_OBJECT_DIR` | API server | Private object storage prefix |
| `PUBLIC_OBJECT_SEARCH_PATHS` | API server | Public object storage search paths |
| `SESSION_SECRET` | API server | Session signing secret |
| `STRIPE_SECRET_KEY` | API server | Stripe secret key (via Replit connector) |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Mobile | Injected at dev time from `$CLERK_PUBLISHABLE_KEY` |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Mobile | Stripe publishable key for client |

All secrets are managed through Replit Secrets (never committed to code).

### First-time setup

```bash
# Install all workspace dependencies
pnpm install

# Push the DB schema to the database (dev only — uses DATABASE_URL)
pnpm --filter @workspace/db run push

# Seed the database with booking templates, categories, add-ons, and example photos
pnpm --filter @workspace/scripts run seed

# (Optional) Re-run API codegen if you changed the OpenAPI spec
pnpm --filter @workspace/api-spec run codegen
```

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
# Mobile: use $REPLIT_EXPO_DEV_DOMAIN
```

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

### Key schema details

#### `users`
```
id (PK, text/uuid) | clerkId (unique) | email | phone | fullName
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
| `POST` | `/api/auth/sync` | Clerk JWT | Sync Clerk user to local DB; creates user record on first login |
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
| `POST` | `/api/storage/uploads/finalize` | Required | Confirm upload and set ACL |

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
| `POST` | `/api/admin/yachts/:id/approve` | Approve a yacht (sets status → live) |
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

---

## 8. Mobile App (Expo)

**Package:** `@workspace/marsa-mobile`  
**Framework:** Expo SDK 54, expo-router v6, React Native 0.81  
**Path:** `/marsa-mobile/`

### Screen map

```
app/
├── index.tsx                    → Redirect: authenticated → /(home), unauthenticated → /(auth)
├── _layout.tsx                  → Root layout: ClerkProvider, QueryClientProvider, fonts
├── +not-found.tsx               → 404 screen
│
├── (auth)/
│   ├── _layout.tsx              → Auth stack layout
│   ├── sign-in.tsx              → Email/password sign-in + Google SSO
│   ├── sign-up.tsx              → Email/password sign-up + email verification
│   └── forgot-password.tsx      → Password reset (send code → verify → new password)
│
└── (home)/
    ├── _layout.tsx              → Authenticated root (header, notification bell)
    ├── notifications.tsx        → In-app notification list
    ├── profile.tsx              → Full profile edit screen
    ├── become-host.tsx          → Host application flow (bio, documents)
    ├── new-yacht.tsx            → Create a new yacht listing (host only)
    ├── book/[id].tsx            → Booking flow: pick template, date, add-ons, pay
    ├── booking/[id].tsx         → Booking detail + receipt (payment history, receipt PDF link)
    ├── review/[id].tsx          → Post-trip review submission
    ├── yacht/[id].tsx           → Public yacht detail page
    │
    └── (tabs)/
        ├── _layout.tsx          → Bottom tab bar (Explore, Bookings, Earnings, Yachts, Dashboard)
        ├── explore.tsx          → Yacht discovery (search, filters, map)
        ├── bookings.tsx         → My bookings list (guest + host views)
        ├── earnings.tsx         → Host earnings summary + withdrawal request
        ├── yachts.tsx           → Host's own yacht listings
        ├── dashboard.tsx        → Host dashboard (stats, quick actions)
        └── profile.tsx          → Quick profile tab (links to full edit)
```

### Key dependencies

| Package | Purpose |
|---------|---------|
| `@clerk/expo` v3.3 | Auth (Future/signal API — see gotchas) |
| `expo-secure-store` | Clerk token cache |
| `@tanstack/react-query` | Server state |
| `@workspace/api-client-react` | Generated API hooks |
| `@stripe/stripe-react-native` | Payment sheet (platform-specific stub for web) |
| `expo-image-picker` | Yacht photo upload |
| `react-native-reanimated` | Animations |
| `expo-router` v6 | File-based routing |

### Auth pattern (important)

Clerk Expo v3 uses the **Future/signal API**, not the legacy resource API. The `/legacy` import silently no-ops on Replit-managed Clerk. Always use:

```typescript
const { signIn } = useSignIn();
const { error } = await signIn.password({ identifier: email, password });
// Read status from the signal: signIn.status
if (signIn.status === "complete") { /* setActive and navigate */ }
```

See `.agents/memory/clerk-expo-v3-api.md` for the full canonical pattern.

### Stripe on mobile

`@stripe/stripe-react-native` cannot be bundled for web. The project uses platform-specific files:
- `StripeProvider.tsx` — re-exports the real Stripe provider (used on native)
- `StripeProvider.web.tsx` — no-op stub (used in web/Expo Go web builds)

The Stripe publishable key is fetched at runtime from `/api/payments/config` — not from a build-time env var.

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
| `Yachts.tsx` | `/yachts` | All yacht listings; approve / reject / request changes / suspend |
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
| `Cancellations.tsx` | `/cancellations` | Cancellation request review |
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
Users sign up with email/password or Google OAuth. Clerk issues JWTs.

### 2. `POST /api/auth/sync`
Called by clients after sign-in. Creates (or updates) the local `users` DB record from Clerk data. Must be called before any other authenticated request — otherwise `requireAuth` returns 401 "User not found."

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

1. Guest creates a booking → API calculates total in EGP
2. API fetches live EGP→USD rate (cached in `exchange_rates` table, refreshed if stale)
3. API converts EGP total to USD cents via `egpToUsdCents()` (`lib/exchange.ts`)
4. Stripe `PaymentIntents.create({ amount: usdCents, currency: "usd" })` is called
5. Client receives `clientSecret` → presents Stripe payment sheet
6. Stripe webhook `payment_intent.succeeded` fires → API marks booking `paid_under_review`
7. Host confirms → booking moves to `confirmed`
8. Booking completes → earnings ledger entry created (status: `pending`)
9. After hold period → earnings status → `available` → host can request withdrawal

### Platform fee

20% platform fee. Host earns 80% of total.

```typescript
const PLATFORM_FEE_PCT = 0.20;
const platformFeeEgp = totalAmount * PLATFORM_FEE_PCT;
const hostEarningsEgp = totalAmount - platformFeeEgp;
```

### Refunds

Rejected bookings trigger a Stripe refund via the `charge.refund` API. Refund records are stored in the `refunds` table.

### Stripe publishable key

The Stripe publishable key is **not** a build-time env var. Clients call `GET /api/payments/config` at runtime. This is because the key comes from the Replit Stripe connector and isn't available in `EXPO_PUBLIC_*` at build time.

---

## 12. File Storage

**Provider:** Google Cloud Storage (via `@google-cloud/storage`)  
**Pattern:** Two-step upload

1. Client calls `POST /api/storage/uploads/request-url` → receives a signed GCS upload URL
2. Client uploads directly to GCS
3. Client calls `POST /api/storage/uploads/finalize` → server moves the file, sets ACL (public or private), and returns the permanent URL

Relevant env vars: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`

---

## 13. Notifications

In-app only (no push notifications or email yet — see Task #21 in progress tracker).

- `notify()` helper in `lib/notify.ts` — call from any route handler
- Notifications are per-user, typed, with `relatedEntityType` / `relatedEntityId` for deep linking
- Mobile: notification bell in the home layout header → `notifications.tsx` screen

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
| Prices in EGP, Stripe in USD | El Gouna market uses EGP; Stripe Egypt support requires USD. Live rate fetched at booking time and stored on the booking for audit. |
| Roles additive, not exclusive | Hosts need to be able to book as guests. A single `role` column with `guest < host < admin` hierarchy would block this; the current enum + middleware check allows any role to access lower-tier endpoints. |
| Auth sync endpoint | Clerk is the identity source; we keep a local `users` table for FKs, roles, and profile data Clerk doesn't own. Sync is explicit (called by client after login) not implicit (webhook), to avoid cold-start race conditions. |
| Booking templates | Duration packages (e.g. "3-hour trip", "full day") are platform-wide and admin-managed. Hosts set a price per template. This lets the platform control the product surface while hosts set rates. |
| Availability as explicit slots | Hosts create explicit `availability_slots` (date + startTime + templateId). No automatic recurring logic. This is intentionally simple for MVP. |
| Drizzle `inArray` not `ANY` | `sql\`col = ANY(${array})\`` generates invalid SQL in Drizzle. Always use `inArray(col, array)` from `drizzle-orm`. |
| `@stripe/stripe-react-native` web stub | The native Stripe SDK cannot be bundled for web builds. A `.web.tsx` no-op file is resolved by the Metro bundler on web/Expo Go web. |

---

## 16. Known Gotchas & Pitfalls

1. **Clerk Expo Future API** — Import `useSignIn`, `useSignUp` from `@clerk/expo` (main export). The `/legacy` path silently no-ops on Replit-managed Clerk. Always read `signIn.status` from the signal after `await signIn.password(...)`.

2. **Express 5 syntax** — Wildcard routes: `/{*splat}`. Optional params: `{/:id}`. Async handlers must be typed `Promise<void>`.

3. **Drizzle ANY bug** — Use `inArray(col, array)` not `sql\`col = ANY(${array})\``.

4. **Router guard scoping** — Always scope `router.use(requireAuth)` to a path prefix like `router.use("/host", requireAuth)`. A path-less guard intercepts everything including public routes mounted later.

5. **Alert.alert in Replit canvas** — `Alert.alert()` is silently suppressed inside Replit's canvas iframe. Always use inline error state, never native alert dialogs.

6. **MARSA API response shapes** — Yacht list/detail responses return nested or string fields. Mobile screens must map them explicitly; never assume flat camelCase from the generated types.

7. **Codegen must re-run after spec changes** — Generated files are checked in but must be regenerated whenever `openapi.yaml` changes. Forgetting this causes type mismatches between the spec and the frontend.

8. **No `console.log` in server code** — Use `req.log` (Pino) in route handlers and the singleton `logger` for non-request code. `console.log` is never used in `artifacts/api-server/`.

9. **Typecheck, not build** — Verify packages with `pnpm --filter @workspace/<slug> run typecheck`, not `build`. `build` requires workflow-provided `PORT` and `BASE_PATH` env vars that aren't available in a plain shell.

10. **Stripe publishable key** — Not available at build time. Always fetch from `/api/payments/config` at runtime.

---

## 17. Progress Tracker

### ✅ Completed features

| Feature | Notes |
|---------|-------|
| User authentication (email/password + Google) | Clerk Expo Future API; sign-in, sign-up, forgot-password |
| Yacht browsing & search | Filter by category, capacity, date |
| Yacht detail page | Photos, templates, availability, reviews |
| Booking flow with Stripe payment | PaymentIntent in USD, displayed in EGP |
| Booking confirmation / rejection by host | With refund on rejection |
| Guest booking history | With booking detail and receipt |
| Host yacht management | Create, edit, photos, availability, pricing, submit for review |
| Host earnings & withdrawal | Ledger, summary, withdrawal request |
| Host documents upload | national_id, yacht_ownership, yacht_license, insurance |
| Host become-host onboarding | Bio + document upload flow |
| Bidirectional reviews | Guest → host, host → guest; per booking |
| In-app notifications | Typed, per-user, read/unread |
| Admin dashboard | Platform stats (revenue, bookings, pending items) |
| Admin: user management | List, role change |
| Admin: yacht moderation | Approve, reject, request changes, suspend |
| Admin: host verification | Approve/reject host applications |
| Admin: withdrawal processing | Mark paid/rejected; shows host bank details |
| Admin: review moderation | Approve, reject, hide |
| Admin: document review | Approve/reject host documents |
| Admin: audit log | Full admin action trail |
| Admin: content management | Categories, add-ons, booking templates, example photos |
| Admin: photographer requests | Scheduling workflow |
| File storage | GCS two-step signed upload |
| Exchange rate caching | EGP/USD live rate, cached in DB |
| Payment receipt in mobile | Receipt URL shown on booking detail screen |
| Booking history in mobile | Full payment history per booking |
| Host name + bank details on withdrawal (admin) | Shown on admin withdrawal card |

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
- No push notifications — only in-app
- No photographer booking system (requests exist but scheduling is manual)
- Referral code system is scaffolded in DB but has no UI or logic
- No recurring availability rules — hosts set slots day-by-day
- Earnings auto-release is manual — Task #17 would automate this
- No guest-facing cancellation policy display
- No multi-currency support beyond EGP/USD

---

*Last updated: July 2026. See `replit.md` for quick-reference stack info and `replit.md > Gotchas` for Express/Drizzle-specific pitfalls.*
