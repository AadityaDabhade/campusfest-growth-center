"""Simulated CampusFest 2027: the full 15-week campaign and both fest days, in the same format as the 2025 dataset.
Every number here is simulated from our plan's assumptions. Nothing is a real record.
Competition registrations open in week 2 and passes in week 3, the same distance before the fest as 2025
(82 days), so sign-ups follow 2025's real curve. Week 8 is the big push (line-up, Group Pass, Welcome Back).
"Today" in the story is the end of week 10 (Sun 24 Jan 2027). Data after it is a rehearsal: one realistic run
in which the team takes the plan's decisions on time (plan_decisions.json). Not the best case: one bet fails,
scaled bets do worse than their tests, and unconfirmed people mostly stay home."""
import sys
import json, random, datetime as dt, os
R = random.Random(2027)
OUT = 'data27'
os.makedirs(OUT, exist_ok=True)
START = dt.date(2026, 11, 16)        # week 1 Monday
def wk(w): return START + dt.timedelta(days=7 * (w - 1))
COMP_OPENS = wk(2)                   # competition registrations open: Mon 23 Nov 2026
LAUNCH = wk(3)                       # pass registrations open: Mon 30 Nov 2026 (82 days out, like 2025)
PUSH = wk(8)                         # big push: line-up reveal, Group Pass, Welcome Back (Mon 4 Jan 2027)
TODAY = wk(10) + dt.timedelta(days=6)  # end of week 10: Sun 24 Jan 2027
REVIEW1 = wk(11)                     # week 10 review meeting: Mon 25 Jan
REVIEW2 = wk(13)                     # week 12 review: Mon 8 Feb
REVIEW3 = wk(15)                     # week 14 review: Mon 22 Feb
FEST1 = dt.date(2027, 2, 26)         # Fri
FEST2 = dt.date(2027, 2, 27)         # Sat
EVE = FEST1 - dt.timedelta(days=1)   # Thu 25 Feb: last day to register
END = dt.date(2027, 2, 28)           # end of week 15

def ts(d, h=None, m=None):
    h = R.randint(9, 22) if h is None else h; m = R.randint(0, 59) if m is None else m
    return f"{d.isoformat()}T{h:02d}:{m:02d}:00"
def dump(name, header, rows):
    with open(f'{OUT}/{name}.json', 'w') as f:
        f.write('[\n' + json.dumps(header) + (',\n' if rows else '') + ',\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n]\n')
def clip(d, a, b): return max(a, min(b, d))

# registrations by week follow 2025's real curve, rebased to the same number of days before the fest
CURVE = [[2, 0.0], [3, 0.004], [4, 0.01], [5, 0.06], [6, 0.13], [7, 0.24], [8, 0.34], [9, 0.43], [10, 0.49], [11, 0.59], [12, 0.71], [13, 0.83], [14, 0.95], [15, 1.0]]
INC = {CURVE[i][0]: CURVE[i][1] - CURVE[i - 1][1] for i in range(1, len(CURVE))}
def reg_day(earliest):
    for _ in range(80):
        w = R.choices(list(INC), list(INC.values()))[0]
        last = 3 if w == 15 else 6                       # week 15: registrations close on fest eve (Thu)
        d = wk(w) + dt.timedelta(days=R.randint(0, last))
        if d >= earliest: return d
    return clip(earliest, LAUNCH, EVE)
def seen_day(reg, earliest):
    d = reg - dt.timedelta(days=int(R.expovariate(1 / 9)))
    return clip(d, earliest, reg)
def nonreg_seen(earliest):
    return seen_day(reg_day(max(earliest, LAUNCH)), earliest) if R.random() < 0.8 else clip(earliest + dt.timedelta(days=R.randint(0, 40)), earliest, EVE)

