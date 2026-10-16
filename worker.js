/* Mini AI — Cloudflare Worker proxy (alternative to api/proxy.py).
   Deploy: `npx wrangler deploy`  (keys: `npx wrangler secret put GEMINI_API_KEY`)
   Keys sirf Worker env/secrets me. Frontend ko key kabhi nahi milti. */

const SYS = 'Tum Mini AI ho — helpful AI assistant. Hindi/Hinglish me jawab do jab user usi me bole.';
const ALLOWED = {
  gemini: 'https://generativelanguage.googleapis.com',
  groq: 'https://api.groq.com',
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/api/proxy' || req.method !== 'POST')
      return json(404, { error: 'Not found' });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
    const provider = (body.provider || '').toLowerCase();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!ALLOWED[provider]) return json(400, { error: 'provider must be gemini or groq' });
    if (!messages.length) return json(400, { error: 'messages khaali hain' });

    try {
      let text;
      if (provider === 'gemini') {
        const key = env.GEMINI_API_KEY;
        if (!key) return json(503, { error: 'GEMINI_API_KEY secret set nahi hai.' });
        const r = await fetch(ALLOWED.gemini + '/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYS }] },
            contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '').slice(0, 8000) }] })),
          }),
        });
        if (!r.ok) return json(502, { error: 'Gemini HTTP ' + r.status });
        const j = await r.json();
        text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      } else {
        const key = env.GROQ_API_KEY;
        if (!key) return json(503, { error: 'GROQ_API_KEY secret set nahi hai.' });
        const r = await fetch(ALLOWED.groq + '/openai/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'system', content: SYS }, ...messages.map(m => ({ role: m.role, content: String(m.content || '').slice(0, 8000) }))],
          }),
        });
        if (!r.ok) return json(502, { error: 'Groq HTTP ' + r.status });
        const j = await r.json();
        text = j.choices?.[0]?.message?.content || '';
      }
      if (!text.trim()) return json(502, { error: 'Provider se khaali jawab' });
      return json(200, { text });
    } catch (e) {
      return json(500, { error: 'Proxy error: ' + String(e).slice(0, 120) });
    }
  },
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
