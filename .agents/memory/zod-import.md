---
name: Zod import in api-server
description: The api-server must declare zod as an explicit dependency or zod/v4 imports fail at typecheck.
---

# Zod as explicit api-server dependency

## The rule
`@workspace/api-server` must list `zod` in its own `dependencies` (using `catalog:`) — do not rely on it being transitively available via `@workspace/db` or `@workspace/api-zod`.

**Why:** pnpm strict isolation means transitive dependencies are not automatically available for direct import. If `api-server/src/middlewares/validate.ts` imports `from "zod/v4"`, TypeScript typecheck fails with `Cannot find module 'zod/v4'` unless `zod` is explicitly declared.

**How to apply:** `pnpm --filter @workspace/api-server add zod` (uses catalog pin). Already done — check `artifacts/api-server/package.json` dependencies.
