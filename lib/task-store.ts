import postgres from "postgres";
import { randomUUID } from "node:crypto";

export type MiniTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type MiniTask = {
  id: string;
  title: string;
  prompt: string;
  status: MiniTaskStatus;
  result: unknown | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type SqlClient = ReturnType<typeof postgres>;
const globalForMini = globalThis as typeof globalThis & { __miniSql?: SqlClient };

function getSql(): SqlClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured. Add a managed PostgreSQL connection before creating persistent tasks.");
  if (!globalForMini.__miniSql) {
    globalForMini.__miniSql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: process.env.NODE_ENV === "production" ? "require" : false,
      prepare: false,
    });
  }
  return globalForMini.__miniSql;
}

export async function ensureTaskSchema(): Promise<void> {
  const sql = getSql();
  await sql\`
    CREATE TABLE IF NOT EXISTS mini_tasks (
      id text PRIMARY KEY,
      title text NOT NULL,
      prompt text NOT NULL,
      status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
      result jsonb,
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  \`;
  await sql\`CREATE INDEX IF NOT EXISTS mini_tasks_created_at_idx ON mini_tasks (created_at DESC)\`;
}

function mapTask(row: Record<string, unknown>): MiniTask {
  return {
    id: String(row.id),
    title: String(row.title),
    prompt: String(row.prompt),
    status: row.status as MiniTaskStatus,
    result: row.result ?? null,
    error: row.error == null ? null : String(row.error),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function createTask(prompt: string): Promise<MiniTask> {
  const clean = prompt.trim();
  if (clean.length < 3) throw new Error("Task prompt must contain at least 3 characters.");
  if (clean.length > 8000) throw new Error("Task prompt must not exceed 8,000 characters.");
  await ensureTaskSchema();
  const sql = getSql();
  const title = clean.split(/\r?\n/)[0].slice(0, 120) || "Untitled task";
  const rows = await sql\`
    INSERT INTO mini_tasks (id, title, prompt, status)
    VALUES (${randomUUID()}, ${title}, ${clean}, 'queued')
    RETURNING id, title, prompt, status, result, error, created_at, updated_at
  \`;
  return mapTask(rows[0] as Record<string, unknown>);
}

export async function getTask(id: string): Promise<MiniTask | null> {
  await ensureTaskSchema();
  const sql = getSql();
  const rows = await sql\`
    SELECT id, title, prompt, status, result, error, created_at, updated_at
    FROM mini_tasks WHERE id = ${id} LIMIT 1
  \`;
  return rows.length ? mapTask(rows[0] as Record<string, unknown>) : null;
}

export async function listTasks(limit = 20): Promise<MiniTask[]> {
  await ensureTaskSchema();
  const sql = getSql();
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await sql\`
    SELECT id, title, prompt, status, result, error, created_at, updated_at
    FROM mini_tasks ORDER BY created_at DESC LIMIT ${safeLimit}
  \`;
  return rows.map((row) => mapTask(row as Record<string, unknown>));
}
