---
name: Express trust proxy
description: Must set app.set("trust proxy", 1) for express-rate-limit to work behind Replit's reverse proxy.
---

# Express trust proxy setting

## The rule
Always set `app.set("trust proxy", 1)` before mounting `express-rate-limit` in `artifacts/api-server/src/app.ts`.

**Why:** The app runs behind Replit's reverse proxy. Without this setting, `express-rate-limit` throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` on every request because `X-Forwarded-For` is set but Express doesn't trust it. The server still works but logs a validation error on every request.

**How to apply:** Add it right after `const app = express()` and before any middleware. It's already set in `artifacts/api-server/src/app.ts`.
