// Groq backup: converts the chat (kept in Gemini's format by the browser) to Groq's
// OpenAI-style format and back, so the browser loop does not change.
const GROQ = 'https://api.groq.com/openai/v1';
let groqModels = null;

async function groqOrder(key) {
  if (groqModels) return groqModels;
  const prefer = [process.env.GROQ_MODEL, 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3-32b', 'meta-llama/llama-4-scout-17b-16e-instruct'].filter(Boolean);   // gpt-oss-20b dropped: it answered money questions from averages instead of the rule
  let have = null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(GROQ + '/models', { headers: { authorization: 'Bearer ' + key }, signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) have = new Set(((await r.json()).data || []).map(m => m.id));
  } catch (e) {}
  groqModels = (have ? prefer.filter(m => have.has(m)) : prefer).slice(0, 3);
  if (!groqModels.length) groqModels = prefer.slice(0, 2);
  return groqModels;
}

function toOpenAI(body) {
  const msgs = [];
  if (body.system) msgs.push({ role: 'system', content: String(body.system) });
  let pending = [];
  (body.contents || []).forEach((c, ti) => {
    const parts = c.parts || [];
    if (c.role === 'model') {
      const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
      const calls = parts.filter(p => p.functionCall).map((p, i) => ({ id: p.functionCall.id || `call_${ti}_${i}`, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } }));
      const m = { role: 'assistant', content: text || null }; if (calls.length) m.tool_calls = calls;
      msgs.push(m); pending = calls;
    } else {
      const frs = parts.filter(p => p.functionResponse);
      if (frs.length) frs.forEach((p, i) => { const fr = p.functionResponse; const match = pending.find(x => x.id === fr.id) || pending[i] || {}; let content = JSON.stringify(fr.response || {}); if (content.length > 6000) content = content.slice(0, 6000) + '…(cut)'; msgs.push({ role: 'tool', tool_call_id: fr.id || match.id || `call_${ti}_${i}`, content }); });
      const text = parts.filter(p => p.text).map(p => p.text).join('\n\n');
      if (text) msgs.push({ role: 'user', content: text });
      pending = [];
    }
  });
  return msgs;
}

async function callGroq(key, model, body, signal) {
  const payload = { model, messages: toOpenAI(body), temperature: 0.2, max_tokens: 1500 };
  if (Array.isArray(body.tools) && body.tools.length) { payload.tools = body.tools.map(d => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.parameters || { type: 'object', properties: {} } } })); payload.tool_choice = 'auto'; }
  const r = await fetch(GROQ + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(payload), signal });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, message: (j.error && j.error.message) || ('Groq error ' + r.status) };
  const msg = ((j.choices || [])[0] || {}).message || {};
  const parts = [];
  if (msg.content) parts.push({ text: String(msg.content).replace(/<think>[\s\S]*?<\/think>/g, '').trim() });
  (msg.tool_calls || []).forEach(tc => { let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {} parts.push({ functionCall: { name: tc.function.name, args, id: tc.id } }); });
  return { ok: true, content: { role: 'model', parts: parts.filter(p => p.functionCall || p.text) } };
}

module.exports = { groqOrder, callGroq };
