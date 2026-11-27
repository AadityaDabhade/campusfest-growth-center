// 2027 checks. Part 1 are rules that must hold for any data; part 2 checks the rehearsal story is told correctly.
// The rehearsal is simulated, so part 2 does not prove the forecast right: the simulated "truth" deliberately differs
// from the forecast's assumptions (sign-ups come later than 2025's curve, fewer walk-ins, fewer of our own students).
const E = require('../engine.js'), fs = require('fs');
function load(dir) { const raw = {}; E.TABLES.forEach(t => { try { raw[t] = E.rowsToObjects(JSON.parse(fs.readFileSync(dir + '/' + t + '.json'))); } catch (e) { raw[t] = []; } }); return raw; }
const raw = load('data27'), ds = E.build(raw, { label: '2027 plan (simulated)' });
let fail = 0; const ok = (n, c) => { if (!c) { fail++; console.log('FAIL', n); } };
const cp = E.checkpoints(ds), D = cp.review, REV = { 7: '2027-01-03', 10: '2027-01-24', 12: '2027-02-07' };

// ---------- part 1: rules ----------
ok('no repeated rows', Object.values(ds.dups).every(v => !v));
const shut = JSON.parse(JSON.stringify(E.DEFAULT_ASSUMPTIONS)); for (const k in shut) { shut[k].low = shut[k].value; shut[k].high = shut[k].value; }
const s = E.snapshot(ds, D), sh = E.shareAt(ds, D), A = shut;
const pr = (s.status.confirmed * A.showup_confirmed.value + s.status.interested * A.showup_interested.value + s.status.waitlisted * A.showup_waitlisted.value) / s.registered;
const plain = (s.passRegistered / sh + s.compRegistered) * pr / (1 - A.walkin_share.value), f0 = E.forecast(ds, D, shut);
ok('zero range: bad = likely = good', f0.bad === f0.likely && f0.likely === f0.good);
ok('zero range: likely = plain formula ' + Math.round(plain) + ' vs ' + f0.likely, Math.abs(f0.likely - plain) <= 10);
ok('same seed, same answer', JSON.stringify(E.forecast(ds, D)) === JSON.stringify(E.forecast(ds, D)));
// nothing after the date is used
const lateReg = raw.registrations.filter(r => r.registered_at > D + 'T23:59:59' && ds.ext.has(r.person_id)).length;
ok('no future leak: registrations after the date are not counted', E.snapshot(ds, D).registered + lateReg >= E.snapshot(ds, cp.result).registered);
ok('no future leak: reserve released by week 10 = week 7 release only', E.reserveLeft(ds, D) === ds.event.reserve - ds.plan.filter(p => p.kind === 'release_reserve' && p.decided_at <= D + 'T23:59:59').reduce((a, p) => a + p.amount_inr, 0));
ok('reserve never goes below zero', [REV[7], REV[10], REV[12], cp.result].every(d => E.reserveLeft(ds, d) >= 0));
const w10 = E.forecast(ds, D), eve = E.forecast(ds, cp.eve), res = E.kpis(ds, cp.result).visitors;
ok('range narrows from week 10 to fest eve', (eve.good - eve.bad) < (w10.good - w10.bad));
// the same pricing everywhere: the Bets page top-up cost = the what-if cost = the forecast effect
const b7 = E.betRows(ds, REV[7]).find(x => x.campaign_id === 'B1'), te = E.trancheEffect(ds, REV[7], 'B1', 50000);
ok('top-up price: Bets page ' + b7.tranche_cost_50k + ' = what-if ' + te.cost_each, Math.abs(b7.tranche_cost_50k - te.cost_each) <= 2);
const wi = E.whatIf(ds, D, 'C02', 'B2', 5000);
ok('what-if uses the same curves', wi.attendees_gained_if_it_works_like_its_test === E.trancheEffect(ds, D, 'B2', 5000).attendees && wi.attendees_lost === -E.trancheEffect(ds, D, 'C02', -5000).attendees);
// edits flow into the forecast at "today", and never into the simulated dates after it
const edit = (c) => E.build(E.applyEdits(raw, [{ id: 'X1', type: 'campaign_update', payload: { campaign_id: c.id, change: c.change, as_of: D } }]), { label: '2027 plan (simulated)' });
const paused = edit({ id: 'C02', change: { status: 'paused' } }), topped = edit({ id: 'B2', change: { release: 100000 } });
ok('pausing a channel lowers the forecast', E.forecast(paused, D).likely < w10.likely);
ok('a release raises the forecast and reserve left falls', E.forecast(topped, D).likely > w10.likely && E.reserveLeft(topped, D) === E.reserveLeft(ds, D) - 100000);
ok('user decisions do not leak into the rehearsal dates', JSON.stringify(E.forecast(topped, REV[12])) === JSON.stringify(E.forecast(ds, REV[12])));
// the analyst's query tool counts the same people as the screens
ok('query people = people who responded', E.query(ds, D, { table: 'people' }).result === E.kpis(ds, D).identified);
// volunteers: only the assumed 45% count as extra
const v = E.betRows(ds, D).find(x => x.campaign_id === 'B4');
ok('volunteers: extra = 45% of sign-ups', Math.abs(v.extra_registrations - 0.45 * v.test_registered) <= 1);
// the rehearsal's money follows the rule at every review
for (const w of [7, 10, 12]) {
  const want = E.reservePlan(ds, REV[w]).suggestions.map(x => x.campaign_id + ':' + x.amount).sort().join(','), have = ds.plan.filter(p => p.kind === 'release_reserve' && p.decided_at.slice(0, 10) === E.addDays(REV[w], 1)).map(p => p.campaign_id + ':' + p.amount_inr).sort().join(',');
  ok('week ' + w + ' releases follow the rule (' + (want || 'none') + ')', want === have);
}

