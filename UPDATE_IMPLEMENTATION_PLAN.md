# MARSA Marketplace Update Preparation Plan

## Purpose

This update prepares MARSA for a later boat-sales module while improving the
current rental product. The future sales module itself is not part of this
implementation.

The file `MARKETPLACE_UPDATE_IMPLEMENTATION_GUIDE.md` is the companion
file-by-file execution guide, including the Replit development-database prompt.

The current release will:

- Separate the guest and host mobile interfaces.
- Add a guest Home screen distinct from Explore.
- Add location-based discovery and admin-managed locations.
- Add wishlists.
- Replace bulk availability generation with a per-yacht calendar and
  per-slot pricing.
- Remove redundant platform-fee copy from the host listing flow.
- Keep suspended yachts out of all public discovery surfaces.
- Let admins reactivate suspended yachts.
- Add per-admin unseen-data badges.
- Add admin broadcast notifications with in-app and push delivery.
- Prepare notification delivery records for a future email channel.
- Add admin-managed, versioned cancellation-fee rules based on the exact time
  remaining before a trip starts.
- Disable Stripe without deleting its integration, dependencies, schema fields,
  webhook, or adapter code.
- Add a development-only testing payment gateway that completes bookings
  without charging a real payment method and can later be replaced by the
  selected production gateway.
- Add safe UI and API seams for separate future sale listings.

## Confirmed Product Decisions

1. Home and Explore are separate guest tabs.
2. Location rails combine admin-featured and most-booked yachts.
3. Each date may have multiple time slots with an individual price per slot.
4. Admin badges represent unseen activity and clear when that admin opens the
   corresponding page.
5. The app remembers the last selected guest or host mode.
6. Broadcasts send in-app and push notifications. Email is a future channel
   that must fit the same delivery architecture.
7. Sale listings are separate records. A host lists the boat again through
   the future sales web portal even if it already exists as a rental yacht.
8. Stripe is disabled, not removed. Existing Stripe code and data remain
   available behind a provider adapter for rollback or later reference.
9. Development uses a server-controlled testing gateway that performs no
   financial transaction. It must be visibly identified as test mode and must
   fail closed in production/Replit deployments.
10. Cancellation fees are configured by admins as time thresholds and
    percentages. Activated policy versions are immutable, and each new booking
    keeps the policy terms accepted at checkout so later edits are not
    retroactive.

## Current-State Findings

- Mobile currently uses one mixed tab bar. Hosts see guest and host tabs
  together.
- The server stores one permission role, but host users may still perform
  guest actions because guest booking routes require authentication rather
  than an exclusive guest role.
- Explore currently opens directly onto a full yacht list.
- Public yacht list and detail routes already require `status = live`.
  Suspended yachts are therefore excluded by the backend, but stale client
  caches still need focus-based refresh and regression tests.
- Availability currently generates slots for the next 60 days using selected
  weekdays and one start time.
- Pricing is stored per yacht and booking template, not per date/time slot.
- Yacht creation hardcodes the city to Gouna while accepting free-form
  location text.
- The listing form displays both the earnings calculator and a redundant 20%
  platform-fee message.
- The admin can suspend a yacht but has no reactivate action.
- Notifications are user-specific and in-app only.
- Booking creation, refunds, mobile checkout, receipts, and webhooks are
  coupled directly to Stripe. A provider boundary is required before Stripe
  can be disabled safely.
- Cancellation processing currently hardcodes a 5% fee and measures 24 hours
  from `booking.createdAt`. Both the API and admin UI duplicate that logic.
  The new policy engine must instead measure the interval from the cancellation
  request to the booked trip start.
- A cancellation request currently reopens the availability slot before admin
  approval/refund. The slot must remain reserved until cancellation processing
  succeeds.
- The current booking flow creates an external PaymentIntent before writing
  the booking and reserves the slot in separate statements. This is vulnerable
  to partial failure and concurrent double booking.
- The host yacht edit flow uses the public live-only yacht endpoint. A
  host-owned yacht detail endpoint is required for drafts and suspended
  listings.
- `lib/api-spec/openapi.yaml` is the API source of truth. Generated hooks and
  schemas must be regenerated after every contract change.

## Target Mobile Information Architecture

### Guest Mode

