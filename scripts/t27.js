// 2027 checks: the forecast agrees with the plain formula when every range is shut, and the story holds at each checkpoint.
const E=require('../engine.js'),fs=require('fs');
function load(dir){const raw={};E.TABLES.forEach(t=>{try{raw[t]=E.rowsToObjects(JSON.parse(fs.readFileSync(dir+'/'+t+'.json')))}catch(e){raw[t]=[]}});return raw}
const ds=E.build(load('data27'),{label:'2027 plan (simulated)'});let fail=0;const ok=(n,c)=>{if(!c){fail++;console.log('FAIL',n)}};ok('no repeated rows',Object.values(ds.dups).every(v=>!v));
const shut=JSON.parse(JSON.stringify(E.DEFAULT_ASSUMPTIONS));for(const k in shut){shut[k].low=shut[k].value;shut[k].high=shut[k].value}
const D='2027-01-24',s=E.snapshot(ds,D),sh=E.shareAt(ds,D),A=shut;
const pr=(s.status.confirmed*A.showup_confirmed.value+s.status.interested*A.showup_interested.value+s.status.waitlisted*A.showup_waitlisted.value)/s.registered;
const plain=(s.passRegistered/sh+s.compRegistered)*pr/(1-A.walkin_share.value),f=E.forecast(ds,D,shut);
ok('zero range: bad = likely = good',f.bad===f.likely&&f.likely===f.good);ok('zero range: likely = plain formula '+Math.round(plain)+' vs '+f.likely,Math.abs(f.likely-plain)<=10);
const cp=E.checkpoints(ds),w10=E.forecast(ds,cp.review),eve=E.forecast(ds,cp.eve),res=E.kpis(ds,cp.result).visitors;
console.log('week 10',w10.bad,w10.likely,w10.good,w10.verdict,'| eve',eve.bad,eve.likely,eve.good,eve.verdict,'| result',res);
ok('same seed, same answer',JSON.stringify(E.forecast(ds,D))===JSON.stringify(E.forecast(ds,D)));
ok('range narrows from week 10 to fest eve',(eve.good-eve.bad)<(w10.good-w10.bad));
ok('result inside the fest eve range',res>=eve.bad&&res<=eve.good);
ok('week 10 is Ahead, not safe yet',w10.verdict==='Ahead, not safe yet');ok('fest eve is Safe',eve.verdict==='Safe');
const b=E.betRows(ds,D),dec=Object.fromEntries(b.map(x=>[x.campaign_id,x.decision]));console.log('bets week 10',JSON.stringify(dec));
ok('week 10: Group Pass and Outreach scale',dec.B2==='Scale'&&dec.B1==='Scale');ok('week 10: Day Scholar too early',dec.B3==='Too early');
const b12=Object.fromEntries(E.betRows(ds,'2027-02-07').map(x=>[x.campaign_id,x.decision]));ok('week 12: Day Scholar stops',b12.B3==='Stop');
// the rehearsal follows the money rule: at every review the plan releases exactly what the Bets page suggests
for(const [w,d] of [[10,'2027-01-24'],[12,'2027-02-07'],[14,'2027-02-21']]){const want=E.reservePlan(ds,d).suggestions.map(x=>x.campaign_id+':'+x.amount).sort().join(','),have=ds.plan.filter(p=>p.kind==='release_reserve'&&p.decided_at.slice(0,10)===E.addDays(d,1)).map(p=>p.campaign_id+':'+p.amount_inr).sort().join(',');ok('week '+w+' releases follow the rule ('+want+')',want===have)}
ok('reserve left at result = 1.5L',E.reserveLeft(ds,cp.result)===150000);ok('no future leak: reserve full at week 10',E.reserveLeft(ds,D)===450000);ok('teams on plan at week 10',E.kpis(ds,D).teams>=280);
console.log(fail?fail+' failures':'ALL 2027 CHECKS PASS');
