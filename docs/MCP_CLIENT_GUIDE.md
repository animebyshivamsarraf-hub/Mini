# Mini 2 — MCP Client Connection Guide

Mini 2 exposes a **Streamable HTTP MCP endpoint** with a `create_task` tool.
Only MCP-compatible clients can connect. Each client has its own connection method.

## Endpoint

- **URL:** `https://<your-deployment>/api/mcp`
- **Auth:** `Authorization: Bearer <MINI_MCP_API_KEY>` (server-side env var)
- **Protocol:** MCP Streamable HTTP (POST)

## Available Tools

### `create_task`
Queues a task in Mini's PostgreSQL database. Does NOT execute it.

**Input:**
```json
{
  "prompt": "string (3-8000 chars, required)"
}
```

**Success response:**
```json
{
  "task_id": "uuid",
  "title": "first line of prompt",
  "status": "queued",
  "created_at": "ISO timestamp",
  "message": "Task saved successfully..."
}
```

**Error cases:**
- Missing/invalid Bearer token → HTTP 401
- Empty/short/long prompt → `isError: true` with message
- Database not configured → `isError: true` ("DATABASE_URL...")

## Client-Specific Instructions

### Claude (Anthropic)
Claude's MCP support depends on the client app:
- **Claude Desktop:** Supports MCP via `claude_desktop_config.json`. Add Mini as a custom server with `type: "http"`, `url`, and `headers: { "Authorization": "Bearer ..." }`.
- **Claude API:** Does not natively call external MCP servers. Use an MCP gateway or client library.
- **Requirement:** Claude Desktop app + config file access.

### ChatGPT (OpenAI)
- **ChatGPT Plus/Team:** Custom GPTs can call external APIs via Actions (OpenAPI schema), not native MCP. Mini's MCP endpoint would need an OpenAPI wrapper.
- **ChatGPT Developer Mode / API:** Use an MCP client library (e.g., `@modelcontextprotocol/sdk`) to bridge.
- **Requirement:** Paid ChatGPT plan for Custom GPT Actions. Native MCP not supported in ChatGPT UI as of 2026-10.

### Generic MCP Clients
Any client supporting **Streamable HTTP** transport:
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "my-app", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(
  new URL("https://<deployment>/api/mcp"),
  { requestInit: { headers: { Authorization: "Bearer <key>" } } }
);
await client.connect(transport);
const tools = await client.listTools(); // → create_task
const result = await client.callTool({
  name: "create_task",
  arguments: { prompt: "Build a todo app" }
});
```

## Security Notes

- Never expose `MINI_MCP_API_KEY` in client-side code, URLs, or logs.
- The key is validated with timing-safe comparison.
- Rate limiting: 60 requests/minute per IP (when enabled).
- All task content is stored as provided — sanitize before displaying in UI.

## Honest Limitations

- Mini 2 does NOT execute tasks — it only queues them (`status: "queued"`).
- A background worker (Phase 5) is required for execution.
- "Connected" in any UI means the MCP endpoint is reachable, not that AI execution works.
