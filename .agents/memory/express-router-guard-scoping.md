---
name: Express router guard scoping
description: Why a path-less auth guard in one sub-router can break unrelated routes
---

In the api-server, sub-routers are mounted path-less in `routes/index.ts` (e.g. `router.use(adminRouter)`), and each sub-router declares its own full paths like `/admin/...`.

**Rule:** Inside such a sub-router, NEVER write a path-less `router.use(requireAuth, requireRole(...))`. Scope it to the prefix: `router.use("/admin", requireAuth, requireRole("admin"))`.

**Why:** `router.use(mw)` with no path matches every request entering that router instance. Because routers are mounted path-less and in order, a path-less guard in an earlier router intercepts requests destined for later routers and returns 401 (no token) or 403 (wrong role) on routes that should be unguarded.

**How to apply:** Whenever adding router-level auth/role middleware, always include the path prefix argument. Audit mount order in `routes/index.ts` when an unrelated route unexpectedly returns 401/403.
