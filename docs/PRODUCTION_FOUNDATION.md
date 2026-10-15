# Mini AI — Production foundation

## Current milestone

This branch adds a Streamable HTTP MCP endpoint using Vercel Labs `mcp-handler` and the official MCP TypeScript SDK, plus a PostgreSQL-backed task store. This is a foundation, not the complete autonomous agent system.

### Implemented in this milestone
- `/api/mcp`: MCP route protected by a server-side Bearer key.
- One tool: `create_task`.
- Input validation for a `prompt` between 3 and 8,000 characters.
- Persistent task records in PostgreSQL, created on demand by the store.
- The tool returns the saved task ID and actual status.
- Task status is explicitly `queued` until an execution worker is built and configured.
- No API credentials are committed.

## Required environment variables

- `DATABASE_URL`: managed PostgreSQL connection string.
- `MINI_MCP_API_KEY`: long random secret used as the MCP Bearer token.

Set these only in the hosting provider's encrypted server-side environment settings. Never place the MCP key in browser JavaScript, source control, screenshots, or public logs.

## MCP connection

After a real deployment is available, configure the MCP client with the verified endpoint `https://<deployed-host>/api/mcp` and Bearer authentication. Do not use a guessed or placeholder production URL.

The handler is based on `mcp-handler@1.1.0` and `@modelcontextprotocol/sdk@1.26.0`. Verify compatibility with the intended MCP client after the build and live endpoint tests pass.

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

1. Confirm the MCP route builds and the single `create_task` tool is listed correctly.
2. Provision a database in an explicitly selected region and configure `DATABASE_URL`.
3. Configure `MINI_MCP_API_KEY` in the hosting provider's encrypted environment.
4. Test MCP initialization, tool discovery, authorized and unauthorized requests, and task persistence.
5. Add an execution worker with bounded retries, timeouts, idempotency, and durable status updates.
6. Add one AI provider adapter and test a non-destructive text-only task.
7. Add explicit per-tool allowlists and approval gates.
8. Add account authentication and tenant isolation before multi-user use.
9. Add GitHub/Vercel adapters, audit logs, tests, monitoring, and recovery procedures.
