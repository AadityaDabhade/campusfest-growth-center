// Relays the analyst's conversation to Google Gemini. The API key stays on the server.
// The browser runs the data tools itself; this function only passes messages and tool calls through.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
let cachedModel = null;

async function pickModel(key) {
  const r = await fetch(BASE + '/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  if (!r.ok) return null;
  const j = await r.json();
  const ok = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /flash/i.test(m.name) && !/image|tts|audio|live|embed|vision|think/i.test(m.name));
  const ver = n => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  const rank = m => (/(preview|exp)/i.test(m.name) ? 0 : 2) + (/lite/i.test(m.name) ? 0 : 1);
  ok.sort((a, b) => rank(b) - rank(a) || ver(b.name) - ver(a.name));
  return ok[0] ? ok[0].name.replace(/^models\//, '') : null;
}

async function generate(key, model, payload) {
  return fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload)
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method', message: 'POST only' } });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: { code: 'no_key', message: 'GEMINI_API_KEY is not set on the server.' } });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: { code: 'bad_json', message: 'Body is not JSON' } }); }
  if (!body || !Array.isArray(body.contents) || !body.contents.length) return res.status(400).json({ error: { code: 'bad_request', message: 'contents missing' } });
  if (JSON.stringify(body).length > 600000) return res.status(413).json({ error: { code: 'too_large', message: 'Conversation too long. Start a new chat.' } });
  const payload = {
    contents: body.contents,
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
  };
  if (body.system) payload.systemInstruction = { parts: [{ text: String(body.system).slice(0, 60000) }] };
  if (Array.isArray(body.tools) && body.tools.length) payload.tools = [{ functionDeclarations: body.tools.slice(0, 20) }];
  try {
    let model = process.env.GEMINI_MODEL || cachedModel || 'gemini-flash-latest';
    let r = await generate(key, model, payload);
    if (r.status === 404 || (r.status === 400 && !process.env.GEMINI_MODEL && !cachedModel)) {
      const txt = await r.clone().text();
      if (r.status === 404 || /not found|not supported|unknown model/i.test(txt)) {
        const picked = await pickModel(key);
        if (picked && picked !== model) { model = picked; r = await generate(key, model, payload); }
      }
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: { code: r.status === 429 ? 'rate_limited' : 'upstream', message: (j.error && j.error.message) || ('Gemini error ' + r.status) }, model });
    cachedModel = model;
    const cand = (j.candidates || [])[0] || {};
    return res.status(200).json({ content: cand.content || null, finishReason: cand.finishReason || null, model, blocked: j.promptFeedback && j.promptFeedback.blockReason || null });
  } catch (e) {
    return res.status(502).json({ error: { code: 'upstream', message: String(e && e.message || e) } });
  }
};
