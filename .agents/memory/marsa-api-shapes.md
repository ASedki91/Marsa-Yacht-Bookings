---
name: MARSA API response shapes
description: The contract between yacht API endpoints and the mobile UI
---

**Decision/contract:** the mobile screens consume a FLAT yacht object and cast responses as `any`, so the api-server yacht endpoints must return that flat shape, not raw DB rows.
- List (`GET /yachts`) cards need a primary photo and a starting price per yacht; without them cards render no image/price.
- Detail (`GET /yachts/:id`) must expose all yacht fields at the TOP level (not nested under a `yacht` key) alongside photos/pricing/reviews/host, or the detail body renders blank.

**Why:** the DB stores `title` and string `avgRating`, and prices live in a separate per-template pricing table; the UI expects `name`, numeric `rating`, and a single `basePriceEgp`. The mismatch (nested detail + list without photos/price) was the root cause of blank detail bodies and bare list cards.

**How to apply:** any new yacht-list/detail consumer or endpoint change must preserve this flat contract. A contract test asserting the flat keys would catch regressions.

**Seed gotcha:** `artifacts/api-server/src/seed.ts` early-exits when yachts already exist, so any new per-yacht data (e.g. pricing) must be backfilled idempotently for existing yachts too, not only in the new-yacht path. There is no `tsx` dep in api-server — run with `pnpm dlx tsx artifacts/api-server/src/seed.ts`.
