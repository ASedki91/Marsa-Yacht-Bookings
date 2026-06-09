---
name: Host router auth scoping
description: Why router.use(requireAuth) without a path was returning 401 on public routes in other routers.
---

## Rule
Never use `router.use(requireAuth)` without a path in a router that is mounted without a prefix (`mainRouter.use(childRouter)`).

**Why:** When a router has `router.use(middleware)` at the top (no path), Express runs that middleware for EVERY request that enters the router — even those destined for a later router. Since all routers in this project are mounted at the root via `mainRouter.use(childRouter)`, a blanket `router.use(requireAuth)` in host.ts was intercepting requests like `GET /yachts/:id/reviews` before they could reach reviewsRouter.

**Fix applied:** Changed to `router.use("/host", requireAuth)` so the middleware only fires for `/host/*` paths.

**How to apply:** In any router mounted without a path prefix, scope all `router.use(middleware)` calls to a path: `router.use("/routePrefix", middleware)`. Alternatively, mount the router with a prefix in index.ts (`mainRouter.use("/host", hostRouter)`) and strip the prefix from route definitions inside.
