"""CampusFest 2027 plan model. Every number on the three slides comes from this file.

Run:  python3 model/plan_model.py            (prints every slide number)
Tags: S = sourced (the provided 2025 dataset or a cited source) · A = our assumption · D = our decision.

How it works
- FLOOR: what the plan delivers if none of the five bets beats its comparison group: paid channels on 2025's
  own cost per attendee (with diminishing returns), unpaid search, the core team's 300 competition teams,
  walk-ins, and our own students.
- The five bets add extra attendees on top, each built up from its own inputs (low / likely / high).
- The reserve (₹4.5L) is spent only on bets that pass the money rule, at their own diminishing returns.
- 20,000 runs, every input drawn from its range (triangular). The fixed seed gives the same answer every time.
- BASE (what we commit to) = the plan without the reserve with bad luck: 9 runs in 10 do better.
- LIKELY = the middle run. STRETCH = the plan with the reserve deployed, with good luck: 1 run in 10 does better,
  capped by the gates.
"""
import random

N = 20000
rng = random.Random(2027)
tri = lambda lo, mode, hi: rng.triangular(lo, hi, mode)

# ---------------- 2025, from the provided dataset (S) ----------------
Y25 = dict(responded=3625, registered=2800, came_registered=1925, walkins=125, attendees=2050, spend=274000,
           peak_entries=400, day1=1430, day2=1345)
CH25 = {  # 2025 channel: (net spend ₹, verified outside attendees, show-up of registrants)
    'Paid Social': (93000, 340, 0.50), 'Creator Partners': (59000, 175, 0.50), 'College Partnerships': (31000, 385, 0.86),
    'Organic Search': (14000, 195, 0.78), 'Student Referrals': (19000, 275, 0.79), 'Community Groups': (16000, 165, 0.83),
    'Campus Ambassadors': (42000, 390, 0.75)}
walkin_25 = Y25['walkins'] / Y25['attendees']                      # 6.1%
peak_share_25 = Y25['peak_entries'] / Y25['day1']                   # 28% of a day's arrivals in the busiest hour
days_each_25 = (Y25['day1'] + Y25['day2']) / Y25['attendees']       # 1.35 days per person

# ---------------- the plan's money (D) ----------------
CHANNELS = {'Paid Social': 80000, 'Creator Partners': 80000, 'College Partnerships': 70000}   # reveals/reminders; partnerships run the 300 team slots
BETS = {'Campus Crews': 60000, 'Group Pass': 70000, 'Day Scholar Turnout': 70000, 'Volunteer Corps': 60000, 'Alumni Homecoming': 60000}
RESERVE = 450000
BUDGET = sum(CHANNELS.values()) + sum(BETS.values()) + RESERVE       # ₹10L
CAP = {'Campus Crews': 235, 'Group Pass': 250, 'Day Scholar Turnout': 200, 'Volunteer Corps': 200, 'Alumni Homecoming': 250}
SCALE = {'Campus Crews': 0.5, 'Group Pass': 0.6, 'Day Scholar Turnout': 0.4, 'Volunteer Corps': 0.3, 'Alumni Homecoming': 0.5}   # A: how well each scales

HOSTEL, DAY_SCHOLARS = 4000, 6000                                   # A: host college, 10,000 students
GATE_PER_HOUR = 6 * 420                                             # A: 6 QR lanes × ~7 scans a minute


def run(with_reserve):
    b = tri(0.4, 0.5, 0.7)                                          # A: diminishing returns of channel spend
    # FLOOR: paid channels on 2025's own cost per attendee, scaled to the new spend
    paid = sum(CH25[k][1] * (v / CH25[k][0]) ** b for k, v in CHANNELS.items())
    organic = CH25['Organic Search'][1] * tri(0.9, 1.0, 1.2)        # unpaid search keeps working (A)
    teams = 300 * tri(3.0, 3.5, 4.0) * tri(0.85, 0.90, 0.95)        # core team's 300 slots (D) × team size (A) × show-up (A; 2025 partnerships 86%)
    # BETS (extra outside attendees, beyond what comparison colleges do)
    crews = 430 * tri(0.12, 0.20, 0.28) * tri(10, 12, 14)           # captains (A) × share reaching 10+ (A) × crew size (A)
    crews = crews * (1 - 4 / 12) * 0.5                              # minus the ~4 per crew who'd come anyway; halved for overlap with Group Pass
    squads = 300 * tri(1.0, 2.0, 2.5) * 0.9                         # supporters per team via its squad link (A) × show-up
    gp_regs = tri(320, 632, 880)                                    # extra attendees from friends registering together (A, tested 4 vs 4 colleges)
    showup_lift = tri(0.0, 0.06, 0.09)                              # confirm + waitlist: show-up of all registrants (A)
    day_sch = tri(0, 501, 570)                                      # 55% → 66% of 4,500 non-society day scholars (A; 0 if they already come)
    vol_n = tri(300, 600, 700); vol_new = tri(0.30, 0.45, 0.60)
    volunteers = vol_n * vol_new * 0.92 * (1 + tri(0.3, 0.5, 0.8))  # sign-ups × not coming anyway (A) × check-in × (1 + friends each brings, A)
    alumni = (tri(410, 468, 565) if rng.random() < 0.6 else 0)      # 60% chance the university approves (A)
    regs_base = 5760 + 300 * 3.5                                    # registrations the show-up lift applies to
    gp = gp_regs + regs_base * showup_lift                          # + registrants who now come because of confirm + waitlist
    outside = (paid + organic + teams + crews + squads + gp + volunteers + alumni) / (1 - tri(0.04, 0.06, 0.08))
    reserve_extra = 0
    if with_reserve:   # the money rule: reserve goes to the bets whose top-up stays under their cap (crews and group pass here)
        y = tri(0.5, 0.8, 1.0)                                      # new money does a bit worse than the test (A)
        for name, final, R in (('Campus Crews', crews + squads, 200000), ('Group Pass', gp, 200000)):
            P = BETS[name]; extra = final * (((P + R) / P) ** SCALE[name] - 1)
            if R / max(extra, 1) <= CAP[name]: reserve_extra += extra * y
        outside += reserve_extra
    host = HOSTEL * tri(0.85, 0.90, 0.95) + DAY_SCHOLARS * tri(0.55, 0.65, 0.75) + day_sch
    parts = dict(paid=paid, organic=organic, teams=teams, crews=crews, squads=squads, gp=gp, day_sch=day_sch, volunteers=volunteers,
                 alumni=alumni, reserve=reserve_extra, outside=outside, host=host, total=outside + host)
    return parts