OWN = {'T03': 'Meera Iyer', 'T04': 'Arjun Verma', 'T05': 'Nisha Rao', 'T06': 'Dev Malhotra'}
# id, name, channel, kind, rank, bet_type, owner, planned, cap, scale, start_week, audience, test design, objective
CAMPS = [
    ('C01', 'Paid Social', 'paid_social', 'channel', None, None, 'T04', 80000, 250, 0.5, 3, 'external', '', 'Reveals and reminders only'),
    ('C02', 'Creator Partners', 'creators', 'channel', None, None, 'T05', 80000, 250, 0.5, 3, 'external', '', 'Line-up reveals with Delhi student creators'),
    ('C03', 'College Partnerships', 'college_partners', 'channel', None, None, 'T03', 70000, 250, 0.5, 2, 'external', '', 'Fest-to-fest partnerships and society tie-ups'),
    ('B1', 'Campus Outreach', 'ambassadors', 'bet', 1, 'Safe', 'T03', 60000, 235, 0.5, 1, 'external', 'Test colleges K01–K06 vs matched comparison K07–K12', 'Lead Ambassadors run crews of 10+ friends; rewarded on verified group check-ins'),
    ('B2', 'Group Pass + Welcome Back', 'product', 'bet', 2, 'Safe', 'T06', 70000, 250, 0.6, 8, 'external', 'Test colleges K13–K16 vs matched comparison K17–K20', 'One link registers a whole group; groups confirm together'),
    ('B3', 'Day Scholar Turnout', 'host_students', 'bet', 3, 'Maybe', 'T05', 70000, 200, 0.4, 9, 'host', 'Far-commuting day scholars offered late transport vs similar far commuters not offered', 'Metro-timed schedule and late transport for our students who go home daily'),
    ('B4', 'Volunteer Corps', 'volunteers', 'bet', 4, 'Safe', 'T04', 60000, 200, 0.3, 6, 'external', 'No comparison group: a new pool, counted directly (A)', 'Outside students volunteer shifts and bring friends'),
    ('B5', 'Alumni Homecoming', 'alumni', 'bet', 5, 'Bold', 'T06', 60000, 250, 0.5, 9, 'external', 'Batches 2019–22 get the homecoming offer vs batches 2015–18 get the standard mail', 'Our alumni; ₹299 pass returned as food credit'),
]
PLAN = {   # the idea, why it should work, how we test it, the stop rule (plain words, from the plan)
    'C01': ('Short reveal and reminder ads on Instagram and YouTube.', 'Reminds people who already know us; weak at bringing new groups.', 'Week 9 holdout: some colleges see no ads.', 'Cost per attendee above ₹250 → cut to reminders only.'),
    'C02': ('Delhi student creators post the line-up reveals.', 'Students trust other students more than ads.', 'Compared on cost per attendee with the other channels.', 'Cost per attendee above ₹250 → stop new creators.'),
    'C03': ('Stalls at other fests, society tie-ups and posters.', 'Meets students where they already gather.', 'Compared on cost per attendee with the other channels.', 'Cost per attendee above ₹250 → stop new tie-ups.'),
    'B1': ('Lead ambassadors at each college build crews of 10+ friends; competition teams sign up early.', 'People come with friends, and a friend asking works better than an ad.', '6 colleges get ambassadors, 6 similar colleges don\'t; we compare how many register.', 'Under 200 crew captains by week 10 → stop the captain part; money moves to Group Pass.'),
    'B2': ('One link registers a whole friend group; last year\'s visitors get a "Wrapped" card.', 'Groups decide together and show up together.', '4 colleges see the group pass, 4 similar ones see solo passes only.', 'No lift from the Wrapped card by week 10 → stop messaging.'),
    'B3': ('Late buses and a metro-timed schedule for our students who go home daily.', 'Day scholars skip evenings because getting home late is hard.', 'Far commuters offered transport vs similar far commuters not offered.', 'No clear gap after a fair test → stop.'),
    'B4': ('Outside students volunteer two short shifts and bring friends.', 'Volunteers feel part of the fest and bring their circle.', 'No comparison group: every volunteer sign-up is counted.', 'Under 300 sign-ups by week 10 → keep only our own students\' roles.'),
    'B5': ('Our alumni get a ₹299 homecoming pass, returned as food credit.', 'Alumni miss campus; a small, refundable price filters for people who will come.', 'Batches 2019–22 get the offer, 2015–18 get the normal mail.', 'Under 200 on the waitlist by week 9 → don\'t launch; money moves to Group Pass.'),
}
BREAKDOWN = {
    'C01': 'Instagram and YouTube reveal and reminder ads',
    'C02': 'Delhi student creators for line-up reveals',
    'C03': 'Fest-to-fest stalls, society tie-ups, posters',
    'B1': 'No cash for ambassadors: perks are a certificate and letter, a free pass plus 2 friends and a backstage meet. Money: top-crew prize pool ₹10k (paid on verified check-ins) · captain merch for 10+ crews ₹20k · Crew Wall, printing and travel ₹30k',
    'B2': 'Group pass build ₹30k · Welcome Back "Wrapped" cards ₹15k · confirm reminders ₹25k',
    'B3': 'Late shuttle buses ₹50k · metro-timed schedule and signage ₹20k',
    'B4': 'Meals, tees and certificates for volunteers (they also staff the fest)',
    'B5': 'Alumni passes and food credit ₹40k · mailers and a reunion corner ₹20k',
}
dump('campaigns', ['campaign_name', 'channel', 'audience_type', 'objective', 'owner_name', 'created_at', 'planned_start_at', 'planned_end_at', 'campaign_id', 'owner_id', 'kind', 'bet_rank', 'bet_type', 'planned_budget_inr', 'cost_cap_inr', 'scale_factor', 'test_design', 'status', 'reserve_released_inr', 'budget_breakdown', 'plan_idea', 'plan_why', 'plan_test', 'stop_rule'],
     [[c[1], c[2], c[11], c[13], OWN[c[6]], ts(wk(1), 9, 0), ts(wk(c[10]), 9, 0), ts(FEST2, 21, 30), c[0], c[6], c[3], c[4], c[5], c[7], c[8], c[9], c[12], 'active', 0, BREAKDOWN[c[0]]] + list(PLAN[c[0]]) for c in CAMPS])
