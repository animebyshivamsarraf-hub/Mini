"use client";
import { useState, useEffect } from "react";

type Task = {
  id: string; title: string; prompt: string; status: string;
  created_at: string; error?: string | null;
};

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "🏠" },
  { id: "workspace", label: "Workspace", icon: "💬" },
  { id: "tasks", label: "Tasks", icon: "📋" },
  { id: "providers", label: "Providers", icon: "🤖" },
  { id: "mcp", label: "MCP Servers", icon: "🔌" },
  { id: "integrations", label: "Integrations", icon: "🧩" },
  { id: "automations", label: "Automations", icon: "⚡" },
  { id: "activity", label: "Activity", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙️" },
  { id: "help", label: "Help & Health", icon: "💚" },
];

const PROVIDERS = [
  { name: "OpenAI", desc: "GPT-4o, GPT-4o mini, GPT-4", icon: "🧠", connected: false, note: "Not configured" },
  { name: "Google Gemini", desc: "Gemini 1.5 Pro, Flash", icon: "✨", connected: false, note: "Not configured" },
  { name: "Anthropic Claude", desc: "Claude 3.5 Sonnet, Opus", icon: "🅰️", connected: false, note: "Not configured" },
  { name: "Meta Llama", desc: "Llama 3.1, 3.2", icon: "🦙", connected: false, note: "Not configured" },
];

const MCP_SERVERS = [
  { name: "GitHub MCP", desc: "Access repositories, create PRs, manage issues", icon: "🐙", tools: 12, connected: false },
  { name: "Playwright MCP", desc: "Browser automation and testing", icon: "🎭", tools: 8, connected: false },
  { name: "Filesystem MCP", desc: "Read and write files", icon: "📁", tools: 6, connected: false },
  { name: "Custom MCP", desc: "Your custom MCP server", icon: "🔧", tools: 0, connected: false },
];

const INTEGRATIONS = [
  { name: "Google Drive", icon: "📦" }, { name: "Gmail", icon: "📧" },
  { name: "Google Calendar", icon: "📅" }, { name: "Google Docs", icon: "📄" },
  { name: "Google Sheets", icon: "📊" }, { name: "GitHub", icon: "🐙" },
  { name: "Slack", icon: "💬" }, { name: "Notion", icon: "📝" },
];

