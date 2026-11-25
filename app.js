/* CampusFest Growth Center: screens, saving, actions and the AI analyst.
   Every number on screen and every number the analyst uses comes from engine.js. */
{
'use strict';
const E = window.GCEngine;
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ok = v => v !== null && v !== undefined && isFinite(v);
const fmt = n => ok(n) ? Math.round(n).toLocaleString('en-IN') : '–';
const inr = n => ok(n) ? '₹' + Math.round(n).toLocaleString('en-IN') : '–';
const lakh = n => ok(n) ? '₹' + (n / 100000).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + 'L' : '–';
const pct = (v, d = 0) => ok(v) ? (v * 100).toFixed(d) + '%' : '–';
const sure = v => !ok(v) ? '–' : v >= 0.995 ? '99%+' : pct(v);
const sgn = n => ok(n) ? (n > 0 ? '+' : '') + fmt(n) : '–';
const dshort = d => d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '–';
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o));
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const EXTRA_OWNERS = { GL: 'Growth lead', SEC: 'Security / operations lead', CORE: 'Fest core team' };
const VIEWS = { live27: { base: '27', label: '2027 plan · live (simulated)' }, orig25: { base: '25', label: '2025 actual · original', locked: true }, edit25: { base: '25', label: '2025 actual · with your edits' }, imported: { base: 'imp', label: 'Imported file' } };
const DIRS = { '27': 'data27', '25': 'data' };

const S = {
  raw: {}, details: [], cache: {}, ds: null, view: 'live27', asOf: null, edits: [], tasks: [], decisions: [], settings: { assump: {}, rules: {} },
  importRaw: null, importName: '', page: 'overview', funnelCamp: 'all', store: 'local', readOnly: false, uid: null, pending: null, review: null, tests: {}, drawer: null
};
const baseOf = () => VIEWS[S.view].base;

/* ---------- settings ---------- */
function assump() { const a = clone(E.DEFAULT_ASSUMPTIONS); const o = S.settings.assump || {}; for (const k in o) if (a[k] && ok(Number(o[k]))) a[k].value = Number(o[k]); return a; }
function rules() { const r = clone(E.DEFAULT_RULES); const o = S.settings.rules || {}; for (const k in o) if (r[k]) Object.assign(r[k], o[k]); return r; }
function owners() { return Object.assign({}, S.ds ? S.ds.owners : {}, EXTRA_OWNERS); }
function ownerLabel(id) { return owners()[id] || id || 'Growth lead'; }
const ended = () => S.asOf >= S.ds.event.eventEndDay;
const before = () => S.asOf < S.ds.event.eventStartDay;
const hasBets = () => S.ds.tables.campaigns.some(c => c.kind === 'bet');

/* ---------- data ---------- */
async function loadBase(b) {
  if (S.raw[b]) return;
  const raw = {};
  await Promise.all(E.TABLES.map(async t => { try { const r = await fetch(DIRS[b] + '/' + t + '.json'); raw[t] = r.ok ? E.rowsToObjects(await r.json()) : []; } catch (e) { raw[t] = []; } }));
  if (!raw.people.length) throw new Error('data files missing');
  if (b === '25') { try { S.details = await (await fetch('data/details.json')).json(); } catch (e) { S.details = []; } }
  S.raw[b] = raw;
}
function editsFor(b) { return S.edits.filter(e => !e.undone && (e.base || '25') === b).slice().sort((a, c) => (a.at || '').localeCompare(c.at || '')); }
function rebuild(keepDate) {
  const v = S.view, b = baseOf();
  if (v === 'imported' && S.importRaw) S.ds = E.build(S.importRaw, { label: 'Imported: ' + S.importName });
  else if (v === 'orig25') { S.cache.orig25 = S.cache.orig25 || E.build(S.raw['25'], { details: S.details, label: VIEWS.orig25.label }); S.ds = S.cache.orig25; }
  else { const ed = editsFor(b); S.ds = E.build(E.applyEdits(S.raw[b], ed), { details: b === '25' ? S.details : [], label: VIEWS[v].label }); }
  const ev = S.ds.event;
  if (!keepDate || !S.asOf || S.asOf < ev.start || S.asOf > ev.end) S.asOf = ev.end;
  syncBar();
}
function syncBar() {
  const ev = S.ds.event, d = $('#asOf');
  d.min = ev.start; d.max = ev.end; d.value = S.asOf; $('#dsSel').value = S.view;
  $('#dsSel option[value=imported]').disabled = !S.importRaw;
  const wk = E.weekOf(S.ds, S.asOf);
  $('#wkLabel').textContent = wk ? 'Week ' + wk + ' of 15' + (S.asOf === ev.end && ev.simulated ? ' · today in the simulation' : '') : (S.asOf < ev.eventStartDay ? E.daysBetween(S.asOf, ev.eventStartDay) + ' days to the event' : S.asOf <= ev.eventEndDay ? 'Event days' : 'After the event');
  $('#evname').textContent = ev.name + (ev.city ? ', ' + ev.city : '');
  $('#navBets').hidden = !hasBets();
  $('#navEvent').hidden = !S.ds.tables.checkins.length;
  const fl = E.flags(S.ds, S.asOf, rules(), assump()), n = fl.filter(f => f.level !== 'watch').length;
  $('#sigCount').hidden = !n; $('#sigCount').textContent = n;
  $('#saveState').textContent = { local: 'Your changes save in this browser.', loading: 'Loading saved edits…', slow: 'Saved edits not reachable yet.', saved: 'Edits saved and shared.', error: 'Saving unavailable: kept in this browser.' }[S.store] + (S.readOnly ? ' View-only.' : '');
}

/* ---------- saving: shared db when signed in, this browser otherwise ---------- */
const Store = {
  db: null,
  async init() {
    const C = window.claude; let db = null, user = null;
    if (C && C.use) { try { [db, user] = await Promise.all([C.use('db'), C.use('user')]); } catch (e) {} }
    if (user) { try { S.uid = await user.id(); } catch (e) {} try { if ((await user.can('data.write')) === false) S.readOnly = true; } catch (e) {} }
    if (!db) { S.store = 'local'; this.loadLocal(); await this.seedLocal(); onData('edits'); return; }
    this.db = db; S.store = 'loading'; syncBar();
    const timer = setTimeout(() => { if (S.store === 'loading') { S.store = 'slow'; syncBar(); } }, 10000);
    const live = () => { clearTimeout(timer); if (S.store !== 'error') S.store = 'saved'; };
    ['edits', 'tasks', 'decisions'].forEach(c => db.collection(c).onSnapshot(snap => { S[c] = snap.docs.map(d => d.data()); if (!snap.metadata.fromCache) live(); onData(c); }, () => { clearTimeout(timer); S.store = 'error'; syncBar(); }));
    db.doc('settings/main').onSnapshot(d => { S.settings = d.exists ? clone(d.data()) : {}; S.settings.assump = S.settings.assump || {}; S.settings.rules = S.settings.rules || {}; onData('settings'); }, () => {});
  },
  loadLocal() { try { ['edits', 'tasks', 'decisions'].forEach(c => { S[c] = JSON.parse(localStorage.getItem('gc2.' + c) || '[]'); }); S.settings = JSON.parse(localStorage.getItem('gc2.settings') || '{"assump":{},"rules":{}}'); } catch (e) {} },
  async seedLocal() { try { if (localStorage.getItem('gc2.seeded')) return; const seed = await (await fetch('data27/tasks.json')).json(); const have = new Set(S.tasks.map(t => t.id)); S.tasks = S.tasks.concat(seed.filter(t => !have.has(t.id))); localStorage.setItem('gc2.seeded', '1'); this.saveLocal(); } catch (e) {} },
  saveLocal() { try { ['edits', 'tasks', 'decisions'].forEach(c => localStorage.setItem('gc2.' + c, JSON.stringify(S[c]))); localStorage.setItem('gc2.settings', JSON.stringify(S.settings)); } catch (e) {} },
  async put(coll, obj) {
    obj = clone(obj); const list = S[coll].slice(); const i = list.findIndex(x => x.id === obj.id); if (i >= 0) list[i] = obj; else list.push(obj); S[coll] = list;
    if (this.db && !S.readOnly) {
      try { await this.db.collection(coll).doc(obj.id).set(obj); }
      catch (e) { if (e && e.code === 'invalid_argument') S.readOnly = true; toast(e && e.code === 'quota_exceeded' ? 'Storage is full: delete old tasks or edits.' : 'Not saved to the shared copy. Kept in this browser.'); this.saveLocal(); }
    } else this.saveLocal();
  },
  async remove(coll, id) { S[coll] = S[coll].filter(x => x.id !== id); if (this.db && !S.readOnly) { try { await this.db.collection(coll).doc(id).delete(); } catch (e) { toast('Could not delete in the shared copy.'); } } else this.saveLocal(); },
  async putSettings() { if (this.db && !S.readOnly) { try { await this.db.doc('settings/main').set(clone(S.settings)); } catch (e) { toast('Settings not saved to the shared copy.'); } } else this.saveLocal(); }
};
function onData(c) { if ((c === 'edits' || c === 'settings') && S.raw[baseOf()]) rebuild(true); render(); }

async function commitEdit(type, payload, note) {
  if (S.view === 'imported') { toast('Imported files are read-only.'); return null; }
  if (S.view === 'orig25') { S.view = 'edit25'; toast('The 2025 original stays locked. Your change went to "2025 with your edits".'); }
  const e = { id: newId('ED'), base: baseOf(), type, payload, note: note || '', at: new Date().toISOString(), as_of: S.asOf, by: S.uid || 'this browser', undone: false };
  await Store.put('edits', e); rebuild(true); render(); return e;
}

/* ---------- toast ---------- */
let toastT = 0;
function toast(msg, undo) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = '<span></span>' + (undo ? '<button class="btn sm" type="button">Undo</button>' : ''); t.firstChild.textContent = msg; t.className = 'show';
  if (undo) t.querySelector('button').onclick = () => { undo(); t.className = ''; };
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, undo ? 9000 : 4500);
}

