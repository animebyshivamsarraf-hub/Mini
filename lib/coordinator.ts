/**
 * Coordinator — decides the NEXT step in an AI-to-AI workflow.
 *
 * The coordinator never pretends. It only routes to providers whose
 * status is "configured" (real credential present). If none are
 * configured, it returns a clear NEEDS_SETUP decision — not a fake run.
 */

import { getProvider, listProviders } from "./providers/registry";
import {
  addStep,
  createOrchestratedTask,
  finishStep,
  getTask,
  setTaskStatus,
  type OrchestratedTask,
  type TaskStatus,
} from "./task-engine";

export type CoordinatorDecision =
  | { kind: "run_provider"; providerId: string; input: string; reason: string }
  | { kind: "complete"; result: string; reason: string; providerId: string; model?: string; latencyMs?: number }
  | { kind: "fail"; error: string; reason: string }
  | { kind: "needs_setup"; missing: string[]; reason: string }
  | { kind: "needs_approval"; question: string; reason: string };

const COORDINATOR_SYSTEM = `You are Mini, a task coordinator. You route work between AI providers.
Rules:
- Break the user's goal into ONE concrete next step at a time.
- Reply in JSON only: {"action":"ask_provider","instruction":"..."} or {"action":"done","result":"..."} or {"action":"ask_user","question":"..."}
- "ask_provider": give a precise instruction for the next AI step.
- "done": only when the goal is fully achieved with verified output.
- "ask_user": when you need a decision, credential, or approval before proceeding.
- Keep instructions short and actionable. No fluff.`;

/**
 * Decide the next step for a task.
 * Uses the coordinator provider (first configured) to plan.
 */
export async function decideNextStep(
  task: OrchestratedTask
): Promise<CoordinatorDecision> {
  const configured = listProviders().filter(
    (p) => p.getStatus() === "configured"
  );

  if (configured.length === 0) {
    return {
      kind: "needs_setup",
      missing: listProviders().map((p) => p.id),
      reason:
        "No AI provider is configured. Set GROQ_API_KEY (free at console.groq.com) as a server-side env var.",
    };
  }

  // Safety: bounded iterations
  if (task.steps.length >= task.maxSteps) {
    return {
      kind: "fail",
      error: `Step budget exhausted (${task.maxSteps} steps). Task stopped safely.`,
      reason: "max_steps_reached",
    };
  }

  const planner = configured[0];

  // Build context: original goal + what happened so far
  const history = task.steps
    .map((s, i) => {
      const out =
        s.status === "succeeded"
          ? `OUTPUT: ${s.output?.slice(0, 2000) ?? ""}`
          : `FAILED: ${s.error ?? s.errorCode}`;
      return `Step ${i + 1} [${s.providerId}]: ${s.input}\n${out}`;
    })
    .join("\n\n");

  const planningPrompt = task.steps.length === 0
    ? `User goal: ${task.prompt}\n\nThis is step 1. What is the first concrete AI step?`
    : `User goal: ${task.prompt}\n\nSteps so far:\n${history}\n\nWhat is the next step? If the goal is fully achieved, return done with the final result.`;

  const plan = await planner.complete(
    [{ role: "user", content: planningPrompt }],
    { systemPrompt: COORDINATOR_SYSTEM, maxTokens: 800, timeoutMs: 30_000 }
  );

  if (!plan.ok) {
    return {
      kind: "fail",
      error: `Coordinator (planner) call failed: ${plan.error}`,
      reason: plan.errorCode ?? "planner_error",
    };
  }

  // Parse the planner's JSON decision
  let parsed: { action?: string; instruction?: string; result?: string; question?: string };
  try {
    const jsonMatch = plan.text!.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? "{}");
  } catch {
    // Planner didn't return JSON — treat its text as the next instruction
    parsed = { action: "ask_provider", instruction: plan.text!.slice(0, 2000) };
  }

  if (parsed.action === "done") {
    return {
      kind: "complete",
      result: parsed.result ?? "Task completed.",
      reason: "planner_verified_done",
      providerId: planner.id,
      model: plan.model,
      latencyMs: plan.latencyMs,
    };
  }

  if (parsed.action === "ask_user") {
    return {
      kind: "needs_approval",
      question: parsed.question ?? "Coordinator needs your input to continue.",
      reason: "planner_asked_user",
    };
  }

  // Default: run the next step on the first configured provider.
  // (Phase D will add multi-provider routing: Mini → A → Mini → B.)
  return {
    kind: "run_provider",
    providerId: planner.id,
    input: parsed.instruction ?? plan.text!.slice(0, 2000),
    reason: "planner_next_step",
  };
}

