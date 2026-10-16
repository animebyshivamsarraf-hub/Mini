/* Mini AI Phase 1 — Chat core.
   Architecture: keys NEVER in frontend. Gemini/Groq go via /api/proxy (server-side, env vars).
   Streaming: Pollinations (SSE) yes. MOCK/proxy: no (single response). */
'use strict';

const store = {
  get(k, d) { try { const v = localStorage.getItem('miniai_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('miniai_' + k, JSON.stringify(v)); } catch {} }
};

/* ---------- Model adapters ---------- */
const adapters = {
  mock: {
    label: 'MOCK', streaming: false,
    async send(messages, onToken) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
      const last = (messages[messages.length-1]?.content || '').toLowerCase().trim();
      let reply;
      if (/^(hi|hello|hey|namaste|ram ram)/.test(last))
        reply = 'Namaste! Main Mini AI hun (MOCK mode). Real AI ke liye Settings me Pollinations select karo — free hai, key nahi chahiye.';
      else if (last.includes('tum kaun') || last.includes('who are you'))
        reply = 'Main Mini AI hun — Phase 1 chat core. MOCK mode me rule-based jawab deta hun.';
      else if (last.includes('time') || last.includes('samay') || last.includes('baj'))
        reply = 'Tumhare device ka time: ' + new Date().toLocaleString('hi-IN');
      else if (last.includes('plugin'))
        reply = 'Plugin system Phase 2 me ayega. Wahan tum bologe "calculator plugin banao" aur ban jayega.';
      else if (last.includes('mcp'))
        reply = 'MCP connectors Phase 3 me ayenge.';
      else if (last.includes('kaise ho'))
        reply = 'Main badhiya hun! Tum batao, kya puchna hai? (Ye MOCK jawab hai — real AI ke liye Pollinations try karo.)';
      else
        reply = 'MOCK mode: smart jawab nahi de sakta. Settings → Pollinations select karo (free, no key). Tumne pucha: "' + messages[messages.length-1].content.slice(0,100) + '"';
      return reply;
    }
  },

  pollinations: {
    label: 'Pollinations', streaming: true,
    async send(messages, onToken) {
      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai', stream: true,
          messages: [{ role: 'system', content: 'Tum Mini AI ho — helpful AI assistant. User Hindi/Hinglish me bole to usi me jawab do. Concise jawab do.' }, ...messages]
        })
      });
      if (!res.ok) throw new Error('Pollinations HTTP ' + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const tok = j?.choices?.[0]?.delta?.content;
            if (tok) { full += tok; onToken && onToken(tok); }
          } catch {}
        }
      }
      if (!full) throw new Error('Pollinations se khaali jawab');
      return full;
    }
  },

  // Gemini & Groq: via server-side proxy. Keys live in server env vars ONLY.
  gemini: {
    label: 'Gemini', streaming: false, viaProxy: true,
    async send(messages) {
      const res = await fetch('/api/proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'gemini', messages })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('Proxy HTTP ' + res.status));
      if (!data.text) throw new Error('Proxy se khaali jawab');
      return data.text;
    }
  },
  groq: {
    label: 'Groq', streaming: false, viaProxy: true,
    async send(messages) {
      const res = await fetch('/api/proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'groq', messages })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('Proxy HTTP ' + res.status));
      if (!data.text) throw new Error('Proxy se khaali jawab');
      return data.text;
    }
  }
};

/* ---------- State ---------- */
let chats = store.get('chats', []);
let activeId = store.get('activeId', null);
let model = store.get('model', 'mock');
let sending = false, abortCtrl = null;

const $ = id => document.getElementById(id);
const messagesEl = $('messages'), chatListEl = $('chatList'), inputEl = $('msgInput'), chatArea = $('chatArea');
const activeChat = () => chats.find(c => c.id === activeId) || null;
const persist = () => { store.set('chats', chats); store.set('activeId', activeId); store.set('model', model); };

function newChat() {
  const c = { id: 'c' + Date.now(), title: 'New chat', created: Date.now(), messages: [] };
  chats.unshift(c); activeId = c.id; persist(); renderAll();
}
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function fmt(text) {
  let h = esc(text);
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (m, l, code) => '<pre><code>' + code.replace(/^\n+|\n+$/g,'') + '</code></pre>');
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return h;
}