CO = {c[0]: c for c in CAMPS}
def own(c): return CO[c][6] if c else None

dump('event', ['event_name', 'history_start', 'history_end', 'event_starts_at', 'event_ends_at', 'timezone', 'currency', 'fictional', 'simulated', 'city', 'plan_start', 'registration_opens', 'reserve_inr', 'tranche_inr', 'today', 'gate_capacity_per_hour', 'competition_opens', 'big_push', 'hostel_students', 'day_scholars'],
     [['CampusFest 2027', START.isoformat() + 'T00:00:00', END.isoformat() + 'T00:00:00', ts(FEST1, 10, 0), ts(FEST2, 21, 30), 'Asia/Kolkata', 'INR', True, True, 'New Delhi', START.isoformat() + 'T00:00:00', LAUNCH.isoformat() + 'T00:00:00', 450000, 500000, TODAY.isoformat() + 'T00:00:00', 2500, COMP_OPENS.isoformat() + 'T00:00:00', PUSH.isoformat() + 'T00:00:00', 4000, 6000]])
dump('targets', ['effective_at', 'identified_external_people_goal', 'registration_goal', 'unique_external_visitors_goal', 'marketing_budget_inr', 'target_version', 'stretch_registration_goal', 'stretch_visitors_goal', 'all_attendees_base', 'all_attendees_stretch', 'teams_goal', 'teams_by_week6', 'teams_by_week8'],
     [[START.isoformat() + 'T09:00:00', 8400, 5760, 4800, 1000000, '2027 base plan', 9800, 8300, 12300, 16300, 300, 150, 250]])
dump('pace_curve', ['week', 'share'], CURVE)

