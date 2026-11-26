// GET /api/health          -> is a key set?
// GET /api/health?check=1  -> sends one tiny test message to Gemini and reports the exact result
const { BASE, modelOrder } = require('../lib/models');
module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'auto', groq = !!process.env.GROQ_API_KEY;
  if (!req.query || !req.query.check) return res.status(200).json({ ok: !!key || groq, model, groq_backup: groq });
  if (!key) return res.status(200).json({ ok: false, problem: 'GEMINI_API_KEY is not set in Vercel → Settings → Environment Variables (then redeploy).' });
  const out = { key_starts_with: key.slice(0, 4), key_length: key.length, groq_backup: groq };
  if (groq) { try { const { groqOrder, callGroq } = require('../lib/groq'); const m = (await groqOrder(process.env.GROQ_API_KEY))[0]; const t1 = Date.now(); const g = await callGroq(process.env.GROQ_API_KEY, m, { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }] }); out.groq_model = m; out.groq_ok = g.ok; out.groq_seconds = (Date.now() - t1) / 1000; out.groq_reply = g.ok ? g.content : g.message; } catch (e) { out.groq_ok = false; out.groq_error = String(e.message || e); } }
  try {
    const lr = await fetch(BASE + '/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    const lj = await lr.json().catch(() => ({}));
    out.list_models_status = lr.status;
    if (!lr.ok) out.list_models_error = lj.error && lj.error.message;
    out.flash_models = (lj.models || []).filter(m => /flash/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', '')).slice(0, 15);
    out.chat_will_try = await modelOrder(key);
    const use = out.chat_will_try[0];
    const t0 = Date.now();
    const gr = await fetch(`${BASE}/models/${encodeURIComponent(use)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }], generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } }) });
    const gj = await gr.json().catch(() => ({}));
    out.test_model = use; out.test_status = gr.status; out.test_seconds = (Date.now() - t0) / 1000;
    out.test_reply = gr.ok ? ((gj.candidates || [])[0] || {}).content : null;
    if (!gr.ok) out.test_error = gj.error && gj.error.message;
    out.ok = gr.ok;
  } catch (e) { out.ok = false; out.exception = String(e && e.message || e); }
  res.status(200).json(out);
};
