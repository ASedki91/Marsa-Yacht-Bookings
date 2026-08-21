---
name: Expo Clerk proxy origin
description: Production Expo web and native Clerk proxy URL behavior across Replit and custom domains
---

## Rule

Keep production `CLERK_PROXY_URL` as a root-relative path such as `/api/__clerk`. The Expo web export must embed that path unchanged, while native bundles may expand it against the deployment URL.

**Why:** An absolute Replit deployment hostname makes Clerk requests originate from the wrong host when users open the custom domain, which can leave the web app stuck in its loading state.

**How to apply:** When changing the Expo production build or Clerk provider setup, validate that the web bundle contains `/api/__clerk` without an absolute hostname and that the provider receives the exported proxy URL.