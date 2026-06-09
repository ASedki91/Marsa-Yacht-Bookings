# Yacht Booking Marketplace MVP PRD

## Product overview

This product is a mobile-first yacht booking marketplace focused on Gouna, Egypt for the initial launch, with future expansion to additional cities after validating the MVP model.[cite:2] The marketplace connects guests who want to book yachts with hosts who submit yachts for listing, while admins control trust, approvals, support, cancellations, and payouts.[cite:2][cite:5]

The MVP uses an admin-controlled operating model rather than a fully automated marketplace. Guests pay at checkout, hosts submit listings and documents for approval, and admins review bookings, listings, refunds, and withdrawal requests before the marketplace advances critical actions.[cite:5][cite:6]

## Goals and non-goals

### Goals

- Launch an English-only cross-platform mobile app for guests and hosts using Expo React Native.[cite:2][cite:3][cite:13]
- Enable yacht discovery, fixed-template booking, immediate payment, admin review, and post-trip host payout requests.[cite:2][cite:5][cite:6]
- Keep operational control with admins during the MVP to reduce fraud, bad listings, payout risk, and support complexity.[cite:5][cite:12]
- Establish a backend and data model that can later support more cities, more vessel categories, Arabic language, and more payment gateways.[cite:2][cite:5]

### Non-goals

- In-app chat between guests and hosts is out of scope for the MVP; communication is routed through admin phone and WhatsApp channels.[cite:2]
- Dynamic pricing, captain or crew options, host-defined add-ons, bareboat rentals, and multi-country launch are out of scope for the MVP.[cite:2]
- Automated payouts are out of scope for the MVP; payout review remains manual even though Stripe supports broader marketplace payout tooling.[cite:12][cite:35]

## Users and roles

### Guest

A guest browses live yacht listings, selects a booking template and available slot, enters contact details, pays immediately, and waits for admin review before the booking becomes fully confirmed.[cite:2][cite:6] Guests can later review hosts after completed trips, and hosts can also review guests after completed trips.[cite:2]

### Host

A host creates an account, uploads verification documents, submits yacht details, defines pricing for approved booking templates, and manages yacht availability slots.[cite:2] Hosts cannot publish directly to the marketplace; listings stay under admin control until approved and made live.[cite:2]

### Admin

Admins are the operational core of the MVP. They review host documents, edit and approve listings, review paid bookings, manage cancellations, trigger auto-refunds on rejected bookings, manage add-ons and categories, moderate reviews, and approve manual host withdrawal requests after the eligibility delay.[cite:5][cite:12][cite:35]

## Launch scope

The launch city is Gouna, Egypt, and the marketplace begins with yacht listings only.[cite:2] More cities and categories can be added later through the admin dashboard without changing the basic marketplace model.[cite:2]

The app starts in English only. Arabic is intentionally deferred until the MVP proves demand and operations are stable enough to support localization work.[cite:2]

## Booking model

The marketplace uses fixed admin-defined booking templates rather than unlimited custom trip definitions. Recommended starter templates are 2-hour, 4-hour, 6-hour, 8-hour, and full-day experiences, with each host attaching prices and available dates or times to the templates they support.[cite:2]

Guests choose a yacht, then pick a template, date, and start time from available slots. The system calculates the base trip price for that template and slot, then sends the guest into payment immediately.[cite:2][cite:6]

Because the payment happens before final approval, the booking is not treated as confirmed immediately after checkout. Instead, payment success moves the booking into an admin review stage, and only approved bookings become confirmed.[cite:6][cite:8]

## Payment and payout model

The MVP uses Stripe first, integrated through the official Expo-compatible Stripe React Native SDK and a backend that creates PaymentIntents for checkout.[cite:13][cite:16][cite:28] Stripe’s PaymentIntents API is designed for payment flows whose status changes through confirmation and later updates, which fits the booking lifecycle for this marketplace.[cite:8][cite:20]

Guests pay the full booking amount immediately. The platform takes a 20% fee, and the remaining 80% becomes the host’s net earnings once the booking is completed and later cleared for payout eligibility.[cite:2][cite:35]

Host payouts are not automatic in the MVP. After the trip is completed, a 3-day holding period must pass before the host can request a withdrawal, and then an admin manually reviews and processes the payout request.[cite:2][cite:5][cite:12]

## Refund and cancellation rules

If an admin rejects a paid booking, the system should automatically issue a refund through Stripe rather than relying on manual customer support handling.[cite:22][cite:23] Stripe supports programmatic refunds through its Refunds API, which makes this auto-refund behavior practical for the MVP backend.[cite:22][cite:23]

For cancellations requested less than 24 hours before the booked time, the current marketplace rule is a 5% cancellation charge, with the case handled through admin review rather than a fully self-serve guest cancellation flow.[cite:2] This keeps exceptions, disputes, and edge cases under manual control while the marketplace is still early.[cite:2][cite:5]

## Communication and support

The MVP does not expose host phone numbers directly to guests. Instead, guest communication after booking is routed through the app’s admin phone and WhatsApp contact channels.[cite:2]

