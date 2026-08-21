# Threat Model

## Project Overview

MARSA is a yacht-booking marketplace for Egypt. Guests search and book yachts; host applicants manage yachts, availability, documents, bookings, and earnings; admins moderate hosts, listings, cancellations, payments, and notifications. The production stack is an Express 5/TypeScript API, PostgreSQL/Drizzle, Clerk authentication, Google/Replit Object Storage, and React/Expo clients deployed on Replit.

## Assets

- **Clerk identities and sessions** -- compromise permits impersonation and access to bookings, profiles, and host/admin capabilities.
- **Booking, payment, earnings, and withdrawal state** -- affects reservations, money movement, availability, and host payouts.
- **Host verification documents and uploaded media** -- includes national IDs, licenses, insurance, yacht ownership evidence, and private files.
- **User and marketplace data** -- contact information, profiles, yacht listings, reviews, notifications, and audit records.
- **Application credentials** -- Clerk secret/proxy credentials, internal cron token, operator secret, database and payment-provider credentials.

## Trust Boundaries

- **Browser/mobile clients to API** -- clients and all request bodies, headers, URLs, and object identifiers are untrusted. Server-side authentication and object authorization are required.
- **API to PostgreSQL and Object Storage** -- ORM queries and storage ACL metadata protect private marketplace records and uploads; raw client paths must never confer access.
- **API to Clerk, payment providers, and Expo** -- external responses and webhook requests must be authenticated, bounded, and validated.
- **Guest/host to admin boundary** -- role is stored server-side; host approval, document review, moderation, withdrawals, and configuration require server-side admin checks.
- **Production to development boundary** -- dev shortcuts and test payments must not be reachable or enabled in production.

## Scan Anchors

- Production API entrypoint: `artifacts/api-server/src/app.ts` and `src/index.ts`; routes are mounted from `src/routes/index.ts`.
- Highest-risk areas: `src/routes/storage.ts`, `bookings.ts`, `host.ts`, `payments.ts`, admin/operator/internal routes, `src/middlewares/auth.ts`, and payment/webhook libraries.
- Public/authenticated/admin surfaces: health/discovery are public; user, host, booking, storage, payment, and notification routes are authenticated as applicable; `/admin/*` is role-gated; `/internal/*` and operator actions use service secrets.
- Static mobile server: `artifacts/marsa-mobile/server/serve.js`; it serves only the built Expo artifact and is separate from the API.
- Dev-only area: `src/routes/dev.ts` is mounted only when `NODE_ENV !== "production"`; test payment configuration must fail closed on published deployments.

## Threat Categories

### Spoofing

Clerk must validate the session JWT or supported session cookie before protected handlers run, and the local user must be resolved from the verified Clerk subject. Internal and operator endpoints must require their server-held secrets and use constant-time comparisons. Webhooks must verify provider signatures.

### Tampering and Elevation of Privilege

Every storage object, booking, yacht, host profile, withdrawal, payment, notification, and admin action must be authorized against the authenticated subject and the exact object or role. Client-supplied role, owner, tenant, price, payment, ACL, or object-path fields must not override server state. In particular, finalizing an upload must be bound to an upload issued to the same user, not just to an existing path.

### Information Disclosure

Private host documents, receipts, and user records must be returned only to their owner, an authorized participant, or an admin. Object identifiers are not authorization. Secrets must not be placed in client bundles, URLs, query strings, logs, or referrers. API responses and logs must avoid unnecessary PII and credential material.

### Stored Client-Side Injection

User-controlled URLs and text rendered by the admin or client applications must be constrained to safe schemes and trusted storage locations. Document review, profile images, listings, and other stored content must not create executable `javascript:` links, unsafe HTML, or deceptive navigation in an admin session.

### Denial of Service

Authentication and public endpoints need rate limits; upload metadata and content need size/type controls; database and external-service operations need bounded queries and timeouts. Scheduled internal jobs must be protected so arbitrary callers cannot trigger expensive or state-changing work.

### External Service and Webhook Integrity

Stripe/payment callbacks must be signature-verified in production. Outbound requests must use fixed provider destinations and timeouts. Clerk proxy headers and forwarded host/protocol data must not let an untrusted caller redirect privileged credentials to an attacker-controlled service.
