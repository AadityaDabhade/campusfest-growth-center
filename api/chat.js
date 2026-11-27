// Relays the analyst's conversation to an AI model. API keys stay on the server.
// The browser runs the data tools itself; this function only passes messages and tool calls through.
// Providers, tried in turn: Google Gemini (main) and Groq (free backup), interleaved so a busy model is
// swapped quickly. One attempt per call (max ~20 s); on busy/slow/missing it answers 503 with the next
// index and the browser retries. Every call stays well under Vercel's time limit.
const { BASE, modelOrder } = require('../lib/models');
const { groqOrder, callGroq } = require('../lib/groq');

async function providerOrder(gKey, qKey) {
  const g = gKey ? (await modelOrder(gKey)).map(m => ({ p: 'gemini', m })) : [];
  const q = qKey ? (await groqOrder(qKey)).map(m => ({ p: 'groq', m })) : [];
  const out = [];
  // two Gemini tries, then Groq, then alternating: [G1, G2, Q1, G3, Q2, ...]
  const gg = g.slice(), qq = q.slice();
  if (gg.length) out.push(gg.shift()); if (gg.length) out.push(gg.shift());
  while (gg.length || qq.length) { if (qq.length) out.push(qq.shift()); if (gg.length) out.push(gg.shift()); }
  return out;
}
// models that were just busy are skipped for 3 minutes (kept while this server instance stays warm)
const BUSY = new Map();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method', message: 'POST only' } });
  const gKey = process.env.GEMINI_API_KEY, qKey = process.env.GROQ_API_KEY;
  if (!gKey && !qKey) return res.status(500).json({ error: { code: 'no_key', message: 'No AI key is set on the server (GEMINI_API_KEY or GROQ_API_KEY).' } });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: { code: 'bad_json', message: 'Body is not JSON' } }); }
  if (!body || !Array.isArray(body.contents) || !body.contents.length) return res.status(400).json({ error: { code: 'bad_request', message: 'contents missing' } });
  if (JSON.stringify(body).length > 600000) return res.status(413).json({ error: { code: 'too_large', message: 'Conversation too long. Start a new chat.' } });

  const order = await providerOrder(gKey, qKey);
  const idx = Math.max(0, Math.floor(Number(body.modelIndex) || 0));
  const pick = order[idx];
  const busy = (message) => res.status(503).json({ error: { code: 'busy', message, next: idx + 1, exhausted: idx + 1 >= order.length }, model: pick && pick.m, provider: pick && pick.p });
  if (!pick) return busy('No AI model answered.');
  if ((BUSY.get(pick.m) || 0) > Date.now() && idx + 1 < order.length) return busy(pick.m + ' was busy a moment ago; trying the next model.');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 14000);
  const markBusy = () => BUSY.set(pick.m, Date.now() + 180000);
  const done = content => res.status(200).json({ content, model: pick.m, provider: pick.p, modelIndex: idx });

  try {
    if (pick.p === 'groq') {
      const r = await callGroq(qKey, pick.m, body, ctl.signal);
      clearTimeout(timer);
      if (r.ok) return done(r.content);
      console.error('Groq error', r.status, pick.m, String(r.message).slice(0, 300));
      if (r.status === 400 && !/tool|function/i.test(r.message)) return res.status(400).json({ error: { code: 'upstream', message: r.message }, model: pick.m });
      markBusy(); return busy('Groq: ' + r.message);
    }
    // A turn answered by Groq has tool calls without Gemini's thought signature, and Gemini 3 refuses such
    // history. Google documents a placeholder signature for calls it did not make itself.
    const contents = body.contents.map(c => { if (c.role !== 'model' || !Array.isArray(c.parts)) return c; const fc = c.parts.filter(x => x.functionCall); if (!fc.length || fc[0].thoughtSignature) return c; return Object.assign({}, c, { parts: c.parts.map(x => x === fc[0] ? Object.assign({}, x, { thoughtSignature: 'skip_thought_signature_validator' }) : x) }); });
    const payload = { contents, generationConfig: { maxOutputTokens: 4096 } };
    if (body.system) payload.systemInstruction = { parts: [{ text: String(body.system).slice(0, 60000) }] };
    if (Array.isArray(body.tools) && body.tools.length) payload.tools = [{ functionDeclarations: body.tools.slice(0, 20) }];
    const call = p => fetch(`${BASE}/models/${encodeURIComponent(pick.m)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': gKey }, body: JSON.stringify(p), signal: ctl.signal });
    // Light thinking answers much faster. If this model does not accept the setting, send it plain.
    const fast = JSON.parse(JSON.stringify(payload)); fast.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    let r = await call(fast), j = await r.json().catch(() => ({}));
    if (r.status === 400 && /thinking/i.test((j.error && j.error.message) || '')) { r = await call(payload); j = await r.json().catch(() => ({})); }
    clearTimeout(timer);
    if (r.ok) { const cand = (j.candidates || [])[0] || {}; if (!cand.content && j.promptFeedback && j.promptFeedback.blockReason) return res.status(200).json({ content: null, blocked: j.promptFeedback.blockReason }); return done(cand.content || null); }
    const msg = (j.error && j.error.message) || ('Gemini error ' + r.status);
    console.error('Gemini error', r.status, pick.m, msg.slice(0, 300));
    if ([429, 500, 503, 404].includes(r.status) || /not found|not supported|overloaded|high demand|unavailable/i.test(msg)) { markBusy(); return busy(msg); }
    if (qKey) return busy(msg); // let the backup try
    return res.status(r.status).json({ error: { code: 'upstream', message: msg }, model: pick.m });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') { markBusy(); return busy(pick.m + ' took too long to answer.'); }
    console.error('chat exception', e);
    return busy(String((e && e.message) || e));
  }
};
