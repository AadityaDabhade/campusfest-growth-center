import json, pandas as pd, numpy as np
def load(n):
    r=json.load(open(f'data/{n}.json')); return pd.DataFrame(r[1:],columns=r[0])
ev,tg,cp,dm,pp,ia,rg,rh,ci=[load(n) for n in ['event','targets','campaigns','daily','people','interactions','registrations','reg_history','checkins']]
dup={'daily':len(dm)-dm.activity_id.nunique(),'reg_history':len(rh)-rh.history_id.nunique(),'checkins':len(ci)-ci.event_id.nunique(),'interactions':len(ia)-ia.interaction_id.nunique(),'people':len(pp)-pp.person_id.nunique(),'registrations':len(rg)-rg.registration_id.nunique()}
dm=dm.drop_duplicates('activity_id');rh=rh.drop_duplicates('history_id');ci=ci.drop_duplicates('event_id');ia=ia.drop_duplicates('interaction_id')
ext=set(pp[pp.person_type=='external'].person_id)
def at(D):
    c=D+'T23:59:59'
    o={}
    o['identified']=int(((pp.person_type=='external')&(pp.first_seen_at<=c)).sum())
    r=rg[(rg.registered_at<=c)&rg.person_id.isin(ext)]
    o['registered']=r.person_id.nunique()
    h=rh[(rh.effective_at<=c)&rh.registration_id.isin(r.registration_id)].sort_values(['effective_at','history_id']).groupby('registration_id').tail(1)
    st=dict(zip(h.registration_id,h.status))
    r=r.assign(status=r.registration_id.map(st).fillna('interested'))
    o['status']=r.status.value_counts().to_dict()
    v=ci[(ci.occurred_at<=c)&(ci.result=='admitted')&(ci.verification=='verified')&ci.person_id.isin(ext)]
    vis=set(v.person_id); o['visitors']=len(vis)
    regp=set(r.person_id); o['visitors_registered']=len(vis&regp); o['walkins']=len(vis-regp)
    o['showup']=round(len(vis&regp)/max(1,len(regp)),4)
    d=dm[dm.activity_date.str[:10]<=D]; o['spend']=int(d.marketing_spend_inr.sum())
    t=tg[tg.effective_at<=c]; o['target']=t.iloc[-1].to_dict() if len(t) else None
    # by campaign (registration source)
    bc={}
    for cid in cp.campaign_id:
        rr=r[r.campaign_id==cid]; pr=set(rr.person_id)
        sp=int(d[d.campaign_id==cid].marketing_spend_inr.sum())
        vv=len(vis&pr)
        bc[cid]={'spend':sp,'registered':len(pr),'visitors':vv,'showup':round(vv/max(1,len(pr)),4),'cpv':round(sp/vv,1) if vv else None}
    o['by_campaign']=bc
    vi=v.copy(); vi['day']=vi.occurred_at.str[:10]
    o['days']=vi.groupby('day').person_id.nunique().to_dict()
    o['entries']=len(v)
    o['peak']=vi.assign(h=vi.occurred_at.str[:13]).groupby('h').size().sort_values().tail(1).to_dict()
    i=ia[(ia.occurred_at<=c)]
    o['optouts']=i[i.event_type=='opted_out'].person_id.nunique()
    o['form_started_people']=i[(i.event_type=='registration_start')&i.person_id.isin(ext)].person_id.nunique()
    return o
ref={'dups':dup}
for D in ['2025-02-28','2025-03-15','2025-04-11','2025-04-20']: ref[D]=at(D)
json.dump(ref,open('scripts/ref.json','w'),indent=1,default=str)
print(json.dumps(ref['2025-04-20'],indent=1,default=str)[:2500])
print('dups',dup)
# people with >1 registration
print('multi-reg persons', (rg.groupby('person_id').size()>1).sum())
