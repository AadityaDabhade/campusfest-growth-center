"""Simulated CampusFest 2027 run, week 10 of 15, in the same format as the 2025 dataset.
Every number here is simulated from our plan's assumptions. Nothing is a real record."""
import json, random, math, datetime as dt, os
R = random.Random(2027)
OUT = 'data27'
os.makedirs(OUT, exist_ok=True)
START = dt.date(2027, 1, 4)          # week 1 Monday
LAUNCH = dt.date(2027, 2, 22)        # registrations open, week 8
END = dt.date(2027, 3, 14)           # "today": end of week 10
def wk(w): return START + dt.timedelta(days=7 * (w - 1))
def ts(d, h=None, m=None): h = R.randint(9, 22) if h is None else h; m = R.randint(0, 59) if m is None else m; return f"{d.isoformat()}T{h:02d}:{m:02d}:00"
def rday(a, b, skew=1.0):
    n = (b - a).days
    if n <= 0: return a
    return a + dt.timedelta(days=min(n, int(n * (R.random() ** (1 / skew)))))
def dump(name, header, rows):
    with open(f'{OUT}/{name}.json', 'w') as f:
        f.write('[\n' + json.dumps(header) + (',\n' if rows else '') + ',\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n]\n')

OWN = {'T03': 'Meera Iyer', 'T04': 'Arjun Verma', 'T05': 'Nisha Rao', 'T06': 'Dev Malhotra'}
# campaign_id, name, channel, kind, rank, bet_type, owner, planned, cap, scale, start_week, audience, test design, objective
CAMPS = [
    ('C01', 'Paid Social', 'paid_social', 'channel', None, None, 'T04', 120000, 250, 0.5, 6, 'external', '', 'Reveals and reminders only'),
    ('C02', 'Creator Partners', 'creators', 'channel', None, None, 'T05', 80000, 250, 0.5, 6, 'external', '', 'Line-up reveals with Delhi student creators'),
    ('C03', 'College Partnerships', 'college_partners', 'channel', None, None, 'T03', 70000, 250, 0.5, 4, 'external', '', 'Fest-to-fest partnerships and society tie-ups'),
    ('B1', 'Campus Outreach', 'ambassadors', 'bet', 1, 'Safe', 'T03', 120000, 235, 0.5, 2, 'external', 'Test colleges K01–K06 vs matched comparison K07–K12', 'Lead Ambassadors run crews of 10+ friends; rewarded on verified group check-ins'),
    ('B2', 'Group Pass + Welcome Back', 'product', 'bet', 2, 'Safe', 'T06', 70000, 250, 0.6, 8, 'external', 'Test colleges K13–K16 vs matched comparison K17–K20', 'One link registers a whole group; groups confirm together'),
    ('B3', 'Day Scholar Turnout', 'host_students', 'bet', 3, 'Maybe', 'T05', 70000, 200, 0.4, 9, 'host', 'Far-commuting day scholars offered late transport vs similar far commuters not offered', 'Metro-timed schedule and late transport for our students who go home daily'),
    ('B4', 'Volunteer Corps', 'volunteers', 'bet', 4, 'Safe', 'T04', 60000, 200, 0.3, 6, 'external', 'No comparison group: a new pool, counted directly (A)', 'Outside students volunteer shifts and bring friends'),
    ('B5', 'Alumni Homecoming', 'alumni', 'bet', 5, 'Bold', 'T06', 60000, 250, 0.5, 9, 'external', 'Batches 2019–22 get the homecoming offer vs batches 2015–18 get the standard mail', 'Our alumni; ₹299 pass returned as food credit'),
]
campaigns = []
for c in CAMPS:
    cid, name, ch, kind, rank, bt, own, plan, cap, sc, sw, aud, design, obj = c
    campaigns.append([name, ch, aud, obj, OWN[own], ts(wk(1), 9, 0), ts(wk(sw), 9, 0), '2027-04-18T21:30:00', cid, own, kind, rank, bt, plan, cap, sc, design, 'active', 0])
dump('campaigns', ['campaign_name', 'channel', 'audience_type', 'objective', 'owner_name', 'created_at', 'planned_start_at', 'planned_end_at', 'campaign_id', 'owner_id', 'kind', 'bet_rank', 'bet_type', 'planned_budget_inr', 'cost_cap_inr', 'scale_factor', 'test_design', 'status', 'reserve_released_inr'], campaigns)
CO = {c[0]: c for c in CAMPS}
def own(c): return CO[c][6] if c else None

dump('event', ['event_name', 'history_start', 'history_end', 'event_starts_at', 'event_ends_at', 'timezone', 'currency', 'fictional', 'simulated', 'city', 'plan_start', 'registration_opens', 'reserve_inr', 'tranche_inr'],
     [['CampusFest 2027', '2027-01-04T00:00:00', '2027-03-14T00:00:00', '2027-04-17T10:00:00', '2027-04-18T21:30:00', 'Asia/Kolkata', 'INR', True, True, 'New Delhi', '2027-01-04T00:00:00', '2027-02-22T00:00:00', 350000, 500000]])