def pct(arr, q): a = sorted(arr); return a[int(q * (len(a) - 1))]
def summ(runs, key): v = [r[key] for r in runs]; return pct(v, 0.1), pct(v, 0.5), pct(v, 0.9)
r10 = lambda x: int(round(x / 10.0) * 10)
r100 = lambda x: int(round(x / 100.0) * 100)

no_res = [run(False) for _ in range(N)]
with_res = [run(True) for _ in range(N)]
floor_runs = []
rng2 = random.Random(7)
for r in no_res:   # floor = the same runs with every bet at zero
    f = (r['paid'] + r['organic'] + r['teams']) / (1 - 0.06)
    floor_runs.append(dict(outside=f, total=f + r['host'] - r['day_sch']))

# capacity: gate flow
def ceiling(peak_share): return GATE_PER_HOUR / peak_share * 2 / days_each_25 + HOSTEL * 0.90
CEIL_RUSH, CEIL_WIN = ceiling(peak_share_25), ceiling(0.20)

if __name__ == '__main__':
    print('2025 (S): walk-ins %.1f%%, peak hour %.0f%% of day 1, %.2f days per person, cost per attendee ₹%d' % (walkin_25 * 100, peak_share_25 * 100, days_each_25, Y25['spend'] / Y25['attendees']))
    print('Budget ₹%d = channels ₹%d + bets ₹%d + reserve ₹%d' % (BUDGET, sum(CHANNELS.values()), sum(BETS.values()), RESERVE))
    print('\nPer part, no reserve (bad / likely / good):')
    for k in ('paid', 'organic', 'teams', 'crews', 'squads', 'gp', 'day_sch', 'volunteers', 'alumni', 'outside', 'host', 'total'):
        lo, mid, hi = summ(no_res, k); print(f'  {k:11s} {lo:8.0f} {mid:8.0f} {hi:8.0f}')
    print('\nFloor (no bet works): outside %d / %d / %d · total %d / %d / %d' % (*summ(floor_runs, 'outside'), *summ(floor_runs, 'total')))
    ob, ol, og = summ(no_res, 'outside'); tb, tl, tg = summ(no_res, 'total')
    print('Plan without reserve: outside %d / %d / %d · total %d / %d / %d' % (ob, ol, og, tb, tl, tg))
    rb, rl, rg = summ(with_res, 'outside'); qb, ql, qg = summ(with_res, 'total')
    print('Plan with reserve:    outside %d / %d / %d · total %d / %d / %d · reserve adds %d (likely)' % (rb, rl, rg, qb, ql, qg, summ(with_res, 'reserve')[1]))
    print('\nTARGETS: base = %d all (%d outside) · stretch = %d all (%d outside)' % (r100(tb), r100(ob), r100(min(qg, CEIL_RUSH)), r100(rg)))
    print('Gate limit: %d with 2025-style rush, %d with entry windows' % (CEIL_RUSH, CEIL_WIN))
    bets_likely = {k: summ(no_res, k)[1] for k in ('crews', 'squads', 'gp', 'day_sch', 'volunteers', 'alumni')}
    for name, keys in (('Campus Crews', ('crews', 'squads')), ('Group Pass', ('gp',)), ('Day Scholar Turnout', ('day_sch',)), ('Volunteer Corps', ('volunteers',)), ('Alumni Homecoming', ('alumni',))):
        vals = [sum(r[k] for k in keys) for r in no_res]; lo, mid, hi = pct(vals, 0.1), pct(vals, 0.5), pct(vals, 0.9); mean = sum(vals) / len(vals)
        P = BETS[name]; tr = lambda R: R / (mean * (((P + R) / P) ** SCALE[name] - 1)) if mean > 0 else 0
        print(f'  {name:20s} ₹{P//1000}k  bad {lo:5.0f}  likely {mid:5.0f}  good {hi:5.0f}  mean {mean:5.0f}  ₹/extra {P/mean:4.0f}  ₹50k top-up ₹{tr(50000):.0f} each, ₹1L ₹{tr(100000):.0f} (cap ₹{CAP[name]})  bad-case per ₹1k {lo/P*1000:.1f}')
