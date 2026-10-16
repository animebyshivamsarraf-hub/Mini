"use client";
import { useState, useEffect, useRef } from "react";

/**
 * Mini 2 — Mobile-first AI-to-AI Orchestration
 *
 * Main screen: big input → Start → live workflow timeline → result.
 * Advanced settings live on secondary screens (not here).
 */

type ProviderInfo = {
  id: string;
  displayName: string;
  status: "configured" | "not_configured" | "error";
  defaultModel: string;
};

type Step = {
  id: string;
  providerId: string;
  input: string;
  output?: string;
  status: string;
  error?: string;
  errorCode?: string;
  model?: string;
  latencyMs?: number;
};

type Task = {
  id: string;
  prompt: string;
  status: string;
  result?: string;
  error?: string;
  steps: Step[];
};

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export default function MiniOrchestrator() {
  const [token, setToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [prompt, setPrompt] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; prompt: string; status: string; steps: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Load saved token
  useEffect(() => {
    const t = localStorage.getItem("mini_token") ?? "";
    if (t) {
      setToken(t);
      setTokenSaved(true);
    }
  }, []);

  const saveToken = () => {
    localStorage.setItem("mini_token", token.trim());
    setTokenSaved(true);
    setError("");
    loadProviders(token.trim());
    loadHistory(token.trim());
  };

  const callApi = async (action: string, extra: Record<string, string> = {}) => {
    const res = await fetch("/api/orchestrate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  };

  const loadProviders = async (tok: string) => {
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ action: "providers" }),
      });
      const data = await res.json();
      if (data.ok) setProviders(data.providers);
    } catch {
      /* offline — leave empty */
    }
  };

  const loadHistory = async (tok: string) => {
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ action: "history" }),
      });
      const data = await res.json();
      if (data.ok) setHistory(data.tasks);
    } catch {
      /* offline */
    }
  };

  useEffect(() => {
    if (tokenSaved && token) {
      loadProviders(token);
      loadHistory(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenSaved]);

  // Auto-scroll timeline to latest step
  useEffect(() => {
    timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [task?.steps.length]);

  /** Start a task, then drive steps until terminal state */
  const startTask = async () => {
    const p = prompt.trim();
    if (p.length < 3) {
      setError("Kuch likho — kam se kam 3 akshar.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const data = await callApi("start", { prompt: p });
      let current: Task = data.task;
      setTask(current);
      setPrompt("");

      // Drive the loop: one HTTP call per AI step (serverless-safe)
      while (!TERMINAL.has(current.status)) {
        const stepData = await callApi("step", { taskId: current.id });
        current = stepData.task;
        setTask({ ...current });
        // Small pause so the UI breathes between steps
        await new Promise((r) => setTimeout(r, 400));
      }
      loadHistory(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Task start failed.");
    } finally {
      setBusy(false);
    }
  };

  const cancelTask = async () => {
    if (!task) return;
    try {
      const data = await callApi("cancel", { taskId: task.id });
      setTask(data.task);
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed.");
    }
  };

  const openTask = async (id: string) => {
    try {
      const data = await callApi("status", { taskId: id });
      setTask(data.task);
      setShowHistory(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    }
  };

  const configuredCount = providers.filter((p) => p.status === "configured").length;

  const statusColor = (s: string) => {
    if (s === "completed" || s === "succeeded") return "#16a34a";
    if (s === "failed") return "#dc2626";
    if (s === "running") return "#2563eb";
    if (s === "waiting_approval") return "#d97706";
    if (s === "cancelled" || s === "paused") return "#6b7280";
    return "#9333ea";
  };

  // ── Token gate ──────────────────────────────────────────────
  if (!tokenSaved) {
    return (
      <main className="mini-root">
        <div className="mini-card mini-center">
          <div className="mini-logo">🤖</div>
          <h1>Mini 2</h1>
          <p className="mini-muted">AI-to-AI orchestration — apne phone se AI se kaam karvao.</p>
          <input
            type="password"
            className="mini-input"
            placeholder="API token paste karo"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
          <button className="mini-btn-primary" onClick={saveToken} disabled={!token.trim()}>
            Connect
          </button>
          <p className="mini-tiny">Token sirf is browser me save hota hai.</p>
        </div>
      </main>
    );
  }

  // ── Main orchestration UI ─────────────────────────────────────
  return (
    <main className="mini-root">
      {/* Header */}
      <header className="mini-header">
        <div>
          <div className="mini-title">🤖 Mini 2</div>
          <div className="mini-sub">
            {configuredCount > 0 ? (
              <span className="mini-ok">● {configuredCount} AI connected</span>
            ) : (
              <span className="mini-warn">● Koi AI connected nahi</span>
            )}
          </div>
        </div>
        <button className="mini-btn-ghost" onClick={() => setShowHistory(!showHistory)}>
          📋 History
        </button>
      </header>

      {/* Provider status strip */}
      {providers.length > 0 && (
        <div className="mini-providers">
          {providers.map((p) => (
            <span
              key={p.id}
              className={`mini-chip ${p.status === "configured" ? "chip-ok" : "chip-off"}`}
              title={p.status === "configured" ? p.defaultModel : "API key set karo (server env)"}
            >
              {p.status === "configured" ? "●" : "○"} {p.displayName}
            </span>
          ))}
        </div>
      )}
      {configuredCount === 0 && providers.length > 0 && (
        <div className="mini-notice">
          ⚠️ Koi AI provider configured nahi hai. Server par <code>GROQ_API_KEY</code> set karo
          (console.groq.com — free). Bina key ke task run nahi hoga.
        </div>
      )}

      {/* Task input */}
      {!task && (
        <div className="mini-card">
          <label className="mini-label">Mini, kya kaam karna hai?</label>
          <textarea
            className="mini-input mini-textarea"
            placeholder="e.g. Mere liye ek simple website ka plan banao…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
          <button
            className="mini-btn-primary mini-btn-big"
            onClick={startTask}
            disabled={busy || !prompt.trim()}
          >
            {busy ? "⏳ Shuru ho raha…" : "▶ Start Task"}
          </button>
          {error && <div className="mini-error">{error}</div>}
        </div>
      )}

      {/* Live task */}
      {task && (
        <div className="mini-card">
          <div className="mini-task-head">
            <div>
              <div className="mini-label">Task</div>
              <div className="mini-prompt">{task.prompt}</div>
            </div>
            <span className="mini-status" style={{ background: statusColor(task.status) + "22", color: statusColor(task.status) }}>
              {task.status.replace("_", " ")}
            </span>
          </div>

          {/* Timeline */}
          <div className="mini-timeline" ref={timelineRef}>
            {task.steps.length === 0 && task.status === "queued" && (
              <div className="mini-muted">Coordinator soch raha hai…</div>
            )}
            {task.steps.map((s, i) => (
              <div key={s.id} className="mini-step">
                <div className="mini-step-head">
                  <span className="mini-step-num">Step {i + 1}</span>
                  <span className="mini-chip">🤖 {s.providerId}</span>
                  <span className="mini-status-sm" style={{ color: statusColor(s.status) }}>
                    {s.status}
                  </span>
                </div>
                <div className="mini-step-input">❯ {s.input}</div>
                {s.output && <div className="mini-step-output">{s.output}</div>}
                {s.error && <div className="mini-step-error">⚠ {s.error}</div>}
                {s.latencyMs != null && (
                  <div className="mini-tiny">{s.model ?? ""} · {(s.latencyMs / 1000).toFixed(1)}s</div>
                )}
              </div>
            ))}
          </div>

          {/* Result / error */}
          {task.status === "completed" && task.result && (
            <div className="mini-result">
              <div className="mini-label">✅ Final Result</div>
              <div className="mini-result-text">{task.result}</div>
            </div>
          )}
          {task.status === "failed" && task.error && (
            <div className="mini-error-box">
              <div className="mini-label">❌ Failed</div>
              <div>{task.error}</div>
            </div>
          )}
          {task.status === "waiting_approval" && task.error && (
            <div className="mini-notice">
              <div className="mini-label">✋ Approval chahiye</div>
              <div>{task.error}</div>
            </div>
          )}

          {/* Controls */}
          <div className="mini-controls">
            {!TERMINAL.has(task.status) ? (
              <>
                <button className="mini-btn-danger" onClick={cancelTask} disabled={busy && false}>
                  ⏹ Cancel
                </button>
                {busy && <span className="mini-muted mini-tiny">AI kaam kar raha hai…</span>}
              </>
            ) : (
              <button
                className="mini-btn-primary"
                onClick={() => {
                  setTask(null);
                  setError("");
                }}
              >
                + Naya Task
              </button>
            )}
          </div>
          {error && <div className="mini-error">{error}</div>}
        </div>
      )}

      {/* History drawer */}
      {showHistory && (
        <div className="mini-card">
          <div className="mini-label">📋 Task History</div>
          {history.length === 0 && <div className="mini-muted">Abhi koi task nahi.</div>}
          {history.map((h) => (
            <button key={h.id} className="mini-history-item" onClick={() => openTask(h.id)}>
              <span className="mini-dot" style={{ background: statusColor(h.status) }} />
              <span className="mini-history-prompt">{h.prompt}</span>
              <span className="mini-tiny">{h.steps} steps · {h.status}</span>
            </button>
          ))}
        </div>
      )}

      <footer className="mini-footer">
        <button
          className="mini-btn-ghost mini-tiny"
          onClick={() => {
            localStorage.removeItem("mini_token");
            setTokenSaved(false);
            setToken("");
          }}
        >
          Disconnect
        </button>
      </footer>

      <style jsx>{`
        .mini-root { max-width: 640px; margin: 0 auto; padding: 12px; font-family: system-ui, sans-serif; background: #0f172a; min-height: 100vh; color: #e2e8f0; }
        .mini-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .mini-title { font-size: 22px; font-weight: 700; }
        .mini-sub { font-size: 13px; margin-top: 2px; }
        .mini-ok { color: #4ade80; } .mini-warn { color: #fbbf24; }
        .mini-card { background: #1e293b; border-radius: 14px; padding: 16px; margin-bottom: 12px; }
        .mini-center { text-align: center; margin-top: 60px; }
        .mini-logo { font-size: 48px; }
        .mini-muted { color: #94a3b8; font-size: 14px; }
        .mini-tiny { font-size: 12px; color: #94a3b8; }
        .mini-label { font-size: 14px; font-weight: 600; margin-bottom: 8px; display: block; }
        .mini-input { width: 100%; background: #0f172a; border: 1px solid #334155; color: #e2e8f0; border-radius: 10px; padding: 12px; font-size: 16px; box-sizing: border-box; }
        .mini-textarea { resize: vertical; min-height: 70px; }
        .mini-btn-primary { background: #2563eb; color: white; border: none; border-radius: 10px; padding: 12px 20px; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 10px; width: 100%; }
        .mini-btn-primary:disabled { background: #475569; cursor: not-allowed; }
        .mini-btn-big { padding: 15px; font-size: 18px; }
        .mini-btn-danger { background: #7f1d1d; color: #fecaca; border: 1px solid #dc2626; border-radius: 10px; padding: 10px 18px; font-size: 15px; cursor: pointer; }
        .mini-btn-ghost { background: transparent; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; font-size: 14px; cursor: pointer; }
        .mini-providers { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .mini-chip { font-size: 13px; padding: 6px 10px; border-radius: 20px; background: #1e293b; border: 1px solid #334155; }
        .chip-ok { color: #4ade80; border-color: #166534; }
        .chip-off { color: #94a3b8; }
        .mini-notice { background: #451a03; border: 1px solid #92400e; color: #fdba74; border-radius: 10px; padding: 12px; font-size: 14px; margin-bottom: 12px; }
        .mini-notice code { background: #00000055; padding: 2px 6px; border-radius: 4px; }
        .mini-error { color: #f87171; font-size: 14px; margin-top: 8px; }
        .mini-error-box { background: #450a0a; border: 1px solid #991b1b; border-radius: 10px; padding: 12px; margin-top: 12px; font-size: 14px; }
        .mini-task-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 12px; }
        .mini-prompt { font-size: 15px; font-weight: 500; }
        .mini-status { font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: capitalize; white-space: nowrap; }
        .mini-timeline { display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; }
        .mini-step { background: #0f172a; border-radius: 10px; padding: 12px; border-left: 3px solid #2563eb; }
        .mini-step-head { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
        .mini-step-num { font-weight: 700; font-size: 13px; }
        .mini-status-sm { font-size: 12px; font-weight: 600; text-transform: capitalize; }
        .mini-step-input { font-size: 14px; color: #cbd5e1; margin-bottom: 6px; }
        .mini-step-output { font-size: 14px; background: #052e16; border-radius: 8px; padding: 10px; white-space: pre-wrap; word-break: break-word; }
        .mini-step-error { font-size: 13px; color: #fca5a5; }
        .mini-result { background: #052e16; border: 1px solid #166534; border-radius: 10px; padding: 12px; margin-top: 12px; }
        .mini-result-text { font-size: 15px; white-space: pre-wrap; word-break: break-word; }
        .mini-controls { display: flex; gap: 10px; margin-top: 14px; align-items: center; }
        .mini-history-item { display: flex; gap: 8px; align-items: center; width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 10px; margin-top: 8px; cursor: pointer; color: #e2e8f0; text-align: left; }
        .mini-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .mini-history-prompt { flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mini-footer { text-align: center; margin-top: 20px; padding-bottom: 20px; }
      `}</style>
    </main>
  );
}
