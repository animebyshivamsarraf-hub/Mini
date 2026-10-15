# Mini AI — Production foundation

## Current milestone

This branch adds an authenticated MCP task-management surface and a PostgreSQL-backed task store. It is a foundation, not the complete autonomous agent system.

### Implemented in this milestone
- `POST /api/mcp`: JSON-RPC MCP endpoint protected by a server-side Bearer key.
- `initialize`, `ping`, `tools/list`, and task-management `tools/call` methods.
- Tools: `create_task`, `get_task`, `list_tasks`, and `system_status`.
- Persistent task records in PostgreSQL, created on demand by the store.
- Task status is explicitly `queued` until an execution worker is built and configured.
- No API credentials are committed.

## Required environment variables

- `DATABASE_URL`: managed PostgreSQL connection string.
- `MINI_MCP_API_KEY`: long random secret used as the MCP Bearer token.

Set these only in the hosting provider's encrypted server-side environment settings. Never place the MCP key in browser JavaScript, source control, screenshots, or public logs.

## MCP connection

After a real deployment is available, configure the MCP client with the verified endpoint `https://<deployed-host>/api/mcp` and Bearer authentication. Do not use a guessed or placeholder production URL.

The endpoint currently supports JSON-RPC POST requests. Verify compatibility with the target MCP client before treating it as production-connected.

## What is not implemented yet

- Durable task execution worker / queue consumer.
- AI provider adapter and actual model execution.
- GitHub, Vercel, browser, and other external tool adapters.
- User sign-in, tenant isolation, per-user task ownership, and credential vault.
- Approval workflow for consequential actions.
- Retry scheduling, cancellation, idempotency, and dead-letter handling.
- Automated integration tests and live deployment verification.

Do not label a queued task as completed. A production release must add the missing controls and pass end-to-end tests before unattended execution is enabled.

## Recommended next milestones

1. Provision a database in an explicitly selected region and configure `DATABASE_URL`.
2. Deploy to a verified host and configure `MINI_MCP_API_KEY`.
3. Test MCP initialize, tools/list, create_task, get_task and list_tasks against the live endpoint.
4. Add an execution worker with bounded retries, timeouts, idempotency, and durable status updates.
5. Add one AI provider adapter and test a non-destructive text-only task.
6. Add explicit per-tool allowlists and approval gates.
7. Add account authentication and tenant isolation before multi-user use.
8. Add GitHub/Vercel adapters, audit logs, tests, monitoring, and recovery procedures.