dump('targets', ['effective_at', 'identified_external_people_goal', 'registration_goal', 'unique_external_visitors_goal', 'marketing_budget_inr', 'target_version', 'stretch_registration_goal', 'stretch_visitors_goal', 'all_attendees_base', 'all_attendees_stretch'],
     [['2027-01-04T09:00:00', None, 5760, 4800, 1000000, '2027 base plan', 10400, 9000, 12300, 16800]])
dump('pace_curve', ['week', 'share'], [[7, 0.0], [8, 0.05], [9, 0.14], [10, 0.24], [11, 0.35], [12, 0.51], [13, 0.70], [14, 0.86], [15, 1.0]])

# ---------- people ----------
people, regs, hist, inter = [], [], [], []
pid = [0]
def person(ptype, college, dist, arm, bet, camp, first, src):
    pid[0] += 1; p = f'P{pid[0]:05d}'
    people.append([ptype, ts(first), src, p, camp, own(camp), college, dist, arm, bet])
    return p
# group: (count, college list, arm, bet, credit when registered via bet, reg rate, identify window, confirm prob, cancel prob, opt-out prob, ptype)
G = []
cols_out = [f'K{i:02d}' for i in range(1, 25)]
dist = {k: ('near' if i % 3 else 'far') for i, k in enumerate(cols_out)}
def chan(): return R.choices(['C01', 'C02', 'C03'], [0.45, 0.3, 0.25])[0]
groups = [
    # n, colleges, arm, bet, bet credit share, reg rate, id from week, conf, cancel
    (2350, cols_out[0:6], 'test', 'B1', 0.72, 0.290, 2, 0.66, 0.04),
    (2300, cols_out[6:12], 'comparison', 'B1', 0.0, 0.120, 3, 0.52, 0.06),
    (1450, cols_out[12:16], 'test', 'B2', 0.62, 0.255, 6, 0.78, 0.03),
    (1420, cols_out[16:20], 'comparison', 'B2', 0.0, 0.125, 6, 0.52, 0.06),
    (950, cols_out[20:24], '', None, 0.0, 0.095, 4, 0.50, 0.07),
    (820, ['ALUMNI'], 'test', 'B5', 0.85, 0.235, 9, 0.56, 0.04),
    (800, ['ALUMNI'], 'comparison', 'B5', 0.0, 0.050, 9, 0.50, 0.05),
    (330, cols_out[20:24], '', 'B4', 1.0, 0.420, 6, 0.70, 0.03),
    (260, ['HOST'], 'test', 'B3', 1.0, 0.380, 9, 0.80, 0.02),
    (250, ['HOST'], 'comparison', 'B3', 0.0, 0.330, 9, 0.80, 0.02),
]
reg_count = 0
for n, cols, arm, bet, bshare, rate, w0, conf, canc in groups:
    host = cols == ['HOST']
    for i in range(n):
        col = R.choice(cols)
        via_bet = bet and arm != 'comparison' and R.random() < max(bshare, 0.0)
        first_camp = bet if (bet and arm == 'test' and R.random() < 0.55) or bet == 'B4' or host else chan()
        if host and arm == 'comparison': first_camp = 'B3' if R.random() < 0.0 else None
        first = rday(max(wk(w0), START), END, skew=1.6)
        src = 'survey' if host else ('alumni_mail' if col == 'ALUMNI' else 'campaign')
        p = person('host' if host else 'external', col, 'far' if host else dist.get(col, ''), arm, bet if bet and (arm or bet == 'B4') else None, first_camp, first, src)
        camp_for_touch = first_camp or 'B3'
        inter.append([ts(first), 'page_visit', f'I{len(inter)+1:06d}', p, first_camp, own(first_camp)])
        if R.random() < 0.55 and not host:
            d = rday(first, END); inter.append([ts(d), 'nurture_email_sent', f'I{len(inter)+1:06d}', p, first_camp, own(first_camp)])
            if R.random() < 0.62: inter.append([ts(min(END, d + dt.timedelta(days=1))), 'nurture_email_opened', f'I{len(inter)+1:06d}', p, first_camp, own(first_camp)])
            oo = {'C01': 0.17, 'C02': 0.09, 'C03': 0.06}.get(first_camp, 0.05)
            if R.random() < oo: inter.append([ts(min(END, d + dt.timedelta(days=2))), 'opted_out', f'I{len(inter)+1:06d}', p, first_camp, own(first_camp)])
        # registration: only after it opens (alumni and day scholars from week 9)
        opens = max(first, LAUNCH if not (col == 'ALUMNI' or host) else wk(9))
        if opens > END: continue
        # later identifications have had less time; scale the chance by exposure
        exposure = min(1.0, ((END - opens).days + 3) / 18)
        if R.random() < rate * (0.55 + 0.45 * exposure) / 0.86:
            rc = (bet if via_bet else (first_camp if first_camp in ('C01', 'C02', 'C03') else chan())) if not host else ('B3' if arm == 'test' else None)
            if bet == 'B4': rc = 'B4'
            rd = rday(opens, END, skew=1.25)
            r_id = f'R{len(regs)+1:05d}'; t0 = ts(rd)
            regs.append([t0, r_id, p, rc, own(rc)])
            inter.append([ts(rd, 8, 30), 'registration_start', f'I{len(inter)+1:06d}', p, rc, own(rc)])
            hist.append([t0, 'interested', f'H{len(hist)+1:06d}', r_id, p, rc, own(rc)])
            cp = conf - (0.12 if rc == 'C01' else 0) + (0.05 if rc == 'C03' else 0)
            u = R.random()
            if u < cp:
                cd = min(END, rd + dt.timedelta(days=R.randint(0, 6)))
                hist.append([ts(cd), 'confirmed', f'H{len(hist)+1:06d}', r_id, p, rc, own(rc)])
                if R.random() < canc + (0.05 if rc == 'C01' else 0):
                    hist.append([ts(min(END, cd + dt.timedelta(days=R.randint(1, 8)))), 'cancelled', f'H{len(hist)+1:06d}', r_id, p, rc, own(rc)])
            elif u < cp + 0.03:
                hist.append([ts(min(END, rd + dt.timedelta(days=2))), 'waitlisted', f'H{len(hist)+1:06d}', r_id, p, rc, own(rc)])
            elif R.random() < 0.05:
                hist.append([ts(min(END, rd + dt.timedelta(days=4))), 'cancelled', f'H{len(hist)+1:06d}', r_id, p, rc, own(rc)])
        elif R.random() < 0.25 and not host:
            d = rday(opens, END); inter.append([ts(d), 'registration_start', f'I{len(inter)+1:06d}', p, first_camp, own(first_camp)])
