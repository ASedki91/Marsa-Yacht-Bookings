---
name: MARSA project overview
description: Key business rules, design tokens, and architecture decisions for the MARSA yacht booking marketplace
---

# MARSA Project Overview

**Product:** El Gouna, Egypt yacht booking marketplace (MVP)

## Artifacts
- `artifacts/marsa-mobile` — Expo React Native mobile app (guests + hosts)
- `artifacts/api-server` — Express 5 + Postgres API
- Admin dashboard — planned (separate task)

## Business Rules
- Platform fee: **15%** (host earns 85%)
- Earnings hold: **3 days** before release
- Prices displayed in **EGP**, charged in **USD** via Stripe
- Hard fallback exchange rate: **51 EGP/USD** (live rate fetched from API)

## Design Tokens
- Deep Navy: `#1B2A4A`
- Ocean Blue: `#3B82F6`  
- Golden Sand: `#F59E0B`
- Written to `artifacts/marsa-mobile/constants/colors.ts`

## Key Constraints
- **Express 5**: params typed as `string | string[]` — always cast with `String(req.params.id)`
- **Stripe SDK v22.2.0**: API version `2026-05-27.dahlia`
- **NEVER create app.config.ts** — use `app.json` only
- **DO NOT hardcode ports** — always use `$PORT` env var

## Tab Layout (dynamic by role)
- Guest: Explore + Bookings
- Host: Explore + Bookings + My Yachts + Earnings
- Hidden tabs use `tabBarButton: () => null`