# the plan's decisions, taken on time at each review (the rehearsal after "today"). Money only follows the rules:
# each release below is what the Bets page says at that review (checked by scripts/t27.js).
RELEASES = json.load(open('scripts/releases27.json')) if os.path.exists('scripts/releases27.json') else [[10, 'B2', 100000], [10, 'B1', 100000]]
REVIEW = {10: REVIEW1, 12: REVIEW2, 14: REVIEW3}
NAME = {'B1': 'Campus Outreach', 'B2': 'Group Pass + Welcome Back', 'B4': 'Volunteer Corps', 'B5': 'Alumni Homecoming'}
LIMIT = {'B1': 235, 'B2': 250, 'B4': 200, 'B5': 250}
def lakh(a): return '₹1L' if a == 100000 else '₹50k' if a == 50000 else f'₹{a/100000:g}L'
PD = []
for w in (10, 12, 14):
    for wk_, bet, amt in RELEASES:
        if wk_ == w: PD.append([f'PD{len(PD)+1}', REVIEW[w], bet, 'release_reserve', amt, f'Release {lakh(amt)} of reserve to {NAME[bet]}', f'Week {w} review: next extra attendee under its ₹{LIMIT[bet]} limit; gap High', f'More extra attendees at under ₹{LIMIT[bet]} each', 'expected_extra_attendees', REVIEW.get(w + 2, FEST1)])
    if w == 10:
        PD.append([f'PD{len(PD)+1}', REVIEW1, 'C01', 'set_planned_budget', 60000, 'Cut Paid Social to reminders only', 'Week 10 review: cost per expected attendee above the ₹250 limit and opt-outs above 15%', 'Cost per attendee falls toward the limit', 'cost_per_expected_visitor', REVIEW2])
        PD.append([f'PD{len(PD)+1}', REVIEW1, 'B4', 'task', 0, 'Volunteer Corps: cut cost per volunteer (one tee, meals only on shift days)', 'Week 10 review: cost per extra attendee above the ₹200 limit', 'Cost per extra attendee falls', 'cost_per_extra', REVIEW2])
    if w == 12:
        PD.append([f'PD{len(PD)+1}', REVIEW2, 'B3', 'stop', 0, 'Stop Day Scholar Turnout', 'Week 12 review: fair test (300+ per group, 4 weeks) and no clear gap over the comparison group', 'No more spend on it', 'spend', REVIEW3])
    if not any(r[0] == w for r in RELEASES) and w > 10:
        left = 450000 - sum(r[2] for r in RELEASES if r[0] < w)
        PD.append([f'PD{len(PD)+1}', REVIEW[w], '', 'hold', 0, f'Hold the remaining {lakh(left)} of reserve', f"Week {w} review: no bet's next extra attendee is under its limit; money only follows proof", 'Re-check at the next review' if w < 14 else 'Return it to the fest budget', 'spend', REVIEW.get(w + 2, FEST1)])
dump('plan_decisions', ['decision_id', 'decided_at', 'campaign_id', 'kind', 'amount_inr', 'title', 'reason', 'expected', 'metric_key', 'review_at'],
     [[p[0], p[1].isoformat() + 'T10:00:00', p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9].isoformat() + 'T10:00:00'] for p in PD])
REL = {}
for p in PD:
    if p[3] == 'release_reserve': REL[p[2]] = REL.get(p[2], 0) + p[4]

# ---------- people ----------
people, regs, hist, inter, chk = [], [], [], [], []
pid = [0]
def person(ptype, college, dist, arm, bet, camp, first, src, seg='', team=None):
    pid[0] += 1; p = f'P{pid[0]:05d}'
    people.append([ptype, ts(first), src, p, camp, own(camp), college, dist, arm, bet, seg, team])
    return p