1. Home
2. Explore
3. Wishlist
4. Bookings
5. Profile

### Host Mode

1. Dashboard
2. Bookings
3. My Yachts
4. Earnings
5. Profile

The server role remains the authorization capability. The selected interface
mode is client state and never changes the user's permissions.

Suggested Expo Router structure:

```text
(home)/
  guest/
    (tabs)/
      home
      explore
      wishlist
      bookings
      profile
  host/
    (tabs)/
      dashboard
      bookings
      yachts
      earnings
      profile
  yacht/[id]
  book/[id]
  booking/[id]
  host-yacht/[id]/calendar
```

## Data Model Changes

### Locations

Create `locations`:

- `id`
- `name`
- `city`
- `country`
- `timeZone` as an IANA time-zone name; default `Africa/Cairo` for Gouna
- `slug`
- `isActive`
- `isDefault`
- `sortOrder`
- `createdAt`
- `updatedAt`

Add to yachts:

- `locationId`
- `customLocationName`
- Preserve the current marina/dock text during migration.

Seed `Gouna, Egypt` as the active default. Backfill existing yachts carefully
so seeded or real non-Gouna data is not silently reassigned.

### Wishlist

Create `wishlist_items`:

- `id`
- `userId`
- `yachtId`
- `createdAt`
- Unique `(userId, yachtId)`
- Cascade on user/yacht deletion

Suspended or otherwise non-live yachts remain associated internally but are
not returned to the public Wishlist screen.

### Availability and Slot Pricing

Extend availability slots with:

- `priceOverrideEgp`
- A state that can distinguish available, blocked, held/reserved, and booked
  behavior, or an equivalent server-computed editability model.
- Optional hold-expiry metadata if temporary payment holds are introduced.

The template price is the fallback. The slot override is used when present.
The effective price is copied into the booking record and never changes after
booking creation.

### Featured Yachts

Add rental-yacht featuring metadata:

- `isFeatured`
- `featuredSortOrder`
- Optional `featuredFrom`
- Optional `featuredUntil`

Admin-featured yachts are ordered first. Remaining rail positions are filled
with the most-booked yachts for the previous 90 days, deduplicated, with
rating/review count/newness as fallback ordering.

### Admin Unseen Activity

Create `admin_events`:

- `id`
- `sectionKey`
- `entityType`
- `entityId`
- `eventType`
- `occurredAt`
- Optional metadata

Create `admin_section_views`:

- `adminUserId`
- `sectionKey`
- `lastSeenAt`
- Unique `(adminUserId, sectionKey)`

An event is unseen independently for each administrator. Opening a page marks
that section seen only after its initial data request succeeds.

### Notification Campaigns and Push Delivery

Create:

- `notification_campaigns`
- `notification_deliveries`
- `user_push_tokens`

Campaigns store the title, message, audience, creator, status, and aggregate
delivery counts.

Deliveries store:

- Channel: `in_app`, `push`, or future `email`
- Status: pending, sent, failed
- Attempt count
- Provider reference
- Last error
- Created/sent timestamps

Push tokens are stored per user/device and deactivated when the provider
reports that a token is invalid.

### Payment Provider Transition

Keep the existing Stripe-specific columns for backward compatibility and add
provider-neutral payment metadata:

- `payments.provider`
- `payments.providerPaymentId`
- `payments.providerMetadata`
- `payments.isTest`
- `payments.succeededAt`
- `refunds.provider`
- `refunds.providerRefundId`
- `refunds.isTest`

Stripe remains implemented as a disabled adapter. Add a testing adapter that
creates successful test payment records without contacting an external
service. Test payments use EGP only, leave USD/exchange-rate values nullable,
and continue through the normal booking, host-confirmation, rejection,
notification, audit, and accounting state machines.

The testing gateway is development-only. If `NODE_ENV=production` or
`REPLIT_DEPLOYMENT=1`, selecting the testing gateway must make checkout
unavailable rather than silently approving free public bookings.

### Cancellation Policies and Requests

Add four tables without changing the existing `bookings` table:

1. `cancellation_policies`
   - `id`, `name`, globally unique `version`
   - `status`: `draft`, `active`, or `retired`
   - `createdBy`, `activatedAt`, `retiredAt`, `createdAt`, `updatedAt`
   - A partial unique constraint permits only one active policy.
