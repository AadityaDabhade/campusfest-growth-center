/* CampusFest Growth Center: metrics engine.
   Pure functions over the source tables. The dashboard and the AI analyst both read only from here. */
(function (root) {
  'use strict';

  const TABLES = ['event', 'targets', 'campaigns', 'daily', 'people', 'interactions', 'registrations', 'reg_history', 'checkins', 'pace_curve'];
  const SHEETS = { event: 'Event', targets: 'Targets', campaigns: 'Campaigns', daily: 'Daily Marketing', people: 'People', interactions: 'Interest and Engagement', registrations: 'Registrations', reg_history: 'Registration History', checkins: 'Check-ins', pace_curve: 'Pace Curve' };
  const KEYS = { daily: 'activity_id', reg_history: 'history_id', checkins: 'event_id', interactions: 'interaction_id', people: 'person_id', registrations: 'registration_id', campaigns: 'campaign_id' };
  const REQUIRED = {
    event: ['event_name', 'history_start', 'history_end', 'event_starts_at', 'event_ends_at'],
    targets: ['effective_at', 'identified_external_people_goal', 'registration_goal', 'unique_external_visitors_goal', 'marketing_budget_inr'],
    campaigns: ['campaign_id', 'campaign_name', 'channel'],
    daily: ['activity_id', 'campaign_id', 'activity_date', 'marketing_spend_inr'],
    people: ['person_id', 'person_type', 'first_seen_at'],
    interactions: ['interaction_id', 'person_id', 'occurred_at', 'event_type'],
    registrations: ['registration_id', 'person_id', 'registered_at'],
    reg_history: ['history_id', 'registration_id', 'effective_at', 'status'],
    checkins: ['event_id', 'person_id', 'occurred_at', 'result', 'verification'],
    pace_curve: ['week', 'share']
  };
  const TIME_FIELDS = { event: ['history_start', 'history_end', 'event_starts_at', 'event_ends_at', 'plan_start', 'registration_opens'], targets: ['effective_at'], campaigns: ['created_at', 'planned_start_at', 'planned_end_at'], daily: ['activity_date'], people: ['first_seen_at'], interactions: ['occurred_at'], registrations: ['registered_at'], reg_history: ['effective_at'], checkins: ['occurred_at'] };
  const NUM_FIELDS = { pace_curve: ['week', 'share'], event: ['reserve_inr', 'tranche_inr'], targets: ['identified_external_people_goal', 'registration_goal', 'unique_external_visitors_goal', 'marketing_budget_inr', 'stretch_registration_goal', 'stretch_visitors_goal', 'all_attendees_base', 'all_attendees_stretch'], daily: ['impressions', 'clicks', 'reported_reach', 'landing_page_sessions', 'registration_starts', 'marketing_spend_inr'], campaigns: ['planned_budget_inr', 'cost_cap_inr', 'scale_factor', 'bet_rank', 'reserve_released_inr'] };
  const ACTIVE = ['confirmed', 'interested', 'waitlisted'];
  const DEFAULT_OWNERS = { T03: 'Meera Iyer', T04: 'Arjun Verma', T05: 'Nisha Rao', T06: 'Dev Malhotra' };

  /* ---------- time helpers (all source times are IST wall-clock) ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function normTime(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) { // Excel serial day
      const ms = Math.round((v - 25569) * 86400000);
      const d = new Date(ms);
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
    }
    let s = String(v).trim().replace(' ', 'T');
    s = s.replace(/(Z|[+-]\d\d:?\d\d)$/, '');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):?(\d{2})?:?(\d{2})?)?/);
    if (!m) return null;
    return m[1] + '-' + m[2] + '-' + m[3] + 'T' + (m[4] || '00') + ':' + (m[5] || '00') + ':' + (m[6] || '00');
  }
  function day(t) { return t ? t.slice(0, 10) : null; }
  function cutoff(D) { return D + 'T23:59:59'; }
  function addDays(D, n) { const d = new Date(D + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function weekStart(D) { const d = new Date(D + 'T00:00:00Z'); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); return d.toISOString().slice(0, 10); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round(v, p) { if (v === null || v === undefined || !isFinite(v)) return null; const f = Math.pow(10, p || 0); return Math.round(v * f) / f; }
  function div(a, b) { return b ? a / b : null; }
  function nf(n) { return n === null || n === undefined || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-IN'); }
  function rs(n) { return n === null || n === undefined || !isFinite(n) ? '–' : '₹' + (Math.abs(n) < 1000 && n % 1 ? n.toFixed(1) : Math.round(n).toLocaleString('en-IN')); }

  /* ---------- loading, validation, cleaning ---------- */
  function rowsToObjects(arr) {
    if (!Array.isArray(arr) || !arr.length) return [];
    if (!Array.isArray(arr[0])) return arr.map(o => Object.assign({}, o));
    const h = arr[0];
    return arr.slice(1).map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i] === undefined ? null : r[i]; }); return o; });
  }

  function validate(raw) {
    const errors = [], warnings = [];
    TABLES.forEach(t => {
      const rows = raw[t];
      if (!rows || !rows.length) { if (t === 'pace_curve') return; (t === 'event' || t === 'people') ? errors.push(SHEETS[t] + ': missing or empty') : warnings.push(SHEETS[t] + (t === 'checkins' ? ': no check-ins yet' : ': missing or empty')); return; }
      const cols = Object.keys(rows[0]);
      const miss = REQUIRED[t].filter(c => !cols.includes(c));
      if (miss.length) errors.push(SHEETS[t] + ': missing columns ' + miss.join(', '));
    });
    return { ok: !errors.length, errors, warnings };
  }

  function clean(raw) {
    const out = {}, dups = {};
    TABLES.forEach(t => {
      let rows = (raw[t] || []).map(r => Object.assign({}, r));
      (TIME_FIELDS[t] || []).forEach(f => rows.forEach(r => { if (f in r) r[f] = normTime(r[f]); }));
      (NUM_FIELDS[t] || []).forEach(f => rows.forEach(r => { if (f in r && r[f] !== null && r[f] !== '') r[f] = num(r[f]); }));
      const k = KEYS[t];
      if (k) {
        const seen = new Set(), keep = [];
        rows.forEach(r => { const id = r[k]; if (id === null || id === undefined) { keep.push(r); return; } if (seen.has(id)) return; seen.add(id); keep.push(r); });
        dups[t] = rows.length - keep.length; rows = keep;
      }
      out[t] = rows;
    });
    return { tables: out, dups };
  }

  /* Edits are an overlay on the source tables: they never change the original file. */
  function applyEdits(raw, edits) {
    const t = {}; TABLES.forEach(k => { t[k] = (raw[k] || []).slice(); });
    (edits || []).forEach(e => {
      const p = e.payload || {};
      try {
        if (e.type === 'campaign_update') {
          t.campaigns = t.campaigns.map(c => c.campaign_id === p.campaign_id ? Object.assign({}, c, p.fields) : c);
        } else if (e.type === 'campaign_add') {
          t.campaigns.push(Object.assign({}, p));
        } else if (e.type === 'spend_add') {
          t.daily.push(Object.assign({ activity_id: e.id, impressions: 0, clicks: 0, reported_reach: 0, landing_page_sessions: 0, registration_starts: 0, platform: 'manual entry' }, p));
        } else if (e.type === 'status_change') {
          const reg = t.registrations.find(r => r.registration_id === p.registration_id);
          t.reg_history.push({ history_id: e.id, registration_id: p.registration_id, person_id: reg ? reg.person_id : p.person_id, campaign_id: reg ? reg.campaign_id : null, effective_at: p.effective_at, status: p.status });
        } else if (e.type === 'checkin_add') {
          t.checkins.push(Object.assign({ event_id: e.id, result: 'admitted', verification: 'verified', source: 'manual' }, p));
        } else if (e.type === 'target_add') {
          t.targets.push(Object.assign({}, p));
        } else if (e.type === 'registration_add') {
          if (p.person && !t.people.find(x => x.person_id === p.person.person_id)) t.people.push(Object.assign({}, p.person));
          t.registrations.push(Object.assign({ registration_id: e.id }, p.registration));
          if (p.status) t.reg_history.push({ history_id: e.id + 'h', registration_id: p.registration.registration_id || e.id, person_id: p.registration.person_id, campaign_id: p.registration.campaign_id, effective_at: p.registration.registered_at, status: p.status });
        }
      } catch (err) { /* a bad edit is skipped, never fatal */ }
    });
    return t;
  }

  function build(raw, opts) {
    const v = validate(raw);
    const c = clean(raw);
    const tb = c.tables;
    const ev = tb.event[0] || {};
    const ds = { tables: tb, dups: c.dups, validation: v, details: (opts && opts.details) || [], label: (opts && opts.label) || 'Dataset', _cache: new Map() };
    ds.event = {
      name: ev.event_name || 'Event', start: day(ev.history_start), end: day(ev.history_end),
      eventStart: ev.event_starts_at, eventEnd: ev.event_ends_at, eventStartDay: day(ev.event_starts_at), eventEndDay: day(ev.event_ends_at),
      timezone: ev.timezone || 'Asia/Kolkata', currency: ev.currency || 'INR',
      simulated: ev.simulated === true || ev.simulated === 'TRUE' || ev.simulated === 1, city: ev.city || null,
      planStart: day(ev.plan_start), regOpens: day(ev.registration_opens), reserve: num(ev.reserve_inr), tranche: num(ev.tranche_inr)
    };
    ds.paceCurve = (tb.pace_curve || []).map(r => ({ week: num(r.week), share: num(r.share) })).filter(r => r.week).sort((a, b) => a.week - b.week);
    if (ds.paceCurve.length && !ds.event.planStart) ds.event.planStart = ds.event.start;
    ds.camps = new Map(); tb.campaigns.forEach(x => ds.camps.set(x.campaign_id, x));
    ds.owners = Object.assign({}, DEFAULT_OWNERS);
    tb.campaigns.forEach(x => { if (x.owner_id && x.owner_name) ds.owners[x.owner_id] = x.owner_name; });
    tb.people.forEach(x => { if (x.owner_id && x.owner_name) ds.owners[x.owner_id] = x.owner_name; });
    ds.people = new Map(); tb.people.forEach(x => ds.people.set(x.person_id, x));
    ds.ext = new Set(tb.people.filter(x => x.person_type === 'external').map(x => x.person_id));
    ds.host = new Set(tb.people.filter(x => x.person_type === 'host').map(x => x.person_id));
    ds.regs = tb.registrations.slice().sort((a, b) => (a.registered_at || '').localeCompare(b.registered_at || ''));
    ds.hist = new Map();
    tb.reg_history.slice().sort((a, b) => ((a.effective_at || '') + a.history_id).localeCompare((b.effective_at || '') + b.history_id))
      .forEach(h => { if (!ds.hist.has(h.registration_id)) ds.hist.set(h.registration_id, []); ds.hist.get(h.registration_id).push(h); });
    ds.lastDataDay = {};
    TABLES.forEach(t => { const f = (TIME_FIELDS[t] || [])[0]; if (!f || t === 'event' || t === 'campaigns' || t === 'targets') return; let mx = null; tb[t].forEach(r => { if (r[f] && (!mx || r[f] > mx)) mx = r[f]; }); ds.lastDataDay[t] = day(mx); });
    return ds;
  }

  function campName(ds, id) { if (!id) return 'No campaign (walk-in / unattributed)'; const c = ds.camps.get(id); return c ? c.campaign_name : id; }
  function ownerName(ds, id) { return ds.owners[id] || id || 'Growth lead'; }

  /* ---------- the snapshot: everything known at the end of day D ---------- */
  function statusAt(ds, regId, cut) {
    const h = ds.hist.get(regId); if (!h) return 'interested';
    let s = null; for (const x of h) { if (x.effective_at && x.effective_at <= cut) s = x.status; else if (x.effective_at > cut) break; }
    return s || 'interested';
  }

  function targetAt(ds, D) {
    const cut = cutoff(D);
    const ts = ds.tables.targets.slice().sort((a, b) => (a.effective_at || '').localeCompare(b.effective_at || ''));
    let t = null; ts.forEach(x => { if (x.effective_at <= cut) t = x; });
    return t;
  }

  function snapshot(ds, D) {
    if (ds._cache.has(D)) return ds._cache.get(D);
    const cut = cutoff(D), tb = ds.tables;
    const s = { D, cut };
    // people
    s.identified = 0; s.identifiedByFirst = {};
    tb.people.forEach(p => { if (p.person_type === 'external' && p.first_seen_at && p.first_seen_at <= cut) { s.identified++; const k = p.first_campaign_id || null; s.identifiedByFirst[k] = (s.identifiedByFirst[k] || 0) + 1; } });
    s.excluded = {}; tb.people.forEach(p => { if (p.person_type !== 'external' && p.first_seen_at && p.first_seen_at <= cut) s.excluded[p.person_type] = (s.excluded[p.person_type] || 0) + 1; });
    // registrations with latest status
    s.regs = []; s.regByPerson = new Map(); s.hostReg = new Map();
    ds.regs.forEach(r => {
      if (!r.registered_at || r.registered_at > cut) return;
      if (ds.host.has(r.person_id)) { if (!s.hostReg.has(r.person_id)) s.hostReg.set(r.person_id, { registration_id: r.registration_id, person_id: r.person_id, campaign_id: r.campaign_id || null, status: statusAt(ds, r.registration_id, cut) }); return; }
      if (!ds.ext.has(r.person_id)) return;
      const x = { registration_id: r.registration_id, person_id: r.person_id, campaign_id: r.campaign_id || null, registered_at: r.registered_at, status: statusAt(ds, r.registration_id, cut) };
      s.regs.push(x); if (!s.regByPerson.has(r.person_id)) s.regByPerson.set(r.person_id, x);
    });
    s.registered = s.regByPerson.size;
    s.status = { confirmed: 0, interested: 0, waitlisted: 0, cancelled: 0 };
    s.regByPerson.forEach(x => { s.status[x.status] = (s.status[x.status] || 0) + 1; });
    s.active = ACTIVE.reduce((a, k) => a + (s.status[k] || 0), 0);
    // check-ins
    s.visitors = new Map(); s.entries = 0; s.hourly = {}; s.byDay = {}; s.chk = { denied: 0, pending: 0, unverified: 0, manual: 0, unattributed: 0, nonExternal: 0, total: 0 };
    tb.checkins.forEach(c => {
      if (!c.occurred_at || c.occurred_at > cut) return;
      s.chk.total++;
      if (c.result === 'denied') s.chk.denied++; if (c.result === 'pending') s.chk.pending++; if (c.verification !== 'verified') s.chk.unverified++;
      if (c.source === 'manual') s.chk.manual++; if (!c.campaign_id) s.chk.unattributed++;
      if (c.result !== 'admitted' || c.verification !== 'verified') return;
      if (!ds.ext.has(c.person_id)) { s.chk.nonExternal++; return; }
      s.entries++;
      const h = c.occurred_at.slice(0, 13); s.hourly[h] = (s.hourly[h] || 0) + 1;
      const d = day(c.occurred_at); if (!s.byDay[d]) s.byDay[d] = new Set(); s.byDay[d].add(c.person_id);
      const prev = s.visitors.get(c.person_id); if (!prev || c.occurred_at < prev) s.visitors.set(c.person_id, c.occurred_at);
    });
    s.visitorCount = s.visitors.size;
    s.visitorsRegistered = 0; s.visitors.forEach((t, p) => { if (s.regByPerson.has(p)) s.visitorsRegistered++; });
    s.walkins = s.visitorCount - s.visitorsRegistered;
    s.showup = div(s.visitorsRegistered, s.registered);
    // spend and anonymous funnel
    s.spend = 0; s.anon = {}; s.negativeSpendRows = 0;
    tb.daily.forEach(r => {
      const d = day(r.activity_date); if (!d || d > D) return;
      const k = r.campaign_id || null; if (!s.anon[k]) s.anon[k] = { spend: 0, impressions: 0, clicks: 0, reach: 0, sessions: 0, starts: 0, days: 0 };
      const a = s.anon[k]; a.spend += num(r.marketing_spend_inr); a.impressions += num(r.impressions); a.clicks += num(r.clicks); a.reach += num(r.reported_reach); a.sessions += num(r.landing_page_sessions); a.starts += num(r.registration_starts); a.days++;
      s.spend += num(r.marketing_spend_inr); if (num(r.marketing_spend_inr) < 0) s.negativeSpendRows++;
    });
    // identified actions
    s.ia = {}; s.iaPeople = {}; s.iaPeopleByCamp = {};
    tb.interactions.forEach(i => {
      if (!i.occurred_at || i.occurred_at > cut || !ds.ext.has(i.person_id)) return;
      const t = i.event_type, k = i.campaign_id || null;
      if (!s.ia[k]) s.ia[k] = {}; s.ia[k][t] = (s.ia[k][t] || 0) + 1;
      if (!s.iaPeople[t]) s.iaPeople[t] = new Set(); s.iaPeople[t].add(i.person_id);
      const kk = k + '|' + t; if (!s.iaPeopleByCamp[kk]) s.iaPeopleByCamp[kk] = new Set(); s.iaPeopleByCamp[kk].add(i.person_id);
      if (!s.iaPeople.any) s.iaPeople.any = new Set(); s.iaPeople.any.add(i.person_id);
    });
    s.target = targetAt(ds, D);
    ds._cache.set(D, s);
    return s;
  }

  /* ---------- assumptions (editable in the app, always labelled A) ---------- */
  const DEFAULT_ASSUMPTIONS = {
    showup_confirmed: { value: 0.75, low: 0.65, high: 0.85, label: 'Show-up of confirmed registrations', tag: 'A' },
    showup_interested: { value: 0.40, low: 0.30, high: 0.50, label: 'Show-up of interested (unconfirmed) registrations', tag: 'A' },
    showup_waitlisted: { value: 0.25, low: 0.15, high: 0.35, label: 'Show-up of waitlisted registrations', tag: 'A' },
    walkin_share: { value: 0.06, low: 0.04, high: 0.08, label: 'Walk-ins as a share of all visitors', tag: 'A' },
    scale_factor: { value: 0.5, low: 0.4, high: 0.7, label: 'How well extra spend scales (1 = no diminishing returns)', tag: 'A' },
    cost_cap: { value: 250, low: 200, high: 300, label: 'Cost cap per verified visitor (₹)', tag: 'A' },
    gate_capacity: { value: 500, low: 400, high: 600, label: 'Safe gate arrivals per hour (2025 venue)', tag: 'A' }
  };
  function A(assump, k, which) { const a = (assump && assump[k]) || DEFAULT_ASSUMPTIONS[k]; return a[which || 'value']; }

  /* ---------- core views ---------- */
  function attributionOf(ds, s, person, mode) {
    if (mode === 'first') { const p = ds.people.get(person); return p ? (p.first_campaign_id || null) : null; }
    const r = s.regByPerson.get(person); return r ? r.campaign_id : null;
  }

  function weekOf(ds, D) { return ds.event.planStart ? Math.floor(daysBetween(ds.event.planStart, D) / 7) + 1 : null; }
  function shareAt(ds, D) {
    const c = ds.paceCurve; if (!c.length || !ds.event.planStart) return null;
    const w = (daysBetween(ds.event.planStart, D) + 1) / 7; // weeks completed by the end of D
    if (w <= c[0].week) return c[0].share * Math.max(0, w / c[0].week);
    for (let i = 1; i < c.length; i++) if (w <= c[i].week) { const a = c[i - 1], b = c[i]; return a.share + (b.share - a.share) * (w - a.week) / (b.week - a.week); }
    return c[c.length - 1].share;
  }
  function perRegistrant(s, assump, w) {
    const n = s.registered; if (!n) return null;
    return (s.status.confirmed * A(assump, 'showup_confirmed', w) + s.status.interested * A(assump, 'showup_interested', w) + s.status.waitlisted * A(assump, 'showup_waitlisted', w)) / n;
  }
  function projection(ds, D, assump) {
    const s = snapshot(ds, D);
    const ended = D >= ds.event.eventEndDay, started = D >= ds.event.eventStartDay;
    if (ended) return { mode: 'actual', actual: s.visitorCount, low: s.visitorCount, likely: s.visitorCount, high: s.visitorCount, basis: 'Verified check-ins (S)' };
    const sh = shareAt(ds, D);
    if (sh !== null && !started) {
      if (sh < 0.1) return { mode: 'too early', actual: 0, low: null, likely: null, high: null, basis: 'Under 10% of registrations expected so far: too early to project (A)' };
      const finalRegs = s.registered / sh;
      const f = w => Math.round(finalRegs * (perRegistrant(s, assump, w) || 0) / (1 - A(assump, 'walkin_share', w)));
      return { mode: 'forecast', actual: 0, low: Math.round(f('low') * 0.9), likely: f('value'), high: Math.round(f('high') * 1.1), projected_registrations: Math.round(finalRegs), basis: 'Registrations so far ÷ share expected by this week on the pace curve, × show-up by status, + walk-ins (A)' };
    }
    const exp = w => (s.status.confirmed * A(assump, 'showup_confirmed', w) + s.status.interested * A(assump, 'showup_interested', w) + s.status.waitlisted * A(assump, 'showup_waitlisted', w)) / (1 - A(assump, 'walkin_share', w));
    return {
      mode: started ? 'in progress' : 'forecast', actual: s.visitorCount,
      low: Math.max(s.visitorCount, Math.round(exp('low'))), likely: Math.max(s.visitorCount, Math.round(exp('value'))), high: Math.max(s.visitorCount, Math.round(exp('high'))),
      basis: 'Active registrations × show-up rates by status + walk-in share (A)'
    };
  }

  function kpis(ds, D, assump) {
    const s = snapshot(ds, D), t = s.target;
    const proj = projection(ds, D, assump);
    const g = t ? { identified: t.identified_external_people_goal || null, registered: t.registration_goal, visitors: t.unique_external_visitors_goal, budget: t.marketing_budget_inr, version: t.target_version, since: t.effective_at, stretch_registered: t.stretch_registration_goal || null, stretch_visitors: t.stretch_visitors_goal || null, all_attendees_base: t.all_attendees_base || null, all_attendees_stretch: t.all_attendees_stretch || null } : null;
    return {
      asOf: D, dataset: ds.label, target: g,
      identified: s.identified, registered: s.registered, active: s.active, status: Object.assign({}, s.status),
      visitors: s.visitorCount, visitorsRegistered: s.visitorsRegistered, walkins: s.walkins,
      showup: round(s.showup, 4), walkinShare: round(div(s.walkins, s.visitorCount), 4),
      spend: s.spend, budgetUsed: g ? round(div(s.spend, g.budget), 4) : null,
      costPerVisitor: round(div(s.spend, s.visitorCount), 1), costPerRegistration: round(div(s.spend, s.registered), 1),
      week: weekOf(ds, D),
      attainment: g ? { identified: round(div(s.identified, g.identified), 4), registered: round(div(s.registered, g.registered), 4), visitors: round(div(s.visitorCount, g.visitors), 4) } : null,
      projection: proj
    };
  }

  function campaignRows(ds, D, opts) {
    const o = Object.assign({ attribution: 'registration' }, opts || {});
    const s = snapshot(ds, D), assump = o.assumptions;
    const ids = Array.from(ds.camps.keys()).concat([null]);
    const rows = ids.map(id => {
      const c = ds.camps.get(id) || {};
      const a = s.anon[id] || { spend: 0, impressions: 0, clicks: 0, reach: 0, sessions: 0, starts: 0 };
      const st = { confirmed: 0, interested: 0, waitlisted: 0, cancelled: 0 }; let registered = 0;
      const M = c.audience_type === 'host' ? s.hostReg : s.regByPerson;
      M.forEach((r, p) => { const at = o.attribution === 'first' ? ((ds.people.get(p) || {}).first_campaign_id || null) : r.campaign_id; if (at === id) { registered++; st[r.status] = (st[r.status] || 0) + 1; } });
      let visitors = 0, visReg = 0; s.visitors.forEach((t, p) => { if (attributionOf(ds, s, p, o.attribution) === id) { visitors++; if (s.regByPerson.has(p)) visReg++; } });
      const ia = s.ia[id] || {};
      const pc = t => (s.iaPeopleByCamp[id + '|' + t] || new Set()).size;
      const expected = st.confirmed * A(assump, 'showup_confirmed') + st.interested * A(assump, 'showup_interested') + st.waitlisted * A(assump, 'showup_waitlisted');
      return {
        campaign_id: id, campaign: campName(ds, id), channel: c.channel || (id ? '' : 'none'), owner_id: c.owner_id || null, owner: id ? ownerName(ds, c.owner_id) : 'Growth lead',
        kind: c.kind || (id ? 'channel' : ''), bet_type: c.bet_type || null, audience: c.audience_type === 'host' ? 'our students' : 'outside', cost_cap_inr: c.cost_cap_inr || null, reserve_released_inr: c.reserve_released_inr || 0,
        status: c.status || (id ? 'active' : ''), planned_budget_inr: c.planned_budget_inr || null,
        spend: a.spend, impressions: a.impressions, clicks: a.clicks, sessions: a.sessions, form_starts_anon: a.starts,
        ctr: round(div(a.clicks, a.impressions), 4), session_to_start: round(div(a.starts, a.sessions), 4),
        identified_first_touch: s.identifiedByFirst[id] || 0,
        form_starters: pc('registration_start'),
        registered, active: st.confirmed + st.interested + st.waitlisted, confirmed: st.confirmed, interested: st.interested, waitlisted: st.waitlisted, cancelled: st.cancelled,
        cancel_rate: round(div(st.cancelled, registered), 4),
        visitors, visitors_registered: visReg, showup: round(div(visReg, registered), 4),
        expected_visitors: Math.round(expected),
        cost_per_registration: round(div(a.spend, registered), 1), cost_per_visitor: round(div(a.spend, visitors), 1), cost_per_expected_visitor: round(div(a.spend, expected), 1),
        emails_sent: ia.nurture_email_sent || 0, emails_opened: ia.nurture_email_opened || 0, emails_clicked: ia.nurture_email_clicked || 0,
        open_rate: round(div(ia.nurture_email_opened || 0, ia.nurture_email_sent || 0), 4), click_rate: round(div(ia.nurture_email_clicked || 0, ia.nurture_email_sent || 0), 4),
        opt_outs: pc('opted_out'), opt_out_rate: round(div(pc('opted_out'), pc('nurture_email_sent') || pc('page_visit')), 4),
        questions: ia.event_question_submitted || 0, brochure_downloads: ia.brochure_download || 0
      };
    });
    return rows.filter(r => r.campaign_id !== null || r.registered || r.visitors || r.spend);
  }

  function funnel(ds, D, campaignId) {
    const s = snapshot(ds, D), filt = campaignId !== undefined && campaignId !== 'all';
    const inC = p => { if (!filt) return true; const pp = ds.people.get(p); return pp && (pp.first_campaign_id || null) === (campaignId || null); };
    let identified = 0; ds.tables.people.forEach(p => { if (p.person_type === 'external' && p.first_seen_at && p.first_seen_at <= s.cut && inC(p.person_id)) identified++; });
    const cnt = set => { let n = 0; (set || new Set()).forEach(p => { if (inC(p)) n++; }); return n; };
    let registered = 0, confirmed = 0, active = 0; s.regByPerson.forEach((r, p) => { if (inC(p)) { registered++; if (r.status === 'confirmed') confirmed++; if (ACTIVE.includes(r.status)) active++; } });
    let visited = 0, visitedReg = 0; s.visitors.forEach((t, p) => { if (inC(p)) { visited++; if (s.regByPerson.has(p)) visitedReg++; } });
    const steps = [
      { step: 'Identified people', n: identified },
      { step: 'Engaged (any identified action)', n: cnt(s.iaPeople.any) },
      { step: 'Started the form', n: cnt(s.iaPeople.registration_start) },
      { step: 'Registered', n: registered },
      { step: 'Still active (not cancelled)', n: active },
      { step: 'Confirmed', n: confirmed },
      { step: 'Visited (verified, registered)', n: visitedReg }
    ];
    steps.forEach((x, i) => { x.from_prev = i ? round(div(x.n, steps[i - 1].n), 4) : null; x.from_top = round(div(x.n, steps[0].n), 4); });
    return { asOf: D, campaign: filt ? campName(ds, campaignId) : 'All campaigns', basis: filt ? 'People grouped by first-touch campaign' : 'All external people', steps, walkins: filt ? 0 : s.walkins, visitors_total: visited };
  }

  function anonFunnel(ds, D, campaignId) {
    const s = snapshot(ds, D); const z = { spend: 0, impressions: 0, clicks: 0, reach: 0, sessions: 0, starts: 0 };
    Object.keys(s.anon).forEach(k => { if (campaignId && campaignId !== 'all' && k !== campaignId) return; const a = s.anon[k]; Object.keys(z).forEach(f => z[f] += a[f]); });
    return { asOf: D, note: 'Anonymous events, not people. Reach cannot be added across days.', impressions: z.impressions, clicks: z.clicks, sessions: z.sessions, form_starts: z.starts, ctr: round(div(z.clicks, z.impressions), 4), click_to_session: round(div(z.sessions, z.clicks), 4), session_to_start: round(div(z.starts, z.sessions), 4) };
  }

  function dailySeries(ds, from, to, campaignId) {
    const days = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const idx = new Map(days.map((d, i) => [d, i]));
    const z = () => days.map(() => 0);
    const out = { days, spend: z(), registrations: z(), identified: z(), visitors: z(), form_starts: z(), sessions: z(), cancellations: z() };
    const cf = id => !campaignId || campaignId === 'all' || (id || null) === campaignId;
    ds.tables.daily.forEach(r => { const i = idx.get(day(r.activity_date)); if (i === undefined || !cf(r.campaign_id)) return; out.spend[i] += num(r.marketing_spend_inr); out.form_starts[i] += num(r.registration_starts); out.sessions[i] += num(r.landing_page_sessions); });
    ds.tables.people.forEach(p => { if (p.person_type !== 'external') return; const i = idx.get(day(p.first_seen_at)); if (i !== undefined && cf(p.first_campaign_id)) out.identified[i]++; });
    const firstReg = new Map(); ds.regs.forEach(r => { if (ds.ext.has(r.person_id) && !firstReg.has(r.person_id)) firstReg.set(r.person_id, r); });
    firstReg.forEach(r => { const i = idx.get(day(r.registered_at)); if (i !== undefined && cf(r.campaign_id)) out.registrations[i]++; });
    const firstVisit = new Map(); ds.tables.checkins.forEach(c => { if (c.result === 'admitted' && c.verification === 'verified' && ds.ext.has(c.person_id)) { const p = firstVisit.get(c.person_id); if (!p || c.occurred_at < p) firstVisit.set(c.person_id, c.occurred_at); } });
    firstVisit.forEach((t, p) => { const i = idx.get(day(t)); const r = firstReg.get(p); if (i !== undefined && cf(r ? r.campaign_id : null)) out.visitors[i]++; });
    ds.hist.forEach(h => h.forEach(x => { if (x.status === 'cancelled' && ds.ext.has(x.person_id)) { const i = idx.get(day(x.effective_at)); if (i !== undefined && cf(x.campaign_id)) out.cancellations[i]++; } }));
    return out;
  }

  function trend(ds, metric, grain, from, to, campaignId) {
    const ser = dailySeries(ds, from, to, campaignId);
    if (!ser[metric]) return { error: 'Unknown metric. Use one of: spend, registrations, identified, visitors, form_starts, sessions, cancellations' };
    const rows = []; let cum = 0;
    if (grain === 'week') {
      const m = new Map(); ser.days.forEach((d, i) => { const w = weekStart(d); m.set(w, (m.get(w) || 0) + ser[metric][i]); });
      m.forEach((v, w) => { cum += v; rows.push({ period: 'week of ' + w, value: v, cumulative: cum }); });
    } else ser.days.forEach((d, i) => { cum += ser[metric][i]; rows.push({ period: d, value: ser[metric][i], cumulative: cum }); });
    return { metric, grain: grain || 'day', from, to, campaign: campaignId && campaignId !== 'all' ? campName(ds, campaignId) : 'All', rows };
  }

  function pace(ds, D) {
    const s = snapshot(ds, D), t = s.target; if (!t) return [];
    const sh = shareAt(ds, D);
    if (sh !== null) {
      const bp = t.registration_goal * sh, sp = t.stretch_registration_goal ? t.stretch_registration_goal * sh : null, a = s.registered;
      const level = sh < 0.03 ? 'none' : sp !== null && a >= sp ? 'ok' : a >= bp ? 'watch' : a >= 0.85 * bp ? 'warn' : 'act';
      return [{ key: 'registered', curve: true, goal_label: 'Outside registrations', week: weekOf(ds, D), expected_share: round(sh, 3), actual: a, base_goal: t.registration_goal, stretch_goal: t.stretch_registration_goal || null, base_pace: Math.round(bp), stretch_pace: sp !== null ? Math.round(sp) : null, vs_base: round(div(a, bp), 3), level, rule: 'At or above stretch pace = fine; above base, below stretch = Watch; up to 15% below base = Warn; more than 15% below base = Act' }];
    }
    const ser = dailySeries(ds, addDays(D, -6), D);
    const run = k => ser[k].reduce((a, b) => a + b, 0) / 7;
    const deadline = addDays(ds.event.eventStartDay, -1);
    const left = Math.max(0, daysBetween(D, deadline));
    const mk = (key, label, actual, goal, runKey) => {
      const gap = goal - actual, req = left > 0 ? gap / left : null, rr = runKey ? run(runKey) : null;
      return { key, goal_label: label, goal, actual, gap, attainment: round(div(actual, goal), 4), days_left: left, required_per_day: req !== null ? round(Math.max(0, req), 1) : null, run_rate_7d: rr !== null ? round(rr, 1) : null, on_pace: gap <= 0 ? true : (req && rr !== null ? rr >= req : false) };
    };
    return [
      mk('identified', 'Identified external people', s.identified, t.identified_external_people_goal, 'identified'),
      mk('registered', 'External people registered', s.registered, t.registration_goal, 'registrations'),
      mk('visitors', 'Unique verified external visitors', s.visitorCount, t.unique_external_visitors_goal, null)
    ];
  }

  function budget(ds, D) {
    const s = snapshot(ds, D), t = s.target;
    const total = Math.max(1, daysBetween(ds.event.start, ds.event.eventEndDay));
    const elapsed = Math.min(total, Math.max(0, daysBetween(ds.event.start, D)));
    const approved = t ? t.marketing_budget_inr : null;
    return { asOf: D, approved, spent: s.spend, remaining: approved !== null ? approved - s.spend : null, used: round(div(s.spend, approved), 4), time_elapsed: round(elapsed / total, 4), burn_vs_time: round(div(div(s.spend, approved), elapsed / total), 3), version: t ? t.target_version : null, negative_spend_rows: s.negativeSpendRows };
  }

  function dayStats(ds, D, assump) {
    const s = snapshot(ds, D); const days = Object.keys(s.byDay).sort();
    let both = 0; if (days.length > 1) s.byDay[days[0]].forEach(p => { if (days.slice(1).some(d => s.byDay[d].has(p))) both++; });
    const hours = Object.keys(s.hourly).sort().map(h => ({ hour: h.replace('T', ' ') + ':00', entries: s.hourly[h] }));
    const peak = hours.reduce((m, h) => (!m || h.entries > m.entries ? h : m), null);
    const cap = A(assump, 'gate_capacity');
    return { asOf: D, by_day: days.map(d => ({ day: d, unique_visitors: s.byDay[d].size })), both_days: both, unique_visitors: s.visitorCount, verified_entries: s.entries, entries_per_visitor: round(div(s.entries, s.visitorCount), 2), peak_hour: peak, gate_capacity_assumed: cap, peak_vs_capacity: peak ? round(peak.entries / cap, 3) : null, hours, checkin_quality: Object.assign({}, s.chk) };
  }

  function quality(ds, D) {
    const s = snapshot(ds, D);
    const noHist = ds.regs.filter(r => !ds.hist.has(r.registration_id)).length;
    return { duplicates_removed: Object.assign({}, ds.dups), excluded_people: s.excluded, checkins: Object.assign({}, s.chk), negative_spend_rows: s.negativeSpendRows, registrations_without_status_history: noHist, last_data_day: Object.assign({}, ds.lastDataDay), validation: ds.validation, rules: ['Exact repeated IDs count once', 'Latest status per registration as of the date', 'People counted by ID, not rows', 'Only admitted + verified entries count as visits', 'Only external people count (internal, staff, test excluded)', 'Spend is net of vendor credits', 'Reach is never added across days', 'Campaign credit is a link, not proof of cause'] };
  }

  function explainChange(ds, D1, D2, opts) {
    const a = snapshot(ds, D1), b = snapshot(ds, D2);
    const r1 = campaignRows(ds, D1, opts), r2 = campaignRows(ds, D2, opts);
    const by = r2.map(x => { const y = r1.find(z => z.campaign_id === x.campaign_id) || {}; return { campaign: x.campaign, spend: x.spend - (y.spend || 0), registered: x.registered - (y.registered || 0), cancelled: x.cancelled - (y.cancelled || 0), visitors: x.visitors - (y.visitors || 0) }; });
    const su1 = a.showup || 0;
    const fromRegs = (b.registered - a.registered) * su1;
    const fromShowup = b.registered * ((b.showup || 0) - su1);
    return {
      from: D1, to: D2,
      change: { identified: b.identified - a.identified, registered: b.registered - a.registered, active: b.active - a.active, cancelled: b.status.cancelled - a.status.cancelled, visitors: b.visitorCount - a.visitorCount, walkins: b.walkins - a.walkins, spend: b.spend - a.spend },
      visitor_change_split: { from_more_registrations: round(fromRegs, 1), from_show_up_rate: round(fromShowup, 1), from_walk_ins: b.walkins - a.walkins, note: 'Registered visitors change = (more registrations × old show-up) + (new registrations × change in show-up)' },
      by_campaign: by.sort((x, y) => Math.abs(y.registered) - Math.abs(x.registered))
    };
  }

  function calibration(ds) {
    const pre = addDays(ds.event.eventStartDay, -1), post = ds.event.end;
    const sp = snapshot(ds, pre), so = snapshot(ds, post);
    const g = {}; sp.regByPerson.forEach((r, p) => { if (!g[r.status]) g[r.status] = { n: 0, came: 0 }; g[r.status].n++; if (so.visitors.has(p)) g[r.status].came++; });
    Object.keys(g).forEach(k => { g[k].showup = round(div(g[k].came, g[k].n), 4); });
    return { status_day_before_event: pre, outcome_as_of: post, by_status: g, note: 'Actual show-up by registration status, measured after the event. Use it to check the forecast assumptions.' };
  }

  function whatIf(ds, D, fromId, toId, amount, assump) {
    const rows = campaignRows(ds, D, { assumptions: assump });
    const ended = D >= ds.event.eventEndDay;
    const f = rows.find(r => r.campaign_id === fromId), t = rows.find(r => r.campaign_id === toId);
    if (!f || !t) return { error: 'Unknown campaign id' };
    const b = A(assump, 'scale_factor');
    const base = r => ended ? r.visitors : r.expected_visitors;
    const amt = Math.min(Math.max(0, amount), f.spend);
    const curve = (A0, s0, s1) => s0 > 0 ? A0 * Math.pow(Math.max(0, s1) / s0, b) : 0;
    const lost = base(f) - curve(base(f), f.spend, f.spend - amt);
    const gained = curve(base(t), t.spend, t.spend + amt) - base(t);
    return {
      asOf: D, moved: amt, from: f.campaign, to: t.campaign, basis: ended ? 'verified visitors (S)' : 'expected visitors from registrations (A)',
      scale_factor: b, visitors_lost: Math.round(lost), visitors_gained: Math.round(gained), net_change: Math.round(gained - lost),
      next_rupee_cost_from: round(div(div(f.spend, base(f)), b), 0), next_rupee_cost_to: round(div(div(t.spend, base(t)), b), 0),
      caveat: 'Assumes extra spend works like past spend, with diminishing returns (scale factor ' + b + '). It is a planning estimate, not a result. Confirm with a holdout test before moving large amounts.'
    };
  }

  /* ---------- bets: test vs comparison, expected extra attendees, next-tranche cost ---------- */
  function normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  function betRows(ds, D, assump) {
    const s = snapshot(ds, D), cut = s.cut, bets = ds.tables.campaigns.filter(c => c.kind === 'bet');
    if (!bets.length) return [];
    const z = () => ({ n: 0, reg: 0, confirmed: 0, interested: 0, waitlisted: 0, cancelled: 0 }), arms = {};
    ds.tables.people.forEach(p => {
      if (!p.test_bet || !p.first_seen_at || p.first_seen_at > cut || !(p.person_type === 'external' || p.person_type === 'host')) return;
      const k = p.arm === 'test' || p.arm === 'comparison' ? p.arm : 'direct';
      const g = (arms[p.test_bet] = arms[p.test_bet] || { test: z(), comparison: z(), direct: z() })[k]; g.n++;
      const r = s.regByPerson.get(p.person_id) || s.hostReg.get(p.person_id); if (r) { g.reg++; g[r.status]++; }
    });
    const sc = A(assump, 'showup_confirmed'), si = A(assump, 'showup_interested'), sw = A(assump, 'showup_waitlisted');
    const apr = g => g.reg ? (g.confirmed * sc + g.interested * si + g.waitlisted * sw) / g.reg : 0;
    const minN = 300;
    return bets.map(c => {
      const id = c.campaign_id, a = arms[id] || { test: z(), comparison: z(), direct: z() }, sp = (s.anon[id] || { spend: 0 }).spend;
      const startDay = day(c.planned_start_at) || ds.event.start, weeks = Math.max(0, daysBetween(startDay, D) + 1) / 7;
      const cap = c.cost_cap_inr || A(assump, 'cost_cap'), scale = c.scale_factor || A(assump, 'scale_factor');
      const hasComp = a.comparison.n > 0;
      let rt = null, rc = null, lift = null, se = null, sure = null, extraRegs, perReg, extra, extraLow = null, evidence = [];
      if (hasComp) {
        rt = div(a.test.reg, a.test.n); rc = div(a.comparison.reg, a.comparison.n);
        lift = rt !== null && rc !== null ? rt - rc : null;
        se = a.test.n && a.comparison.n ? Math.sqrt(rt * (1 - rt) / a.test.n + rc * (1 - rc) / a.comparison.n) : null;
        sure = lift !== null && se ? normCdf(lift / se) : null;
        perReg = apr(a.test); extraRegs = lift !== null ? a.test.n * lift : 0; extra = extraRegs * perReg;
        extraLow = lift !== null && se ? a.test.n * Math.max(0, lift - 0.8416 * se) * perReg : null;
        if (a.test.n < minN || a.comparison.n < minN) evidence.push('fewer than ' + minN + ' people in a group (' + nf(a.test.n) + ' test, ' + nf(a.comparison.n) + ' comparison)');
        if (weeks < 2) evidence.push('under 2 weeks of exposure');
        if (sure !== null && sure < 0.8) evidence.push('only ' + Math.round(sure * 100) + '% sure the lift is above zero (need 80%)');
      } else {
        const g = a.direct; perReg = apr(g); extraRegs = g.reg; extra = g.reg * perReg;
        evidence.push('no comparison group: every sign-up counted as extra (A)');
      }
      const avg = extra > 0 ? sp / extra : null, next = avg !== null ? avg / scale : null, avgLow = extraLow > 0 ? sp / extraLow : null;
      const evidenceOk = hasComp ? evidence.length === 0 : true;
      let decision, why;
      if (hasComp && !evidenceOk) { decision = 'Too early'; why = 'Evidence rule not met: ' + evidence.join('; '); }
      else if (!(extra > 0)) { decision = 'Stop'; why = 'No lift over the comparison group'; }
      else if (avg > cap) { decision = 'Change'; why = 'Cost per extra attendee ' + rs(avg) + ' is above the ' + rs(cap) + ' cap'; }
      else if (next <= cap && (avgLow === null || avgLow <= cap)) { decision = 'Scale'; why = 'Next-tranche cost ' + rs(next) + ' is under the ' + rs(cap) + ' cap'; }
      else { decision = 'Keep'; why = 'Works at ' + rs(avg) + ' each, but the next rupee would cost ' + rs(next) + ', above the ' + rs(cap) + ' cap: no tranche money'; }
      return {
        campaign_id: id, bet: c.campaign_name, rank: c.bet_rank || null, type: c.bet_type || null, owner_id: c.owner_id, owner: ownerName(ds, c.owner_id), audience: c.audience_type === 'host' ? 'our students' : 'outside', test_design: c.test_design || '',
        weeks_live: round(weeks, 1), spend: sp, planned_budget_inr: c.planned_budget_inr || null, reserve_released_inr: c.reserve_released_inr || 0,
        test_people: hasComp ? a.test.n : a.direct.n, test_registered: hasComp ? a.test.reg : a.direct.reg, comparison_people: hasComp ? a.comparison.n : null, comparison_registered: hasComp ? a.comparison.reg : null,
        test_rate: round(rt, 4), comparison_rate: round(rc, 4), lift: round(lift, 4), sure_lift_above_zero: round(sure, 3),
        extra_registrations: Math.round(extraRegs), attendees_per_registrant: round(perReg, 3), expected_extra_attendees: Math.round(extra), expected_extra_low: extraLow !== null ? Math.round(extraLow) : null,
        cost_per_extra: round(avg, 0), cost_per_extra_low_end: round(avgLow, 0), scale_factor: scale, next_tranche_cost: round(next, 0), cost_cap_inr: cap,
        evidence_ok: evidenceOk, evidence_gaps: evidence, decision, why,
        basis: 'Extra registrations = test people × (test rate − comparison rate). Expected extra attendees = extra registrations × show-up by status (A). Next-tranche cost = cost per extra ÷ scale factor (A).'
      };
    }).sort((x, y) => (x.rank || 99) - (y.rank || 99));
  }
  function reserveLeft(ds) { return Math.max(0, (ds.event.reserve || 0) - ds.tables.campaigns.reduce((a, c) => a + (num(c.reserve_released_inr) || 0), 0)); }
  function reservePlan(ds, D, assump) {
    const rows = betRows(ds, D, assump).filter(r => r.decision === 'Scale').sort((a, b) => a.next_tranche_cost - b.next_tranche_cost);
    let left = reserveLeft(ds); const out = [];
    rows.forEach(r => { if (left <= 0 || r.reserve_released_inr > 0) return; const size = r.sure_lift_above_zero !== null && r.sure_lift_above_zero >= 0.9 ? 100000 : 50000; const amt = Math.min(size, left); left -= amt; out.push({ campaign_id: r.campaign_id, bet: r.bet, amount: amt, next_tranche_cost: r.next_tranche_cost, cap: r.cost_cap_inr, sure: r.sure_lift_above_zero, rule: size > 50000 ? 'Over ₹50k: 90%+ sure' : 'Up to ₹50k: 80%+ sure, 2 weeks, 300+ per group' }); });
    return { reserve_total: ds.event.reserve || 0, reserve_left: reserveLeft(ds), suggestions: out, already_released: betRows(ds, D, assump).filter(r => r.reserve_released_inr > 0).map(r => ({ bet: r.bet, amount: r.reserve_released_inr })), rule: 'Money goes to the lowest next-tranche cost first, only to bets under their cap. Release size follows the evidence rule. One release per bet until its review.' };
  }

  /* ---------- flags: Watch / Warn / Act rules (thresholds editable) ---------- */
  const DEFAULT_RULES = {
    pace_ratio: { watch: 1.0, warn: 0.85, act: 0.7, label: 'Run rate ÷ required rate (before the event)' },
    attainment: { watch: 1.0, warn: 0.93, act: 0.85, label: 'Final result ÷ goal (after the event)' },
    budget_burn: { watch: 1.1, warn: 1.2, act: 1.35, label: 'Budget used ÷ time elapsed' },
    cost_vs_cap: { watch: 1.0, warn: 1.2, act: 1.5, label: 'Cost per visitor ÷ cost cap' },
    showup_gap: { watch: 0.05, warn: 0.10, act: 0.20, label: 'Show-up below the overall rate (points)' },
    opt_out: { watch: 0.10, warn: 0.15, act: 0.20, label: 'Opt-outs ÷ people emailed' },
    cancel_rate: { watch: 0.07, warn: 0.09, act: 0.12, label: 'Cancelled ÷ registered' },
    walkin_share: { watch: 0.08, warn: 0.12, act: 0.15, label: 'Walk-ins ÷ visitors' },
    gate_load: { watch: 0.72, warn: 0.80, act: 0.92, label: 'Peak hour entries ÷ safe gate capacity' },
    min_people: { value: 30, label: 'Below this many people a signal is "too early" and not graded' }
  };
  function grade(v, r, higherIsWorse) {
    if (v === null || v === undefined) return 'none';
    if (higherIsWorse) return v >= r.act ? 'act' : v >= r.warn ? 'warn' : v >= r.watch ? 'watch' : 'ok';
    return v < r.act ? 'act' : v < r.warn ? 'warn' : v < r.watch ? 'watch' : 'ok';
  }
  function flags(ds, D, rulesIn, assump) {
    const R = Object.assign({}, DEFAULT_RULES, rulesIn || {}), out = [], min = R.min_people.value;
    const s = snapshot(ds, D), ended = D >= ds.event.eventEndDay, before = D < ds.event.eventStartDay;
    const pct = v => v === null ? '–' : (v * 100).toFixed(1) + '%';
    const add = f => { if (f.level !== 'ok' && f.level !== 'none') out.push(f); };
    // 1. pace / attainment
    pace(ds, D).forEach(p => {
      if (p.curve) {
        if (before && p.level !== 'ok' && p.level !== 'none') {
          const t = { watch: 'Registrations above base pace, below stretch', warn: 'Registrations below base pace', act: 'Registrations more than 15% below base pace' }[p.level];
          const act = { watch: 'Find the lagging bet on the Bets page and fix it.', warn: "Lagging bet's owner fixes it this week.", act: 'Release reserve to the best bet by next-tranche cost; switch on paid reminders.' }[p.level];
          add({ id: 'pace-registered', term: 'Register', level: p.level, title: t, value: p.vs_base, evidence: 'Week ' + p.week + ': ' + nf(p.actual) + ' outside registrations vs base pace ' + nf(p.base_pace) + (p.stretch_pace ? ' and stretch pace ' + nf(p.stretch_pace) : '') + ' (curve: ' + Math.round(p.expected_share * 100) + '% of final expected by now, A).', owner: 'Growth lead', action: act, trust: 'maybe' });
        }
        return;
      }
      if (before && p.key !== 'visitors' && p.required_per_day) {
        const ratio = p.run_rate_7d / p.required_per_day;
        add({ id: 'pace-' + p.key, term: p.key === 'identified' ? 'Reach' : 'Register', level: grade(ratio, R.pace_ratio), title: ({ identified: 'Identified people', registered: 'Registrations' })[p.key] + ' behind pace', value: round(ratio, 2), evidence: 'Last 7 days: ' + p.run_rate_7d + '/day. Needed: ' + p.required_per_day + '/day for ' + p.days_left + ' days to reach ' + nf(p.goal) + ' (now ' + nf(p.actual) + ').', owner: 'Growth lead', action: 'Find the campaign with the weakest recent run rate and shift effort or budget to the cheapest proven channel.', trust: 'proven' });
      }
      if (ended) add({ id: 'goal-' + p.key, term: 'Outcome', level: grade(p.attainment, R.attainment), title: ({ identified: 'Identified people', registered: 'Registrations', visitors: 'Verified visitors' })[p.key] + ' finished below goal', value: p.attainment, evidence: nf(p.actual) + ' of ' + nf(p.goal) + ' (' + pct(p.attainment) + ').', owner: 'Growth lead', action: 'Review which step lost the most people; carry the lesson into the next plan.', trust: 'proven' });
    });
    if (before) {
      const pr = projection(ds, D, assump), g = s.target ? s.target.unique_external_visitors_goal : null;
      if (g && pr.likely) add({ id: 'forecast-visitors', term: 'Show-up', level: grade(pr.likely / g, R.attainment), title: 'Forecast visitors below goal', value: round(pr.likely / g, 3), evidence: 'Forecast ' + nf(pr.low) + '–' + nf(pr.high) + ' (likely ' + nf(pr.likely) + ') vs goal ' + nf(g) + '. Basis: ' + pr.basis + '.', owner: 'Growth lead', action: 'Push confirmations and reminders to active registrants; check the campaigns with low confirmation.', trust: 'maybe' });
    }
    // 2. budget burn
    const b = budget(ds, D);
    if (b.approved) {
      if (b.spent > b.approved) add({ id: 'budget-over', term: 'Budget', level: 'act', title: 'Spend is above the approved budget', value: b.used, evidence: rs(b.spent) + ' spent vs ' + rs(b.approved) + ' approved.', owner: 'Growth lead', action: 'Freeze new spend and get approval before any further commitment.', trust: 'proven' });
      else add({ id: 'budget-burn', term: 'Budget', level: grade(b.burn_vs_time, R.budget_burn, true), title: 'Budget is being spent faster than time passes', value: b.burn_vs_time, evidence: pct(b.used) + ' of budget used with ' + pct(b.time_elapsed) + ' of the campaign window gone.', owner: 'Growth lead', action: 'Check which campaigns are front-loading spend; hold back the reserve.', trust: 'proven' });
    }
    // 3. per campaign
    const rows = campaignRows(ds, D, { assumptions: assump }).filter(r => r.campaign_id);
    const cap = A(assump, 'cost_cap');
    betRows(ds, D, assump).forEach(b => {
      const lv = { Stop: 'act', Change: 'warn', 'Too early': 'watch' }[b.decision]; if (!lv) return;
      add({ id: 'bet-' + b.campaign_id, term: 'Bet', level: lv, title: b.bet + ': ' + (b.decision === 'Too early' ? 'too early to judge' : b.decision === 'Stop' ? 'no lift, stop rule' : 'cost above cap'), value: b.cost_per_extra, evidence: b.why + '. Test ' + (b.test_rate !== null ? pct(b.test_rate) + ' vs comparison ' + pct(b.comparison_rate) : nf(b.test_registered) + ' direct sign-ups') + ', ' + nf(b.expected_extra_attendees) + ' expected extra attendees (A).', owner: b.owner, action: b.decision === 'Too early' ? 'Keep the test running; no tranche money until the evidence rule is met.' : b.decision === 'Stop' ? 'Stop spending; move its budget to the best bet.' : 'Change the mechanic or cut cost; no tranche money while above cap.', trust: 'maybe' });
    });
    rows.forEach(r => {
      if (r.kind === 'bet') return;
      const base = ended ? r.visitors : r.expected_visitors;
      const cost = ended ? r.cost_per_visitor : r.cost_per_expected_visitor;
      if (base >= min && cost !== null) add({ id: 'cost-' + r.campaign_id, term: 'Cost', level: grade(cost / cap, R.cost_vs_cap, true), title: r.campaign + ': cost per ' + (ended ? '' : 'expected ') + 'visitor above cap', value: cost, evidence: rs(r.spend) + ' spent, ' + nf(base) + (ended ? ' verified visitors' : ' expected visitors (A)') + ' → ' + rs(cost) + ' each vs cap ' + rs(cap) + '.', owner: r.owner, action: 'Change: cut low-converting spend or move it to a cheaper campaign. Stop if it stays above cap after a fix.', trust: ended ? 'proven' : 'maybe' });
      if (ended && r.registered >= min && s.showup !== null) add({ id: 'showup-' + r.campaign_id, term: 'Show-up', level: grade(s.showup - r.showup, R.showup_gap, true), title: r.campaign + ': show-up below average', value: r.showup, evidence: pct(r.showup) + ' of registrants came vs ' + pct(s.showup) + ' overall (' + nf(r.visitors_registered) + ' of ' + nf(r.registered) + ').', owner: r.owner, action: 'Add commitment steps for this audience (confirm step, group sign-up, reminders) or move budget to higher show-up channels.', trust: 'proven' });
      if (!ended && r.active >= min) { const cr = r.confirmed / r.active, all = s.active ? s.status.confirmed / s.active : null; if (all !== null) add({ id: 'confirm-' + r.campaign_id, term: 'Show-up', level: grade(all - cr, R.showup_gap, true), title: r.campaign + ': fewer registrants confirmed', value: round(cr, 3), evidence: pct(cr) + ' of active registrants confirmed vs ' + pct(all) + ' overall.', owner: r.owner, action: 'Send a confirmation prompt to unconfirmed registrants from this campaign.', trust: 'maybe' }); }
      const emailed = (s.iaPeopleByCamp[r.campaign_id + '|nurture_email_sent'] || new Set()).size;
      if (emailed >= min) add({ id: 'optout-' + r.campaign_id, term: 'Reach (guardrail)', level: grade(r.opt_outs / emailed, R.opt_out, true), title: r.campaign + ': opt-outs rising', value: round(r.opt_outs / emailed, 3), evidence: nf(r.opt_outs) + ' of ' + nf(emailed) + ' emailed people opted out (' + pct(r.opt_outs / emailed) + ').', owner: r.owner, action: 'Reduce email frequency for this audience and stop messaging anyone who opted out.', trust: 'proven' });
      if (r.registered >= min) add({ id: 'cancel-' + r.campaign_id, term: 'Register (guardrail)', level: grade(r.cancel_rate, R.cancel_rate, true), title: r.campaign + ': cancellations high', value: r.cancel_rate, evidence: nf(r.cancelled) + ' of ' + nf(r.registered) + ' registrations cancelled (' + pct(r.cancel_rate) + ').', owner: r.owner, action: 'Ask cancellers why (one-question survey) and check if the audience matches the event.', trust: 'maybe' });
    });
    // 4. walk-ins and gates
    if (s.visitorCount >= min) add({ id: 'walkins', term: 'Walk-ins', level: grade(div(s.walkins, s.visitorCount), R.walkin_share, true), title: 'Many visitors came without registering', value: round(div(s.walkins, s.visitorCount), 3), evidence: nf(s.walkins) + ' of ' + nf(s.visitorCount) + ' visitors had no registration.', owner: 'Growth lead', action: 'Move the help desk to the gate and offer on-the-spot QR registration.', trust: 'proven' });
    const dsx = dayStats(ds, D, assump);
    if (dsx.peak_hour && dsx.verified_entries) add({ id: 'gate-peak', term: 'Ceiling', level: grade(dsx.peak_vs_capacity, R.gate_load, true), title: 'Peak-hour arrivals near safe gate capacity', value: dsx.peak_vs_capacity, evidence: nf(dsx.peak_hour.entries) + ' entries at ' + dsx.peak_hour.hour + ' vs assumed safe capacity ' + dsx.gate_capacity_assumed + '/hour (A).', owner: 'Security / operations lead', action: 'Escalate to the security lead: spread arrivals with entry windows. Growth flags; security decides.', trust: 'maybe' });
    // 5. data trust
    const last = ds.lastDataDay.daily; if (before && last && daysBetween(last, D) > 2) out.push({ id: 'stale', term: 'Data', level: 'warn', title: 'Marketing data looks stale', value: daysBetween(last, D), evidence: 'Latest spend row is ' + last + ', ' + daysBetween(last, D) + ' days before the selected date.', owner: 'Growth lead', action: 'Check the data import before acting on spend signals.', trust: 'proven' });
    const order = { act: 0, warn: 1, watch: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  /* ---------- safe query tool for unfamiliar questions ---------- */
  function virtualRows(ds, D, table) {
    const s = snapshot(ds, D), cut = s.cut;
    const cmeta = id => { const c = ds.camps.get(id) || {}; return { campaign_name: campName(ds, id || null), channel: c.channel || null, owner_name: ownerName(ds, c.owner_id) }; };
    const tfields = t => ({ date: day(t), month: t ? t.slice(0, 7) : null, week: t ? weekStart(day(t)) : null, hour: t ? Number(t.slice(11, 13)) : null, weekday: t ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(day(t) + 'T00:00:00Z').getUTCDay()] : null });
    if (table === 'people') return ds.tables.people.filter(p => p.first_seen_at && p.first_seen_at <= cut).map(p => Object.assign({ person_id: p.person_id, person_type: p.person_type, first_touch_source: p.first_touch_source, campaign_id: p.first_campaign_id, registered: s.regByPerson.has(p.person_id), visited: s.visitors.has(p.person_id), status: (s.regByPerson.get(p.person_id) || {}).status || null }, cmeta(p.first_campaign_id), tfields(p.first_seen_at)));
    if (table === 'registrations') return s.regs.map(r => Object.assign({ registration_id: r.registration_id, person_id: r.person_id, status: r.status, campaign_id: r.campaign_id, visited: s.visitors.has(r.person_id) }, cmeta(r.campaign_id), tfields(r.registered_at)));
    if (table === 'visitors') return Array.from(s.visitors.entries()).map(([p, t]) => { const r = s.regByPerson.get(p); return Object.assign({ person_id: p, registered: !!r, status: r ? r.status : null, campaign_id: r ? r.campaign_id : null, first_entry: t }, cmeta(r ? r.campaign_id : null), tfields(t)); });
    if (table === 'checkins') return ds.tables.checkins.filter(c => c.occurred_at && c.occurred_at <= cut).map(c => Object.assign({ event_id: c.event_id, person_id: c.person_id, result: c.result, verification: c.verification, source: c.source, person_type: (ds.people.get(c.person_id) || {}).person_type || null, campaign_id: c.campaign_id }, cmeta(c.campaign_id), tfields(c.occurred_at)));
    if (table === 'interactions') return ds.tables.interactions.filter(i => i.occurred_at && i.occurred_at <= cut).map(i => Object.assign({ interaction_id: i.interaction_id, person_id: i.person_id, event_type: i.event_type, detail: ds.details[i.detail_code] !== undefined ? ds.details[i.detail_code] : (i.detail || null), person_type: (ds.people.get(i.person_id) || {}).person_type || null, campaign_id: i.campaign_id }, cmeta(i.campaign_id), tfields(i.occurred_at)));
    if (table === 'daily') return ds.tables.daily.filter(r => day(r.activity_date) <= D).map(r => Object.assign({ activity_id: r.activity_id, campaign_id: r.campaign_id, platform: r.platform, impressions: num(r.impressions), clicks: num(r.clicks), reported_reach: num(r.reported_reach), landing_page_sessions: num(r.landing_page_sessions), registration_starts: num(r.registration_starts), marketing_spend_inr: num(r.marketing_spend_inr) }, cmeta(r.campaign_id), tfields(r.activity_date)));
    if (table === 'campaigns') return ds.tables.campaigns.map(c => Object.assign({}, c, cmeta(c.campaign_id)));
    if (table === 'status_history') return ds.tables.reg_history.filter(h => h.effective_at && h.effective_at <= cut).map(h => Object.assign({ registration_id: h.registration_id, person_id: h.person_id, status: h.status, campaign_id: h.campaign_id }, cmeta(h.campaign_id), tfields(h.effective_at)));
    return null;
  }
  const QUERY_TABLES = { people: 'Identified people (first seen ≤ date) with their latest registration status and whether they visited', registrations: 'Registrations (external people) with latest status as of the date', visitors: 'Unique verified external visitors with first entry time', checkins: 'All admission records (any result) up to the date', interactions: 'Identified actions: page_visit, brochure_download, registration_start, event_question_submitted, nurture_email_sent/opened/clicked, opted_out', daily: 'Daily campaign activity: impressions, clicks, reported_reach, landing_page_sessions, registration_starts, marketing_spend_inr', campaigns: 'Campaign list', status_history: 'Every registration status version up to the date' };
  function query(ds, D, spec) {
    const rows = virtualRows(ds, D, spec.table);
    if (!rows) return { error: 'Unknown table. Use one of: ' + Object.keys(QUERY_TABLES).join(', ') };
    const fields = rows.length ? Object.keys(rows[0]) : [];
    const bad = (spec.filters || []).map(f => f.field).concat(spec.group_by || []).concat(spec.field ? [spec.field] : []).filter(f => !fields.includes(f));
    if (bad.length) return { error: 'Unknown field(s): ' + bad.join(', '), available_fields: fields };
    const ok = (v, op, x) => { switch (op) { case '=': case '==': return String(v) === String(x); case '!=': return String(v) !== String(x); case '>': return v > x; case '>=': return v >= x; case '<': return v < x; case '<=': return v <= x; case 'in': return (x || []).map(String).includes(String(v)); case 'contains': return String(v || '').toLowerCase().includes(String(x).toLowerCase()); default: return false; } };
    const f = rows.filter(r => (spec.filters || []).every(c => ok(r[c.field], c.op || '=', c.value)));
    const agg = spec.aggregate || 'count';
    const calc = list => {
      if (agg === 'count') return list.length;
      if (agg === 'count_distinct') return new Set(list.map(r => r[spec.field || 'person_id'])).size;
      const vals = list.map(r => num(r[spec.field]));
      if (agg === 'sum') return round(vals.reduce((a, b) => a + b, 0), 2);
      if (agg === 'avg') return round(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, 3);
      if (agg === 'min') return vals.length ? Math.min.apply(null, vals) : null;
      if (agg === 'max') return vals.length ? Math.max.apply(null, vals) : null;
      return null;
    };
    const gb = spec.group_by || [];
    if (!gb.length) return { table: spec.table, asOf: D, aggregate: agg, field: spec.field || null, rows_matched: f.length, result: calc(f) };
    const m = new Map(); f.forEach(r => { const k = gb.map(g => r[g]).join(' | '); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    let groups = Array.from(m.entries()).map(([k, list]) => ({ group: k, value: calc(list) }));
    groups.sort((a, b) => (b.value || 0) - (a.value || 0));
    const lim = Math.min(spec.limit || 25, 60);
    return { table: spec.table, asOf: D, aggregate: agg, field: spec.field || null, group_by: gb, rows_matched: f.length, groups: groups.slice(0, lim), groups_total: groups.length };
  }

  /* ---------- exact arithmetic for the AI (no eval) ---------- */
  function calculate(expr) {
    const s = String(expr).replace(/,/g, '').replace(/\s+/g, ''); let i = 0;
    function peek() { return s[i]; }
    function number() { const m = s.slice(i).match(/^\d+(\.\d+)?(e[+-]?\d+)?/i); if (!m) throw new Error('Expected a number at position ' + i); i += m[0].length; return parseFloat(m[0]); }
    function factor() {
      if (peek() === '-') { i++; return -factor(); } if (peek() === '+') { i++; return factor(); }
      if (peek() === '(') { i++; const v = expr0(); if (s[i] !== ')') throw new Error('Missing )'); i++; return post(v); }
      return post(number());
    }
    function post(v) { if (s[i] === '%') { i++; return v / 100; } return v; }
    function pow() { let v = factor(); while (s[i] === '^') { i++; v = Math.pow(v, factor()); } return v; }
    function term() { let v = pow(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const r = pow(); v = o === '*' ? v * r : v / r; } return v; }
    function expr0() { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
    const v = expr0(); if (i < s.length) throw new Error('Unexpected "' + s[i] + '"');
    return round(v, 6);
  }

  const api = { betRows, reservePlan, reserveLeft, shareAt, weekOf, TABLES, SHEETS, KEYS, REQUIRED, DEFAULT_ASSUMPTIONS, DEFAULT_RULES, QUERY_TABLES, normTime, rowsToObjects, validate, applyEdits, build, snapshot, kpis, projection, campaignRows, funnel, anonFunnel, trend, pace, budget, dayStats, quality, explainChange, calibration, whatIf, flags, query, calculate, targetAt, addDays, daysBetween, campName, ownerName, round };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GCEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