This approach reduces host privacy concerns, helps admins manage disputes and logistics centrally, and matches the product’s curated marketplace positioning during launch.[cite:2][cite:5]

## Trust and verification

Host verification is required before a listing can go live. Hosts upload documents inside the app, and admins review those documents before approval.[cite:2]

Recommended MVP host documents are national ID, yacht ownership proof, yacht license, and optional insurance documentation. Guest verification remains optional for now, which lowers friction for early growth while preserving the option to add stronger risk checks later.[cite:2]

## Features in scope

### Guest app

- Sign up, sign in, and profile management.[cite:2]
- Browse and search yachts in Gouna.[cite:2]
- Filter by date, price range, capacity, and booking template.[cite:2][cite:1]
- View yacht details including photos, price, specs, and reviews.[cite:1]
- Select booking template, date, start time, and guest count.[cite:2][cite:1]
- Checkout with Stripe Payment Sheet.[cite:13][cite:28]
- View booking status and history.[cite:2]
- Submit reviews after completed trips.[cite:2]

### Host app

- Host registration and onboarding.[cite:2]
- Verification document upload.[cite:2]
- Create and edit yacht listings.[cite:2]
- Add yacht photos, specs, template pricing, and availability.[cite:1][cite:2]
- View bookings and statuses.[cite:2]
- View earnings and request withdrawals.[cite:2][cite:5]

### Admin dashboard

- Host document review and approval.[cite:2]
- Listing edit, approval, rejection, and suspension.[cite:2]
- Booking review and confirmation or rejection.[cite:2]
- Auto-refund execution and cancellation handling.[cite:22][cite:23]
- Category and add-on management.[cite:2]
- Review moderation.[cite:2]
- Withdrawal request review and payout tracking.[cite:5][cite:12]
- Support and audit logging.[cite:5]

## Functional requirements

### Guest journey

1. The guest opens the app and browses yachts available in Gouna.[cite:2]
2. The guest filters listings and opens a yacht details page.[cite:1][cite:2]
3. The guest chooses a booking template, date, and available start time.[cite:2]
4. The guest enters required details such as full name, phone, email, nationality, and any special request notes.[cite:2]
5. The app creates a booking draft and backend PaymentIntent, then opens Stripe Payment Sheet in the app.[cite:13][cite:28][cite:6]
6. After successful payment, the booking becomes `Paid - Under Review` until admin decision.[cite:8][cite:20]
7. If approved, the booking becomes `Confirmed`; if rejected, the system issues an automatic refund and marks the booking `Rejected - Refunded`.[cite:22][cite:23]

### Host journey

1. The host signs up and applies as a host.[cite:2]
2. The host uploads verification documents in the app.[cite:2]
3. The host creates or edits a yacht listing with boat information, location, features, photos, and pricing linked to booking templates.[cite:1][cite:2]
4. The host sets available date and time slots for supported templates.[cite:2]
5. The listing goes to `Pending Review` until admin action.[cite:2]
6. After completed trips and the 3-day holding period, the host can submit a withdrawal request.[cite:2][cite:5][cite:12]

### Admin journey

1. The admin reviews host accounts and uploaded verification documents.[cite:2]
2. The admin edits, approves, rejects, or suspends listings.[cite:2]
3. The admin reviews bookings after payment succeeds.[cite:2][cite:6]
4. The admin confirms bookings or rejects them, which triggers automatic refund behavior.[cite:22][cite:23]
5. The admin reviews cancellations, support issues, reviews, and payout requests.[cite:2][cite:5][cite:12]

## Status model

### Listing statuses

- Draft
- Pending Review
- Changes Requested
- Approved
- Live
- Rejected
- Suspended

### Booking statuses

- Pending Payment
- Paid - Under Review
- Confirmed
- Rejected - Refunded
- Cancel Requested
- Cancelled
- Completed
- Closed

### Payment statuses

- Created
- Succeeded
- Refund Pending
- Refunded
- Failed

### Payout statuses

- Not Eligible
- Eligible
- Withdrawal Requested
- Under Review
- Paid
- Rejected

These explicit statuses align well with Stripe’s payment and refund state transitions and reduce ambiguity inside admin-heavy operations.[cite:8][cite:22][cite:23]

## Data model

The core entities for the MVP are:

- Users
- Guest Profiles
- Host Profiles
- Admin Users
- Host Documents
- Yachts
- Yacht Photos
- Booking Templates
- Yacht Template Pricing
- Availability Slots
- Bookings
- Payments
- Refunds
- Reviews
- Add-ons
- Withdrawal Requests
- Payouts
- Categories
- Audit Logs

The schema should preserve financial traceability from booking to payment to refund to payout. Stripe object IDs such as PaymentIntent IDs, Refund IDs, and connected account IDs should be stored for reconciliation and support workflows.[cite:8][cite:22][cite:35]

## Screen map

### Mobile app screens

- Splash / onboarding
- Login / signup
- Guest home
- Search and filters
- Yacht detail
- Booking template selector
- Checkout and payment
- Booking confirmation / status
- My bookings
- Profile
- Host onboarding
- Host document upload
- Add / edit yacht
- Availability manager
- Earnings and withdrawal request
- Reviews

