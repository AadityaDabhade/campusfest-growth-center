"""CampusFest 2027 plan model. Every number on the three slides comes from this file.

Run:  python3 model/plan_model.py            (prints every slide number)
Tags: S = sourced (the provided 2025 dataset or a cited source) · A = our assumption · D = our decision.

How it works
- FLOOR: what the plan delivers if none of the five bets beats its comparison group: paid channels on 2025's
  own cost per attendee (with diminishing returns), unpaid search, competition teams, walk-ins, and our own students.
- ONE PRICE: ₹500 is the most we pay for one more outside attendee (D): 2025's last rupee of ads bought attendees at
  ₹550–670 and the fest kept buying. Channels stay near what 2025 tested (₹1.5L; their next attendee costs ~₹300 there);
  scaling them further rests on a guess, so the rest of the money waits for proof.
- The reserve (₹5.3L) has two jobs. GROW: at the week-7 review, a proven bet gets a top-up if its next attendee costs
  ≤ ₹500 after the 80% yield. PROTECT: at week 10, while the run's most likely outcome (seen with forecast error) misses
  the base, ₹50k steps (≤ ₹750 each, ≤ ₹1.5L per campaign), each taken on its own merit.
- 20,000 runs, every input drawn from its range (triangular). The fixed seed gives the same answer every time.
- BASE (what we commit to) = the plan without the reserve with bad luck (10th percentile, rounded: 89% of runs reach it).
- LIKELY = the middle run. STRETCH = the plan with the reserve deployed, with good luck (90th percentile, rounded down: 12% of runs reach it),
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
LIMIT = 500                                                         # D: what one more outside attendee is worth (2025's last ad rupee bought attendees at ₹550–670)
# D: channels stay near the spend 2025 tested (their next attendee costs about ₹300 here); beyond that the curve is a guess,
# so extra money waits for bets that prove themselves. (At ₹300: next attendee costs With attendees = A25 × (S / S25)^0.5 the next one costs
# S / (0.5 × attendees), so S* = (₹300 × 0.5 × A25)² / S25: Paid Social ≈ ₹28k, Creators ≈ ₹12k, College Partnerships ≈ ₹1.08L.
opt = lambda k: (LIMIT * 0.5 * CH25[k][1]) ** 2 / CH25[k][0]
CHANNELS = {'Paid Social': 28000, 'Creator Partners': 12000, 'College Partnerships': 110000}   # rounded from opt(); partnerships also run the competition slots
BETS = {'Campus Outreach': 60000, 'Group Pass': 70000, 'Day Scholar Turnout': 70000, 'Volunteer Corps': 60000, 'Alumni Homecoming': 60000}
RESERVE = 530000                                                    # D: grow at most ₹2L + room for protect (sized by the run below)
NOT_NEEDED = 0                                                 # D: returned on day 1: before evidence nothing buys an attendee for ≤ ₹300
BUDGET = sum(CHANNELS.values()) + sum(BETS.values()) + RESERVE + NOT_NEEDED   # ₹10L
CAP = {k: LIMIT for k in ('Campus Outreach', 'Group Pass', 'Day Scholar Turnout', 'Volunteer Corps', 'Alumni Homecoming')}   # D: the same price for every rupee
BASE_T = 3800                                                       # D: the base we commit to (re-checked by the run below)
YIELD = 0.8                                                         # A: new money does 80% as well as the test (range 50–100% below)
SCALE = {'Campus Outreach': 0.5, 'Group Pass': 0.6, 'Day Scholar Turnout': 0.4, 'Volunteer Corps': 0.3, 'Alumni Homecoming': 0.5}   # A: how well each scales

HOSTEL, DAY_SCHOLARS = 4000, 6000                                   # A: host college, 10,000 students
GATE_PER_HOUR = 6 * 420                                             # A: 6 QR lanes × ~7 scans a minute


def run(with_reserve):
    b = tri(0.4, 0.5, 0.7)                                          # A: diminishing returns of channel spend
    # FLOOR: paid channels on 2025's own cost per attendee, scaled to the new spend
    paid = sum(CH25[k][1] * (v / CH25[k][0]) ** b for k, v in CHANNELS.items())
    organic = CH25['Organic Search'][1] * tri(0.9, 1.0, 1.2)        # unpaid search keeps working (A)
    n_teams = tri(150, 250, 300)                                    # A: outside teams that sign up for 300 slots (2025 had no competitions)
    teams = n_teams * tri(3.0, 3.5, 4.0) * tri(0.85, 0.90, 0.95)    # × team size (A) × show-up (A; 2025 partnerships 86%)
    # BETS (extra outside attendees, beyond what comparison colleges do)
    crews = 430 * tri(0.12, 0.20, 0.28) * tri(10, 12, 14)           # captains (A) × share reaching 10+ (A) × crew size (A)
    crews = crews * (1 - 4 / 12) * 0.5                              # minus the ~4 per crew who'd come anyway; halved for overlap with Group Pass
    squads = n_teams * tri(1.0, 2.0, 2.5) * 0.9                         # supporters per team via its squad link (A) × show-up
    gp_regs = tri(320, 632, 880)                                    # extra attendees from friends registering together (A, tested 4 vs 4 colleges)
    showup_lift = tri(0.0, 0.02, 0.05)                              # confirm-or-release: show-up of pass holders (A; untested, so small; its own test arm)
    day_sch = tri(0, 501, 570)                                      # 55% → 66% of 4,500 non-society day scholars (A; 0 if they already come)
    vol_n = tri(300, 600, 700); vol_new = tri(0.30, 0.45, 0.60)
    volunteers = vol_n * vol_new * 0.92 * (1 + tri(0.3, 0.5, 0.8))  # sign-ups × not coming anyway (A) × check-in × (1 + friends each brings, A)
    alumni = (tri(410, 468, 565) if rng.random() < 0.6 else 0)      # 60% chance the university approves (A)
    walk = tri(0.04, 0.06, 0.08)
    pre = paid + organic + crews + squads + gp_regs + volunteers + alumni   # registered outside attendees except teams, before the lift
    pass_regs = pre / 0.6875                                        # pass holders behind them, at 2025's 68.75% show-up (S)
    gp = gp_regs + pass_regs * showup_lift                          # + pass holders who now come because of confirm-or-release
    outside = (paid + organic + teams + crews + squads + gp + volunteers + alumni) / (1 - walk)
    reserve_extra = protect_spend = protect_extra = fired = grow_spend = 0
    if with_reserve:   # the money rule at the week-7 review: a top-up only if it buys attendees under the limit; 76% of sign-ups still to come
        y = tri(0.5, 0.8, 1.0)                                      # new money does a bit worse than the test (A)
        grow_spend = 0
        left = 0.76                                                 # S: 2025's curve has 24% of sign-ups in by week 7
        for name, final in (('Campus Outreach', crews + squads), ('Group Pass', gp), ('Volunteer Corps', volunteers), ('Alumni Homecoming', alumni)):
            P = BETS[name]
            for R in (100000, 50000):
                extra = final * (((P + R) / P) ** SCALE[name] - 1) * left
                if extra > 0 and R / (extra * YIELD) <= CAP[name]: reserve_extra += extra * y; grow_spend += R; break
        outside += reserve_extra
        # PROTECT at week 10 (51% of sign-ups still to come): the team sees this run's outcome through a forecast that
        # can be 10% off. If most likely misses the base, price ₹50k steps on Outreach, Group Pass and College Partnerships
        # (cheapest first, ≤ ₹600 = 2× the limit, ≤ ₹1.5L each) and release them only if together they reach the base.
        seen = outside * tri(0.9, 1.0, 1.1)
        if seen < BASE_T:
            opts = {'Campus Outreach': [crews + squads, BETS['Campus Outreach'], SCALE['Campus Outreach']], 'Group Pass': [gp, BETS['Group Pass'], SCALE['Group Pass']],
                    'College Partnerships': [CH25['College Partnerships'][1] * (CHANNELS['College Partnerships'] / CH25['College Partnerships'][0]) ** b, CHANNELS['College Partnerships'], b]}
            got = {k: 0 for k in opts}; add_seen = add_true = 0
            while seen + add_seen < BASE_T:
                best = None
                for k, (fin, P0, sc) in opts.items():
                    if got[k] + 50000 > 150000 or fin <= 0 or grow_spend + sum(got.values()) + 50000 > RESERVE: continue
                    d = fin * (((P0 + got[k] + 50000) / P0) ** sc - ((P0 + got[k]) / P0) ** sc) * 0.51
                    price = 50000 / (d * YIELD)
                    if best is None or price < best[1]: best = (k, price, d)
                if best is None or best[1] > 1.5 * LIMIT: break
                got[best[0]] += 50000; add_seen += best[2] * YIELD; add_true += best[2] * y
            fired = 1
            protect_spend, protect_extra = sum(got.values()), add_true   # each step stands on its own
            outside += protect_extra
    host = HOSTEL * tri(0.85, 0.90, 0.95) + DAY_SCHOLARS * tri(0.55, 0.65, 0.75) + day_sch
    parts = dict(paid=paid, organic=organic, teams=teams, crews=crews, squads=squads, gp=gp, day_sch=day_sch, volunteers=volunteers,
                 alumni=alumni, reserve=reserve_extra, grow_spend=grow_spend, protect_spend=protect_spend, protect_extra=protect_extra, fired=fired, outside=outside, host=host, total=outside + host)
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
    print('Budget ₹%d = channels ₹%d + bets ₹%d + reserve ₹%d + not needed ₹%d' % (BUDGET, sum(CHANNELS.values()), sum(BETS.values()), RESERVE, NOT_NEEDED))
    print('\nPer part, no reserve (bad / likely / good):')
    for k in ('paid', 'organic', 'teams', 'crews', 'squads', 'gp', 'day_sch', 'volunteers', 'alumni', 'outside', 'host', 'total'):
        lo, mid, hi = summ(no_res, k); print(f'  {k:11s} {lo:8.0f} {mid:8.0f} {hi:8.0f}')
    print('\nFloor (no bet works): outside %d / %d / %d · total %d / %d / %d' % (*summ(floor_runs, 'outside'), *summ(floor_runs, 'total')))
    ob, ol, og = summ(no_res, 'outside'); tb, tl, tg = summ(no_res, 'total')
    print('Plan without reserve: outside %d / %d / %d · total %d / %d / %d' % (ob, ol, og, tb, tl, tg))
    rb, rl, rg = summ(with_res, 'outside'); qb, ql, qg = summ(with_res, 'total')
    print('Plan with reserve:    outside %d / %d / %d · total %d / %d / %d · reserve adds %d (likely)' % (rb, rl, rg, qb, ql, qg, summ(with_res, 'reserve')[1]))
    dn100 = lambda x: int(x // 100 * 100)
    print('\nTARGETS: base = %d all (%d outside) · stretch = %d all (%d outside, rounded down)' % (r100(tb), r100(ob), dn100(min(qg, CEIL_RUSH)), dn100(rg)))
    print('Gate limit: %d with 2025-style rush, %d with entry windows' % (CEIL_RUSH, CEIL_WIN))
    bets_likely = {k: summ(no_res, k)[1] for k in ('crews', 'squads', 'gp', 'day_sch', 'volunteers', 'alumni')}
    for name, keys in (('Campus Outreach', ('crews', 'squads')), ('Group Pass', ('gp',)), ('Day Scholar Turnout', ('day_sch',)), ('Volunteer Corps', ('volunteers',)), ('Alumni Homecoming', ('alumni',))):
        vals = [sum(r[k] for k in keys) for r in no_res]; lo, mid, hi = pct(vals, 0.1), pct(vals, 0.5), pct(vals, 0.9); mean = sum(vals) / len(vals)
        P = BETS[name]; tr = lambda R: R / (mean * (((P + R) / P) ** SCALE[name] - 1) * 0.76 * YIELD) if mean > 0 else 0
        print(f'  {name:20s} ₹{P//1000}k  bad {lo:5.0f}  likely {mid:5.0f}  good {hi:5.0f}  mean {mean:5.0f}  ₹/extra {P/mean:4.0f}  ₹50k top-up ₹{tr(50000):.0f} each, ₹1L ₹{tr(100000):.0f} (cap ₹{CAP[name]})  bad-case per ₹1k {lo/P*1000:.1f}')
    # extra lines for the README: averages, how often the base is beaten, the base funnel
    avg = lambda runs, k: sum(r[k] for r in runs) / len(runs)
    fl = sum(r['outside'] for r in floor_runs) / N
    print('\nAverages (no reserve): floor %.0f (paid %.0f, unpaid %.0f, teams %.0f, then ÷ 0.94) · outreach +%.0f · group pass +%.0f · volunteers +%.0f · alumni +%.0f · outside %.0f · with reserve %.0f' % (
        fl, avg(no_res, 'paid'), avg(no_res, 'organic'), avg(no_res, 'teams'), (avg(no_res, 'crews') + avg(no_res, 'squads')) / 0.94, avg(no_res, 'gp') / 0.94,
        avg(no_res, 'volunteers') / 0.94, avg(no_res, 'alumni') / 0.94, avg(no_res, 'outside'), avg(with_res, 'outside')))
    base_o = r100(ob)
    print('Share of runs at or above the %d base: %.1f%% (no reserve) · %.1f%% (with reserve)' % (base_o, 100 * sum(r['outside'] >= base_o for r in no_res) / N, 100 * sum(r['outside'] >= base_o for r in with_res) / N))
    gs = sorted(r['grow_spend'] for r in with_res); ps = sorted(r['protect_spend'] for r in with_res)
    print('Grow step: releases in %.1f%% of runs, average ₹%.0fk, at most ₹%dk' % (100 * sum(g > 0 for g in gs) / N, sum(gs) / N / 1000, gs[-1] // 1000))
    fired = sum(r['fired'] for r in with_res); paid = sum(p > 0 for p in ps)
    print('Protect step: needed in %.1f%% of runs, released in %.1f%% (feasible), average ₹%.0fk, P90 of runs that release ₹%dk, max ₹%dk; average lift where released %.0f' % (
        100 * fired / N, 100 * paid / N, sum(ps) / N / 1000, sorted(p for p in ps if p > 0)[int(0.9 * max(1, paid)) - 1] // 1000 if paid else 0, ps[-1] // 1000,
        sum(r['protect_extra'] for r in with_res if r['protect_spend'] > 0) / max(1, paid)))
    tot = sorted(r['grow_spend'] + r['protect_spend'] for r in with_res)
    print('Reserve used (grow + protect): average ₹%.0fk, P90 ₹%dk, max ₹%dk of ₹%dk' % (sum(tot) / N / 1000, tot[int(0.9 * N)] // 1000, tot[-1] // 1000, RESERVE // 1000))
    print('Channels at plan, next attendee costs: ' + ', '.join('%s ₹%.0f (spend ₹%dk)' % (k, v / (0.5 * CH25[k][1] * (v / CH25[k][0]) ** 0.5), v // 1000) for k, v in CHANNELS.items()))
    tm = 250 * 3.5; sh = 0.6875 + 0.02
    pass_regs = (base_o * 0.94 - tm * 0.90) / sh
    print('Base funnel: pass registrations %.0f = (%d × 0.94 − %d team members × 90%%) ÷ %.2f%% show-up; responded %.0f = (pass + %d) ÷ 80%%' % (pass_regs, base_o, tm, sh * 100, (pass_regs + tm) / 0.80, tm))
    print('Share of runs at or above the stretch %d (with reserve): %.1f%%' % (dn100(rg), 100 * sum(r['outside'] >= dn100(rg) for r in with_res) / N))
    st = dn100(rg); print('Stretch pass registrations %.0f = (%d × 0.94 − 300 × 3.5 × 90%%) ÷ 72%%' % ((st * 0.94 - 945) / 0.72, st))