cols_out = [f'K{i:02d}' for i in range(1, 34)]  # K25-K33 unused now; scaled colleges are K34 onwards
dist = {k: ('near' if i % 3 else 'far') for i, k in enumerate(cols_out)}
def chan(): return R.choices(['C01', 'C02', 'C03'], [0.16, 0.40, 0.44])[0]
# n, colleges, arm, bet, share registering via the bet link, final reg rate, people from, bet effect from, confirm prob, cancel prob, show-up if confirmed
GROUPS = [
    (7200, cols_out[0:6], 'test', 'B1', 0.72, 0.295, wk(2), LAUNCH, 0.88, 0.04, 0.77),
    (7100, cols_out[6:12], 'comparison', 'B1', 0.0, 0.134, wk(2), LAUNCH, 0.83, 0.06, 0.74),
    (4500, cols_out[12:16], 'test', 'B2', 0.62, 0.272, wk(3), PUSH, 0.93, 0.03, 0.78),
    (4400, cols_out[16:20], 'comparison', 'B2', 0.0, 0.134, wk(3), PUSH, 0.83, 0.06, 0.74),
    (3400, cols_out[20:24], '', None, 0.0, 0.116, wk(3), LAUNCH, 0.83, 0.07, 0.74),
    (2300, ['ALUMNI'], 'test', 'B5', 0.85, 0.235, wk(9), wk(9), 0.83, 0.04, 0.70),
    (2250, ['ALUMNI'], 'comparison', 'B5', 0.0, 0.056, wk(9), wk(9), 0.80, 0.05, 0.66),
    (1000, cols_out[20:24], '', 'B4', 1.0, 0.440, wk(6), wk(6), 0.92, 0.03, 0.88),
    (335, ['HOST'], 'test', 'B3', 1.0, 0.360, wk(9), wk(9), 0.90, 0.02, 0.85),
    (325, ['HOST'], 'comparison', 'B3', 0.0, 0.350, wk(9), wk(9), 0.90, 0.02, 0.80),
]
# reserve money at work: each release scales the bet to new colleges from its release day (they do a bit worse than in the test)
for k, (w, bet, amt) in enumerate(sorted(RELEASES)):
    newcols = [f'K{34 + 3 * k + j}' for j in range(3)]
    for c_ in newcols: dist[c_] = 'near'
    if bet == 'B1': GROUPS.append((int(3800 * amt / 100000), newcols, 'test', 'B1', 0.70, 0.240 - 0.01 * k, REVIEW[w], REVIEW[w], 0.86, 0.05, 0.74))
    if bet == 'B2': GROUPS.append((int(2700 * amt / 100000), newcols, 'test', 'B2', 0.60, 0.230 - 0.01 * k, REVIEW[w], REVIEW[w], 0.92, 0.04, 0.76))
BASE = {'B1': 0.134, 'B2': 0.134}   # what test colleges register at without the bet
SHOW = {'C01': -0.10, 'C03': 0.02}
attendees = []   # (person, registration id or None, campaign, host)
def register(p, rd, rc, conf, canc, show, host, comp=False):
    r_id = f'R{len(regs)+1:05d}'; t0 = ts(rd)
    regs.append([t0, r_id, p, rc, own(rc)])
    inter.append([ts(rd, 8, 30), 'registration_start', None, p, rc, own(rc)])
    hist.append([t0, 'interested', None, r_id, p, rc, own(rc)])
    cp = conf - (0.15 if rc == 'C01' else 0) + (0.03 if rc == 'C03' else 0)
    status = 'interested'
    later = lambda d: ts(d) if d > rd else f"{rd.isoformat()}T{min(23, int(t0[11:13]) + 1):02d}:{R.randint(0, 59):02d}:00"
    u = R.random()
    if u < cp:
        cd = min(rd + dt.timedelta(days=int(R.expovariate(1 / (6 if rc == 'C01' else 3)))), EVE)
        hist.append([later(cd), 'confirmed', None, r_id, p, rc, own(rc)]); status = 'confirmed'
        if R.random() < canc + (0.05 if rc == 'C01' else 0):
            xd = cd + dt.timedelta(days=R.randint(1, 25))
            if xd <= EVE: hist.append([ts(xd), 'cancelled', None, r_id, p, rc, own(rc)]); status = 'cancelled'
    elif u < cp + 0.03 and not comp:
        hist.append([later(clip(rd + dt.timedelta(days=2), rd, EVE)), 'waitlisted', None, r_id, p, rc, own(rc)]); status = 'waitlisted'
    elif R.random() < 0.06:
        hist.append([later(clip(rd + dt.timedelta(days=4), rd, EVE)), 'cancelled', None, r_id, p, rc, own(rc)]); status = 'cancelled'
    elif rd < EVE - dt.timedelta(days=2) and R.random() < 0.7:
        hist.append([ts(EVE, 18), 'cancelled', None, r_id, p, rc, own(rc)]); status = 'cancelled'   # pass released after a last "confirm or release" message
    sp = {'confirmed': show + SHOW.get(rc, 0), 'interested': 0.08, 'waitlisted': 0.20, 'cancelled': 0.0}[status]
    if not host and R.random() < sp: attendees.append((p, r_id, rc, host))
