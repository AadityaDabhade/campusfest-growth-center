const E=require('../engine.js'),fs=require('fs');
const raw={};E.TABLES.forEach(t=>{try{raw[t]=E.rowsToObjects(JSON.parse(fs.readFileSync('data/'+t+'.json')))}catch(e){raw[t]=[]}});
const details=JSON.parse(fs.readFileSync('data/details.json'));
const ds=E.build(raw,{details,label:'2025 original'});
const ref=JSON.parse(fs.readFileSync('scripts/ref.json'));
let fail=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok){fail++;console.log('FAIL',n,a,b)}};
for(const k in ref.dups) eq('dups '+k,ds.dups[k]||0,ref.dups[k]);
for(const D of ['2025-02-28','2025-03-15','2025-04-11','2025-04-20']){
 const k=E.kpis(ds,D),r=ref[D];
 eq(D+' identified',k.identified,r.identified);eq(D+' registered',k.registered,r.registered);
 for(const s of ['confirmed','cancelled','waitlisted','interested']) eq(D+' '+s,k.status[s]||0,r.status[s]||0);
 eq(D+' visitors',k.visitors,r.visitors);eq(D+' walkins',k.walkins,r.walkins);eq(D+' spend',k.spend,r.spend);
 eq(D+' target',k.target?k.target.version:null,r.target?r.target.target_version:null);
 const rows=E.campaignRows(ds,D);
 for(const c in r.by_campaign){const x=rows.find(z=>z.campaign_id===c);eq(D+c+' reg',x.registered,r.by_campaign[c].registered);eq(D+c+' vis',x.visitors,r.by_campaign[c].visitors);eq(D+c+' spend',x.spend,r.by_campaign[c].spend);}
}
const d=E.dayStats(ds,'2025-04-20');eq('days',d.by_day.map(x=>x.unique_visitors),[1430,1345]);eq('peak',d.peak_hour.entries,400);eq('entries',d.verified_entries,ref['2025-04-20'].entries);
console.log('both days',d.both_days,'entries/visitor',d.entries_per_visitor);
console.log(fail?fail+' failures':'ALL REFERENCE CHECKS PASS');
console.log('pace 03-15',JSON.stringify(E.pace(ds,'2025-03-15')));
console.log('proj 04-11',JSON.stringify(E.projection(ds,'2025-04-11')));
console.log('calib',JSON.stringify(E.calibration(ds)));
console.log('budget',JSON.stringify(E.budget(ds,'2025-03-15')));
console.log('flags end',E.flags(ds,'2025-04-20').map(f=>f.level+' '+f.id+' '+f.value).join('\n'));
console.log('flags 03-20',E.flags(ds,'2025-03-20').map(f=>f.level+' '+f.id+' '+f.value).join('\n'));
console.log('funnel',JSON.stringify(E.funnel(ds,'2025-04-20').steps));
console.log('funnel C02',JSON.stringify(E.funnel(ds,'2025-04-20','C02').steps.map(s=>s.n)));
console.log('anon',JSON.stringify(E.anonFunnel(ds,'2025-04-20')));
console.log('whatif',JSON.stringify(E.whatIf(ds,'2025-04-20','C02','C05',20000)));
console.log('explain',JSON.stringify(E.explainChange(ds,'2025-03-01','2025-03-31').change));
console.log('query',JSON.stringify(E.query(ds,'2025-04-20',{table:'interactions',filters:[{field:'event_type',op:'=',value:'brochure_download'}],group_by:['campaign_name'],aggregate:'count_distinct',field:'person_id'})));
console.log('calc',E.calculate('93000/340 - 19000/275'), E.calculate('(2050-1925)/2050*100'));
console.log('trend',JSON.stringify(E.trend(ds,'registrations','week','2025-03-01','2025-04-11').rows.slice(-3)));
// changed data test
const raw2=E.applyEdits(raw,[{id:'X1',type:'checkin_add',payload:{person_id:'E0001',occurred_at:'2025-04-13T15:00:00',campaign_id:'C01'}},{id:'X2',type:'spend_add',payload:{campaign_id:'C05',activity_date:'2025-04-01',marketing_spend_inr:5000}},{id:'X3',type:'target_add',payload:{effective_at:'2025-04-01T09:00:00',identified_external_people_goal:3700,registration_goal:3300,unique_external_visitors_goal:2400,marketing_budget_inr:320000,target_version:'Test plan'}}]);
const ds2=E.build(raw2,{details,label:'edited'});const k2=E.kpis(ds2,'2025-04-20');
console.log('edited: visitors',k2.visitors,'(E0001 visited before?',ds.tables.checkins.some(c=>c.person_id==='E0001'),') spend',k2.spend,'target',k2.target.version,k2.target.visitors);
