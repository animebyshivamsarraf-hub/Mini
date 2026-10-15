import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { validateBearerToken, unauthorizedResponse } from "@/lib/mcp-auth";
import { validatePrompt } from "@/lib/validation";
import { createTask } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildServer() {
  const server = new McpServer({ name: "mini-mcp", version: "0.1.0" });

  server.tool(
    "create_task",
    "Create a new task in the Mini task queue. The task is persisted to PostgreSQL with status 'queued'.",
    { prompt: z.string().describe("Task description (3-8000 characters)") },
    async ({ prompt }) => {
      const v = validatePrompt(prompt);
      if (!v.ok) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: v.error }) }],
          isError: true,
        };
      }
      try {
        const task = await createTask(prompt.trim());
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ task_id: task.id, status: task.status }),
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Database error";
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    }
  );

  return server;
}

async function handle(req: Request) {
  // Bearer token auth — required for ALL MCP requests
  if (!validateBearerToken(req.headers.get("authorization"))) {
    return unauthorizedResponse();
  }

  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Don't close the server here — transport handles lifecycle per-request
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function DELETE(req: Request) {
  return handle(req);
}
