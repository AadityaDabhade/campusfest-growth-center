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
const money = n => !ok(n) ? '–' : Math.abs(n) >= 100000 ? lakh(n) : Math.abs(n) >= 1000 ? '₹' + String(+(n / 1000).toFixed(1)) + 'k' : inr(n);
const dshort = d => d ? new Date(d.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '–';
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clone = o => JSON.parse(JSON.stringify(o));
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const EXTRA_OWNERS = { GL: 'Growth lead', SEC: 'Security / operations lead', CORE: 'Fest core team' };
const VIEWS = { live27: { base: '27', label: '2027 plan (simulated)' }, orig25: { base: '25', label: '2025 actual (original)', locked: true }, edit25: { base: '25', label: '2025 actual (with your edits)' } };
const DIRS = { '27': 'data27', '25': 'data' };
const KEY = 'gc3.';
/* 2025 facts used for the gate estimate: 1.59 entries per visitor, and the busiest hour took 24.5% of a day's entries (400 of ~1,630). */
const ENTRIES_PER_VISITOR = 1.59, PEAK_HOUR_SHARE = 0.245;

const S = { raw: {}, details: [], cache: {}, ds: null, view: 'live27', asOf: null, edits: [], tasks: [], decisions: [], settings: {}, page: 'overview', funnelCamp: 'all', store: 'local', readOnly: false, uid: null, pending: null, review: null, tests: {}, drawer: null, fc: {} };
const baseOf = () => VIEWS[S.view].base;
const assump = () => clone(E.DEFAULT_ASSUMPTIONS);
const rules = () => clone(E.DEFAULT_RULES);
function owners() { return Object.assign({}, S.ds ? S.ds.owners : {}, EXTRA_OWNERS); }
function ownerLabel(id) { return owners()[id] || id || 'Growth lead'; }
const ended = () => S.asOf >= S.ds.event.eventEndDay;
const started = () => S.asOf >= S.ds.event.eventStartDay;
const before = () => S.asOf < S.ds.event.eventStartDay;
const hasBets = () => S.ds.tables.campaigns.some(c => c.kind === 'bet');
const sim = () => !!S.ds.event.today;
const daysToFest = D => E.daysBetween(D || S.asOf, S.ds.event.eventStartDay);
const daysTxt = n => n + (n === 1 ? ' day' : ' days');
/* In the 2027 rehearsal (after "today"), plan tasks due before the viewed date count as done: the rehearsal assumes the team works on time. */
const tStatus = t => sim() && t.source === 'plan' && t.status !== 'done' && S.asOf > S.ds.event.today && t.due && t.due < S.asOf ? 'done' : t.status;

/* ---------- small UI pieces ---------- */
const info = (t, left) => `<span class="i${left ? ' lft' : ''}" tabindex="0" role="note" aria-label="${esc(t)}" data-tip="${esc(t)}">i</span>`;
const VCLS = { Safe: 'ok', Hit: 'ok', 'Ahead, not safe yet': 'warn', 'Off track': 'act', Missed: 'act' };
const pill = v => v ? `<span class="pill ${VCLS[v] || ''}">${esc(v)}</span>` : '';
const kpi = (l, v, s, tip) => `<div class="kpi"><div class="l">${esc(l)}${tip ? info(tip) : ''}</div><div class="v">${esc(v)}</div><div class="s">${s || ''}</div></div>`;
const explainBtn = () => `<button class="link" data-act="explain" type="button">Understand this page</button>`;
function head(title, sub) { return `<div class="ph"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${explainBtn()}</div>${rehearsal()}`; }
function rehearsal() {
  const t = S.ds.event.today; if (!t || S.asOf <= t) return '';
  return `<div class="banner"><b>Rehearsal.</b> "Today" is the end of week 10 (${esc(dshort(t))}). Later dates show one simulated run where the team takes the plan's decisions on time. It is not the best case: one bet fails and ₹1.5L of reserve stays unspent.</div>`;
}
const VERB = { 'Too early': 'v-early', Stopped: 'v-Stop' };
const vcls = v => VERB[v] || 'v-' + v;
function todayReleases(D) {
  if (!hasBets() || !before()) return [];
  const bets = E.betRows(S.ds, D, assump());
  return S.decisions.filter(d => (d.base || '25') === baseOf() && d.kind === 'release_reserve' && d.as_of === D).map(d => { const b = bets.find(x => x.campaign_id === d.campaign_id); return b && b.next_tranche_cost ? { amount: d.amount || 0, cost: b.next_tranche_cost, bet: b.bet } : null; }).filter(x => x && x.amount > 0);
}
function fcAt(D, extra) {
  const tr = todayReleases(D); if (tr.length) extra = tr.map(x => ({ amount: x.amount, cost: x.cost })).concat(extra || []);
  const k = S.view + '|' + D + (extra ? JSON.stringify(extra) : '');
  if (!S.fc[k]) S.fc[k] = E.forecast(S.ds, D, assump(), extra ? { extra } : undefined);
  return S.fc[k];
}
function ly() { // 2025 at the same number of days before its fest (2027 view only)
  const r = S.raw['25']; if (!r || !sim()) return null;
  S.cache.ly = S.cache.ly || E.build(r, { details: S.details, label: '2025 actual' });
  const d = S.cache.ly, D = before() ? E.addDays(d.event.eventStartDay, -daysToFest()) : started() && !ended() ? d.event.eventStartDay : d.event.end;
  return { ds: d, D, k: E.kpis(d, D, assump()), f: E.funnelView(d, D, assump()) };
}

/* ---------- settings-free data handling ---------- */
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
  if (v === 'orig25') { S.cache.orig25 = S.cache.orig25 || E.build(S.raw['25'], { details: S.details, label: VIEWS.orig25.label }); S.ds = S.cache.orig25; }
  else { const ed = editsFor(b); S.ds = E.build(E.applyEdits(S.raw[b], ed), { details: b === '25' ? S.details : [], label: VIEWS[v].label }); }
  S.fc = {};
  const ev = S.ds.event;
  if (!keepDate || !S.asOf || S.asOf < ev.start || S.asOf > ev.end) S.asOf = ev.today || ev.end;
  syncBar();
}
function dateOptions() {
  const ds = S.ds, ev = ds.event, cp = E.checkpoints(ds), out = [];
  const eve = cp.eve, start = ev.planStart || ev.start;
  for (let w = 1; ; w++) { const d = E.addDays(start, 7 * w - 1); if (d >= eve) break; let l = 'Week ' + w + ' · ' + dshort(d); if (d === ev.today) l += ' · today, review'; out.push([d, l]); }
  if (!ev.today) out.push([cp.review, 'Review point · ' + dshort(cp.review) + ' (33 days out)']);
  out.push([eve, 'Fest eve · ' + dshort(eve)]);
  out.push([ev.eventStartDay, 'Fest day 1 · ' + dshort(ev.eventStartDay)]);
  if (ev.eventEndDay !== ev.eventStartDay) out.push([ev.eventEndDay, 'Fest day 2 · ' + dshort(ev.eventEndDay)]);
  if (ev.end > ev.eventEndDay) out.push([ev.end, 'Result · ' + dshort(ev.end)]);
  const seen = new Set(), list = out.filter(o => !seen.has(o[0]) && seen.add(o[0])).sort((a, b) => a[0].localeCompare(b[0]));
  if (!seen.has(S.asOf)) { list.push([S.asOf, dshort(S.asOf)]); list.sort((a, b) => a[0].localeCompare(b[0])); }
  return list;
}
function syncBar() {
  const ev = S.ds.event, o = dateOptions();
  $('#prevWk').disabled = S.asOf === o[0][0]; $('#nextWk').disabled = S.asOf === o[o.length - 1][0];
  $('#asOf').innerHTML = o.map(([d, l]) => `<option value="${d}" ${d === S.asOf ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#dsSel').value = S.view === 'live27' ? 'live27' : '25';
  const n25 = editsFor('25').length, tg = $('#origToggle');
  tg.hidden = !(S.view === 'orig25' || S.view === 'edit25') || !n25;
  tg.textContent = S.view === 'edit25' ? 'With your ' + n25 + ' edit' + (n25 > 1 ? 's' : '') + ' · show original' : 'Original · show your edits';
  $('#evname').textContent = ev.name + (ev.city ? ', ' + ev.city : '');
  $('#navBets').hidden = !hasBets();
  $('#navEvent').hidden = !(S.asOf >= ev.eventStartDay && S.ds.tables.checkins.length);
  const n = groupFlags(E.flags(S.ds, S.asOf, rules(), assump())).filter(g => g.level !== 'watch').length;
  $('#sigCount').hidden = !n; $('#sigCount').textContent = n;
  $('#saveState').textContent = { local: 'Your changes save in this browser.', loading: 'Loading saved changes…', slow: 'Saved changes not reachable yet.', saved: 'Changes saved and shared.', error: 'Saving unavailable: kept in this browser.' }[S.store] + (S.readOnly ? ' View-only.' : '');
}

/* ---------- saving: shared db when signed in to Claude, this browser otherwise ---------- */
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
    let seeded = false;
    ['edits', 'tasks', 'decisions'].forEach(c => db.collection(c).onSnapshot(snap => { S[c] = snap.docs.map(d => d.data()); if (!snap.metadata.fromCache) live(); if (c === 'tasks' && !seeded && !snap.metadata.fromCache) { seeded = true; this.seedShared(); } onData(c); }, () => { clearTimeout(timer); S.store = 'error'; syncBar(); }));
  },
  async seedTasks() { try { return await (await fetch('data27/tasks.json')).json(); } catch (e) { return []; } },
  async seedShared() { if (S.readOnly || S.tasks.some(t => (t.base || '') === '27')) return; for (const t of await this.seedTasks()) await this.put('tasks', t); },
  loadLocal() { try { ['edits', 'tasks', 'decisions'].forEach(c => { S[c] = JSON.parse(localStorage.getItem(KEY + c) || '[]'); }); } catch (e) {} },
  async seedLocal() { try { if (localStorage.getItem(KEY + 'seeded')) return; const seed = await this.seedTasks(); const have = new Set(S.tasks.map(t => t.id)); S.tasks = S.tasks.concat(seed.filter(t => !have.has(t.id))); localStorage.setItem(KEY + 'seeded', '1'); this.saveLocal(); } catch (e) {} },
  saveLocal() { try { ['edits', 'tasks', 'decisions'].forEach(c => localStorage.setItem(KEY + c, JSON.stringify(S[c]))); } catch (e) {} },
  async put(coll, obj) {
    obj = clone(obj); const list = S[coll].slice(); const i = list.findIndex(x => x.id === obj.id); if (i >= 0) list[i] = obj; else list.push(obj); S[coll] = list;
    if (this.db && !S.readOnly) {
      try { await this.db.collection(coll).doc(obj.id).set(obj); }
      catch (e) { if (e && e.code === 'invalid_argument') S.readOnly = true; toast(e && e.code === 'quota_exceeded' ? 'Storage is full: delete old tasks or edits.' : 'Not saved to the shared copy. Kept in this browser.'); this.saveLocal(); }
    } else this.saveLocal();
  },
  async remove(coll, id) { S[coll] = S[coll].filter(x => x.id !== id); if (this.db && !S.readOnly) { try { await this.db.collection(coll).doc(id).delete(); } catch (e) { toast('Could not delete in the shared copy.'); } } else this.saveLocal(); }
};
function onData(c) { if (c === 'edits' && S.raw[baseOf()]) rebuild(true); render(); }

async function commitEdit(type, payload, note) {
  if (S.view === 'orig25') { S.view = 'edit25'; toast('The 2025 original stays locked. Your change is saved as an edit on top of it.'); }
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

/* ---------- charts ---------- */
let observers = [];
function niceStep(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function kfmt(v) { const t = (x, d) => String(+x.toFixed(d)); return v >= 100000 ? t(v / 100000, 2) + 'L' : v >= 1000 ? t(v / 1000, 1) + 'k' : t(v, 1); }
function mount(id, draw) { const s = document.getElementById(id); if (!s) return; const ro = new ResizeObserver(() => { try { draw(s); } catch (e) { console.error(e); } }); ro.observe(s); observers.push(ro); }
function axes(W, H, m, mx, n, xl, X) {
  const ih = H - m.t - m.b, st = niceStep(mx / 4), nt = Math.max(1, Math.ceil(mx * 1.05 / st)), ym = st * nt, Y = v => m.t + ih - (v / ym) * ih; let g = '';
  for (let k = 0; k <= nt; k++) { const y = Y(st * k); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="#eceef0"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end">${esc(kfmt(st * k))}</text>`; }
  const ticks = Math.min(n, W < 520 ? 3 : 7); for (let k = 0; k < ticks; k++) { const i = ticks > 1 ? Math.round(k * (n - 1) / (ticks - 1)) : 0; g += `<text x="${X(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}">${esc(xl(i))}</text>`; }
  return { g, Y };
}
function lineChart(s, cfg) {
  const W = s.clientWidth, H = s.clientHeight; if (!W || !H) return;
  const m = { l: 44, r: 12, t: 12, b: 24 }, iw = W - m.l - m.r, n = cfg.x.length;
  let mx = 0; cfg.series.forEach(se => se.values.forEach(v => { if (ok(v) && v > mx) mx = v; })); (cfg.bands || []).forEach(b => b.hi.forEach(v => { if (ok(v) && v > mx) mx = v; }));
  const X = i => m.l + (n > 1 ? i / (n - 1) : 0.5) * iw, A = axes(W, H, m, mx, n, i => cfg.xl ? cfg.xl(cfg.x[i]) : dshort(cfg.x[i]), X), Y = A.Y; let g = A.g;
  (cfg.bands || []).forEach(b => { const pts = []; b.hi.forEach((v, i) => { if (ok(v)) pts.push([X(i), Y(v)]); }); const lo = []; b.lo.forEach((v, i) => { if (ok(v)) lo.push([X(i), Y(v)]); }); if (pts.length) g += `<path d="M${pts.map(p => p.join(' ')).join('L')}L${lo.reverse().map(p => p.join(' ')).join('L')}Z" fill="${b.color}" opacity=".16"/>`; });
  if (ok(cfg.marker)) { const x = X(cfg.marker), right = cfg.marker > n * 0.75; g += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${H - m.b}" stroke="#111418" stroke-dasharray="2 3"/><text x="${x + (right ? -6 : 6)}" y="${m.t + 10}" text-anchor="${right ? 'end' : 'start'}" style="fill:#111418">${esc(cfg.markerLabel || 'today')}</text>`; }
  cfg.series.forEach(se => { let d = '', pen = false; se.values.forEach((v, i) => { if (!ok(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); g += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.w || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round"/>`; if (se.label) { const li = se.values.length - 1; if (ok(se.values[li])) g += `<text x="${W - m.r}" y="${Y(se.values[li]) - 5}" text-anchor="end" style="fill:${se.color}">${esc(se.label)}</text>`; } if (se.dots) se.values.forEach((v, i) => { if (ok(v)) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.2" fill="${se.color}"/>`; }); });
  (cfg.points || []).forEach(p => { g += `<circle cx="${X(p.i)}" cy="${Y(p.v)}" r="5" fill="${p.color}"/><text x="${X(p.i) - 8}" y="${Y(p.v) - 9}" text-anchor="end" style="fill:${p.color};font-weight:600">${esc(p.label)}</text>`; });
  s.innerHTML = g;
}
function colChart(s, cfg) {
  const W = s.clientWidth, H = s.clientHeight; if (!W || !H) return;
  const m = { l: 40, r: 10, t: 12, b: 22 }, iw = W - m.l - m.r, ih = H - m.t - m.b, n = cfg.values.length;
  const mx = Math.max(cfg.cap || 0, ...cfg.values, 1), st = niceStep(mx / 4), nt = Math.max(1, Math.ceil(mx * 1.05 / st)), ym = st * nt, Y = v => m.t + ih - v / ym * ih, bw = iw / n; let g = '';
  for (let k = 0; k <= nt; k++) { const y = Y(st * k); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="#eceef0"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end">${esc(kfmt(st * k))}</text>`; }
  cfg.values.forEach((v, i) => { g += `<rect x="${m.l + i * bw + bw * .15}" y="${Y(v)}" width="${Math.max(1, bw * .7)}" height="${Math.max(0, m.t + ih - Y(v))}" fill="${cfg.cap && v >= cfg.cap * 0.8 ? '#c8281e' : '#111418'}"><title>${esc(cfg.labels[i] + ': ' + fmt(v))}</title></rect>`; });
  const step = Math.max(1, Math.ceil(n / (W < 520 ? 4 : 9))); cfg.labels.forEach((l, i) => { if (i % step === 0) g += `<text x="${m.l + i * bw + bw / 2}" y="${H - 5}" text-anchor="middle">${esc(cfg.short ? cfg.short(l) : l)}</text>`; });
  if (cfg.cap) { const y = Y(cfg.cap); g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="#c8281e" stroke-dasharray="5 4"/><text x="${W - m.r}" y="${y - 5}" text-anchor="end" style="fill:#c8281e">${esc(cfg.capLabel || '')}</text>`; }
  s.innerHTML = g;
}

/* ---------- flags ---------- */
function openTaskFor(fid) { return S.tasks.find(t => t.flag_id === fid && t.status !== 'done' && (t.base || '25') === baseOf()); }
const LV = { act: 0, warn: 1, watch: 2 };
function groupFlags(fl) {
  const m = new Map();
  fl.forEach(f => { const i = f.title.indexOf(':'), subj = i > 0 ? f.title.slice(0, i) : f.title, issue = i > 0 ? f.title.slice(i + 1).trim() : ''; if (!m.has(subj)) m.set(subj, { subj, level: f.level, items: [] }); const g = m.get(subj); g.items.push(Object.assign({ issue }, f)); if (LV[f.level] < LV[g.level]) g.level = f.level; });
  const out = Array.from(m.values()); out.forEach(g => g.items.sort((a, b) => LV[a.level] - LV[b.level])); return out.sort((a, b) => LV[a.level] - LV[b.level]);
}
function actButtons(f, why) {
  const t = openTaskFor(f.id);
  return `<div class="row">${t ? `<span class="note">Task open: ${esc(ownerLabel(t.owner))}, due ${esc(dshort(t.due))}</span>` : `<button class="btn sm" data-act="flag" data-id="${esc(f.id)}" type="button">Act on this</button>`}${why ? `<button class="btn ghost sm" data-act="flagd" data-id="${esc(f.id)}" type="button">Why?</button>` : `<button class="btn ghost sm" data-act="ask" data-q="${esc('Why is this flagged: "' + f.title + '"? What should we do?')}" type="button">Ask the analyst</button>`}</div>`;
}
function groupRow(g) {
  const top = g.items[0];
  return `<div class="flag"><div class="t"><span class="lvl ${g.level}">${g.level}</span>${esc(g.subj)}</div>${g.items.slice(0, 3).map(f => `<div class="e">${esc(f.reason)}</div>`).join('')}${actButtons(top, true)}</div>`;
}
function flagDetail(f) {
  return `<p><span class="lvl ${f.level}">${f.level}</span> <b>${esc(f.title)}</b></p>
  <dl class="qa"><dt>What we saw</dt><dd>${esc(f.evidence)}</dd><dt>Why it matters</dt><dd>${esc(f.matters)}</dd><dt>What we suggest</dt><dd>${esc(f.action)} <span class="note">Owner: ${esc(f.owner)}</span></dd><dt>If we do nothing</dt><dd>${esc(f.if_nothing)}</dd></dl>
  <p class="note">${f.trust === 'proven' ? 'Counted from records.' : 'Uses an estimate (est.), so treat it as a strong hint, not proof.'}</p>${actButtons(f, false)}`;
}
function campOptions(sel, all, filter) { return (all ? '<option value="all">All campaigns</option>' : '') + Array.from(S.ds.camps.values()).filter(c => !filter || filter(c)).map(c => `<option value="${esc(c.campaign_id)}" ${c.campaign_id === sel ? 'selected' : ''}>${esc(c.campaign_name)}</option>`).join(''); }
function ownerOptions(sel) { const o = owners(); return Object.keys(o).map(k => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(o[k])}</option>`).join(''); }
function verdict(r, end, overall, cap, min, bets) {
  if (!r.campaign_id) return ['', ''];
  if (r.status === 'stopped') return ['Stopped', 'Stopped at a review'];
  if (r.status === 'paused') return ['Keep', 'Paused'];
  if (r.kind === 'bet') { const b = bets.find(x => x.campaign_id === r.campaign_id); return b ? [b.decision, BET_NOTE[b.decision]] : ['', '']; }
  const base = end ? r.visitors : r.expected_visitors, cost = end ? r.cost_per_visitor : r.cost_per_expected_visitor;
  if (base < min || !ok(cost)) return ['Too early', 'Under ' + min + ' people'];
  if (cost > 1.5 * cap) return ['Stop', 'Far above the limit'];
  if (cost > cap) return ['Change', 'Above the ' + inr(cap) + ' limit'];
  if (cost <= 0.5 * cap && (!end || r.showup >= overall)) return ['Scale', 'Cheap, and people come'];
  return ['Keep', 'Under the limit'];
}
const BET_NOTE = { Scale: 'Ready for reserve money', Keep: 'Works; the next rupee costs too much', Change: 'Costs more than its limit', Stop: 'No clear gap after a fair test', 'Too early': 'Test not fair yet', Stopped: 'Stopped at a review' };

/* ---------- the timeline strip and the three checkpoints ---------- */
function timeline() {
  const ds = S.ds, ev = ds.event, cp = E.checkpoints(ds), start = ev.planStart || ev.start, total = E.daysBetween(start, ev.end) + 1, D = S.asOf;
  const x = d => Math.max(0, Math.min(100, (E.daysBetween(start, d) + 0.5) / total * 100));
  let h = '';
  for (let w = 1; ; w++) { const d = E.addDays(start, 7 * (w - 1)); if (d > ev.end) break; const end = E.addDays(d, 6); h += `<button class="tk ${D >= d && D <= end ? 'on' : ''}" style="left:${x(d)}%;width:${700 / total}%" data-act="go" data-d="${end > ev.end ? ev.end : end}" type="button" title="Week ${w}, ${dshort(d)}–${dshort(end)}">${w}</button>`; }
  const mks = sim() ? [[ev.competitionOpens, 'competitions open'], [ev.regOpens, 'passes open'], [ev.bigPush, 'big push']] : [[ev.regOpens || (S.ds.regs[0] || {}).registered_at, 'registrations open']];
  h += mks.filter(m => m[0]).map(([d, l], i) => `<span class="mk${i === 1 ? ' lo' : ''}" style="left:${x(d.slice(0, 10))}%">${esc(l)}</span>`).join('');
  h += `<span class="fest" style="left:${x(ev.eventStartDay)}%;width:${Math.max(1.5, 200 / total)}%"></span>`;
  const SHORT = { review: sim() ? 'W10' : 'Review', eve: 'Eve', result: 'Result' };
  const pins = [['review', cp.review, sim() ? 'Week 10 review' : 'Review point', sim() ? 'We pause here on purpose: about half of all sign-ups are in and the bets have run for weeks, enough to judge them. We stop what failed and release the first reserve money. Uses only data up to this day.' : 'The same point as our 2027 week 10 review: 33 days before the fest. Shows what 2025 knew then.'],
    ['eve', cp.eve, 'Fest eve check', 'One day before the fest: are we ready for the people coming? Checks the forecast, confirmations, gate load and reserve. ' + (sim() ? 'Assumes the earlier decisions were taken on time.' : '')],
    ['result', cp.result, 'Result', sim() ? 'One realistic run of the plan, not the best case, checked against what we forecast earlier.' : 'What actually happened in 2025, checked against what the data said earlier.']];
  h += pins.map(([k, d, l, tip]) => `<span class="pin pin-${k} ${D === d ? 'on' : ''}" style="left:${x(d)}%"><button data-act="go" data-d="${d}" type="button"><span class="long">${esc(l)}</span><span class="short">${esc(SHORT[k])}</span></button>${info(tip, k === 'result')}</span>`).join('');
  h += `<span class="now" style="left:${x(D)}%" title="Viewing ${esc(dshort(D))}"></span>`;
  return `<div class="tl" aria-label="Campaign timeline"><div class="track">${h}</div></div>`;
}
function checkpointCard() {
  const cp = E.checkpoints(S.ds), D = S.asOf;
  if (D === cp.review) return reviewCard();
  if (D === cp.eve) return eveCard();
  if (D === cp.result) return resultCard();
  const next = [[cp.review, sim() ? 'Week 10 review' : 'Review point'], [cp.eve, 'Fest eve check'], [cp.result, 'Result']].find(p => p[0] > D);
  return next ? `<p class="note nextcp">Next checkpoint: <button class="link" data-act="go" data-d="${next[0]}" type="button">${esc(next[1])}, ${esc(dshort(next[0]))} →</button></p>` : '';
}
function reviewCard() {
  const ds = S.ds, D = S.asOf, A = assump(), f = fcAt(D), groups = groupFlags(E.flags(ds, D, rules(), A)).filter(g => g.level !== 'watch' && g.subj !== 'Attendee target');
  if (!sim()) return `<div class="cp"><h2>Review point: what 2025 knew 33 days before the fest</h2><p>This is the same point as our 2027 week 10 review. 2025 had no tests or reserve, so the only levers were its channels.</p>
    <ul>${groups.slice(0, 4).map(g => `<li><b>${esc(g.subj)}:</b> ${esc(g.items[0].reason)}</li>`).join('')}</ul><p class="note">The forecast here extends the last 7 days of sign-ups. 2025 then had a late surge, which is why 2027 forecasts with a pace curve.</p></div>`;
  const rp = E.reservePlan(ds, D, A), bets = E.betRows(ds, D, A), early = bets.filter(b => b.decision === 'Too early');
  const extra = rp.suggestions.map(r => ({ amount: r.amount, cost: r.next_tranche_cost })), after = extra.length ? fcAt(D, extra) : null;
  const decided = E.planDecisionsAt(ds, E.addDays(D, 1)).filter(p => p.decided_at.slice(0, 10) === E.addDays(D, 1));
  return `<div class="cp"><h2>Week 10 review: we pause here on purpose</h2>
  <p>About half of all sign-ups are in and the bets have run for weeks: enough to judge them. Before any more money moves we check three things: are we on course, what is failing, and where the next rupee works best.</p>
  <h3>What the data says to decide</h3><ul class="dec">
  ${rp.suggestions.map(r => `<li><span>Release <b>${lakh(r.amount)}</b> to <b>${esc(r.bet)}</b>: its next extra attendee costs about ${inr(r.next_tranche_cost)}, under its ${inr(r.cap)} limit.</span><button class="btn sm" data-act="release" data-id="${esc(r.campaign_id)}" data-amt="${r.amount}" type="button">Release</button></li>`).join('')}
  ${groups.slice(0, 3).map(g => `<li><span><b>${esc(g.subj)}:</b> ${esc(g.items[0].reason)}.</span><button class="btn ghost sm" data-act="flag" data-id="${esc(g.items[0].id)}" type="button">Act</button></li>`).join('')}
  ${early.map(b => `<li><span><b>${esc(b.bet)}:</b> keep testing (${esc(b.evidence_gaps[0])}).</span></li>`).join('')}</ul>
  ${after ? `<p class="impact">If we release the suggested ${lakh(extra.reduce((a, x) => a + x.amount, 0))}: most likely <b>${fmt(f.likely)} → ${fmt(after.likely)}</b> attendees, bad luck ${fmt(f.bad)} → ${fmt(after.bad)}. ${pill(f.verdict)} → ${pill(after.verdict)} ${info('Each released rupee is assumed to buy extra attendees at the bet\'s next-attendee cost, delivering 50–100% of that (most likely 80%), because scaled bets usually do a bit worse than their test.')}</p>` : ''}
  ${decided.length ? `<p class="note">In the rehearsal the team decided on ${esc(dshort(E.addDays(D, 1)))}: ${decided.map(p => esc(p.title)).join('; ')}.</p>` : ''}</div>`;
}
function expectedPeak(likely) { return likely * ENTRIES_PER_VISITOR / 2 * PEAK_HOUR_SHARE; }
function eveCard() {
  const ds = S.ds, D = S.asOf, A = assump(), f = fcAt(D), k = E.kpis(ds, D, A), cap = ds.event.gateCap || A.gate_capacity.value, peak = expectedPeak(f.likely || 0);
  const conf = k.active ? k.status.confirmed / k.active : null, open = S.tasks.filter(t => (t.base || '25') === baseOf() && tStatus(t) !== 'done' && t.due && t.due < D).length;
  const rows = [
    [f.verdict === 'Safe', 'Forecast', `${pill(f.verdict)} bad luck ${fmt(f.bad)} · most likely ${fmt(f.likely)} · good luck ${fmt(f.good)} vs target ${fmt(f.target)}`],
    [conf >= 0.8, 'Confirmed', `${pct(conf)} of active registrants have confirmed (2025 finished at 89%)`],
    [peak < 0.8 * cap, 'Gates', `busiest hour ≈ ${fmt(peak)} entries if arrivals bunch like 2025, vs a safe ${fmt(cap)}/hour ${info('Expected attendees × 1.59 entries each ÷ 2 days × 24.5% in the busiest hour (2025 pattern).')}`],
    [true, 'Waitlist', `${fmt(k.status.waitlisted)} people waitlisted; unscanned passes go to them at 2 pm`],
    [!open, 'Tasks', open ? `${open} task${open > 1 ? 's' : ''} due by today still open` : 'nothing overdue']
  ];
  if (hasBets()) rows.splice(3, 0, [true, 'Reserve', `${lakh(E.reserveLeft(ds, D))} left of ${lakh(ds.event.reserve)}`]);
  return `<div class="cp"><h2>Fest eve check: are we ready for the people coming?</h2><p>${sim() ? 'One day before the fest. This assumes the reviews at weeks 10, 12 and 14 were held and their decisions taken on time.' : 'One day before the 2025 fest, with what was known then.'}</p>
  <table class="check">${rows.map(([g, l, t]) => `<tr><td>${g ? '<span class="ck ok">✓</span>' : '<span class="ck warn">!</span>'}</td><td><b>${esc(l)}</b></td><td>${t}</td></tr>`).join('')}</table></div>`;
}
function resultCard() {
  const ds = S.ds, cp = E.checkpoints(ds), A = assump(), k = E.kpis(ds, cp.result, A), g = k.target || {}, r = fcAt(cp.review), eve = fcAt(cp.eve), b = E.budget(ds, cp.result);
  const inside = (f, v) => v >= f.bad && v <= f.good, v = k.visitors;
  let lyLine = '';
  if (sim()) { const l = ly(); if (l) lyLine = `<li>Last year: <b>${fmt(l.k.visitors)}</b> outside attendees, so ${pct(v / l.k.visitors - 1)} more.</li>`; }
  return `<div class="cp"><h2>Result: ${fmt(v)} outside attendees ${pill(v >= g.visitors ? 'Hit' : 'Missed')}</h2><ul>
  <li>Target ${fmt(g.visitors)}${g.stretch_visitors ? `, stretch ${fmt(g.stretch_visitors)}` : ''}: ${pct(v / g.visitors)} of the target.</li>
  <li>At the ${sim() ? 'week 10 review' : 'review point'} the forecast${sim() ? ' if nothing changed' : ''} was ${fmt(r.bad)}–${fmt(r.good)} (most likely ${fmt(r.likely)}). ${sim() ? `The decisions taken after it added roughly <b>${fmt(v - r.likely)}</b> attendees (est.: the gap also includes luck).` : (v > r.good ? 'The result beat it: late sign-ups surged, which a last-7-days forecast cannot see. 2027 uses a pace curve for this reason.' : '')}</li>
  <li>Fest eve forecast ${fmt(eve.bad)}–${fmt(eve.good)}: the result is ${inside(eve, v) ? '<b>inside</b> it ✓' : v > eve.good ? 'above it' : 'below it'}.</li>
  ${lyLine}<li>Spent ${lakh(b.spent)} of ${lakh(b.approved)}${hasBets() && E.reserveLeft(ds, cp.result) ? `; ${lakh(E.reserveLeft(ds, cp.result))} of reserve stayed unspent because no bet passed the money rule` : ''}. Cost per attendee ${inr(b.spent / v)}.</li></ul></div>`;
}

/* ---------- pages ---------- */
const PAGES = {};
/* 2027 plan stages: what happens each week and what we check */
const STAGES = [[1, 1, 'Build', 'Hire lead ambassadors at the test colleges (perks, not cash).', 'Ambassadors hired'], [2, 2, 'Competitions open', 'Competition registrations open; ambassadors start their crews.', 'Teams vs plan (150 by week 6)'],
  [3, 3, 'Passes open', 'Pass registrations open, 82 days before the fest, the same as 2025.', 'Sign-ups vs 2025\'s curve'], [4, 7, 'Steady sign-ups', 'Ambassadors, colleges and creators bring sign-ups; teams keep registering.', 'Sign-ups vs plan; teams vs plan'],
  [8, 8, 'Big push', 'Line-up reveal, Group Pass and Welcome Back cards.', 'Group Pass take-up'], [9, 9, 'Test read', 'Read the paid-ads test; alumni and day scholar offers open.', 'Do paid ads bring friend groups?'],
  [10, 10, 'Review 1', 'First money review: stop what failed, release reserve to proven bets.', 'Forecast, bets, money'], [11, 11, 'Scale', 'Released money goes to work in new colleges.', 'Extra attendees from the new money'],
  [12, 12, 'Review 2', 'Second review: more money only if a bet still passes; entry windows reach 60%.', 'Forecast, bets, money'], [13, 13, 'Confirm push', 'Confirm-your-spot reminders to everyone unconfirmed.', 'Share confirmed'],
  [14, 14, 'Review 3', 'Last money review; daily stand-ups start.', 'Forecast, bets, money'], [15, 15, 'Fest week', 'Fest eve check, the fest (Fri–Sat), then the result.', 'Gates, confirmations, waitlist']];
function stageNow() {
  const ds = S.ds, ev = ds.event, D = S.asOf, cp = E.checkpoints(ds);
  if (D >= ev.end) return 'The fest is over: these are the final numbers.';
  if (D >= ev.eventStartDay) return 'Fest day ' + (E.daysBetween(ev.eventStartDay, D) + 1) + ': people are scanning in at the gates.';
  if (D === cp.eve) return 'Fest eve: the last check that we are ready for the people coming.';
  if (!sim()) return D < (ds.regs[0] || {}).registered_at ? 'Before registrations opened.' : 'Registrations open; ' + daysTxt(daysToFest()) + ' to the fest.' + (D === cp.review ? ' This is the same point as our 2027 week 10 review.' : '');
  const w = E.weekOf(ds, D), st = STAGES.find(x => w >= x[0] && w <= x[1]);
  return st ? `Week ${w} · ${st[2]}. ${st[3]}` : '';
}
function numbersSay(k, f) {
  const ds = S.ds, D = S.asOf, pc = E.pace(ds, D)[0], tp = k.teamPlan, g = k.target || {};
  const teams = tp ? ` Competition teams: ${fmt(k.teams)} (plan ${fmt(tp.by_now)} by now).` : '';
  if (f.mode === 'actual') { const r = fcAt(E.checkpoints(ds).review); return `${fmt(k.visitors)} outside attendees came, ${pct(k.visitors / g.visitors)} of the ${fmt(g.visitors)} target. At the ${sim() ? 'week 10 review' : 'review point'} the forecast${sim() ? ' if nothing changed' : ''} was ${fmt(r.likely)}.`; }
  if (f.mode === 'live') return `${fmt(k.visitors)} outside visitors so far; most likely ${fmt(f.likely)} by the end.`;
  if (!k.registered) return `${fmt(k.identified)} people have responded so far; passes open ${dshort(ds.event.regOpens)}.${teams}`;
  const P = sim() ? k.passRegistered : k.registered;
  const pace = pc && pc.curve && pc.base_pace ? `Sign-ups are ${P >= pc.base_pace ? 'ahead of' : 'behind'} plan (${fmt(P)} vs ${fmt(pc.base_pace)} by now).` : `${fmt(P)} registered so far.`;
  if (f.mode === 'too early') return `${pace}${teams} Too few sign-ups yet to forecast attendance.`;
  const conf = k.active ? k.status.confirmed / k.active : null;
  const v = { Safe: 'safe even with bad luck', 'Ahead, not safe yet': `ahead, but bad luck (${fmt(f.bad)}) would miss it`, 'Off track': 'short even in the normal case' }[f.verdict];
  return `${pace} ${pct(conf)} have confirmed, so most likely ${fmt(f.likely)} attendees vs ${fmt(f.target)}: ${v}.`;
}
function assumptionNow(f) {
  if (f.mode === 'actual') return 'None needed: these are counted gate entries.';
  if (f.mode === 'live') return 'About half of the confirmed people not yet in come on day 2 (the 2025 pattern).';
  if (!sim()) return '2025 had no pace plan, so the forecast extends the last 7 days of sign-ups. It can miss a late surge, and in 2025 it did.';
  if (f.mode === 'too early') return 'Sign-ups follow 2025\'s timing: about half are in by 33 days before the fest.';
  return daysToFest() <= 2 ? 'Confirmed people come about 75% of the time; people still unconfirmed on fest eve rarely do (2025: 0 of 29).' : 'About 75% of confirmed people come and about 55% of unconfirmed ones (2025: 73–77% and 54–66%). Late sign-ups follow 2025\'s curve.';
}
function forecastStarts() {
  const ds = S.ds, ev = ds.event; if (!ds.paceCurve.length) return null;
  for (let d = ev.regOpens || ev.start; d < ev.eventStartDay; d = E.addDays(d, 1)) { const sh = E.shareAt(ds, d); if (sh !== null && sh >= 0.1) return d; }
  return null;
}
PAGES.overview = () => {
  const ds = S.ds, D = S.asOf, A = assump(), k = E.kpis(ds, D, A), f = fcAt(D), g = k.target || {}, b = E.budget(ds, D), tot = f.total, host = k.hasHost;
  const pc = E.pace(ds, D)[0], P = host ? k.passRegistered : k.registered, sh = E.shareAt(ds, D), l = ly(), lyEnd = l ? E.kpis(l.ds, l.ds.event.end) : null;
  const vsPlan = (n, plan) => !ok(plan) || plan <= 0 ? '' : Math.abs(n / plan - 1) < 0.005 ? '<span class="up">on plan</span>' : `<span class="${n >= plan ? 'up' : 'dn'}">${n >= plan ? '▲' : '▼'} ${pct(Math.abs(n / plan - 1))} vs plan</span>`;
  const range = x => x && x.bad !== undefined && x.bad !== x.good ? `range ${fmt(x.bad)}–${fmt(x.good)}` : '';
  // title: the verdict on the number we promise (all attendees in 2027; outside attendees in 2025, which has no data on our own students)
  const main = host && tot ? tot : f, mainLabel = host ? 'all attendees' : 'outside attendees', mainTarget = host ? (g.all_attendees_base || (tot && tot.target)) : g.visitors;
  const fs0 = forecastStarts(), early = f.mode === 'too early', earlyV = '<span class="early">Too early</span>', earlySub = fs0 ? `forecast starts week ${E.weekOf(ds, fs0)} (${dshort(fs0)}), once 10% of sign-ups are in` : 'forecast starts once 10% of sign-ups are in';
  let title;
  if (f.mode === 'too early') title = k.registered ? `Too early to forecast: ${fs0 ? 'the forecast starts in week ' + E.weekOf(ds, fs0) : 'too few sign-ups yet'}` : `Before launch: registrations open ${dshort(ds.event.regOpens || ds.event.start)}`;
  else if (f.mode === 'actual') title = `${pill(main.verdict)} ${fmt(main.likely)} ${mainLabel} vs the ${fmt(mainTarget)} target`;
  else title = `${pill(main.verdict)} Most likely ${fmt(main.likely)} ${mainLabel} vs the ${fmt(mainTarget)} target`;
  // the four numbers that matter
  const big = (l, v, sub, tip, extra) => `<div class="kpi"><div class="l">${esc(l)}${tip ? info(tip) : ''}</div><div class="v">${v}</div><div class="s">${sub}</div>${extra || ''}</div>`;
  const done = f.mode === 'actual', est = f.mode === 'forecast' || f.mode === 'live';
  const boxes = [];
  if (host) boxes.push(big(done ? 'All attendees' : 'All attendees · heading for', early ? earlyV : tot && (est || done) ? fmt(tot.likely) : '–', `target ${fmt(g.all_attendees_base)}${g.all_attendees_stretch ? ' · stretch ' + fmt(g.all_attendees_stretch) : ''}<br>${early ? earlySub : est ? range(tot) : ''}`, 'Everyone who comes: outside people plus our own students (hostel students counted at the concert gate, day scholars at the student-ID lane). This is the number we promise.', tot && tot.verdict ? `<div class="vd">${pill(tot.verdict)}</div>` : ''));
  boxes.push(big(done ? 'Outside attendees' : 'Outside attendees · heading for', early ? earlyV : est || done ? fmt(f.likely) : '–', `target ${fmt(g.visitors)}${host ? ' · the part we grow' : ''}<br>${early ? earlySub : est ? range(f) : ''}`, 'Outside people verified at the gate, counted once. Marketing money moves this number, and it is the one we can compare with 2025.', !host && f.verdict ? `<div class="vd">${pill(f.verdict)}</div>` : ''));
  boxes.push(big('Registrations', fmt(k.registered), host ? `${fmt(P)} visitors + ${fmt(k.competitors)} in competition teams<br>${pc && pc.curve && pc.base_pace ? `visitors vs plan by now (${fmt(pc.base_pace)}): ${vsPlan(P, pc.base_pace)}` : ''}` : `goal ${fmt(g.registered)}`, host ? 'All outside people who registered. Visitors register for an entry pass; competition teams register separately and earlier, and have their own plan (300 teams by week 10). The visitor plan is 2025\'s sign-up curve applied to our 5,760 target.' : 'Outside people with a registration.'));
  boxes.push(big('Spent', money(k.spend), `of ${lakh(b.approved)} (${pct(b.used)})<br>${ok(k.costPerAttendee) ? inr(k.costPerAttendee) + ' per attendee' + (started() ? '' : ' (est.)') : ''}`, 'Net marketing spend. Cost per attendee = spent ÷ attendees (before the fest: ÷ the attendees expected from people already registered). Our limit for one extra person is ₹250.'));
  const lyLine = lyEnd ? `<p class="note">Last year: ${fmt(lyEnd.visitors)} outside attendees from ${fmt(lyEnd.identified)} people who responded, on ${lakh(lyEnd.spend)}. Our base plan: ${(g.visitors / lyEnd.visitors).toFixed(1)}× the outside attendees on ${(g.budget / lyEnd.spend).toFixed(1)}× the money.</p>` : '';
  const groups = groupFlags(E.flags(ds, D, rules(), A)).filter(x => x.level !== 'watch'), top = groups[0];
  const watch = top ? `<div class="watch"><span class="lvl ${top.level}">${top.level}</span><b>Watch now:</b> ${esc(top.subj)}: ${esc(top.items[0].reason)}. <button class="link" data-act="flagd" data-id="${esc(top.items[0].id)}" type="button">Why?</button>${groups.length > 1 ? ` · <a href="#insights">${groups.length - 1} more on Insights</a>` : ''}</div>` : `<div class="watch ok"><b>Watch now:</b> nothing at Warn or Act.</div>`;
  // scorecard: targets vs actuals
  const conf = k.registered ? k.status.confirmed / k.registered : null;
  const heading = x => x && (est || done) ? (done ? pill(x.verdict) : `<b>${fmt(x.likely)}</b><div class="note">${range(x)}</div>`) : '–';
  // reach plan = our reach target × the share of its final reach 2025 had at the same number of days before the fest
  const reachShare = l && lyEnd ? l.k.identified / lyEnd.identified : null, reachPlan = g.identified && host && reachShare >= 0.1 && !started() ? Math.round(g.identified * reachShare) : null;
  const studentsTarget = g.all_attendees_base ? g.all_attendees_base - (g.visitors || 0) : null;
  const rows = [
    ['People who responded', 'Outside people who did something back: left their details, opened a page, signed up or walked in. Counted once. Not everyone we messaged: people who only got a message are not counted. To get the target we need about 8,400 (in 2025, 57% of those who responded came). Plan by now follows 2025\'s timing.', `${fmt(k.identified)} ${reachPlan ? vsPlan(k.identified, reachPlan) : ''}`, reachPlan ? fmt(reachPlan) : '–', g.identified ? fmt(g.identified) : '–', '–'],
    host ? ['Registrations (all)', 'Every outside person who registered: visitors plus competition team members.', fmt(k.registered), '–', '–', '–'] : null,
    [host ? '· visitors' : 'Registrations', host ? 'Outside people who registered for an entry pass (competition teams are the row above).' : 'Outside people with a registration.', `${fmt(P)} ${pc && pc.curve && pc.base_pace ? vsPlan(P, pc.base_pace) : ''}`, pc && pc.curve && pc.base_pace ? fmt(pc.base_pace) : '–', fmt(g.registered) + (g.stretch_registered ? `<div class="note">stretch ${fmt(g.stretch_registered)}</div>` : ''), f.mode === 'forecast' && f.projected_registrations ? fmt(host ? f.projected_registrations - k.competitors : f.projected_registrations) : '–'],
    host ? ['· competition teams', 'Teams register first because they need time to prepare. Plan: 150 by week 6, 250 by week 8, 300 by week 10.', `${fmt(k.teams)} <span class="note">(${fmt(k.competitors)} people)</span> ${k.teamPlan ? vsPlan(k.teams, k.teamPlan.by_now) : ''}`, k.teamPlan ? fmt(k.teamPlan.by_now) : '–', k.teamPlan ? fmt(k.teamPlan.goal) : '–', '–'] : null,
    ['Confirmed', 'Said "I am coming" (visitors and team members). Confirmed people come about 75% of the time.', `${fmt(k.status.confirmed)} <span class="note">(${pct(conf)} of registrations)</span>`, '–', '–', '–'],
    ['Outside attendees', 'Verified at the gate, counted once.', started() ? fmt(k.visitors) + (done ? '' : ' so far') : '–', '–', fmt(g.visitors) + (g.stretch_visitors ? `<div class="note">stretch ${fmt(g.stretch_visitors)}</div>` : ''), heading(f)],
    host ? ['Our students', 'Hostel students (4,000; counted at the concert gate) and day scholars (6,000; student-ID lane). No registration step, so this is an estimate until fest day.', started() ? fmt(k.ourStudents) + (done ? '' : ' so far') : '–', '–', studentsTarget ? fmt(studentsTarget) : '–', tot && (est || done) ? (done ? fmt(k.ourStudents) : `<b>${fmt(tot.our_students)}</b>`) : '–'] : null,
    host ? ['All attendees', 'Outside attendees plus our students: the number we promise.', started() ? fmt(k.allVisitors) + (done ? '' : ' so far') : '–', '–', g.all_attendees_base ? fmt(g.all_attendees_base) + (g.all_attendees_stretch ? `<div class="note">stretch ${fmt(g.all_attendees_stretch)}</div>` : '') : '–', heading(tot)] : null,
    ['Spent', 'Net marketing spend so far.', money(k.spend), '–', lakh(b.approved), '–'],
    ['Cost per attendee', started() ? 'Spent ÷ outside attendees so far.' : 'Spent ÷ the outside attendees expected from people already registered (est.).', ok(k.costPerAttendee) ? inr(k.costPerAttendee) : '–', '–', '₹250 per extra person', '–']
  ].filter(Boolean);
  const score = `<div class="scroll"><table class="score"><tr><th>Measure</th><th class="n">Now</th><th class="n">Plan by now</th><th class="n">Final target</th><th class="n">Heading for${info('The forecast: the fest played 1,000 times. The range runs from bad luck (only 1 in 10 runs did worse) to good luck (only 1 in 10 did better).', true)}</th></tr>${rows.map(r => `<tr class="${r[0] === 'All attendees' ? 'tot' : ''}"><td>${esc(r[0])}${info(r[1])}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td><td class="n">${r[4]}</td><td class="n">${r[5]}</td></tr>`).join('')}</table></div>`;
  // campaign scorecard
  const end = ended(), cap = A.cost_cap.value, bets = hasBets() ? E.betRows(ds, D, A) : [], camps = E.campaignRows(ds, D, { assumptions: A }).filter(r => r.campaign_id), min = rules().min_people.value;
  const crow = r => { const bt = bets.find(x => x.campaign_id === r.campaign_id), c = bt ? bt.cost_per_extra : end ? r.cost_per_visitor : r.cost_per_expected_visitor, n = bt ? Math.max(0, bt.expected_extra_attendees) : end ? r.visitors : r.expected_visitors, lim = r.cost_cap_inr || cap, [v] = verdict(r, end, k.showup, cap, min, bets), early = v === 'Too early', over = !early && ok(c) && c > lim;
    return `<tr class="click" data-act="${bt ? 'bet' : 'camp'}" data-id="${esc(r.campaign_id)}" tabindex="0"><td>${esc(r.campaign)}${bt ? ` <span class="note">bet${r.audience === 'our students' ? ', our students' : ''}</span>` : ''}</td><td class="n">${money(r.spend)}${r.planned_budget_inr ? `<span class="note"> / ${money(r.planned_budget_inr)}</span>` : ''}</td><td class="n">${fmt(n)}${bt ? '<span class="note"> extra</span>' : ''}</td><td class="n ${over ? 'over' : ''}">${early || !r.spend || !ok(c) ? '–' : inr(c)}<span class="note"> / ${inr(lim)}</span></td><td><span class="${vcls(v)}">${esc(v)}</span></td></tr>`; };
  const cscore = `<div class="scroll"><table class="score"><tr><th>Campaign</th><th class="n">${hasBets() ? 'Spent / planned' : 'Spent'}</th><th class="n">${end ? 'Attendees' : 'Will come (from today\'s sign-ups)'}${info('For bets: extra attendees beyond what similar colleges without the bet show.', true)}</th><th class="n">Cost each / limit</th><th>Verdict</th></tr>${camps.map(crow).join('')}</table></div>`;
  const tr = todayReleases(D), trLine = tr.length ? ` Includes your release made today (${tr.map(x => lakh(x.amount) + ' to ' + esc(x.bet)).join(', ')}), estimated until it shows in sign-ups.` : '';
  const card = `<div class="wk"><div><span class="l">What's happening</span>${esc(stageNow())}</div><div><span class="l">What the numbers say</span>${esc(numbersSay(k, f))}${trLine}</div><div><span class="l">The assumption behind it</span>${esc(assumptionNow(f))} <a href="#journey" class="note">Full plan →</a></div></div>`;
  return `${head(title, '')}
  <div class="kpis">${boxes.join('')}</div>
  <p class="note brief">These follow the brief: projected outcome, targets vs actuals, budget and cost per attendee. The scorecard has the full funnel and conversion rates.</p>${lyLine}
  ${watch}
  <h2 class="sec">Scorecard</h2>${score}
  <h2 class="sec" style="margin-top:22px">Campaigns</h2>${cscore}
  <h2 class="sec" style="margin-top:22px">This week</h2>${card}`;
};
PAGES.journey = () => {
  const ds = S.ds, D = S.asOf, w = E.weekOf(ds, D);
  const stages = sim() ? `<div class="scroll"><table class="stages"><tr><th>Weeks</th><th>Stage</th><th>What happens</th><th>What we check</th></tr>${STAGES.map(st => { const on = before() && w >= st[0] && w <= st[1] || (!before() && st[0] === 15); return `<tr class="click ${on ? 'on' : ''}" data-act="go" data-d="${E.addDays(ds.event.planStart, 7 * st[1] - 1 > E.daysBetween(ds.event.planStart, ds.event.end) ? E.daysBetween(ds.event.planStart, ds.event.end) : 7 * st[1] - 1)}" tabindex="0"><td>${st[0] === st[1] ? st[0] : st[0] + '–' + st[1]}</td><td><b>${esc(st[2])}</b></td><td>${esc(st[3])}</td><td class="note">${esc(st[4])}</td></tr>`; }).join('')}</table></div>` : '';
  return `${head('Journey', 'Where we are in the plan, what was decided and what we are doing about it. Click a week or a checkpoint to jump there.')}${timeline()}${checkpointCard()}
  ${stages}
  <div class="two" style="margin-top:22px"><div class="card"><h2>How the forecast changed, week by week ${info('Each dot is the most likely number forecast on that date; the shaded band runs from bad luck to good luck. It narrows as real numbers replace guesses. Only dates up to the one you are viewing are shown.')}</h2><div class="fig"><svg id="fcChart" role="img" aria-label="Forecast by week"></svg></div>
    <div class="legend"><span><i style="border-color:#111418;border-top-width:3px"></i>Most likely</span><span><i class="sw" style="background:#2f6fed"></i>Bad to good luck</span><span><i style="border-color:#c8281e;border-top-style:dashed"></i>Target</span></div></div>
  <div class="card"><h2>Decided so far</h2>${doingList()}</div></div>`;
};
function doingList() {
  const D = S.asOf, b = baseOf();
  const plan = sim() ? E.planDecisionsAt(S.ds, D).slice().reverse().map(p => ({ d: p.decided_at, t: p.title, src: 'plan' })) : [];
  const mine = S.decisions.filter(d => (d.base || '25') === b && d.as_of <= D).map(d => ({ d: d.as_of, t: d.title, src: 'you' }));
  const all = mine.concat(plan).sort((x, y) => y.d.localeCompare(x.d));
  return all.length ? `<ul class="plain">${all.map(x => `<li><span class="note">${esc(dshort(x.d))}</span> ${esc(x.t)} <span class="label">${x.src}</span></li>`).join('')}</ul><p class="note"><a href="#tasks">Tasks and the decision log →</a></p>` : '<p class="empty">Nothing decided yet on this date. The first money decisions come at the week 10 review.</p>';
}
function fcPoints() {
  const ds = S.ds, cp = E.checkpoints(ds), D = S.asOf;
  const pts = dateOptions().map(o => o[0]).filter(d => d <= D && d <= cp.result).filter(d => fcAt(d).likely);
  return pts.map(d => ({ d, f: fcAt(d) }));
}
function drawJourney() {
  const pts = fcPoints(), t = fcAt(S.asOf); if (!pts.length) { const s = document.getElementById('fcChart'); if (s) s.parentNode.innerHTML = '<p class="empty">The forecast starts once 10% of registrations are in.</p>'; return; }
  const x = pts.map(p => p.d), tg = pts.map(() => t.target), st = t.stretch ? pts.map(() => t.stretch) : null;
  const series = [{ values: tg, color: '#c8281e', dash: '5 4', w: 1.5, label: 'target ' + fmt(t.target) }, { values: pts.map(p => p.f.likely), color: '#111418', w: 2.5, dots: true }];
  if (st && t.stretch < Math.max(...pts.map(p => p.f.good)) * 1.6) series.unshift({ values: st, color: '#7a8796', dash: '3 4', w: 1.2, label: 'stretch ' + fmt(t.stretch) });
  mount('fcChart', s => lineChart(s, { x, xl: d => dshort(d), series, bands: [{ lo: pts.map(p => p.f.bad), hi: pts.map(p => p.f.good), color: '#2f6fed' }] }));
}

PAGES.funnel = () => {
  const ds = S.ds, D = S.asOf, A = assump(), cid = S.funnelCamp === 'all' ? undefined : S.funnelCamp, f = E.funnelView(ds, D, A, cid), a = E.anonFunnel(ds, D, cid), l = !cid ? ly() : null;
  const top = Math.max(...f.steps.map(s => s.n || 0), 1), drop = f.steps.find(s => s.key === f.biggest_drop);
  const lyStep = k => l ? (l.f.steps.find(s => s.key === k) || {}).n : null;
  const cap = ds.event.gateCap || A.gate_capacity.value, dsx = E.dayStats(ds, D, A), fc = fcAt(D);
  const peak = started() && dsx.peak_hour ? dsx.peak_hour.entries : fc.likely ? expectedPeak(fc.likely) : null;
  const sub = `The same four steps for every year, each person counted once. ${drop ? `Biggest drop: <b>${esc(drop.label.toLowerCase())}</b>, ${pct(drop.from_prev)} of the step before.` : ''}`;
  return `${head('Funnel' + (cid ? ': ' + esc(f.campaign) : ''), sub)}
  <div class="row" style="margin-bottom:14px"><label class="l" style="min-width:260px">Campaign<select data-ch="funnelCamp">${campOptions(S.funnelCamp, true)}</select></label></div>
  <div class="card funnel">${f.steps.map(s => `<div class="r"><span>${esc(s.label)}${info(s.help)}</span><div class="b"><i class="${s.key === f.biggest_drop ? 'hot' : ''} ${s.expected ? 'est' : ''}" style="width:${((s.n || 0) / top * 100).toFixed(1)}%"></i></div><span class="x">${fmt(s.n)}${s.from_prev !== null ? ' · ' + pct(s.from_prev) : ''}</span></div>`).join('')}</div>
  <div class="scroll" style="margin-top:16px"><table><tr><th>Step</th><th class="n">People</th><th class="n">% of step before${info('Share of the people in the step above who reached this step.', true)}</th><th class="n">Cost each${info('Spend so far ÷ people at this step. It shows what each reached person, registration, confirmation and attendee costs.', true)}</th><th class="n">Target</th>${l ? `<th class="n">2025, same point${info('2025 at the same number of days before its fest.', true)}</th>` : ''}</tr>
  ${f.steps.map(s => `<tr><td>${esc(s.label)}${s.expected ? ' <span class="tag">est.</span>' : ''}</td><td class="n">${fmt(s.n)}</td><td class="n">${pct(s.from_prev)}</td><td class="n">${inr(s.cost_each)}</td><td class="n">${s.target ? fmt(s.target) + (s.pace ? `<div class="note">${fmt(s.pace)} by now</div>` : '') : '–'}</td>${l ? `<td class="n">${fmt(lyStep(s.key))}</td>` : ''}</tr>`).join('')}</table></div>
  ${!cid && f.walkins ? `<p class="note">Plus ${fmt(f.walkins)} people who came without registering: ${fmt(f.total_attended)} outside attendees in all.</p>` : ''}
  <p class="note" style="margin-top:12px">Before people leave their details (ads and links, counted as events, not people): ${fmt(a.impressions)} views → ${fmt(a.clicks)} clicks (${pct(a.ctr, 1)}) → ${fmt(a.sessions)} page visits → ${fmt(a.form_starts)} form starts.</p>`;
};

PAGES.campaigns = () => {
  const ds = S.ds, D = S.asOf, A = assump(), end = ended(), k = E.kpis(ds, D, A), cap = A.cost_cap.value, min = rules().min_people.value, bets = E.betRows(ds, D, A);
  const rows = E.campaignRows(ds, D, { assumptions: A }).filter(r => r.campaign_id || r.registered || r.visitors);
  const groups = hasBets() ? [['Channels', rows.filter(r => r.kind !== 'bet')], ['Bets (judged against a comparison group: see Bets)', rows.filter(r => r.kind === 'bet')]] : [['', rows]];
  const tr = r => { const [v, why] = verdict(r, end, k.showup, cap, min, bets), b = bets.find(x => x.campaign_id === r.campaign_id);
    const cost = b ? b.cost_per_extra : end ? r.cost_per_visitor : r.cost_per_expected_visitor;
    return `<tr class="${r.campaign_id ? 'click' : ''}" ${r.campaign_id ? `data-act="camp" data-id="${esc(r.campaign_id)}" tabindex="0"` : ''}><td><b>${esc(r.campaign)}</b>${r.status && r.status !== 'active' ? ` <span class="label">${esc(r.status)}</span>` : ''}<div class="note">${esc(r.owner)}${r.audience === 'our students' ? ' · our own students' : ''}</div></td>
    <td class="n">${money(r.spend)}${r.planned_budget_inr ? `<div class="note">of ${money(r.planned_budget_inr)}</div>` : ''}</td><td class="n">${fmt(r.registered)}</td><td class="n">${fmt(r.confirmed)}</td><td class="n">${end ? fmt(r.visitors) : fmt(r.expected_visitors)}</td>
    <td class="n">${r.spend && ok(cost) ? inr(cost) : '–'}${b ? '<div class="note">per extra</div>' : ''}</td><td><span class="${vcls(v)}">${esc(v)}</span><div class="note">${esc(why)}</div></td></tr>`; };
  return `${head('Campaigns', `${end ? 'Channels are judged on cost per attendee' : 'Channels are judged on cost per expected attendee'} against a ${inr(cap)} limit. Click a row to edit it.`)}
  <div class="row" style="margin-bottom:12px"><button class="btn" data-act="newcamp" type="button">Add campaign</button><button class="btn ghost" data-act="spend" type="button">Record spend</button></div>
  <div class="scroll"><table><tr><th>Campaign</th><th class="n">Spent</th><th class="n">Registered</th><th class="n">Confirmed${info('Said "I am coming".', true)}</th><th class="n">${end ? 'Came' : 'Will come (from today\'s sign-ups)'}${info(end ? 'Verified at the gate.' : 'Estimate: confirmed × 75% + unconfirmed × 55% (5% on fest eve) + waitlisted × 20%, from 2025 show-up.', true)}</th><th class="n">${end ? 'Cost per attendee' : 'Cost per attendee (est.)'}${info('Spent ÷ attendees. For bets it is spend ÷ extra attendees (beyond what the comparison group shows).', true)}</th><th>Verdict</th></tr>
  ${groups.map(([name, list]) => (name ? `<tr><td colspan="7" class="note" style="background:#fff;font-weight:600;padding-top:14px">${esc(name)}</td></tr>` : '') + list.map(tr).join('')).join('')}</table></div>
  <p class="note" style="margin-top:10px">A campaign's credit links a person to it; it does not prove the campaign caused the visit. Bets prove cause with a comparison group.</p>`;
};
PAGES.bets = () => {
  const ds = S.ds, D = S.asOf, A = assump(), rows = E.betRows(ds, D, A), rp = E.reservePlan(ds, D, A);
  if (!rows.length) return head('Bets', 'This dataset has no bets. Switch to the 2027 plan.');
  const ready = rp.suggestions, f = fcAt(D);
  const t = ready.length ? esc(ready.map(r => r.bet).join(' and ')) + (ready.length > 1 ? ' are' : ' is') + ' ready for reserve money' : ended() ? 'How the bets did' : 'No bet is ready for reserve money now';
  const plannedB = rows.reduce((a, b) => a + (b.planned_budget_inr || 0) - (b.reserve_released_inr || 0), 0), spentB = rows.reduce((a, b) => a + b.spend, 0), relB = rows.reduce((a, b) => a + (b.reserve_released_inr || 0), 0);
  const moneyLine = `<p class="moneyline"><b>Money on bets:</b> ${lakh(plannedB)} planned${relB ? ` + ${lakh(relB)} released from the reserve` : ''} · <b>${lakh(spentB)}</b> spent so far · reserve <b>${lakh(rp.reserve_left)}</b> left of ${lakh(rp.reserve_total)} ${info('Ambassadors get perks, not cash: a certificate and letter, a free pass plus 2 friends and a backstage meet. Money goes to a top-crew prize pool paid on verified check-ins, merch for captains with 10+ friends, and running costs. Click a bet for its breakdown.')}</p>`;
  return `${head(t, `Each bet runs in some colleges (test) and is compared with similar colleges that don't get it (comparison). The gap is the bet's extra people.`)}${moneyLine}
  <div class="scroll"><table><tr><th>Bet</th><th class="n">Spent / planned</th><th class="n">Registered: test vs comparison${info('Share of people in each group who registered.', true)}</th><th class="n">Is the gap real?${info('How likely the gap is real and not luck. High = 90%+ likely, Medium = 80–90%, Low = under 80%. ₹1L releases need High; ₹50k needs at least Medium.', true)}</th><th class="n">Extra attendees${info('People in test colleges × (test rate − comparison rate) × the chance each registrant comes. Range: from the low to the high end of the gap.', true)}</th><th class="n">Cost per extra</th><th class="n">Next extra / limit${info('What the next extra person would cost if we add money. Returns shrink as spend grows, so it costs more than the average so far. Money only goes in while this is under the limit.', true)}</th><th>Decision</th></tr>
  ${rows.map(b => `<tr class="click" data-act="bet" data-id="${esc(b.campaign_id)}" tabindex="0"><td><b>${esc(b.rank + '. ' + b.bet)}</b><div class="note">${esc(b.owner)} · ${esc(b.type)}${b.audience === 'our students' ? ' · our students' : ''}</div></td>
  <td class="n">${money(b.spend)}<div class="note">of ${money(b.planned_budget_inr)}${b.reserve_released_inr ? ' (incl. ' + lakh(b.reserve_released_inr) + ' reserve)' : ''}</div></td>
  <td class="n">${b.test_rate !== null ? pct(b.test_rate) + ' vs ' + pct(b.comparison_rate) : fmt(b.test_registered) + ' sign-ups'}<div class="note">${b.test_rate !== null ? fmt(b.test_people) + ' vs ' + fmt(b.comparison_people) + ' people' : 'no comparison group'}</div></td>
  <td class="n">${b.gap_real ? `<span class="g-${b.gap_real}">${b.gap_real}</span>` : '<span class="note">no comparison</span>'}</td><td class="n">${b.expected_extra_low !== null ? `${fmt(Math.max(0, b.expected_extra_attendees))}<div class="note">${fmt(b.expected_extra_low)}–${fmt(b.expected_extra_high)}</div>` : fmt(b.expected_extra_attendees) + '<div class="note">all sign-ups</div>'}</td><td class="n">${inr(b.cost_per_extra)}</td><td class="n">${inr(b.next_tranche_cost)} / ${inr(b.cost_cap_inr)}</td>
  <td><span class="${vcls(b.decision)}">${esc(b.decision)}</span><div class="note">${esc(b.decision === 'Too early' ? b.evidence_gaps[0] : BET_NOTE[b.decision])}</div></td></tr>`).join('')}</table></div>
  ${ready.length ? `<div class="card" style="margin-top:18px"><h2>Suggested reserve release</h2>${ready.map(r => { const a = fcAt(D, [{ amount: r.amount, cost: r.next_tranche_cost }]); return `<div class="flag"><div class="t">${esc(r.bet)}: release ${lakh(r.amount)}</div><div class="e">Next extra person ≈ ${inr(r.next_tranche_cost)} vs a ${inr(r.cap)} limit · gap ${esc(r.gap_real)}. Forecast: most likely ${fmt(f.likely)} → <b>${fmt(a.likely)}</b>, ${pill(f.verdict)} → ${pill(a.verdict)}</div><button class="btn sm" data-act="release" data-id="${esc(r.campaign_id)}" data-amt="${r.amount}" type="button">Release ${esc(lakh(r.amount))}</button></div>`; }).join('')}<p class="note" style="margin-top:8px">Rule: ${esc(rp.rule)}</p></div>` : ''}
  <details style="margin-top:18px"><summary>How a bet is judged, in four steps</summary><ol><li><b>Fair test?</b> 300+ people in each group and 2+ weeks live. If not: Too early.</li><li><b>Real gap?</b> At least 80% likely. If not, after a fair test: Stop.</li><li><b>Worth it?</b> Cost per extra attendee under the bet's limit. If not: Change.</li><li><b>More money?</b> If the next extra attendee is also under the limit: Scale (gets reserve). Otherwise Keep.</li></ol></details>`;
};
function betDrawer(id) {
  const b = E.betRows(S.ds, S.asOf, assump()).find(x => x.campaign_id === id); if (!b) return '';
  const c = S.ds.camps.get(id) || {};
  const plan = c.plan_idea ? `<dl class="qa plan"><dt>The idea</dt><dd>${esc(c.plan_idea)}</dd><dt>Why it should work</dt><dd>${esc(c.plan_why)}</dd><dt>How we test it</dt><dd>${esc(c.plan_test)}</dd><dt>Money</dt><dd>${inr(b.planned_budget_inr - (b.reserve_released_inr || 0))} planned${b.reserve_released_inr ? ' + ' + inr(b.reserve_released_inr) + ' reserve' : ''}. ${esc(c.budget_breakdown || '')}</dd><dt>Stop rule</dt><dd>${esc(c.stop_rule)}</dd></dl>` : `<p>${esc(b.test_design)}</p>`;
  return `${plan}<h3 style="margin-top:14px">How it is doing on ${esc(dshort(S.asOf))}</h3><p style="margin-top:4px"><span class="${vcls(b.decision)}">${esc(b.decision)}</span>: ${esc(b.why)}.</p><table><tr><td>Live for</td><td class="n">${b.weeks_live} weeks</td></tr><tr><td>Spent / planned</td><td class="n">${inr(b.spend)} / ${inr(b.planned_budget_inr)}</td></tr>${b.reserve_released_inr ? `<tr><td>Reserve released</td><td class="n">${inr(b.reserve_released_inr)}</td></tr>` : ''}
  <tr><td>Test group</td><td class="n">${fmt(b.test_registered)} of ${fmt(b.test_people)}${b.test_rate !== null ? ' (' + pct(b.test_rate, 1) + ')' : ''}</td></tr>${b.comparison_people !== null ? `<tr><td>Comparison group</td><td class="n">${fmt(b.comparison_registered)} of ${fmt(b.comparison_people)} (${pct(b.comparison_rate, 1)})</td></tr><tr><td>Gap</td><td class="n">${pct(b.lift, 1)} · ${esc(b.gap_real)}</td></tr>` : ''}
  <tr><td>Extra registrations</td><td class="n">${fmt(b.extra_registrations)}</td></tr><tr><td>Chance each registrant comes (est.)</td><td class="n">${ok(b.attendees_per_registrant) ? pct(b.attendees_per_registrant) : '–'}</td></tr><tr><td>Extra attendees (est.)</td><td class="n">${fmt(b.expected_extra_attendees)}${b.expected_extra_low !== null ? ' (' + fmt(b.expected_extra_low) + '–' + fmt(b.expected_extra_high) + ')' : ''}</td></tr>
  <tr><td>Cost per extra attendee</td><td class="n">${inr(b.cost_per_extra)}</td></tr><tr><td>Next extra attendee (÷ ${b.scale_factor} for shrinking returns)</td><td class="n">${inr(b.next_tranche_cost)}</td></tr><tr><td>Limit</td><td class="n">${inr(b.cost_cap_inr)}</td></tr></table>
  <div class="row" style="margin-top:12px"><button class="btn" data-act="draft" data-kind="task" data-camp="${esc(id)}" type="button">Create a task</button><button class="btn ghost" data-act="ask" data-q="${esc('Explain the ' + b.bet + ' bet: is it working and what should we do with it?')}" type="button">Ask the analyst</button></div>`;
}

PAGES.insights = () => {
  const ds = S.ds, D = S.asOf, A = assump(), fl = E.flags(ds, D, rules(), A), g = groupFlags(fl), end = ended();
  const bets = hasBets() ? E.betRows(ds, D, A) : [], rows = E.campaignRows(ds, D, { assumptions: A }).filter(r => r.campaign_id && r.kind !== 'bet' && r.status !== 'stopped'), cap = A.cost_cap.value;
  const work = bets.filter(b => b.decision === 'Scale' || b.decision === 'Keep').map(b => ({ n: b.bet, r: b.decision === 'Scale' ? `${fmt(b.expected_extra_attendees)} extra attendees at ${inr(b.cost_per_extra)} each; the next one ≈ ${inr(b.next_tranche_cost)}, under its ${inr(b.cost_cap_inr)} limit` : `${fmt(b.expected_extra_attendees)} extra attendees at ${inr(b.cost_per_extra)} each, under its ${inr(b.cost_cap_inr)} limit`, why: b.test_rate !== null ? `Test colleges registered at ${pct(b.test_rate)} vs ${pct(b.comparison_rate)} in similar colleges without it (gap ${b.gap_real}).` : 'All its sign-ups count (no comparison group).' }))
    .concat(rows.filter(r => { const c = end ? r.cost_per_visitor : r.cost_per_expected_visitor; return ok(c) && c <= cap && (end ? r.visitors : r.expected_visitors) >= 30; }).map(r => { const c = end ? r.cost_per_visitor : r.cost_per_expected_visitor; return { n: r.campaign, r: `${inr(c)} per ${end ? '' : 'expected '}attendee, under the ${inr(cap)} limit`, why: `${fmt(r.registered)} registered, ${fmt(end ? r.visitors : r.expected_visitors)} ${end ? 'came' : 'expected'}. Credit is a link, not proof of cause.` }; }));
  const notw = g.filter(x => x.level !== 'watch'), early = g.filter(x => x.level === 'watch');
  const item = x => `<div class="flag"><div class="t"><span class="lvl ${x.level}">${x.level}</span>${esc(x.subj)}</div>${x.items.map(f => `<div class="e">${esc(f.reason)}</div>`).join('')}${actButtons(x.items[0], true)}</div>`;
  return `${head('Insights', 'What is working, what is not, and why. <b>Act</b> = decide now · <b>Warn</b> = owner fixes it this week · <b>Watch</b> = keep an eye on it. Groups under 30 people are not judged.')}<p class="note" style="margin:-8px 0 14px">${sim() ? 'The rules (limits and thresholds) are ours, from the plan. The 2027 data is simulated: a few problems were built in so the week 10 review has decisions to make (Paid Social, Volunteers, Day Scholars); the rest come out of the simulation.' : 'The rules (limits and thresholds) are ours; every flag here comes from the real 2025 data.'}</p>
  <div class="three"><div class="card"><h2 class="good">Working</h2>${work.length ? work.map(w => `<div class="flag"><div class="t">${esc(w.n)}</div><div class="e">${esc(w.r)}</div><div class="e">${esc(w.why)}</div></div>`).join('') : '<p class="empty">Nothing proven yet.</p>'}</div>
  <div class="card"><h2 class="bad">Not working</h2>${notw.length ? notw.map(item).join('') : '<p class="empty">Nothing at Warn or Act.</p>'}</div>
  <div class="card"><h2>Watch / too early</h2>${early.length ? early.map(item).join('') : '<p class="empty">Nothing to watch.</p>'}</div></div>`;
};

PAGES.money = () => {
  const ds = S.ds, D = S.asOf, A = assump(), b = E.budget(ds, D), end = ended(), cap = A.cost_cap.value;
  const rows = E.campaignRows(ds, D, { assumptions: A }).filter(r => r.campaign_id), bets = hasBets() ? E.betRows(ds, D, A) : [];
  const plannedLeft = rows.reduce((a, r) => a + Math.max(0, (r.status === 'stopped' ? r.spend : (r.planned_budget_inr || 0)) - r.spend), 0);
  const resLeft = hasBets() ? E.reserveLeft(ds, D) : 0, free = Math.max(0, b.approved - b.spent - plannedLeft - resLeft);
  const seg = [['Spent', b.spent, '#111418'], ['Planned, not yet spent', plannedLeft, '#9aa3ad'], ['Reserve not released', resLeft, '#2f6fed'], ['Not planned', free, '#e6e8eb']].filter(x => x[1] > 0);
  const ppl = r => { const bt = bets.find(x => x.campaign_id === r.campaign_id); return bt ? Math.max(0, bt.expected_extra_attendees) : end ? r.visitors : r.expected_visitors; };
  const each = r => { const bt = bets.find(x => x.campaign_id === r.campaign_id); return bt ? bt.cost_per_extra : end ? r.cost_per_visitor : r.cost_per_expected_visitor; };
  const limit = r => r.cost_cap_inr || cap, mxS = Math.max(...rows.map(r => r.spend), 1), mxP = Math.max(...rows.map(ppl), 1);
  const log = (sim() ? E.planDecisionsAt(ds, D).filter(p => ['release_reserve', 'hold', 'set_planned_budget', 'stop'].includes(p.kind)).map(p => ({ d: p.decided_at, t: p.title, src: 'plan' })) : [])
    .concat(S.decisions.filter(d => (d.base || '25') === baseOf() && d.as_of <= D && ['release_reserve', 'move_budget', 'set_planned_budget'].includes(d.kind)).map(d => ({ d: d.as_of, t: d.title, src: 'you' }))).sort((x, y) => x.d.localeCompare(y.d));
  const best = bets.filter(x => x.decision === 'Scale').sort((x, y) => x.next_tranche_cost - y.next_tranche_cost)[0];
  return `${head('Money', `Where each rupee went and what it is bringing back. Budget ${lakh(b.approved)}${hasBets() ? `, including a ${lakh(ds.event.reserve)} reserve held back for bets that prove themselves` : ''}.`)}
  <div class="card"><h2>The budget today ${info('Spent = net marketing spend so far. Planned = what each campaign still has in its plan. Reserve = money only released to proven bets at the reviews.')}</h2><div class="stackbar">${seg.map(([l, v, c]) => `<i style="width:${(v / b.approved * 100).toFixed(2)}%;background:${c}" title="${esc(l + ': ' + lakh(v))}"></i>`).join('')}</div>
  <div class="legend">${seg.map(([l, v, c]) => `<span><i class="sw" style="background:${c}"></i>${esc(l)} <b>${lakh(v)}</b></span>`).join('')}</div></div>
  <div class="card" style="margin-top:16px"><h2>Money in, people out ${info(end ? 'Left: spend. Right: people who came (for bets: extra attendees beyond the comparison group). Red cost = above its limit.' : 'Left: spend so far. Right: expected attendees (for bets: extra attendees beyond the comparison group). Red cost = above its limit.')}</h2>
  <div class="fly"><div class="fh"><span>Spent</span><span></span><span>${end ? 'Attendees' : 'Expected attendees'}</span><span>Each</span></div>
  ${rows.map(r => { const c = each(r), bt = bets.find(x => x.campaign_id === r.campaign_id), early = bt && bt.decision === 'Too early', over = !early && ok(c) && c > limit(r); return `<div class="fr2"><div class="lb"><i style="width:${(r.spend / mxS * 100).toFixed(1)}%"></i><span>${money(r.spend)}</span></div><div class="nm">${esc(r.campaign)}${r.status === 'stopped' ? ' <span class="label">stopped</span>' : ''}${r.kind === 'bet' ? '<span class="note"> · extra</span>' : ''}</div><div class="rb"><i style="width:${(ppl(r) / mxP * 100).toFixed(1)}%"></i><span>${fmt(ppl(r))}</span></div><div class="ce ${over ? 'over' : ''}">${early ? '<span class="note">too early</span>' : ok(c) && r.spend ? inr(c) : '–'}<span class="note"> / ${inr(limit(r))}</span></div></div>`; }).join('')}</div></div>
  ${hasBets() ? `<div class="card" style="margin-top:16px"><h2>Reserve: who got it and why</h2>${log.length ? `<ul class="plain">${log.map(x => `<li><span class="note">${esc(dshort(x.d))}</span> ${esc(x.t)} <span class="label">${x.src}</span></li>`).join('')}</ul>` : '<p class="empty">Nothing released yet. Releases happen at the reviews (weeks 10, 12, 14).</p>'}
  <p class="note">${best ? `The next ₹1L would go to ${esc(best.bet)}: about ${fmt(100000 / best.next_tranche_cost * 0.8)} extra attendees (est.; ${fmt(100000 / best.next_tranche_cost * 0.5)}–${fmt(100000 / best.next_tranche_cost)}), with the next one costing ≈ ${inr(best.next_tranche_cost)}.` : 'No bet is under its limit for the next rupee right now, so the reserve stays put.'}</p></div>` : ''}`;
};

PAGES.tasks = () => {
  const b = baseOf(), D = S.asOf, tasks = S.tasks.filter(t => (t.base || '25') === b).sort((x, y) => (tStatus(x) === 'done') - (tStatus(y) === 'done') || (x.due || '').localeCompare(y.due || ''));
  const decs = S.decisions.filter(d => (d.base || '25') === b).sort((x, y) => (y.created_at || '').localeCompare(x.created_at || ''));
  const plan = sim() ? E.planDecisionsAt(S.ds, D).slice().reverse() : [];
  const st = { todo: 'To do', doing: 'Doing', done: 'Done' };
  return `${head('Tasks', 'Who is doing what, and the decisions behind it. Edit any cell; it saves straight away.')}
  ${S.review ? reviewPanel(S.review) : ''}
  <form class="addt" data-form="addtask"><input name="title" placeholder="New task…" required maxlength="160" aria-label="New task"><select name="owner" aria-label="Owner">${ownerOptions('GL')}</select><input type="date" name="due" value="${esc(E.addDays(D, 3))}" aria-label="Due"><button class="btn" type="submit">Add</button></form>
  <div class="scroll"><table class="tasks"><tr><th>Task</th><th style="width:200px">Owner</th><th style="width:150px">Due</th><th style="width:110px">Status</th><th style="width:80px"></th></tr>
  ${tasks.length ? tasks.map(t => { const ts = tStatus(t); return `<tr class="${ts === 'done' ? 'done' : t.due && t.due < D ? 'late' : ''}"><td><input data-t="${esc(t.id)}" data-f="title" value="${esc(t.title)}" aria-label="Task">${t.source && t.source !== 'manual' ? `<div class="note">from ${esc(t.source === 'plan' ? 'the plan' : t.source === 'signal' ? 'a signal' : t.source)}${t.campaign_id ? ' · ' + esc(E.campName(S.ds, t.campaign_id)) : ''}</div>` : ''}</td>
  <td><select data-t="${esc(t.id)}" data-f="owner" aria-label="Owner">${ownerOptions(t.owner)}</select></td><td><input type="date" data-t="${esc(t.id)}" data-f="due" value="${esc(t.due || '')}" aria-label="Due">${ts !== 'done' && t.due && t.due < D ? '<div class="note" style="color:var(--act)">late</div>' : ts !== t.status ? '<div class="note">done in the rehearsal</div>' : ''}</td>
  <td><select data-t="${esc(t.id)}" data-f="status" aria-label="Status">${Object.keys(st).map(k => `<option value="${k}" ${ts === k ? 'selected' : ''}>${st[k]}</option>`).join('')}</select></td><td><button class="btn ghost sm" data-act="tdel" data-id="${esc(t.id)}" type="button" aria-label="Delete task">Delete</button></td></tr>`; }).join('') : '<tr><td colspan="5" class="empty">No tasks yet.</td></tr>'}</table></div>
  <h2 style="margin-top:26px">Decision log ${info('Every confirmed action is logged with the number it should move. On its review date we compare that number then and now. A before/after reading is a hint, not proof the action caused it.')}</h2>
  ${decs.length || plan.length ? `<div class="scroll"><table><tr><th>Decided</th><th>Decision</th><th>Watching</th><th class="n">Then</th><th class="n">Now</th><th>Result</th></tr>
  ${decs.map(d => `<tr><td>${esc(dshort(d.as_of))}</td><td>${esc(d.title)}</td><td class="note">${esc(metricLabel(d.metric))}<br>review ${esc(dshort(d.review_date))}</td><td class="n">${esc(mfmt(d.metric, d.metric && d.metric.before))}</td><td class="n">${esc(mfmt(d.metric, metricNow(d.metric)))}</td><td>${d.status === 'reviewed' ? esc(d.outcome) : d.review_date && D >= d.review_date ? `<button class="btn sm" data-act="review" data-id="${esc(d.id)}" type="button">Review</button>` : '<span class="note">waiting</span>'}</td></tr>`).join('')}
  ${plan.map(p => { const m = p.metric_key && METRICS[p.metric_key] ? { key: p.metric_key, campaign_id: p.campaign_id || null } : null, then = m ? metricValue(S.ds, E.addDays(p.decided_at.slice(0, 10), -1), m) : null, now = m ? metricNow(m) : null, rv = p.review_at && D >= p.review_at.slice(0, 10); return `<tr><td>${esc(dshort(p.decided_at))} <span class="label">plan</span></td><td>${esc(p.title)}<div class="note">${esc(p.reason)}</div></td><td class="note">${m ? esc(metricLabel(m)) : '–'}<br>review ${esc(dshort(p.review_at))}</td><td class="n">${esc(mfmt(m, then))}</td><td class="n">${esc(mfmt(m, now))}</td><td>${rv ? esc(planOutcome(m, then, now)) : '<span class="note">waiting</span>'}</td></tr>`; }).join('')}</table></div>` : '<p class="empty">No decisions yet. Use "Act on this" on Overview or Insights, or release reserve on the Bets page.</p>'}
  <p class="note" style="margin-top:10px">To see a follow-up now: act on something, then move the date forward past its review date.</p>`;
};
function planOutcome(m, then, now) {
  if (!m || !ok(then) || !ok(now)) return 'Reviewed';
  const lowerBetter = /cost|rate/.test(m.key), better = lowerBetter ? now < then : now > then;
  return (better ? 'Moved the right way' : 'No improvement') + ' (' + mfmt(m, then) + ' → ' + mfmt(m, now) + ')';
}
const METRICS = { registered: 'Registered', confirmed: 'Confirmed', expected_visitors: 'Expected attendees', cost_per_expected_visitor: 'Cost per expected attendee', cost_per_visitor: 'Cost per attendee', showup: 'Show-up', cancel_rate: 'Cancellation rate', opt_out_rate: 'Opt-out rate', spend: 'Spend', expected_extra_attendees: 'Extra attendees (bet)', cost_per_extra: 'Cost per extra attendee (bet)' };
function metricLabel(m) { return m && m.key ? METRICS[m.key] + ' · ' + (m.campaign_id ? E.campName(S.ds, m.campaign_id) : 'all') : '–'; }
function metricValue(ds, D, m) {
  if (!m || !m.key) return null; const A = assump();
  if (m.key === 'expected_extra_attendees' || m.key === 'cost_per_extra') { const b = E.betRows(ds, D, A).find(x => x.campaign_id === m.campaign_id); return b ? b[m.key] : null; }
  if (m.campaign_id) { const r = E.campaignRows(ds, D, { assumptions: A }).find(x => x.campaign_id === m.campaign_id); return r ? r[m.key] : null; }
  const k = E.kpis(ds, D, A); return { registered: k.registered, confirmed: k.status.confirmed, expected_visitors: k.projection.likely, cost_per_visitor: k.costPerVisitor, cost_per_expected_visitor: k.costPerAttendee, showup: k.showup, spend: k.spend, cancel_rate: k.registered ? k.status.cancelled / k.registered : null }[m.key];
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
  if (D < ds.event.eventStartDay || !d.verified_entries) return head('Fest days', 'No check-ins at this date. Move the date to the fest days.');
  const hrs = d.hours; setTimeout(() => mount('hourChart', s => colChart(s, { labels: hrs.map(h => h.hour), values: hrs.map(h => h.entries), cap: cap <= Math.max(...hrs.map(h => h.entries)) * 3 ? cap : null, capLabel: 'safe gate capacity ' + fmt(cap) + '/hr', short: l => l.slice(8, 10) + ' ' + l.slice(11, 13) + 'h' })), 0);
  return `${head(`${fmt(d.unique_visitors)} outside visitors; busiest hour ${d.peak_hour ? fmt(d.peak_hour.entries) + ' entries at ' + esc(d.peak_hour.hour.slice(11)) + ', ' + esc(dshort(d.peak_hour.hour)) : '–'}`, 'Verified gate entries by hour. Growth flags gate load; security and operations decide on the day.')}
  <div class="kpis">${d.by_day.map(x => kpi(dshort(x.day), fmt(x.unique_visitors), 'unique visitors')).join('')}${kpi('Both days', fmt(d.both_days), pct(d.unique_visitors ? d.both_days / d.unique_visitors : null) + ' of visitors')}${kpi('Busiest hour vs gates', pct(d.peak_vs_capacity), 'safe ' + fmt(cap) + ' per hour', 'Entries in the busiest hour ÷ what the gates can safely take in an hour.')}</div>
  <div class="card"><h2>Verified entries per hour</h2><div class="fig" style="min-height:240px"><svg id="hourChart" role="img" aria-label="Entries per hour"></svg></div></div>`;
};

PAGES.data = () => {
  const ds = S.ds, q = E.quality(ds, S.asOf), A = assump(), hist = S.edits.filter(e => (e.base || '25') === baseOf()).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return `${head('Data', 'What you are looking at, where the numbers come from, and how to change them.')}
  <div class="card" style="margin-bottom:14px"><h2>Two datasets</h2>
  <p><b>2027 plan (simulated)</b>: our plan for CampusFest 2027 in New Delhi. Week 1 starts 16 Nov 2026; competition registrations open in week 2 and passes in week 3 (30 Nov, 82 days out, like 2025); week 8 (4 Jan) is the big push; the fest is Fri–Sat 26–27 Feb 2027 (week 15). Campaigns, bets, owners, budgets, limits and targets come from the plan. People, registrations, spend and check-ins are generated to test it; they are not real.</p>
  <p><b>"Today" is the end of week 10</b> (24 Jan), the first money review: we stop there on purpose to show the decision with only the data known then. Dates after it are a rehearsal: one realistic run where the team takes the plan's decisions on time. It is not the best case: one bet fails, scaled bets do worse than their tests, and ₹1.5L of reserve stays unspent.</p>
  <p><b>2025 actual</b>: the provided dataset, locked. Your changes are saved as edits on top of it; the button next to the dataset switches between the original and your edits.</p>
  ${q.validation.errors.length ? `<p style="color:var(--act)">Problems: ${esc(q.validation.errors.join('; '))}</p>` : ''}</div>
  <details open><summary>Assumptions behind every estimate</summary><div class="scroll"><table><tr><th>Assumption</th><th class="n">Used</th><th class="n">Range in the forecast</th><th>Why we believe it</th></tr>${['showup_confirmed', 'showup_interested', 'showup_interested_late', 'showup_waitlisted', 'walkin_share', 'future_regs', 'release_yield', 'scale_factor'].map(k => { const a = A[k], p = k === 'future_regs' || k === 'scale_factor' || k === 'release_yield' ? v => '×' + v : v => pct(v); return `<tr><td>${esc(a.label)}</td><td class="n">${esc(p(a.value))}</td><td class="n">${esc(p(a.low))}–${esc(p(a.high))}</td><td class="note">${esc(a.evidence)}</td></tr>`; }).join('')}</table></div>
  <p class="note">The gate limit is ${fmt(ds.event.gateCap || A.gate_capacity.value)} entries an hour for this dataset (${ds.event.gateCap ? '6 QR lanes at ~420 scans an hour each' : '2025 venue'}). Thresholds for Watch / Warn / Act are fixed in the plan.</p></details>
  <details><summary>What the words mean</summary><table>
  <tr><td><b>Outside people</b></td><td>Students and visitors not from our own college. Staff, internal and test entries never count.</td></tr>
  <tr><td><b>Registered / Confirmed</b></td><td>Signed up / said "I'm coming".</td></tr>
  <tr><td><b>Came / attendee</b></td><td>Scanned in at the gate and verified. Counted once per person.</td></tr>
  <tr><td><b>Forecast</b></td><td>The fest played 1,000 times with different luck. Bad luck: 1 in 10 runs did worse. Good luck: 1 in 10 did better.</td></tr>
  <tr><td><b>Safe / Ahead, not safe yet / Off track</b></td><td>Even bad luck beats the target / most likely beats it, bad luck doesn't / most likely misses it.</td></tr>
  <tr><td><b>Bet / test / comparison</b></td><td>A new idea, tried in some colleges (test) and compared with similar colleges that don't get it (comparison).</td></tr>
  <tr><td><b>Is the gap real?</b></td><td>How likely the test-vs-comparison gap is real, not luck: High 90%+, Medium 80–90%, Low under 80%.</td></tr>
  <tr><td><b>Next extra</b></td><td>What the next extra person would cost if we add money. Returns shrink, so it costs more than the average so far.</td></tr>
  <tr><td><b>Limit (cap)</b></td><td>The most we will pay for one extra person in that bet or channel.</td></tr>
  <tr><td><b>Reserve</b></td><td>₹4.5L held back and only released at the reviews to bets that prove themselves.</td></tr>
  <tr><td><b>Act / Warn / Watch</b></td><td>Decide now / owner fixes it this week / keep an eye on it.</td></tr></table></details>
  <details><summary>Edit history (${hist.length})</summary>${hist.length ? `<div class="scroll"><table><tr><th>When</th><th>Change</th><th></th></tr>${hist.map(e => `<tr style="${e.undone ? 'opacity:.45' : ''}"><td class="note">${esc(new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td><td>${esc(describeEdit(e))}${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}</td><td><button class="btn ghost sm" data-act="undo" data-id="${esc(e.id)}" type="button">${e.undone ? 'Redo' : 'Undo'}</button></td></tr>`).join('')}</table></div>` : '<p class="empty">No edits on this dataset.</p>'}</details>
  <details><summary>Change records (to test with changed data)</summary><div class="stack">
    <form class="f" data-form="status"><h3>Registration status</h3><div class="fr"><label class="l">Registration ID<input name="rid" required placeholder="e.g. R00002"></label><label class="l">New status<select name="status"><option>confirmed</option><option>interested</option><option>waitlisted</option><option>cancelled</option></select></label><label class="l">Effective<input type="datetime-local" name="t" value="${esc(S.asOf)}T12:00" required></label></div><button class="btn" type="submit">Save</button></form>
    <form class="f" data-form="checkin"><h3>Check-in</h3><div class="fr"><label class="l">Person ID<input name="person_id" required></label><label class="l">Time<input type="datetime-local" name="t" value="${esc(ds.event.eventStartDay)}T14:00" required></label></div><button class="btn" type="submit">Save</button></form>
    <form class="f" data-form="target"><h3>New target version</h3><div class="fr"><label class="l">Starts on<input type="date" name="date" value="${esc(S.asOf)}" required></label><label class="l">Name<input name="name" required value="Revised plan"></label><label class="l">Registrations<input type="number" name="r" min="0" required></label><label class="l">Outside attendees<input type="number" name="v" min="0" required></label><label class="l">Budget (₹)<input type="number" name="b" min="0" required></label></div><button class="btn" type="submit">Save</button></form></div></details>
  <details><summary>Counting rules and cleaning</summary><ul>${q.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul><p class="note">${Object.keys(q.duplicates_removed).filter(k => q.duplicates_removed[k]).map(k => q.duplicates_removed[k] + ' repeated ' + E.SHEETS[k] + ' rows removed').join(' · ') || 'No repeated rows.'} ${Object.keys(q.excluded_people).map(k => q.excluded_people[k] + ' ' + k + ' people excluded').join(' · ')}</p></details>
  ${testPanel()}`;
};
function describeEdit(e) {
  const p = e.payload || {}, cn = id => E.campName(S.ds, id);
  switch (e.type) {
    case 'campaign_update': return cn(p.campaign_id) + ': ' + Object.keys(p.fields || {}).filter(k => k !== 'owner_name' && k !== 'reserve_released_at').map(k => ({ planned_budget_inr: 'planned budget', reserve_released_inr: 'reserve released', owner_id: 'owner' }[k] || k) + ' → ' + (k === 'owner_id' ? ownerLabel(p.fields[k]) : /inr/.test(k) ? inr(p.fields[k]) : p.fields[k])).join(', ');
    case 'campaign_add': return 'New campaign: ' + p.campaign_name;
    case 'spend_add': return 'Spend ' + inr(p.marketing_spend_inr) + ' on ' + cn(p.campaign_id) + ', ' + dshort(p.activity_date);
    case 'status_change': return 'Registration ' + p.registration_id + ' → ' + p.status;
    case 'checkin_add': return 'Check-in for ' + p.person_id;
    case 'target_add': return 'Target version "' + p.target_version + '" from ' + dshort(p.effective_at);
    default: return e.type;
  }
}

/* ---------- "Understand this page": five questions per page, answered with live numbers ---------- */
const EXPLAIN = {
  overview: () => { const D = S.asOf, f = fcAt(D), k = E.kpis(S.ds, D, assump()), l = ly(), g = groupFlags(E.flags(S.ds, D, rules(), assump())).filter(x => x.level !== 'watch'); return [
    ['Are we on track for the target?', f.mode === 'actual' ? `The fest is over: ${fmt(k.visitors)} outside attendees vs a ${fmt(f.target)} target (${f.verdict}).` : f.likely ? `${f.verdict}. Most likely ${fmt(f.likely)} outside attendees vs a ${fmt(f.target)} target; with bad luck ${fmt(f.bad)}, with good luck ${fmt(f.good)}. Safe means even bad luck beats the target.` : 'Too early: too few sign-ups yet, so any forecast would be a guess.'],
    ['Are we doing better than last year?', l ? `At the same point in 2025 (${dshort(l.D)}): ${fmt(l.k.registered)} registered and ${lakh(l.k.spend)} spent. Now: ${fmt(k.registered)} registered (${fmt(k.competitors)} of them in competition teams), ${lakh(k.spend)} spent. 2025 ended with ${fmt(E.kpis(l.ds, l.ds.event.end).visitors)} outside attendees.` : sim() ? 'Last year\'s data is still loading.' : 'This is the 2025 data itself; switch to the 2027 plan to compare against it.'],
    ['Which numbers matter, and why these?', 'The brief asks us to measure the funnel, targets vs actuals, conversion, budget and the projected outcome. The four boxes are the headline; the scorecard is the full funnel from responded to attended, plus our own students and money. Campaigns show which ones earn their money.'],
    ['Why two attendee numbers?', 'All attendees (outside people plus our own students) is the number we promise: 12,300. Outside attendees (4,800) is the part marketing grows and the only part 2025\'s data lets us compare. Our own students mostly come anyway, so outside growth is the proof the strategy works.'],
    ['How is "Heading for" worked out, and why trust it?', 'We play the fest 1,000 times, each time drawing every uncertain input from its range: show-up by status (2025: 73–77% of confirmed people came), sign-ups still to come (2025\'s curve), walk-ins (6% in 2025). It is a weather forecast, not a promise: the inputs are on the Data page, and the band narrows as real numbers replace guesses.']]; },
  journey: () => [
    ['Why does the plan stop at week 10?', sim() ? 'Week 10 is "today" in our story and the first money review: about half of all sign-ups are in and the bets have run for weeks, so they can be judged fairly. We stop there to show the decision with only what was known that day. Later dates are a labelled rehearsal.' : 'This is 2025: the review point marks the same distance before the fest as our 2027 week 10 review.'],
    ['Why open registrations so early?', sim() ? 'Competition teams need weeks to prepare, so they open in week 2. Passes open in week 3, 82 days out, the same as 2025, so we can use 2025\'s real sign-up curve as our plan. Week 8 is the big marketing push, not the opening.' : '2025 opened registrations 82 days before its fest.'],
    ['What happens at each checkpoint?', 'Week 10 review: stop what failed, release reserve to bets that pass the money rule. Fest eve: check the forecast, confirmations, gates and waitlist. Result: compare what came with what we forecast earlier.'],
    ['What has been decided so far?', (() => { const p = sim() ? E.planDecisionsAt(S.ds, S.asOf) : []; return p.length ? p.map(x => dshort(x.decided_at) + ': ' + x.title).join('; ') + '.' : 'Nothing yet on this date.'; })()],
    ['Is the rehearsal a happy ending?', sim() ? 'No. One bet (Day Scholar Turnout) fails and is stopped, scaled bets do worse than their tests, and at week 14 no bet passes the money rule, so ₹1.5L of reserve is never spent.' : '–']],
  funnel: () => { const f = E.funnelView(S.ds, S.asOf, assump()), dr = f.steps.find(s => s.key === f.biggest_drop), at = f.steps[3]; return [
    ['Where do we lose the most people?', dr ? `${dr.label}: only ${pct(dr.from_prev)} of the step before make it. ${dr.key === 'registered' ? 'Most people who respond never sign up; that is normal for a fest, so the work is on who we reach and how easy sign-up is.' : dr.key === 'confirmed' ? 'Sign-ups who have not confirmed come far less often, so confirm-your-spot reminders matter.' : 'Confirmed people still miss the fest; reminders, group passes and entry windows help.'}` : 'Not enough data yet.'],
    ['Why count people, not clicks?', 'Clicks and views are events: one person can make many. Attendance is people, so every step counts each person once. Ad numbers are shown separately at the bottom.'],
    ['What does one attendee cost?', at.n ? `${inr(at.cost_each)} so far (spend ÷ ${at.expected ? 'expected ' : ''}attendees). Our limit for an extra person is ₹250.` : 'Not known yet.'],
    ['Can the gates handle the crowd?', `The gates safely take ${fmt(S.ds.event.gateCap || 500)} entries an hour. The bar on this page compares that with the busiest hour${started() ? ' so far' : ' we expect if people arrive like they did in 2025'}.`],
    ['Is "Expected to come" a fact?', at.expected ? 'No, it is an estimate: each registration status times the chance it comes (from 2025). It turns into a fact on fest day, when people scan in.' : 'It is a fact now: people verified at the gate.']]; },
  campaigns: () => [
    ['Which channel brings the most attendees?', (() => { const r = E.campaignRows(S.ds, S.asOf, { assumptions: assump() }).filter(x => x.campaign_id).sort((a, b) => (ended() ? b.visitors - a.visitors : b.expected_visitors - a.expected_visitors))[0]; return r ? `${r.campaign}: ${fmt(ended() ? r.visitors : r.expected_visitors)} ${ended() ? 'attendees' : 'expected attendees'}.` : '–'; })()],
    ['Which is cheapest per attendee?', (() => { const r = E.campaignRows(S.ds, S.asOf, { assumptions: assump() }).filter(x => x.campaign_id && (ended() ? x.visitors : x.expected_visitors) >= 30).sort((a, b) => (ended() ? a.cost_per_visitor - b.cost_per_visitor : a.cost_per_expected_visitor - b.cost_per_expected_visitor))[0]; return r ? `${r.campaign}: ${inr(ended() ? r.cost_per_visitor : r.cost_per_expected_visitor)} each.` : '–'; })()],
    ['Which one is wasting money?', (() => { const g = groupFlags(E.flags(S.ds, S.asOf, rules(), assump())).filter(x => x.items.some(f => f.id.startsWith('cost-'))); return g.length ? g.map(x => x.subj + ': ' + x.items.find(f => f.id.startsWith('cost-')).reason).join('. ') + '.' : 'None is above its limit on this date.'; })()],
    ['Why judge on attendees, not sign-ups?', 'Sign-ups that never come cost money and bring no one. Paid ads, for example, bring many sign-ups that do not confirm, so on cost per attendee they look much worse than on cost per sign-up.'],
    ['Does a campaign\'s credit prove it caused the sign-up?', 'No. Credit only links a person to the last campaign they used. Some would have come anyway. Bets prove cause by comparing with similar colleges that did not get them.']],
  bets: () => { const b = hasBets() ? E.betRows(S.ds, S.asOf, assump()) : []; return [
    ['What is a bet?', 'A new idea we test before spending big: Campus Outreach (ambassadors with friend crews), Group Pass, Day Scholar transport, Volunteer Corps and Alumni Homecoming.'],
    ['How do we know a bet caused the gain?', 'Each one runs in test colleges and is compared with similar colleges that don\'t get it. The comparison shows what would have happened anyway; the gap is the bet\'s effect.'],
    ['When do we scale, fix or stop?', 'Too early until the test is fair (300+ per group, 2+ weeks). Stop if the gap is not clearly real. Change if an extra attendee costs more than the limit. Scale (reserve money) if even the next extra attendee is under the limit.'],
    ['How sure are we?', b.length ? b.filter(x => x.gap_real).map(x => `${x.bet}: gap ${x.gap_real}`).join('; ') + '. High means 90%+ likely the gap is real, not luck. We show words, not exact percentages, because small changes in the data move them.' : '–'],
    ['Why test small before spending big?', 'Most ideas don\'t work as well as hoped. A cheap test shows which ones do, so the ₹4.5L reserve only goes where an extra person is proven cheap. In the rehearsal one bet (Day Scholar Turnout) failed its test and was stopped at week 12.']]; },
  insights: () => [
    ['What is working?', 'Bets that passed their test and channels under the cost limit, each with the number that proves it.'],
    ['What is not, and why?', 'Each item has a one-line reason with its number. Click "Why?" for what we saw, why it matters, what we suggest and what happens if we do nothing.'],
    ['How serious is it?', 'Act = decide now. Warn = its owner fixes it this week. Watch = keep an eye on it. Fixed thresholds decide the level, so nothing is flagged on opinion.'],
    ['What should we do?', 'Press "Act on this": it drafts the action (task, budget change or release) with an owner, a due date and the number to check later. Nothing changes until you confirm.'],
    ['When do we check again?', 'Every action gets a review date, two weeks out by default. On that date the decision log compares the number then and now.']],
  money: () => { const b = E.budget(S.ds, S.asOf); return [
    ['Where is the money going?', `${lakh(b.spent)} of ${lakh(b.approved)} spent so far. The bar shows spent, still planned and reserve.`],
    ['What does each rupee bring back?', 'The "Money in, people out" chart: spend on the left, attendees on the right, cost per attendee at the end in red if above its limit.'],
    ['Why keep a reserve?', 'We don\'t know in advance which ideas will work. Holding ₹4.5L back lets money follow proof instead of hope. Ambassadors get perks, not cash, which is how the reserve grew from ₹3.5L.'],
    ['When is reserve released?', 'Only at the reviews (weeks 10, 12, 14), only to a bet whose next extra attendee is under its limit, cheapest first. ₹1L needs a High gap; ₹50k a Medium one; one release per bet until its next review.'],
    ['What if nothing qualifies?', 'Then the money stays put. In the rehearsal, no bet qualified at week 14, so ₹1.5L was never spent.']]; },
  tasks: () => [
    ['Who is doing what?', 'Each task has one owner and a due date. Edit any cell; it saves at once.'],
    ['What is late?', (() => { const n = S.tasks.filter(t => (t.base || '25') === baseOf() && tStatus(t) !== 'done' && t.due && t.due < S.asOf).length; return n ? n + ' task' + (n > 1 ? 's are' : ' is') + ' past due on this date (marked late).' : 'Nothing is late on this date.'; })()],
    ['Which problem did a task come from?', 'Tasks made with "Act on this" show where they came from (a signal, the Bets page or the analyst). Plan tasks come from the 2027 plan.'],
    ['Did the action work?', 'The decision log compares the watched number on the decision day with today. It is a before/after reading, not proof.'],
    ['What is the next review?', sim() ? 'Weeks 10, 12 and 14, then the fest eve check.' : 'Each decision\'s review date is in the log.']],
  event: () => [['What does this show?', 'Verified gate entries per hour on the fest days.'], ['Why does the busiest hour matter?', 'Crowds at the gate are the main safety risk. The plan keeps the busiest hour under 80% of what the gates can take.'], ['Who acts on it?', 'Growth flags; security and operations decide on the day.'], ['Why count unique visitors separately?', 'One person can enter several times (1.59 entries each in 2025); the outcome is people.'], ['Where does capacity come from?', S.ds.event.gateCap ? '6 QR lanes at about 420 scans an hour each ≈ 2,500 an hour.' : 'The 2025 venue: about 500 an hour.']],
  data: () => [['Is this data real?', '2025 is the provided dataset. 2027 is simulated from our plan to test the system; it is labelled everywhere.'], ['Why stop at week 10?', 'It is the first money review. Stopping there shows the decision with only what was known then. The rest is a rehearsal of one realistic run.'], ['Where do estimates come from?', 'The assumptions table: each value, its range and the 2025 evidence for it.'], ['How is the data cleaned?', 'Repeated IDs count once, each registration uses its latest status on the date, only verified gate entries count, and internal, staff and test people are excluded.'], ['How do I test with changed data?', 'Change a record below (a status, a check-in, a target) or edit a campaign. Every screen and the analyst update at once; undo is in the edit history.']]
};
function explainDrawer() {
  const list = (EXPLAIN[S.page] || EXPLAIN.overview)();
  return `<p class="note">Five questions people ask about this page, answered with the numbers for ${esc(dshort(S.asOf))}.</p><dl class="qa">${list.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('')}</dl>`;
}

/* ---------- analyst tests: expected answers computed live ---------- */
function tests() {
  const ds = S.ds, A = assump(), n = v => [String(Math.round(v)), Math.round(v).toLocaleString('en-IN'), Math.round(v).toLocaleString('en-US')];
  const refuse = ['not in the data', "doesn't include", 'does not include', 'not recorded', "don't have", 'do not have', 'not available', "isn't in", 'no data'];
  if (hasBets()) {
    const D = ds.event.today || ds.event.end, k = E.kpis(ds, D, A), f = E.forecast(ds, D, A), rp = E.reservePlan(ds, D, A), bets = E.betRows(ds, D, A), b1 = bets.find(b => b.campaign_id === 'B1'), b5 = bets.find(b => b.campaign_id === 'B5'), r = E.campaignRows(ds, D, { assumptions: A }).find(x => x.campaign_id === 'C01');
    return [
      { id: 'a1', type: 'Data', q: 'How many outside registrations do we have at week 10?', expect: fmt(k.registered), any: n(k.registered) },
      { id: 'a2', type: 'Forecast', q: 'Are we on track for the attendee target at week 10?', expect: f.verdict + ': most likely ' + fmt(f.likely) + ' vs ' + fmt(f.target), any: n(f.likely).concat([f.verdict.toLowerCase()]) },
      { id: 'a3', type: 'Decision', q: 'Which bet should get reserve money first at week 10, and why?', expect: rp.suggestions[0] ? rp.suggestions[0].bet + ' (next extra attendee ≈ ' + inr(rp.suggestions[0].next_tranche_cost) + ')' : 'none ready', any: rp.suggestions[0] ? [rp.suggestions[0].bet.split(' ')[0]] : ['none'] },
      { id: 'a4', type: 'Calculation', q: 'At week 10, how much cheaper is an extra attendee from Campus Outreach than from Alumni Homecoming?', expect: inr(b5.cost_per_extra - b1.cost_per_extra), any: n(b5.cost_per_extra - b1.cost_per_extra) },
      { id: 'a5', type: 'Diagnosis', q: 'What is wrong with Paid Social at week 10?', expect: 'Cost ' + inr(r.cost_per_expected_visitor) + ' per expected attendee vs ₹250 limit; few confirm', any: n(r.cost_per_expected_visitor) },
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
  return `<details><summary>Test the analyst</summary><p class="note">Expected answers come from the same engine as the screens. "Run" asks the analyst and checks for the expected number or phrase. Make an edit on 2025, then rerun "Changed data".</p>
  <div class="scroll"><table><tr><th>Type</th><th>Question</th><th>Expected</th><th>Result</th><th></th></tr>${tests().map(t => { const r = S.tests[t.id]; return `<tr><td class="note">${esc(t.type)}</td><td>${esc(t.q)}</td><td>${esc(t.expect)}</td><td>${r ? (r.running ? 'Running…' : `<b style="color:${r.pass ? 'var(--good)' : 'var(--act)'}">${r.pass ? 'Pass' : 'Check'}</b><div class="note">${esc(r.text.slice(0, 200))}${r.text.length > 200 ? '…' : ''}</div>`) : '–'}</td><td><button class="btn ghost sm" type="button" data-act="test" data-id="${t.id}">Run</button></td></tr>`; }).join('')}</table></div></details>`;
}

/* ---------- drawers: page explainer, flag detail, campaign edit, new campaign, spend, bet detail, action confirm ---------- */
const KINDS = { task: 'Create a task', release_reserve: 'Release reserve to a bet', pause_campaign: 'Pause campaign', resume_campaign: 'Resume campaign', set_planned_budget: 'Set planned budget', move_budget: 'Move planned budget', change_owner: 'Change owner', add_spend: 'Record spend' };
const PAGE_NAMES = { overview: 'Overview', journey: 'Journey', funnel: 'Funnel', campaigns: 'Campaigns', bets: 'Bets', insights: 'Insights', money: 'Money', tasks: 'Tasks', event: 'Fest days', data: 'Data' };
function openDrawer(kind, data) { S.drawer = { kind, data: data || {} }; renderDrawer(); }
function closeDrawer() { S.drawer = null; S.pending = null; renderDrawer(); }
function renderDrawer() {
  let w = $('#side'); const d = S.drawer;
  if (!d) { if (w) w.remove(); return; }
  if (!w) { w = document.createElement('div'); w.id = 'side'; document.body.appendChild(w); }
  let title = '', body = '';
  if (d.kind === 'explain') { title = 'Understand: ' + PAGE_NAMES[S.page]; body = explainDrawer(); }
  else if (d.kind === 'flagd') { const f = E.flags(S.ds, S.asOf, rules(), assump()).find(x => x.id === d.data.id); if (!f) return closeDrawer(); title = 'Why this needs attention'; body = flagDetail(f); }
  else if (d.kind === 'camp') { const c = S.ds.camps.get(d.data.id); if (!c) return closeDrawer(); title = c.campaign_name; body = campDrawer(c); }
  else if (d.kind === 'bet') { title = E.campName(S.ds, d.data.id); body = betDrawer(d.data.id); }
  else if (d.kind === 'newcamp') { title = 'Add campaign'; body = `<form class="f" data-form="newcamp"><label class="l">Name<input name="name" required maxlength="60"></label><div class="fr"><label class="l">Channel<input name="channel" required maxlength="40" placeholder="e.g. whatsapp"></label><label class="l">Owner<select name="owner">${ownerOptions('T03')}</select></label></div><label class="l">Planned budget (₹)<input type="number" name="budget" min="0" step="500"></label><button class="btn" type="submit">Add campaign</button></form>`; }
  else if (d.kind === 'spend') { title = 'Record spend'; body = `<form class="f" data-form="spend"><label class="l">Campaign<select name="campaign_id">${campOptions(d.data.id || '')}</select></label><div class="fr"><label class="l">Date<input type="date" name="activity_date" value="${esc(S.asOf)}" min="${esc(S.ds.event.start)}" max="${esc(S.ds.event.end)}" required></label><label class="l">Amount (₹, minus for a credit)<input type="number" name="amount" step="1" required></label></div><label class="l">Note<input name="note"></label><button class="btn" type="submit">Save spend</button></form>`; }
  else if (d.kind === 'confirm') { title = 'Confirm an action'; body = confirmBody(); }
  w.innerHTML = `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="hd"><h2>${esc(title)}</h2><button class="btn ghost sm" data-act="close" type="button">Close</button></div><div class="bd">${body}</div></aside>`;
  if (d.kind === 'camp') { const c = S.ds.camps.get(d.data.id), t = E.trend(S.ds, 'registrations', 'week', S.ds.event.start, S.asOf < S.ds.event.eventStartDay ? S.asOf : E.addDays(S.ds.event.eventStartDay, -1), c.campaign_id); mount('campChart', s => colChart(s, { labels: t.rows.map(x => x.period.replace('week of ', '')), values: t.rows.map(x => x.value), short: dshort })); }
  if (d.kind === 'confirm') { const f = w.querySelector('form'); f.addEventListener('change', () => { readDraft(f); renderDrawer(); }); }
  const first = w.querySelector('.hd button'); if (first) first.focus({ preventScroll: true });
}
function campDrawer(c) {
  const A = assump(), r = E.campaignRows(S.ds, S.asOf, { assumptions: A }).find(x => x.campaign_id === c.campaign_id) || {};
  return `${c.plan_idea ? `<dl class="qa plan"><dt>The idea</dt><dd>${esc(c.plan_idea)}</dd><dt>Why it should work</dt><dd>${esc(c.plan_why)}</dd><dt>Stop rule</dt><dd>${esc(c.stop_rule)}</dd></dl>` : `<p class="note">${esc(c.objective || c.target_audience || '')}</p>`}<h3>Registrations per week</h3><div class="fig" style="min-height:170px"><svg id="campChart" role="img" aria-label="Weekly registrations"></svg></div>
  <p class="note">${fmt(r.registered)} registered · ${fmt(r.confirmed)} confirmed · ${fmt(r.cancelled)} cancelled · opt-outs ${pct(r.opt_out_rate, 1)}</p>
  <form class="f" data-form="campedit" data-id="${esc(c.campaign_id)}" style="margin-top:14px"><h3>Edit</h3><div class="fr"><label class="l">Status<select name="status">${['active', 'paused', 'ended'].map(s => `<option ${((c.status || 'active') === s) ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="l">Owner<select name="owner">${ownerOptions(c.owner_id)}</select></label><label class="l">Planned budget (₹)<input type="number" name="budget" min="0" step="500" value="${esc(c.planned_budget_inr || '')}"></label></div><label class="l">Why<input name="note" placeholder="Kept in the edit history"></label><button class="btn" type="submit">Save</button></form>
  <div class="row" style="margin-top:14px"><button class="btn ghost" data-act="spend" data-id="${esc(c.campaign_id)}" type="button">Record spend</button><button class="btn ghost" data-act="draft" data-kind="task" data-camp="${esc(c.campaign_id)}" type="button">Create a task</button><button class="btn ghost" data-act="ask" data-q="${esc('How is ' + c.campaign_name + ' doing and what should we change?')}" type="button">Ask the analyst</button></div>`;
}
function draftFromFlag(f) {
  const i = f.id.indexOf('-'), kind = f.id.slice(0, i), cid = f.id.slice(i + 1), c = S.ds.camps.get(cid), name = c ? c.campaign_name : '', owner = c ? c.owner_id : (/Security/.test(f.owner) ? 'SEC' : 'GL');
  const d = { kind: 'task', campaign_id: c ? cid : '', owner, title: f.action.split('.')[0].split(';')[0], reason: f.title + ': ' + f.reason + '. ' + f.evidence, flag_id: f.id, source: 'signal', metric: null, expected: '' };
  if (kind === 'bet' && c) { const b = E.betRows(S.ds, S.asOf, assump()).find(x => x.campaign_id === cid) || {}; Object.assign(d, { title: b.decision === 'Too early' ? `${name}: keep the test running until both groups pass 300 people` : b.decision === 'Stop' ? `Stop ${name} and move its budget to the best bet` : `${name}: bring cost per extra person under ${inr(b.cost_cap_inr)}`, metric: { key: 'cost_per_extra', campaign_id: cid }, expected: b.decision === 'Change' ? 'Cost per extra person falls under the limit' : '' }); }
  else if (kind === 'cost' && c) Object.assign(d, { title: `Cut ${name} to reveals and reminders only`, metric: { key: ended() ? 'cost_per_visitor' : 'cost_per_expected_visitor', campaign_id: cid }, expected: 'Cost per attendee falls under the limit' });
  else if ((kind === 'showup' || kind === 'confirm') && c) Object.assign(d, { title: `Send confirm-your-spot reminders to unconfirmed ${name} registrants`, metric: { key: 'confirmed', campaign_id: cid }, expected: 'More registrants confirm within a week' });
  else if (kind === 'optout' && c) Object.assign(d, { title: `${name}: at most one email a week; never email people who opted out`, metric: { key: 'opt_out_rate', campaign_id: cid }, expected: 'Opt-outs stop rising' });
  else if (kind === 'cancel' && c) Object.assign(d, { title: `Ask ${name} cancellers why (one-question survey)`, metric: { key: 'cancel_rate', campaign_id: cid } });
  else if (kind === 'forecast' && hasBets()) { const rp = E.reservePlan(S.ds, S.asOf, assump()).suggestions[0]; if (rp) { const cc = S.ds.camps.get(rp.campaign_id); Object.assign(d, { kind: 'release_reserve', campaign_id: rp.campaign_id, amount: rp.amount, owner: cc.owner_id, title: `Release ${inr(rp.amount)} of reserve to ${rp.bet}`, metric: { key: 'expected_extra_attendees', campaign_id: rp.campaign_id }, expected: 'More extra attendees under the limit', source: 'signal' }); } else Object.assign(d, { title: 'Push confirm-your-spot reminders to all unconfirmed registrants', metric: { key: 'confirmed', campaign_id: null } }); }
  else if (kind === 'pace' || kind === 'forecast' || kind === 'goal') Object.assign(d, { title: hasBets() ? 'Find the lagging bet and have its owner fix it this week' : 'Push registrations through the cheapest proven campaign', metric: { key: 'registered', campaign_id: null } });
  else if (kind === 'gate') Object.assign(d, { owner: 'SEC', title: 'Give pass holders entry time windows to spread the busiest hour' });
  return d;
}
function openDraft(d) {
  if (d.review_date === undefined) delete d.review_date;
  S.pending = Object.assign({ due: E.addDays(S.asOf, 3), review_date: E.addDays(S.asOf, 14), amount: 0, to: '', expected: '', reason: '' }, d);
  openDrawer('confirm');
}
function forecastEffect(p) {
  if (!before() || !['release_reserve', 'move_budget'].includes(p.kind) || !(p.amount > 0)) return null;
  const A = assump(), bets = E.betRows(S.ds, S.asOf, A), rows = E.campaignRows(S.ds, S.asOf, { assumptions: A });
  const next = id => { const b = bets.find(x => x.campaign_id === id); if (b) return b.next_tranche_cost; const r = rows.find(x => x.campaign_id === id); return r && r.cost_per_expected_visitor ? r.cost_per_expected_visitor / A.scale_factor.value : null; };
  const extra = []; if (p.kind === 'release_reserve') { const c = next(p.campaign_id); if (c) extra.push({ amount: p.amount, cost: c }); }
  else { const a = next(p.campaign_id), b = next(p.to); if (a) extra.push({ amount: -p.amount, cost: a }); if (b) extra.push({ amount: p.amount, cost: b }); }
  if (!extra.length) return null;
  const was = fcAt(S.asOf), now = fcAt(S.asOf, extra);
  return `Forecast: most likely ${fmt(was.likely)} → <b>${fmt(now.likely)}</b>, bad luck ${fmt(was.bad)} → ${fmt(now.bad)} · ${pill(was.verdict)} → ${pill(now.verdict)}`;
}
function effects(p) {
  const out = [], cn = id => E.campName(S.ds, id), row = id => E.campaignRows(S.ds, S.asOf).find(r => r.campaign_id === id) || {};
  const planned = id => { const r = row(id); return Number(r.planned_budget_inr || r.spend || 0); };
  if (p.kind === 'release_reserve') { const left = E.reserveLeft(S.ds, S.asOf); out.push(`${cn(p.campaign_id)} planned budget ${inr(planned(p.campaign_id))} → ${inr(planned(p.campaign_id) + Number(p.amount))}`); out.push(`Reserve left ${inr(left)} → ${inr(left - Number(p.amount))}`); const b = E.betRows(S.ds, S.asOf, assump()).find(x => x.campaign_id === p.campaign_id); if (!b) out.unshift('⚠ Not a bet: reserve only goes to bets'); else if (b.decision !== 'Scale') out.unshift('⚠ ' + b.bet + ' is not cleared for reserve money: ' + b.why); if (Number(p.amount) > left) out.unshift('⚠ More than the reserve left'); }
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
  const p = S.pending, amt = ['release_reserve', 'set_planned_budget', 'move_budget', 'add_spend'].includes(p.kind), fx = forecastEffect(p);
  return `<form class="f" id="draftForm" data-form="confirm"><p class="note">Nothing changes until you confirm.${p.source === 'analyst' ? ' Proposed by the analyst.' : ''}</p>
  <label class="l">Action<select name="kind">${Object.keys(KINDS).map(k => `<option value="${k}" ${k === p.kind ? 'selected' : ''}>${KINDS[k]}</option>`).join('')}</select></label>
  <div class="fr"><label class="l">Campaign<select name="campaign_id"><option value="">None</option>${campOptions(p.campaign_id, false, p.kind === 'release_reserve' ? c => c.kind === 'bet' : null)}</select></label>${p.kind === 'move_budget' ? `<label class="l">Move to<select name="to">${campOptions(p.to)}</select></label>` : ''}${amt ? `<label class="l">Amount (₹)<input type="number" name="amount" step="500" value="${esc(p.amount)}"></label>` : ''}</div>
  <label class="l">Task<input name="title" value="${esc(p.title)}" maxlength="160" required></label>
  <div class="fr"><label class="l">Owner<select name="owner">${ownerOptions(p.owner)}</select></label><label class="l">Due<input type="date" name="due" value="${esc(p.due)}"></label><label class="l">Review on<input type="date" name="review_date" value="${esc(p.review_date)}"></label></div>
  <label class="l">Number to check on review<select name="metric"><option value="">None</option>${Object.keys(METRICS).map(k => `<option value="${k}" ${p.metric && p.metric.key === k ? 'selected' : ''}>${METRICS[k]}</option>`).join('')}</select></label>
  <label class="l">Why<textarea name="reason" rows="3">${esc(p.reason)}</textarea></label><label class="l">Expected result<input name="expected" value="${esc(p.expected)}"></label>
  ${fx ? `<p class="impact">${fx} ${info('Each rupee moved buys extra attendees at that bet\'s next-attendee cost, delivering 50–100% of it (most likely 80%). Money taken from a channel loses attendees at its own next-attendee cost.')}</p>` : ''}
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
  if (p.kind === 'release_reserve' && (!(p.amount > 0) || p.amount > E.reserveLeft(S.ds, S.asOf) || c.kind !== 'bet')) return toast('Reserve goes to a bet, above zero and within the reserve left.');
  const edits = [], row = id => E.campaignRows(S.ds, S.asOf).find(r => r.campaign_id === id) || {}, planned = id => Number(row(id).planned_budget_inr || row(id).spend || 0);
  const upd = async (id, fields, extra) => { const e = await commitEdit('campaign_update', Object.assign({ campaign_id: id, fields }, extra || {}), p.reason); if (e) edits.push(e.id); };
  if (p.kind === 'release_reserve') {
    // In the 2027 rehearsal, a release you make replaces the plan's matching release in the next 10 days, so money is never counted twice.
    const twin = S.ds.plan.find(x => x.kind === 'release_reserve' && x.campaign_id === p.campaign_id && x.decided_at.slice(0, 10) > S.asOf && x.decided_at.slice(0, 10) <= E.addDays(S.asOf, 10));
    const base = (Number(c.reserve_released_inr) || 0);
    await upd(p.campaign_id, { planned_budget_inr: (Number(c.planned_budget_inr) || 0) + p.amount, reserve_released_inr: base + p.amount, reserve_released_at: S.asOf }, twin ? { replaces_plan: twin.decision_id } : null);
  }
  if (p.kind === 'pause_campaign') await upd(p.campaign_id, { status: 'paused' });
  if (p.kind === 'resume_campaign') await upd(p.campaign_id, { status: 'active' });
  if (p.kind === 'set_planned_budget') await upd(p.campaign_id, { planned_budget_inr: Number(p.amount) });
  if (p.kind === 'change_owner') await upd(p.campaign_id, { owner_id: p.owner, owner_name: ownerLabel(p.owner) });
  if (p.kind === 'move_budget') { const a = planned(p.campaign_id), b = planned(p.to); await upd(p.campaign_id, { planned_budget_inr: a - p.amount }); await upd(p.to, { planned_budget_inr: b + p.amount }); }
  if (p.kind === 'add_spend') { const e = await commitEdit('spend_add', { campaign_id: p.campaign_id, activity_date: S.asOf + 'T00:00:00', marketing_spend_inr: Number(p.amount), owner_id: c.owner_id }, p.reason); if (e) edits.push(e.id); }
  const base = baseOf(), dec = { id: newId('DC'), base, title: p.title, kind: p.kind, amount: Number(p.amount) || 0, campaign_id: p.campaign_id || null, reason: p.reason, expected: p.expected, as_of: S.asOf, review_date: p.review_date, created_at: new Date().toISOString(), by: S.uid || 'this browser', edit_ids: edits, metric: p.metric ? Object.assign({}, p.metric, { before: metricNow(p.metric) }) : null, status: 'open', source: p.source || 'manual' };
  let task = null;
  if (p.kind !== 'add_spend' && p.kind !== 'change_owner') { task = { id: newId('TK'), base, title: p.title, owner: p.owner, due: p.due, status: 'todo', campaign_id: p.campaign_id || null, flag_id: p.flag_id || null, source: p.source || 'manual', decision_id: dec.id, created_at: new Date().toISOString() }; dec.task_id = task.id; await Store.put('tasks', task); }
  await Store.put('decisions', dec);
  closeDrawer(); render(); chatNote('Confirmed: ' + p.title + '.');
  toast('Done: ' + p.title, async () => { for (const id of edits) { const e = S.edits.find(x => x.id === id); if (e) await Store.put('edits', Object.assign(clone(e), { undone: true })); } if (task) await Store.remove('tasks', task.id); await Store.remove('decisions', dec.id); rebuild(true); render(); });
}

/* ---------- render & events ---------- */
function setPage() { const h = (location.hash || '#overview').slice(1); S.page = PAGES[h] ? h : 'overview'; document.querySelectorAll('#nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + S.page ? 'page' : 'false')); if (S.drawer && S.drawer.kind === 'explain') closeDrawer(); render(); }
let raf = 0;
function render() { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderNow); }
function renderNow() {
  if (!S.ds) return; observers.forEach(o => o.disconnect()); observers = []; syncBar();
  try { $('#main').innerHTML = PAGES[S.page](); } catch (e) { console.error(e); $('#main').innerHTML = `<div class="loading">This view hit an error: ${esc(e.message)}</div>`; }
  if (S.page === 'journey') drawJourney();
  if (S.drawer && (S.drawer.kind === 'explain' || S.drawer.kind === 'flagd')) renderDrawer();
}
async function switchView(v, keepDate) {
  S.view = v; $('#main').innerHTML = '<div class="loading">Loading…</div>';
  try { await loadBase(VIEWS[v].base); } catch (e) { $('#main').innerHTML = `<div class="loading">Could not load data (${esc(e.message)}).</div>`; return; }
  S.review = null; S.tests = {}; rebuild(keepDate); render();
  if (chat.sample && !chat.turns.length) emptyState();
}
function goDate(d) { if (!isDate(d)) return; const ev = S.ds.event; S.asOf = d < ev.start ? ev.start : d > ev.end ? ev.end : d; S.review = null; syncBar(); render(); }
function tips() {
  let box = null;
  const show = el => { if (!box) { box = document.createElement('div'); box.id = 'tipbox'; box.setAttribute('role', 'tooltip'); document.body.appendChild(box); } box.textContent = el.dataset.tip; box.style.display = 'block'; const r = el.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight; let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)), y = r.bottom + 8; if (y + h > window.innerHeight - 8) y = r.top - h - 8; box.style.left = x + 'px'; box.style.top = y + 'px'; };
  const hide = () => { if (box) box.style.display = 'none'; };
  document.addEventListener('mouseover', e => { const el = e.target.closest('.i'); if (el) show(el); });
  document.addEventListener('mouseout', e => { if (e.target.closest('.i')) hide(); });
  document.addEventListener('focusin', e => { const el = e.target.closest('.i'); if (el) show(el); else hide(); });
  document.addEventListener('scroll', hide, true);
}
function bind() {
  tips();
  window.addEventListener('hashchange', setPage);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (S.drawer) closeDrawer(); else $('#chat').classList.remove('open'); } });
  $('#asOf').addEventListener('change', e => goDate(e.target.value));
  const step = dir => { const opts = dateOptions().map(o => o[0]), i = opts.indexOf(S.asOf), j = Math.min(opts.length - 1, Math.max(0, i + dir)); if (j !== i) goDate(opts[j]); };
  $('#prevWk').addEventListener('click', () => step(-1)); $('#nextWk').addEventListener('click', () => step(1));
  $('#dsSel').addEventListener('change', e => { const v = e.target.value; switchView(v === '25' ? (editsFor('25').length ? 'edit25' : 'orig25') : v); });
  $('#origToggle').addEventListener('click', () => switchView(S.view === 'edit25' ? 'orig25' : 'edit25', true));
  const onClick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, id = b.dataset.id;
    if (a === 'flag') { const f = E.flags(S.ds, S.asOf, rules(), assump()).find(x => x.id === id); if (f) openDraft(draftFromFlag(f)); }
    else if (a === 'flagd') openDrawer('flagd', { id });
    else if (a === 'explain') openDrawer('explain');
    else if (a === 'go') goDate(b.dataset.d);
    else if (a === 'ask') { closeDrawer(); askAnalyst(b.dataset.q); }
    else if (a === 'camp') openDrawer('camp', { id });
    else if (a === 'bet') openDrawer('bet', { id });
    else if (a === 'newcamp') openDrawer('newcamp');
    else if (a === 'spend') openDrawer('spend', { id });
    else if (a === 'close') closeDrawer();
    else if (a === 'release') { const c = S.ds.camps.get(id), amt = Number(b.dataset.amt); openDraft({ kind: 'release_reserve', campaign_id: id, amount: amt, owner: c.owner_id, title: `Release ${inr(amt)} of reserve to ${c.campaign_name}`, reason: 'Cheapest next extra attendee under its limit (Bets page, ' + dshort(S.asOf) + ')', expected: 'More extra attendees under the limit', metric: { key: 'expected_extra_attendees', campaign_id: id }, source: 'bets' }); }
    else if (a === 'draft') { const cid = b.dataset.camp || ''; openDraft({ kind: 'task', campaign_id: cid, owner: (S.ds.camps.get(cid) || {}).owner_id || 'GL', title: '', source: 'manual' }); }
    else if (a === 'tdel') { const t = S.tasks.find(x => x.id === id); if (t) { await Store.remove('tasks', id); render(); toast('Task deleted', async () => { await Store.put('tasks', t); render(); }); } }
    else if (a === 'review') { S.review = id || null; render(); }
    else if (a === 'undo') { const x = S.edits.find(y => y.id === id); if (x) { await Store.put('edits', Object.assign(clone(x), { undone: !x.undone })); rebuild(true); render(); } }
    else if (a === 'test') runTest(id);
  };
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-act]')) e.target.click(); });
  document.addEventListener('change', async e => {
    const t = e.target, ch = t.dataset.ch;
    if (ch === 'funnelCamp') { S.funnelCamp = t.value; render(); }
    else if (t.dataset.t) { const tk = S.tasks.find(x => x.id === t.dataset.t); if (!tk) return; const v = t.value.trim(); if (t.dataset.f === 'title' && !v) { t.value = tk.title; return; } await Store.put('tasks', Object.assign(clone(tk), { [t.dataset.f]: v })); if (t.dataset.f !== 'title') render(); toast('Saved'); }
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!f.dataset || !f.dataset.form) return; e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries()), kind = f.dataset.form;
    if (kind === 'confirm') { readDraft(f); return confirmDraft(); }
    if (kind === 'addtask') { await Store.put('tasks', { id: newId('TK'), base: baseOf(), title: v.title.trim(), owner: v.owner, due: v.due, status: 'todo', campaign_id: null, source: 'manual', created_at: new Date().toISOString() }); render(); toast('Task added'); }
    else if (kind === 'spend') { const c = S.ds.camps.get(v.campaign_id), amt = Number(v.amount); if (!amt) return toast('Enter an amount.'); await commitEdit('spend_add', { campaign_id: v.campaign_id, activity_date: v.activity_date + 'T00:00:00', marketing_spend_inr: amt, owner_id: c ? c.owner_id : null }, v.note); closeDrawer(); toast('Spend saved: ' + inr(amt) + ' on ' + E.campName(S.ds, v.campaign_id)); }
    else if (kind === 'newcamp') { const ids = Array.from(S.ds.camps.keys()).filter(x => /^C\d+$/.test(x)).map(x => Number(x.slice(1))); const id = 'C' + String(Math.max(0, ...ids) + 1).padStart(2, '0'); await commitEdit('campaign_add', { campaign_id: id, campaign_name: v.name.trim(), channel: v.channel.trim(), owner_id: v.owner, owner_name: ownerLabel(v.owner), status: 'active', kind: 'channel', planned_budget_inr: Number(v.budget) || null, created_at: S.asOf + 'T09:00:00', planned_start_at: S.asOf + 'T09:00:00' }, 'New campaign'); closeDrawer(); toast('Campaign added: ' + v.name); }
    else if (kind === 'campedit') { const c = S.ds.camps.get(f.dataset.id), fields = {}; if ((c.status || 'active') !== v.status) fields.status = v.status; if (c.owner_id !== v.owner) { fields.owner_id = v.owner; fields.owner_name = ownerLabel(v.owner); } const bud = v.budget === '' ? null : Number(v.budget); if ((c.planned_budget_inr || null) !== bud) fields.planned_budget_inr = bud; if (!Object.keys(fields).length) return toast('Nothing changed.'); await commitEdit('campaign_update', { campaign_id: f.dataset.id, fields }, v.note); renderDrawer(); toast('Saved: ' + c.campaign_name); }
    else if (kind === 'target') { const t = E.targetAt(S.ds, S.asOf) || {}; await commitEdit('target_add', Object.assign({}, t, { effective_at: v.date + 'T00:00:00', target_version: v.name, registration_goal: Number(v.r), unique_external_visitors_goal: Number(v.v), marketing_budget_inr: Number(v.b) }), 'New target version'); toast('Target version saved'); }
    else if (kind === 'checkin') { const pid = v.person_id.trim(), p = S.ds.people.get(pid); if (!p) return toast('No person ' + pid + ' in this data.'); const reg = S.ds.regs.find(r => r.person_id === pid); await commitEdit('checkin_add', { person_id: pid, occurred_at: v.t.length === 16 ? v.t + ':00' : v.t, campaign_id: reg ? reg.campaign_id : null, registration_id: reg ? reg.registration_id : null }, 'Manual gate entry'); toast('Check-in saved for ' + pid + (p.person_type !== 'external' ? ' (not counted: ' + p.person_type + ')' : '')); }
    else if (kind === 'status') { const rid = v.rid.trim(); if (!S.ds.regs.find(r => r.registration_id === rid)) return toast('No registration ' + rid + ' in this data.'); await commitEdit('status_change', { registration_id: rid, status: v.status, effective_at: v.t.length === 16 ? v.t + ':00' : v.t }, 'Status change'); toast(rid + ' → ' + v.status); }
    else if (kind === 'review') { const d = S.decisions.find(x => x.id === f.dataset.id); if (d) { await Store.put('decisions', Object.assign(clone(d), { status: 'reviewed', outcome: v.outcome + (v.next ? ' · next: ' + v.next : ''), after: metricNow(d.metric), reviewed_as_of: S.asOf })); const t = S.tasks.find(x => x.id === d.task_id); if (t && t.status !== 'done') await Store.put('tasks', Object.assign(clone(t), { status: 'done' })); S.review = null; render(); toast('Review saved'); } }
  });
}