### Admin web screens

- Login
- Dashboard overview
- Host verification queue
- Listings moderation
- Booking approval queue
- Refund and cancellation management
- Categories and add-ons manager
- Reviews moderation
- Withdrawal review
- Audit log
- Support management

## Technical architecture

The recommended architecture is a cross-platform Expo React Native mobile app for guests and hosts, a separate web admin panel, and a backend API that handles authentication, listings, bookings, payments, refunds, and payouts.[cite:2][cite:3][cite:13]

Stripe integration should follow a secure split between client and server responsibilities. The app uses the publishable key and Payment Sheet, while the backend uses secret-key operations for PaymentIntent creation, refund creation, webhook handling, and marketplace payout logic.[cite:6][cite:13][cite:28]

## Notifications

The MVP should support at least these notification events:

- Booking paid and awaiting review.
- Booking confirmed.
- Booking rejected and refunded.
- Cancellation request received.
- Listing approved or rejected.
- Withdrawal request submitted.
- Withdrawal approved or rejected.
- Review received.

Push notifications, email, and admin-triggered WhatsApp outreach can be layered gradually, but the event system should be designed from the start.[cite:2]

## Analytics and admin reporting

The admin dashboard should track:

- Total live yachts.
- Total bookings.
- Paid vs confirmed bookings.
- Rejected and refunded bookings.
- Gross booking value.
- Platform fee revenue.
- Host payout liability.
- Cancellation counts.
- Top-performing yachts.

These metrics are important because the MVP is operationally managed, so the business needs visibility into approval rates, refund rates, payout backlog, and listing quality early.[cite:5][cite:12]

## Security and compliance requirements

Sensitive financial operations such as PaymentIntent creation, refunds, and payout handling must remain server-side and never be embedded directly in the mobile app.[cite:6][cite:8] Payment collection should rely on Stripe’s SDK and Payment Sheet so raw card data is handled through Stripe rather than custom app forms.[cite:13][cite:28]

Host documents and identity data should be stored securely with access restricted to admins who handle verification reviews. Audit logs should record who changed a listing, approved a booking, issued a refund, or approved a payout request.[cite:2][cite:5]

## Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Guests pay before admin confirmation | Can reduce trust if UX is unclear | Show clear message that payment is taken now and refunded automatically if rejected.[cite:22][cite:23] |
| High manual workload on admins | Admin sits in the critical path for many actions | Keep launch city narrow, start with yachts only, and use templates to reduce operational complexity.[cite:2][cite:5] |
| Fraud or low-quality host listings | Marketplace trust can fail early | Require host document upload and admin approval before listings go live.[cite:2] |
| Payout disputes | Manual payout operations can create confusion | Use explicit hold rules, payout eligibility dates, and audit logs.[cite:5][cite:12] |
| Complicated customization too early | Slows MVP delivery | Keep pricing base-only, keep add-ons admin-managed, and skip captain/crew flows in v1.[cite:2] |

## Development phases

### Phase 1: Foundation

- Auth and role system.
- Core database schema.
- Admin permissions.
- Host onboarding and document upload.[cite:2]

### Phase 2: Supply side

- Yacht CRUD.
- Photo upload.
- Booking templates.
- Template pricing.
- Availability management.
- Listing moderation.[cite:1][cite:2]

### Phase 3: Demand side

- Guest browse and filters.
- Yacht details.
- Booking flow.
- Profile and bookings list.[cite:1][cite:2]

### Phase 4: Payments

- PaymentIntent backend.
- Stripe Payment Sheet integration in Expo.
- Webhooks.
- Refund flow.[cite:8][cite:13][cite:22][cite:28]

### Phase 5: Operations

- Admin booking review queue.
- Cancellation handling.
- Review system.
- Notifications.
- Audit log.[cite:2][cite:5]

### Phase 6: Finance

- Earnings ledger.
- 3-day hold logic.
- Withdrawal requests.
- Payout tracking and admin approval.[cite:5][cite:12][cite:35]

## Acceptance criteria

The MVP is considered launch-ready when:

- A host can register, upload documents, submit a yacht, and get approved by an admin.[cite:2]
- A guest can browse live yachts, choose a template slot, pay successfully, and see a post-payment booking status.[cite:13][cite:28]
- An admin can approve or reject a paid booking.[cite:2]
- A rejected paid booking automatically creates a Stripe refund and updates booking status correctly.[cite:22][cite:23]
- A completed booking becomes payout-eligible only after 3 days.[cite:2][cite:12]
- A host can request withdrawal and an admin can mark payout outcomes.[cite:2][cite:5]
- Reviews can be exchanged only after completed bookings.[cite:2]

## Post-MVP roadmap

After launch validation, the most logical next additions are Arabic localization, more Egyptian cities, more boat categories, local Egyptian payment gateways alongside Stripe, richer notifications, host-specific add-ons, and more automation in refunds and payouts.[cite:2][cite:5]

A later phase can also introduce in-app messaging, captain or crew options, dynamic pricing, stronger guest verification, and automated payout orchestration once operational confidence is higher.[cite:5][cite:12]
