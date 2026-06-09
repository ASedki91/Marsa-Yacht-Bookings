---
name: Orval params collision
description: TS2308 collision when an OpenAPI operation has both path params AND query params — Orval generates the same name in api.ts and types/.
---

# Orval TS2308 params collision

## The rule
Never define an endpoint that has BOTH path params (e.g. `{id}`) AND query params in the same operation. Move the path identifier to a query param instead.

**Why:** Orval generates `{OperationId}Params` as:
1. A Zod schema in `generated/api.ts` (for path params)
2. A TypeScript interface in `generated/types/` (combined path + query)

When both exist, `lib/api-zod/src/index.ts` re-exports both and TypeScript throws:
```
error TS2308: Module "./generated/api" has already exported a member named 'GetYachtAvailabilityParams'.
```

Operations with ONLY query params (no path param) are safe because Orval names them differently:
- api.ts: `{OperationId}QueryParams`
- types/: `{OperationId}Params`
Different names → no collision.

**How to apply:** When designing an endpoint that needs an entity ID AND filter/pagination query params, use `GET /resource?resourceId=...&filter=...` instead of `GET /resource/{id}?filter=...`. The practical example: `GET /yachts/availability?yachtId=...&from=...&to=...` instead of `GET /yachts/{id}/availability?from=...&to=...`.
