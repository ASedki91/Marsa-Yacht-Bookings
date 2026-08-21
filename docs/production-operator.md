# Production operator protocol

`POST /api/internal/operator` is a narrowly scoped, production-only capability
for setting up MARSA marketplace records after deployment. It is **not** an
admin or mobile API, is not a database connection, and does not accept SQL,
passwords, file paths, bulk deletion, or arbitrary updates.
When an invited account first syncs, MARSA derives its email from the
authenticated Clerk user on the server. A client-submitted email is never used
to claim a pending guest, host, or administrator role.

## Secure setup

1. Publish MARSA and approve the database schema update so the production
   database contains `operator_operations` and the uniqueness safeguards.
2. In Replit Secrets, add a **production-only** secret named
   `MARSA_OPERATOR_SECRET`. Use a new high-entropy value that is different from
   `INTERNAL_SECRET_TOKEN`.
3. Restart/redeploy the API Server after adding the secret.
4. Keep the secret exclusively in the agent's secure workspace context. Do not
   add it to `.env`, source control, `VITE_*`, `EXPO_PUBLIC_*`, a request URL,
   client code, logs, or chat.
5. The endpoint returns `404` outside production and `503` until its dedicated
   secret is configured.

The operator authenticates only with:

```text
Authorization: Bearer <MARSA_OPERATOR_SECRET>
Content-Type: application/json
```

## Safe production verification

After publishing and setting the production secret, first submit a harmless
`dry_run` for an existing, unchanged location or category. Confirm that it
returns a plan and no database writes. For a controlled creation test, use a
unique internal test email or a clearly labelled draft-only category, present
the returned plan for approval, execute once, and confirm the matching admin
activity events. Do not use a real guest email unless the recipient has
approved the invitation.

## Allowed actions

Only these `action.kind` values are accepted:

- `user` — create a guest, host, or administrator account. New email addresses
  receive a Clerk invitation and choose their own password. Existing activated
  Clerk users are linked without a password flow. A host requires `hostBio` and
  receives a pending host profile. Existing users with another role are
  deliberately rejected rather than updated.
- `location` — create one validated IANA-time-zone location. It may not replace
  an existing default location.
- `category` — create one category with a unique kebab-case slug.
- `booking_template` — create one duration template.
- `yacht_draft` — create one draft for an existing host at an active managed
  location, optionally with pricing for active templates.

Each action is create-or-skip only. Matching existing records are reported as
skipped; conflicting records and missing references are reported in the dry
run. The implementation uses the same location, host, yacht, and template
constraints as the marketplace rather than raw writes.


## Auditing and recovery

Dry runs, every created/skipped record, completed outcomes, and failures are
recorded in MARSA's existing admin activity history. The response separates
`created`, `skipped`, and `errors`. The supporting `operator_operations` table
is managed by the normal Replit publish-time database schema diff; publish the
database schema update together with the API deployment.

Do not retry a failed execution blindly. Start a new dry run after inspecting
the recorded operator activity event. In the rare case an external Clerk
invitation was delivered but a following database write failed, resolve that
specific account through the normal approved administration process before
preparing a fresh request.


## Two-step execution

Every operation is one typed action and uses a fresh UUID `operationId`.

1. Send `phase: "dry_run"` with the proposed `action`.
2. Present the returned `changes` exactly as returned to the requester. The
   response includes a five-minute `confirmationToken`.
3. Only after an explicit user approval, send the same action with
   `phase: "execute"`, `confirmed: true`, and the returned token.

The signed token is bound to the operation ID and full action. The proposed
plan, short execution lease, and final outcome are stored in MARSA's database,
so they remain safe across API restarts and multiple API instances. Execution
fails if any value changes or the dry run expires. A repeated completed
operation returns its recorded outcome rather than writing records again.

```json
{
  "phase": "dry_run",
  "operationId": "0a477284-0ee5-48ba-a1be-5e8b527c7d6d",
  "action": {
    "kind": "location",
    "name": "Abu Tig Marina",
    "city": "El Gouna",
    "country": "Egypt",
    "timeZone": "Africa/Cairo"
  }
}
```

The execute body is the exact same object plus:

```json
{
  "phase": "execute",
  "confirmed": true,
  "confirmationToken": "<dry-run token>"
}
```
