# Production operator actions

MARSA includes a server-only production operator channel for agent-assisted marketplace setup. It is deliberately limited to typed actions: inviting users, setting a MARSA role, and creating locations, categories, booking templates, and yacht drafts.

## Before first use

1. Publish MARSA so the API server uses its Production Clerk environment.
2. During Publish, approve the pending database schema changes. This creates the operation log and the normalized-email uniqueness safeguard in the Production database.
3. Add a long, unique `AGENT_OPERATOR_TOKEN` secret to the **Production** environment. Never put this token in source code, a browser client, or chat.
4. Keep `CLERK_SECRET_KEY` configured through Replit-managed Clerk. The published API automatically uses the Production Clerk key.

## How an operation works

1. The agent sends a dry-run request with `confirm: false`.
2. It presents the proposed records, any validation errors, and whether an invitation will be sent.
3. After the operator explicitly confirms the exact change, the agent submits the same request with `confirm: true`.
4. The API records the action and returns the created IDs. Retrying the same request ID returns the existing result instead of duplicating data.

## Safety boundaries

- The route fails closed when `AGENT_OPERATOR_TOKEN` is absent.
- The token is accepted only in the `x-marsa-operator-token` request header.
- User invitations let recipients choose their own passwords; no passwords are sent to or stored by the agent.
- Yacht operations create drafts only. A normal administrator must still review and publish a listing.
- Only a listing submitted for review can be approved; a draft cannot bypass that review state.
- If an operation is interrupted, its request ID remains locked for investigation rather than being retried automatically.
- There is no arbitrary SQL, deletion, or unrestricted update operation.