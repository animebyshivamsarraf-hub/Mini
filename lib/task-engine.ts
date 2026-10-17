/**
 * Task Engine — Mini 2 AI-to-AI orchestration state machine.
 *
 * A task is a multi-step workflow:
 *   Mini → Provider A → Mini → Provider B → Mini → done
 *
 * Every step's input/output/status is recorded. Nothing is marked
 * completed unless a REAL result was verified.
 *
 * Persistence: in-memory by default. When DATABASE_URL is configured,
 * tasks + steps are also saved to PostgreSQL via lib/orchestration-store.ts
 * (fire-and-forget after each mutation; loaded on cache miss).
 */

// Lazy import to avoid circular deps + keep sync API
function persistTask(taskId: string): void {
  try {
    const task = tasks.get(taskId);
    if (!task) return;
    // Fire-and-forget: don't block the response on DB write
    import("./orchestration-store").then((m) => m.saveTask(task)).catch(() => {});
  } catch {
    // Persistence is best-effort; in-memory remains source of truth
  }
}

export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface WorkflowStep {
  id: string;
  /** Which provider handled it, e.g. "groq" */
  providerId: string;
  /** What Mini asked the provider to do */
  input: string;
  /** The provider's ACTUAL response (only when succeeded) */
  output?: string;
  status: StepStatus;
  errorCode?: string;
  error?: string;
  model?: string;
  latencyMs?: number;
  startedAt: string;
  finishedAt?: string;
}

export interface OrchestratedTask {
  id: string;
  /** The user's original instruction */
  prompt: string;
  status: TaskStatus;
  steps: WorkflowStep[];
  /** Safety bounds */
  maxSteps: number;
  /** Final verified result (only when status=completed) */
  result?: string;
  error?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/** In-memory store. Honest: lost on restart unless DB is configured. */
const tasks = new Map<string, OrchestratedTask>();

export function createOrchestratedTask(
  prompt: string,
  maxSteps = 6
): OrchestratedTask {
  const now = new Date().toISOString();
  const task: OrchestratedTask = {
    id: newId("otask"),
    prompt,
    status: "queued",
    steps: [],
    maxSteps,
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(task.id, task);
  persistTask(task.id);
  return task;
}

export function getTask(id: string): OrchestratedTask | undefined {
  return tasks.get(id);
}

/**
 * Async get: checks in-memory first, then PostgreSQL on cache miss.
 * Use in API routes where the task may have been created by another instance.
 */
export async function getTaskAsync(id: string): Promise<OrchestratedTask | undefined> {
  const cached = tasks.get(id);
  if (cached) return cached;
  try {
    const m = await import("./orchestration-store");
    const loaded = await m.loadTask(id);
    if (loaded) {
      tasks.set(loaded.id, loaded);
      return loaded;
    }
  } catch {
    // DB unavailable — return undefined
  }
  return undefined;
}

export function listTasks(limit = 20): OrchestratedTask[] {
  return [...tasks.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function addStep(
  taskId: string,
  providerId: string,
  input: string
): WorkflowStep | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;
  const step: WorkflowStep = {
    id: newId("step"),
    providerId,
    input,
    status: "pending",
    startedAt: new Date().toISOString(),
  };
  task.steps.push(step);
  task.updatedAt = new Date().toISOString();
  persistTask(taskId);
  return step;
}

export function finishStep(
  taskId: string,
  stepId: string,
  outcome: {
    status: "succeeded" | "failed" | "skipped";
    output?: string;
    errorCode?: string;
    error?: string;
    model?: string;
    latencyMs?: number;
  }
): void {
  const task = tasks.get(taskId);
  const step = task?.steps.find((s) => s.id === stepId);
  if (!task || !step) return;
  step.status = outcome.status;
  step.output = outcome.output;
  step.errorCode = outcome.errorCode;
  step.error = outcome.error;
  step.model = outcome.model;
  step.latencyMs = outcome.latencyMs;
  step.finishedAt = new Date().toISOString();
  task.updatedAt = step.finishedAt;
  persistTask(taskId);
}

export function setTaskStatus(
  taskId: string,
  status: TaskStatus,
  extra?: { result?: string; error?: string; errorCode?: string }
): void {
  const task = tasks.get(taskId);
  if (!task) return;
  task.status = status;
  if (extra?.result !== undefined) task.result = extra.result;
  if (extra?.error !== undefined) task.error = extra.error;
  if (extra?.errorCode !== undefined) task.errorCode = extra.errorCode;
  task.updatedAt = new Date().toISOString();
  persistTask(taskId);
}

/** For tests: clear all in-memory tasks */
export function _clearAllTasks(): void {
  tasks.clear();
  seq = 0;
}
