# Mini Autonomous Agent

Mobile-first scaffold for a multi-step task orchestrator hosted on Vercel.

## Current state
- Responsive task dashboard and honest integration-readiness endpoint.
- Input validation and bounded task size.
- Explicitly refuses to claim execution when database/model/MCP integration is missing.
- Environment-variable template only; no credentials are committed.

## Important integration boundary
A ChatGPT app/plugin connection and a Claude app/plugin connection are not automatically callable by a separately deployed Vercel server. The agent needs supported server-side APIs or explicit, authorized remote MCP endpoints. Do not copy browser cookies or app passwords. This scaffold does not yet forward work between ChatGPT and Claude.

## Required configuration before real autonomous execution
1. Connect a Postgres database and set `DATABASE_URL` in Vercel.
2. Configure a supported AI execution route and set `AI_GATEWAY_API_KEY` server-side.
3. If using MCP, set `MCP_SERVER_URL` and `MCP_SERVER_TOKEN` only for an endpoint you control or are authorized to call.
4. Implement/verify the database schema, durable job queue, tool allowlist, idempotency, retry/backoff, deadlines, and completion tests before enabling unattended writes/deployments.

## Run locally
`npm install && npm run dev`

Copy `.env.example` to `.env.local` and fill secrets locally. Never commit `.env.local`.