2. `cancellation_policy_rules`
   - `id`, `policyId`
   - `minimumMinutesBeforeTrip`
   - `feePercentage`
   - `createdAt`, `updatedAt`
   - Unique `(policyId, minimumMinutesBeforeTrip)`.
3. `booking_cancellation_terms`
   - One row per new booking.
   - Stores `bookingId`, policy identity/version/name, an immutable JSON rule
     snapshot, the trip start instant, its IANA time zone, and `acceptedAt`.
4. `booking_cancellations`
   - Stores each request, requester/reason/time, previous booking status,
     trip-start and remaining-minutes snapshots, matched policy/rule,
     percentage, original amount, fee, refund, review state, reviewer, and
     resulting refund reference.

The admin enters thresholds in hours or days; the server stores whole minutes
to avoid decimal/time-boundary ambiguity. Rules are sorted from the largest
threshold down and the first rule whose
`remainingMinutes >= minimumMinutesBeforeTrip` matches. A zero-minute rule is
required as the catch-all. For illustration only, thresholds of 48h/5%,
24h/20%, and 0h/50% mean:

- At least 48 hours remaining: 5%.
- At least 24 but less than 48 hours: 20%.
- From trip start up to less than 24 hours: 50%.

Those percentages are examples and must not be seeded as real business policy.
Cancellation after the trip starts is rejected unless a separate audited admin
override is deliberately implemented.

An active policy is never edited in place. Admin changes create a new draft
version, validate it, and activate it transactionally while retiring the
previous active version. Existing bookings continue using their stored terms.
Legacy bookings with no snapshot are flagged for manual review; no policy or
fee is invented retroactively.

## API Contract Changes

All contracts are added to `lib/api-spec/openapi.yaml` first. Request bodies
use named component schemas. Avoid path-plus-query endpoint shapes that cause
the documented Orval collision.

### Locations

- `GET /locations`
- `GET /admin/locations`
- `POST /admin/locations`
- `PATCH /admin/locations/{id}`
- `POST /admin/locations/{id}/deactivate`

Referenced locations are deactivated rather than hard-deleted.

### Discovery

- Add `locationId` and `intent` to yacht search.
- Add `GET /discovery/home`.
- Return bounded location groups containing card-ready rental listings.
- Add a neutral `DiscoveryListing` DTO with `listingType = rental_yacht` for
  the current release.
- The future sales service can later return `sale_listing` records through
  the same discovery surface.

### Wishlist

- `GET /wishlist`
- `GET /wishlist/ids`
- `POST /wishlist/{yachtId}`
- `DELETE /wishlist/{yachtId}`

### Host Yacht and Calendar

- Add a host-owned yacht detail endpoint.
- Add a query-only host availability endpoint using `yachtId`, `from`, and
  `to`.
- Extend availability batch inputs with slot price overrides.
- Prevent edits to slots referenced by active bookings.
- Make booking slot reservation atomic.
- Use the slot override when calculating the booking price.

### Admin Yacht Actions

- Add `POST /admin/yachts/{id}/reactivate`.
- Require current status to be `suspended`.
- Restore status to `live`.
- Record an audit log and notify the host.
- Add feature/unfeature and featured-order controls.

### Admin Activity

- `GET /admin/activity/unseen-counts`
- `POST /admin/activity/sections/{sectionKey}/seen`

The admin app polls counts at a moderate interval and refreshes after relevant
mutations.

### Broadcasts and Push Tokens

- `POST /push-tokens`
- `DELETE /push-tokens/{id}` or an equivalent device-token deactivation route
- `GET /admin/notification-campaigns`
- `POST /admin/notification-campaigns`
- `GET /admin/notification-campaigns/{id}`

Campaign creation writes in-app notifications and durable push deliveries.
Push delivery runs in bounded batches, records provider receipts, retries
temporary failures, and deactivates invalid tokens.

### Payments

- Replace Stripe-specific wording in the booking contract with a
  provider-neutral payment action.
- Change `POST /bookings` to accept a concrete `slotId`; date, time, yacht, and
  template are revalidated on the server.
- Return `gateway`, `testMode`, and `paymentAction` from booking creation.
- Keep `clientSecret` only as an optional Stripe-adapter field.
- Make `/payments/config` return the selected gateway and availability instead
  of assuming a Stripe publishable key.
