// Relays the analyst's conversation to Google Gemini. The API key stays on the server.
// The browser runs the data tools itself; this function only passes messages and tool calls through.
// If a model is busy (503/500/429) or missing (404), it waits briefly and tries the next Flash model.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
let modelList = null, lastGood = null;

async function listModels(key) {
  if (modelList) return modelList;
  try {
    const r = await fetch(BASE + '/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    const j = await r.json();
    const ok = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /flash/i.test(m.name) && !/image|tts|audio|live|embed|vision|think/i.test(m.name)).map(m => m.name.replace(/^models\//, ''));
    const ver = n => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const rank = n => (/(preview|exp)/i.test(n) ? 0 : 2) + (/lite/i.test(n) ? 0 : 1);
    ok.sort((a, b) => rank(b) - rank(a) || ver(b) - ver(a));
    modelList = ok;
  } catch (e) { modelList = []; }
  return modelList;
}

function generate(key, model, payload) {
  return fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload)
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  const started = Date.now();
  const listed = await listModels(key);
  const order = [];
  [process.env.GEMINI_MODEL, lastGood].concat(listed, ['gemini-flash-latest', 'gemini-flash-lite-latest']).forEach(m => { if (m && !order.includes(m)) order.push(m); });
  let lastErr = null;
  try {
    for (const model of order.slice(0, 6)) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (Date.now() - started > 45000) break;
        const r = await generate(key, model, payload);
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          lastGood = model;
          const cand = (j.candidates || [])[0] || {};
          return res.status(200).json({ content: cand.content || null, finishReason: cand.finishReason || null, model, blocked: (j.promptFeedback && j.promptFeedback.blockReason) || null });
        }
        lastErr = { status: r.status, message: (j.error && j.error.message) || ('Gemini error ' + r.status), model };
        console.error('Gemini error', r.status, model, lastErr.message.slice(0, 300));
        const busy = r.status === 503 || r.status === 500 || r.status === 429;
        if (r.status === 404 || (r.status === 400 && /not found|not supported/i.test(lastErr.message))) break; // try next model
        if (!busy) return res.status(r.status).json({ error: { code: 'upstream', message: lastErr.message }, model });
        if (attempt === 0) await sleep(1200);
      }
    }
  } catch (e) {
    console.error('chat exception', e);
    return res.status(502).json({ error: { code: 'upstream', message: String((e && e.message) || e) } });
  }
  const code = lastErr && lastErr.status === 429 ? 'rate_limited' : 'busy';
  return res.status(lastErr && lastErr.status === 429 ? 429 : 503).json({ error: { code, message: 'Gemini is busy right now (' + (lastErr ? lastErr.message : 'no model answered') + '). Please try again in a minute.' }, tried: order.slice(0, 6) });
};