for n, cols, arm, bet, bshare, rate, start, effect, conf, canc, show in GROUPS:
    host = cols == ['HOST']
    id_from = clip(start, START, EVE)
    for i in range(n):
        col = R.choice(cols)
        registers = R.random() < rate
        opens = max(LAUNCH, id_from)
        # in test colleges, sign-ups beyond the normal rate are the bet's effect and only start once the bet is live
        bet_made = registers and arm == 'test' and bet in BASE and R.random() < (rate - BASE[bet]) / rate
        if bet_made: opens = max(opens, effect)
        if registers:
            rd = reg_day(opens)
            first = seen_day(rd, id_from) if not host else clip(id_from + dt.timedelta(days=R.randint(0, 20)), id_from, rd)
        else:
            first = nonreg_seen(id_from) if not host else id_from + dt.timedelta(days=R.randint(0, 20))
        # most people on a college list never respond: they are used to judge the bets but are not "reached"
        listed = not registers and not host and R.random() > 0.07
        via_bet = bool(bet) and arm != 'comparison' and (bet_made or R.random() < bshare * 0.5)
        first_camp = bet if (bet and arm == 'test' and R.random() < 0.55) or bet == 'B4' or host else chan()
        if host and arm == 'comparison': first_camp = None
        src = 'survey' if host else 'college_list' if listed else ('alumni_mail' if col == 'ALUMNI' else 'campaign')
        p = person('host' if host else 'external', col, 'far' if host else dist.get(col, ''), arm, bet if bet and (arm or bet == 'B4') else None, first_camp, first, src)
        if listed: continue
        if R.random() < 0.25: inter.append([ts(first), 'page_visit', None, p, first_camp, own(first_camp)])
        if not host and R.random() < 0.55:
            d = clip(first + dt.timedelta(days=R.randint(0, 20)), first, EVE)
            inter.append([ts(d), 'nurture_email_sent', None, p, first_camp, own(first_camp)])
            if R.random() < 0.62: inter.append([ts(clip(d + dt.timedelta(days=1), d, EVE)), 'nurture_email_opened', None, p, first_camp, own(first_camp)])
            oo = {'C01': 0.17, 'C02': 0.09, 'C03': 0.06}.get(first_camp, 0.05)
            if R.random() < oo: inter.append([ts(clip(d + dt.timedelta(days=2), d, EVE)), 'opted_out', None, p, first_camp, own(first_camp)])
        if not registers:
            if not host and R.random() < 0.5:
                d = clip(first + dt.timedelta(days=R.randint(0, 10)), max(first, LAUNCH), EVE)
                inter.append([ts(d), 'registration_start', None, p, first_camp, own(first_camp)])
            continue
        if host: rc = 'B3' if arm == 'test' else None
        elif bet == 'B4': rc = 'B4'
        else: rc = bet if via_bet else (first_camp if first_camp in ('C01', 'C02', 'C03') else chan())
        register(p, rd, rc, conf, canc, show, host)
# competition teams: register early (they need time to prepare), part of Campus Outreach; not in any bet's test groups
TEAM_W = {2: 0.10, 3: 0.12, 4: 0.12, 5: 0.12, 6: 0.12, 7: 0.10, 8: 0.12, 9: 0.10, 10: 0.10}
for t in range(1, 301):
    w = R.choices(list(TEAM_W), list(TEAM_W.values()))[0]
    rd = wk(w) + dt.timedelta(days=R.randint(0, 6)); col = R.choice(cols_out[:24]); team = f'TM{t:03d}'
    for k in range(R.choice([2, 3, 3, 4, 4, 5])):
        p = person('external', col, dist.get(col, ''), '', None, 'B1', clip(rd - dt.timedelta(days=R.randint(0, 5)), START, rd), 'competition', 'competitor', team)
        register(p, rd, 'B1', 0.96, 0.02, 0.85, False, True)
# our own students: no registration step. Day scholars enter through the student-ID lane; hostel students are
# already inside and are counted when they scan their concert pass. B3's test and comparison groups are day scholars.
host_ids = [x[3] for x in people if x[0] == 'host']
for i in range(6000 - len(host_ids)):
    host_ids.append(person('host', 'HOST', 'far' if R.random() < 0.4 else 'near', '', None, None, wk(9), 'student_roll'))
