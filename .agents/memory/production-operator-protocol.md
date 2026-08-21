---
name: Production operator protocol
description: Safety constraints for server-only production provisioning.
---

MARSA production setup actions must use the narrow operator protocol: a
server-only secret, a signed expiring dry run, explicit confirmation, and a
durable operation record that owns the affected resource while it executes.
Never add a client-accessible admin backdoor, raw database action, password
flow, or direct production database access for this purpose.

**Why:** An operation may span API restarts or multiple server instances, and
pre-provisioned accounts must not be claimable based on an email supplied by a
client. Durable state, database constraints, transactional precondition checks,
and Clerk-derived identity data prevent duplicate setup and account takeover.

**How to apply:** When expanding supported setup actions, retain the
dry-run/confirm contract, use the persisted plan and lease, validate and write
within one transaction with appropriate locking/constraints, and record the
outcome in admin activity. Provisioned users must use Clerk invitation or
activation flows and their verified Clerk email, never a MARSA password.