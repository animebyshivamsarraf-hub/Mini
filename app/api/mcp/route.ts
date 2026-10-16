import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createTask } from "@/lib/task-store";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { mimiAsk } from "@/lib/mimi-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidBearerToken(request: Request): boolean {
  const expected = process.env.MINI_MCP_API_KEY;
  if (!expected) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!supplied) return false;

  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);

  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "create_task",
      {
        title: "Create Mini task",
        description:
          "Store a task in Mini's PostgreSQL task queue. This records the task as queued; it does not execute the task or claim completion.",
        inputSchema: {
          // Accept any string here; validate manually below so invalid prompts
          // return a proper isError response instead of hanging (mcp-handler v1 bug).
          prompt: z.string(),
        },
      },
      async ({ prompt }) => {
        // Manual validation: 3-8000 chars after trim
        const trimmed = typeof prompt === "string" ? prompt.trim() : "";
        if (trimmed.length === 0) {
          return {
            isError: true,
            content: [{ type: "text", text: "prompt must not be empty" }],
          };
        }
        if (trimmed.length < 3) {
          return {
            isError: true,
            content: [{ type: "text", text: "prompt must be at least 3 characters" }],
          };
        }
        if (prompt.length > 8000) {
          return {
            isError: true,
            content: [{ type: "text", text: "prompt must not exceed 8000 characters" }],
          };
        }
        try {
          const task = await createTask(trimmed);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    task_id: task.id,
                    title: task.title,
                    status: task.status,
                    created_at: task.created_at,
                    message:
                      "Task saved successfully. It remains queued until a background worker is implemented and configured.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  "Mini could not save the task. Check that DATABASE_URL is configured and the PostgreSQL database is reachable.",
              },
            ],
          };
        }
      },
    );

    // Mini 1 (Mimi) ka tool — ab Mini 2 me joined.
    // Rule-based brain: greeting, naam, time, date, joke, thanks, bye.
    // Groq AI Mini 2 par abhi configured nahi — honest note response me hai.
    server.registerTool(
      "mimi_ask",
      {
        title: "Ask Mimi (Mini 1)",
        description:
          "Ask Mini 1 (Mimi), the cute robot companion, a question. Rule-based brain answers in Hindi/Hinglish. Ported from Mini 1's MCP bridge.",
        inputSchema: {
          question: z.string(),
          session_id: z.string().optional(),
        },
      },
      async ({ question, session_id }) => {
        try {
          const result = mimiAsk(question ?? "", session_id ?? "");
          return {
            content: [{ type: "text", text: result }],
          };
        } catch {
          return {
            isError: true,
            content: [{ type: "text", text: "Mimi could not answer right now." }],
          };
        }
      },
    );
  },
  {},
  {
    basePath: "/api",
    verboseLogs: false,
  },
);

async function authenticatedHandler(request: Request): Promise<Response> {
  // Rate limiting: 60 req/min per IP, per-instance (in-memory).
  // NOTE: On serverless (Vercel), each instance has its own counter.
  // This is NOT a global limit. For shared/global protection,
  // use Redis or Vercel KV. This prevents single-instance abuse.
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return Response.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "60",
        },
      },
    );
  }

  if (!hasValidBearerToken(request)) {
    return Response.json(
      { error: "Unauthorized. A valid Mini Bearer token is required." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return mcpHandler(request);
}

export const GET = authenticatedHandler;
export const POST = authenticatedHandler;
export const DELETE = authenticatedHandler;
