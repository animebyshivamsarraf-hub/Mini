import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  if (!sql) sql = postgres(url, { max: 5, idle_timeout: 20 });
  return sql;
}

export async function ensureTaskTable() {
  const db = getDb();
  await db`
    CREATE TABLE IF NOT EXISTS mini_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

export interface CreatedTask {
  id: string;
  status: string;
}

export async function createTask(prompt: string): Promise<CreatedTask> {
  const db = getDb();
  await ensureTaskTable();
  const rows = await db`
    INSERT INTO mini_tasks (prompt, status)
    VALUES (${prompt}, 'queued')
    RETURNING id::text AS id, status
  `;
  const row = rows[0] as unknown as CreatedTask;
  if (!row?.id) throw new Error("Task insert did not return an id");
  return { id: row.id, status: row.status };
}