- Route create, refund, and status behavior through a `PaymentGateway`
  interface.
- Keep `/webhooks/stripe` mounted but inactive unless the Stripe adapter is
  selected and configured.
- Reserve the slot, create the booking, create the payment row, snapshot
  prices, and write add-on rows atomically.

### Cancellation Policies

- `GET /cancellation-policy/current`
- `GET /bookings/{id}/cancellation-quote`
- Extend `POST /bookings/{id}/cancel` to require the accepted rule/quote and
  return the server-calculated fee/refund.
- `GET /admin/cancellation-policies`
- `POST /admin/cancellation-policies`
- `PATCH /admin/cancellation-policies/{id}` for drafts only
- `PUT /admin/cancellation-policies/{id}/rules` for drafts only
- `POST /admin/cancellation-policies/{id}/activate`
- `GET /admin/cancellations`
- `POST /admin/cancellations/{id}/process`

At booking creation, the API copies the active policy and rules into
`booking_cancellation_terms` in the same transaction as the booking. Checkout
must not proceed if no active policy is configured. A quote is always computed
server-side from the booking snapshot, trip start, request time, and total EGP
amount. If the quote crosses a rule boundary between preview and confirmation,
the server returns `409` with the new quote and requires confirmation again.

## Guest Mobile Work

### Home

Build an Airbnb-style search card containing:

- Location
- Date
- Rent/Buy intent
- Rent selected by default
- Disabled `Buy - Soon`
- Search CTA

Submitting navigates to Explore with typed route parameters.

Below the search card, render one horizontal rail per location. Each rail:

1. Adds active admin-featured yachts in configured order.
2. Fills remaining positions with most-booked yachts from the last 90 days.
3. Removes duplicates.
4. Falls back to rating, review count, and newest.

### Explore

- Consume Home route parameters.
- Keep advanced filters and sorting.
- Add location filtering.
- Refresh when the screen regains focus.
- Display date-specific effective prices when a date is selected.
- Never render non-live listings.

### Wishlist

- Add a dedicated guest tab.
- Add optimistic heart actions to Home, Explore, Wishlist, and yacht detail.
- Roll back optimistic state on API failure.
- Include loading, empty, error, and offline-friendly states.

### Testing Checkout

- Replace Stripe-specific checkout copy with provider-neutral language.
- When the server reports the testing gateway, show a persistent
  `Test mode - no real payment will be charged` notice.
- The final action is `Confirm test booking`, not `Pay`.
- Never collect or render fake card details.
- Treat success only as the server response from the testing adapter; the
  client cannot choose or claim payment status.
- Label booking receipts and history entries as test payments and omit Stripe
  receipt links.
- Preserve the existing native Stripe sheet integration behind the disabled
  Stripe adapter so it can be re-enabled without reconstructing it.

### Cancellation Disclosure and Quote

- Show the accepted cancellation tiers on the booking review screen before the
  final booking action.
- On booking detail, open a cancellation modal that fetches a fresh server
  quote and shows the trip start, remaining time, matched tier, fee amount, and
  refund amount.
- Require an explicit confirmation against that quote before creating the
  cancellation request.
- If the server returns a changed quote at a threshold boundary, replace the
  modal values and require confirmation again.
- Show a manual-review message for a legacy booking with no policy snapshot.
- Do not use `Alert.alert` for the critical confirmation because Replit canvas
  suppresses alerts.

## Guest/Host Mode Split

Create an app-mode context containing:

- `mode`
- `canUseHostMode`
- `switchToGuest`
- `switchToHost`
- hydration/loading state

Persist the selected mode in AsyncStorage under a key namespaced by the Clerk
user ID. On startup, restore Host mode only if the user still has host
capability; otherwise fall back to Guest.

Host routes must have their own permission guard. Switching modes resets
navigation to Guest Home or Host Dashboard so no incompatible history remains.

## Host Calendar and Listing Flow

Create a reusable per-yacht calendar:

- Month navigation
- Date indicators for availability and bookings
- Multiple slots per day
- Template selection per slot
- Start time per slot
- Individual price per slot
- Template-price fallback
- Copy-day and bulk-date actions
- Clear status styling for available, booked, blocked, and past slots
- Confirmation before destructive bulk updates
- Server rejection when a booked slot is edited