for p in host_ids:
    if R.random() < 0.65: attendees.append((p, None, None, 'day'))
for i in range(4000):
    p = person('host', 'HOST', 'hostel', '', None, None, wk(9), 'student_roll')
    if R.random() < 0.90: attendees.append((p, None, None, 'hostel'))
# walk-ins: about 6% of outside visitors come without registering
n_ext = sum(1 for a in attendees if a[3] is False)
for i in range(int(n_ext * 0.064)):
    d = R.choice([FEST1, FEST2])
    p = person('external', R.choice(cols_out), '', '', None, None, d, 'walk_in')
    attendees.append((p, None, None, False))
# a few internal, staff and test people (excluded from every count)
for t, n in (('internal', 30), ('staff', 8), ('test', 6)):
    for i in range(n): person(t, 'HOST', '', '', None, None, clip(wk(2) + dt.timedelta(days=R.randint(0, 90)), wk(2), EVE), 'internal_registration')

# ---------- check-ins on the two fest days (outside people and day scholars use the gates) ----------
HOURS = list(range(10, 22)); HW = [3, 5, 7, 8, 8, 9, 11, 13, 12, 9, 6, 3]
def entry(d):
    h = R.choices(HOURS, HW)[0]; return f"{d.isoformat()}T{h:02d}:{R.randint(0, 59):02d}:00"
def concert(d): return f"{d.isoformat()}T{R.choice([16, 17, 17, 18, 18, 19]):02d}:{R.randint(0, 59):02d}:00"
for p, rid, rc, host in attendees:
    u = R.random(); days = [FEST1, FEST2] if u < 0.35 else [FEST1] if u < 0.69 else [FEST2]
    for d in days:
        if host == 'hostel':
            chk.append([concert(d), 'admitted', 'verified', 'concert_gate', None, p, None, None, None]); continue
        for k in range(2 if R.random() < 0.18 else 1):
            res, ver = ('admitted', 'verified') if R.random() > 0.015 else R.choice([('pending', 'verified'), ('admitted', 'unverified')])
            chk.append([entry(d), res, ver, 'student_lane' if host == 'day' else R.choice(['qr_scan'] * 9 + ['manual']), None, p, rid, rc, own(rc)])
for i in range(40): chk.append([entry(R.choice([FEST1, FEST2])), 'denied', 'unverified', 'qr_scan', None, f'X{i:04d}', None, None, None])
chk.sort(key=lambda x: x[0])
for i, c in enumerate(chk): c[4] = f'CK{i+1:06d}'

# ---------- daily marketing spend, following the plan and its decisions ----------
BEFORE = {'C01': 52000, 'C02': 38000, 'C03': 30000, 'B1': 26000, 'B2': 16000, 'B3': 22000, 'B4': 36000, 'B5': 14000}   # to Sun 24 Jan (week 10)
PLANNED = {c[0]: c[7] for c in CAMPS}
AFTER = {cid: max(0, PLANNED[cid] - BEFORE[cid]) for cid in PLANNED}
AFTER['C01'] = 60000 - BEFORE['C01'] if 60000 > BEFORE['C01'] else 8000   # cut to reminders at the week 10 review
AFTER['B4'] = int((PLANNED['B4'] - BEFORE['B4']) * 0.5)                   # cost cut at the week 10 review
AFTER['B3'] = 18000                                                       # stopped at the week 12 review
daily = []
def spread(cid, a, b, tot, ramp=2.2, push=None):
    days = (b - a).days + 1
    if days <= 0 or tot <= 0: return
    w = [(1 + ramp * (i / max(1, days - 1))) * (1.8 if push and a + dt.timedelta(days=i) >= push else 1) for i in range(days)]; sw = sum(w); acc = 0
    for i in range(days):
        d = a + dt.timedelta(days=i)
        amt = round(tot * w[i] / sw / 100) * 100 if i < days - 1 else round(tot - acc)
        acc += amt
        if amt <= 0: continue
        imp = int(amt * R.uniform(9, 14)) if cid in ('C01', 'C02') else int(amt * R.uniform(2, 4))
        clk = int(imp * R.uniform(0.018, 0.034)); ses = int(clk * R.uniform(0.7, 0.85)); st_ = int(ses * R.uniform(0.15, 0.28)) if d >= LAUNCH else 0
        daily.append([d.isoformat() + 'T00:00:00', imp, clk, int(imp * 0.6), ses, st_, amt, 'campaign link analytics', f'AD-{cid}-{d.strftime("%y%m%d")}-{len(daily)}', cid, CO[cid][6]])
