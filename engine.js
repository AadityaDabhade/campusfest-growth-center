/* CampusFest Growth Center: metrics engine.
   Pure functions over the source tables. The dashboard and the AI analyst both read only from here. */
(function (root) {
  'use strict';

  const TABLES = ['event', 'targets', 'campaigns', 'daily', 'people', 'interactions', 'registrations', 'reg_history', 'checkins', 'pace_curve', 'plan_decisions'];
  const SHEETS = { event: 'Event', targets: 'Targets', campaigns: 'Campaigns', daily: 'Daily Marketing', people: 'People', interactions: 'Interest and Engagement', registrations: 'Registrations', reg_history: 'Registration History', checkins: 'Check-ins', pace_curve: 'Pace Curve', plan_decisions: 'Plan Decisions' };
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
    pace_curve: ['week', 'share'],
    plan_decisions: ['decision_id', 'decided_at', 'kind']
  };
  const TIME_FIELDS = { event: ['history_start', 'history_end', 'event_starts_at', 'event_ends_at', 'plan_start', 'registration_opens', 'today', 'competition_opens', 'big_push'], plan_decisions: ['decided_at', 'review_at'], targets: ['effective_at'], campaigns: ['created_at', 'planned_start_at', 'planned_end_at'], daily: ['activity_date'], people: ['first_seen_at'], interactions: ['occurred_at'], registrations: ['registered_at'], reg_history: ['effective_at'], checkins: ['occurred_at'] };
  const NUM_FIELDS = { pace_curve: ['week', 'share'], plan_decisions: ['amount_inr'], event: ['reserve_inr', 'tranche_inr', 'gate_capacity_per_hour', 'hostel_students', 'day_scholars'], targets: ['identified_external_people_goal', 'registration_goal', 'unique_external_visitors_goal', 'marketing_budget_inr', 'stretch_registration_goal', 'stretch_visitors_goal', 'all_attendees_base', 'all_attendees_stretch', 'teams_goal', 'teams_by_week6', 'teams_by_week8'], daily: ['impressions', 'clicks', 'reported_reach', 'landing_page_sessions', 'registration_starts', 'marketing_spend_inr'], campaigns: ['planned_budget_inr', 'cost_cap_inr', 'scale_factor', 'bet_rank', 'reserve_released_inr', 'plan_extra_attendees'] };
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
  function dlabel(D) { return D ? Number(D.slice(8, 10)) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(D.slice(5, 7)) - 1] : ''; }
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function round(v, p) { if (v === null || v === undefined || !isFinite(v)) return null; const f = Math.pow(10, p || 0); return Math.round(v * f) / f; }
  function div(a, b) { return b ? a / b : null; }
  function nf(n) { return n === null || n === undefined || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-IN'); }
  function rs(n) { return n === null || n === undefined || !isFinite(n) ? '–' : '₹' + Math.round(n).toLocaleString('en-IN'); }

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
      if (!rows || !rows.length) { if (t === 'pace_curve' || t === 'plan_decisions') return; (t === 'event' || t === 'people') ? errors.push(SHEETS[t] + ': missing or empty') : warnings.push(SHEETS[t] + (t === 'checkins' ? ': no check-ins yet' : ': missing or empty')); return; }
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
    const t = {}; TABLES.forEach(k => { t[k] = (raw[k] || []).slice(); }); t.plan_skip = (raw.plan_skip || []).slice();
    (edits || []).forEach(e => {
      const p = e.payload || {};
      try {
        if (p.replaces_plan) t.plan_skip.push(p.replaces_plan);
        if (e.type === 'campaign_update') {
          // owner, name and other plain fields change at once; money and status changes are dated (as_of), so each date shows what was decided by then
          t.campaigns = t.campaigns.map(c => { if (c.campaign_id !== p.campaign_id) return c; const n = Object.assign({}, c, p.fields || {}); if (p.change) n._changes = (c._changes || []).concat([Object.assign({ at: p.as_of || null, edit_id: e.id }, p.change)]); return n; });
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
      planStart: day(ev.plan_start), regOpens: day(ev.registration_opens), reserve: num(ev.reserve_inr), tranche: num(ev.tranche_inr),
      today: day(ev.today), gateCap: num(ev.gate_capacity_per_hour) || null, competitionOpens: day(ev.competition_opens), bigPush: day(ev.big_push), hostel: num(ev.hostel_students) || 0, dayScholars: num(ev.day_scholars) || 0
    };
    const skip = new Set(raw.plan_skip || []);
    ds.plan = (tb.plan_decisions || []).filter(x => x.decision_id && !skip.has(x.decision_id)).sort((a, b) => (a.decided_at || '').localeCompare(b.decided_at || ''));
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

  /* "Responded" (stored as identified) = an outside person who acted (left details, opened a page, signed up). People only on a college list are used to judge bets, never counted as reached. */
  function reached(p) { return p.first_touch_source !== 'college_list'; }
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
    tb.people.forEach(p => { if (p.person_type === 'external' && reached(p) && p.first_seen_at && p.first_seen_at <= cut) { s.identified++; const k = p.first_campaign_id || null; s.identifiedByFirst[k] = (s.identifiedByFirst[k] || 0) + 1; } });
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
    // competition teams register early and are paced on their own (plan: 125 teams by week 6, 200 by week 8, 250 by week 10, of 300 slots)
    s.compRegistered = 0; const teams = new Set(); s.regByPerson.forEach((r, p) => { const pp = ds.people.get(p); if (pp && pp.segment === 'competitor') { s.compRegistered++; if (pp.team_id && r.status !== 'cancelled') teams.add(pp.team_id); } }); s.teams = teams.size;
    s.passRegistered = s.registered - s.compRegistered;
    s.status = { confirmed: 0, interested: 0, waitlisted: 0, cancelled: 0 };
    s.regByPerson.forEach(x => { s.status[x.status] = (s.status[x.status] || 0) + 1; });
    s.active = ACTIVE.reduce((a, k) => a + (s.status[k] || 0), 0);
    // check-ins
    s.visitors = new Map(); s.hostVisitors = new Map(); s.entries = 0; s.hourly = {}; s.byDay = {}; s.chk = { denied: 0, pending: 0, unverified: 0, manual: 0, unattributed: 0, nonExternal: 0, total: 0 };
    tb.checkins.forEach(c => {
      if (!c.occurred_at || c.occurred_at > cut) return;
      s.chk.total++;
      if (c.result === 'denied') s.chk.denied++; if (c.result === 'pending') s.chk.pending++; if (c.verification !== 'verified') s.chk.unverified++;
      if (c.source === 'manual') s.chk.manual++; if (!c.campaign_id) s.chk.unattributed++;
      if (c.result !== 'admitted' || c.verification !== 'verified') return;
      if (!ds.ext.has(c.person_id)) { s.chk.nonExternal++; if (ds.host.has(c.person_id)) { const pv = s.hostVisitors.get(c.person_id); if (!pv || c.occurred_at < pv) s.hostVisitors.set(c.person_id, c.occurred_at); if (c.source !== 'concert_gate') { const h = c.occurred_at.slice(0, 13); s.hourly[h] = (s.hourly[h] || 0) + 1; } } return; }
      s.entries++;
      const h = c.occurred_at.slice(0, 13); s.hourly[h] = (s.hourly[h] || 0) + 1;
      const d = day(c.occurred_at); if (!s.byDay[d]) s.byDay[d] = new Set(); s.byDay[d].add(c.person_id);
      const prev = s.visitors.get(c.person_id); if (!prev || c.occurred_at < prev) s.visitors.set(c.person_id, c.occurred_at);
    });
    s.visitorCount = s.visitors.size; s.hostVisitorCount = s.hostVisitors.size;
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
    showup_confirmed: { value: 0.75, low: 0.70, high: 0.80, label: 'Show-up of confirmed registrants', tag: 'A', evidence: '2025: 73–77% of confirmed people came' },
    showup_interested: { value: 0.55, low: 0.35, high: 0.65, label: 'Show-up of unconfirmed registrants, a week or more out', tag: 'A', evidence: '2025: 54–66% of people unconfirmed weeks before the fest still came (most confirmed later)' },
    showup_interested_late: { value: 0.05, low: 0.0, high: 0.15, label: 'Show-up of people still unconfirmed on fest eve', tag: 'A', evidence: '2025: 0 of 29 people unconfirmed on fest eve came' },
    showup_waitlisted: { value: 0.20, low: 0.0, high: 0.30, label: 'Show-up of waitlisted registrants', tag: 'A', evidence: '2025: 0 of 88 (no waitlist release then); 2027 releases unscanned passes at 2 pm' },
    walkin_share: { value: 0.06, low: 0.04, high: 0.08, label: 'Walk-ins as a share of all visitors', tag: 'A', evidence: '2025: 6.1% of visitors had not registered' },
    future_regs: { value: 1.0, low: 0.75, high: 1.35, label: 'Registrations still to come vs the plan curve', tag: 'A', evidence: 'A 3-point shift in sign-up timing at week 10 moves the sign-ups still to come by 10–15%, and 2025 ended with a late surge' },
    hostel_attend: { value: 0.90, low: 0.85, high: 0.95, label: 'Hostel students who come (counted at the concert gate)', tag: 'A', evidence: 'Plan assumption: they are already on campus; no 2025 data on our own students' },
    dayscholar_attend: { value: 0.65, low: 0.55, high: 0.75, label: 'Day scholars who come (student-ID lane)', tag: 'A', evidence: 'Plan assumption: no 2025 data on our own students' },
    scale_factor: { value: 0.5, low: 0.4, high: 0.7, label: 'How well extra spend scales (1 = no diminishing returns)', tag: 'A', evidence: 'Planning value; checked at each review' },
    volunteer_new: { value: 0.45, low: 0.3, high: 0.6, label: 'Volunteers who would not have come otherwise', tag: 'A', evidence: 'Plan assumption (about 55% of volunteers would have come anyway); there is no comparison group' },
    release_yield: { value: 0.8, low: 0.5, high: 1.0, label: 'How much of a bet\'s estimated gain new money delivers', tag: 'A', evidence: 'Scaled bets usually do a bit worse than their test' },
    cost_cap: { value: 300, low: 250, high: 350, label: 'Limit per extra attendee (₹): what one more outside attendee is worth to us', tag: 'D', evidence: 'In 2025 the fest paid ₹274–337 per attendee for ads and kept buying them, so an attendee was worth at least ~₹300 to it' },
    gate_capacity: { value: 500, low: 400, high: 600, label: 'Safe gate arrivals per hour', tag: 'A', evidence: '2025 venue; 2027 plan uses 6 lanes ≈ 2,500/hr' }
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
    if (ds.event.eventStartDay && D >= addDays(ds.event.eventStartDay, -1)) return c[c.length - 1].share; // registrations close on fest eve
    const w = (daysBetween(ds.event.planStart, D) + 1) / 7; // weeks completed by the end of D
    if (w <= c[0].week) return c[0].share * Math.max(0, w / c[0].week);
    for (let i = 1; i < c.length; i++) if (w <= c[i].week) { const a = c[i - 1], b = c[i]; return a.share + (b.share - a.share) * (w - a.week) / (b.week - a.week); }
    return c[c.length - 1].share;
  }
  function interestedRate(early, late, daysLeft) { return daysLeft >= 7 ? early : daysLeft <= 1 ? late : late + (early - late) * (daysLeft - 1) / 6; }
  function perRegistrant(s, assump, w, daysLeft) {
    const n = s.registered; if (!n) return null;
    const si = interestedRate(A(assump, 'showup_interested', w), A(assump, 'showup_interested_late', w), daysLeft === undefined ? 30 : daysLeft);
    return (s.status.confirmed * A(assump, 'showup_confirmed', w) + s.status.interested * si + s.status.waitlisted * A(assump, 'showup_waitlisted', w)) / n;
  }
  /* Time-aware campaign state: the campaign row plus the plan's decisions taken by date D. */
  function campState(ds, id, D) {
    const c = ds.camps.get(id) || {}, cut = cutoff(D);
    const mine = !c.reserve_released_at || day(c.reserve_released_at) <= D;
    const st = { status: c.status || 'active', planned: c.planned_budget_inr || null, released: mine ? num(c.reserve_released_inr) || 0 : 0, lastRelease: mine && c.reserve_released_at ? day(c.reserve_released_at) : null, decisions: [] };
    if (!mine) st.planned = (st.planned || 0) - (num(c.reserve_released_inr) || 0);
    ds.plan.forEach(p => {
      if (p.campaign_id !== id || !p.decided_at || p.decided_at > cut) return;
      st.decisions.push(p);
      if (p.kind === 'release_reserve') { st.released += num(p.amount_inr); st.planned = (st.planned || 0) + num(p.amount_inr); st.lastRelease = day(p.decided_at); }
      else if (p.kind === 'set_planned_budget') st.planned = num(p.amount_inr);
      else if (p.kind === 'stop') st.status = 'stopped';
      else if (p.kind === 'pause') st.status = 'paused';
    });
    // the user's own decisions (edits), from the date they were made. In a rehearsal they count only up to "today":
    // later dates are the simulated run, which follows the plan's decisions.
    st.user = { delta: 0, plannedBefore: st.planned, status: null, at: null, changes: [] };
    if (userWindow(ds, D)) (c._changes || []).filter(x => !x.at || x.at <= D).forEach(x => {
      st.user.changes.push(x); st.user.at = x.at;
      if (x.release) { st.released += num(x.release); st.planned = (st.planned || 0) + num(x.release); st.user.delta += num(x.release); st.lastRelease = x.at; }
      if (x.planned !== undefined) { st.user.delta += num(x.planned) - (st.planned || 0); st.planned = num(x.planned); }
      if (x.status) { st.status = x.status; st.user.status = x.status; }
    });
    return st;
  }
  function userWindow(ds, D) { return !ds.event.today || D <= ds.event.today; }
  function userChanged(ds) { let n = 0; ds.camps.forEach(c => { n += (c._changes || []).length; }); return n; }
  function planDecisionsAt(ds, D) { const cut = cutoff(D); return ds.plan.filter(p => p.decided_at && p.decided_at <= cut); }

  /* ---------- forecast: the fest played 1,000 times with different luck ---------- */
  function seeded(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); let t = (h ^= h >>> 16) >>> 0; t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, t | 1); r ^= r + Math.imul(r ^ r >>> 7, r | 61); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
  function tri(u, lo, mode, hi) { if (!(hi > lo)) return mode; const f = (mode - lo) / (hi - lo); return u < f ? lo + Math.sqrt(u * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode)); }
  function draw(u, assump, k) { const a = (assump && assump[k]) || DEFAULT_ASSUMPTIONS[k]; return tri(u, a.low, a.value, a.high); }
  function r10(v) { return v === null || v === undefined || !isFinite(v) ? null : Math.round(v / 10) * 10; }
  /* extra: [{amount, cost}] money moved now (cost = ₹ per extra attendee for the next rupee; negative amount = money taken away) */
  function forecast(ds, D, assump, opts) {
    const o = opts || {}, N = o.runs || 1000, s = snapshot(ds, D), t = s.target, ev = ds.event;
    const base = t ? t.unique_external_visitors_goal : null, stretch = t ? (t.stretch_visitors_goal || null) : null;
    const out = { asOf: D, target: base, stretch, registered: s.registered, visitors_so_far: s.visitorCount };
    const verdict = (p10, p50) => base ? (p10 >= base ? 'Safe' : p50 >= base ? 'Ahead, not safe yet' : 'Off track') : null;
    if (D >= ev.eventEndDay) { const all = s.visitorCount + s.hostVisitorCount, tb = t ? t.all_attendees_base : null; return Object.assign(out, { mode: 'actual', bad: s.visitorCount, likely: s.visitorCount, good: s.visitorCount, verdict: base ? (s.visitorCount >= base ? 'Hit' : 'Missed') : null, chance: null, basis: 'Verified check-ins: the fest is over', total: (ev.hostel || ev.dayScholars) ? { bad: all, likely: all, good: all, target: tb, stretch: t ? t.all_attendees_stretch : null, our_students: s.hostVisitorCount, verdict: tb ? (all >= tb ? 'Hit' : 'Missed') : null } : null }); }
    const R = s.registered; if (!R) return Object.assign(out, { mode: 'too early', verdict: null, basis: 'No registrations yet' });
    const daysLeft = daysBetween(D, ev.eventStartDay), live = D >= ev.eventStartDay;
    let future = 0, how; const curve = shareAt(ds, D) !== null;
    if (!live) {
      const sh = shareAt(ds, D);
      if (sh !== null) {
        if (sh < 0.1) return Object.assign(out, { mode: 'too early', verdict: null, share_expected: round(sh, 3), basis: 'Under 10% of registrations expected by now: too early to forecast' });
        const P = s.passRegistered; future = P / sh - P; how = 'pass registrations so far ÷ ' + Math.round(sh * 100) + '% expected by now on 2025\'s curve' + (s.compRegistered ? ', plus ' + nf(s.compRegistered) + ' competitors already in' : '');
      } else {
        const ser = dailySeries(ds, addDays(D, -6), D), rr = ser.registrations.reduce((a, b) => a + b, 0) / 7, dl = Math.max(0, daysBetween(D, addDays(ev.eventStartDay, -1)));
        if (t && t.registration_goal && R < 0.1 * t.registration_goal) return Object.assign(out, { mode: 'too early', verdict: null, basis: 'Under 10% of the registration goal is in: too early to forecast' });
        future = rr * dl; how = 'registrations so far + last 7 days\' rate (' + round(rr, 1) + '/day) for ' + dl + ' more days, with room for a late surge';
      }
    }
    // money and status changes the user made (budget moves, releases, pauses) shift the outcome until the data catches up
    const userFx = live || o.noUser ? [] : userEffects(ds, D, assump), ext = userFx.concat(o.extra || []);
    let notYet = null;
    if (live) { notYet = { c: 0, o: 0 }; s.regByPerson.forEach((r, p) => { if (s.visitors.has(p)) return; if (r.status === 'confirmed') notYet.c++; else if (r.status !== 'cancelled') notYet.o++; }); }
    const rnd = seeded(ds.label + '|' + D), runs = [], plain = [];
    for (let i = 0; i < N; i++) {
      const sc = draw(rnd(), assump, 'showup_confirmed'), sie = draw(rnd(), assump, 'showup_interested'), sil = draw(rnd(), assump, 'showup_interested_late'), sw = draw(rnd(), assump, 'showup_waitlisted'), ws = draw(rnd(), assump, 'walkin_share'), mu = rnd(), m = curve ? draw(mu, assump, 'future_regs') : tri(mu, 0.6, 1.0, 1.8), y = draw(rnd(), assump, 'release_yield');
      let total;
      if (live) total = s.visitorCount + (notYet.c * tri(rnd(), 0.4, 0.5, 0.6) + notYet.o * 0.05) / (1 - ws);
      else {
        const si = interestedRate(sie, sil, daysLeft), pr = (s.status.confirmed * sc + s.status.interested * si + s.status.waitlisted * sw) / R;
        total = (R + future * m) * pr / (1 - ws);
      }
      plain.push(total);
      ext.forEach(x => { const n = x.attendees !== undefined ? x.attendees : x.cost > 0 ? x.amount / x.cost : 0; total += n * (n > 0 ? y : 1); });
      runs.push(Math.max(s.visitorCount, total));
      if (ext.length) { let t0 = plain[plain.length - 1]; (o.extra || []).length && userFx.forEach(x => { t0 += x.attendees * (x.attendees > 0 ? y : 1); }); plain[plain.length - 1] = t0; }
    }
    // our own students (no registration step): hostel students and day scholars, each with its own range
    const H = ev.hostel || 0, DS = ev.dayScholars || 0, totals = [];
    if (H || DS) { const rh = seeded(ds.label + '|host|' + D); for (let i = 0; i < N; i++) { const h = H * draw(rh(), assump, 'hostel_attend') + DS * draw(rh(), assump, 'dayscholar_attend'); totals.push(runs[i] + Math.max(s.hostVisitorCount, live ? Math.max(s.hostVisitorCount, h) : h)); } }
    const pick = arr => { const a = arr.slice().sort((x, y) => x - y); return { bad: a[Math.floor(N * 0.1)], likely: a[Math.floor(N * 0.5)], good: a[Math.floor(N * 0.9)] }; };
    const q = pick(runs), q0 = pick(plain);
    const pr0 = perRegistrant(s, assump, 'value', daysLeft);
    return Object.assign(out, {
      mode: live ? 'live' : 'forecast', bad: r10(q.bad), likely: r10(q.likely), good: r10(q.good), verdict: verdict(q.bad, q.likely),
      chance: base ? round(runs.filter(v => v >= base).length / N, 2) : null, chance_stretch: stretch ? round(runs.filter(v => v >= stretch).length / N, 2) : null,
      user_changes: userFx.length ? userFx.map(x => ({ campaign: campName(ds, x.campaign_id), change: x.label, attendees: x.attendees })) : null,
      before_extra: o.extra && o.extra.length ? { bad: r10(q0.bad), likely: r10(q0.likely), good: r10(q0.good), verdict: verdict(q0.bad, q0.likely) } : null,
      projected_registrations: live ? R : Math.round(R + future), attend_per_registrant: round(pr0, 3), days_left: daysLeft,
      total: totals.length ? (() => { const q2 = pick(totals), tb = t.all_attendees_base || null; return { bad: r10(q2.bad), likely: r10(q2.likely), good: r10(q2.good), target: tb, stretch: t.all_attendees_stretch || null, our_students: r10(q2.likely - q.likely), verdict: tb ? (q2.bad >= tb ? 'Safe' : q2.likely >= tb ? 'Ahead, not safe yet' : 'Off track') : null }; })() : null,
      basis: live ? 'Visitors so far + confirmed people not yet in × 40–60% on day 2 + walk-ins' : 'Final registrations (' + how + ') × chance each one comes, by status, + walk-ins. Played 1,000 times with each input drawn from its range.'
    });
  }
  function projection(ds, D, assump) {
    const f = forecast(ds, D, assump);
    return { mode: f.mode, actual: f.visitors_so_far, low: f.bad === undefined ? null : f.bad, likely: f.likely === undefined ? null : f.likely, high: f.good === undefined ? null : f.good, verdict: f.verdict, chance: f.chance, projected_registrations: f.projected_registrations, basis: f.basis };
  }
  function checkpoints(ds) {
    const ev = ds.event, curve = ds.paceCurve.length > 0;
    const review = ev.today || addDays(ev.eventStartDay, -33);
    return { review, eve: addDays(ev.eventStartDay, -1), result: ev.end, today: ev.today || null, curve };
  }

  function teamPlan(ds, D, t) {
    if (!t || !t.teams_goal || !ds.event.competitionOpens) return null;
    const pts = [[ds.event.competitionOpens, 0], [addDays(ds.event.planStart, 41), t.teams_by_week6 || 0], [addDays(ds.event.planStart, 55), t.teams_by_week8 || 0], [addDays(ds.event.planStart, 69), t.teams_goal]];
    if (D <= pts[0][0]) return { goal: t.teams_goal, by_now: 0 };
    for (let i = 1; i < pts.length; i++) if (D <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return { goal: t.teams_goal, by_now: Math.round(a[1] + (b[1] - a[1]) * daysBetween(a[0], D) / daysBetween(a[0], b[0])) }; }
    return { goal: t.teams_goal, by_now: t.teams_goal };
  }
  function kpis(ds, D, assump) {
    const s = snapshot(ds, D), t = s.target;
    const proj = projection(ds, D, assump);
    const g = t ? { identified: t.identified_external_people_goal || null, registered: t.registration_goal, visitors: t.unique_external_visitors_goal, budget: t.marketing_budget_inr, version: t.target_version, since: t.effective_at, stretch_registered: t.stretch_registration_goal || null, stretch_visitors: t.stretch_visitors_goal || null, all_attendees_base: t.all_attendees_base || null, all_attendees_stretch: t.all_attendees_stretch || null } : null;
    return {
      asOf: D, dataset: ds.label, target: g,
      identified: s.identified, registered: s.registered, passRegistered: s.passRegistered, competitors: s.compRegistered, teams: s.teams, teamPlan: teamPlan(ds, D, t), active: s.active, status: Object.assign({}, s.status),
      visitors: s.visitorCount, visitorsRegistered: s.visitorsRegistered, walkins: s.walkins, ourStudents: s.hostVisitorCount, allVisitors: s.visitorCount + s.hostVisitorCount, hasHost: !!(ds.event.hostel || ds.event.dayScholars),
      showup: round(s.showup, 4), walkinShare: round(div(s.walkins, s.visitorCount), 4),
      spend: s.spend, budgetUsed: g ? round(div(s.spend, g.budget), 4) : null,
      costPerVisitor: round(div(s.spend, s.visitorCount), 1), costPerRegistration: round(div(s.spend, s.registered), 1),
      expectedFromRegistered: Math.round(s.registered * (perRegistrant(s, assump, 'value', daysBetween(D, ds.event.eventStartDay)) || 0)),
      costPerAttendee: round(div(s.spend, D >= ds.event.eventStartDay ? s.visitorCount : s.registered * (perRegistrant(s, assump, 'value', daysBetween(D, ds.event.eventStartDay)) || 0)), 1),
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
      const c = ds.camps.get(id) || {}, cs = id ? campState(ds, id, D) : {};
      const a = s.anon[id] || { spend: 0, impressions: 0, clicks: 0, reach: 0, sessions: 0, starts: 0 };
      const st = { confirmed: 0, interested: 0, waitlisted: 0, cancelled: 0 }; let registered = 0;
      const M = c.audience_type === 'host' ? s.hostReg : s.regByPerson;
      M.forEach((r, p) => { const at = o.attribution === 'first' ? ((ds.people.get(p) || {}).first_campaign_id || null) : r.campaign_id; if (at === id) { registered++; st[r.status] = (st[r.status] || 0) + 1; } });
      let visitors = 0, visReg = 0; s.visitors.forEach((t, p) => { if (attributionOf(ds, s, p, o.attribution) === id) { visitors++; if (s.regByPerson.has(p)) visReg++; } });
      const ia = s.ia[id] || {};
      const pc = t => (s.iaPeopleByCamp[id + '|' + t] || new Set()).size;
      const expected = st.confirmed * A(assump, 'showup_confirmed') + st.interested * interestedRate(A(assump, 'showup_interested'), A(assump, 'showup_interested_late'), daysBetween(D, ds.event.eventStartDay)) + st.waitlisted * A(assump, 'showup_waitlisted');
      let teamMembers = 0; if (id) M.forEach((r, p) => { if (r.campaign_id === id) { const pp = ds.people.get(p); if (pp && pp.segment === 'competitor') teamMembers++; } });
      // before the fest, cost is judged on the whole plan: planned budget ÷ attendees expected once all sign-ups are in (today's ÷ share of the sign-up window passed)
      const win = id ? windowShare(ds, D, c) : null, finalExp = win ? expected / win : null, plannedNow = id ? Math.max(cs.planned || 0, a.spend) : null;
      return {
        campaign_id: id, campaign: campName(ds, id), channel: c.channel || (id ? '' : 'none'), owner_id: c.owner_id || null, owner: id ? ownerName(ds, c.owner_id) : 'Growth lead',
        kind: c.kind || (id ? 'channel' : ''), bet_type: c.bet_type || null, audience: c.audience_type === 'host' ? 'our students' : 'outside', cost_cap_inr: o.assumptions && o.assumptions.cost_cap && o.assumptions.cost_cap.user ? o.assumptions.cost_cap.value : c.cost_cap_inr || null, reserve_released_inr: cs.released || 0,
        status: id ? cs.status : '', planned_budget_inr: id ? cs.planned : null,
        spend: a.spend, impressions: a.impressions, clicks: a.clicks, sessions: a.sessions, form_starts_anon: a.starts,
        ctr: round(div(a.clicks, a.impressions), 4), session_to_start: round(div(a.starts, a.sessions), 4),
        identified_first_touch: s.identifiedByFirst[id] || 0,
        form_starters: pc('registration_start'),
        registered, active: st.confirmed + st.interested + st.waitlisted, confirmed: st.confirmed, interested: st.interested, waitlisted: st.waitlisted, cancelled: st.cancelled,
        cancel_rate: round(div(st.cancelled, registered), 4),
        visitors, visitors_registered: visReg, showup: round(div(visReg, registered), 4),
        expected_visitors: Math.round(expected),
        cost_per_registration: round(div(a.spend, registered), 1), cost_per_visitor: round(div(a.spend, visitors), 1),
        cost_per_expected_visitor: finalExp ? round(div(plannedNow, finalExp), 1) : round(div(a.spend, expected), 1), expected_final_visitors: finalExp ? Math.round(finalExp) : null, window_share: win ? round(win, 3) : null, team_members: teamMembers,
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
    let identified = 0; ds.tables.people.forEach(p => { if (p.person_type === 'external' && reached(p) && p.first_seen_at && p.first_seen_at <= s.cut && inC(p.person_id)) identified++; });
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

  /* The same four steps for every dataset: responded → registered → confirmed → attended. */
  function funnelView(ds, D, assump, campaignId) {
    const s = snapshot(ds, D), f = funnel(ds, D, campaignId), t = s.target || {}, filt = campaignId && campaignId !== 'all';
    const get = n => (f.steps.find(x => x.step.startsWith(n)) || {}).n || 0, ended = D >= ds.event.eventEndDay, started = D >= ds.event.eventStartDay;
    let spend = s.spend; if (filt) spend = (s.anon[campaignId] || { spend: 0 }).spend;
    let attended, expected = false, walkins = filt ? 0 : s.walkins;
    if (started) attended = get('Visited');
    else if (filt) { const r = campaignRows(ds, D, { assumptions: assump }).find(x => x.campaign_id === campaignId) || {}; attended = r.expected_visitors || 0; expected = true; }
    else { const pr = perRegistrant(s, assump, 'value', daysBetween(D, ds.event.eventStartDay)); attended = pr !== null ? Math.round(s.registered * pr) : null; walkins = 0; expected = true; }
    const sh = shareAt(ds, D);
    const steps = [
      { key: 'reached', label: 'Responded', help: 'Outside people who did something back: left their details, opened a page, signed up or walked in. Not everyone we messaged. Each person counted once.', n: get('Identified'), target: filt ? null : t.identified_external_people_goal || null },
      { key: 'registered', label: 'Registered', help: 'Signed up for a pass.', n: get('Registered'), target: filt ? null : t.registration_goal || null, pace: !filt && sh !== null && !started ? Math.round(t.registration_goal * sh) : null },
      { key: 'confirmed', label: 'Confirmed', help: 'Said "I am coming" (latest status on this date).', n: get('Confirmed'), target: null },
      { key: 'attended', label: expected ? 'Will come (from today\'s sign-ups)' : 'Came', help: expected ? 'Estimate for people already registered: each status × the chance it comes. The forecast on Overview ("heading for") also adds sign-ups still to come and walk-ins.' : 'Scanned in at the gate and verified, counted once per person.', n: attended, expected, target: filt ? null : t.unique_external_visitors_goal || null }
    ];
    steps.forEach((x, i) => { x.from_prev = i && steps[i - 1].n ? round(x.n / steps[i - 1].n, 4) : null; x.cost_each = x.n ? round(spend / x.n, 0) : null; });
    let worst = null; steps.forEach((x, i) => { if (i && x.from_prev !== null && (!worst || x.from_prev < worst.from_prev)) worst = x; });
    return { asOf: D, campaign: f.campaign, steps, walkins, competitors: filt ? 0 : s.compRegistered, total_attended: attended !== null ? attended + walkins : null, spend, biggest_drop: worst ? worst.key : null, started, ended };
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
    ds.tables.people.forEach(p => { if (p.person_type !== 'external' || !reached(p)) return; const i = idx.get(day(p.first_seen_at)); if (i !== undefined && cf(p.first_campaign_id)) out.identified[i]++; });
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
      const bp = t.registration_goal * sh, sp = t.stretch_registration_goal ? t.stretch_registration_goal * sh : null, a = s.passRegistered;
      const level = sh < 0.03 ? 'none' : sp !== null && a >= sp ? 'ok' : a >= bp ? 'watch' : a >= 0.85 * bp ? 'warn' : 'act';
      return [{ key: 'registered', curve: true, goal_label: 'Outside pass registrations (competition teams paced separately)', competitors: s.compRegistered, teams: s.teams, week: weekOf(ds, D), expected_share: round(sh, 3), actual: a, base_goal: t.registration_goal, stretch_goal: t.stretch_registration_goal || null, base_pace: Math.round(bp), stretch_pace: sp !== null ? Math.round(sp) : null, vs_base: round(div(a, bp), 3), level, rule: 'At or above stretch pace = fine; above base, below stretch = Watch; up to 15% below base = Warn; more than 15% below base = Act' }];
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
    const cap = ds.event.gateCap || A(assump, 'gate_capacity');
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
    if (ended) return { asOf: D, error: 'The fest is over: money can no longer change attendance.' };
    const fp = campState(ds, fromId, D).planned || f.spend, amt = Math.min(Math.max(0, amount), Math.max(0, fp - f.spend));
    if (!(amt > 0)) return { asOf: D, error: f.campaign + ' has no unspent planned money to move (planned ' + rs(fp) + ', spent ' + rs(f.spend) + ').' };
    const lo = trancheEffect(ds, D, fromId, -amt, assump), gi = trancheEffect(ds, D, toId, amt, assump), y = A(assump, 'release_yield');
    const lost = lo ? -lo.attendees : 0, gained = gi ? gi.attendees : 0;
    return {
      asOf: D, moved: amt, from: f.campaign, to: t.campaign, basis: 'Each campaign\'s own curve: attendees it is on course for at its planned budget, with diminishing returns (its scale factor). The same maths as the Bets page and the forecast.',
      attendees_lost: lost, attendees_gained_if_it_works_like_its_test: gained, attendees_gained_likely: Math.round(gained * y), net_change_likely: Math.round(gained * y - lost),
      cost_each_from: lo ? lo.cost_each : null, cost_each_to: gi ? gi.cost_each : null, from_detail: lo ? lo.basis : null, to_detail: gi ? gi.basis : null,
      caveat: 'Planning estimate. New money usually does a bit worse than the test (we count ' + Math.round(y * 100) + '% of it as most likely). The forecast tool gives the effect on the total with its range.'
    };
  }

  /* Share of a campaign's sign-up window that has passed by D, on the pace curve (1 once registrations close).
     Used to project what today's numbers grow to by the fest, so early costs are not judged on half the results. */
  function windowShare(ds, D, c) {
    if (D >= addDays(ds.event.eventStartDay, -1)) return 1;
    const sh = shareAt(ds, D);
    if (sh === null) { const s = snapshot(ds, D), f = s.registered ? forecastRegs(ds, D) : null; return f ? Math.min(1, Math.max(0.05, s.registered / f)) : null; }
    const start = [day((c && (c.effect_starts_at || c.planned_start_at)) || '') || ds.event.start, ds.event.regOpens || ''].sort().pop();
    const s0 = D > start ? shareAt(ds, start) || 0 : sh, w = s0 >= 1 ? 1 : (sh - s0) / (1 - s0);
    return w > 0 ? Math.min(1, Math.max(0.05, w)) : null;
  }
  function forecastRegs(ds, D) { const ser = dailySeries(ds, addDays(D, -6), D), rr = ser.registrations.reduce((a, b) => a + b, 0) / 7, s = snapshot(ds, D); return s.registered + rr * Math.max(0, daysBetween(D, addDays(ds.event.eventStartDay, -1))); }
  /* What a change in a campaign's money does to attendees, on its own diminishing-returns curve:
     attendees(budget) = projected attendees at the planned budget × (budget ÷ planned)^scale.
     A top-up of R buys projected × ((P+R)/P)^b − projected extra attendees; a cut loses the same way. */
  function trancheEffect(ds, D, id, amount, assump, o) {
    o = o || {}; const c = ds.camps.get(id); if (!c || !amount) return null;
    const b = c.scale_factor || A(assump, 'scale_factor'), bet = c.kind === 'bet';
    let final;
    if (bet) { const r = betRows(ds, D, assump).find(x => x.campaign_id === id); final = r ? r.projected_extra_at_plan : null; }
    else { const r = campaignRows(ds, D, { assumptions: assump }).find(x => x.campaign_id === id); final = r ? r.expected_final_visitors : null;
      // competition teams fill fixed slots: money cannot add more of them, so only the other sign-ups scale
      if (r && r.team_members && r.window_share) final = Math.max(0, r.expected_visitors - r.team_members * 0.9) / r.window_share; }
    const cs = campState(ds, id, D), spent = (snapshot(ds, D).anon[id] || { spend: 0 }).spend, P0 = Math.max(o.planned !== undefined ? o.planned : (cs.planned || 0), spent, 1);
    const win = windowShare(ds, D, c), rem = win === null ? 1 : Math.max(0, 1 - win);
    if (!(rem > 0)) return { campaign_id: id, campaign: c.campaign_name, amount, attendees: 0, cost_each: null, planned: P0, basis: 'Registrations have closed: money can no longer change attendance' };
    if (!(final > 0)) return { campaign_id: id, campaign: c.campaign_name, amount, attendees: 0, cost_each: null, planned: P0, basis: 'No measured effect yet, so no attendees are counted' };
    const P1 = Math.max(spent, P0 + amount), extra = final * (Math.pow(P1 / P0, b) - 1) * rem, y = amount > 0 ? A(assump, 'release_yield') : 1;
    // new money does a bit worse than the test (release_yield), so a top-up's price counts only that share; a cut loses the full amount
    return { campaign_id: id, campaign: c.campaign_name, amount: P1 - P0, attendees: Math.round(extra), attendees_likely: Math.round(extra * y), cost_each: extra ? round(Math.abs((P1 - P0) / (extra * y)), 0) : null, yield: y, planned: P0, projected_at_plan: Math.round(final), scale_factor: b,
      window_left: round(rem, 3), basis: (bet ? 'Extra attendees this bet is on course for' : 'Attendees this campaign is on course for') + ' at its planned ' + rs(P0) + ' (' + nf(final) + ') × ((' + rs(P1) + ' ÷ ' + rs(P0) + ')^' + b + ' − 1) × ' + Math.round(rem * 100) + '% of sign-ups still to come' };
  }
  function userEffects(ds, D, assump) {
    if (D >= ds.event.eventStartDay || !userWindow(ds, D)) return [];
    const out = [];
    ds.camps.forEach((c, id) => {
      const cs = campState(ds, id, D); if (!cs.user || !cs.user.changes.length) return;
      if (cs.user.status && cs.user.status !== 'active') {
        const r = c.kind === 'bet' ? betRows(ds, D, assump).find(x => x.campaign_id === id) : campaignRows(ds, D, { assumptions: assump }).find(x => x.campaign_id === id);
        const now = r ? (c.kind === 'bet' ? r.expected_extra_attendees : r.expected_visitors) : 0, fin = r ? (c.kind === 'bet' ? r.projected_extra_at_plan : r.expected_final_visitors) : 0;
        if (fin > now) out.push({ campaign_id: id, label: cs.user.status, attendees: -Math.round(fin - now) });
      } else if (cs.user.delta) {
        const fx = trancheEffect(ds, D, id, cs.user.delta, assump, { planned: cs.planned - cs.user.delta });
        if (fx && fx.attendees) out.push({ campaign_id: id, label: (cs.user.delta > 0 ? '+' : '−') + rs(Math.abs(cs.user.delta)), attendees: fx.attendees });
      }
    });
    return out;
  }
  /* ---------- bets: test vs comparison, expected extra attendees, next-tranche cost ---------- */
  /* t distribution CDF (normal approximation with a small-sample correction; good to about 0.01 for df ≥ 3) */
  function tCdf(t, df) { if (!(df > 0)) return normCdf(t); const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df)); return normCdf(z); }
  function normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  function betRows(ds, D, assump) {
    const key = 'bets|' + D + '|' + (assump ? JSON.stringify(assump) : ''); if (ds._cache.has(key)) return ds._cache.get(key);
    const out = betRows0(ds, D, assump); ds._cache.set(key, out); return out;
  }
  function betRows0(ds, D, assump) {
    const s = snapshot(ds, D), cut = s.cut, bets = ds.tables.campaigns.filter(c => c.kind === 'bet');
    if (!bets.length) return [];
    const z = () => ({ n: 0, reg: 0, confirmed: 0, interested: 0, waitlisted: 0, cancelled: 0 }), arms = {}, expansion = z();
    ds.tables.people.forEach(p => {
      if (p.arm === 'expansion' && p.first_seen_at && p.first_seen_at <= cut) { expansion.n++; const r = s.regByPerson.get(p.person_id); if (r) { expansion.reg++; expansion[r.status]++; } }
      if (!p.test_bet || !p.first_seen_at || p.first_seen_at > cut || !(p.person_type === 'external' || p.person_type === 'host')) return;
      const k = p.arm === 'test' || p.arm === 'comparison' || p.arm === 'scaled' || p.arm === 'scaled_comparison' ? p.arm : 'direct';
      const g = (arms[p.test_bet] = arms[p.test_bet] || { test: z(), comparison: z(), direct: z(), scaled: z(), scaled_comparison: z() })[k]; g.n++;
      const r = s.regByPerson.get(p.person_id) || s.hostReg.get(p.person_id); if (r) { g.reg++; g[r.status]++; }
      if (p.college_id) { g.cl = g.cl || {}; const c = g.cl[p.college_id] = g.cl[p.college_id] || { n: 0, reg: 0 }; c.n++; if (r) c.reg++; }
    });
    const sc = A(assump, 'showup_confirmed'), si = interestedRate(A(assump, 'showup_interested'), A(assump, 'showup_interested_late'), daysBetween(D, ds.event.eventStartDay)), sw = A(assump, 'showup_waitlisted');
    const apr = g => g.reg ? (g.confirmed * sc + g.interested * si + g.waitlisted * sw) / g.reg : 0;
    const minN = 300;
    return bets.map(c => {
      const id = c.campaign_id, a = arms[id] || { test: z(), comparison: z(), direct: z(), scaled: z(), scaled_comparison: z() }, sp = (s.anon[id] || { spend: 0 }).spend, cs = campState(ds, id, D);
      const startDay = [day(c.planned_start_at) || ds.event.start, ds.event.regOpens || ''].sort().pop(), weeks = Math.max(0, daysBetween(startDay, D) + 1) / 7;
      const cap = assump && assump.cost_cap && assump.cost_cap.user ? assump.cost_cap.value : c.cost_cap_inr || A(assump, 'cost_cap'), scale = c.scale_factor || A(assump, 'scale_factor');
      const hasComp = a.comparison.n > 0;
      let rt = null, rc = null, lift = null, se = null, sure = null, unit = null, extraRegs, perReg, extra, extraLow = null, extraHigh = null, evidence = [], fair = true;
      if (hasComp) {
        rt = div(a.test.reg, a.test.n); rc = div(a.comparison.reg, a.comparison.n);
        lift = rt !== null && rc !== null ? rt - rc : null;
        // colleges, not people, are what was assigned: when each side has 3+ colleges, compare college rates (Welch t-test);
        // otherwise people were assigned one by one, so compare people
        const cr = g => Object.values(g.cl || {}).filter(c => c.n >= 20).map(c => c.reg / c.n), ct = cr(a.test), cc = cr(a.comparison);
        const mean = v => v.reduce((x, y) => x + y, 0) / v.length, vr = v => { const m = mean(v); return v.reduce((x, y) => x + (y - m) * (y - m), 0) / Math.max(1, v.length - 1); };
        if (ct.length >= 3 && cc.length >= 3) {
          const vt = vr(ct) / ct.length, vc = vr(cc) / cc.length; se = Math.sqrt(vt + vc);
          const df = se ? Math.pow(vt + vc, 2) / ((vt * vt) / (ct.length - 1) + (vc * vc) / (cc.length - 1) || 1) : 1;
          sure = lift !== null && se ? tCdf(lift / se, df) : lift > 0 ? 1 : 0; unit = ct.length + ' vs ' + cc.length + ' colleges';
        } else { se = a.test.n && a.comparison.n ? Math.sqrt(rt * (1 - rt) / a.test.n + rc * (1 - rc) / a.comparison.n) : null; sure = lift !== null && se ? normCdf(lift / se) : null; unit = 'people'; }
        perReg = apr(a.test); extraRegs = lift !== null ? a.test.n * lift : 0; extra = extraRegs * perReg;
        extraLow = lift !== null && se ? a.test.n * Math.max(0, lift - 0.8416 * se) * perReg : null;
        extraHigh = lift !== null && se ? a.test.n * Math.max(0, lift + 0.8416 * se) * perReg : null;
        if (a.test.n < minN || a.comparison.n < minN) evidence.push(nf(Math.min(a.test.n, a.comparison.n)) + ' people in the smaller group; need ' + minN);
        if (ds.event.regOpens && D < ds.event.regOpens) evidence.push('registrations open ' + dlabel(ds.event.regOpens));
        else if (weeks < 2) evidence.push('under 2 weeks of registrations');
        else if (a.test.reg < 50) evidence.push('only ' + a.test.reg + ' sign-ups in the test group; need 50');
        fair = !evidence.length;
        if (sure !== null && sure < 0.8) evidence.push('gap only ' + Math.round(sure * 100) + '% likely to be real; need 80%');
        else if (lift !== null && lift < 0.02) evidence.push('gap under 2 points (' + (lift * 100).toFixed(1) + '); too small to matter');
      } else {
        const g = a.direct, nw = A(assump, 'volunteer_new'); perReg = apr(g); extraRegs = g.reg * nw; extra = extraRegs * perReg;
        extraLow = g.reg * A(assump, 'volunteer_new', 'low') * perReg; extraHigh = g.reg * A(assump, 'volunteer_new', 'high') * perReg;
        if (ds.event.regOpens && D < ds.event.regOpens) { evidence.push('registrations open ' + dlabel(ds.event.regOpens)); fair = false; }
        else if (g.reg < 30) { evidence.push('only ' + g.reg + ' sign-ups so far; need 30'); fair = false; }
        else evidence.push('no comparison group: only the ' + Math.round(nw * 100) + '% assumed not to have come anyway are counted (A)');
      }
      // colleges added with reserve money: judged against similar new colleges that did not get it
      let scaledExtra = 0, scaledInfo = null;
      if (a.scaled.n && cs.released > 0) {
        const rs_ = div(a.scaled.reg, a.scaled.n), rb = expansion.n ? div(expansion.reg, expansion.n) : rc;
        scaledExtra = rb !== null ? a.scaled.n * Math.max(-1, rs_ - rb) * apr(a.scaled) : 0;
        scaledInfo = { people: a.scaled.n, registered: a.scaled.reg, rate: round(rs_, 4), baseline_rate: round(rb, 4), extra_attendees: Math.round(scaledExtra) };
      }
      // project to the fest: today's extra people are only the share of the bet's sign-up window that has passed
      const win = windowShare(ds, D, Object.assign({}, c, { planned_start_at: startDay })) || 1, eve = D >= addDays(ds.event.eventStartDay, -1);
      const P = eve ? sp : Math.max(cs.planned || 0, sp), finalExtra = extra > 0 ? extra / win + (scaledExtra > 0 ? scaledExtra / win : 0) : 0, finalLow = extraLow > 0 ? extraLow / win : null;
      const avg = finalExtra > 0 && P > 0 ? P / finalExtra : null, avgLow = finalLow > 0 && P > 0 ? P / finalLow : null;
      // the verdict judges the bet on its own money and its own test; reserve money and the colleges it funded are judged apart (funded_colleges)
      const coreP = Math.max(1, P - (cs.released || 0)), coreExtra = extra > 0 ? extra / win : 0, avgCore = cs.released > 0 ? (coreExtra > 0 ? coreP / coreExtra : null) : avg;
      // money added now can only move the sign-ups still to come: the share of the window left (1 − share passed)
      const rem = eve ? 0 : Math.max(0, 1 - (win || 0)), yl = A(assump, 'release_yield'), tranche = R => finalExtra > 0 && P > 0 && rem > 0 ? R / (finalExtra * (Math.pow((P + R) / P, scale) - 1) * rem * yl) : null, t50 = tranche(50000), t100 = tranche(100000), next = t50;
      const evidenceOk = hasComp ? evidence.length === 0 : fair, behind = c.plan_extra_attendees > 0 && finalExtra > 0 && finalExtra < 0.6 * c.plan_extra_attendees;
      let decision, why;
      if (cs.status === 'stopped') { decision = 'Stopped'; why = 'Stopped at a review' + (cs.decisions.length ? ' (' + cs.decisions[cs.decisions.length - 1].reason + ')' : ''); }
      else if (!fair) { decision = 'Too early'; why = 'Not a fair test yet: ' + evidence.join('; '); }
      else if (hasComp && !evidenceOk) { decision = 'Stop'; why = 'Fair test, but no clear gap over the comparison group (' + evidence.join('; ') + ')'; }
      else if (!(extra > 0)) { decision = 'Stop'; why = 'No lift over the comparison group'; }
      else if (avgCore > cap) { decision = 'Change'; why = 'Each extra attendee costs ' + rs(avgCore) + (cs.released > 0 ? ' on its own budget' : '') + ', above its ' + rs(cap) + ' limit'; }
      else if (behind) { decision = 'Change'; why = 'On course for ' + nf(finalExtra) + ' extra attendees, under 60% of the ' + nf(c.plan_extra_attendees) + ' the plan counts on: fix how it works before it gets more money'; }
      else if (next <= cap && (avgLow === null || avgLow <= cap) && !eve) { decision = 'Scale'; why = 'A ₹50k top-up would buy extra attendees at about ' + rs(t50) + ' each' + (t100 ? ' (₹1L: ' + rs(t100) + ')' : '') + ', under its ' + rs(cap) + ' limit'; }
      else { decision = 'Keep'; why = 'Works at ' + rs(avg) + ' per extra attendee' + (eve ? '' : ', but a ₹50k top-up would cost about ' + rs(next) + ' each, above its ' + rs(cap) + ' limit: no reserve money'); }
      return {
        campaign_id: id, bet: c.campaign_name, rank: c.bet_rank || null, type: c.bet_type || null, owner_id: c.owner_id, owner: ownerName(ds, c.owner_id), audience: c.audience_type === 'host' ? 'our students' : 'outside', test_design: c.test_design || '',
        weeks_live: round(weeks, 1), spend: sp, planned_budget_inr: cs.planned, reserve_released_inr: cs.released, last_release: cs.lastRelease, status: cs.status,
        test_people: hasComp ? a.test.n : a.direct.n, test_registered: hasComp ? a.test.reg : a.direct.reg, comparison_people: hasComp ? a.comparison.n : null, comparison_registered: hasComp ? a.comparison.reg : null,
        test_rate: round(rt, 4), comparison_rate: round(rc, 4), lift: round(lift, 4), sure_lift_above_zero: round(sure, 3), gap_real: sure === null ? null : sure >= 0.9 ? 'High' : sure >= 0.8 ? 'Medium' : 'Low', compared_by: unit,
        extra_registrations: Math.round(extraRegs), attendees_per_registrant: round(perReg, 3), expected_extra_attendees: Math.round(extra), expected_extra_low: extraLow !== null ? Math.round(extraLow) : null, expected_extra_high: extraHigh !== null ? Math.round(extraHigh) : null,
        cost_per_extra: round(avg, 0), cost_per_extra_own_budget: round(avgCore, 0), cost_per_extra_low_end: round(avgLow, 0), scale_factor: scale, next_tranche_cost: round(next, 0), tranche_cost_50k: round(t50, 0), tranche_cost_1l: round(t100, 0), cost_cap_inr: cap,
        projected_extra_at_plan: Math.round(finalExtra), plan_extra_attendees: c.plan_extra_attendees || null, share_of_plan: c.plan_extra_attendees > 0 ? round(finalExtra / c.plan_extra_attendees, 2) : null, behind_plan: !!behind, window_share: round(win, 3), window_left: round(rem, 3), planned_for_cost: P, funded_colleges: scaledInfo,
        evidence_ok: evidenceOk, evidence_gaps: evidence, decision, why,
        basis: 'Extra registrations = test people × (test rate − comparison rate). Expected extra attendees = extra registrations × show-up by status (A). Before the fest, cost per extra = planned budget ÷ extra attendees projected to the fest (today\'s ÷ share of the sign-up window passed). Top-up cost = R ÷ [projected × (((P+R)/P)^scale − 1) × share of sign-ups still to come × 80% yield].'
      };
    }).sort((x, y) => (x.rank || 99) - (y.rank || 99));
  }
  function reserveReleased(ds, D) { let t = 0; ds.camps.forEach((c, id) => { t += campState(ds, id, D).released; }); return t; }
  function reserveLeft(ds, D) { return (ds.event.reserve || 0) - reserveReleased(ds, D || ds.event.end); }
  function reservePlan(ds, D, assump) {
    const key = 'rp|' + D + '|' + (assump ? JSON.stringify(assump) : ''); if (ds._cache.has(key)) return ds._cache.get(key);
    const all = betRows(ds, D, assump), y = A(assump, 'release_yield'), recent = r => r.last_release && daysBetween(r.last_release, D) < 13;
    let left = reserveLeft(ds, D); const amt = {}, why = {}, price = {};
    // 1. GROW: a proven bet whose next attendee costs no more than the limit gets a top-up
    all.filter(r => r.decision === 'Scale' && !recent(r)).sort((a, b) => a.next_tranche_cost - b.next_tranche_cost).forEach(r => {
      if (left < 50000) return;
      const high = r.sure_lift_above_zero !== null && r.sure_lift_above_zero >= 0.9, size = high && r.tranche_cost_1l !== null && r.tranche_cost_1l <= r.cost_cap_inr && left >= 100000 ? 100000 : 50000;
      amt[r.campaign_id] = size; left -= size; price[r.campaign_id] = size > 50000 ? r.tranche_cost_1l : r.tranche_cost_50k;
      why[r.campaign_id] = 'Grow: ' + (size > 50000 ? '₹1L (gap High) buys attendees at ' + rs(r.tranche_cost_1l) : '₹50k buys attendees at ' + rs(r.tranche_cost_50k)) + ' each, under the ' + rs(r.cost_cap_inr) + ' limit';
    });
    // 2. PROTECT (weeks 10 and 12): if the MOST LIKELY outcome misses the target, price a ladder of ₹50k steps on every
    // campaign that works (proven bets and channels not marked Change or Stop), cheapest first, at most ₹1.5L more per
    // campaign and at most 2× the limit per extra attendee. Release it only if the whole ladder brings most likely to the
    // target: money that cannot save the commitment is not worth paying above the limit for.
    const t = targetAt(ds, D) || {}, goal = t.unique_external_visitors_goal, dl = daysBetween(D, ds.event.eventStartDay), cap = A(assump, 'cost_cap'), ceiling = 2 * cap, per = 150000;
    let protect = null;
    if (goal && dl > 1 && dl <= 35) {
      const ext = a => Object.keys(a).map(id => { const fx = trancheEffect(ds, D, id, a[id], assump); return { amount: a[id], attendees: fx ? fx.attendees : 0 }; });
      const f0 = forecast(ds, D, assump, { extra: ext(amt) });
      if (f0.likely < goal) {
        const rows = campaignRows(ds, D, { assumptions: assump }), lad = Object.assign({}, amt), steps = []; let f = f0, room = left;
        const cands = all.filter(r => (r.decision === 'Scale' || r.decision === 'Keep') && r.projected_extra_at_plan > 0 && !recent(r)).map(r => ({ id: r.campaign_id, name: r.bet }))
          .concat(rows.filter(r => r.kind === 'channel' && r.status !== 'paused' && r.status !== 'stopped' && r.expected_final_visitors > 0 && !(r.cost_per_expected_visitor > cap)).map(r => ({ id: r.campaign_id, name: r.campaign })));
        while (f.likely < goal && room >= 50000 && steps.length < 12) {
          let best = null;
          cands.forEach(c => { const have = lad[c.id] || 0; if (have + 50000 > per) return; const a = trancheEffect(ds, D, c.id, have + 50000, assump), b = have ? trancheEffect(ds, D, c.id, have, assump) : null, add = (a ? a.attendees : 0) - (b ? b.attendees : 0); if (add > 0) { const p = 50000 / (add * y); if (!best || p < best.p) best = { c, p }; } });
          if (!best || best.p > ceiling) break;
          lad[best.c.id] = (lad[best.c.id] || 0) + 50000; room -= 50000; steps.push({ campaign_id: best.c.id, campaign: best.c.name, price: Math.round(best.p) });
          f = forecast(ds, D, assump, { extra: ext(lad) });
        }
        const feasible = f.likely >= goal;
        protect = { target: goal, likely_before: f0.likely, bad_before: f0.bad, likely_after: f.likely, bad_after: f.bad, feasible, steps, spend: steps.length * 50000, price_ceiling: ceiling, per_campaign_cap: per,
          verdict: feasible ? 'Release: these steps bring the most likely outcome to the target' : 'Commitment at risk: even every step under ' + rs(ceiling) + ' leaves most likely at ' + nf(f.likely) + ', so no money above the limit is released; fix what is behind plan instead' };
        if (feasible) steps.forEach(s => { amt[s.campaign_id] = (amt[s.campaign_id] || 0) + 50000; left -= 50000; why[s.campaign_id] = (why[s.campaign_id] ? why[s.campaign_id] + '; then ' : '') + 'Protect: most likely ' + nf(f0.likely) + ' is under the ' + nf(goal) + ' target; cheapest step ₹50k at ' + rs(s.price) + ' each'; price[s.campaign_id] = Math.max(price[s.campaign_id] || 0, s.price); });
      }
    }
    const out = Object.keys(amt).map(id => { const r = all.find(x => x.campaign_id === id) || { bet: campName(ds, id), cost_cap_inr: A(assump, 'cost_cap'), sure_lift_above_zero: null, gap_real: null }; return { campaign_id: id, bet: r.bet, amount: amt[id], next_tranche_cost: price[id], cap: r.cost_cap_inr, sure: r.sure_lift_above_zero, gap_real: r.gap_real, kind: /^Protect/.test(why[id]) ? 'protect' : 'grow', rule: why[id] }; }).sort((a, b) => b.amount - a.amount);
    const released = []; ds.camps.forEach((c, id) => { const st = campState(ds, id, D); if (st.released) released.push({ campaign_id: id, bet: c.campaign_name, amount: st.released, last: st.lastRelease }); });
    const res = { reserve_total: ds.event.reserve || 0, reserve_left: reserveLeft(ds, D), suggestions: out, protect, already_released: released, rule: 'Two steps. Grow: a proven bet (Scale) gets ₹50k, or ₹1L with a High gap, if its next attendee costs no more than the limit after the 80% yield. Protect (weeks 10 and 12): if the most likely outcome misses the target, price ₹50k steps on every working campaign (proven bets and channels), cheapest first, up to ₹1.5L each and 2× the limit per extra attendee; release them only if together they bring most likely to the target.' };
    ds._cache.set(key, res); return res;
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
    const pct = v => v === null ? '–' : Math.round(v * 100) + '%';
    const add = f => { if (f.level !== 'ok' && f.level !== 'none') out.push(f); };
    // 1. are we heading for the target?
    if (!ended) {
      const fc = forecast(ds, D, assump);
      if (fc.verdict && fc.verdict !== 'Safe') add({ id: 'forecast-visitors', term: 'Outcome', level: fc.verdict === 'Off track' ? 'act' : 'warn', title: 'Attendee target: ' + (fc.verdict === 'Off track' ? 'off track' : 'ahead, not safe yet'),
        reason: (fc.verdict === 'Off track' ? 'Most likely ' + nf(fc.likely) : 'With bad luck ' + nf(fc.bad)) + ' outside attendees vs the ' + nf(fc.target) + ' target', value: fc.likely,
        evidence: 'Forecast: bad luck ' + nf(fc.bad) + ' · most likely ' + nf(fc.likely) + ' · good luck ' + nf(fc.good) + ' vs target ' + nf(fc.target) + '. ' + fc.basis,
        matters: 'Attendees are the outcome we are judged on.', if_nothing: 'We land near the most likely number, ' + nf(fc.likely) + '.',
        owner: 'Growth lead', action: 'Follow the reserve rule on the Money page (grow, or protect if it closes the gap); fix bets behind plan; push confirm-your-spot reminders.', trust: 'maybe' });
    }
    pace(ds, D).forEach(p => {
      if (p.curve) {
        if (before && (p.level === 'warn' || p.level === 'act')) add({ id: 'pace-registered', term: 'Register', level: p.level, title: 'Registrations: below plan pace', reason: nf(p.actual) + ' registered; plan for this week ' + nf(p.base_pace), value: p.vs_base,
          evidence: 'Week ' + p.week + ': ' + nf(p.actual) + ' outside registrations vs base pace ' + nf(p.base_pace) + (p.stretch_pace ? ' and stretch pace ' + nf(p.stretch_pace) : '') + ' (' + Math.round(p.expected_share * 100) + '% of final registrations expected by now).',
          matters: 'Fewer sign-ups now means fewer attendees later.', if_nothing: 'The gap grows as late sign-ups follow the same pace.', owner: 'Growth lead', action: "Find the lagging bet and have its owner fix it this week.", trust: 'maybe' });
        return;
      }
      if (before && p.key !== 'visitors' && p.required_per_day) {
        const ratio = p.run_rate_7d / p.required_per_day;
        add({ id: 'pace-' + p.key, term: p.key === 'identified' ? 'Responses' : 'Register', level: grade(ratio, R.pace_ratio), title: ({ identified: 'People who responded', registered: 'Registrations' })[p.key] + ': behind pace', reason: p.run_rate_7d + ' a day vs ' + p.required_per_day + ' needed', value: round(ratio, 2),
          evidence: 'Last 7 days: ' + p.run_rate_7d + '/day. Needed: ' + p.required_per_day + '/day for ' + p.days_left + ' days to reach ' + nf(p.goal) + ' (now ' + nf(p.actual) + ').', matters: 'The goal needs a faster daily rate than we have.', if_nothing: 'We finish about ' + nf(p.actual + p.run_rate_7d * p.days_left) + ' of ' + nf(p.goal) + '.',
          owner: 'Growth lead', action: 'Shift effort to the cheapest proven campaign.', trust: 'proven' });
      }
      if (ended) add({ id: 'goal-' + p.key, term: 'Outcome', level: grade(p.attainment, R.attainment), title: ({ identified: 'People who responded', registered: 'Registrations', visitors: 'Outside visitors' })[p.key] + ': below goal', reason: nf(p.actual) + ' of ' + nf(p.goal) + ' (' + pct(p.attainment) + ')', value: p.attainment,
        evidence: nf(p.actual) + ' of ' + nf(p.goal) + '.', matters: 'This is the final result.', if_nothing: 'Carry the lesson into the next plan.', owner: 'Growth lead', action: 'Find the step that lost the most people and fix it next time.', trust: 'proven' });
    });
    // 2. budget
    const b = budget(ds, D);
    if (b.approved) {
      if (b.spent > b.approved) add({ id: 'budget-over', term: 'Budget', level: 'act', title: 'Budget: overspent', reason: rs(b.spent) + ' spent of ' + rs(b.approved), value: b.used, evidence: rs(b.spent) + ' spent vs ' + rs(b.approved) + ' approved.', matters: 'Spend beyond approval is not allowed.', if_nothing: 'Overspend grows.', owner: 'Growth lead', action: 'Freeze new spend until approved.', trust: 'proven' });
      else add({ id: 'budget-burn', term: 'Budget', level: grade(b.burn_vs_time, R.budget_burn, true), title: 'Budget: spending fast', reason: pct(b.used) + ' spent with ' + pct(b.time_elapsed) + ' of the time gone', value: b.burn_vs_time, evidence: pct(b.used) + ' of the budget used with ' + pct(b.time_elapsed) + ' of the campaign window gone.', matters: 'Money spent early cannot follow what works later.', if_nothing: 'Less money left for the last, busiest weeks.', owner: 'Growth lead', action: 'Find who is front-loading spend; hold the reserve.', trust: 'proven' });
    }
    // 3. bets and campaigns
    const rows = campaignRows(ds, D, { assumptions: assump }).filter(r => r.campaign_id);
    const cap = A(assump, 'cost_cap');
    if (!ended) betRows(ds, D, assump).forEach(b => {
      const lv = { Stop: 'act', Change: 'warn', 'Too early': 'watch' }[b.decision]; if (!lv || (ds.event.regOpens && D < ds.event.regOpens)) return;
      const reason = b.decision === 'Too early' ? b.evidence_gaps[0] : b.decision === 'Stop' ? 'no clear gap over the comparison group' : b.behind_plan ? 'on course for ' + nf(b.projected_extra_at_plan) + ' extra attendees vs ' + nf(b.plan_extra_attendees) + ' in the plan (' + Math.round(b.share_of_plan * 100) + '%)' : rs(b.cost_per_extra_own_budget || b.cost_per_extra) + ' per extra attendee; limit ' + rs(b.cost_cap_inr);
      add({ id: 'bet-' + b.campaign_id, term: 'Bet', level: lv, title: b.bet + ': ' + (b.decision === 'Too early' ? 'too early to judge' : b.decision === 'Stop' ? 'not working' : b.behind_plan ? 'behind plan' : 'costs too much'), reason, value: b.cost_per_extra,
        evidence: b.why + '. ' + (b.test_rate !== null ? 'Test ' + pct(b.test_rate) + ' registered vs comparison ' + pct(b.comparison_rate) : nf(b.test_registered) + ' sign-ups (no comparison group)') + '; about ' + nf(b.expected_extra_attendees) + ' extra attendees (est.).',
        matters: b.decision === 'Too early' ? 'Judging too soon can kill a good idea or fund a lucky one.' : b.decision === 'Stop' ? 'Money spent here brings no extra people.' : b.behind_plan ? 'The target counts on this bet; at this pace it delivers under 60% of its share.' : 'Each extra person costs more than we agreed to pay.',
        if_nothing: b.decision === 'Too early' ? 'Nothing breaks; it gets no reserve money until the test is fair.' : 'We keep paying ' + rs(b.cost_per_extra) + ' for each extra person.',
        owner: b.owner, action: b.decision === 'Too early' ? 'Keep the test running; no reserve money until it is fair.' : b.decision === 'Stop' ? 'Stop spending; its unspent money is not spent elsewhere.' : b.behind_plan ? 'Fix how it works (offer, channel, timing); no reserve money until it is back on course.' : 'Change the mechanic or cut its cost; no reserve money while above the limit.', trust: 'maybe' });
    });
    rows.forEach(r => {
      if (r.kind === 'bet' || r.status === 'stopped') return;
      const base = ended ? r.visitors : r.expected_visitors, cost = ended ? r.cost_per_visitor : r.cost_per_expected_visitor;
      if (base >= min && cost !== null) add({ id: 'cost-' + r.campaign_id, term: 'Cost', level: grade(cost / cap, R.cost_vs_cap, true), title: r.campaign + ': costs too much', reason: rs(cost) + ' per ' + (ended ? '' : 'expected ') + 'attendee; limit ' + rs(cap), value: cost,
        evidence: rs(r.spend) + ' spent, ' + nf(base) + (ended ? ' outside visitors' : ' expected attendees (est.)') + ' → ' + rs(cost) + ' each vs the ' + rs(cap) + ' limit.', matters: 'The same money brings more people elsewhere.', if_nothing: 'We keep paying ' + rs(cost) + ' for each person.',
        owner: r.owner, action: 'Cut it to reveals and reminders only; move the rest to a cheaper campaign.', trust: ended ? 'proven' : 'maybe' });
      if (ended && r.registered >= min && s.showup !== null) add({ id: 'showup-' + r.campaign_id, term: 'Show-up', level: grade(s.showup - r.showup, R.showup_gap, true), title: r.campaign + ': fewer registrants came', reason: pct(r.showup) + ' came vs ' + pct(s.showup) + ' overall', value: r.showup,
        evidence: pct(r.showup) + ' of registrants came vs ' + pct(s.showup) + ' overall (' + nf(r.visitors_registered) + ' of ' + nf(r.registered) + ').', matters: 'Sign-ups that do not come cost money and bring no one.', if_nothing: 'Next year repeats it.', owner: r.owner, action: 'Add commitment steps (confirm, group sign-up, reminders) for this audience.', trust: 'proven' });
      if (before && r.active >= min) { const cr = r.confirmed / r.active, all = s.active ? s.status.confirmed / s.active : null; if (all !== null) add({ id: 'confirm-' + r.campaign_id, term: 'Show-up', level: grade(all - cr, R.showup_gap, true), title: r.campaign + ': few have confirmed', reason: pct(cr) + ' have confirmed; ' + pct(all) + ' overall', value: round(cr, 3),
        evidence: pct(cr) + ' of active registrants confirmed vs ' + pct(all) + ' overall.', matters: 'Confirmed people come about 75% of the time; unconfirmed ones far less.', if_nothing: 'Fewer of these sign-ups turn into attendees.', owner: r.owner, action: 'Send a confirm-your-spot reminder to its unconfirmed registrants.', trust: 'maybe' }); }
      const emailed = (s.iaPeopleByCamp[r.campaign_id + '|nurture_email_sent'] || new Set()).size;
      if (!ended && emailed >= min) add({ id: 'optout-' + r.campaign_id, term: 'Reach (guardrail)', level: grade(r.opt_outs / emailed, R.opt_out, true), title: r.campaign + ': opt-outs rising', reason: pct(r.opt_outs / emailed) + ' of people emailed opted out; limit ' + pct(R.opt_out.warn), value: round(r.opt_outs / emailed, 3),
        evidence: nf(r.opt_outs) + ' of ' + nf(emailed) + ' emailed people opted out.', matters: 'People who opt out can never be reminded again.', if_nothing: 'We lose the people we most need to remind before the fest.', owner: r.owner, action: 'At most one email a week; never email people who opted out.', trust: 'proven' });
      if (r.registered >= min) add({ id: 'cancel-' + r.campaign_id, term: 'Register (guardrail)', level: grade(r.cancel_rate, R.cancel_rate, true), title: r.campaign + ': many cancel', reason: pct(r.cancel_rate) + ' cancelled; limit ' + pct(R.cancel_rate.warn), value: r.cancel_rate,
        evidence: nf(r.cancelled) + ' of ' + nf(r.registered) + ' registrations cancelled.', matters: 'The audience may not match the fest.', if_nothing: 'Spend keeps buying sign-ups that cancel.', owner: r.owner, action: 'Ask cancellers why (one-question survey).', trust: 'maybe' });
    });
    // 4. walk-ins and gates
    if (s.visitorCount >= min) add({ id: 'walkins', term: 'Walk-ins', level: grade(div(s.walkins, s.visitorCount), R.walkin_share, true), title: 'Walk-ins: many came unregistered', reason: pct(div(s.walkins, s.visitorCount)) + ' of visitors had not registered', value: round(div(s.walkins, s.visitorCount), 3),
      evidence: nf(s.walkins) + ' of ' + nf(s.visitorCount) + ' visitors had no registration.', matters: 'Unregistered crowds are harder to plan for at the gate.', if_nothing: 'Gate queues and safety risk grow.', owner: 'Growth lead', action: 'Move the help desk to the gate with on-the-spot QR sign-up.', trust: 'proven' });
    const dsx = dayStats(ds, D, assump);
    if (dsx.peak_hour && dsx.verified_entries) add({ id: 'gate-peak', term: 'Ceiling', level: grade(dsx.peak_vs_capacity, R.gate_load, true), title: 'Gates: peak hour near capacity', reason: nf(dsx.peak_hour.entries) + ' entries in the busiest hour; safe limit ' + nf(dsx.gate_capacity_assumed), value: dsx.peak_vs_capacity,
      evidence: nf(dsx.peak_hour.entries) + ' entries at ' + dsx.peak_hour.hour + ' vs a safe ' + nf(dsx.gate_capacity_assumed) + '/hour.', matters: 'Crowding at the gate is a safety risk.', if_nothing: 'Long queues; security may stop entry.', owner: 'Security / operations lead', action: 'Spread arrivals with entry windows. Growth flags; security decides.', trust: 'maybe' });
    // 5. data trust
    const last = ds.lastDataDay.daily; if (before && last && daysBetween(last, D) > 2) out.push({ id: 'stale', term: 'Data', level: 'warn', title: 'Data: marketing numbers look old', reason: 'latest spend row is ' + daysBetween(last, D) + ' days old', value: daysBetween(last, D), evidence: 'Latest spend row is ' + last + '.', matters: 'Decisions on old numbers can be wrong.', if_nothing: 'Spend signals may mislead.', owner: 'Growth lead', action: 'Check the data import before acting on spend signals.', trust: 'proven' });
    const order = { act: 0, warn: 1, watch: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  /* ---------- safe query tool for unfamiliar questions ---------- */
  function virtualRows(ds, D, table) {
    const s = snapshot(ds, D), cut = s.cut;
    const cmeta = id => { const c = ds.camps.get(id) || {}; return { campaign_name: campName(ds, id || null), channel: c.channel || null, owner_name: ownerName(ds, c.owner_id) }; };
    const tfields = t => ({ date: day(t), month: t ? t.slice(0, 7) : null, week: t ? weekStart(day(t)) : null, hour: t ? Number(t.slice(11, 13)) : null, weekday: t ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(day(t) + 'T00:00:00Z').getUTCDay()] : null });
    if (table === 'people') return ds.tables.people.filter(p => p.first_seen_at && p.first_seen_at <= cut && reached(p) && p.person_type === 'external').map(p => Object.assign({ person_id: p.person_id, person_type: p.person_type, first_touch_source: p.first_touch_source, campaign_id: p.first_campaign_id, registered: s.regByPerson.has(p.person_id), visited: s.visitors.has(p.person_id), status: (s.regByPerson.get(p.person_id) || {}).status || null }, cmeta(p.first_campaign_id), tfields(p.first_seen_at)));
    if (table === 'registrations') return s.regs.map(r => Object.assign({ registration_id: r.registration_id, person_id: r.person_id, status: r.status, campaign_id: r.campaign_id, visited: s.visitors.has(r.person_id) }, cmeta(r.campaign_id), tfields(r.registered_at)));
    if (table === 'visitors') return Array.from(s.visitors.entries()).map(([p, t]) => { const r = s.regByPerson.get(p); return Object.assign({ person_id: p, registered: !!r, status: r ? r.status : null, campaign_id: r ? r.campaign_id : null, first_entry: t }, cmeta(r ? r.campaign_id : null), tfields(t)); });
    if (table === 'checkins') return ds.tables.checkins.filter(c => c.occurred_at && c.occurred_at <= cut && ds.ext.has(c.person_id)).map(c => Object.assign({ event_id: c.event_id, person_id: c.person_id, result: c.result, verification: c.verification, source: c.source, person_type: (ds.people.get(c.person_id) || {}).person_type || null, campaign_id: c.campaign_id }, cmeta(c.campaign_id), tfields(c.occurred_at)));
    if (table === 'interactions') return ds.tables.interactions.filter(i => i.occurred_at && i.occurred_at <= cut && ds.ext.has(i.person_id)).map(i => Object.assign({ interaction_id: i.interaction_id, person_id: i.person_id, event_type: i.event_type, detail: ds.details[i.detail_code] !== undefined ? ds.details[i.detail_code] : (i.detail || null), person_type: (ds.people.get(i.person_id) || {}).person_type || null, campaign_id: i.campaign_id }, cmeta(i.campaign_id), tfields(i.occurred_at)));
    if (table === 'daily') return ds.tables.daily.filter(r => day(r.activity_date) <= D).map(r => Object.assign({ activity_id: r.activity_id, campaign_id: r.campaign_id, platform: r.platform, impressions: num(r.impressions), clicks: num(r.clicks), reported_reach: num(r.reported_reach), landing_page_sessions: num(r.landing_page_sessions), registration_starts: num(r.registration_starts), marketing_spend_inr: num(r.marketing_spend_inr) }, cmeta(r.campaign_id), tfields(r.activity_date)));
    if (table === 'campaigns') return ds.tables.campaigns.map(c => Object.assign({}, c, cmeta(c.campaign_id)));
    if (table === 'status_history') return ds.tables.reg_history.filter(h => h.effective_at && h.effective_at <= cut && ds.ext.has(h.person_id)).map(h => Object.assign({ registration_id: h.registration_id, person_id: h.person_id, status: h.status, campaign_id: h.campaign_id }, cmeta(h.campaign_id), tfields(h.effective_at)));
    return null;
  }
  const QUERY_TABLES = { people: 'Outside people who responded (first seen ≤ date), with their latest registration status and whether they visited. Internal, staff, test and our own students are excluded, as on every screen', registrations: 'Registrations (external people) with latest status as of the date', visitors: 'Unique verified external visitors with first entry time', checkins: 'All admission records of outside people (any result) up to the date', interactions: 'Outside people\'s actions: page_visit, brochure_download, registration_start, event_question_submitted, nurture_email_sent/opened/clicked, opted_out', daily: 'Daily campaign activity: impressions, clicks, reported_reach, landing_page_sessions, registration_starts, marketing_spend_inr', campaigns: 'Campaign list', status_history: 'Every registration status version up to the date' };
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
    function pow() { const v = factor(); if (s[i] === '^') { i++; return Math.pow(v, pow()); } return v; }
    function term() { let v = pow(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const r = pow(); v = o === '*' ? v * r : v / r; } return v; }
    function expr0() { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
    const v = expr0(); if (i < s.length) throw new Error('Unexpected "' + s[i] + '"');
    return round(v, 6);
  }

  const api = { trancheEffect, userEffects, userChanged, windowShare, funnelView, forecast, checkpoints, campState, planDecisionsAt, reserveReleased, betRows, reservePlan, reserveLeft, shareAt, weekOf, TABLES, SHEETS, KEYS, REQUIRED, DEFAULT_ASSUMPTIONS, DEFAULT_RULES, QUERY_TABLES, normTime, rowsToObjects, validate, applyEdits, build, snapshot, kpis, projection, campaignRows, funnel, anonFunnel, trend, pace, budget, dayStats, quality, explainChange, calibration, whatIf, flags, query, calculate, targetAt, addDays, daysBetween, campName, ownerName, round };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GCEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
