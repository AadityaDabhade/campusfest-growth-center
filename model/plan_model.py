"""CampusFest 2027 plan model: every number on the three slides comes from here.
Tags: S = sourced (2025 provided data or a cited source), A = our assumption, D = our decision.
Run: python3 model/plan_model.py"""
R = lambda x, n=0: round(x, n) if n else int(round(x))

# --- 2025, from the provided dataset (S) -----------------------------------------
y25 = dict(responded=3625, registered=2800, came_registered=1925, walkins=125, attendees=2050,
           spend=274000, peak_entries=400, day1=1430, day2=1345)
y25['reg_rate'] = y25['registered'] / y25['responded']            # 77.2%
y25['showup'] = y25['came_registered'] / y25['registered']         # 68.75%
y25['walkin_share'] = y25['walkins'] / y25['attendees']            # 6.1%
y25['end_to_end'] = y25['attendees'] / y25['responded']            # 56.6%
y25['cost_per_attendee'] = y25['spend'] / y25['attendees']         # ₹134
y25['peak_share'] = y25['peak_entries'] / y25['day1']              # 28% of a day's arrivals in the busiest hour
y25['days_per_person'] = (y25['day1'] + y25['day2']) / y25['attendees']   # 1.35

# --- Host college (A, D) -----------------------------------------------------------
hostel, day_sch = 4000, 6000
host_base = hostel * 0.90 + day_sch * 0.65                        # 3,600 + 3,900 = 7,500

# --- Outside, base case: no bet has to work ---------------------------------------
teams, per_team = 300, 3.5                                         # A (core team slots for 300 teams)
team_people = teams * per_team                                     # 1,050
pass_regs = 5760                                                   # D (pace plan on 2025's curve)
pass_reg_rate = 0.78                                               # A: 2025 was 77%
responded = pass_regs / pass_reg_rate + team_people                # ~8,400
regs = pass_regs + team_people                                     # 6,810
showup_base = 0.663                                                # A: 2025 was 69%; lower for colder, farther audiences
outside_base = regs * showup_base / (1 - y25['walkin_share'])      # ~4,800
total_base = host_base + outside_base

# --- Five bets (likely extra attendees, overlaps removed; bad / good from 20,000-run simulation) --
bets = [  # name, type, budget, bad, likely, good, cap, how well it scales, audience
  ('Campus Outreach', 'Safe', 60000, 1304, 1432, 1643, 235, 0.5, 'outside'),
  ('Group Pass + Welcome Back', 'Safe', 70000, 743, 805, 900, 250, 0.6, 'outside'),
  ('Day Scholar Turnout', 'Maybe', 70000, 458, 501, 567, 200, 0.4, 'host'),
  ('Volunteer Corps', 'Safe', 60000, 351, 377, 420, 200, 0.3, 'outside'),
  ('Alumni Homecoming', 'Bold', 60000, 410, 468, 565, 250, 0.5, 'outside'),
]
for b in bets:
    name, typ, bud, bad, lik, good, cap, sc, aud = b
    avg = bud / lik; nxt = avg / sc
    print(f"{name:28s} {typ:5s} ₹{bud/1000:.0f}k  +{bad}/+{lik}/+{good}  ₹{avg:.0f}/extra  next ₹{nxt:.0f} vs cap ₹{cap}  {'reserve first' if nxt <= cap else 'no reserve'}")
bets_out = sum(b[4] for b in bets if b[8] == 'outside'); bets_host = sum(b[4] for b in bets if b[8] == 'host')
showup_lift = regs * (0.72 - showup_base) / (1 - y25['walkin_share'])   # A: Group Pass confirm + waitlist lifts base show-up to 72%
outside_stretch = outside_base + bets_out + showup_lift
host_stretch = host_base + bets_host
total_stretch = outside_stretch + host_stretch

# --- Money (D) ---------------------------------------------------------------------
channels = {'Paid Social': 80000, 'Creator Partners': 80000, 'College Partnerships': 70000}
working = sum(channels.values()) + sum(b[2] for b in bets); reserve = 1000000 - working

# --- Capacity: gate flow (S for 2025 rush, A for lanes) -------------------------------
gate_per_hour = 6 * 420                                            # 6 QR lanes x ~7 scans/min
def ceiling(peak_share):
    per_day = gate_per_hour / peak_share
    return per_day * 2 / y25['days_per_person'] + hostel * 0.90    # hostel students never use the gates
ceil_rush, ceil_spread = ceiling(y25['peak_share']), ceiling(0.20)

out = dict(
  y25_reg_rate=R(y25['reg_rate']*100, 1), y25_showup=R(y25['showup']*100, 1), y25_walkin=R(y25['walkin_share']*100, 1),
  y25_end_to_end=R(y25['end_to_end']*100, 1), y25_cpa=R(y25['cost_per_attendee']), y25_peak_share=R(y25['peak_share']*100, 1),
  host_base=R(host_base), responded=R(responded, -2), regs=R(regs), team_people=R(team_people), outside_base=R(outside_base),
  total_base=R(total_base), bets_out=bets_out, bets_host=bets_host, showup_lift=R(showup_lift), outside_stretch=R(outside_stretch),
  host_stretch=R(host_stretch), total_stretch=R(total_stretch), working=working, reserve=reserve,
  cpa_base=R(1000000/outside_base), cpa_stretch=R(1000000/outside_stretch), gate_per_hour=gate_per_hour,
  ceil_rush=R(ceil_rush), ceil_spread=R(ceil_spread), ratio_base=R(outside_base/2050, 2), ratio_stretch=R(outside_stretch/2050, 2),
  stretch_regs=R(outside_stretch*(1-y25['walkin_share'])/0.72), stretch_pass_regs=R(outside_stretch*(1-y25['walkin_share'])/0.72 - team_people),
)
for k, v in out.items(): print(f'{k:20s} {v}')