// ---------- part 2: the story (labelled rehearsal) ----------
console.log('week 7', JSON.stringify(E.forecast(ds, REV[7])).slice(0, 0) + E.forecast(ds, REV[7]).likely, E.forecast(ds, REV[7]).verdict, '| week 10', w10.bad, w10.likely, w10.good, w10.verdict, '| eve', eve.bad, eve.likely, eve.good, '| result', res, '| forecast error at week 10:', Math.round((w10.likely - res) / res * 100) + '%');
ok('week 10 is Off track (the bets run behind plan)', w10.verdict === 'Off track');
const rp10 = E.reservePlan(ds, D); ok('week 10: protect prices the ladder, finds it cannot reach the target, releases nothing', rp10.protect && !rp10.protect.feasible && rp10.suggestions.length === 0 && rp10.protect.steps.every(s => s.price <= 600));
ok('the week-10 forecast range holds the result', E.forecast(ds, D).bad <= E.kpis(ds, cp.result).visitors && E.kpis(ds, cp.result).visitors <= E.forecast(ds, D).good);
ok('no screen text says we never pay more than the limit', !/never pay more than/.test(fs.readFileSync('app.js', 'utf8')));
const dec = Object.fromEntries(E.betRows(ds, D).map(x => [x.campaign_id, x.decision])); console.log('bets week 10', JSON.stringify(dec));
ok('week 10: Day Scholar too early', dec.B3 === 'Too early');
ok('week 12: Day Scholar stops', E.betRows(ds, REV[12]).find(x => x.campaign_id === 'B3').decision === 'Stop');
ok('teams on plan at week 10', E.kpis(ds, D).teams >= 0.9 * E.targetAt(ds, D).teams_goal);
// the rehearsal is not self-confirming: the floor (everything but the bets\' extra attendees) lands inside the plan model\'s floor range
const resD = cp.result, kr = E.kpis(ds, resD), betX = E.betRows(ds, resD).filter(b => b.audience === 'outside').reduce((a, b) => a + Math.max(0, b.projected_extra_at_plan), 0), floor = kr.visitors - betX;
console.log('result: floor', floor, 'bets incl. reserve', betX); ok('floor inside the model range 1,910–2,233', floor >= 1910 && floor <= 2233);
console.log(fail ? fail + ' failures' : 'ALL 2027 CHECKS PASS');
