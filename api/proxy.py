"""Mini AI — server-side LLM proxy.
Keys sirf environment variables se aati hain. Frontend ko key kabhi nahi milti.

Env vars (Vercel dashboard / Cloudflare me set karo):
  GEMINI_API_KEY, GROQ_API_KEY
"""
import json, os, urllib.request

def _post(url, headers, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={**headers, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def handler(request):
    # Vercel Python runtime: request.json()
    try:
        data = request.json() if hasattr(request, 'json') else json.loads(request.body)
    except Exception:
        return _resp(400, {'error': 'Invalid JSON body'})

    provider = (data.get('provider') or '').lower()
    messages = data.get('messages') or []
    if provider not in ('gemini', 'groq'):
        return _resp(400, {'error': 'provider must be gemini or groq'})
    if not isinstance(messages, list) or not messages:
        return _resp(400, {'error': 'messages khaali hain'})

    # Basic SSRF guard: sirf allowlisted hosts
    try:
        if provider == 'gemini':
            key = os.environ.get('GEMINI_API_KEY', '')
            if not key:
                return _resp(503, {'error': 'Gemini key server par set nahi hai (GEMINI_API_KEY).'})
            sys_text = 'Tum Mini AI ho — helpful AI assistant. Hindi/Hinglish me jawab do jab user usi me bole.'
            contents = [{'role': 'model' if m.get('role') == 'assistant' else 'user',
                         'parts': [{'text': str(m.get('content', ''))[:8000]}]} for m in messages]
            out = _post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key,
                        {}, {'system_instruction': {'parts': [{'text': sys_text}]}, 'contents': contents})
            text = ''.join(p.get('text', '') for p in (out.get('candidates', [{}])[0].get('content', {}).get('parts', [])))
        else:
            key = os.environ.get('GROQ_API_KEY', '')
            if not key:
                return _resp(503, {'error': 'Groq key server par set nahi hai (GROQ_API_KEY).'})
            out = _post('https://api.groq.com/openai/v1/chat/completions',
                        {'Authorization': 'Bearer ' + key},
                        {'model': 'llama-3.3-70b-versatile',
                         'messages': [{'role': 'system', 'content': 'Tum Mini AI ho — helpful AI assistant. Hindi/Hinglish me jawab do.'}]
                                     + [{'role': m.get('role'), 'content': str(m.get('content', ''))[:8000]} for m in messages]})
            text = (out.get('choices', [{}])[0].get('message', {}).get('content') or '')
        if not text.strip():
            return _resp(502, {'error': 'Provider se khaali jawab'})
        return _resp(200, {'text': text})
    except urllib.error.HTTPError as e:
        return _resp(502, {'error': f'Provider error: HTTP {e.code}'})
    except Exception as e:
        return _resp(500, {'error': 'Proxy error: ' + str(e)[:120]})

def _resp(status, obj):
    body = json.dumps(obj)
    # Vercel Python: return dict
    return {'statusCode': status, 'headers': {'Content-Type': 'application/json'}, 'body': body}

# Vercel serverless entry
def main(request):
    return handler(request)