function renderMessages() {
  messagesEl.innerHTML = '';
  const c = activeChat();
  if (!c || !c.messages.length) {
    messagesEl.innerHTML = '<div class="empty"><span class="big">🤖</span>Mini AI me swagat hai!<br>Neeche type karke pucho.</div>';
    return;
  }
  c.messages.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = 'msg ' + (m.role === 'user' ? 'user' : 'ai') + (m.err ? ' error' : '');
    let inner = fmt(m.content);
    inner += '<div class="meta">' + new Date(m.ts).toLocaleTimeString('hi-IN',{hour:'2-digit',minute:'2-digit'});
    if (m.err) inner += ' · <a href="#" data-retry="' + i + '" style="color:#ff9d9d">↻ retry</a>';
    inner += '</div>';
    div.innerHTML = inner;
    messagesEl.appendChild(div);
  });
  messagesEl.querySelectorAll('[data-retry]').forEach(a => {
    a.onclick = e => { e.preventDefault(); retryFrom(parseInt(a.dataset.retry)); };
  });
  chatArea.scrollTop = chatArea.scrollHeight;
}

function renderList() {
  chatListEl.innerHTML = '';
  chats.forEach(c => {
    const d = document.createElement('div');
    d.className = 'chat-item' + (c.id === activeId ? ' active' : '');
    d.innerHTML = esc(c.title) + '<span class="dt">' + new Date(c.created).toLocaleDateString('hi-IN') + '</span>';
    d.onclick = () => { activeId = c.id; persist(); renderAll(); closeSide(); };
    chatListEl.appendChild(d);
  });
}
function renderAll() {
  $('modelBadge').textContent = (adapters[model]?.label || model).toUpperCase();
  renderMessages(); renderList();
}

/* Streaming bubble helpers */
function startStreamBubble() {
  const div = document.createElement('div');
  div.className = 'msg ai'; div.id = 'streamingMsg';
  div.innerHTML = '<span class="stream-cursor">▍</span>';
  messagesEl.appendChild(div); chatArea.scrollTop = chatArea.scrollHeight;
  return div;
}
function appendToken(div, tok) {
  const cur = div.querySelector('.stream-cursor');
  cur.insertAdjacentText('beforebegin', tok);
  chatArea.scrollTop = chatArea.scrollHeight;
}
function finishStreamBubble(div, fullText) {
  div.removeAttribute('id');
  div.innerHTML = fmt(fullText) + '<div class="meta">' + new Date().toLocaleTimeString('hi-IN',{hour:'2-digit',minute:'2-digit'}) + '</div>';
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || sending) return;
  let c = activeChat();
  if (!c) { newChat(); c = activeChat(); }
  if (!c.messages.length) c.title = text.slice(0, 42) + (text.length > 42 ? '…' : '');
  c.messages.push({ role: 'user', content: text, ts: Date.now() });
  inputEl.value = ''; inputEl.style.height = 'auto';
  persist(); renderAll();

  sending = true; $('sendBtn').disabled = true;
  const adapter = adapters[model] || adapters.mock;
  const hist = c.messages.map(m => ({ role: m.role, content: m.content }));

  try {
    if (adapter.streaming) {
      const bubble = startStreamBubble();
      let full = '';
      const reply = await adapter.send(hist, tok => { full += tok; appendToken(bubble, tok); });
      full = reply || full;
      finishStreamBubble(bubble, full);
      c.messages.push({ role: 'assistant', content: full, ts: Date.now() });
    } else {
      const bubble = startStreamBubble();
      bubble.innerHTML = '<span class="stream-cursor">…</span>';
      const reply = await adapter.send(hist);
      finishStreamBubble(bubble, reply);
      c.messages.push({ role: 'assistant', content: reply, ts: Date.now() });
    }
  } catch (e) {
    const sb = $('streamingMsg'); if (sb) sb.remove();
    c.messages.push({ role: 'assistant', content: '⚠️ ' + e.message, ts: Date.now(), err: true });
  }
  sending = false; $('sendBtn').disabled = false;
  persist(); renderAll();
}