function StatusPill({ status }: { status: string }) {
  const cls = { running: "pill-running", completed: "pill-completed", queued: "pill-queued", failed: "pill-failed", cancelled: "pill-cancelled" }[status] || "pill-queued";
  return <span className={`mini-pill ${cls}`}><span className="dot" />{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function ConnPill({ connected }: { connected: boolean }) {
  return connected
    ? <span className="mini-pill pill-connected">Connected</span>
    : <span className="mini-pill pill-not-configured">Not configured</span>;
}

export default function MiniDashboard() {
  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<{ role: string; text: string }[]>([
    { role: "ai", text: "Namaste! Main Mini AI hun. Koi task banao ya sawal puchho." },
  ]);
  const [automations, setAutomations] = useState([
    { name: "Daily Report", sched: "Runs every day at 9:00 AM", last: "Last run: 2h ago", on: true },
    { name: "Weekly Analysis", sched: "Runs every Monday at 10:00 AM", last: "Last run: 1d ago", on: true },
    { name: "Content Generator", sched: "Runs every day at 6:00 PM", last: "Never run", on: false },
    { name: "Backup Task", sched: "Runs every Sunday at 12:00 AM", last: "Last run: 7d ago", on: false },
  ]);

  useEffect(() => { loadTasks(); }, []);
  async function loadTasks() {
    setTasksLoading(true); setTasksError("");
    try {
      const r = await fetch("/api/tasks");
      const d = await r.json();
      if (r.ok) setTasks(d.tasks || []);
      else setTasksError(d.error === "Database not configured" ? "Database not configured — connect PostgreSQL to see tasks." : (d.error || "Failed to load"));
    } catch { setTasksError("Network error loading tasks."); }
    setTasksLoading(false);
  }

  function sendChat() {
    const t = chatInput.trim();
    if (!t) return;
    setChatMsgs(m => [...m, { role: "user", text: t }]);
    setChatInput("");
    setTimeout(() => setChatMsgs(m => [...m, { role: "ai", text: "Task samajh gaya! Lekin AI execution abhi Phase D me implement hoga. Tab tak task queue me save kar sakte ho." }]), 600);
  }

  const stats = {
    total: tasks.length, completed: tasks.filter(t => t.status === "completed").length,
    running: tasks.filter(t => t.status === "running").length, failed: tasks.filter(t => t.status === "failed").length,
  };

  return (
    <div className="mini-app">
      <div className={`mini-scrim ${menuOpen ? "show" : ""}`} onClick={() => setMenuOpen(false)} />
      <aside className={`mini-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="mini-sidebar-brand"><span className="logo">◆</span>Mini AI</div>
        <nav className="mini-nav">
          {NAV.map(n => (
            <button key={n.id} className={`mini-nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => { setPage(n.id); setMenuOpen(false); }}>
              <span className="icon">{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div className="mini-sidebar-user"><span className="avatar">V</span><span>Vishal Sarraf<br /><small style={{ color: "#8a97ad" }}>Free Plan</small></span></div>
      </aside>

      <div className="mini-main">
        <div className="mini-topbar">
          <button className="mini-menu-btn" onClick={() => setMenuOpen(true)}>☰</button>
          <div className="mini-search">🔍<input placeholder="Search tasks, models, or ask Mini…" /></div>
          <span style={{ marginLeft: "auto", fontSize: 20 }}>🔔</span>
          <span className="avatar" style={{ width: 32, height: 32, borderRadius: "50%", background: "#7b4dff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>V</span>
        </div>

        <div className="mini-content">
          {page === "dashboard" && (
            <>
              <div className="mini-hero">
                <h1>Good morning, Vishal! 👋</h1>
                <p>Your AI control center. Build, automate, and get things done.</p>
                <div className="mini-hero-input">
                  <input placeholder="Ask anything… (e.g. Create a website, analyze data, build a game)"
                    onKeyDown={e => { if (e.key === "Enter") { setPage("workspace"); } }} />
                  <button className="mini-btn" onClick={() => setPage("workspace")}>Send</button>
                </div>
              </div>
              <div className="mini-grid-2" style={{ marginBottom: 16 }}>
                <div className="mini-card">
                  <p className="mini-card-title">Quick Actions</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="mini-btn mini-btn-sm" onClick={() => setPage("workspace")}>➕ New Task</button>
                    <button className="mini-btn mini-btn-tonal mini-btn-sm" onClick={() => setPage("providers")}>🔌 Connect Provider</button>
                    <button className="mini-btn mini-btn-tonal mini-btn-sm" onClick={() => setPage("mcp")} style={{ background: "#d7f0dd", color: "#146c2e" }}>➕ Add MCP Server</button>
                    <button className="mini-btn mini-btn-outline mini-btn-sm" onClick={() => setPage("tasks")}>View Tasks</button>
                  </div>
                </div>
                <div className="mini-card">
                  <p className="mini-card-title">System Health</p>
                  <div className="mini-health-row"><span className="health-ok">●</span> Database {tasksError.includes("not configured") ? <span className="health-warn">— Not configured</span> : <span className="health-ok">— Healthy</span>}</div>
                  <div className="mini-health-row"><span className="health-ok">●</span> MCP Server <span className="health-ok">— Healthy</span></div>
                  <div className="mini-health-row"><span className="health-warn">●</span> Worker <span style={{ color: "var(--md-on-surface-variant)" }}>— Not configured</span></div>
                  <div className="mini-health-row"><span className="health-warn">●</span> AI Providers <span style={{ color: "var(--md-on-surface-variant)" }}>— 0/4 connected</span></div>
                </div>
              </div>
              <div className="mini-grid-4" style={{ marginBottom: 16 }}>
                {[["Total Tasks", stats.total, ""], ["Completed", stats.completed, "up"], ["Running", stats.running, ""], ["Failed", stats.failed, stats.failed ? "down" : ""]].map(([l, n, d]) => (
                  <div className="mini-card mini-stat" key={l as string}><div className="label">{l}</div><div className="num">{n}</div></div>
                ))}
              </div>
              <div className="mini-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <p className="mini-card-title" style={{ margin: 0 }}>Recent Tasks</p>
                  <button className="mini-btn mini-btn-outline mini-btn-sm" onClick={() => setPage("tasks")}>View all</button>
                </div>
                {tasksLoading ? <p style={{ color: "var(--md-on-surface-variant)" }}>Loading…</p>
                  : tasksError ? <div className="mini-notice">{tasksError}</div>
                    : tasks.length === 0 ? <div className="mini-empty"><div className="big-icon">📋</div>No tasks yet. Create one from Workspace.</div>
                      : <table className="mini-table"><thead><tr><th>Task</th><th>Status</th><th>Created</th></tr></thead>
                        <tbody>{tasks.slice(0, 5).map(t => (
                          <tr key={t.id}><td>{t.title}</td><td><StatusPill status={t.status} /></td><td>{new Date(t.created_at).toLocaleString()}</td></tr>
                        ))}</tbody></table>}
              </div>
            </>
          )}

          {page === "workspace" && (
            <div className="mini-chat-wrap">
              <div className="mini-chat-main">
                <div className="mini-card" style={{ marginBottom: 16 }}>
                  <p className="mini-card-title">AI Workspace</p>
                  <p className="mini-card-sub">Chat with AI, use tools, and get things done.</p>
                  {chatMsgs.map((m, i) => (
                    <div key={i} className={`mini-msg ${m.role}`}>
                      {m.role === "ai" && <span className="mini-msg-avatar">◆</span>}
                      <div className="mini-msg-body">{m.text}</div>
                    </div>
                  ))}
                  <div className="mini-hero-input" style={{ marginTop: 12 }}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendChat()} placeholder="Type a message…" />
                    <button className="mini-btn" onClick={sendChat}>➤</button>
                  </div>
                </div>
              </div>
              <div className="mini-chat-side">
                <div className="mini-card">
                  <p className="mini-card-title">Task Progress</p>
                  <div className="mini-progress"><div className="mini-progress-bar" style={{ width: "0%" }} /></div>
                  <p className="mini-card-sub">No active task</p>
                  <p className="mini-card-title" style={{ marginTop: 16 }}>Related Tools</p>
                  <p className="mini-card-sub">🔧 create_task — queue a task<br />📁 Files · 🔍 Web search <span style={{ color: "var(--md-on-surface-variant)" }}>(coming soon)</span></p>
                </div>
              </div>
            </div>
          )}

          {page === "tasks" && (
            <div className="mini-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div><p className="mini-card-title" style={{ margin: 0 }}>Task Center</p><p className="mini-card-sub">View and manage your AI tasks.</p></div>
                <button className="mini-btn mini-btn-outline mini-btn-sm" onClick={loadTasks}>↻ Refresh</button>
              </div>
              {tasksLoading ? <p style={{ color: "var(--md-on-surface-variant)" }}>Loading…</p>
                : tasksError ? <div className="mini-notice">{tasksError}<br /><br />PostgreSQL connect karne ke baad tasks yahan dikhenge.</div>
                  : tasks.length === 0 ? <div className="mini-empty"><div className="big-icon">📋</div>No tasks yet.</div>
                    : <table className="mini-table"><thead><tr><th>ID / Prompt</th><th>Status</th><th>Created</th></tr></thead>
                      <tbody>{tasks.map(t => (
                        <tr key={t.id}><td><b>{t.title}</b><br /><small style={{ color: "var(--md-on-surface-variant)" }}>{t.id.slice(0, 8)}…</small></td>
                          <td><StatusPill status={t.status} /></td><td>{new Date(t.created_at).toLocaleString()}</td></tr>
                      ))}</tbody></table>}
            </div>
          )}

          {page === "providers" && (
            <>
              <div className="mini-notice">🔒 API keys sirf server-side environment variables me rakho. Ye UI sirf status dikhata hai — key yahan kabhi mat daalo.</div>
              <div className="mini-grid-2">
                {PROVIDERS.map(p => (
                  <div className="mini-card" key={p.name}>
                    <div className="mini-provider">
                      <span className="mini-provider-logo">{p.icon}</span>
                      <div className="mini-provider-info">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="mini-provider-name">{p.name}</span><ConnPill connected={p.connected} />
                        </div>
                        <p className="mini-provider-desc">{p.desc}</p>
                        <button className="mini-btn mini-btn-outline mini-btn-sm">Configure</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {page === "mcp" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div><h2 style={{ margin: 0 }}>MCP Servers</h2><p style={{ color: "var(--md-on-surface-variant)", margin: "4px 0 0" }}>Connect and manage MCP servers and tools.</p></div>
                <button className="mini-btn mini-btn-sm">➕ Add MCP Server</button>
              </div>
              <div className="mini-grid-2">
                {MCP_SERVERS.map(s => (
                  <div className="mini-card" key={s.name}>
                    <div className="mini-provider">
                      <span className="mini-provider-logo">{s.icon}</span>
                      <div className="mini-provider-info">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="mini-provider-name">{s.name}</span><ConnPill connected={s.connected} />
                        </div>
                        <p className="mini-provider-desc">{s.desc}<br />Tools: {s.tools}</p>
                        <button className="mini-btn mini-btn-outline mini-btn-sm">Configure</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mini-card" style={{ marginTop: 16 }}>
                <p className="mini-card-title">Mini's own MCP endpoint</p>
                <p className="mini-card-sub"><code>/api/mcp</code> — <code>create_task</code> tool, Bearer auth required. <span className="mini-pill pill-connected">Live</span></p>
              </div>
            </>
          )}

          {page === "integrations" && (
            <>
              <h2 style={{ margin: "0 0 4px" }}>Connections & Integrations</h2>
              <p style={{ color: "var(--md-on-surface-variant)", margin: "0 0 16px" }}>Connect your apps and services.</p>
              <div className="mini-grid-4">
                {INTEGRATIONS.map(i => (
                  <div className="mini-card" key={i.name} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{i.icon}</div>
                    <p className="mini-provider-name">{i.name}</p>
                    <p className="mini-card-sub" style={{ margin: "4px 0 10px" }}>Not connected</p>
                    <button className="mini-btn mini-btn-outline mini-btn-sm">Connect</button>
                  </div>
                ))}
              </div>
              <div className="mini-notice" style={{ marginTop: 16 }}>Integrations Phase D me real OAuth se connect honge. Abhi sab "Not connected" dikhana honest hai.</div>
            </>
          )}

          {page === "automations" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div><h2 style={{ margin: 0 }}>Automations</h2><p style={{ color: "var(--md-on-surface-variant)", margin: "4px 0 0" }}>Schedule and manage recurring workflows.</p></div>
                <button className="mini-btn mini-btn-sm">➕ New Automation</button>
              </div>
              {automations.map((a, i) => (
                <div className="mini-card" key={a.name} style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <p className="mini-provider-name">{a.name}</p>
                    <p className="mini-card-sub" style={{ margin: 0 }}>{a.sched}<br />{a.last}</p>
                  </div>
                  <button className={`mini-toggle ${a.on ? "on" : ""}`}
                    onClick={() => setAutomations(x => x.map((y, j) => j === i ? { ...y, on: !y.on } : y))} aria-label="toggle" />
                </div>
              ))}
              <div className="mini-notice">Automations abhi UI-only hain — real scheduling Phase D me (durable worker ke saath) ayega.</div>
            </>
          )}

          {page === "activity" && (
            <div className="mini-card">
              <p className="mini-card-title">Activity & Logs</p>
              <p className="mini-card-sub">Track events, task calls, and system activity.</p>
              {tasks.length === 0 && !tasksLoading
                ? <div className="mini-empty"><div className="big-icon">📊</div>No activity yet.</div>
                : <table className="mini-table"><thead><tr><th>Event</th><th>Time</th></tr></thead><tbody>
                  {tasks.slice(0, 10).map(t => (
                    <tr key={t.id}><td>Task created: {t.title}</td><td>{new Date(t.created_at).toLocaleString()}</td></tr>
                  ))}</tbody></table>}
            </div>
          )}

          {page === "settings" && (
            <div className="mini-grid-2">
              <div className="mini-card">
                <p className="mini-card-title">Profile</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span className="avatar" style={{ width: 48, height: 48, borderRadius: "50%", background: "#7b4dff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 600 }}>V</span>
                  <div><b>Vishal Sarraf</b><br /><small style={{ color: "var(--md-on-surface-variant)" }}>Free Plan</small></div>
                </div>
                <p className="mini-card-sub">Appearance · Language · Notifications</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="mini-btn mini-btn-tonal mini-btn-sm">Light</button>
                  <button className="mini-btn mini-btn-outline mini-btn-sm">Dark</button>
                  <button className="mini-btn mini-btn-outline mini-btn-sm">System</button>
                </div>
              </div>
              <div className="mini-card">
                <p className="mini-card-title">API Credentials</p>
                <div className="mini-notice">🔒 Keys server-side env vars me rakho — yahan kabhi paste mat karo.</div>
                <p className="mini-card-sub">Connected Accounts · Privacy · <span style={{ color: "var(--md-error)" }}>Sign out</span></p>
              </div>
            </div>
          )}

          {page === "help" && (
            <div className="mini-grid-2">
              <div className="mini-card">
                <p className="mini-card-title">Setup Checklist</p>
                <div className="mini-health-row"><span className="health-warn">○</span> Environment variables</div>
                <div className="mini-health-row"><span className="health-warn">○</span> Database connection</div>
                <div className="mini-health-row"><span className="health-ok">●</span> MCP server</div>
                <div className="mini-health-row"><span className="health-warn">○</span> AI providers</div>
                <div className="mini-health-row"><span className="health-warn">○</span> Background worker</div>
              </div>
              <div className="mini-card">
                <p className="mini-card-title">System Health</p>
                <div className="mini-health-row"><span className="health-ok">●</span> Database {tasksError.includes("not configured") ? "— Not configured" : "— Healthy"}</div>
                <div className="mini-health-row"><span className="health-ok">●</span> MCP Server — Healthy</div>
                <div className="mini-health-row"><span className="health-warn">●</span> AI Providers — 0/4 connected</div>
                <div className="mini-health-row"><span className="health-warn">●</span> Application build — Healthy</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
