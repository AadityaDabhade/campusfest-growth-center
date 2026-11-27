// Which Gemini models to try, best first. Google's "-latest" aliases always point at a current model;
// retired families (1.x, 2.x) are skipped because new keys cannot use them.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
let cache = null;
async function modelOrder(key) {
  if (cache) return cache;
  let listed = [];
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(BASE + '/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    listed = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  } catch (e) {}
  const ver = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  const usable = listed.filter(n => /flash/i.test(n) && !/image|tts|audio|live|embed|vision|omni/i.test(n) && !/preview|exp/i.test(n) && (ver(n) === 0 || ver(n) >= 3));
  const full = usable.filter(n => !/lite/i.test(n) && ver(n) > 0).sort((a, b) => ver(b) - ver(a));
  const lite = usable.filter(n => /lite/i.test(n) && ver(n) > 0).sort((a, b) => ver(b) - ver(a));
  const order = [];
  // newest full Flash models first (better answers), then the alias, then the lighter ones
  [process.env.GEMINI_MODEL, full[0], full[1], 'gemini-flash-latest', full[2], lite[0], 'gemini-flash-lite-latest', lite[1]].forEach(m => { if (m && !order.includes(m)) order.push(m); });
  cache = order;
  return order;
}
module.exports = { BASE, modelOrder };
