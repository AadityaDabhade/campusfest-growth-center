// Makes the 2027 rehearsal follow the money rule exactly: at each review, release what the Bets page suggests,
// regenerate, repeat until nothing changes. Data before a release never depends on it (gen27.py uses its own random
// stream for reserve money), so this settles in a few rounds.
const { execSync } = require('child_process'), fs = require('fs'), E = require('../engine.js');
const load = dir => { const raw = {}; E.TABLES.forEach(t => { try { raw[t] = E.rowsToObjects(JSON.parse(fs.readFileSync(dir + '/' + t + '.json'))); } catch (e) { raw[t] = []; } }); return raw; };
const REV = { 7: '2027-01-03', 10: '2027-01-24', 12: '2027-02-07' };   // the Sunday before each review meeting
let plan = [];
for (let round = 0; round < 8; round++) {
  fs.writeFileSync('scripts/releases27.json', JSON.stringify(plan));
  execSync('python3 scripts/gen27.py', { stdio: 'ignore' });
  const ds = E.build(load('data27'), { label: '2027 plan (simulated)' });
  // the earliest review whose suggestion differs from the plan decides the next plan
  let next = null;
  for (const w of [7, 10, 12]) {
    const want = E.reservePlan(ds, REV[w]).suggestions.map(s => [w, s.campaign_id, s.amount]);
    const have = plan.filter(p => p[0] === w);
    if (JSON.stringify(want) !== JSON.stringify(have)) { next = plan.filter(p => p[0] < w).concat(want); break; }
  }
  console.log('round', round, JSON.stringify(plan), next ? '→ change' : '→ settled');
  if (!next) break;
  plan = next;
}