for c in CAMPS:
    cid = c[0]
    spread(cid, wk(c[10]), TODAY, BEFORE[cid], 1.2, PUSH if c[3] == 'channel' else None)
    if cid == 'B3': spread(cid, REVIEW1, REVIEW2 - dt.timedelta(days=1), AFTER[cid], 0.5)
    else: spread(cid, REVIEW1, EVE, AFTER[cid], 0.8)
for p in PD:   # released reserve is spent from the day it is released
    if p[3] == 'release_reserve': spread(p[2], p[1], EVE, p[4], 0.6)
daily.sort(key=lambda x: (x[0], x[9]))
dump('daily', ['activity_date', 'impressions', 'clicks', 'reported_reach', 'landing_page_sessions', 'registration_starts', 'marketing_spend_inr', 'platform', 'activity_id', 'campaign_id', 'owner_id'], daily)
people.sort(key=lambda x: x[1])
dump('people', ['person_type', 'first_seen_at', 'first_touch_source', 'person_id', 'first_campaign_id', 'owner_id', 'college_id', 'distance', 'arm', 'test_bet', 'segment', 'team_id'], people)
dump('registrations', ['registered_at', 'registration_id', 'person_id', 'campaign_id', 'owner_id'], regs)
hist.sort(key=lambda x: x[0])
for i, h in enumerate(hist): h[2] = f'H{i+1:06d}'
dump('reg_history', ['effective_at', 'status', 'history_id', 'registration_id', 'person_id', 'campaign_id', 'owner_id'], hist)
inter.sort(key=lambda x: x[0])
for i, x in enumerate(inter): x[2] = f'I{i+1:06d}'
dump('interactions', ['occurred_at', 'event_type', 'interaction_id', 'person_id', 'campaign_id', 'owner_id'], inter)
dump('checkins', ['occurred_at', 'result', 'verification', 'source', 'event_id', 'person_id', 'registration_id', 'campaign_id', 'owner_id'], chk)
tasks = [
    ['TKseed01', 'Hire lead ambassadors at the 6 test colleges (perks, not cash)', 'T03', wk(1) + dt.timedelta(days=6), 'done', 'B1'],
    ['TKseed02', 'Open competition registrations; 150 teams by week 6', 'T03', wk(6) + dt.timedelta(days=6), 'done', 'B1'],
    ['TKseed03', 'Big push: line-up reveal, Group Pass and Welcome Back cards', 'T06', PUSH, 'done', 'B2'],
    ['TKseed04', 'Crew captains: 300 signed up (week 10 milestone)', 'T03', TODAY, 'doing', 'B1'],
    ['TKseed05', 'Week 10 review: forecast, Warn/Act list, first reserve release', 'GL', REVIEW1, 'todo', None],
    ['TKseed06', 'Read the week-9 paid holdout: do ads bring friend groups?', 'T04', REVIEW1 + dt.timedelta(days=2), 'todo', 'C01'],
    ['TKseed07', 'Arrival design: 60% of pass holders have an entry window (week 12)', 'SEC', REVIEW2 - dt.timedelta(days=1), 'todo', None],
    ['TKseed08', 'Fest eve check: gates, waitlist release, volunteer shifts', 'GL', EVE, 'todo', None],
]
with open(f'{OUT}/tasks.json', 'w') as f:
    f.write('[\n' + ',\n'.join(json.dumps({'id': t[0], 'base': '27', 'title': t[1], 'owner': t[2], 'due': t[3].isoformat(), 'status': t[4], 'campaign_id': t[5], 'source': 'plan'}, ensure_ascii=False) for t in tasks) + '\n]\n')
print('people', len(people), 'regs', len(regs), 'attendees', len(attendees), 'spend', sum(r[6] for r in daily), 'released', REL)