async function retryFrom(idx) {
  const c = activeChat(); if (!c || sending) return;
  const errMsg = c.messages[idx];
  if (!errMsg || !errMsg.err) return;
  // remove failed assistant msg, resend last user msg context
  c.messages.splice(idx, 1);
  persist(); renderAll();
  sending = true; $('sendBtn').disabled = true;
  const adapter = adapters[model] || adapters.mock;
  const hist = c.messages.map(m => ({ role: m.role, content: m.content }));
  try {
    if (adapter.streaming) {
      const bubble = startStreamBubble(); let full = '';
      const reply = await adapter.send(hist, tok => { full += tok; appendToken(bubble, tok); });
      full = reply || full; finishStreamBubble(bubble, full);
      c.messages.push({ role: 'assistant', content: full, ts: Date.now() });
    } else {
      const bubble = startStreamBubble(); bubble.innerHTML = '<span class="stream-cursor">…</span>';
      const reply = await adapter.send(hist); finishStreamBubble(bubble, reply);
      c.messages.push({ role: 'assistant', content: reply, ts: Date.now() });
    }
  } catch (e) {
    const sb = $('streamingMsg'); if (sb) sb.remove();
    c.messages.push({ role: 'assistant', content: '⚠️ ' + e.message, ts: Date.now(), err: true });
  }
  sending = false; $('sendBtn').disabled = false;
  persist(); renderAll();
}

/* ---------- Sidebar / settings ---------- */
const openSide = () => { $('sidebar').classList.add('open'); $('sideOverlay').classList.add('show'); };
const closeSide = () => { $('sidebar').classList.remove('open'); $('sideOverlay').classList.remove('show'); };
function openSettings() { $('modelSelect').value = model; $('settingsModal').classList.remove('hidden'); }
function closeSettings() { $('settingsModal').classList.add('hidden'); }

