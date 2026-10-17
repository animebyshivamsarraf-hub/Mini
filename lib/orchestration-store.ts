/**
 * Orchestration Task Persistence — PostgreSQL (optional)
 *
 * If DATABASE_URL is set: tasks + steps are saved to Postgres after each
 * mutation and loaded on cache miss. Without it: in-memory only (with warning).
 *
 * Serverless note: Vercel functions are stateless. Without a database,
 * tasks created in one invocation are invisible to the next. Set DATABASE_URL
 * (e.g. Neon) for durable orchestration.
 */
import type { OrchestratedTask, WorkflowStep } from "./task-engine";

type SqlClient = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

let sqlClient: SqlClient | null = null;
let warnedMissing = false;

async function getSql(): Promise<SqlClient | null> {
  if (sqlClient) return sqlClient;
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (!warnedMissing) {
      console.warn(
        "[orchestration-store] DATABASE_URL not set — tasks are in-memory only and will be lost on restart."
      );
      warnedMissing = true;
    }
    return null;
  }
  try {
    const { default: postgres } = await import("postgres");
    sqlClient = postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10 }) as unknown as SqlClient;
    return sqlClient;
  } catch (err) {
    console.error("[orchestration-store] Failed to init postgres client:", err);
    return null;
  }
}

export function isPersistenceConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

/** Save a task + its steps (upsert). Fire-and-forget safe. */
export async function saveTask(task: OrchestratedTask): Promise<void> {
  const sql = await getSql();
  if (!sql) return;
  try {
    await sql`
      INSERT INTO orchestration_tasks (id, prompt, status, max_steps, result, error, error_code, created_at, updated_at)
      VALUES (${task.id}, ${task.prompt}, ${task.status}, ${task.maxSteps}, ${task.result ?? null}, ${task.error ?? null}, ${task.errorCode ?? null}, ${task.createdAt}, ${task.updatedAt})
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        result = EXCLUDED.result,
        error = EXCLUDED.error,
        error_code = EXCLUDED.error_code,
        updated_at = EXCLUDED.updated_at
    `;
    // Replace steps wholesale (simple + correct for our write pattern)
    await sql`DELETE FROM orchestration_steps WHERE task_id = ${task.id}`;
    for (let i = 0; i < task.steps.length; i++) {
      const s = task.steps[i];
      await sql`
        INSERT INTO orchestration_steps (id, task_id, provider_id, input, output, status, error_code, error, model, latency_ms, started_at, finished_at, step_index)
        VALUES (${s.id}, ${task.id}, ${s.providerId}, ${s.input}, ${s.output ?? null}, ${s.status}, ${s.errorCode ?? null}, ${s.error ?? null}, ${s.model ?? null}, ${s.latencyMs ?? null}, ${s.startedAt}, ${s.finishedAt ?? null}, ${i})
      `;
    }
  } catch (err) {
    console.error("[orchestration-store] saveTask failed:", err);
  }
}

type TaskRow = {
  id: string;
  prompt: string;
  status: string;
  max_steps: number;
  result: string | null;
  error: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};

type StepRow = {
  id: string;
  provider_id: string;
  input: string;
  output: string | null;
  status: string;
  error_code: string | null;
  error: string | null;
  model: string | null;
  latency_ms: number | null;
  started_at: string;
  finished_at: string | null;
};

/** Load a task + steps from DB. Returns null if not found or DB unavailable. */
export async function loadTask(taskId: string): Promise<OrchestratedTask | null> {
  const sql = await getSql();
  if (!sql) return null;
  try {
    const taskRows = (await sql`SELECT * FROM orchestration_tasks WHERE id = ${taskId} LIMIT 1`) as unknown as TaskRow[];
    if (taskRows.length === 0) return null;
    const t = taskRows[0];
    const stepRows = (await sql`SELECT * FROM orchestration_steps WHERE task_id = ${taskId} ORDER BY step_index ASC`) as unknown as StepRow[];
    const steps: WorkflowStep[] = stepRows.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      input: r.input,
      output: r.output ?? undefined,
      status: r.status as WorkflowStep["status"],
      errorCode: r.error_code ?? undefined,
      error: r.error ?? undefined,
      model: r.model ?? undefined,
      latencyMs: r.latency_ms ?? undefined,
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? undefined,
    }));
    return {
      id: t.id,
      prompt: t.prompt,
      status: t.status as OrchestratedTask["status"],
      maxSteps: t.max_steps,
      result: t.result ?? undefined,
      error: t.error ?? undefined,
      errorCode: t.error_code ?? undefined,
      steps,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  } catch (err) {
    console.error("[orchestration-store] loadTask failed:", err);
    return null;
  }
}
