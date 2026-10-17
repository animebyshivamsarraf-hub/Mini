/**
 * Forward action supporting tests — no live API calls.
 * Covers: task-level errorCode storage, verbatim prompt passthrough,
 * and provider error propagation that the /forward endpoint relies on.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createOrchestratedTask,
  getTask,
  setTaskStatus,
  addStep,
  finishStep,
  _clearAllTasks,
} from "./task-engine";
import { anthropicProvider } from "./providers/anthropic";

describe("task-level errorCode (forward endpoint support)", () => {
  beforeEach(() => _clearAllTasks());

  it("setTaskStatus stores errorCode on the task", () => {
    const task = createOrchestratedTask("test prompt for errorCode");
    setTaskStatus(task.id, "failed", {
      error: "Provider failed",
      errorCode: "API_ERROR",
    });
    const updated = getTask(task.id)!;
    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("Provider failed");
    expect(updated.errorCode).toBe("API_ERROR");
  });

  it("step records errorCode independently from task", () => {
    const task = createOrchestratedTask("test prompt for step errorCode");
    const step = addStep(task.id, "anthropic", "verbatim prompt here")!;
    finishStep(task.id, step.id, {
      status: "failed",
      errorCode: "TIMEOUT",
      error: "Timed out",
    });
    const updated = getTask(task.id)!;
    expect(updated.steps[0].errorCode).toBe("TIMEOUT");
    expect(updated.steps[0].status).toBe("failed");
  });
});

describe("verbatim prompt passthrough (forward action contract)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-do-not-use";
  });
  afterEach(() => {
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    else delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("provider.complete sends the exact prompt text unmodified", async () => {
    const exactPrompt = "Claude, say exactly: Hello from Claude!  \nWith special chars: @#$%";
    let capturedContent = "";
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: "Hello from Claude!" }],
          model: "claude-haiku-4-5-20251001",
        }),
      })) as unknown as typeof fetch
    );

    // Capture what the adapter actually sends
    const spy = vi.spyOn(globalThis, "fetch");
    await anthropicProvider.complete([{ role: "user", content: exactPrompt }]);

    const callArgs = spy.mock.calls[0];
    const body = JSON.parse(String((callArgs[1] as RequestInit).body));
    const sentMessages = body.messages as Array<{ role: string; content: string }>;
    // Verbatim: no planner rewrite, no prefix/suffix added
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].content).toBe(exactPrompt);
    expect(sentMessages[0].role).toBe("user");
  });

  it("provider returns honest NOT_CONFIGURED without key (no fake forward)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await anthropicProvider.complete([
      { role: "user", content: "test forward without key" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("NOT_CONFIGURED");
    expect(r.text).toBeUndefined();
  });
});
