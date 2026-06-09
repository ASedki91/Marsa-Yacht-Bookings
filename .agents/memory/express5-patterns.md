---
name: Express 5 patterns
description: Two Express 5 runtime gotchas that trip up TypeScript route handlers.
---

## 1. req.params.id is typed `string | string[]`

Even though path params are always `string` at runtime, the Express 5 TS types widen them to `string | string[]`. Drizzle's `eq()` and any other `string`-expecting API will reject the uncast value.

**Rule:** always cast: `const id = String(req.params.id);`

**Why:** Express 5 types changed `ParamsDictionary` to allow arrays; the fix must be at call sites.

**How to apply:** Every route handler that reads `req.params.<anything>` and passes it to Drizzle or string APIs.

## 2. req.query is a getter-only property

Express 5 defines `req.query` with a getter only. Assigning `req.query = result.data` throws at runtime: `Cannot set property query of #<IncomingMessage> which has only a getter`.

**Rule:** override with `Object.defineProperty`:
```ts
Object.defineProperty(req, "query", {
  value: result.data,
  writable: true,
  configurable: true,
});
```

**Why:** The property descriptor on `IncomingMessage.prototype` has no setter in Express 5.

**How to apply:** Any middleware that wants to replace `req.query` with coerced/validated values (e.g., `validateQuery`).
