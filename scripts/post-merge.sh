#!/bin/bash
set -euo pipefail

pnpm install --frozen-lockfile

# Database changes are deliberately applied as a separate, reviewed step.
# See MARKETPLACE_UPDATE_IMPLEMENTATION_GUIDE.md for the development-only
# schema and idempotent backfill procedure. Never auto-push production schema
# during Replit source synchronization.