# a few internal, staff and test people (excluded from every count)
for t, n in (('internal', 30), ('staff', 8), ('test', 6)):
    for i in range(n): person(t, 'HOST', '', '', None, None, rday(wk(2), END), 'internal_registration')

# ---------- daily marketing: spend sized so each campaign lands on its story ----------
COST = {'C01': 330, 'C02': 205, 'C03': 120}   # ₹ per expected visitor for channels (simulated)
SPEND = {'B1': 24000, 'B2': 10500, 'B3': 18000, 'B4': 31000, 'B5': 10500}
def expected(cid):
    st = {}
    for h in hist: st[h[3]] = h[1]
    e = 0
    for r in regs:
        if r[3] == cid: e += {'confirmed': 0.75, 'interested': 0.40, 'waitlisted': 0.25, 'cancelled': 0}[st[r[1]]]
    return e
for cid in ('C01', 'C02', 'C03'): SPEND[cid] = round(COST[cid] * expected(cid) / 0.94, -2)
daily = []
for c in CAMPS:
    cid = c[0]; s0 = wk(c[10]); days = (END - s0).days + 1; tot = SPEND[cid]
    w = [1 + 2.2 * (i / max(1, days - 1)) for i in range(days)]; sw = sum(w)
    acc = 0
    for i in range(days):
        d = s0 + dt.timedelta(days=i)
        amt = round(tot * w[i] / sw / 100) * 100 if i < days - 1 else round(tot - acc)
        acc += amt
        imp = int(amt * R.uniform(9, 14)) if cid in ('C01', 'C02') else int(amt * R.uniform(2, 4))
        clk = int(imp * R.uniform(0.018, 0.034)); ses = int(clk * R.uniform(0.7, 0.85)); st_ = int(ses * R.uniform(0.15, 0.28)) if d >= LAUNCH else 0
        daily.append([d.isoformat() + 'T00:00:00', imp, clk, int(imp * 0.6), ses, st_, amt, 'campaign link analytics', f'AD-{cid}-{d.strftime("%m%d")}', cid, c[6]])
dump('daily', ['activity_date', 'impressions', 'clicks', 'reported_reach', 'landing_page_sessions', 'registration_starts', 'marketing_spend_inr', 'platform', 'activity_id', 'campaign_id', 'owner_id'], daily)
dump('people', ['person_type', 'first_seen_at', 'first_touch_source', 'person_id', 'first_campaign_id', 'owner_id', 'college_id', 'distance', 'arm', 'test_bet'], people)
dump('registrations', ['registered_at', 'registration_id', 'person_id', 'campaign_id', 'owner_id'], regs)
dump('reg_history', ['effective_at', 'status', 'history_id', 'registration_id', 'person_id', 'campaign_id', 'owner_id'], hist)
inter.sort(key=lambda x: x[0])
dump('interactions', ['occurred_at', 'event_type', 'interaction_id', 'person_id', 'campaign_id', 'owner_id'], inter)
dump('checkins', ['occurred_at', 'result', 'verification', 'source', 'event_id', 'person_id', 'registration_id', 'campaign_id', 'owner_id'], [])
print('people', len(people), 'regs', len(regs), 'hist', len(hist), 'inter', len(inter), 'daily', len(daily), 'spend', sum(SPEND.values()), SPEND)
