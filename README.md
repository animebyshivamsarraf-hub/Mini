# Mini AI — Autonomous Agent Foundation

Mobile-first Next.js foundation for a multi-step AI task orchestrator.

## Current implementation

- Responsive task dashboard.
- Input validation and honest readiness responses.
- Authenticated MCP JSON-RPC endpoint at `/api/mcp`.
- PostgreSQL-backed task records through `lib/task-store.ts`.
- MCP tools: `create_task`, `get_task`, `list_tasks`, and `system_status`.
- Task status remains `queued` until an execution worker is implemented and configured.

## Required server environment

- `DATABASE_URL`: managed PostgreSQL connection string.
- `MINI_MCP_API_KEY`: long random secret used as the MCP Bearer token.

Optional future integrations must be configured separately and stored only in server-side environment settings. Do not commit credentials or copy browser cookies/passwords.

## Important integration boundary

A ChatGPT app/plugin connection and a Claude app/plugin connection are not automatically callable by a separately deployed server. Mini AI requires a deployed, authorized MCP endpoint and explicit API credentials or remote MCP permissions for the services it uses.

## Current limitations

This is not yet a complete autonomous agent. Durable workers, model execution, external tool adapters, OAuth/user isolation, approval flows, retry scheduling, automated integration tests, and live deployment verification remain to be implemented. Never treat a queued task as completed.

See [Production Foundation](docs/PRODUCTION_FOUNDATION.md) for the current scope, configuration and next milestones.

## Run locally

```bash
npm install
npm run dev
```

Copy the environment template to `.env.local` and fill secrets locally. Never commit `.env.local`.
