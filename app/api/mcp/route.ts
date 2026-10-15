import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createTask, getTask, listTasks } from "@/lib/task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-03-26";

function authorized(req: Request): boolean {
  const expected = process.env.MINI_MCP_API_KEY;
  if (!expected) return false;
  const auth = req.headers.get("authorization") || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

const tools = [
  {
    name: "create_task",
    description: "Create a persistent Mini AI task. This queues and records the task; it does not claim the task has executed.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string", minLength: 3, maxLength: 8000, description: "The task to record for Mini AI." } },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "get_task",
    description: "Retrieve a Mini AI task by its task ID, including its current status and result if any.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string", minLength: 1, maxLength: 100 } },
      required: ["task_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    description: "List recent Mini AI tasks and their actual stored statuses.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
  },
  {
    name: "system_status",
    description: "Check whether Mini AI's persistent task store is configured and reachable.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function toolResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
}

export async function GET() {
  return NextResponse.json({
    name: "Mini AI MCP",
    endpoint: "/api/mcp",
    transport: "Streamable HTTP JSON-RPC POST",
    configured: Boolean(process.env.MINI_MCP_API_KEY && process.env.DATABASE_URL),
    note: "Authenticated MCP task-management foundation. Task execution workers and provider/tool integrations must be configured separately.",
  });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized. Configure MINI_MCP_API_KEY and send it as a Bearer token." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (!body || typeof body !== "object") return rpcError(null, -32600, "Invalid Request");

  const rpc = body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const id = rpc.id;
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return rpcError(id, -32600, "Invalid Request");

  if (rpc.method === "notifications/initialized" || rpc.method === "notifications/cancelled") {
    return new Response(null, { status: 202 });
  }

  if (rpc.method === "initialize") {
    const params = (rpc.params && typeof rpc.params === "object" ? rpc.params : {}) as { protocolVersion?: string };
    const version = params.protocolVersion || PROTOCOL_VERSION;
    return NextResponse.json({
      jsonrpc: "2.0",
      id: id ?? null,
      result: {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mini-ai", version: "0.2.0" },
        instructions: "Mini AI currently provides authenticated persistent task management. A queued task is not proof of execution; inspect task status and result.",
      },
    }, { headers: { "MCP-Protocol-Version": version } });
  }

  if (rpc.method === "ping") return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: {} });

  if (rpc.method === "tools/list") {
    return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: { tools } });
  }

  if (rpc.method === "tools/call") {
    const params = (rpc.params && typeof rpc.params === "object" ? rpc.params : {}) as { name?: string; arguments?: Record<string, unknown> };
    const args = params.arguments || {};
    try {
      if (params.name === "create_task") {
        if (typeof args.prompt !== "string") return rpcError(id, -32602, "prompt must be a string");
        return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: toolResult(await createTask(args.prompt)) });
      }
      if (params.name === "get_task") {
        if (typeof args.task_id !== "string") return rpcError(id, -32602, "task_id must be a string");
        const task = await getTask(args.task_id);
        return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: toolResult(task || { found: false, task_id: args.task_id }) });
      }
      if (params.name === "list_tasks") {
        const limit = typeof args.limit === "number" ? args.limit : 20;
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) return rpcError(id, -32602, "limit must be an integer from 1 to 50");
        return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: toolResult(await listTasks(limit)) });
      }
      if (params.name === "system_status") {
        try {
          await listTasks(1);
          return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: toolResult({ status: "ready_for_task_storage", database: "connected", task_execution: "not_configured", provider_integrations: "not_configured" }) });
        } catch (error) {
          return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: toolResult({ status: "setup_required", database: "unavailable", detail: error instanceof Error ? error.message : "Database check failed" }) });
        }
      }
      return rpcError(id, -32602, "Unknown tool: " + String(params.name || ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Task operation failed";
      return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: { content: [{ type: "text", text: message }], isError: true } });
    }
  }

  if (rpc.method === "resources/list") {
    return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: { resources: [] } });
  }

  return rpcError(id, -32601, "Method not found: " + rpc.method);
}
