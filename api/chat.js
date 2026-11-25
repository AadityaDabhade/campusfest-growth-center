// Relays the analyst's conversation to Google Gemini. The API key stays on the server.
// The browser runs the data tools itself; this function only passes messages and tool calls through.
// One quick attempt per call (max ~25 s). If the model is busy, slow or missing, it answers 503 with the
// next model to try, and the browser retries. This keeps every call well under Vercel's time limit.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
let modelList = null;

async function listModels(key) {
  if (modelList) return modelList;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(BASE + '/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    const ok = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /flash/i.test(m.name) && !/image|tts|audio|live|embed|vision|think/i.test(m.name)).map(m => m.name.replace(/^models\//, ''));
    const ver = n => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const rank = n => (/(preview|exp)/i.test(n) ? 0 : 2) + (/lite/i.test(n) ? 0 : 1);
    ok.sort((a, b) => rank(b) - rank(a) || ver(b) - ver(a));
    modelList = ok.slice(0, 6);
  } catch (e) { modelList = []; }
  return modelList;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method', message: 'POST only' } });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: { code: 'no_key', message: 'GEMINI_API_KEY is not set on the server.' } });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: { code: 'bad_json', message: 'Body is not JSON' } }); }
  if (!body || !Array.isArray(body.contents) || !body.contents.length) return res.status(400).json({ error: { code: 'bad_request', message: 'contents missing' } });
  if (JSON.stringify(body).length > 600000) return res.status(413).json({ error: { code: 'too_large', message: 'Conversation too long. Start a new chat.' } });
  const payload = { contents: body.contents, generationConfig: { temperature: 0.2, maxOutputTokens: 2048 } };
  if (body.system) payload.systemInstruction = { parts: [{ text: String(body.system).slice(0, 60000) }] };
  if (Array.isArray(body.tools) && body.tools.length) payload.tools = [{ functionDeclarations: body.tools.slice(0, 20) }];

  const order = [];
  [process.env.GEMINI_MODEL].concat(await listModels(key), ['gemini-flash-latest', 'gemini-flash-lite-latest']).forEach(m => { if (m && !order.includes(m)) order.push(m); });
  const idx = Math.max(0, Math.floor(Number(body.modelIndex) || 0));
  const model = order[idx];
  const busy = (message) => res.status(503).json({ error: { code: 'busy', message, next: idx + 1, exhausted: idx + 1 >= order.length }, model, models: order });
  if (!model) return busy('No Gemini model answered.');

  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload), signal: ctl.signal });
    clearTimeout(timer);
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const cand = (j.candidates || [])[0] || {};
      return res.status(200).json({ content: cand.content || null, finishReason: cand.finishReason || null, model, modelIndex: idx, blocked: (j.promptFeedback && j.promptFeedback.blockReason) || null });
    }
    const msg = (j.error && j.error.message) || ('Gemini error ' + r.status);
    console.error('Gemini error', r.status, model, msg.slice(0, 300));
    if ([429, 500, 503, 404].includes(r.status) || /not found|not supported|overloaded|high demand/i.test(msg)) return busy(msg);
    return res.status(r.status).json({ error: { code: 'upstream', message: msg }, model });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') return busy(model + ' took too long to answer.');
    console.error('chat exception', e);
    return busy(String((e && e.message) || e));
  }
};