$('sendBtn').onclick = send;
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
inputEl.addEventListener('input', () => { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px'; });
$('menuBtn').onclick = openSide;
$('closeSide').onclick = closeSide;
$('sideOverlay').onclick = closeSide;
$('newChatBtn').onclick = newChat;
$('sideNewChat').onclick = () => { newChat(); closeSide(); };
$('settingsBtn').onclick = () => { closeSide(); openSettings(); };
$('closeSettings').onclick = closeSettings;
$('settingsModal').addEventListener('click', e => { if (e.target === $('settingsModal')) closeSettings(); });
$('saveSettings').onclick = () => { model = $('modelSelect').value; persist(); renderAll(); closeSettings(); };
$('clearHistory').onclick = () => { if (confirm('Saare chats delete ho jayenge. Pakka?')) { chats = []; activeId = null; persist(); renderAll(); closeSettings(); } };

if (!chats.length) { const c = { id: 'c' + Date.now(), title: 'New chat', created: Date.now(), messages: [] }; chats.push(c); activeId = c.id; persist(); }
renderAll();

/* ================= PHASE 2: Auth + Plugins UI ================= */
Auth.init();

function renderAuth() {
  const bar = $('authBar');
  if (Auth.mode === 'local') { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  $('authStatus').textContent = Auth.isLoggedIn() ? ('👤 ' + (Auth.user.email || '')) : 'Not logged in';
  $('authBtn').textContent = Auth.isLoggedIn() ? 'Logout' : 'Login';
}
$('authBtn').onclick = () => {
  if (Auth.isLoggedIn() && Auth.mode === 'supabase') { Auth.signOut().then(renderAuth); return; }
  if (!Auth.isConfigured()) { $('authNotCfg').classList.remove('hidden'); $('authForm').classList.add('hidden'); }
  else { $('authNotCfg').classList.add('hidden'); $('authForm').classList.remove('hidden'); }
  $('authModal').classList.remove('hidden');
};
$('closeAuth').onclick = () => $('authModal').classList.add('hidden');
$('doLogin').onclick = async () => {
  try { await Auth.signIn($('authEmail').value.trim(), $('authPass').value); $('authModal').classList.add('hidden'); renderAuth(); }
  catch (e) { alert('Login failed: ' + e.message); }
};
$('doSignup').onclick = async () => {
  try { await Auth.signUp($('authEmail').value.trim(), $('authPass').value); $('authModal').classList.add('hidden'); renderAuth(); alert('Sign up ho gaya! Email verify karo (agar required ho).'); }
  catch (e) { alert('Sign up failed: ' + e.message); }
};

/* ---------- Plugins UI ---------- */
function openPlugins() { renderPluginList(); renderExecLog(); $('pluginsModal').classList.remove('hidden'); }
$('pluginsBtn').onclick = () => { closeSide(); openPlugins(); };
$('closePlugins').onclick = () => $('pluginsModal').classList.add('hidden');
document.querySelectorAll('.ptab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.ptab').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  ['installed', 'builder', 'log'].forEach(t => $('ptab-' + t).classList.toggle('hidden', t !== b.dataset.ptab));
});

function renderPluginList() {
  const el = $('pluginList'); const list = Plugins.list();
  if (!list.length) { el.innerHTML = '<p class="hint">Koi plugin installed nahi. Builder se banao ya neeche sample plugins load karo.<br><br><button id="loadSamples" class="primary" style="padding:9px 16px;border:none;border-radius:10px;background:var(--accent);color:#fff;cursor:pointer">📦 Sample plugins load karo</button></p>';
    const lb = $('loadSamples'); if (lb) lb.onclick = loadSamples; return; }
  el.innerHTML = '';
  list.forEach(p => {
    const d = document.createElement('div'); d.className = 'plug-card';
    const stCls = p.status.replace('-', '');
    d.innerHTML = `<h3>${esc(p.name)} <span class="ver">v${esc(p.manifest.version || '?')}</span>
      <span class="plug-status st-${p.status.replace('draft-invalid', 'draft-invalid')}">${p.status}</span></h3>
      <p>${esc(p.manifest.description || '')}</p>
      <p style="font-size:11px">permissions: ${(p.manifest.permissions || []).join(', ') || 'none'}</p>
      ${p.errors && p.errors.length ? '<p style="color:#ff9d9d;font-size:12px">' + p.errors.map(esc).join('<br>') + '</p>' : ''}
      <div class="plug-actions"></div>
      ${p.status === 'enabled' ? `<div class="plug-run"><input placeholder='{"a":2,"b":3,"op":"add"}' data-runinput="${esc(p.name)}"><button class="go" data-run="${esc(p.name)}">▶ Run</button></div><div class="plug-result hidden" data-result="${esc(p.name)}"></div>` : ''}`;
    const acts = d.querySelector('.plug-actions');
    const mkBtn = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; acts.appendChild(b); };
    if (p.status === 'draft' || p.status === 'draft-invalid') mkBtn('✅ Test + Approve', async () => {
      try { const tests = await Plugins.approve(p.name); alert('Approved! ' + tests.filter(t => t.status === 'PASS').length + '/' + tests.length + ' tests PASS'); }
      catch (e) { alert('Approve failed: ' + e.message); }
      renderPluginList();
    }, 'go');
    if (p.status === 'enabled') mkBtn('⏸ Disable', () => { Plugins.setEnabled(p.name, false); renderPluginList(); });
    if (p.status === 'disabled') mkBtn('▶ Enable', () => { Plugins.setEnabled(p.name, true); renderPluginList(); });
    mkBtn('🗑 Delete', () => { if (confirm('Delete ' + p.name + '?')) { Plugins.uninstall(p.name); renderPluginList(); } });
    el.appendChild(d);
  });
  el.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => {
    const name = b.dataset.run;
    const inpEl = el.querySelector(`[data-runinput="${name}"]`);
    const resEl = el.querySelector(`[data-result="${name}"]`);
    let input = {};
    try { input = inpEl.value.trim() ? JSON.parse(inpEl.value.trim()) : {}; }
    catch { resEl.classList.remove('hidden'); resEl.classList.add('err'); resEl.textContent = 'JSON galat hai'; return; }
    resEl.classList.remove('hidden'); resEl.classList.remove('err'); resEl.textContent = '…';
    try { const out = await Plugins.execute(name, input); resEl.textContent = JSON.stringify(out, null, 2); }
    catch (e) { resEl.classList.add('err'); resEl.textContent = '⚠️ ' + e.message; }
    renderExecLog();
  });
}

async function loadSamples() {
  for (const f of ['calculator', 'physics']) {
    try {
      const res = await fetch('plugins/' + f + '.json');
      if (!res.ok) continue;
      const manifest = await res.json();
      Plugins.installDraft(manifest);
      try { await Plugins.approve(manifest.name); } catch (e) { console.warn(f, e.message); }
    } catch (e) { console.warn(f, e.message); }
  }
  renderPluginList();
}

