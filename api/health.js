// GET /api/health          -> is a key set?
// GET /api/health?check=1  -> sends one tiny test message to Gemini and reports the exact result
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'auto';
  if (!req.query || !req.query.check) return res.status(200).json({ ok: !!key, model });
  if (!key) return res.status(200).json({ ok: false, problem: 'GEMINI_API_KEY is not set in Vercel → Settings → Environment Variables (then redeploy).' });
  const out = { key_starts_with: key.slice(0, 4), key_length: key.length };
  try {
    const lr = await fetch(BASE + '/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    const lj = await lr.json().catch(() => ({}));
    out.list_models_status = lr.status;
    if (!lr.ok) out.list_models_error = lj.error && lj.error.message;
    out.flash_models = (lj.models || []).filter(m => /flash/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', '')).slice(0, 15);
    const use = process.env.GEMINI_MODEL || out.flash_models.find(n => !/(preview|exp|lite|image|tts|audio|live)/i.test(n)) || out.flash_models[0] || 'gemini-flash-latest';
    const gr = await fetch(`${BASE}/models/${encodeURIComponent(use)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }] }) });
    const gj = await gr.json().catch(() => ({}));
    out.test_model = use; out.test_status = gr.status;
    out.test_reply = gr.ok ? ((gj.candidates || [])[0] || {}).content : null;
    if (!gr.ok) out.test_error = gj.error && gj.error.message;
    out.ok = gr.ok;
  } catch (e) { out.ok = false; out.exception = String(e && e.message || e); }
  res.status(200).json(out);
};