/* ---------- chart ---------- */
let observers = [];
function niceStep(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function kfmt(v) { const t = (x, d) => String(+x.toFixed(d)); return v >= 100000 ? t(v / 100000, 2) + 'L' : v >= 1000 ? t(v / 1000, 1) + 'k' : t(v, 1); }
function mount(id, draw) { const s = document.getElementById(id); if (!s) return; const ro = new ResizeObserver(() => { try { draw(s); } catch (e) { console.error(e); } }); ro.observe(s); observers.push(ro); }
function lineChart(s, cfg) {
  const W = s.clientWidth, H = s.clientHeight; if (!W || !H) return;
  const m = { l: 42, r: 12, t: 12, b: 24 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = cfg.x.length;
  let mx = 0; cfg.series.forEach(se => se.values.forEach(v => { if (ok(v) && v > mx) mx = v; }));
  const st = niceStep(mx / 4), nt = Math.max(1, Math.ceil(mx * 1.03 / st)), ym = st * nt;
  const X = i => m.l + (n > 1 ? i / (n - 1) : 0) * iw, Y = v => m.t + ih - (v / ym) * ih; let g = '';
  for (let k = 0; k <= nt; k++) { const y = Y(st * k); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="#eceef0"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end">${esc(kfmt(st * k))}</text>`; }
  const ticks = W < 520 ? 3 : 6; for (let k = 0; k < ticks; k++) { const i = Math.round(k * (n - 1) / (ticks - 1)); g += `<text x="${X(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}">${esc(dshort(cfg.x[i]))}</text>`; }
  if (ok(cfg.marker)) { const x = X(cfg.marker), right = cfg.marker > n * 0.75; g += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${m.t + ih}" stroke="#111418" stroke-dasharray="2 3"/><text x="${x + (right ? -6 : 6)}" y="${m.t + 10}" text-anchor="${right ? 'end' : 'start'}" style="fill:#111418">${esc(cfg.markerLabel || 'today')}</text>`; }
  cfg.series.forEach(se => { let d = '', pen = false; se.values.forEach((v, i) => { if (!ok(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); g += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.w || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round"/>`; });
  s.innerHTML = g;
}
function colChart(s, cfg) {
  const W = s.clientWidth, H = s.clientHeight; if (!W || !H) return;
  const m = { l: 38, r: 10, t: 12, b: 22 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = cfg.values.length;
  const mx = Math.max(cfg.cap || 0, ...cfg.values, 1), st = niceStep(mx / 4), nt = Math.max(1, Math.ceil(mx * 1.05 / st)), ym = st * nt, Y = v => m.t + ih - v / ym * ih, bw = iw / n; let g = '';
  for (let k = 0; k <= nt; k++) { const y = Y(st * k); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="#eceef0"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end">${esc(kfmt(st * k))}</text>`; }
  cfg.values.forEach((v, i) => { g += `<rect x="${m.l + i * bw + bw * .15}" y="${Y(v)}" width="${Math.max(1, bw * .7)}" height="${Math.max(0, m.t + ih - Y(v))}" fill="${cfg.cap && v >= cfg.cap * 0.8 ? '#c8281e' : '#111418'}"><title>${esc(cfg.labels[i] + ': ' + fmt(v))}</title></rect>`; });
  const step = Math.max(1, Math.ceil(n / (W < 520 ? 4 : 9))); cfg.labels.forEach((l, i) => { if (i % step === 0) g += `<text x="${m.l + i * bw + bw / 2}" y="${H - 5}" text-anchor="middle">${esc(cfg.short ? cfg.short(l) : l)}</text>`; });
  if (cfg.cap) { const y = Y(cfg.cap); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="#c8281e" stroke-dasharray="5 4"/><text x="${W - m.r}" y="${y - 5}" text-anchor="end" style="fill:#c8281e">${esc(cfg.capLabel || '')}</text>`; }
  s.innerHTML = g;
}

/* ---------- shared bits ---------- */
const tag = t => `<span class="tag" title="${t === 'S' ? 'From records' : 'Uses an assumption'}">${t}</span>`;
const kpi = (l, v, s, t) => `<div class="kpi"><div class="l">${esc(l)}${t ? tag(t) : ''}</div><div class="v">${esc(v)}</div><div class="s">${esc(s || '')}</div></div>`;
function openTaskFor(fid) { return S.tasks.find(t => t.flag_id === fid && t.status !== 'done' && (t.base || '25') === baseOf()); }
function flagRow(f, full) {
  const t = openTaskFor(f.id);
  return `<div class="flag"><div class="t"><span class="lvl ${f.level}">${f.level}</span>${esc(f.title)}</div><div class="e">${esc(f.evidence)}${full ? ` <br>Owner: ${esc(f.owner)} · Suggested: ${esc(f.action)}` : ''}</div>
  <div class="row">${t ? `<span class="note">Task open for ${esc(ownerLabel(t.owner))}, due ${esc(dshort(t.due))}</span>` : `<button class="btn sm" data-act="flag" data-id="${esc(f.id)}" type="button">Act on this</button>`}<button class="btn ghost sm" data-act="ask" data-q="${esc('Why is this flagged: "' + f.title + '"? What should we do?')}" type="button">Ask why</button></div></div>`;
}
function campOptions(sel, all, filter) { return (all ? '<option value="all">All campaigns</option>' : '') + Array.from(S.ds.camps.values()).filter(c => !filter || filter(c)).map(c => `<option value="${esc(c.campaign_id)}" ${c.campaign_id === sel ? 'selected' : ''}>${esc(c.campaign_name)}</option>`).join(''); }
function ownerOptions(sel) { const o = owners(); return Object.keys(o).map(k => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(o[k])}</option>`).join(''); }
function verdict(r, end, overall, cap, min, bets) {
  if (!r.campaign_id) return ['', ''];
  if (r.status === 'paused') return ['Keep', 'Paused'];
  if (r.kind === 'bet') { const b = bets.find(x => x.campaign_id === r.campaign_id); return b ? [b.decision, 'Judged on test vs comparison'] : ['', '']; }
  const base = end ? r.visitors : r.expected_visitors, cost = end ? r.cost_per_visitor : r.cost_per_expected_visitor;
  if (base < min || !ok(cost)) return ['Too early', 'Under ' + min + ' people'];
  if (cost > 1.5 * cap) return ['Stop', 'Far above cap'];
  if (cost > cap) return ['Change', 'Above ' + inr(cap) + ' cap'];
  if (cost <= 0.5 * cap && (!end || r.showup >= overall)) return ['Scale', 'Cheap, people show up'];
  return ['Keep', 'Within cap'];
}
const vcls = v => v === 'Too early' ? 'v-early' : 'v-' + v;

/* ---------- pages ---------- */
const PAGES = {};
PAGES.overview = () => {
  const ds = S.ds, D = S.asOf, A = assump(), k = E.kpis(ds, D, A), fl = E.flags(ds, D, rules(), A), b = E.budget(ds, D), g = k.target || {}, ev = ds.event;
  const pc = E.pace(ds, D)[0], proj = k.projection;
  let title, sub, tiles;
  if (pc && pc.curve && before()) {
    title = { ok: 'At or above stretch pace', watch: 'Registrations above base pace, below stretch', warn: 'Registrations below base pace', act: 'Registrations more than 15% below base pace', none: 'Registrations have just opened' }[pc.level] + (pc.week ? ` (week ${pc.week})` : '');
    sub = `${fmt(pc.actual)} outside registrations vs ${fmt(pc.base_pace)} base and ${fmt(pc.stretch_pace)} stretch pace for this week.` + (proj.likely ? ` Forecast: ${fmt(proj.low)}–${fmt(proj.high)} outside attendees (goal ${fmt(g.visitors)}, stretch ${fmt(g.stretch_visitors)}).` : '');
    const rp = hasBets() ? E.reservePlan(ds, D, A) : null;
    tiles = kpi('Outside registrations', fmt(k.registered), `base pace ${fmt(pc.base_pace)} · stretch ${fmt(pc.stretch_pace)}`, 'S') +
      kpi('Forecast outside attendees', proj.likely ? fmt(proj.likely) : 'too early', proj.likely ? `range ${fmt(proj.low)}–${fmt(proj.high)}` : 'needs 10% of registrations', 'A') +
      kpi('Spend', lakh(k.spend), `of ${lakh(b.approved)} budget (${pct(b.used)})`, 'S') +
      (rp ? kpi('Reserve left', lakh(rp.reserve_left), rp.suggestions.length ? rp.suggestions.length + ' bet' + (rp.suggestions.length > 1 ? 's' : '') + ' ready for money' : 'no bet ready yet', 'S') : '');
  } else if (ended()) {
    const rows = E.campaignRows(ds, D, { assumptions: A }).filter(r => r.campaign_id && r.registered >= 30), worst = rows.sort((a, c) => a.showup - c.showup)[0];
    title = `${fmt(k.visitors)} verified outside visitors: ${pct(k.attainment && k.attainment.visitors)} of the ${fmt(g.visitors)} goal`;
    sub = `Registrations ended at ${fmt(k.registered)} of ${fmt(g.registered)}.` + (worst ? ` Weakest show-up: ${worst.campaign}, ${pct(worst.showup)} of registrants came vs ${pct(k.showup)} overall.` : '');
    tiles = kpi('Verified outside visitors', fmt(k.visitors), `goal ${fmt(g.visitors)} · ${fmt(k.walkins)} walk-ins`, 'S') + kpi('Registered', fmt(k.registered), `goal ${fmt(g.registered)}`, 'S') + kpi('Show-up', pct(k.showup), `${fmt(k.visitorsRegistered)} of ${fmt(k.registered)} came`, 'S') + kpi('Cost per visitor', inr(k.costPerVisitor), `${inr(k.spend)} spent`, 'S');
  } else {
    const p = E.pace(ds, D).find(x => x.key === 'registered');
    title = before() ? (p && p.gap > 0 ? (p.on_pace ? 'On pace for registrations' : 'Registrations behind pace') + `: ${p.run_rate_7d}/day vs ${p.required_per_day}/day needed` : 'Registration goal reached') : `Event in progress: ${fmt(k.visitors)} visitors so far`;
    sub = `Forecast ${fmt(proj.low)}–${fmt(proj.high)} outside visitors vs a goal of ${fmt(g.visitors)}.`;
    tiles = kpi('Registered', fmt(k.registered), `goal ${fmt(g.registered)}`, 'S') + kpi('Forecast visitors', fmt(proj.likely), `range ${fmt(proj.low)}–${fmt(proj.high)}`, 'A') + kpi('Confirmed', fmt(k.status.confirmed), `${pct(k.active ? k.status.confirmed / k.active : null)} of active`, 'S') + kpi('Spend', inr(k.spend), `${pct(b.used)} of budget`, 'S');
  }
  const top = fl.filter(f => f.level !== 'watch').slice(0, 3), more = fl.length - top.length;
  return `<h1>${esc(title)}${ev.simulated ? '<span class="label sim">simulated data</span>' : ''}</h1><p class="sub">${esc(sub)}</p>
  <div class="kpis">${tiles}</div>
  <div class="two"><div class="card"><h2>${pc && pc.curve ? 'Outside registrations vs plan pace' : 'Path to goal'}</h2><div class="fig"><svg id="pathChart" role="img" aria-label="Registrations against goal"></svg></div>
    <div class="legend">${pc && pc.curve ? '<span><i style="border-color:#111418;border-top-width:3px"></i>Actual</span><span><i style="border-color:#111418;border-top-style:dashed"></i>Base pace</span><span><i style="border-color:#2f6fed;border-top-style:dashed"></i>Stretch pace</span>' : '<span><i style="border-color:#111418;border-top-width:3px"></i>Registered</span><span><i style="border-color:#9aa1a9"></i>Identified</span><span><i style="border-color:#111418;border-top-style:dashed"></i>Goal</span>'}</div></div>
  <div class="card"><h2>Needs attention</h2>${top.length ? top.map(f => flagRow(f)).join('') : '<p class="empty">Nothing at Warn or Act.</p>'}${more > 0 ? `<p class="note" style="margin-top:8px"><a href="#signals">${more} more signal${more > 1 ? 's' : ''} →</a></p>` : ''}</div></div>`;
};
function drawOverview() {
  const ds = S.ds, ev = ds.event, D = S.asOf, curve = ds.paceCurve.length;
  const endDay = curve ? E.addDays(ev.eventStartDay, -1) : ev.eventEndDay, days = []; for (let d = ev.start; d <= endDay; d = E.addDays(d, 1)) days.push(d);
  const cum = k => E.trend(ds, k, 'day', ev.start, endDay).rows.map(r => r.cumulative);
  const cut = D > endDay ? days.length - 1 : days.indexOf(D), upto = arr => arr.map((v, i) => i <= cut ? v : null);
  let series;
  if (curve) { const t = E.targetAt(ds, D) || {}; const sh = days.map(d => E.shareAt(ds, d)); series = [{ values: sh.map(x => x * t.stretch_registration_goal), color: '#2f6fed', dash: '5 4', w: 1.5 }, { values: sh.map(x => x * t.registration_goal), color: '#111418', dash: '5 4', w: 1.5 }, { values: upto(cum('registrations')), color: '#111418', w: 3 }]; }
  else { const gr = days.map(d => (E.targetAt(ds, d) || {}).registration_goal || null); series = [{ values: gr, color: '#111418', dash: '5 4', w: 1.5 }, { values: upto(cum('identified')), color: '#9aa1a9' }, { values: upto(cum('registrations')), color: '#111418', w: 3 }]; }
  mount('pathChart', s => lineChart(s, { x: days, series, marker: cut >= 0 && D <= endDay ? cut : null, markerLabel: ev.simulated && D === ev.end ? 'today' : 'as of ' + dshort(D) }));
}

PAGES.funnel = () => {
  const ds = S.ds, D = S.asOf, A = assump(), cid = S.funnelCamp === 'all' ? undefined : S.funnelCamp, f = E.funnel(ds, D, cid), a = E.anonFunnel(ds, D, cid);
  let steps = f.steps.slice(); if (before()) { steps = steps.filter(s => !/^Visited/.test(s.step)); const k = E.kpis(ds, D, A); if (!cid && k.projection.likely) steps.push({ step: 'Expected to attend (A)', n: Math.round(k.projection.likely * (k.registered / (k.projection.projected_registrations || k.registered)) * (1 - A.walkin_share.value)), from_prev: null }); }
  const top = steps[0].n || 1; let worst = null; steps.forEach((s, i) => { if (i && s.from_prev !== null && (!worst || s.from_prev < worst.from_prev)) worst = s; });
  return `<h1>Funnel${cid ? ': ' + esc(f.campaign) : ''}</h1><p class="sub">People counted once by ID. ${esc(f.basis)}.${worst ? ` Biggest loss: <b>${esc(worst.step.toLowerCase())}</b>, ${pct(1 - worst.from_prev)} of the step before did not make it.` : ''}</p>
  <div class="row" style="margin-bottom:14px"><label class="l" style="min-width:260px">Campaign<select data-ch="funnelCamp">${campOptions(S.funnelCamp, true)}</select></label></div>
  <div class="card funnel">${steps.map(s => `<div class="r"><span>${esc(s.step)}</span><div class="b"><i class="${s === worst ? 'hot' : ''}" style="width:${(s.n / top * 100).toFixed(1)}%"></i></div><span class="x">${fmt(s.n)}${s.from_prev !== null && s.from_prev !== undefined ? ' · ' + pct(s.from_prev) : ''}</span></div>`).join('')}
  ${!cid && f.walkins ? `<p class="note" style="margin-top:8px">Plus ${fmt(f.walkins)} walk-ins who came without registering.</p>` : ''}</div>
  <div class="card" style="margin-top:18px"><h2>Before people identify themselves</h2><p class="note">Anonymous events, not people.</p><div class="scroll"><table><tr><th>Step</th><th class="n">Count</th><th class="n">Rate</th></tr><tr><td>Impressions</td><td class="n">${fmt(a.impressions)}</td><td class="n"></td></tr><tr><td>Clicks</td><td class="n">${fmt(a.clicks)}</td><td class="n">${pct(a.ctr, 1)}</td></tr><tr><td>Landing sessions</td><td class="n">${fmt(a.sessions)}</td><td class="n">${pct(a.click_to_session)}</td></tr><tr><td>Form starts</td><td class="n">${fmt(a.form_starts)}</td><td class="n">${pct(a.session_to_start)}</td></tr></table></div></div>`;
};

PAGES.campaigns = () => {
  const ds = S.ds, D = S.asOf, A = assump(), end = ended(), k = E.kpis(ds, D, A), cap = A.cost_cap.value, min = rules().min_people.value, bets = E.betRows(ds, D, A);
  const rows = E.campaignRows(ds, D, { assumptions: A }).filter(r => r.campaign_id || r.registered || r.visitors);
  const groups = hasBets() ? [['Channels', rows.filter(r => r.kind !== 'bet')], ['Bets', rows.filter(r => r.kind === 'bet')]] : [['', rows]];
  const tr = r => { const [v, why] = verdict(r, end, k.showup, cap, min, bets), cost = end ? r.cost_per_visitor : r.cost_per_expected_visitor;
    return `<tr class="${r.campaign_id ? 'click' : ''}" ${r.campaign_id ? `data-act="camp" data-id="${esc(r.campaign_id)}" tabindex="0"` : ''}><td><b>${esc(r.campaign)}</b>${r.status && r.status !== 'active' ? ` <span class="label">${esc(r.status)}</span>` : ''}<div class="note">${esc(r.owner)}${r.audience === 'our students' ? ' · our students' : ''}</div></td><td class="n">${r.planned_budget_inr ? inr(r.planned_budget_inr) : '–'}</td><td class="n">${inr(r.spend)}</td><td class="n">${fmt(r.registered)}</td><td class="n">${fmt(r.confirmed)}</td><td class="n">${end ? fmt(r.visitors) : fmt(r.expected_visitors)}</td><td class="n">${r.spend ? inr(cost) : '–'}</td><td><span class="${vcls(v)}">${esc(v)}</span><div class="note">${esc(why)}</div></td></tr>`; };
  return `<h1>Campaigns</h1><p class="sub">Channels are judged on cost per ${end ? 'verified' : 'expected'} visitor against the ${inr(cap)} cap${hasBets() ? '; bets on extra attendees over a comparison group (see Bets)' : ''}. Click a row to edit.</p>
  <div class="row" style="margin-bottom:12px"><button class="btn" data-act="newcamp" type="button">Add campaign</button><button class="btn ghost" data-act="spend" type="button">Record spend</button></div>
  <div class="scroll"><table><tr><th>Campaign</th><th class="n">Planned</th><th class="n">Spent</th><th class="n">Registered</th><th class="n">Confirmed</th><th class="n">${end ? 'Visitors' : 'Expected visitors'}${end ? '' : tag('A')}</th><th class="n">₹ / ${end ? '' : 'exp. '}visitor</th><th>Verdict</th></tr>
  ${groups.map(([name, list]) => (name ? `<tr><td colspan="8" class="note" style="background:#fff;font-weight:600;padding-top:14px">${name}</td></tr>` : '') + list.map(tr).join('')).join('')}</table></div>`;
};

PAGES.bets = () => {
  const ds = S.ds, D = S.asOf, A = assump(), rows = E.betRows(ds, D, A), rp = E.reservePlan(ds, D, A);
  if (!rows.length) return `<h1>Bets</h1><p class="sub">This dataset has no bets. Switch to the 2027 plan.</p>`;
  const ready = rp.suggestions;
  return `<h1>${ready.length ? esc(ready.map(r => r.bet).join(' and ')) + (ready.length > 1 ? ' are' : ' is') + ' ready for reserve money' : 'No bet is ready for reserve money yet'}</h1>
  <p class="sub">Extra attendees = people in test colleges × (test rate − comparison rate) × show-up. Money goes to the lowest next-tranche cost under each bet's cap. Reserve left: <b>${lakh(rp.reserve_left)}</b> of ${lakh(rp.reserve_total)}.</p>
  <div class="scroll"><table><tr><th>Bet</th><th class="n">Test vs comparison</th><th class="n">Sure it works</th><th class="n">Extra attendees${tag('A')}</th><th class="n">₹ per extra</th><th class="n">Next-tranche ₹ / cap</th><th>Decision</th></tr>
  ${rows.map(b => `<tr class="click" data-act="bet" data-id="${esc(b.campaign_id)}" tabindex="0"><td><b>${esc(b.rank + '. ' + b.bet)}</b><div class="note">${esc(b.owner)} · ${esc(b.type)}${b.audience === 'our students' ? ' · our students' : ''}</div></td>
  <td class="n">${b.test_rate !== null ? pct(b.test_rate) + ' vs ' + pct(b.comparison_rate) : fmt(b.test_registered) + ' sign-ups'}<div class="note">${b.test_rate !== null ? fmt(b.test_people) + ' / ' + fmt(b.comparison_people) + ' people' : 'no comparison'}</div></td>
  <td class="n">${sure(b.sure_lift_above_zero)}</td><td class="n">${fmt(b.expected_extra_attendees)}</td><td class="n">${inr(b.cost_per_extra)}</td><td class="n">${inr(b.next_tranche_cost)} / ${inr(b.cost_cap_inr)}</td>
  <td><span class="${vcls(b.decision)}">${esc(b.decision)}</span><div class="note">${esc(b.decision === 'Scale' ? 'Gets tranche money' : b.decision === 'Keep' ? 'Works; no tranche money' : b.decision === 'Too early' ? 'Evidence rule not met' : b.decision === 'Change' ? 'Above cost cap' : 'No lift')}</div></td></tr>`).join('')}</table></div>
  ${ready.length ? `<div class="card" style="margin-top:18px"><h2>Suggested reserve release</h2>${ready.map(r => `<div class="flag"><div class="t">${esc(r.bet)}: release ${inr(r.amount)}</div><div class="e">Next-tranche cost ${inr(r.next_tranche_cost)} vs cap ${inr(r.cap)} · ${sure(r.sure)} sure · ${esc(r.rule)}</div><button class="btn sm" data-act="release" data-id="${esc(r.campaign_id)}" data-amt="${r.amount}" type="button">Release ${esc(lakh(r.amount))}</button></div>`).join('')}<p class="note" style="margin-top:8px">Releases over ₹50k also need the lift to hold in two segments (near and far colleges): the owner confirms before release.</p></div>` : ''}`;
};
function betDrawer(id) {
  const b = E.betRows(S.ds, S.asOf, assump()).find(x => x.campaign_id === id); if (!b) return '';
  return `<p>${esc(b.test_design)}</p><table><tr><td>Live for</td><td class="n">${b.weeks_live} weeks</td></tr><tr><td>Spent / planned</td><td class="n">${inr(b.spend)} / ${inr(b.planned_budget_inr)}</td></tr>${b.reserve_released_inr ? `<tr><td>Reserve released</td><td class="n">${inr(b.reserve_released_inr)}</td></tr>` : ''}
  <tr><td>Test group</td><td class="n">${fmt(b.test_registered)} of ${fmt(b.test_people)}${b.test_rate !== null ? ' (' + pct(b.test_rate, 1) + ')' : ''}</td></tr>${b.comparison_people !== null ? `<tr><td>Comparison group</td><td class="n">${fmt(b.comparison_registered)} of ${fmt(b.comparison_people)} (${pct(b.comparison_rate, 1)})</td></tr><tr><td>Lift</td><td class="n">${pct(b.lift, 1)} · ${sure(b.sure_lift_above_zero)} sure</td></tr>` : ''}
  <tr><td>Extra registrations</td><td class="n">${fmt(b.extra_registrations)}</td></tr><tr><td>Attend per registrant (A)</td><td class="n">${ok(b.attendees_per_registrant) ? b.attendees_per_registrant.toFixed(2) : '–'}</td></tr><tr><td>Expected extra attendees (A)</td><td class="n">${fmt(b.expected_extra_attendees)}${b.expected_extra_low !== null ? ' (low ' + fmt(b.expected_extra_low) + ')' : ''}</td></tr>
  <tr><td>Cost per extra</td><td class="n">${inr(b.cost_per_extra)}${b.cost_per_extra_low_end ? ' (low-end ' + inr(b.cost_per_extra_low_end) + ')' : ''}</td></tr><tr><td>Next-tranche cost (÷ ${b.scale_factor})</td><td class="n">${inr(b.next_tranche_cost)}</td></tr><tr><td>Cap</td><td class="n">${inr(b.cost_cap_inr)}</td></tr></table>
  <p style="margin-top:12px"><span class="${vcls(b.decision)}">${esc(b.decision)}</span>: ${esc(b.why)}.</p>
  <div class="row"><button class="btn" data-act="draft" data-kind="task" data-camp="${esc(id)}" type="button">Create a task</button><button class="btn ghost" data-act="ask" data-q="${esc('Explain the ' + b.bet + ' bet: is it working and what should we do with it?')}" type="button">Ask the analyst</button></div>`;
}

PAGES.signals = () => {
  const fl = E.flags(S.ds, S.asOf, rules(), assump());
  return `<h1>Signals</h1><p class="sub">Watch = keep an eye · Warn = owner fixes it this week · Act = decide now. Fewer than ${rules().min_people.value} people is not graded. Thresholds are in Data.</p>
  <div class="card">${fl.length ? fl.map(f => flagRow(f, true)).join('') : '<p class="empty">No signals at this date.</p>'}</div>`;
};

PAGES.tasks = () => {
  const b = baseOf(), tasks = S.tasks.filter(t => (t.base || '25') === b), decs = S.decisions.filter(d => (d.base || '25') === b).sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''));
  const card = t => { const over = t.status !== 'done' && t.due && t.due < S.asOf, dec = S.decisions.find(d => d.id === t.decision_id), due = dec && dec.status !== 'reviewed' && dec.review_date && S.asOf >= dec.review_date;
    return `<div class="task ${over ? 'over' : ''}"><b>${esc(t.title)}</b><div class="m">${esc(ownerLabel(t.owner))} · due ${esc(dshort(t.due))}${over ? ' · <span style="color:var(--act)">overdue</span>' : ''}${t.campaign_id ? ' · ' + esc(E.campName(S.ds, t.campaign_id)) : ''}</div>
    <div class="row">${t.status !== 'todo' ? `<button class="btn ghost sm" data-act="tmove" data-id="${esc(t.id)}" data-d="-1" type="button" aria-label="Move back">←</button>` : ''}${t.status !== 'done' ? `<button class="btn ghost sm" data-act="tmove" data-id="${esc(t.id)}" data-d="1" type="button">${t.status === 'todo' ? 'Start' : 'Done'} →</button>` : ''}${due ? `<button class="btn sm" data-act="review" data-id="${esc(dec.id)}" type="button">Review result</button>` : ''}<button class="btn ghost sm" data-act="tdel" data-id="${esc(t.id)}" type="button">Delete</button></div></div>`; };
  return `<h1>Tasks</h1><p class="sub">Each confirmed action adds a task and a logged decision. On its review date the decision compares the number it watches before and after.</p>
  ${S.review ? reviewPanel(S.review) : ''}
  <div class="row" style="margin-bottom:12px"><button class="btn" data-act="draft" data-kind="task" type="button">Add task</button></div>
  <div class="board">${[['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']].map(([k, l]) => `<div class="col"><h3>${l} · ${tasks.filter(t => t.status === k).length}</h3>${tasks.filter(t => t.status === k).sort((x, y) => (x.due || '').localeCompare(y.due || '')).map(card).join('') || '<p class="note">Nothing here.</p>'}</div>`).join('')}</div>
  <h2 style="margin-top:26px">Decision log</h2>${decs.length ? `<div class="scroll"><table><tr><th>Decided</th><th>Decision</th><th>Watching</th><th class="n">Then</th><th class="n">Now</th><th>Result</th></tr>${decs.map(d => `<tr><td>${esc(dshort(d.as_of))}</td><td>${esc(d.title)}</td><td class="note">${esc(metricLabel(d.metric))}<br>review ${esc(dshort(d.review_date))}</td><td class="n">${esc(mfmt(d.metric, d.metric && d.metric.before))}</td><td class="n">${esc(mfmt(d.metric, metricNow(d.metric)))}</td><td>${d.status === 'reviewed' ? esc(d.outcome) : d.review_date && S.asOf >= d.review_date ? `<button class="btn sm" data-act="review" data-id="${esc(d.id)}" type="button">Review</button>` : '<span class="note">waiting</span>'}</td></tr>`).join('')}</table></div>` : '<p class="empty">No decisions yet. Use "Act on this" on a signal, or release reserve on the Bets page.</p>'}
  <p class="note" style="margin-top:10px">To see a follow-up now: set the date back a week or two, act on a signal, then move the date forward.</p>`;
};
const METRICS = { registered: 'Registered', confirmed: 'Confirmed', expected_visitors: 'Expected visitors', cost_per_expected_visitor: 'Cost per expected visitor', cost_per_visitor: 'Cost per visitor', showup: 'Show-up', cancel_rate: 'Cancellation rate', opt_out_rate: 'Opt-out rate', spend: 'Spend', expected_extra_attendees: 'Expected extra attendees (bet)', cost_per_extra: 'Cost per extra attendee (bet)' };
function metricLabel(m) { return m && m.key ? METRICS[m.key] + ' · ' + (m.campaign_id ? E.campName(S.ds, m.campaign_id) : 'all') : '–'; }
function metricValue(ds, D, m) {
  if (!m || !m.key) return null; const A = assump();
  if (m.key === 'expected_extra_attendees' || m.key === 'cost_per_extra') { const b = E.betRows(ds, D, A).find(x => x.campaign_id === m.campaign_id); return b ? b[m.key] : null; }
  if (m.campaign_id) { const r = E.campaignRows(ds, D, { assumptions: A }).find(x => x.campaign_id === m.campaign_id); return r ? r[m.key] : null; }
  const k = E.kpis(ds, D, A); return { registered: k.registered, confirmed: k.status.confirmed, expected_visitors: k.projection.likely, cost_per_visitor: k.costPerVisitor, showup: k.showup, spend: k.spend, cancel_rate: k.registered ? k.status.cancelled / k.registered : null }[m.key];
}
const metricNow = m => metricValue(S.ds, S.asOf, m);
function mfmt(m, v) { if (!m || !ok(v)) return '–'; if (/rate|showup/.test(m.key)) return pct(v, 1); if (/cost|spend/.test(m.key)) return inr(v); return fmt(v); }
function reviewPanel(id) {
  const d = S.decisions.find(x => x.id === id); if (!d) return '';
  const now = metricNow(d.metric), was = d.metric && d.metric.before;
  return `<div class="card" style="margin-bottom:18px;border-color:var(--ink)"><h2>Follow-up: ${esc(d.title)}</h2><p class="note">Decided ${esc(dshort(d.as_of))}. Expected: ${esc(d.expected || 'not stated')}.</p>
  <p><b>${esc(metricLabel(d.metric))}:</b> ${esc(mfmt(d.metric, was))} → ${esc(mfmt(d.metric, now))} as of ${esc(dshort(S.asOf))}.</p><p class="note">A before/after reading, not proof the action caused it.</p>
  <form class="f" data-form="review" data-id="${esc(id)}"><div class="fr"><label class="l">Result<select name="outcome"><option>Worked</option><option>No clear change</option><option>Made it worse</option><option>Too early to tell</option></select></label><label class="l">Next step<input name="next" placeholder="e.g. scale, stop, test again"></label></div><div class="row"><button class="btn" type="submit">Save review</button><button class="btn ghost" type="button" data-act="review" data-id="">Cancel</button></div></form></div>`;
}

PAGES.event = () => {
  const ds = S.ds, D = S.asOf, A = assump(), d = E.dayStats(ds, D, A), cap = d.gate_capacity_assumed;
  if (D < ds.event.eventStartDay || !d.verified_entries) return `<h1>Event days</h1><p class="sub">No check-ins at this date. Move the date to the event days.</p>`;
  const hrs = d.hours; setTimeout(() => mount('hourChart', s => colChart(s, { labels: hrs.map(h => h.hour), values: hrs.map(h => h.entries), cap, capLabel: 'safe gate capacity ' + cap + '/hr (A)', short: l => l.slice(8, 10) + ' ' + l.slice(11, 13) + 'h' })), 0);
  return `<h1>${fmt(d.unique_visitors)} unique outside visitors; peak ${d.peak_hour ? fmt(d.peak_hour.entries) + ' entries at ' + esc(d.peak_hour.hour.slice(11)) + ', ' + esc(dshort(d.peak_hour.hour)) : '–'}</h1>
  <div class="kpis">${d.by_day.map(x => kpi(dshort(x.day), fmt(x.unique_visitors), 'unique visitors', 'S')).join('')}${kpi('Both days', fmt(d.both_days), pct(d.unique_visitors ? d.both_days / d.unique_visitors : null) + ' of visitors', 'S')}${kpi('Peak vs gate capacity', pct(d.peak_vs_capacity), cap + ' per hour', 'A')}</div>
  <div class="card"><h2>Verified entries per hour</h2><div class="fig" style="min-height:240px"><svg id="hourChart" role="img" aria-label="Entries per hour"></svg></div><p class="note">Growth flags gate load; security and operations decide on the day.</p></div>`;
};

PAGES.data = () => {
  const ds = S.ds, q = E.quality(ds, S.asOf), A = assump(), R = rules(), hist = S.edits.filter(e => (e.base || '25') === baseOf()).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return `<h1>Data</h1>
  <div class="card" style="margin-bottom:14px"><h2>What you are looking at</h2>
  <p>${ds.event.simulated ? '<b>2027 plan · live</b> is <b>simulated</b>: our 2027 plan running to week 10, in the same format as the 2025 records. Campaigns, bets, owners, budgets, caps and test designs come from our plan. People, registrations and spend are generated to test the plan; they are not real.' : '<b>2025 actual</b> is the provided dataset. The original is locked for testing; "with your edits" applies your logged changes.'}</p>
  <p class="note">Every change is an edit you can undo. Choose the dataset at the top. To test with your own workbook (same sheets as the 2025 file), import it below; it stays for this visit only.</p>
  <label class="l" style="max-width:360px">Import a workbook (.xlsx)<input type="file" id="importFile" accept=".xlsx,.xls"></label><p class="note" id="importMsg">${S.importRaw ? 'Loaded: ' + esc(S.importName) : ''}</p>
  ${q.validation.errors.length ? `<p style="color:var(--act)">Problems: ${esc(q.validation.errors.join('; '))}</p>` : ''}</div>
  <details><summary>Edit history (${hist.length})</summary>${hist.length ? `<div class="scroll"><table><tr><th>When</th><th>Change</th><th></th></tr>${hist.map(e => `<tr style="${e.undone ? 'opacity:.45' : ''}"><td class="note">${esc(new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td>${esc(describeEdit(e))}${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}</td><td><button class="btn ghost sm" data-act="undo" data-id="${esc(e.id)}" type="button">${e.undone ? 'Redo' : 'Undo'}</button></td></tr>`).join('')}</table></div>` : '<p class="empty">No edits on this dataset.</p>'}</details>
  <details><summary>Change records</summary><div class="stack">
    <form class="f" data-form="status"><h3>Registration status</h3><div class="fr"><label class="l">Registration ID<input name="rid" required placeholder="e.g. R00002"></label><label class="l">New status<select name="status"><option>confirmed</option><option>interested</option><option>waitlisted</option><option>cancelled</option></select></label><label class="l">Effective<input type="datetime-local" name="t" value="${esc(S.asOf)}T12:00" required></label></div><button class="btn" type="submit">Save</button></form>
    <form class="f" data-form="checkin"><h3>Check-in</h3><div class="fr"><label class="l">Person ID<input name="person_id" required></label><label class="l">Time<input type="datetime-local" name="t" value="${esc(ds.event.eventStartDay)}T14:00" required></label></div><button class="btn" type="submit">Save</button></form>
    <form class="f" data-form="target"><h3>New target version</h3><div class="fr"><label class="l">Starts on<input type="date" name="date" value="${esc(S.asOf)}" required></label><label class="l">Name<input name="name" required value="Revised plan"></label><label class="l">Registrations<input type="number" name="r" min="0" required></label><label class="l">Outside attendees<input type="number" name="v" min="0" required></label><label class="l">Budget (₹)<input type="number" name="b" min="0" required></label></div><button class="btn" type="submit">Save</button></form></div></details>
  <details><summary>Assumptions and thresholds</summary><div class="fr">${Object.keys(A).map(k => `<label class="l">${esc(A[k].label)}: <b>${esc(A[k].value)}</b><input type="range" data-set="assump" data-k="${esc(k)}" min="${esc(A[k].low)}" max="${esc(A[k].high)}" step="${A[k].value >= 10 ? 10 : 0.01}" value="${esc(A[k].value)}"></label>`).join('')}</div>
  <div class="scroll" style="margin-top:14px"><table><tr><th>Signal</th><th class="n">Watch</th><th class="n">Warn</th><th class="n">Act</th></tr>${Object.keys(R).filter(k => k !== 'min_people').map(k => `<tr><td>${esc(R[k].label)}</td>${['watch', 'warn', 'act'].map(l => `<td class="n"><input type="number" step="0.01" style="width:72px" data-set="rule" data-k="${esc(k)}" data-l="${l}" value="${esc(R[k][l])}" aria-label="${esc(R[k].label + ' ' + l)}"></td>`).join('')}</tr>`).join('')}</table></div>
  <div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="reset" type="button">Reset to defaults</button></div></details>
  <details><summary>Counting rules and cleaning</summary><ul>${q.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul><p class="note">${Object.keys(q.duplicates_removed).filter(k => q.duplicates_removed[k]).map(k => q.duplicates_removed[k] + ' repeated ' + E.SHEETS[k] + ' rows removed').join(' · ') || 'No repeated rows.'} ${Object.keys(q.excluded_people).map(k => q.excluded_people[k] + ' ' + k + ' people excluded').join(' · ')}</p></details>
  ${testPanel()}`;
};
function describeEdit(e) {
  const p = e.payload || {}, cn = id => E.campName(S.ds, id);
  switch (e.type) {
    case 'campaign_update': return cn(p.campaign_id) + ': ' + Object.keys(p.fields || {}).filter(k => k !== 'owner_name').map(k => ({ planned_budget_inr: 'planned budget', reserve_released_inr: 'reserve released', owner_id: 'owner' }[k] || k) + ' → ' + (k === 'owner_id' ? ownerLabel(p.fields[k]) : /inr/.test(k) ? inr(p.fields[k]) : p.fields[k])).join(', ');
    case 'campaign_add': return 'New campaign: ' + p.campaign_name;
    case 'spend_add': return 'Spend ' + inr(p.marketing_spend_inr) + ' on ' + cn(p.campaign_id) + ', ' + dshort(p.activity_date);
    case 'status_change': return 'Registration ' + p.registration_id + ' → ' + p.status;
    case 'checkin_add': return 'Check-in for ' + p.person_id;
    case 'target_add': return 'Target version "' + p.target_version + '" from ' + dshort(p.effective_at);
    default: return e.type;
  }
}

/* ---------- analyst tests: expected answers computed live ---------- */
function tests() {
  const ds = S.ds, A = assump(), n = v => [String(Math.round(v)), Math.round(v).toLocaleString('en-IN'), Math.round(v).toLocaleString('en-US')];
  const refuse = ['not in the data', "doesn't include", 'does not include', 'not recorded', "don't have", 'do not have', 'not available', "isn't in", 'no data'];
  if (hasBets()) {
    const D = ds.event.end, k = E.kpis(ds, D, A), pc = E.pace(ds, D)[0], rp = E.reservePlan(ds, D, A), bets = E.betRows(ds, D, A), b1 = bets.find(b => b.campaign_id === 'B1'), b5 = bets.find(b => b.campaign_id === 'B5'), r = E.campaignRows(ds, D, { assumptions: A }).find(x => x.campaign_id === 'C01');
    return [
      { id: 'a1', type: 'Data', q: 'How many outside registrations do we have, and are we on pace?', expect: fmt(k.registered) + ' vs base pace ' + fmt(pc.base_pace), any: n(k.registered) },
      { id: 'a2', type: 'Decision', q: 'Which bet should get reserve money first, and why?', expect: rp.suggestions[0] ? rp.suggestions[0].bet + ' (lowest next-tranche cost ' + inr(rp.suggestions[0].next_tranche_cost) + ')' : 'none ready', any: rp.suggestions[0] ? [rp.suggestions[0].bet.split(' ')[0]] : ['none'] },
      { id: 'a3', type: 'Calculation', q: 'How much cheaper is an extra attendee from Campus Outreach than from Alumni Homecoming?', expect: inr(b5.cost_per_extra - b1.cost_per_extra), any: n(b5.cost_per_extra - b1.cost_per_extra) },
      { id: 'a4', type: 'Diagnosis', q: 'What is wrong with Paid Social?', expect: 'Cost ' + inr(r.cost_per_expected_visitor) + ' per expected visitor vs ₹250 cap; opt-outs ' + pct(r.opt_out_rate, 1), any: n(r.cost_per_expected_visitor).concat([String(r.cost_per_expected_visitor)]) },
      { id: 'a5', type: 'Changed data', q: 'What is our total spend so far?', expect: inr(k.spend) + ' on "' + ds.label + '"', any: n(k.spend) },
      { id: 'a6', type: 'Not in the data', q: 'Which colleges are our competitors running fests on the same weekend?', expect: 'Says it is not in the data', any: refuse }
    ];
  }
  const end = ds.event.end, k = E.kpis(ds, end, A), rows = E.campaignRows(ds, end).filter(r => r.campaign_id && r.visitors >= 30), best = rows.slice().sort((a, b) => a.cost_per_visitor - b.cost_per_visitor)[0], c2 = rows.find(r => r.campaign_id === 'C02'), c5 = rows.find(r => r.campaign_id === 'C05'), mid = E.kpis(ds, '2025-03-15', A);
  return [
    { id: 't1', type: 'Data', q: 'How many unique verified outside visitors came to CampusFest 2025?', expect: fmt(k.visitors), any: n(k.visitors) },
    { id: 't2', type: 'Data', q: 'Which campaign had the lowest cost per verified visitor?', expect: best ? best.campaign + ', ' + inr(best.cost_per_visitor) : '–', any: best ? [best.campaign] : [] },
    { id: 't3', type: 'Point in time', q: 'As of 15 March 2025, how many outside people had registered?', expect: fmt(mid.registered), any: n(mid.registered) },
    { id: 't4', type: 'Calculation', q: 'How much more did a verified visitor cost through Paid Social than through Student Referrals?', expect: c2 && c5 ? inr(c2.cost_per_visitor - c5.cost_per_visitor) : '–', any: c2 && c5 ? n(c2.cost_per_visitor - c5.cost_per_visitor).concat([(c2.cost_per_visitor - c5.cost_per_visitor).toFixed(1)]) : [] },
    { id: 't5', type: 'Changed data', q: 'What is our total net marketing spend, and how many verified visitors do we have?', expect: inr(k.spend) + ' and ' + fmt(k.visitors) + ' on "' + ds.label + '"', any: n(k.spend), also: n(k.visitors) },
    { id: 't6', type: 'Not in the data', q: 'What was the weather on the first day, and did it hurt turnout?', expect: 'Says weather is not in the data', any: refuse.concat(['no weather']) }
  ];
}
function testPanel() {
  return `<details><summary>Test the analyst</summary><p class="note">Expected answers come from the same engine as the screens. "Run" asks the analyst and checks for the expected number or phrase. Make an edit, then rerun "Changed data".</p>
  <div class="scroll"><table><tr><th>Type</th><th>Question</th><th>Expected</th><th>Result</th><th></th></tr>${tests().map(t => { const r = S.tests[t.id]; return `<tr><td class="note">${esc(t.type)}</td><td>${esc(t.q)}</td><td>${esc(t.expect)}</td><td>${r ? (r.running ? 'Running…' : `<b style="color:${r.pass ? 'var(--good)' : 'var(--act)'}">${r.pass ? 'Pass' : 'Check'}</b><div class="note">${esc(r.text.slice(0, 200))}${r.text.length > 200 ? '…' : ''}</div>`) : '–'}</td><td><button class="btn ghost sm" type="button" data-act="test" data-id="${t.id}">Run</button></td></tr>`; }).join('')}</table></div></details>`;
}

/* ---------- drawers: campaign edit, new campaign, spend, bet detail, action confirm ---------- */
const KINDS = { task: 'Create a task', release_reserve: 'Release reserve to a bet', pause_campaign: 'Pause campaign', resume_campaign: 'Resume campaign', set_planned_budget: 'Set planned budget', move_budget: 'Move planned budget', change_owner: 'Change owner', add_spend: 'Record spend' };
function openDrawer(kind, data) { S.drawer = { kind, data: data || {} }; renderDrawer(); }
function closeDrawer() { S.drawer = null; S.pending = null; renderDrawer(); }
function renderDrawer() {
  let w = $('#side'); const d = S.drawer;
  if (!d) { if (w) w.remove(); return; }
  if (!w) { w = document.createElement('div'); w.id = 'side'; document.body.appendChild(w); }
  let title = '', body = '';
  if (d.kind === 'camp') { const c = S.ds.camps.get(d.data.id); if (!c) return closeDrawer(); title = c.campaign_name; body = campDrawer(c); }
  else if (d.kind === 'bet') { title = E.campName(S.ds, d.data.id); body = betDrawer(d.data.id); }
  else if (d.kind === 'newcamp') { title = 'Add campaign'; body = `<form class="f" data-form="newcamp"><label class="l">Name<input name="name" required maxlength="60"></label><div class="fr"><label class="l">Channel<input name="channel" required maxlength="40" placeholder="e.g. whatsapp"></label><label class="l">Owner<select name="owner">${ownerOptions('T03')}</select></label></div><label class="l">Planned budget (₹)<input type="number" name="budget" min="0" step="500"></label><button class="btn" type="submit">Add campaign</button></form>`; }
  else if (d.kind === 'spend') { title = 'Record spend'; body = `<form class="f" data-form="spend"><label class="l">Campaign<select name="campaign_id">${campOptions(d.data.id || '')}</select></label><div class="fr"><label class="l">Date<input type="date" name="activity_date" value="${esc(S.asOf)}" min="${esc(S.ds.event.start)}" max="${esc(S.ds.event.end)}" required></label><label class="l">Amount (₹, minus for a credit)<input type="number" name="amount" step="1" required></label></div><label class="l">Note<input name="note"></label><button class="btn" type="submit">Save spend</button></form>`; }
  else if (d.kind === 'confirm') { title = 'Confirm an action'; body = confirmBody(); }
  w.innerHTML = `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="hd"><h2>${esc(title)}</h2><button class="btn ghost sm" data-act="close" type="button">Close</button></div><div class="bd">${body}</div></aside>`;
  if (d.kind === 'camp') { const c = S.ds.camps.get(d.data.id), t = E.trend(S.ds, 'registrations', 'week', S.ds.event.start, S.asOf < S.ds.event.eventStartDay ? S.asOf : E.addDays(S.ds.event.eventStartDay, -1), c.campaign_id); mount('campChart', s => colChart(s, { labels: t.rows.map(x => x.period.replace('week of ', '')), values: t.rows.map(x => x.value), short: dshort })); }
  if (d.kind === 'confirm') { const f = w.querySelector('form'); f.addEventListener('change', () => { readDraft(f); renderDrawer(); }); }
  const first = w.querySelector('input,select,button'); if (first) first.focus({ preventScroll: true });
}
function campDrawer(c) {
  const A = assump(), r = E.campaignRows(S.ds, S.asOf, { assumptions: A }).find(x => x.campaign_id === c.campaign_id) || {};
  return `<p class="note">${esc(c.objective || c.target_audience || '')}</p><h3>Registrations per week</h3><div class="fig" style="min-height:170px"><svg id="campChart" role="img" aria-label="Weekly registrations"></svg></div>
  <p class="note">${fmt(r.registered)} registered · ${fmt(r.confirmed)} confirmed · ${fmt(r.cancelled)} cancelled · opt-outs ${pct(r.opt_out_rate, 1)} · CTR ${pct(r.ctr, 1)}</p>
  <form class="f" data-form="campedit" data-id="${esc(c.campaign_id)}" style="margin-top:14px"><h3>Edit</h3><div class="fr"><label class="l">Status<select name="status">${['active', 'paused', 'ended'].map(s => `<option ${((c.status || 'active') === s) ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="l">Owner<select name="owner">${ownerOptions(c.owner_id)}</select></label><label class="l">Planned budget (₹)<input type="number" name="budget" min="0" step="500" value="${esc(c.planned_budget_inr || '')}"></label></div><label class="l">Why<input name="note" placeholder="Kept in the edit history"></label><button class="btn" type="submit">Save</button></form>
  <div class="row" style="margin-top:14px"><button class="btn ghost" data-act="spend" data-id="${esc(c.campaign_id)}" type="button">Record spend</button><button class="btn ghost" data-act="draft" data-kind="task" data-camp="${esc(c.campaign_id)}" type="button">Create a task</button><button class="btn ghost" data-act="ask" data-q="${esc('How is ' + c.campaign_name + ' doing and what should we change?')}" type="button">Ask the analyst</button></div>`;
}
function draftFromFlag(f) {
  const [kind, cid] = f.id.split('-'), c = S.ds.camps.get(cid), owner = c ? c.owner_id : (/Security/.test(f.owner) ? 'SEC' : 'GL');
  const d = { kind: 'task', campaign_id: c ? cid : '', owner, title: f.action.replace(/^Change:\s*/, '').split('.')[0], reason: f.title + '. ' + f.evidence, flag_id: f.id, source: 'signal', metric: null, expected: '' };
  if (kind === 'bet' && c) Object.assign(d, { title: c.campaign_name + ': ' + d.title, metric: { key: 'cost_per_extra', campaign_id: cid } });
  else if (kind === 'cost' && c) Object.assign(d, { title: 'Cut ' + c.campaign_name + ' spend to reveals and reminders only; move the rest to the best bet', metric: { key: ended() ? 'cost_per_visitor' : 'cost_per_expected_visitor', campaign_id: cid } });
  else if ((kind === 'showup' || kind === 'confirm') && c) Object.assign(d, { title: 'Send a confirm-your-spot reminder to unconfirmed ' + c.campaign_name + ' registrants', metric: { key: 'confirmed', campaign_id: cid }, expected: 'More registrants confirm within a week' });
  else if (kind === 'optout' && c) Object.assign(d, { title: 'Cut ' + c.campaign_name + ' messages to one a week; stop messaging anyone who opted out', metric: { key: 'opt_out_rate', campaign_id: cid }, expected: 'Opt-out rate stops rising' });
  else if (kind === 'cancel' && c) Object.assign(d, { title: 'Ask ' + c.campaign_name + ' cancellers why (one-question survey)', metric: { key: 'cancel_rate', campaign_id: cid } });
  else if (kind === 'pace' || kind === 'forecast' || kind === 'goal') Object.assign(d, { title: hasBets() ? 'Find the lagging bet and have its owner fix it this week' : 'Push registrations through the cheapest proven campaign', metric: { key: 'registered', campaign_id: null } });
  else if (kind === 'gate') Object.assign(d, { owner: 'SEC', title: 'Escalate peak-hour gate load: assign entry windows' });
  return d;
}
function openDraft(d) {
  if (d.review_date === undefined) delete d.review_date;
  S.pending = Object.assign({ due: E.addDays(S.asOf, 3), review_date: E.addDays(S.asOf, 14), amount: 0, to: '', expected: '', reason: '' }, d);
  openDrawer('confirm');
}
function effects(p) {
  const out = [], cn = id => E.campName(S.ds, id), row = id => E.campaignRows(S.ds, S.asOf).find(r => r.campaign_id === id) || {};
  const planned = id => { const r = row(id); return Number(r.planned_budget_inr || r.spend || 0); };
  if (p.kind === 'release_reserve') { const left = E.reserveLeft(S.ds); out.push(`${cn(p.campaign_id)} planned budget ${inr(planned(p.campaign_id))} → ${inr(planned(p.campaign_id) + Number(p.amount))}`); out.push(`Reserve left ${inr(left)} → ${inr(left - Number(p.amount))}`); const b = E.betRows(S.ds, S.asOf, assump()).find(x => x.campaign_id === p.campaign_id); if (!b) out.unshift('⚠ Not a bet: reserve only goes to bets'); else if (b.decision !== 'Scale') out.unshift('⚠ ' + b.bet + ' is not cleared for tranche money: ' + b.why); if (Number(p.amount) > left) out.unshift('⚠ More than the reserve left'); }
  if (p.kind === 'pause_campaign') out.push(`Set ${cn(p.campaign_id)} to paused`);
  if (p.kind === 'resume_campaign') out.push(`Set ${cn(p.campaign_id)} to active`);
  if (p.kind === 'set_planned_budget') out.push(`${cn(p.campaign_id)} planned budget → ${inr(p.amount)}`);
  if (p.kind === 'move_budget') { out.push(`${cn(p.campaign_id)} planned ${inr(planned(p.campaign_id))} → ${inr(planned(p.campaign_id) - Number(p.amount))}`); out.push(`${cn(p.to)} planned ${inr(planned(p.to))} → ${inr(planned(p.to) + Number(p.amount))}`); }
  if (p.kind === 'change_owner') out.push(`Make ${ownerLabel(p.owner)} owner of ${cn(p.campaign_id)}`);
  if (p.kind === 'add_spend') out.push(`Record ${inr(p.amount)} on ${cn(p.campaign_id)}, ${dshort(S.asOf)}`);
  if (p.kind !== 'add_spend' && p.kind !== 'change_owner') out.push(`Task for ${ownerLabel(p.owner)}, due ${dshort(p.due)}`);
  out.push('Log the decision' + (p.metric && p.metric.key ? `; on ${dshort(p.review_date)} compare ${metricLabel(p.metric)} with today's ${mfmt(p.metric, metricNow(p.metric))}` : ''));
  if (p.kind !== 'task' && !S.ds.camps.get(p.campaign_id)) out.unshift('⚠ Pick a campaign');
  return out;
}
function confirmBody() {
  const p = S.pending, amt = ['release_reserve', 'set_planned_budget', 'move_budget', 'add_spend'].includes(p.kind);
  return `<form class="f" id="draftForm" data-form="confirm"><p class="note">Nothing changes until you confirm.${p.source === 'analyst' ? ' Proposed by the analyst.' : ''}</p>
  <label class="l">Action<select name="kind">${Object.keys(KINDS).map(k => `<option value="${k}" ${k === p.kind ? 'selected' : ''}>${KINDS[k]}</option>`).join('')}</select></label>
  <div class="fr"><label class="l">Campaign<select name="campaign_id"><option value="">None</option>${campOptions(p.campaign_id, false, p.kind === 'release_reserve' ? c => c.kind === 'bet' : null)}</select></label>${p.kind === 'move_budget' ? `<label class="l">Move to<select name="to">${campOptions(p.to)}</select></label>` : ''}${amt ? `<label class="l">Amount (₹)<input type="number" name="amount" step="500" value="${esc(p.amount)}"></label>` : ''}</div>
  <label class="l">Task<input name="title" value="${esc(p.title)}" maxlength="160" required></label>
  <div class="fr"><label class="l">Owner<select name="owner">${ownerOptions(p.owner)}</select></label><label class="l">Due<input type="date" name="due" value="${esc(p.due)}"></label><label class="l">Review on<input type="date" name="review_date" value="${esc(p.review_date)}"></label></div>
  <label class="l">Number to check on review<select name="metric"><option value="">None</option>${Object.keys(METRICS).map(k => `<option value="${k}" ${p.metric && p.metric.key === k ? 'selected' : ''}>${METRICS[k]}</option>`).join('')}</select></label>
  <label class="l">Why<textarea name="reason" rows="3">${esc(p.reason)}</textarea></label><label class="l">Expected result<input name="expected" value="${esc(p.expected)}"></label>
  <div class="card" style="background:var(--soft);border:0"><b>This will:</b><ul style="margin:6px 0 0;padding-left:18px">${effects(p).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
  <div class="row"><button class="btn" type="submit" ${S.readOnly ? 'disabled' : ''}>Confirm</button><button class="btn ghost" type="button" data-act="close">Cancel</button></div></form>`;
}
function readDraft(f) {
  const v = Object.fromEntries(new FormData(f).entries()), p = S.pending;
  Object.assign(p, { kind: v.kind, campaign_id: v.campaign_id, title: v.title, owner: v.owner, due: v.due, review_date: v.review_date, reason: v.reason, expected: v.expected });
  if ('to' in v) p.to = v.to; if ('amount' in v) p.amount = Number(v.amount) || 0;
  p.metric = v.metric ? { key: v.metric, campaign_id: (p.metric && p.metric.key === v.metric && 'campaign_id' in p.metric) ? p.metric.campaign_id : (p.campaign_id || null) } : null;
}
async function confirmDraft() {
  const p = S.pending; if (!p) return; const c = S.ds.camps.get(p.campaign_id);
  if (p.kind !== 'task' && !c) return toast('Pick a campaign for this action.');
  if (p.kind === 'move_budget' && (!p.to || p.to === p.campaign_id || !(p.amount > 0))) return toast('Pick a different campaign to move to and an amount above zero.');
  if (p.kind === 'release_reserve' && (!(p.amount > 0) || p.amount > E.reserveLeft(S.ds) || c.kind !== 'bet')) return toast('Reserve goes to a bet, above zero and within the reserve left.');
  const edits = [], row = id => E.campaignRows(S.ds, S.asOf).find(r => r.campaign_id === id) || {}, planned = id => Number(row(id).planned_budget_inr || row(id).spend || 0);
  const upd = async (id, fields) => { const e = await commitEdit('campaign_update', { campaign_id: id, fields }, p.reason); if (e) edits.push(e.id); };
  if (p.kind === 'release_reserve') await upd(p.campaign_id, { planned_budget_inr: planned(p.campaign_id) + p.amount, reserve_released_inr: (Number(c.reserve_released_inr) || 0) + p.amount });
  if (p.kind === 'pause_campaign') await upd(p.campaign_id, { status: 'paused' });
  if (p.kind === 'resume_campaign') await upd(p.campaign_id, { status: 'active' });
  if (p.kind === 'set_planned_budget') await upd(p.campaign_id, { planned_budget_inr: Number(p.amount) });
  if (p.kind === 'change_owner') await upd(p.campaign_id, { owner_id: p.owner, owner_name: ownerLabel(p.owner) });
  if (p.kind === 'move_budget') { const a = planned(p.campaign_id), b = planned(p.to); await upd(p.campaign_id, { planned_budget_inr: a - p.amount }); await upd(p.to, { planned_budget_inr: b + p.amount }); }
  if (p.kind === 'add_spend') { const e = await commitEdit('spend_add', { campaign_id: p.campaign_id, activity_date: S.asOf + 'T00:00:00', marketing_spend_inr: Number(p.amount), owner_id: c.owner_id }, p.reason); if (e) edits.push(e.id); }
  const base = baseOf(), dec = { id: newId('DC'), base, title: p.title, kind: p.kind, reason: p.reason, expected: p.expected, as_of: S.asOf, review_date: p.review_date, created_at: new Date().toISOString(), by: S.uid || 'this browser', edit_ids: edits, metric: p.metric ? Object.assign({}, p.metric, { before: metricNow(p.metric) }) : null, status: 'open', source: p.source || 'manual' };
  let task = null;
  if (p.kind !== 'add_spend' && p.kind !== 'change_owner') { task = { id: newId('TK'), base, title: p.title, owner: p.owner, due: p.due, status: 'todo', campaign_id: p.campaign_id || null, flag_id: p.flag_id || null, source: p.source || 'manual', decision_id: dec.id, created_at: new Date().toISOString() }; dec.task_id = task.id; await Store.put('tasks', task); }
  await Store.put('decisions', dec);
  closeDrawer(); render(); chatNote('Confirmed: ' + p.title + '.');
  toast('Done: ' + p.title, async () => { for (const id of edits) { const e = S.edits.find(x => x.id === id); if (e) await Store.put('edits', Object.assign(clone(e), { undone: true })); } if (task) await Store.remove('tasks', task.id); await Store.remove('decisions', dec.id); rebuild(true); render(); });
}

/* ---------- render & events ---------- */
function setPage() { const h = (location.hash || '#overview').slice(1); S.page = PAGES[h] ? h : 'overview'; document.querySelectorAll('#nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + S.page ? 'page' : 'false')); render(); }
let raf = 0;
function render() { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderNow); }
function renderNow() {
  if (!S.ds) return; observers.forEach(o => o.disconnect()); observers = []; syncBar();
  try { $('#main').innerHTML = PAGES[S.page](); } catch (e) { console.error(e); $('#main').innerHTML = `<div class="loading">This view hit an error: ${esc(e.message)}</div>`; }
  if (S.page === 'overview') drawOverview();
}
async function switchView(v) {
  S.view = v; $('#main').innerHTML = '<div class="loading">Loading…</div>';
  try { if (v !== 'imported') await loadBase(VIEWS[v].base); } catch (e) { $('#main').innerHTML = `<div class="loading">Could not load data (${esc(e.message)}).</div>`; return; }
  S.review = null; S.tests = {}; rebuild(); render();
  if (chat.sample && !chat.turns.length) emptyState();
}
function bind() {
  window.addEventListener('hashchange', setPage);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (S.drawer) closeDrawer(); else $('#chat').classList.remove('open'); } });
  $('#asOf').addEventListener('change', e => { if (isDate(e.target.value)) { S.asOf = e.target.value; rebuild(true); render(); } });
  const step = n => { const ev = S.ds.event; let d = E.addDays(S.asOf, n); if (d < ev.start) d = ev.start; if (d > ev.end) d = ev.end; S.asOf = d; rebuild(true); render(); };
  $('#prevWk').addEventListener('click', () => step(-7)); $('#nextWk').addEventListener('click', () => step(7));
  $('#dsSel').addEventListener('change', e => switchView(e.target.value));
  const onClick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, id = b.dataset.id;
    if (a === 'flag') { const f = E.flags(S.ds, S.asOf, rules(), assump()).find(x => x.id === id); if (f) openDraft(draftFromFlag(f)); }
    else if (a === 'ask') { closeDrawer(); askAnalyst(b.dataset.q); }
    else if (a === 'camp') openDrawer('camp', { id });
    else if (a === 'bet') openDrawer('bet', { id });
    else if (a === 'newcamp') openDrawer('newcamp');
    else if (a === 'spend') openDrawer('spend', { id });
    else if (a === 'close') closeDrawer();
    else if (a === 'release') { const c = S.ds.camps.get(id), amt = Number(b.dataset.amt); openDraft({ kind: 'release_reserve', campaign_id: id, amount: amt, owner: c.owner_id, title: `Release ${inr(amt)} of reserve to ${c.campaign_name}`, reason: 'Lowest next-tranche cost under its cap (Bets page, ' + dshort(S.asOf) + ')', expected: 'More extra attendees at under the cap', metric: { key: 'expected_extra_attendees', campaign_id: id }, source: 'bets' }); }
    else if (a === 'draft') { const cid = b.dataset.camp || ''; openDraft({ kind: 'task', campaign_id: cid, owner: (S.ds.camps.get(cid) || {}).owner_id || 'GL', title: '', source: 'manual' }); }
    else if (a === 'tmove') { const t = S.tasks.find(x => x.id === id); if (t) { const o = ['todo', 'doing', 'done'], i = Math.min(2, Math.max(0, o.indexOf(t.status) + Number(b.dataset.d))); await Store.put('tasks', Object.assign(clone(t), { status: o[i] })); render(); } }
    else if (a === 'tdel') { const t = S.tasks.find(x => x.id === id); if (t) { await Store.remove('tasks', id); render(); toast('Task deleted', async () => { await Store.put('tasks', t); render(); }); } }
    else if (a === 'review') { S.review = id || null; render(); }
    else if (a === 'undo') { const x = S.edits.find(y => y.id === id); if (x) { await Store.put('edits', Object.assign(clone(x), { undone: !x.undone })); rebuild(true); render(); } }
    else if (a === 'reset') { S.settings = { assump: {}, rules: {} }; await Store.putSettings(); rebuild(true); render(); }
    else if (a === 'test') runTest(id);
  };
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-act]')) e.target.click(); });
  document.addEventListener('change', async e => {
    const t = e.target, ch = t.dataset.ch, set = t.dataset.set;
    if (ch === 'funnelCamp') { S.funnelCamp = t.value; render(); }
    else if (set === 'assump') { S.settings.assump = Object.assign({}, S.settings.assump, { [t.dataset.k]: Number(t.value) }); await Store.putSettings(); render(); }
    else if (set === 'rule') { const r = Object.assign({}, (S.settings.rules || {})[t.dataset.k] || {}); r[t.dataset.l] = Number(t.value); S.settings.rules = Object.assign({}, S.settings.rules, { [t.dataset.k]: r }); await Store.putSettings(); render(); }
    else if (t.id === 'importFile' && t.files && t.files[0]) importFile(t.files[0]);
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!f.dataset || !f.dataset.form) return; e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries()), kind = f.dataset.form;
    if (kind === 'confirm') { readDraft(f); return confirmDraft(); }
    if (kind === 'spend') { const c = S.ds.camps.get(v.campaign_id), amt = Number(v.amount); if (!amt) return toast('Enter an amount.'); await commitEdit('spend_add', { campaign_id: v.campaign_id, activity_date: v.activity_date + 'T00:00:00', marketing_spend_inr: amt, owner_id: c ? c.owner_id : null }, v.note); closeDrawer(); toast('Spend saved: ' + inr(amt) + ' on ' + E.campName(S.ds, v.campaign_id)); }
    else if (kind === 'newcamp') { const ids = Array.from(S.ds.camps.keys()).filter(x => /^C\d+$/.test(x)).map(x => Number(x.slice(1))); const id = 'C' + String(Math.max(0, ...ids) + 1).padStart(2, '0'); await commitEdit('campaign_add', { campaign_id: id, campaign_name: v.name.trim(), channel: v.channel.trim(), owner_id: v.owner, owner_name: ownerLabel(v.owner), status: 'active', kind: 'channel', planned_budget_inr: Number(v.budget) || null, created_at: S.asOf + 'T09:00:00', planned_start_at: S.asOf + 'T09:00:00' }, 'New campaign'); closeDrawer(); toast('Campaign added: ' + v.name); }
    else if (kind === 'campedit') { const c = S.ds.camps.get(f.dataset.id), fields = {}; if ((c.status || 'active') !== v.status) fields.status = v.status; if (c.owner_id !== v.owner) { fields.owner_id = v.owner; fields.owner_name = ownerLabel(v.owner); } const bud = v.budget === '' ? null : Number(v.budget); if ((c.planned_budget_inr || null) !== bud) fields.planned_budget_inr = bud; if (!Object.keys(fields).length) return toast('Nothing changed.'); await commitEdit('campaign_update', { campaign_id: f.dataset.id, fields }, v.note); renderDrawer(); toast('Saved: ' + c.campaign_name); }
    else if (kind === 'target') { const t = E.targetAt(S.ds, S.asOf) || {}; await commitEdit('target_add', Object.assign({}, t, { effective_at: v.date + 'T00:00:00', target_version: v.name, registration_goal: Number(v.r), unique_external_visitors_goal: Number(v.v), marketing_budget_inr: Number(v.b) }), 'New target version'); toast('Target version saved'); }
    else if (kind === 'checkin') { const pid = v.person_id.trim(), p = S.ds.people.get(pid); if (!p) return toast('No person ' + pid + ' in this data.'); const reg = S.ds.regs.find(r => r.person_id === pid); await commitEdit('checkin_add', { person_id: pid, occurred_at: v.t.length === 16 ? v.t + ':00' : v.t, campaign_id: reg ? reg.campaign_id : null, registration_id: reg ? reg.registration_id : null }, 'Manual gate entry'); toast('Check-in saved for ' + pid + (p.person_type !== 'external' ? ' (not counted: ' + p.person_type + ')' : '')); }
    else if (kind === 'status') { const rid = v.rid.trim(); if (!S.ds.regs.find(r => r.registration_id === rid)) return toast('No registration ' + rid + ' in this data.'); await commitEdit('status_change', { registration_id: rid, status: v.status, effective_at: v.t.length === 16 ? v.t + ':00' : v.t }, 'Status change'); toast(rid + ' → ' + v.status); }
    else if (kind === 'review') { const d = S.decisions.find(x => x.id === f.dataset.id); if (d) { await Store.put('decisions', Object.assign(clone(d), { status: 'reviewed', outcome: v.outcome + (v.next ? ' · next: ' + v.next : ''), after: metricNow(d.metric), reviewed_as_of: S.asOf })); const t = S.tasks.find(x => x.id === d.task_id); if (t && t.status !== 'done') await Store.put('tasks', Object.assign(clone(t), { status: 'done' })); S.review = null; render(); toast('Review saved'); } }
  });
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load the spreadsheet reader')); document.head.appendChild(s); }); }
async function importFile(file) {
  const msg = $('#importMsg'); msg.textContent = 'Reading ' + file.name + '…';
  try {
    if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' }), raw = {};
    for (const t of E.TABLES) { const name = wb.SheetNames.find(n => n.trim().toLowerCase() === E.SHEETS[t].toLowerCase()); raw[t] = name ? window.XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true }) : []; }
    const v = E.validate(raw); if (!v.ok) { msg.textContent = 'Not loaded: ' + v.errors.join('; '); return; }
    S.importRaw = raw; S.importName = file.name; S.view = 'imported'; S.tests = {}; rebuild(); render(); toast('Loaded ' + file.name);
  } catch (e) { msg.textContent = 'Could not read the file: ' + e.message; }
}

/* ---------- AI growth analyst ---------- */
const chat = { turns: [], busy: false, ctl: null, sample: null, maxTools: 20 };
function chatEl(cls, text) { const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = text; $('#msgs').appendChild(d); $('#msgs').scrollTop = 1e9; return d; }
function chatNote(t) { chatEl('sys', t); }
function richText(el, t) { el.innerHTML = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
function openChat() { $('#chat').classList.add('open'); }
function emptyState() {
  if (!S.ds) return;
  const sug = hasBets() ? ['Are we on pace this week?', 'Which bet should get reserve money first?', 'What is wrong with Paid Social?', 'Is Day Scholar Turnout working yet?'] : ['Why did we miss the registration goal?', 'Which campaign should get more budget?', 'How many visitors came on both days?', 'What was the weather on day 1?'];
  $('#msgs').innerHTML = `<div class="empty">I read the same numbers as the dashboard, for the dataset and date you picked. I can set up actions for you to confirm.<div class="sugg">${sug.map(s => `<button type="button" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
}
function dateArg(v) { if (!isDate(v)) return S.asOf; const ev = S.ds.event; return v < ev.start ? ev.start : v > ev.end ? ev.end : v; }
function campArg(v) { if (!v || v === 'all') return undefined; const s = String(v).trim(); if (S.ds.camps.has(s.toUpperCase())) return s.toUpperCase(); const m = Array.from(S.ds.camps.values()).find(c => c.campaign_name.toLowerCase() === s.toLowerCase()); if (m) return m.campaign_id; throw new Error('Unknown campaign "' + s + '". Use an ID like C01 or B1.'); }
function pick(o, keys) { const r = {}; keys.forEach(k => { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
function contextBlock() {
  const ds = S.ds, A = assump(), k = E.kpis(ds, S.asOf, A), fl = E.flags(ds, S.asOf, rules(), A).slice(0, 8), ev = ds.event;
  const camps = Array.from(ds.camps.values()).map(c => `${c.campaign_id} ${c.campaign_name} (${c.kind === 'bet' ? 'bet #' + c.bet_rank + ', ' + c.bet_type : c.channel}; owner ${ownerLabel(c.owner_id)} ${c.owner_id}${c.status && c.status !== 'active' ? '; ' + c.status : ''})`).join('\n');
  const open = S.tasks.filter(t => t.status !== 'done' && (t.base || '25') === baseOf()).slice(0, 8).map(t => `${t.title} (${ownerLabel(t.owner)}, due ${t.due})`).join('; ');
  return `DATA IN VIEW: ${ds.label}.${ev.simulated ? ' SIMULATED: our 2027 plan running in New Delhi, generated to test the plan; not real records. Say "simulated" when it matters.' : ''} Event ${ev.name}, ${ev.eventStartDay} to ${ev.eventEndDay}; records cover ${ev.start} to ${ev.end}; INR; IST.
SELECTED DATE: ${S.asOf}${k.week ? ' (week ' + k.week + ' of 15)' : ''}. Use it unless the user names another date.
CAMPAIGNS:\n${camps}
SNAPSHOT (engine): ${JSON.stringify(pick(k, ['registered', 'active', 'status', 'visitors', 'walkins', 'showup', 'spend', 'costPerVisitor', 'target', 'projection']))}
${hasBets() ? 'PACE: ' + JSON.stringify(E.pace(ds, S.asOf)[0]) + '\nRESERVE LEFT: ' + E.reserveLeft(ds) + '\n' : ''}TOP SIGNALS: ${fl.map(f => f.level + ': ' + f.title).join(' | ') || 'none'}
OPEN TASKS: ${open || 'none'}`;
}
const PLAN_RULES = `PLAN RULES (2027): Money moves on expected extra attendees = people in test colleges × (test registration rate − comparison rate) × show-up by status. Never on clicks, confirms or waitlists alone. Next-tranche cost = cost per extra ÷ how well the bet scales (A). Reserve (₹3.5L) goes to the lowest next-tranche cost first, only under each bet's cap. Evidence: up to ₹50k needs 2+ weeks, 300+ people per group, 80%+ sure; above ₹50k needs 90%+ and the lift holding in 2 segments. Pace: at/above stretch = fine; above base below stretch = Watch; up to 15% below base = Warn; more = Act. Caps: Outreach ₹235, Group Pass ₹250, Day Scholars ₹200, Volunteers ₹200, Alumni ₹250, channels ₹250.`;
const RULES = () => `You are the Growth Analyst inside the CampusFest Growth Center, for a college fest's growth team. You answer questions about attendee growth and help the team act.

DEFINITIONS
- Outside (external) people only in totals. Internal, staff and test people never count. Day Scholar Turnout is the only bet about our own students; it is judged on its own.
- Visitor = unique external person with at least one admitted AND verified check-in. Registered = unique people with a registration up to the date; status = latest version on or before the date.
- Spend = net INR. Campaign credit links a person to a campaign; it is not proof it caused the visit.
- Never use records after the date being discussed. Facts from records = S. Forecasts, expected visitors, extra attendees, next-tranche costs and what-ifs use assumptions = A.
${hasBets() ? PLAN_RULES : ''}

HOW TO ANSWER
1. Every number comes from the snapshot below or a tool. Use calculate for any arithmetic. Never estimate a number you could look up.
2. If the data cannot answer (weather, revenue, ticket prices, satisfaction, demographics, competitor fests, social sentiment, other years), say so in the first sentence using the words "not in the data", say what it does have, and offer the closest answerable question.
3. If a question is ambiguous, state the reading you used in a short clause.
4. Format: first sentence = direct answer with the key number. Then up to 4 short lines starting "- " (number + S or A). Then one line "Next:" with a concrete action or question. Under 130 words unless asked. Plain text, **bold** allowed, no tables or headings.
5. Under 30 people, say it is too small to judge.
6. You cannot change anything yourself. When the user asks for an action, or agrees to one, call propose_action; it opens a confirmation panel. Then say it is waiting for their confirmation. Never say it is done.
7. If the user states a number that conflicts with the data, say so politely and give the data's number.

${contextBlock()}`;
function tools() {
  const D = { type: 'string', description: 'Date YYYY-MM-DD. Omit for the selected date.' }, C = { type: 'string', description: 'Campaign ID like C01 or B1; omit for all' }, A = () => assump();
  const list = [
    { name: 'get_overview', description: 'Headline numbers at a date: registered, status counts, visitors, walk-ins, show-up, spend, cost per visitor, target in force, forecast, pace vs plan, budget.', inputSchema: { type: 'object', properties: { as_of: D } }, execute: i => { const d = dateArg(i.as_of); return { as_of: d, kpis: E.kpis(S.ds, d, A()), pace: E.pace(S.ds, d), budget: E.budget(S.ds, d) }; } },
    { name: 'get_campaigns', description: 'Per-campaign table: kind (channel/bet), owner, status, planned budget, spend, registered, confirmed, cancelled, visitors, show-up, expected visitors (A), cost per registration, cost per visitor, cost per expected visitor (A), opt-outs.', inputSchema: { type: 'object', properties: { as_of: D, campaign_id: C } }, execute: i => { const d = dateArg(i.as_of), cid = campArg(i.campaign_id); let r = E.campaignRows(S.ds, d, { assumptions: A() }); if (cid) r = r.filter(x => x.campaign_id === cid); return { as_of: d, rows: r.map(x => pick(x, ['campaign_id', 'campaign', 'kind', 'owner', 'status', 'planned_budget_inr', 'spend', 'registered', 'confirmed', 'interested', 'cancelled', 'cancel_rate', 'visitors', 'showup', 'expected_visitors', 'cost_per_registration', 'cost_per_visitor', 'cost_per_expected_visitor', 'opt_outs', 'opt_out_rate', 'open_rate'])) }; } },
    { name: 'get_bets', description: 'Each bet: test vs comparison rates, lift, how sure, extra registrations, expected extra attendees (A), cost per extra, next-tranche cost, cap, evidence gaps, decision (Scale/Keep/Change/Stop/Too early) and the suggested reserve release.', inputSchema: { type: 'object', properties: { as_of: D } }, execute: i => { const d = dateArg(i.as_of); return { as_of: d, bets: E.betRows(S.ds, d, A()).map(b => { const x = Object.assign({}, b); delete x.basis; return x; }), reserve: E.reservePlan(S.ds, d, A()) }; } },
    { name: 'calculate', description: 'Exact arithmetic: + - * / ^ ( ) and % as percent. Example: "(84300/238)-250".', inputSchema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] }, execute: i => ({ expression: String(i.expression), result: E.calculate(i.expression) }) },
    { name: 'propose_action', description: 'Open a confirmation panel for an action. Nothing changes until the user confirms.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(KINDS) }, campaign_id: { type: 'string' }, to_campaign_id: { type: 'string', description: 'For move_budget' }, amount: { type: 'number', description: 'INR' }, title: { type: 'string', description: 'Short task title' }, owner_id: { type: 'string', description: 'T03-T06, GL growth lead, SEC security/operations, CORE fest core team; default the campaign owner' }, due_date: { type: 'string' }, review_date: { type: 'string' }, reason: { type: 'string' }, expected_result: { type: 'string' }, metric_to_check: { type: 'string', enum: Object.keys(METRICS) } }, required: ['action', 'title', 'reason'] },
      execute: i => { if (!KINDS[i.action]) throw new Error('Unknown action'); const cid = i.campaign_id ? campArg(i.campaign_id) : '', to = i.to_campaign_id ? campArg(i.to_campaign_id) : '', c = S.ds.camps.get(cid), owner = i.owner_id && owners()[i.owner_id] ? i.owner_id : (c ? c.owner_id : 'GL');
        setTimeout(() => openDraft({ kind: i.action, campaign_id: cid || '', to, amount: Number(i.amount) || 0, title: String(i.title).slice(0, 160), owner, due: isDate(i.due_date) ? i.due_date : E.addDays(S.asOf, 3), review_date: isDate(i.review_date) ? i.review_date : undefined, reason: String(i.reason || ''), expected: String(i.expected_result || ''), metric: i.metric_to_check && METRICS[i.metric_to_check] ? { key: i.metric_to_check, campaign_id: cid || null } : null, source: 'analyst' }), 0);
        return { shown_to_user: true, applied: false, note: 'A confirmation panel is open. The user must press Confirm.' }; } },
    { name: 'query_data', description: 'Count, sum, average, min or max over a table at a date, with filters and grouping, for questions other tools do not cover. Tables: ' + Object.keys(E.QUERY_TABLES).join(', ') + '. A bad field returns the field list.', inputSchema: { type: 'object', properties: { table: { type: 'string', enum: Object.keys(E.QUERY_TABLES) }, as_of: D, filters: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, op: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'in', 'contains'] }, value: { type: 'string', description: 'Value to compare with; numbers as digits' } } } }, group_by: { type: 'array', items: { type: 'string' } }, aggregate: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'] }, field: { type: 'string' }, limit: { type: 'number' } }, required: ['table'] }, execute: i => E.query(S.ds, dateArg(i.as_of), { table: i.table, filters: (Array.isArray(i.filters) ? i.filters : []).map(f => Object.assign({}, f, { value: typeof f.value === 'string' && /^-?\d+(\.\d+)?$/.test(f.value.trim()) ? Number(f.value) : f.value === 'true' ? true : f.value === 'false' ? false : f.value })), group_by: Array.isArray(i.group_by) ? i.group_by : [], aggregate: i.aggregate || 'count', field: i.field, limit: Number(i.limit) || 25 }) },
    { name: 'get_signals', description: 'Watch/Warn/Act signals at a date with evidence, owner and suggested action.', inputSchema: { type: 'object', properties: { as_of: D } }, execute: i => E.flags(S.ds, dateArg(i.as_of), rules(), A()) },
    { name: 'what_if_move_budget', description: 'Estimate visitors lost and gained if spend moves between two campaigns, with diminishing returns (A).', inputSchema: { type: 'object', properties: { from_campaign: { type: 'string' }, to_campaign: { type: 'string' }, amount: { type: 'number' }, as_of: D }, required: ['from_campaign', 'to_campaign', 'amount'] }, execute: i => E.whatIf(S.ds, dateArg(i.as_of), campArg(i.from_campaign), campArg(i.to_campaign), Number(i.amount) || 0, A()) },
    { name: 'explain_change', description: 'What changed between two dates: new registrations, cancellations, visitors, spend, and by campaign.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] }, execute: i => E.explainChange(S.ds, dateArg(i.from), dateArg(i.to), { assumptions: A() }) },
    { name: 'get_funnel', description: 'Funnel at a date: identified → engaged → form started → registered → active → confirmed → visited, with step rates; plus anonymous traffic.', inputSchema: { type: 'object', properties: { as_of: D, campaign_id: C } }, execute: i => { const d = dateArg(i.as_of), cid = campArg(i.campaign_id); return { identified: E.funnel(S.ds, d, cid), anonymous: E.anonFunnel(S.ds, d, cid) }; } },
    { name: 'get_trend', description: 'Daily or weekly values and running totals of one metric between two dates.', inputSchema: { type: 'object', properties: { metric: { type: 'string', enum: ['registrations', 'identified', 'spend', 'visitors', 'form_starts', 'sessions', 'cancellations'] }, grain: { type: 'string', enum: ['day', 'week'] }, from: { type: 'string' }, to: { type: 'string' }, campaign_id: C }, required: ['metric'] }, execute: i => { const r = E.trend(S.ds, i.metric, i.grain === 'day' ? 'day' : 'week', isDate(i.from) ? i.from : S.ds.event.start, dateArg(i.to), campArg(i.campaign_id)); if (r.rows && r.rows.length > 70) r.rows = r.rows.slice(-70); return r; } },
    { name: 'get_event_days', description: 'Event-day facts: visitors per day, both days, hourly entries, peak vs assumed gate capacity, check-in quality.', inputSchema: { type: 'object', properties: { as_of: D } }, execute: i => E.dayStats(S.ds, dateArg(i.as_of), A()) },
    { name: 'get_tasks_and_settings', description: 'Tasks (owner, due, status), logged decisions with before/now numbers, assumptions, thresholds and data cleaning.', inputSchema: { type: 'object', properties: {} }, execute: () => ({ tasks: S.tasks.filter(t => (t.base || '25') === baseOf()).map(t => ({ title: t.title, owner: ownerLabel(t.owner), due: t.due, status: t.status })), decisions: S.decisions.filter(d => (d.base || '25') === baseOf()).map(d => ({ title: d.title, decided: d.as_of, review: d.review_date, status: d.status, outcome: d.outcome || null, watching: metricLabel(d.metric), before: d.metric ? d.metric.before : null, now: metricNow(d.metric) })), assumptions: A(), thresholds: rules(), quality: E.quality(S.ds, S.asOf) }) }
  ];
  return (hasBets() ? list : list.filter(t => t.name !== 'get_bets')).slice(0, chat.maxTools);
}
/* Relay to Gemini through /api/chat when this page is hosted outside Claude. Same interface as Claude's sample(). */
async function relayAvailable() { try { const r = await fetch('api/health', { cache: 'no-store' }); if (!r.ok) return false; const j = await r.json(); return !!j.ok; } catch (e) { return false; } }
function gSchema(s) {
  if (!s || typeof s !== 'object') return { type: 'string' };
  const o = {}; if (s.description) o.description = s.description;
  const t = s.type || (s.properties ? 'object' : s.items ? 'array' : 'string'); o.type = t;
  if (s.enum) o.enum = s.enum.map(String);
  if (t === 'object') { const props = {}; Object.keys(s.properties || {}).forEach(k => { props[k] = gSchema(s.properties[k]); }); if (Object.keys(props).length) o.properties = props; if (s.required && s.required.length) o.required = s.required; }
  if (t === 'array') o.items = gSchema(s.items || {});
  return o;
}
function makeRelaySample() {
  const f = async (input, opts = {}) => {
    const sys = input[0].content, contents = [];
    input.slice(1).forEach(t => { const role = t.role === 'assistant' ? 'model' : 'user', last = contents[contents.length - 1]; if (last && last.role === role) last.parts[0].text += '\n\n' + t.content; else contents.push({ role, parts: [{ text: t.content }] }); });
    const decls = (opts.tools || []).map(t => { const d = { name: t.name, description: t.description }, p = t.inputSchema ? gSchema(t.inputSchema) : null; if (p && p.properties) d.parameters = p; return d; });
    const byName = Object.fromEntries((opts.tools || []).map(t => [t.name, t]));
    let text = '';
    for (let round = 0; round < 7; round++) {
      if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', text };
      let r;
      try { r = await fetch('api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system: sys, contents, tools: round === 6 ? [] : decls }), signal: opts.signal }); }
      catch (e) { throw { code: opts.signal && opts.signal.aborted ? 'cancelled' : 'upstream_error', message: String(e), text }; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw { code: r.status === 429 ? 'rate_limited' : (j.error && j.error.code === 'no_key') ? 'sampling_disabled' : r.status === 413 ? 'prompt_too_large' : 'upstream_error', message: (j.error && j.error.message) || 'HTTP ' + r.status, text };
      const c = j.content;
      if (!c || !c.parts || !c.parts.length) { if (text) break; throw { code: j.blocked ? 'refused' : 'empty_completion', message: j.finishReason || j.blocked || 'no answer' }; }
      contents.push({ role: 'model', parts: c.parts });
      const t = c.parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
      if (t) { text = text ? text + '\n\n' + t : t; if (opts.onText) opts.onText({ text, delta: t }); }
      const calls = c.parts.filter(p => p.functionCall);
      if (!calls.length) break;
      const out = [];
      for (const p of calls) {
        const fc = p.functionCall, tool = byName[fc.name]; let res;
        try { if (!tool) throw new Error('Unknown tool ' + fc.name); res = await tool.execute(fc.args || {}, { signal: opts.signal }); } catch (e) { res = { error: (e && e.message) || String(e) }; }
        if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) { res = { result: res }; } }
        if (res === null || typeof res !== 'object' || Array.isArray(res)) res = { result: res };
        const fr = { name: fc.name, response: res }; if (fc.id) fr.id = fc.id; out.push({ functionResponse: fr });
      }
      contents.push({ role: 'user', parts: out });
    }
    if (!text) throw { code: 'empty_completion', message: 'no text' };
    return { text, truncated: false, modelTierApplied: 'default' };
  };
  f.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 20 } });
  return f;
}
async function initChat() {
  $('#askBtn').addEventListener('click', () => { if (S.drawer) closeDrawer(); $('#chat').classList.toggle('open'); if ($('#chat').classList.contains('open')) $('#q').focus(); });
  $('#chatClose').addEventListener('click', () => $('#chat').classList.remove('open'));
  $('#chatClear').addEventListener('click', () => { if (chat.ctl) chat.ctl.abort(); chat.turns = []; emptyState(); });
  $('#msgs').addEventListener('click', e => { const b = e.target.closest('button[data-q]'); if (b) askAnalyst(b.dataset.q); });
  $('#composer').addEventListener('submit', e => { e.preventDefault(); if (chat.busy) { if (chat.ctl) chat.ctl.abort(); return; } const q = $('#q').value.trim(); if (q) { $('#q').value = ''; askAnalyst(q); } });
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });
  const C = window.claude; let s = null; if (C && C.use) { try { s = await C.use('sample'); } catch (e) {} }
  if (!s && await relayAvailable()) s = makeRelaySample();
  if (!s) { $('#aiState').textContent = 'off'; $('#msgs').innerHTML = '<div class="empty">The analyst is not connected here. On the hosted site it needs the server key; inside Claude it needs you signed in. Everything else works without it.</div>'; $('#send').disabled = true; return; }
  try { const lim = await s.limits(); if (!lim || !lim.tools) { $('#msgs').innerHTML = '<div class="empty">This Claude app cannot run the analyst\'s data tools. Try claude.ai in a browser.</div>'; $('#send').disabled = true; return; } chat.maxTools = lim.tools.maxCount || 20; } catch (e) {}
  chat.sample = s; $('#aiState').textContent = ''; emptyState();
}
async function askAnalyst(q, onDone) {
  openChat();
  if (!chat.sample) { if (onDone) onDone(null); return; }
  if (chat.busy) { chatNote('One question at a time.'); if (onDone) onDone(null); return; }
  const em = $('#msgs .empty'); if (em) em.remove();
  chat.busy = true; $('#send').textContent = 'Stop';
  chatEl('u', q); const out = chatEl('a', 'Thinking…'), used = [];
  chat.turns.push({ role: 'user', content: q }); while (chat.turns.length > 12) chat.turns.shift(); if (chat.turns[0].role !== 'user') chat.turns.shift();
  const ctl = new AbortController(); chat.ctl = ctl;
  const tl = tools().map(t => Object.assign({}, t, { execute: async (input, ctx) => { used.push(t.name); out.firstChild && out.childNodes.length === 1 && out.textContent.startsWith('Thinking') && (out.textContent = 'Checking ' + t.name.replace(/_/g, ' ') + '…'); try { const r = await t.execute(input || {}, ctx); const s = JSON.stringify(r); return s.length > 30000 ? s.slice(0, 30000) : r; } catch (err) { throw new Error(err.message || String(err)); } } }));
  let text = '';
  try {
    const res = await chat.sample([{ role: 'user', content: RULES() }].concat(chat.turns), { tools: tl, signal: ctl.signal, onText: ({ text: t }) => { text = t; richText(out, t); $('#msgs').scrollTop = 1e9; } });
    text = res.text; richText(out, text); chat.turns.push({ role: 'assistant', content: text });
    if (res.truncated) chatNote('Cut short. Ask for less at a time.');
  } catch (e) {
    const keep = e && e.text; if (keep) richText(out, keep); else out.remove();
    chatNote({ cancelled: 'Stopped.', not_granted: 'The analyst needs permission to use Claude. Reload and allow it.', rate_limited: 'Too many questions right now. Try again in a minute.', session_expired: 'Please sign in to Claude again.', refused: 'Claude declined that. Try rephrasing.', sampling_disabled: 'Claude is not available for this account.', prompt_too_large: 'Too much at once. Start a new chat.' }[e && e.code] || 'Something went wrong (' + ((e && e.code) || 'error') + '). Try again.');
    if (['not_granted', 'sampling_disabled', 'not_declared'].includes(e && e.code)) chat.sample = null;
    chat.turns.pop(); text = keep || '';
  } finally {
    if (used.length && out.isConnected) { const t = document.createElement('div'); t.className = 'tools'; t.textContent = 'Checked: ' + Array.from(new Set(used)).join(', ').replace(/_/g, ' '); out.appendChild(t); }
    chat.busy = false; chat.ctl = null; $('#send').textContent = 'Ask';
    if (onDone) onDone(text);
  }
}
function runTest(id) {
  const t = tests().find(x => x.id === id); if (!t) return;
  if (!chat.sample) return toast('The analyst is off here: open this page in Claude while signed in.');
  S.tests[id] = { running: true }; render();
  askAnalyst(t.q, text => {
    if (text === null) { delete S.tests[id]; render(); return; }
    const norm = s => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/(\d),(?=\d)/g, '$1'), body = norm(text), hit = arr => (arr || []).some(a => body.includes(norm(a)));
    S.tests[id] = { text, pass: hit(t.any) && (!t.also || hit(t.also)) }; render();
  });
}

/* ---------- start ---------- */
async function start() {
  bind();
  try { await loadBase('27'); } catch (e) { $('#main').innerHTML = `<div class="loading">Could not load the data (${esc(e.message)}). Reload the page.</div>`; return; }
  rebuild(); setPage();
  initChat(); Store.init();
}
start();
}