Use this same component in the new-yacht flow after the draft exists and from
My Yachts for ongoing management.

Remove the explicit “MARSA takes a 20% platform fee” sentence from the listing
pricing step. Keep the real-time “You receive EGP X” calculation. All official
fee calculations remain server-side.

## Admin Web Work

Use the existing shadcn/Radix components.

Add:

- Locations page with CRUD, activation, default selection, and ordering.
- Cancellation Policy page with draft rule editing, validation, activation,
  version history, and a read-only view of retired policies.
- Broadcast Notifications page with preview, confirmation, recipient count,
  send action, and campaign history.
- Per-section unseen badges in the sidebar.
- Reactivate action for suspended yachts.
- Featured toggle, ordering, and optional date window on yachts.

Admin badges hide when zero and include accessible text. Mark a section seen
only after its initial data fetch succeeds.

The Cancellations page must display fee/refund values returned by the API and
must never recalculate them in React. Processing a cancellation keeps the slot
reserved while a provider-aware refund is attempted. Only a successful refund
and database transaction may mark the booking cancelled and reopen the slot.

## Push Notification Work

- Add `expo-notifications` using the Expo SDK-compatible version.
- Request permission with clear user-facing context.
- Register and refresh a device push token.
- Store platform/device metadata.
- Deep-link supported notifications to related app screens.
- Send broadcast pushes in bounded provider batches.
- Record delivery results and retry transient failures.
- Deactivate invalid tokens.
- Keep `email` as a supported delivery channel in the data model but disabled
  until an email provider and templates are selected.

## Replit Compatibility Requirements

- Preserve the existing multi-artifact layout, `.replit` port mappings,
  `BASE_PATH` behavior, Replit Vite plugins, Expo build/serve scripts, object
  storage integration, and Replit-provided domain variables.
- Keep Replit and local configuration environment-driven; never hardcode
  localhost or a Replit development domain in shared application code.
- Keep Stripe packages, connector metadata, webhook routes, and legacy columns
  while making the selected gateway configurable.
- Do not require Stripe secrets when the testing gateway is selected.
- Never enable the test-bypass gateway in a published Replit deployment.
- Apply database work additively to the Replit development database first,
  run an idempotent backfill, verify counts and constraints, and only then
  promote the schema through Replit's production publishing workflow.
- Do not place `.env` files or secret values in Git. Replit continues to use
  Secrets; local development continues to use ignored `.env` files.
- Run OpenAPI code generation before starting any frontend change that depends
  on a modified contract.

## Future Sale Module Boundary

Do not add sale fields to rental yachts.

Future tables are expected to include:

- `sale_listings`
- `seller_subscriptions`
- `sale_inquiries`

Sale listings are created independently in the future web portal. A boat may
therefore have both a rental yacht record and a separate sale-listing record.
Current mobile preparation is limited to:

- Rent/Buy search intent
- Disabled Buy UI
- Neutral discovery-card/response types
- Listing-type-specific rendering seams

## Implementation Order

1. Create a feature branch and run baseline tests/typechecks.
2. Add payment-provider configuration and a provider-neutral interface.
3. Move the current Stripe logic behind a disabled Stripe adapter.
4. Add the development-only testing gateway and production fail-closed guard.
5. Add location, wishlist, slot-pricing, featured-yacht, payment metadata,
   cancellation-policy/terms/request, admin-event, campaign, delivery, and
   push-token schemas.
6. Push additive schema changes to a disposable/local database.
7. Run the idempotent location and payment metadata backfill.
8. Update OpenAPI with provider-neutral payment contracts and all new APIs.
9. Regenerate API clients and Zod schemas.
10. Implement the cancellation policy engine, draft/activation rules, and
    immutable booking-term snapshots.
11. Refactor booking creation into an atomic reservation/payment/terms
    transaction.
12. Implement cancellation quote/request processing and provider-aware
    cancellation/rejection refunds; regression-test
    existing Stripe records.
