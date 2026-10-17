/**
 * Transfer action supporting tests — no live API calls.
 * Covers: transcript validation, verbatim message passthrough,
 * and task-level errorCode storage that the /transfer endpoint relies on.
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
import {
  validateTransferMessages,
  TRANSFER_MAX_MESSAGES,
  TRANSFER_MAX_MESSAGE_CHARS,
} from "./validation";
import { anthropicProvider } from "./providers/anthropic";

const VALID_TRANSCRIPT = [
  { role: "user", content: "Mera naam Rishi hai." },
  { role: "assistant", content: "Namaste Rishi! Kaise ho?" },
  { role: "user", content: "Ye chat Claude ko transfer karo." },
];

describe("validateTransferMessages", () => {
  it("accepts a valid multi-turn transcript", () => {
    const r = validateTransferMessages(VALID_TRANSCRIPT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.messages).toHaveLength(3);
      expect(r.messages[0]).toEqual({ role: "user", content: "Mera naam Rishi hai." });
    }
  });

  it("accepts system role messages", () => {
    const r = validateTransferMessages([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejects a non-array", () => {
    const r = validateTransferMessages("not an array");
    expect(r.ok).toBe(false);
  });

  it("rejects an empty transcript", () => {
    const r = validateTransferMessages([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not be empty/);
  });

  it("rejects more than the max message count", () => {
    const many = Array.from({ length: TRANSFER_MAX_MESSAGES + 1 }, (_, i) => ({
      role: "user",
      content: `msg ${i}`,
    }));
    const r = validateTransferMessages(many);
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid role", () => {
    const r = validateTransferMessages([{ role: "bot", content: "hi" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/messages\[0\]\.role/);
  });

  it("rejects empty content", () => {
    const r = validateTransferMessages([{ role: "user", content: "   " }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/messages\[0\]\.content/);
  });

  it("rejects non-string content", () => {
    const r = validateTransferMessages([{ role: "user", content: 42 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects an over-long message", () => {
    const r = validateTransferMessages([
      { role: "user", content: "x".repeat(TRANSFER_MAX_MESSAGE_CHARS + 1) },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects a non-object entry", () => {
    const r = validateTransferMessages(["just a string"]);
    expect(r.ok).toBe(false);
  });
});

describe("verbatim transcript passthrough (transfer action contract)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-for-transfer-passthrough";
  });
  afterEach(() => {
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    else delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("provider.complete receives the exact transcript unmodified", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: "Samajh gaya, Rishi!" }],
          model: "claude-haiku-4-5-20251001",
        }),
      })) as unknown as typeof fetch
    );

    const spy = vi.spyOn(globalThis, "fetch");
    const result = await anthropicProvider.complete(
      VALID_TRANSCRIPT.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    );

    expect(result.ok).toBe(true);
    const callArgs = spy.mock.calls[0];
    const body = JSON.parse(String((callArgs[1] as RequestInit).body));
    const sentMessages = body.messages as Array<{ role: string; content: string }>;
    // Verbatim: same order, same roles, same content — no rewrite, no prefix/suffix
    expect(sentMessages).toHaveLength(3);
    expect(sentMessages[0]).toEqual({ role: "user", content: "Mera naam Rishi hai." });
    expect(sentMessages[1]).toEqual({ role: "assistant", content: "Namaste Rishi! Kaise ho?" });
    expect(sentMessages[2]).toEqual({ role: "user", content: "Ye chat Claude ko transfer karo." });
  });

  it("system-role messages go to the system field, not messages", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: "ok" }],
          model: "claude-haiku-4-5-20251001",
        }),
      })) as unknown as typeof fetch
    );

    const spy = vi.spyOn(globalThis, "fetch");
    await anthropicProvider.complete([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Hi" },
    ]);

    const callArgs = spy.mock.calls[0];
    const body = JSON.parse(String((callArgs[1] as RequestInit).body));
    expect(body.system).toMatch(/Be brief/);
    const sentMessages = body.messages as Array<{ role: string }>;
    expect(sentMessages.every((m) => m.role !== "system")).toBe(true);
  });
});

describe("task-level errorCode (transfer endpoint support)", () => {
  beforeEach(() => _clearAllTasks());

  it("transfer task stores the transcript as step input", () => {
    const task = createOrchestratedTask("Chat transfer: 3 messages → anthropic");
    const step = addStep(task.id, "anthropic", JSON.stringify(VALID_TRANSCRIPT))!;
    const updated = getTask(task.id)!;
    expect(updated.steps[0].input).toBe(JSON.stringify(VALID_TRANSCRIPT));
    expect(step.providerId).toBe("anthropic");
  });

  it("failed transfer keeps task-level errorCode (sanitizeTask exposes it)", () => {
    const task = createOrchestratedTask("Chat transfer: 3 messages → anthropic");
    setTaskStatus(task.id, "failed", {
      error: "Provider anthropic is not configured.",
      errorCode: "NOT_CONFIGURED",
    });
    const updated = getTask(task.id)!;
    expect(updated.status).toBe("failed");
    expect(updated.errorCode).toBe("NOT_CONFIGURED");
  });

  it("finishStep records transfer output verbatim", () => {
    const task = createOrchestratedTask("Chat transfer: 3 messages → groq");
    const step = addStep(task.id, "groq", JSON.stringify(VALID_TRANSCRIPT))!;
    finishStep(task.id, step.id, {
      status: "succeeded",
      output: "Samajh gaya, Rishi! Aage batao.",
      model: "llama-3.3-70b-versatile",
    });
    const updated = getTask(task.id)!;
    expect(updated.steps[0].status).toBe("succeeded");
    expect(updated.steps[0].output).toBe("Samajh gaya, Rishi! Aage batao.");
  });
});
