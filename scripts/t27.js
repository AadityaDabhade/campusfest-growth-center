const E=require('../engine.js'),fs=require('fs');
function load(dir){const raw={};E.TABLES.forEach(t=>{try{raw[t]=E.rowsToObjects(JSON.parse(fs.readFileSync(dir+'/'+t+'.json')))}catch(e){raw[t]=[]}});return raw}
const ds=E.build(load('data27'),{label:'2027'});
console.log(ds.validation);
for(const D of ['2027-02-28','2027-03-07','2027-03-14']){const k=E.kpis(ds,D);console.log(D,'wk',k.week,'reg',k.registered,k.status,'spend',k.spend,'proj',JSON.stringify(k.projection));console.log(JSON.stringify(E.pace(ds,D)[0]))}
const D='2027-03-14';
E.betRows(ds,D).forEach(b=>console.log(b.bet,'|n',b.test_people,b.comparison_people,'|rt',b.test_rate,'rc',b.comparison_rate,'sure',b.sure_lift_above_zero,'|extra',b.expected_extra_attendees,'low',b.expected_extra_low,'|spend',b.spend,'avg',b.cost_per_extra,'low',b.cost_per_extra_low_end,'next',b.next_tranche_cost,'cap',b.cost_cap_inr,'=>',b.decision,'|',b.why));
E.campaignRows(ds,D).forEach(r=>console.log(r.campaign_id,r.campaign,r.kind,'reg',r.registered,'conf',r.confirmed,'exp',r.expected_visitors,'spend',r.spend,'cpev',r.cost_per_expected_visitor,'optout',r.opt_out_rate,'cancel',r.cancel_rate));
console.log(JSON.stringify(E.reservePlan(ds,D)));
E.flags(ds,D).forEach(f=>console.log(f.level,f.title,'|',f.evidence));
console.log(JSON.stringify(E.funnel(ds,D).steps.map(s=>s.n)));