13. Implement location and discovery APIs.
14. Implement wishlist APIs.
15. Implement host-owned yacht detail and calendar APIs.
16. Implement admin unseen-event tracking.
17. Implement reactivation and featured-yacht controls.
18. Implement notification campaigns and durable push delivery.
19. Split mobile guest and host routing.
20. Add persisted mode switching.
21. Build Guest Home and connect it to Explore.
22. Add Wishlist UI and heart controls.
23. Build the reusable host calendar.
24. Update the yacht listing flow and remove redundant fee copy.
25. Replace mobile Stripe-first checkout with gateway-aware test checkout
    while retaining the disabled native Stripe adapter.
26. Add mobile policy disclosure and cancellation quote/confirmation.
27. Add admin Locations, Cancellation Policy, and Broadcast pages.
28. Update admin cancellation processing to use server-calculated values.
29. Add unseen badges, featured controls, and Reactivate action.
30. Apply and verify the schema on Replit's development database.
31. Run local, Expo web, native-development-build, admin, API, and Replit
    workflow smoke tests.
32. Update `DEVELOPERS.md`, environment templates, and the progress tracker.

## Verification

### Backend

- Non-live yachts never appear through public discovery/detail APIs.
- Reactivating a suspended yacht restores public visibility.
- Wishlist uniqueness and ownership are enforced.
- Suspended wishlist items are hidden.
- Inactive locations cannot be selected for new listings.
- “Other” requires a custom location.
- Slot overrides win over template prices.
- Existing bookings retain their original price.
- Booked slots cannot be reopened by the host.
- Concurrent requests cannot reserve one slot twice.
- The testing gateway creates no external charge, writes a test payment row,
  and moves the booking to `paid_under_review` through server logic.
- The testing gateway is unavailable whenever `NODE_ENV=production` or
  `REPLIT_DEPLOYMENT=1`.
- Stripe secrets are not read and Stripe network calls are not made while the
  testing gateway is selected.
- Existing Stripe payments, refunds, receipts, and webhook records remain
  readable after the provider-neutral schema change.
- Rejecting a test-paid booking creates a logical test refund, restores the
  slot safely, and never calls Stripe.
- Cancellation rules match exactly at every configured minute threshold.
- Fees are computed from cancellation request time to trip start in the
  location's IANA time zone, never from booking creation time.
- Activating a new policy does not change an existing booking's terms.
- A cancellation request does not reopen its slot before successful approval
  and refund processing.
- Fee and refund use integer-piaster arithmetic and always reconcile to the
  original paid EGP amount.
- Legacy bookings with no snapshot never receive an invented automatic fee.
- Admin unseen state is independent per administrator.
- Broadcast recipients receive exactly one in-app notification and one push
  delivery attempt per active device token.

### Mobile

- The stored interface mode is restored safely.
- Guest and host tabs never appear together.
- Home passes filters to Explore.
- Buy is visibly disabled and cannot issue a request.
- Wishlist state remains consistent across all screens.
- Calendar supports multiple differently priced slots on one date.
- Suspended yachts disappear after focus/refresh.
- Test checkout is clearly labelled, collects no card data, and cannot be
  activated by a client-side flag.
- Stripe-specific success and security copy is hidden when Stripe is disabled.
- Booking review discloses the exact policy snapshot being accepted.
- Cancellation confirmation displays a fresh server quote and handles a
  threshold-crossing `409` without submitting stale values.

### Admin

- Draft cancellation rules reject duplicate/negative thresholds and fee
  percentages outside 0-100.
- Policy activation requires a zero-minute catch-all and only one policy can be
  active.
- Active/retired policy versions are read-only.
- The Cancellations page renders server amounts and never duplicates the fee
  formula client-side.

### Replit

- A clean Git sync followed by `pnpm install --frozen-lockfile` succeeds.
- API, admin, and Expo workflows retain their existing ports and base paths.
- Replit Secrets supply configuration without committed `.env` files.
- The development database backfill can be run repeatedly without duplicates.
- Development schema counts and constraints pass before any production
  promotion.
- A published deployment never exposes the test-bypass checkout.

### Commands

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run backfill:marketplace-update
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/marsa-admin run typecheck
pnpm --filter @workspace/marsa-mobile run typecheck
pnpm --filter @workspace/marsa-mobile exec expo install --check
pnpm --filter @workspace/marsa-mobile exec expo export --platform web
pnpm run typecheck
```