/* ---------- AI growth analyst ---------- */
const chat = { turns: [], busy: false, ctl: null, sample: null, maxTools: 20 };
function chatEl(cls, text) { const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = text; $('#msgs').appendChild(d); $('#msgs').scrollTop = 1e9; return d; }
function chatNote(t) { chatEl('sys', t); }
function richText(el, t) { el.innerHTML = esc(String(t).replace(/^#{1,6}\s*/gm, '').replace(/^\s*[*-]\s+/gm, '• ').replace(/\n{3,}/g, '\n\n').trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2'); }
function openChat() { $('#chat').classList.add('open'); }
function emptyState() {
  if (!S.ds) return;
  const sug = hasBets() ? ['Are we on track for the attendee target?', 'Which bet should get reserve money first?', 'What happens if we release ₹1L to Group Pass?', 'What is wrong with Paid Social?'] : ['Why did we miss the attendee goal?', 'Which campaign should get more budget?', 'How many visitors came on both days?', 'What was the weather on day 1?'];
  $('#msgs').innerHTML = `<div class="empty">I read the same numbers as the dashboard, for the dataset and date you picked. I can set up actions for you to confirm.<div class="sugg">${sug.map(s => `<button type="button" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
}
function dateArg(v) { if (!isDate(v)) return S.asOf; const ev = S.ds.event; return v < ev.start ? ev.start : v > ev.end ? ev.end : v; }
function campArg(v) { if (!v || v === 'all') return undefined; const s = String(v).trim(); if (S.ds.camps.has(s.toUpperCase())) return s.toUpperCase(); const m = Array.from(S.ds.camps.values()).find(c => c.campaign_name.toLowerCase() === s.toLowerCase()); if (m) return m.campaign_id; throw new Error('Unknown campaign "' + s + '". Use an ID like C01 or B1.'); }
function pick(o, keys) { const r = {}; keys.forEach(k => { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
function contextBlock() {
  const ds = S.ds, A = assump(), k = E.kpis(ds, S.asOf, A), fl = E.flags(ds, S.asOf, rules(), A).slice(0, 8), ev = ds.event, fc = fcAt(S.asOf);
  const camps = Array.from(ds.camps.values()).map(c => `${c.campaign_id} ${c.campaign_name} (${c.kind === 'bet' ? 'bet #' + c.bet_rank + ', ' + c.bet_type : c.channel}; owner ${ownerLabel(c.owner_id)} ${c.owner_id}${c.status && c.status !== 'active' ? '; ' + c.status : ''})`).join('\n');
  const open = S.tasks.filter(t => t.status !== 'done' && (t.base || '25') === baseOf()).slice(0, 8).map(t => `${t.title} (${ownerLabel(t.owner)}, due ${t.due})`).join('; ');
  return `DATA IN VIEW: ${ds.label}.${ev.simulated ? ' SIMULATED: our 2027 plan running in New Delhi, generated to test the plan; not real records. Say "simulated" when it matters. "Today" in the story is ' + ev.today + ' (end of week 10, the first money review). Dates after it are a rehearsal: one realistic run in which the plan\'s decisions are taken on time.' : ''} Event ${ev.name}, fest ${ev.eventStartDay} to ${ev.eventEndDay}; records cover ${ev.start} to ${ev.end}; INR; IST.
SELECTED DATE: ${S.asOf}${k.week && k.week <= 15 ? ' (week ' + k.week + ' of 15)' : ''}, ${E.daysBetween(S.asOf, ev.eventStartDay)} days to the fest. Use it unless the user names another date.
FORECAST (outside attendees): ${JSON.stringify(pick(fc, ['mode', 'bad', 'likely', 'good', 'verdict', 'target', 'stretch', 'chance']))}
CAMPAIGNS:\n${camps}
SNAPSHOT (engine): ${JSON.stringify(pick(k, ['registered', 'active', 'status', 'visitors', 'walkins', 'showup', 'spend', 'costPerVisitor', 'target', 'projection']))}
${hasBets() ? 'PACE: ' + JSON.stringify(E.pace(ds, S.asOf)[0]) + '\nRESERVE LEFT: ' + E.reserveLeft(ds) + '\n' : ''}TOP SIGNALS: ${fl.map(f => f.level + ': ' + f.title).join(' | ') || 'none'}
OPEN TASKS: ${open || 'none'}`;
}
const PLAN_RULES = `PLAN RULES (2027): "identified" in the data = "People who responded": outside people who did something back (left details, opened a page, signed up, walked in), not everyone we messaged; always call it that. Week 1 starts 16 Nov 2026; competition registrations open week 2; pass registrations open week 3 (30 Nov 2026, 82 days out like 2025, so the pace plan is 2025's real sign-up curve); big push week 8 (4 Jan 2027); reviews at weeks 10, 12, 14; fest Fri–Sat 26–27 Feb 2027. Competition teams are paced separately: 150 by week 6, 250 by week 8, 300 by week 10. Targets: 4,800 outside attendees (stretch 9,000); 5,760 registrations (stretch 10,400); budget ₹10L incl. a ₹4.5L reserve (ambassadors get perks, not cash). Money moves on expected extra attendees = people in test colleges × (test registration rate − comparison rate) × chance each registrant comes. Never on clicks or sign-ups alone. Next extra attendee cost = cost per extra ÷ how well the bet scales. Reserve goes to the cheapest next extra attendee first, only under each bet's limit, only at a review. ₹1L needs the gap to be High (90%+ likely real); ₹50k Medium (80%+), 2+ weeks, 300+ per group. A fair test with no clear gap = Stop. Forecast verdicts: Safe = even bad luck (1 in 10) beats the target; Ahead, not safe yet = most likely beats it, bad luck doesn't; Off track = most likely misses it. Limits: Outreach ₹235, Group Pass ₹250, Day Scholars ₹200, Volunteers ₹200, Alumni ₹250, channels ₹250.`;
const RULES = () => `You are the Growth Analyst inside the CampusFest Growth Center, for a college fest's growth team. You answer questions about attendee growth and help the team act.

DEFINITIONS
- Outside (external) people only in totals. Internal, staff and test people never count. Day Scholar Turnout is the only bet about our own students; it is judged on its own.
- Visitor = unique external person with at least one admitted AND verified check-in. Registered = unique people with a registration up to the date; status = latest version on or before the date.
- Spend = net INR. Campaign credit links a person to a campaign; it is not proof it caused the visit.
- Never use records after the date being discussed. Counts from records are facts. Forecasts, expected attendees, extra attendees, next extra attendee costs and what-ifs are estimates: mark them "(est.)". Say forecasts as bad luck / most likely / good luck plus the verdict; never as an exact probability.
${hasBets() ? PLAN_RULES : ''}

HOW TO ANSWER
1. Every number comes from the snapshot below or a tool. Use calculate for any arithmetic. Never estimate a number you could look up.
2. If the data cannot answer (weather, revenue, ticket prices, satisfaction, demographics, competitor fests, social sentiment, other years), say so in the first sentence using the words "not in the data", say what it does have, and offer the closest answerable question.
3. If a question is ambiguous, state the reading you used in a short clause.
4. Format: first sentence = direct answer with the key number. Then up to 4 short lines starting "- ", each with its number (mark estimates "(est.)"). Then one line "Next:" with a concrete action or question. Under 130 words unless asked. Plain text, **bold** allowed, no tables or headings.
5. Under 30 people, say it is too small to judge.
6. You cannot change anything yourself. When the user asks for an action, or agrees to one, call propose_action; it opens a confirmation panel. Then say it is waiting for their confirmation. Never say it is done.
7. If the user states a number that conflicts with the data, say so politely and give the data's number.
8. Use campaign and bet names, not IDs. Never show tool names, JSON or code. Money in ₹ with Indian commas (₹1,00,000) or lakh (₹1L).
9. For a follow-up question, reuse the earlier turns: "it", "that bet" or "same for X" refer to what was just discussed.

${contextBlock()}`;
function tools() {
  const D = { type: 'string', description: 'Date YYYY-MM-DD. Omit for the selected date.' }, C = { type: 'string', description: 'Campaign ID like C01 or B1; omit for all' }, A = () => assump();
  const list = [
    { name: 'get_overview', description: 'Headline numbers at a date: registered, status counts, visitors, walk-ins, show-up, spend, cost per attendee, target in force, forecast with verdict, pace vs plan, budget, reserve left, and the plan decisions taken by then.', inputSchema: { type: 'object', properties: { as_of: D } }, execute: i => { const d = dateArg(i.as_of); return { as_of: d, kpis: E.kpis(S.ds, d, A()), pace: E.pace(S.ds, d), budget: E.budget(S.ds, d), reserve_left: hasBets() ? E.reserveLeft(S.ds, d) : null, plan_decisions_taken: E.planDecisionsAt(S.ds, d).map(p => pick(p, ['decided_at', 'title', 'reason'])) }; } },
    { name: 'get_campaigns', description: 'Per-campaign table: kind (channel/bet), owner, status, planned budget, spend, registered, confirmed, cancelled, visitors, show-up, expected visitors (A), cost per registration, cost per visitor, cost per expected visitor (A), opt-outs.', inputSchema: { type: 'object', properties: { as_of: D, campaign_id: C } }, execute: i => { const d = dateArg(i.as_of), cid = campArg(i.campaign_id); let r = E.campaignRows(S.ds, d, { assumptions: A() }); if (cid) r = r.filter(x => x.campaign_id === cid); return { as_of: d, rows: r.map(x => pick(x, ['campaign_id', 'campaign', 'kind', 'owner', 'status', 'planned_budget_inr', 'spend', 'registered', 'confirmed', 'interested', 'cancelled', 'cancel_rate', 'visitors', 'showup', 'expected_visitors', 'cost_per_registration', 'cost_per_visitor', 'cost_per_expected_visitor', 'opt_outs', 'opt_out_rate', 'open_rate'])) }; } },
    { name: 'get_bets', description: 'Each bet: test vs comparison rates, lift, how sure, extra registrations, expected extra attendees (A), cost per extra, next-tranche cost, cap, evidence gaps, decision (Scale/Keep/Change/Stop/Too early) and the suggested reserve release.', inputSchema: { type: 'object', properties: { as_of: D } }, execute: i => { const d = dateArg(i.as_of); return { as_of: d, bets: E.betRows(S.ds, d, A()).map(b => { const x = Object.assign({}, b); delete x.basis; return x; }), reserve: E.reservePlan(S.ds, d, A()) }; } },
    { name: 'get_forecast', description: 'Outside-attendee forecast at a date: bad luck (1 in 10 runs worse), most likely, good luck, the target, and the verdict (Safe / Ahead, not safe yet / Off track). Optionally test moving money now: release reserve to a bet, or move budget between campaigns, and see the forecast after.', inputSchema: { type: 'object', properties: { as_of: D, release_to_bet: { type: 'string', description: 'Bet ID or name to release reserve to' }, amount: { type: 'number', description: 'INR' }, move_from: { type: 'string', description: 'Campaign to move budget from' }, move_to: { type: 'string', description: 'Campaign to move budget to' } } }, execute: i => { const d = dateArg(i.as_of), base = E.forecast(S.ds, d, A()); let kind = null, p = null; if (i.release_to_bet && i.amount) { kind = 'release_reserve'; p = { kind, campaign_id: campArg(i.release_to_bet), amount: Number(i.amount) }; } else if (i.move_from && i.move_to && i.amount) { kind = 'move_budget'; p = { kind, campaign_id: campArg(i.move_from), to: campArg(i.move_to), amount: Number(i.amount) }; } const pk = f => pick(f, ['mode', 'bad', 'likely', 'good', 'verdict', 'target', 'stretch', 'chance', 'basis']); if (!p) return { as_of: d, forecast: pk(base) }; const keep = S.asOf; S.asOf = d; const bets = E.betRows(S.ds, d, A()), rows = E.campaignRows(S.ds, d, { assumptions: A() }), next = id => { const b = bets.find(x => x.campaign_id === id); if (b) return b.next_tranche_cost; const r = rows.find(x => x.campaign_id === id); return r && r.cost_per_expected_visitor ? r.cost_per_expected_visitor / A().scale_factor.value : null; }; S.asOf = keep; const extra = kind === 'release_reserve' ? [{ amount: p.amount, cost: next(p.campaign_id) }] : [{ amount: -p.amount, cost: next(p.campaign_id) }, { amount: p.amount, cost: next(p.to) }]; return { as_of: d, before: pk(base), after: pk(E.forecast(S.ds, d, A(), { extra: extra.filter(x => x.cost) })), assumption: 'Each rupee buys extra attendees at the bet\'s next extra attendee cost, delivering 50–100% of it (most likely 80%).', note: 'Estimate. Nothing has changed; use propose_action to do it.' }; } },
    { name: 'calculate', description: 'Exact arithmetic: + - * / ^ ( ) and % as percent. Example: "(84300/238)-250".', inputSchema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] }, execute: i => ({ expression: String(i.expression), result: E.calculate(i.expression) }) },
    { name: 'propose_action', description: 'Open a confirmation panel for an action. Nothing changes until the user confirms.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(KINDS) }, campaign_id: { type: 'string' }, to_campaign_id: { type: 'string', description: 'For move_budget' }, amount: { type: 'number', description: 'INR' }, title: { type: 'string', description: 'Short task title' }, owner_id: { type: 'string', description: 'T03-T06, GL growth lead, SEC security/operations, CORE fest core team; default the campaign owner' }, due_date: { type: 'string' }, review_date: { type: 'string' }, reason: { type: 'string' }, expected_result: { type: 'string' }, metric_to_check: { type: 'string', enum: Object.keys(METRICS) } }, required: ['action', 'title', 'reason'] },
      execute: i => { if (!KINDS[i.action]) throw new Error('Unknown action'); const cid = i.campaign_id ? campArg(i.campaign_id) : '', to = i.to_campaign_id ? campArg(i.to_campaign_id) : '', c = S.ds.camps.get(cid), owner = i.owner_id && owners()[i.owner_id] ? i.owner_id : (c ? c.owner_id : 'GL');
        setTimeout(() => openDraft({ kind: i.action, campaign_id: cid || '', to, amount: Number(i.amount) || 0, title: String(i.title).slice(0, 160), owner, due: isDate(i.due_date) ? i.due_date : E.addDays(S.asOf, 3), review_date: isDate(i.review_date) ? i.review_date : undefined, reason: String(i.reason || ''), expected: String(i.expected_result || ''), metric: i.metric_to_check && METRICS[i.metric_to_check] ? { key: i.metric_to_check, campaign_id: cid || null } : null, source: 'analyst' }), 0);
        return { shown_to_user: true, applied: false, note: 'A confirmation panel is open. The user must press Confirm.' }; } },
    { name: 'query_data', description: 'Count, sum, average, min or max over a table at a date, with filters and grouping, for questions other tools do not cover. Tables: ' + Object.keys(E.QUERY_TABLES).join(', ') + '. A bad field returns the field list.', inputSchema: { type: 'object', properties: { table: { type: 'string', enum: Object.keys(E.QUERY_TABLES) }, as_of: D, filters: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, op: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'in', 'contains'] }, value: { type: 'string', description: 'Value to compare with; numbers as digits' } } } }, group_by: { type: 'array', items: { type: 'string' } }, aggregate: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'] }, field: { type: 'string' }, limit: { type: 'number' } }, required: ['table'] }, execute: i => E.query(S.ds, dateArg(i.as_of), { table: i.table, filters: (Array.isArray(i.filters) ? i.filters : []).map(f => Object.assign({}, f, { value: typeof f.value === 'string' && /^-?\d+(\.\d+)?$/.test(f.value.trim()) ? Number(f.value) : f.value === 'true' ? true : f.value === 'false' ? false : f.value })), group_by: Array.isArray(i.group_by) ? i.group_by : [], aggregate: i.aggregate || 'count', field: i.field, limit: Number(i.limit) || 25 }) },
    { name: 'get_signals', description: 'Watch/Warn/Act signals at a date: one-line reason with its number, evidence, why it matters, what happens if we do nothing, owner and suggested action.', inputSchema: { type: 'object', properties: { as_of: D } }, execute: i => E.flags(S.ds, dateArg(i.as_of), rules(), A()) },
    { name: 'what_if_move_budget', description: 'Estimate visitors lost and gained if spend moves between two campaigns, with diminishing returns (A).', inputSchema: { type: 'object', properties: { from_campaign: { type: 'string' }, to_campaign: { type: 'string' }, amount: { type: 'number' }, as_of: D }, required: ['from_campaign', 'to_campaign', 'amount'] }, execute: i => E.whatIf(S.ds, dateArg(i.as_of), campArg(i.from_campaign), campArg(i.to_campaign), Number(i.amount) || 0, A()) },
    { name: 'explain_change', description: 'What changed between two dates: new registrations, cancellations, visitors, spend, and by campaign.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] }, execute: i => E.explainChange(S.ds, dateArg(i.from), dateArg(i.to), { assumptions: A() }) },
    { name: 'get_funnel', description: 'Funnel at a date, the same four steps every year: responded → registered → confirmed → attended (expected before the fest), with step rates, cost each and targets; plus anonymous ad traffic.', inputSchema: { type: 'object', properties: { as_of: D, campaign_id: C } }, execute: i => { const d = dateArg(i.as_of), cid = campArg(i.campaign_id); return { funnel: E.funnelView(S.ds, d, A(), cid), anonymous: E.anonFunnel(S.ds, d, cid) }; } },
    { name: 'get_trend', description: 'Daily or weekly values and running totals of one metric between two dates.', inputSchema: { type: 'object', properties: { metric: { type: 'string', enum: ['registrations', 'identified', 'spend', 'visitors', 'form_starts', 'sessions', 'cancellations'] }, grain: { type: 'string', enum: ['day', 'week'] }, from: { type: 'string' }, to: { type: 'string' }, campaign_id: C }, required: ['metric'] }, execute: i => { const r = E.trend(S.ds, i.metric, i.grain === 'day' ? 'day' : 'week', isDate(i.from) ? i.from : S.ds.event.start, dateArg(i.to), campArg(i.campaign_id)); if (r.rows && r.rows.length > 70) r.rows = r.rows.slice(-70); return r; } },
    { name: 'get_event_days', description: 'Event-day facts: visitors per day, both days, hourly entries, peak vs assumed gate capacity, check-in quality.', inputSchema: { type: 'object', properties: { as_of: D } }, execute: i => E.dayStats(S.ds, dateArg(i.as_of), A()) },
    { name: 'get_tasks_and_settings', description: 'Tasks (owner, due, status), logged decisions with before/now numbers, assumptions, thresholds and data cleaning.', inputSchema: { type: 'object', properties: {} }, execute: () => ({ tasks: S.tasks.filter(t => (t.base || '25') === baseOf()).map(t => ({ title: t.title, owner: ownerLabel(t.owner), due: t.due, status: t.status })), decisions: S.decisions.filter(d => (d.base || '25') === baseOf()).map(d => ({ title: d.title, decided: d.as_of, review: d.review_date, status: d.status, outcome: d.outcome || null, watching: metricLabel(d.metric), before: d.metric ? d.metric.before : null, now: metricNow(d.metric) })), plan_decisions: sim() ? E.planDecisionsAt(S.ds, S.asOf).map(p => pick(p, ['decided_at', 'title', 'reason', 'review_at'])) : [], assumptions: Object.fromEntries(Object.entries(A()).map(([k, a]) => [k, { value: a.value, range: [a.low, a.high], evidence: a.evidence }])), quality: E.quality(S.ds, S.asOf) }) }
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
const relay = { modelIndex: 0 };
function makeRelaySample() {
  const f = async (input, opts = {}) => {
    const sys = input[0].content, contents = [];
    input.slice(1).forEach(t => { const role = t.role === 'assistant' ? 'model' : 'user', last = contents[contents.length - 1]; if (last && last.role === role) last.parts[0].text += '\n\n' + t.content; else contents.push({ role, parts: [{ text: t.content }] }); });
    const decls = (opts.tools || []).map(t => { const d = { name: t.name, description: t.description }, p = t.inputSchema ? gSchema(t.inputSchema) : null; if (p && p.properties) d.parameters = p; return d; });
    const byName = Object.fromEntries((opts.tools || []).map(t => [t.name, t]));
    let text = '';
    for (let round = 0; round < 7; round++) {
      if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', text };
      let r, j, tries = 0;
      while (true) {
        try { r = await fetch('api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system: sys, contents, tools: round === 6 ? [] : decls, modelIndex: relay.modelIndex }), signal: opts.signal }); }
        catch (e) { throw { code: opts.signal && opts.signal.aborted ? 'cancelled' : 'upstream_error', message: String(e), text }; }
        j = await r.json().catch(() => ({}));
        const busy = r.status === 504 || (r.status === 503 && j.error && j.error.code === 'busy');
        if (!busy || tries >= 6 || (j.error && j.error.exhausted)) break;
        tries++; relay.modelIndex = j.error && j.error.next !== undefined ? j.error.next : relay.modelIndex + 1;
        if (opts.onStatus) opts.onStatus('That model is busy, switching to another…');
        await new Promise(res => setTimeout(res, 800));
        if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', text };
      }
      if (r.ok && j.modelIndex !== undefined) relay.modelIndex = j.modelIndex;
      if (r.status === 503 || r.status === 504) { relay.modelIndex = 0; throw { code: 'upstream_error', message: 'No AI model answered. Last reason: ' + (r.status === 504 ? 'server time limit' : ((j.error && j.error.message) || 'busy')) + (j.model ? ' [' + j.model + ']' : ''), text }; }
      if (!r.ok) throw { code: r.status === 429 ? 'rate_limited' : (j.error && j.error.code === 'no_key') ? 'sampling_disabled' : r.status === 413 ? 'prompt_too_large' : 'upstream_error', message: (j.error && j.error.message) || 'HTTP ' + r.status, text };
      const c = j.content;
      if ((!c || !c.parts || !c.parts.length) && !text && !relay.emptyRetry) { relay.emptyRetry = true; round--; continue; }
      relay.emptyRetry = false;
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
    const res = await chat.sample([{ role: 'user', content: RULES() }].concat(chat.turns), { tools: tl, signal: ctl.signal, onStatus: m => { if (!text) out.textContent = m; }, onText: ({ text: t }) => { text = t; richText(out, t); $('#msgs').scrollTop = 1e9; } });
    text = res.text; richText(out, text); chat.turns.push({ role: 'assistant', content: text });
    if (res.truncated) chatNote('Cut short. Ask for less at a time.');
  } catch (e) {
    const keep = e && e.text; if (keep) richText(out, keep); else out.remove();
    chatNote({ cancelled: 'Stopped.', not_granted: 'The analyst needs permission to use Claude. Reload and allow it.', rate_limited: 'Too many questions right now. Try again in a minute.', session_expired: 'Please sign in to Claude again.', refused: 'Claude declined that. Try rephrasing.', sampling_disabled: 'Claude is not available for this account.', prompt_too_large: 'Too much at once. Start a new chat.' }[e && e.code] || 'Something went wrong (' + ((e && e.code) || 'error') + (e && e.message ? ': ' + String(e.message).slice(0, 240) : '') + '). Try again.');
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
  loadBase('25').then(() => { S.cache.ly = null; render(); }).catch(() => {});
}
start();
}
