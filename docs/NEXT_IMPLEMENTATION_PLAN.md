# Mini 2 — Next Implementation Plan
## AI Provider Adapters + Background Task Execution

### Phase A: AI Provider Adapters (after API keys available)

**Goal:** Real API calls to AI providers with streaming, timeouts, error handling.

**Files to create:**
1. `lib/providers/openai.ts` — OpenAI adapter
   - `chat(messages, options)` → calls `https://api.openai.com/v1/chat/completions`
   - Streaming via SSE where supported
   - Timeout: 30s default, configurable
   - Errors: 401 (bad key), 429 (rate limit), 500 (server) → honest messages

2. `lib/providers/gemini.ts` — Google Gemini adapter
   - `chat(messages, options)` → calls `https://generativelanguage.googleapis.com/v1beta/models/...`
   - Same timeout/error patterns

3. `lib/providers/anthropic.ts` — Anthropic Claude adapter
   - `chat(messages, options)` → calls `https://api.anthropic.com/v1/messages`
   - Required headers: `x-api-key`, `anthropic-version`

4. `lib/providers/meta.ts` — Meta Llama adapter
   - Via Meta API or compatible endpoint

5. `app/api/chat/route.ts` — Unified chat endpoint
   - POST with `{ provider, model, messages }`
   - Bearer auth (same as MCP)
   - Returns 503 if provider not configured (honest, not fake)

**Tests (without real keys — mock fetch):**
- Adapter returns correct request format
- Timeout triggers correctly
- 401/429/500 mapped to honest errors
- Missing key → "not configured" (never fake success)

**Tests (with real keys — NOT RUN until user provides):**
- Real API call returns text
- Streaming works
- Token usage reported

**Blockers:** Need API keys from user for: OpenAI, Gemini, Anthropic, Meta (any subset)

---

### Phase B: Background Task Execution (after DB available)

**Goal:** Tasks don't just sit in DB — a worker picks them up and executes.

**Architecture options:**

**Option 1: Vercel Cron + API route (simplest, serverless)**
- `vercel.json`: cron every minute → `GET /api/worker/poll`
- Poll: `SELECT * FROM mini_tasks WHERE status='queued' LIMIT 5`
- For each: set `status='running'`, call AI provider, save result, set `status='completed'` or `'failed'`
- Pros: No extra infra, works on Vercel free
- Cons: 60s granularity, 10s execution limit on Hobby

**Option 2: Trigger.dev (recommended for production)**
- Durable background jobs with retries
- `trigger.config.ts` + `jobs/execute-task.ts`
- Pros: Real retries, longer timeouts, better observability
- Cons: Needs Trigger.dev account + setup

**Option 3: Separate worker process (most control)**
- Node.js script with `setInterval` polling
- Pros: Full control
- Cons: Needs always-on server (not serverless-friendly)

**Recommended:** Start with Option 1 (Vercel Cron), migrate to Option 2 when scale needed.

**Files to create:**
1. `app/api/worker/poll/route.ts` — Cron endpoint
   - Bearer auth (internal secret, not user-facing)
   - Picks up queued tasks, executes via provider, updates status
   - Idempotency: `UPDATE ... WHERE status='queued'` (only one worker wins)

2. `lib/worker.ts` — Execution logic
   - `executeTask(taskId)` → get task, call provider, save result
   - Retry: max 3 attempts with exponential backoff
   - Timeout: 120s per task

3. `vercel.json` — Cron config
   ```json
   { "crons": [{ "path": "/api/worker/poll", "schedule": "* * * * *" }] }
   ```

**Status transitions (only via real execution):**
- `queued` → `running` (worker picks up)
- `running` → `completed` (provider returned result)
- `running` → `failed` (provider error, timeout, or max retries)
- `queued` → `cancelled` (user cancels, only if still queued)

**Tests (without DB — NOT RUN until Neon ready):**
- Poll picks up queued tasks
- Status transitions correct
- Duplicate poll doesn't double-execute (idempotency)
- Failed task retries then marks failed
- Cancel only works on queued tasks

**Blockers:** Need Neon PostgreSQL (Phase 3) + AI provider keys (Phase A)

---

### Execution Order

1. ✅ Phase 2 (this session): Rate limiting, docs, tests, security
2. 🔶 User: GitHub re-auth (unblock pushes)
3. 🔶 User: Neon DB setup (unblock Phase 3 tests)
4. Phase 3: Real DB tests (create, list, persist, concurrent)
5. Phase A: AI adapters (needs API keys from user)
6. Phase B: Background worker (needs DB + AI keys)
7. Phase 6: Dashboard connects to real APIs
8. Phase 8: Final verification

### What I need from Rishi

| Item | Why | When |
|------|-----|------|
| GitHub re-auth | Push 5 local commits | Now |
| Neon DATABASE_URL | Real DB tests | After re-auth |
| AI API keys (any) | Real provider tests | After DB works |
| Trigger.dev account | Production worker (optional) | Later |
| PR merge approval | Merge to main | When all green |
| Deploy approval | Vercel production | When ready |