function renderExecLog() {
  const el = $('execLog'); const log = Plugins.execLog();
  el.innerHTML = log.length ? '' : '<p class="hint">Abhi koi execution nahi hua.</p>';
  log.slice(0, 30).forEach(e => {
    const d = document.createElement('div'); d.className = 'log-row';
    d.innerHTML = `<span class="ts">${new Date(e.ts).toLocaleString('hi-IN')}</span> <b>${esc(e.plugin)}</b><br>in: ${esc(JSON.stringify(e.input)).slice(0, 120)}<br>` +
      (e.error ? `<span style="color:#ff9d9d">err: ${esc(e.error)}</span>` : `out: ${esc(JSON.stringify(e.output)).slice(0, 120)}`);
    el.appendChild(d);
  });
}

/* ---------- Plugin Builder (AI-generated) ---------- */
let pendingManifest = null;
$('builderGen').onclick = async () => {
  const desc = $('builderDesc').value.trim();
  if (!desc) { alert('Pehle describe karo kaisa plugin chahiye'); return; }
  const btn = $('builderGen'); btn.disabled = true; btn.textContent = '⏳ Generating...';
  try {
    const prompt = `Ek Mini AI plugin ka JSON manifest banao. Sirf JSON do, koi extra text nahi.\n\nUser description: "${desc}"\n\nFormat:\n{"name":"lowercase_2_40_chars","version":"1.0.0","description":"...","author":"user","permissions":["compute"],"inputSchema":{"type":"object","properties":{"field1":{"type":"number"}},"required":["field1"]},"outputSchema":{"type":"object","properties":{"result":{}}},"code":"function run(input){ /* input fields use karo, object return karo */ return {result: 0}; }","tests":[{"input":{"field1":1},"expect":{"result":0}}]}\n\nRules: code me sirf function run(input) ho, koi eval/fetch/document/window nahi. Tests me sahi expect values do.`;
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error('AI HTTP ' + res.status);
    const data = await res.json();
    let text = data?.choices?.[0]?.message?.content || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI se valid JSON nahi mila');
    pendingManifest = JSON.parse(m[0]);
    $('builderCode').value = JSON.stringify(pendingManifest, null, 2);
    $('builderOut').classList.remove('hidden');
    // Auto-run tests for review
    const errs = Plugins.validate(pendingManifest);
    const tests = errs.length ? [] : await Plugins.runTests(pendingManifest);
    $('builderTests').innerHTML =
      (errs.length ? '<p style="color:#ff9d9d;font-size:13px">Validation errors:<br>' + errs.map(esc).join('<br>') + '</p>' : '') +
      tests.map(t => `<div class="test-row"><span class="test-${t.status.replace(' ', '')}">${t.status}</span> ${esc(t.name)} — ${esc(t.detail).slice(0, 100)}</div>`).join('');
  } catch (e) { alert('Generate failed: ' + e.message); }
  btn.disabled = false; btn.textContent = '🤖 Generate';
};

$('builderApprove').onclick = async () => {
  try {
    pendingManifest = JSON.parse($('builderCode').value);  // user-edited version
    const errs = Plugins.installDraft(pendingManifest);
    if (errs.length) { alert('Validation errors:\n' + errs.join('\n')); renderPluginList(); return; }
    const tests = await Plugins.approve(pendingManifest.name);
    alert('✅ Plugin approved aur enabled! ' + tests.filter(t => t.status === 'PASS').length + '/' + tests.length + ' PASS');
    $('builderOut').classList.add('hidden'); $('builderDesc').value = '';
    document.querySelector('[data-ptab="installed"]').click();
  } catch (e) { alert('Approve failed: ' + e.message); }
};

$('manualInstall').onclick = () => {
  try {
    const m = JSON.parse($('manualManifest').value);
    const errs = Plugins.installDraft(m);
    alert(errs.length ? 'Draft saved (errors hain):\n' + errs.join('\n') : 'Draft saved! Ab Test + Approve karo.');
    document.querySelector('[data-ptab="installed"]').click();
  } catch (e) { alert('JSON galat hai: ' + e.message); }
};

// Auto-load samples on first run
if (!localStorage.getItem('miniai_samples_loaded')) {
  loadSamples().then(() => localStorage.setItem('miniai_samples_loaded', '1'));
}
renderAuth();
