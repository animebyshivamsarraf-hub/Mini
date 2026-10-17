-- Mini 2 Orchestration Tasks — PostgreSQL schema
-- Run this once on your database (e.g. Neon) then set DATABASE_URL in Vercel.

CREATE TABLE IF NOT EXISTS orchestration_tasks (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  max_steps INTEGER NOT NULL DEFAULT 6,
  result TEXT,
  error TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orchestration_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES orchestration_tasks(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error TEXT,
  model TEXT,
  latency_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  step_index INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orch_steps_task ON orchestration_steps(task_id, step_index);
CREATE INDEX IF NOT EXISTS idx_orch_tasks_updated ON orchestration_tasks(updated_at DESC);
