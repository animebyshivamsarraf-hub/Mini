import { listTasks } from "@/lib/task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tasks — list recent tasks.
 * Requires Bearer auth (same MINI_MCP_API_KEY as MCP endpoint).
 * Returns honest 503 when DATABASE_URL is not configured.
 */
export async function GET(request: Request) {
  const expected = process.env.MINI_MCP_API_KEY;
  const auth = request.headers.get("authorization") ?? "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tasks = await listTasks(20);
    return Response.json({ tasks });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("DATABASE_URL")) {
      return Response.json(
        { error: "Database not configured", detail: message },
        { status: 503 },
      );
    }
    return Response.json({ error: "Failed to list tasks" }, { status: 500 });
  }
}