/**
 * Execute ONE step of a task: decide → run provider → record.
 * Returns the updated task. Never marks complete without a real result.
 */
export async function runOneStep(taskId: string): Promise<OrchestratedTask | undefined> {
  const task = getTask(taskId);
  if (!task) return undefined;
  if (task.status === "paused" || task.status === "cancelled" || task.status === "completed") {
    return task;
  }

  setTaskStatus(taskId, "running");
  const decision = await decideNextStep(task);

  switch (decision.kind) {
    case "needs_setup":
      setTaskStatus(taskId, "failed", { error: decision.reason });
      return getTask(taskId);

    case "fail":
      setTaskStatus(taskId, "failed", { error: decision.error });
      return getTask(taskId);

    case "complete": {
      // Record the planner's work as a step (fixes empty steps array + model attribution)
      const step = addStep(taskId, decision.providerId, `Coordinator finalization: ${task.prompt.slice(0, 200)}`);
      if (step) {
        finishStep(taskId, step.id, {
          status: "succeeded",
          output: decision.result,
          model: decision.model,
          latencyMs: decision.latencyMs,
        });
      }
      setTaskStatus(taskId, "completed", { result: decision.result });
      return getTask(taskId);
    }

    case "needs_approval":
      setTaskStatus(taskId, "waiting_approval", { error: decision.question });
      return getTask(taskId);

    case "run_provider": {
      const provider = getProvider(decision.providerId);
      if (!provider || provider.getStatus() !== "configured") {
        setTaskStatus(taskId, "failed", {
          error: `Provider ${decision.providerId} is not configured.`,
        });
        return getTask(taskId);
      }

      const step = addStep(taskId, decision.providerId, decision.input);
      if (!step) return getTask(taskId);

      const result = await provider.complete(
        [{ role: "user", content: decision.input }],
        { timeoutMs: 60_000, maxTokens: 2000 }
      );

      finishStep(taskId, step.id, {
        status: result.ok ? "succeeded" : "failed",
        output: result.text,
        errorCode: result.errorCode,
        error: result.error,
        model: result.model,
        latencyMs: result.latencyMs,
      });

      if (!result.ok) {
        // Provider step failed — stop honestly, don't fake continuation
        setTaskStatus(taskId, "failed", {
          error: `Step failed on ${decision.providerId}: ${result.error}`,
        });
        return getTask(taskId);
      }

      // Step succeeded — ask planner if the goal is now achieved.
      // This prevents tasks stuck in "running" after their final step.
      const followUp = await decideNextStep(getTask(taskId)!);
      if (followUp.kind === "complete") {
        const doneStep = addStep(
          taskId,
          followUp.providerId,
          `Coordinator finalization: ${getTask(taskId)!.prompt.slice(0, 200)}`
        );
        if (doneStep) {
          finishStep(taskId, doneStep.id, {
            status: "succeeded",
            output: followUp.result,
            model: followUp.model,
            latencyMs: followUp.latencyMs,
          });
        }
        setTaskStatus(taskId, "completed", { result: followUp.result });
        return getTask(taskId);
      }
      if (followUp.kind === "fail") {
        setTaskStatus(taskId, "failed", { error: followUp.error });
        return getTask(taskId);
      }
      if (followUp.kind === "needs_approval") {
        setTaskStatus(taskId, "waiting_approval", { error: followUp.question });
        return getTask(taskId);
      }
      // else: planner wants another provider step — stays "running"
      return getTask(taskId);
    }
  }
}

/** Start a new orchestrated task from a user prompt */
export function startTask(prompt: string, maxSteps = 6): OrchestratedTask {
  const clean = prompt.trim();
  if (clean.length < 3) {
    throw new Error("Prompt too short (min 3 chars).");
  }
  if (clean.length > 4000) {
    throw new Error("Prompt too long (max 4000 chars).");
  }
  return createOrchestratedTask(clean, maxSteps);
}
