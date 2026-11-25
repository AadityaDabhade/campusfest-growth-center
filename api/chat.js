// Relays the analyst's conversation to Google Gemini. The API key stays on the server.
// The browser runs the data tools itself; this function only passes messages and tool calls through.
// One attempt per call (max ~40 s). If the model is busy, slow or missing, it answers 503 with the
// next model to try, and the browser retries. This keeps every call well under Vercel's time limit.
const { BASE, modelOrder } = require('../lib/models');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method', message: 'POST only' } });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: { code: 'no_key', message: 'GEMINI_API_KEY is not set on the server.' } });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: { code: 'bad_json', message: 'Body is not JSON' } }); }
  if (!body || !Array.isArray(body.contents) || !body.contents.length) return res.status(400).json({ error: { code: 'bad_request', message: 'contents missing' } });
  if (JSON.stringify(body).length > 600000) return res.status(413).json({ error: { code: 'too_large', message: 'Conversation too long. Start a new chat.' } });
  const payload = { contents: body.contents, generationConfig: { maxOutputTokens: 4096 } };
  if (body.system) payload.systemInstruction = { parts: [{ text: String(body.system).slice(0, 60000) }] };
  if (Array.isArray(body.tools) && body.tools.length) payload.tools = [{ functionDeclarations: body.tools.slice(0, 20) }];

  const order = await modelOrder(key);
  const idx = Math.max(0, Math.floor(Number(body.modelIndex) || 0));
  const model = order[idx];
  const busy = (message) => res.status(503).json({ error: { code: 'busy', message, next: idx + 1, exhausted: idx + 1 >= order.length }, model, models: order });
  if (!model) return busy('No Gemini model answered.');

  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 40000);
  const call = p => fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(p), signal: ctl.signal });
  try {
    // Ask for light thinking: answers come much faster. If this model does not accept the setting, send it plain.
    const fast = JSON.parse(JSON.stringify(payload)); fast.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    let r = await call(fast), j = await r.json().catch(() => ({}));
    if (r.status === 400 && /thinking/i.test((j.error && j.error.message) || '')) { r = await call(payload); j = await r.json().catch(() => ({})); }
    clearTimeout(timer);
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
