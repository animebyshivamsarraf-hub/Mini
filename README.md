# Mini AI — Autonomous Agent Foundation

Mobile-first Next.js foundation for a multi-step AI task orchestrator.

## Current implementation

- Responsive task dashboard.
- Input validation and honest readiness responses.
- Streamable HTTP MCP endpoint at `/api/mcp`, implemented with the official MCP TypeScript SDK and Vercel Labs `mcp-handler`.
- One MCP tool: `create_task`.
- PostgreSQL-backed task records through `lib/task-store.ts`.
- Bearer-token protection through `MINI_MCP_API_KEY`.
- Task status remains `queued` until an execution worker is implemented and configured.

## Required server environment

- `DATABASE_URL`: managed PostgreSQL connection string.
- `MINI_MCP_API_KEY`: long random secret used as the MCP Bearer token.

Optional future integrations must be configured separately and stored only in server-side environment settings. Do not commit credentials or copy browser cookies/passwords.

## MCP client connection

Configure an MCP client to connect to the deployed URL ending in `/api/mcp`, and supply the `MINI_MCP_API_KEY` as a Bearer token. Do not expose this token in browser code or public repositories.

The `create_task` tool accepts a `prompt` string (3–8,000 characters) and returns the stored task ID and actual status. A successful response means the task was saved, not executed.

## Important integration boundary

A ChatGPT app/plugin connection and a Claude app/plugin connection are not automatically callable by a separately deployed server. Mini AI requires a deployed, authorized MCP endpoint and explicit API credentials or remote MCP permissions for the services it uses.

## Current limitations

This is not yet a complete autonomous agent. Background workers, model execution, external tool adapters, OAuth/user isolation, approval flows, retry scheduling, automated integration tests, dependency installation/build verification, and live deployment verification remain to be implemented. Never treat a queued task as completed.

See [Production Foundation](docs/PRODUCTION_FOUNDATION.md) for the current scope and setup, and [Integration Matrix](docs/INTEGRATION_MATRIX.md) for the recommended open-source component choices.

## Run locally

```bash
npm install
npm run dev
```

Copy the environment template to `.env.local` and fill secrets locally. Never commit `.env.local`.
