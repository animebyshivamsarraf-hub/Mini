/**
 * Phase B tests — provider adapters, task engine, coordinator.
 * No real API keys in tests: Groq without key must return NOT_CONFIGURED honestly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { groqProvider } from "./providers/groq";
import { providerStatusSummary, listProviders } from "./providers/registry";
import {
  createOrchestratedTask,
  getTask,
  addStep,
  finishStep,
  setTaskStatus,
  listTasks,
  _clearAllTasks,
} from "./task-engine";
import { startTask } from "./coordinator";

describe("Groq provider (no key)", () => {
  it("reports not_configured honestly without GROQ_API_KEY", () => {
    // Ensure no key leaks into the test env
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    expect(groqProvider.getStatus()).toBe("not_configured");
    if (saved) process.env.GROQ_API_KEY = saved;
  });

  it("complete() returns NOT_CONFIGURED, never throws", async () => {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    const r = await groqProvider.complete([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("NOT_CONFIGURED");
    expect(r.text).toBeUndefined();
    if (saved) process.env.GROQ_API_KEY = saved;
  });

  it("has a default model and model list", () => {
    expect(groqProvider.getDefaultModel().length).toBeGreaterThan(0);
    expect(groqProvider.listModels().length).toBeGreaterThan(0);
  });
});

describe("provider registry", () => {
  it("lists providers with honest status summaries", () => {
    const summary = providerStatusSummary();
    expect(summary.length).toBeGreaterThan(0);
    for (const p of summary) {
      expect(["configured", "not_configured", "error"]).toContain(p.status);
      expect(p.id).toBeTruthy();
      expect(p.displayName).toBeTruthy();
    }
  });

  it("listProviders returns AIProvider instances", () => {
    for (const p of listProviders()) {
      expect(typeof p.complete).toBe("function");
      expect(typeof p.getStatus).toBe("function");
    }
  });
});

describe("task engine", () => {
  beforeEach(() => _clearAllTasks());

  it("creates a task in queued state", () => {
    const t = createOrchestratedTask("do something");
    expect(t.status).toBe("queued");
    expect(t.steps).toHaveLength(0);
    expect(t.prompt).toBe("do something");
  });

  it("adds and finishes steps", () => {
    const t = createOrchestratedTask("test");
    const s = addStep(t.id, "groq", "first instruction");
    expect(s).toBeDefined();
    expect(s!.status).toBe("pending");
    finishStep(t.id, s!.id, { status: "succeeded", output: "done it" });
    const updated = getTask(t.id)!;
    expect(updated.steps[0].status).toBe("succeeded");
    expect(updated.steps[0].output).toBe("done it");
  });

  it("transitions task status", () => {
    const t = createOrchestratedTask("test");
    setTaskStatus(t.id, "running");
    expect(getTask(t.id)!.status).toBe("running");
    setTaskStatus(t.id, "completed", { result: "all done" });
    const done = getTask(t.id)!;
    expect(done.status).toBe("completed");
    expect(done.result).toBe("all done");
  });

  it("lists tasks newest first", async () => {
    createOrchestratedTask("first");
    // Ensure distinct timestamps for stable ordering
    await new Promise((r) => setTimeout(r, 5));
    createOrchestratedTask("second");
    const list = listTasks();
    expect(list[0].prompt).toBe("second");
  });
});

describe("coordinator startTask validation", () => {
  beforeEach(() => _clearAllTasks());

  it("rejects too-short prompts", () => {
    expect(() => startTask("ab")).toThrow();
  });

  it("rejects too-long prompts", () => {
    expect(() => startTask("x".repeat(4001))).toThrow();
  });

  it("creates a valid task", () => {
    const t = startTask("Build me a website plan");
    expect(t.prompt).toBe("Build me a website plan");
    expect(t.status).toBe("queued");
    expect(t.maxSteps).toBe(6);
  });
});
