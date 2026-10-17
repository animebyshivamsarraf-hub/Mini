/**
 * POST /api/orchestrate — Mini 2 AI-to-AI orchestration endpoint
 *
 * Actions:
 *   { action: "start", prompt }  → create task (does NOT auto-run; client drives steps)
 *   { action: "step", taskId }   → run ONE coordinator step (Mini → provider → record)
 *   { action: "forward", prompt, providerId? } → direct provider call, prompt sent VERBATIM
 *   { action: "transfer", messages, providerId?, systemPrompt?, maxTokens? } → full chat
 *       transcript sent VERBATIM to target provider ("poora chat idhar se udhar")
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
import {
  providerStatusSummary,
  getProvider,
  listProviders,
} from "@/lib/providers/registry";
import {
  addStep,
  finishStep,
  getTask,
  getTaskAsync,
  listTasks,
  setTaskStatus,
} from "@/lib/task-engine";
import { runOneStep, startTask } from "@/lib/coordinator";
import { validateTransferMessages } from "@/lib/validation";

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
    errorCode: task.errorCode,
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

  let body: {
    action?: string;
    prompt?: string;
    taskId?: string;
    providerId?: string;
    messages?: unknown;
    systemPrompt?: string;
    maxTokens?: number;
  };
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
        // Ensure task is in memory (loads from DB on cache miss)
        const existing = await getTaskAsync(body.taskId);
        if (!existing) {
          return NextResponse.json(
            { ok: false, error: "Task not found." },
            { status: 404 }
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

      case "forward": {
        // Direct provider call: prompt goes VERBATIM, no planner rewrite.
        // Records exactly what was sent + raw response in the step.
        if (!body.prompt || typeof body.prompt !== "string") {
          return NextResponse.json(
            { ok: false, error: "prompt (string) is required." },
            { status: 400 }
          );
        }
        const providerId =
          typeof body.providerId === "string" && body.providerId.length > 0
            ? body.providerId
            : listProviders().find((p) => p.getStatus() === "configured")?.id;
        if (!providerId) {
          return NextResponse.json(
            { ok: false, error: "No AI provider is configured." },
            { status: 503 }
          );
        }
        const provider = getProvider(providerId);
        if (!provider) {
          return NextResponse.json(
            { ok: false, error: `Unknown provider: ${providerId}` },
            { status: 400 }
          );
        }
        if (provider.getStatus() !== "configured") {
          return NextResponse.json(
            {
              ok: false,
              error: `Provider ${providerId} is not configured.`,
              errorCode: "NOT_CONFIGURED",
            },
            { status: 503 }
          );
        }
        const task = startTask(body.prompt);
        setTaskStatus(task.id, "running");
        const step = addStep(task.id, providerId, body.prompt);
        const result = await provider.complete(
          [{ role: "user", content: body.prompt }],
          { maxTokens: 2048, timeoutMs: 60_000 }
        );
        if (step) {
          finishStep(task.id, step.id, {
            status: result.ok ? "succeeded" : "failed",
            output: result.ok ? result.text : undefined,
            errorCode: result.ok ? undefined : result.errorCode,
            error: result.ok ? undefined : result.error,
            model: result.model,
            latencyMs: result.latencyMs,
          });
        }
        if (result.ok) {
          setTaskStatus(task.id, "completed", { result: result.text });
        } else {
          setTaskStatus(task.id, "failed", {
            error: result.error,
            errorCode: result.errorCode,
          });
        }
        return NextResponse.json({
          ok: result.ok,
          task: sanitizeTask(getTask(task.id)!),
          provider: providerId,
          model: result.model,
        });
      }

      case "transfer": {
        // Poora chat idhar se udhar: full transcript → target provider, VERBATIM.
        // Same honesty contract as forward: no planner rewrite, exact messages
        // recorded in the step, raw response stored as the task result.
        const validation = validateTransferMessages(body.messages);
        if (!validation.ok) {
          return NextResponse.json(
            { ok: false, error: validation.error, errorCode: "INVALID_MESSAGES" },
            { status: 400 }
          );
        }
        const messages = validation.messages;
        const providerId =
          typeof body.providerId === "string" && body.providerId.length > 0
            ? body.providerId
            : listProviders().find((p) => p.getStatus() === "configured")?.id;
        if (!providerId) {
          return NextResponse.json(
            { ok: false, error: "No AI provider is configured." },
            { status: 503 }
          );
        }
        const provider = getProvider(providerId);
        if (!provider) {
          return NextResponse.json(
            { ok: false, error: `Unknown provider: ${providerId}` },
            { status: 400 }
          );
        }
        if (provider.getStatus() !== "configured") {
          return NextResponse.json(
            {
              ok: false,
              error: `Provider ${providerId} is not configured.`,
              errorCode: "NOT_CONFIGURED",
            },
            { status: 503 }
          );
        }
        const systemPrompt =
          typeof body.systemPrompt === "string" &&
          body.systemPrompt.trim().length > 0
            ? body.systemPrompt.trim().slice(0, 4000)
            : undefined;
        const maxTokens =
          typeof body.maxTokens === "number" && body.maxTokens > 0
            ? Math.min(Math.floor(body.maxTokens), 8192)
            : 2048;
        const task = startTask(
          `Chat transfer: ${messages.length} messages → ${providerId}`
        );
        setTaskStatus(task.id, "running");
        const step = addStep(task.id, providerId, JSON.stringify(messages));
        const result = await provider.complete(messages, {
          maxTokens,
          timeoutMs: 60_000,
          ...(systemPrompt ? { systemPrompt } : {}),
        });
        if (step) {
          finishStep(task.id, step.id, {
            status: result.ok ? "succeeded" : "failed",
            output: result.ok ? result.text : undefined,
            errorCode: result.ok ? undefined : result.errorCode,
            error: result.ok ? undefined : result.error,
            model: result.model,
            latencyMs: result.latencyMs,
          });
        }
        if (result.ok) {
          setTaskStatus(task.id, "completed", { result: result.text });
        } else {
          setTaskStatus(task.id, "failed", {
            error: result.error,
            errorCode: result.errorCode,
          });
        }
        return NextResponse.json({
          ok: result.ok,
          task: sanitizeTask(getTask(task.id)!),
          provider: providerId,
          model: result.model,
          transferredMessages: messages.length,
        });
      }

      case "status": {
        if (!body.taskId) {
          return NextResponse.json(
            { ok: false, error: "taskId is required." },
            { status: 400 }
          );
        }
        // Async: falls back to PostgreSQL if not in this instance's memory
        const task = await getTaskAsync(body.taskId);
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
              "Unknown action. Use: start | step | status | history | cancel | providers | forward | transfer.",
          },
          { status: 400 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
