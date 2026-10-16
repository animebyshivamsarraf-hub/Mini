/**
 * POST /api/orchestrate — Mini 2 AI-to-AI orchestration endpoint
 *
 * Actions:
 *   { action: "start", prompt }  → create task (does NOT auto-run; client drives steps)
 *   { action: "step", taskId }   → run ONE coordinator step (Mini → provider → record)
 *   { action: "status", taskId } → get task + steps + provider statuses
 *   { action: "history" }        → list recent tasks
 *   { action: "cancel", taskId } → cancel a running task
 *   { action: "providers" }      → honest provider statuses (no secrets)
 *
 * Auth: same Bearer token as MCP (MINI_MCP_API_KEY).
 * Steps are client-driven (one HTTP call = one AI step) so serverless
 * timeouts can't kill a long workflow. The client loops until terminal.
 */
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { providerStatusSummary } from "@/lib/providers/registry";
import {
  getTask,
  listTasks,
  setTaskStatus,
} from "@/lib/task-engine";
import { runOneStep, startTask } from "@/lib/coordinator";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized. Provide a valid Bearer token." },
    { status: 401 }
  );
}

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.MINI_MCP_API_KEY;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function sanitizeTask(task: NonNullable<ReturnType<typeof getTask>>) {
  // Never leak anything sensitive; steps contain only prompts/outputs
  return {
    id: task.id,
    prompt: task.prompt,
    status: task.status,
    maxSteps: task.maxSteps,
    result: task.result,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    steps: task.steps.map((s) => ({
      id: s.id,
      providerId: s.providerId,
      input: s.input,
      output: s.output,
      status: s.status,
      errorCode: s.errorCode,
      error: s.error,
      model: s.model,
      latencyMs: s.latencyMs,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
    })),
  };
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized();

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: { action?: string; prompt?: string; taskId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const { action } = body;

  try {
    switch (action) {
      case "providers":
        return NextResponse.json({
          ok: true,
          providers: providerStatusSummary(),
          note: "not_configured = set the provider's API key as a server-side env var.",
        });

      case "start": {
        if (!body.prompt || typeof body.prompt !== "string") {
          return NextResponse.json(
            { ok: false, error: "prompt (string) is required." },
            { status: 400 }
          );
        }
        const task = startTask(body.prompt);
        return NextResponse.json({
          ok: true,
          task: sanitizeTask(task),
          providers: providerStatusSummary(),
        });
      }

      case "step": {
        if (!body.taskId) {
          return NextResponse.json(
            { ok: false, error: "taskId is required." },
            { status: 400 }
          );
        }
        const task = await runOneStep(body.taskId);
        if (!task) {
          return NextResponse.json(
            { ok: false, error: "Task not found." },
            { status: 404 }
          );
        }
        return NextResponse.json({ ok: true, task: sanitizeTask(task) });
      }

      case "status": {
        if (!body.taskId) {
          return NextResponse.json(
            { ok: false, error: "taskId is required." },
            { status: 400 }
          );
        }
        const task = getTask(body.taskId);
        if (!task) {
          return NextResponse.json(
            { ok: false, error: "Task not found." },
            { status: 404 }
          );
        }
        return NextResponse.json({ ok: true, task: sanitizeTask(task) });
      }

      case "history": {
        return NextResponse.json({
          ok: true,
          tasks: listTasks(20).map((t) => ({
            id: t.id,
            prompt: t.prompt.slice(0, 120),
            status: t.status,
            steps: t.steps.length,
            updatedAt: t.updatedAt,
          })),
        });
      }

      case "cancel": {
        if (!body.taskId) {
          return NextResponse.json(
            { ok: false, error: "taskId is required." },
            { status: 400 }
          );
        }
        const task = getTask(body.taskId);
        if (!task) {
          return NextResponse.json(
            { ok: false, error: "Task not found." },
            { status: 404 }
          );
        }
        if (
          task.status === "completed" ||
          task.status === "failed" ||
          task.status === "cancelled"
        ) {
          return NextResponse.json({
            ok: false,
            error: `Task already ${task.status}.`,
          });
        }
        setTaskStatus(body.taskId, "cancelled");
        const updated = getTask(body.taskId)!;
        return NextResponse.json({ ok: true, task: sanitizeTask(updated) });
      }

      default:
        return NextResponse.json(
          {
            ok: false,
            error:
              "Unknown action. Use: start | step | status | history | cancel | providers.",
          },
          { status: 400 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
