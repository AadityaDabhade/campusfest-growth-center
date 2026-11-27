# CampusFest Growth Center

**Dabhade Aaditya Kishor · 22EX23005 · IIT Kharagpur**
RISA Labs Growth APM assignment · **Challenge A: Attendee Growth** · CampusFest 2027, New Delhi

- **Live app:** https://campusfest-growth-center-sand.vercel.app (dashboard, campaign and task manager, AI analyst)
- **Code:** https://github.com/AadityaDabhade/campusfest-growth-center
- **Backup inside Claude:** https://claude.ai/artifact/KXbRrm2dBVD9GWzMAm2cST (the analyst runs on the viewer's Claude account)
- **Slides:** `CampusFest_Growth_Strategy_Dabhade_22EX23005.pdf` (3 slides)
- **Demo video:** `Growth_Center_demo.mp4` (2.5 min: the screens at week 10, then the analyst answering a data question, a decision, a what-if, a calculation, a follow-up, a "not in the data" question and an action with confirmation). The answers were recorded from the live site on 27 Nov 2026 and replayed against a local copy, so the video does not wait on busy free-tier models; every number and tool call runs for real. It was recorded with the earlier ₹300 limit, so its week-10 numbers (3,510 most likely, ₹2.5L reserve) differ slightly from the current ₹500 version.

---

## Contents

1. The answer in one page
2. Research: what we learned and from where
3. The plan model: targets, funnel and detailed calculations
4. The five bets and how we ranked them
5. Signals, thresholds and the money rule
6. Data: what is sourced and what is simulated
7. The Growth Center: a five-minute tour
8. How the numbers are calculated (counting rules and formulas)
9. The AI Growth Analyst
10. Testing
11. Setup
12. Tools used, and what was reused, changed and checked
13. Known limitations

---

## 1. The answer in one page

| | Outside attendees | All attendees (with our own students) |
|---|---|---|
| 2025 actual (provided data) | 2,050 | not recorded |
| **Base: what we commit to** (89% of simulated runs reach it with no reserve, 99.6% with it) | **3,800** (1.9×) | **11,500** |
| Most likely (middle run, reserve by the rule) | ~4,900 | ~12,750 |
| **Stretch** (14% of runs reach it, reserve by the rule) | **5,400** (2.6×) | **13,400** |
| Gate limit if arrivals bunch like 2025 / with entry windows | – | 16,900 / 22,200 |

- **City:** New Delhi. **Dates:** Fri–Sat 26–27 Feb 2027. **Campaign:** 15 weeks from Mon 16 Nov 2026.
- **Budget:** ₹10L = ₹1.5L channels + ₹3.2L for five bets + ₹5.3L reserve that only buys attendees a test has proven.
- **One price:** ₹500 is the most we pay for one more outside attendee (a decision). In 2025 the last rupee of ads bought attendees at ₹550–670 and the fest kept buying, so ₹500 stays under what it already paid. Channels stay near the spend 2025 tested (₹1.5L, where their next attendee costs about ₹300): pushing them further rests on a guess, so the rest of the money waits for bets that prove themselves.
- **The reserve has two jobs.** *Grow:* at a review (weeks 7, 10, 12), a proven bet gets ₹50k (₹1L if the gap is High) if its next attendee costs ≤ ₹500 after the 80% yield. *Protect:* at weeks 10 and 12, while the **most likely** outcome misses the target, take ₹50k steps on every working campaign (proven bets and channels), cheapest first, one at a time, up to ₹1.5L more each and ₹750 per extra attendee (1.5× the price). In the model the reserve lifts the chance of reaching the base from 89% to 99.6% and adds about 600 attendees; it spends ₹2.2L on average (P90 ₹2.5L, at most ₹4.5L).
- **The verdict is on outside attendees.** They are what marketing moves and what the 2025 data can check. Our own students (4,000 hostel, 6,000 day scholars) add about 7,700, but they need no registration and 2025 has no data on them, so they sit next to the verdict, never inside it.
- **Strategy in one line:** back people who bring people (2025: people brought by a person came 75–86% of the time; people from ads 50%), test every new idea against comparison colleges, and put more money only where the next attendee costs ₹500 or less, or where it protects the commitment.

## 2. Research: what we learned and from where

### 2.1 The provided 2025 data (computed by the app's engine and checked in Python)

| Measure | 2025 |
|---|---|
| Outside people who responded (did something back; 3,625 including the 125 walk-ins) | 3,500 |
| Registered | 2,800 (80% of those who responded) |
| Registered people who came | 1,925 (68.75% show-up) |
| Walk-ins (came without registering) | 125 (6.1% of attendees) |
| Unique verified outside attendees | **2,050** |
| Net marketing spend | ₹2,74,000 (₹134 per attendee) |
| Busiest hour | 400 entries at 6 pm on day 1, 28% of that day's 1,430 visitors |
| People per day | 1.35 days each (1,430 + 1,345 visitor-days ÷ 2,050) |

| 2025 channel | Spend | Came | Show-up | ₹ per attendee |
|---|---|---|---|---|
| Student Referrals | ₹19,000 | 275 | 79% | ₹69 |
| Organic Search | ₹14,000 | 195 | 78% | ₹72 |
| College Partnerships | ₹31,000 | 385 | **86%** | ₹81 |
| Community Groups | ₹16,000 | 165 | 83% | ₹97 |
| Campus Ambassadors | ₹42,000 | 390 | 75% | ₹108 |
| Paid Social | ₹93,000 | 340 | **50%** | ₹274 |
| Creator Partners | ₹59,000 | 175 | **50%** | ₹337 |

**What the data told us:** (1) channels where a person brings you had 75–86% show-up at ₹69–108 per attendee; ads had 50% at ₹274–337. (2) Everyone who came had confirmed; none of the 29 people still unconfirmed on fest eve came. (3) Arrivals bunch: 28% of a day came in one hour. (4) Walk-ins are small (6%): a buffer, not a lever. (5) 2025 missed its own revised goals (2,800 of 3,200 registrations, 2,050 of 2,200 visitors), so we plan on actual rates, not goals.

### 2.2 Outside sources (checked by opening each page; details in `docs/sources.md`)

| Claim used | Source |
|---|---|
| Delhi University: 77 colleges, 1,32,435 regular students | University of Delhi, academics page (du.ac.in), updated 2020 |
| The Magenta Line links JNU, IIT Delhi and Jamia ("knowledge corridor") | DMRC via Business Standard (PTI), 24 May 2018 |
| Delhi Police SOP for college fests prefers online registration to avoid overcrowding | Delhi High Court order of 22 Apr 2024 reproducing the SOP (via LiveLaw) |
| Karnataka crowd control bill would need police permission for events of 5,000+ | PRS Legislative Research brief, Aug 2025 (still a bill) |
| Mood Indigo 2025 stopped outsider entry after crowds at the gate | Careers360, 17 Dec 2025 |
| Rendezvous 2023 gates closed early; concerts cancelled | Careers360, 13 Mar 2023 |
| Oxfam has stewarded Glastonbury since 1993 with a refundable deposit | festivals.oxfam.org.uk |
| A DU college fest reports 10,000+ people a day | HT City, 13 Apr 2024 (Nexus '24) |
| QR scanning: about 500–600 entries an hour per phone scanner | Ticket Fairy entry-tech guide, Apr 2026 |

**Why New Delhi:** the biggest student pool on one metro network, campuses with room, and rules (online registration) that match how we count. Not Bengaluru (permission above 5,000 under the proposed bill), not Mumbai (small campuses and long commutes, our assumption). Dates avoid January fog and Republic Day security and come before March exams.

## 3. The plan model: targets, funnel and detailed calculations

Everything on slide 1 comes from `model/plan_model.py` (run `python3 model/plan_model.py`; 20,000 runs, fixed seed 2027, triangular ranges).

### 3.1 Inputs (S = sourced, A = assumption, D = decision)

| Input | Low / likely / high | Tag | Why |
|---|---|---|---|
| Channel attendees | 2025 channel attendees × (2027 spend ÷ 2025 spend)^b | S + A | 2025 cost per attendee, with diminishing returns |
| b, how well channel spend scales | 0.4 / 0.5 / 0.7 | A | Doubling spend does not double people |
| The ₹500 price | The most one more outside attendee is worth to us: under 2025's ₹550–670 for the last ad attendee | D (anchored on S) | A price the fest has already paid, not derived from our own plan |
| 2027 channel spend | Paid Social ₹28k, Creators ₹12k, College Partnerships ₹1.1L | D | Near the spend 2025 tested; their next attendee costs about ₹300 here. Beyond it the curve is a guess |
| Unpaid search and word of mouth | 2025's 195 × 0.9 / 1.0 / 1.2 | S + A | Keeps working |
| Competition teams that sign up for 300 slots | 150 / 250 / 300 teams × 3.0 / 3.5 / 4.0 people × 85 / 90 / 95% come | A | 2025 had no competitions, so a wide range; College Partnerships runs them (2025: 86% came) |
| Walk-ins | 4 / 6 / 8% of attendees | S (6.1%) | |
| Hostel students who come | 85 / 90 / 95% of 4,000 | A | Already on campus |
| Day scholars who come | 55 / 65 / 75% of 6,000 | A | Biggest assumption; a week-2 survey checks it |
| Campus Outreach: captains × share with 10+ friends × crew size | 430 captains (A: 6 test colleges × ~72 societies and class groups) × 12 / 20 / 28% × 10 / 12 / 14; minus the ~4 per crew who would come anyway; halved for overlap with Group Pass | A | |
| Campus Outreach: team supporters via squad links | teams × 1.0 / 2.0 / 2.5 × 90% | A | |
| Group Pass: extra attendees from group sign-ups | 320 / 632 / 880 | A | Build-up of the likely case: 45% of ~4,000 passes come in groups (1,800) × 50% who would not have registered alone × 70% show-up ≈ 630. Tested 4 vs 4 colleges |
| Group Pass: show-up lift from confirm-or-release | 0 / 2 / 5 points on the pass holders of each run | A | Untested, so small. 2025's "everyone who came had confirmed" is selection, not proof; the lift gets its own test arm |
| Volunteers | 300 / 600 / 700 sign-ups × 30 / 45 / 60% who would not come anyway × 92% × (1 + 0.3 / 0.5 / 0.8 friends each) | A | No comparison group, so heavily discounted |
| Day Scholar Turnout | 0 / 501 / 570 more of our day scholars | A | Zero if they already come |
| Alumni Homecoming | 410 / 468 / 565, only if the university approves (60%) | A | ~3,750 alumni in NCR (A: 25 years of ~150 outside-state graduates who stay) × 18% take the offer × 69% come ≈ 466 |
| Reserve | Grow at week 7: ₹50k or ₹1L to a bet only if R ÷ (extra × 80%) ≤ ₹500; 76% of sign-ups still to come. Protect at week 10: while the run's most likely (seen through a ±10% forecast error) misses 3,800, ₹50k steps on Outreach, Group Pass and College Partnerships (≤ ₹750, ≤ ₹1.5L each, 51% of sign-ups left). New money delivers 50 / 80 / 100% of the test | S (curve) + A + D | Both steps are in the model |

### 3.2 Results

| Part (average of runs) | Outside attendees |
|---|---|
| Floor: no bet works (channels 1,014 + unpaid 202 + teams 736, plus walk-ins) | **2,076** |
| + Campus Outreach | +776 |
| + Group Pass (incl. show-up lift) | +764 |
| + Volunteer Corps | +360 |
| + Alumni Homecoming | +308 |
| **Average without reserve** | **4,285** |
| + Reserve (grow + protect) | +608 |
| Average with reserve | 4,893 |

| Percentile | Outside, no reserve | Outside, with reserve | All attendees, no reserve | All, with reserve |
|---|---|---|---|---|
| Bad luck (10th) | **3,783 → base 3,800** | 4,291 | **11,528 → 11,500** | 12,055 |
| Most likely (50th) | 4,303 | 4,901 | 12,152 | 12,753 |
| Good luck (90th) | 4,751 | **5,476 → stretch 5,400** | 12,744 | **13,438 → 13,400** |

89% of runs reach 3,800 without any reserve, 99.6% with it; 14% reach the 5,400 stretch. Grow releases money in almost every run (₹2.2L on average, at most ₹3L); protect is needed in about 1% of runs. Reserve used: ₹2.2L on average, ₹2.5L at P90, ₹4.5L at most. What is not used goes back: it could not buy an attendee for ₹500 or less.

### 3.3 The funnel, from reach to attendees (outside people)

| Step | 2025 actual | 2027 base | Calculation (2027) |
|---|---|---|---|
| Reach | 6.7 lakh reported reach (summed over days, so not unique people), 10.3 lakh impressions, 32,070 clicks | ~35,000 named people: students on the lists of the 33 colleges we work with (~30,000) and alumni in NCR (~3,750), plus ads | A: list sizes from the bet designs |
| Responded (did something back; walk-ins excluded) | 3,500 | ~6,000 (target 6,100) | 4,811 registrations ÷ 80% |
| Registered | 2,800 (80% of responded) | ~4,811 = 3,936 passes + ~875 team members (targets round up to 4,000 passes) | Passes: (3,800 × 0.94 − 875 × 90%) ÷ 70.75% = 3,936 |
| Registered people who came | 1,925 (68.75%) | ~3,570 | 3,936 × 70.75% + 875 × 90% |
| Walk-ins | 125 (6.1%) | ~230 | 6% of attendees |
| **Outside attendees** | **2,050** | **3,800** | ÷ 0.94 |

Pass holders keep 2025's rates (80% of responders register, 68.75% come) plus the small show-up lift (2 points). Stretch: 5,700 pass registrations = (5,400 × 0.94 − 945) ÷ 72%, where 945 = 300 teams × 3.5 people × 90% who come (the stretch assumes every slot fills). This funnel is back-solved from the base; the model above is what sets the base.

### 3.4 Money, cost and capacity

- **Cost per outside attendee:** base ₹4.0L committed to outside campaigns (₹4.7L minus the ₹70k day-scholar bet) ÷ 3,800 = ₹105 (2025: ₹134). If the whole ₹10L were spent: ₹263.
- **Top-up price** (the grow step): R ÷ [extra at plan × (((P + R) ÷ P)^scale − 1) × share of sign-ups still to come × 80% yield]. At the week-7 review, if a bet tests like the plan: Group Pass ₹300 (₹50k) / ₹326 (₹1L); Campus Outreach ₹318 / ₹356, both under ₹500. Volunteers, Day Scholars and Alumni: ₹801–1,419, so they never grow.
- **Channels at plan:** the next attendee costs ₹300 on Paid Social (₹28k), ₹304 on Creators (₹12k) and ₹303 on College Partnerships (₹1.1L). In 2025 ads cost ₹274–337 per attendee on average, so their next attendee at 2025 spend cost about twice that.
- **Gate limit:** 6 lanes × 420 scans an hour = 2,520 an hour. A day holds 2,520 ÷ busiest-hour share; unique people = day capacity × 2 days ÷ 1.35 days each, plus 3,600 hostel students who never queue. With 2025's 28% busiest hour: **16,900**. With entry windows (20%): **22,200**. The stretch (13,100) uses 78% of the 2025-style limit. The concert lawn holds about 8,000 at once (A), so the concert is the binding space, not the gates.
- **What moves the base most:** day scholars' attendance (55–75%, ±600 people), competition teams (150–300 teams, ±400), whether the two group bets work (if both fail, outside falls to about 2,700), and channel diminishing returns.

## 4. The five bets and how we ranked them

**Gates (all must pass):** safe and legal · fits gate capacity · live by week 9 · measurable (a comparison group, or a direct count with a stated discount).
**Score:** extra attendees in the bad case (10th percentile) per ₹1,000. A bet that may not launch counts as zero in its bad case.

| Rank | Bet | Risk | Budget | Extra outside people (bad / likely / good) | ₹ per extra (average) | Bad case per ₹1k | Test |
|---|---|---|---|---|---|---|---|
| 1 | Campus Outreach: ambassadors build crews of 10+ friends; team squad links; perks, not cash, paid on verified check-ins | Low | ₹60k | 596 / 728 / 863 | ₹82 | 9.9 | 6 test vs 6 matched colleges |
| 2 | Group Pass: one link registers 4–10 friends; confirm 48 h before or the pass goes to the waitlist | Low | ₹70k | 546 / 722 / 885 | ₹97 | 7.8 | 4 vs 4 colleges; confirm-or-release has its own arm |
| 3 | Volunteer Corps: two shifts for a capped concert pass and meals; ₹299 deposit back as food credit | Medium | ₹60k | 243 / 337 / 437 | ₹177 | 4.1 | Count only; 45% counted as new |
| 4 | Day Scholar Turnout: late shuttle and metro-timed schedule (our own students) | Medium | ₹70k | 168 / 379 / 507 | ₹196 | 2.4 | Far commuters offered vs not |
| 5 | Alumni Homecoming: ₹299 pass back as food credit, reunions; needs university approval | High | ₹60k | 0 / 449 / 514 | ₹207 | 0.0 | Alumni split at random |

**Double down:** Campus Outreach and Group Pass, the only bets whose top-up comes in under ₹500 (if they test like the plan, ₹318 and ₹300 per extra attendee). They also lead the protect steps.
**Rejected:** more ads and creators (2025: ₹274–337 per attendee on average, 50% came; at 2025 spend their next attendee cost ₹550–670, above our ₹500, so they shrink to ₹40k) · buses from far areas (~₹550 per extra person, assumption) · college pavilions (no signal before week 12) · deposits for everyone (a fee on a free fest kills sign-ups) · fan-voted headliner (cannot be undone).
**Overlap:** crews and group passes reach the same friends, so crews count at half. Both rest on "people come in groups", so they are tested first.
**Dependencies:** 300 team slots and prizes by week 2 (prizes come from the fest's sponsorship budget, not marketing); alumni approval by week 6 (university); vendors accept food credit by week 8.

## 5. Signals, thresholds and the money rule

**One rule, in this order, for every bet** (the Bets page and the analyst apply exactly this):

1. **Too early** if under 300 people on a side, under 2 weeks of sign-ups, or under 50 sign-ups in the test group.
2. **Stop** if the gap is not 80%+ likely to be real, or is under 2 points. Its unspent money is not spent elsewhere (nothing beats the limit that late). "Likely to be real" compares college with college (Welch t-test) when each side has 3+ colleges; otherwise person with person.
3. **Change** (fix how it works; no more money) if its own budget ÷ extra attendees projected to the fest is above ₹500, **or** it is on course for under 60% of the extra attendees the plan counts on.
4. **Scale** only at a money review (weeks 7, 10, 12), if a ₹50k top-up buys extra attendees at ≤ ₹500 each after the 80% yield (₹1L if that also passes and the gap is High, 90%+).
5. Otherwise **Keep**.

**The reserve, two steps:**
- **Grow:** Scale bets get their top-up (above).
- **Protect** (weeks 10 and 12 only): while the **most likely** outcome misses the target, take ₹50k steps on every working campaign (proven bets marked Scale or Keep, and channels not marked Change or Stop), cheapest first, one at a time, each priced the same way, at most ₹1.5L more per campaign (what one owner can put to work in five weeks) and at most ₹750 per extra attendee (1.5× the price). Each step stands on its own: unspent money buys no attendees. Why not week 7: with 24% of sign-ups in, the forecast is too noisy to spend insurance on.
- Buses (~₹550) and more ads are rejected for growth (over ₹500); buses are not in the protect steps because they need contracts by week 6.
- What is left after week 12, and the money of a stopped bet, goes back: nothing buys an attendee for ₹500 that late.

**Why the first review is week 7:** money added late can only move sign-ups still to come. By 2025's curve 76% of sign-ups are still ahead at week 7, 51% at week 10 and about 30% at week 12. Campus Outreach and Group Pass can be read at week 7; Volunteers, Alumni and Day Scholars start later (weeks 6 and 9) and are read at weeks 10 and 12.

| Bet | Early signal (by when) | Scale | Change | Stop |
|---|---|---|---|---|
| Campus Outreach | Sign-up gap vs comparison colleges (wk 7); crew captains (wk 10) | Top-up ≤ ₹500 each | Over ₹500 or under 60% of plan → cut merch, focus on top colleges | No real gap, or under 200 captains by wk 10 |
| Group Pass | Sign-up gap (wk 7); share of passes in groups (wk 10) | Top-up ≤ ₹500 each | Under 60% of plan, or under 25% in groups → group food discount | No real gap after a fair test |
| Volunteer Corps | Sign-ups and deposits (wk 10) | Never | Over ₹500 or under 60% of plan → one tee, meals on shift days only | Under 300 sign-ups by wk 10 |
| Day Scholar Turnout | Survey (wk 2); "I'm coming" gap (wk 10) | Never | Under 10% cite late travel → drop the bus | No real gap after a fair test |
| Alumni Homecoming | Approval (wk 6); waitlist (wk 9); sign-up gap (wk 10) | Never | Under 60% of plan → reunions by batch with a named host | No approval, or under 200 waitlisted |

**Whole-fest signals:** pass sign-ups vs 2025's curve (24% by week 7, 49% by week 10, 95% by week 14); the forecast verdict; guardrails: busiest hour ≤ 2,500 entries, opt-outs under 15%, walk-ins over 15% → help desk to the gate.

## 6. Data: what is sourced and what is simulated

| Dataset (picker at the top) | Source | Use |
|---|---|---|
| **2027 plan (simulated)**, the default | Simulated by us (`scripts/gen27.py`, fixed seed), in the same tables and columns as the 2025 file | Shows the system running the plan: forecasts, reviews, money decisions, fest days |
| **2025 actual** | The provided dataset. Never changed; your edits are saved on top and can be switched off | Ground truth and "changed data" testing |

**"Today" is the end of week 10 (Sun 24 Jan 2027),** the second of three money reviews. Dates after it are a **rehearsal**, labelled on every screen. Money and status changes can only be made at today; later dates follow the plan's own decisions (`data27/plan_decisions.json`).

**The rehearsal is not built to agree with the plan.** Its simulated "truth" differs from the plan in both directions:
- **Bets come in weaker:** a bad-luck year. On their own budgets they deliver about 70% of the plan (Campus Outreach 716 of 730, Group Pass 523 of 720, Volunteers 120 of 340, Alumni 203 of 450; Day Scholars 0).
- **Channels land at the top of the plan's range:** the floor (everything except the bets' extra attendees) ends at 2,212 against the model's 1,910 / 2,076 / 2,233. `scripts/t27.js` checks it stays inside that range.
- **Sign-ups arrive later** than 2025's curve (46.5% by week 10 instead of 49%), walk-ins are 5.5% instead of 6%, our own students come at 88% / 63% instead of 90% / 65%, and 240 teams sign up (the plan's likely is 250).
- Reserve money would open new colleges that exist in the data from the start at a ~4% baseline; a release adds only the bet's lift there, below its test's gap.

`scripts/settle27.js` makes the plan's releases follow the money rule at each review.

**How the rehearsal goes:**
- **Week 7:** Off track (most likely 3,050). Grow: ₹1L to Campus Outreach (₹403 per extra attendee) and ₹1L to Group Pass (₹490), both under ₹500.
- **Week 10 (today):** just under target (3,440 / 3,730 / 4,090 vs 3,800). Protect looks: the cheapest next step now costs over ₹1,000 per extra attendee (above the ₹750 ceiling), so no money moves.
  - Instead: Paid Social is cut (opt-outs above 15%); Volunteer Corps must cut costs (₹522 per extra attendee); Alumni must fix its offer (on course for 245 of 450).
- **Week 12:** Day Scholar Turnout stopped (no real gap). "Ahead, not safe yet"; still no step under ₹750, so ₹3.3L of reserve is held.
- **Result:** **4,030 outside attendees**, 6% above the 3,800 base (stretch 5,400 missed), inside the week-10 range; 7,200 of our own students; ₹6.2L spent; ₹3.8L goes back.
  - The week-7 money bought 283 extra attendees: Campus Outreach +158 (₹633 each), Group Pass +125 (₹800 each). Both above the ₹500 promise: new colleges did worse than the test colleges, which the dashboard flags. Without that money the fest would have ended near 3,750, just under base.
  - Lesson: the 80% yield we assumed was too kind for these bets; a lower yield (the Data page can change it) would have priced the top-ups at ₹600+ and kept the money.

## 7. The Growth Center: a five-minute tour

| Screen | What it answers |
|---|---|
| **Overview** | The verdict on outside attendees (bad luck / most likely / good luck), all attendees with our students next to it, registrations (pass holders + team members) vs plan, spend; a "Watch now" line; the scorecard (target vs actual for every funnel step); the campaign table; this week in three lines |
| **Journey** | The 15-week plan, the three checkpoints (week 10 review, fest eve check, result), the forecast over time, what has been decided |
| **Funnel** | Responded → registered → confirmed → attended, with % of the step before, cost each, targets and 2025 at the same point |
| **Campaigns** | Spend, registrations, expected attendees by the fest, cost per attendee vs ₹500, verdict. Click to edit owner, budget or status |
| **Bets** | Test vs comparison, how sure, extra attendees (projected to the fest), cost per extra, ₹50k top-up cost vs limit, decision; the reserve release with its effect on the forecast |
| **Insights** | Working / not working / watch, each with one reason and its number; "Act on this" drafts the action |
| **Money** | Budget today, money in vs people out, who got the reserve and why |
| **Tasks** | Editable tasks (owner, due, status) and the decision log with before / now numbers |
| **Data** | What each dataset is, assumptions with evidence, edit history, change records for testing, the analyst test set |

**Insight → action workflow to try (2027, week 10):**
1. Overview: "Off track", most likely 3,510 vs 3,800. Watch now says why: pass sign-ups behind plan and two bets behind theirs.
2. Journey → week 10 review card: just under target, but no step costs under ₹750, so no money moves; cut Paid Social (opt-outs); fix Volunteer Corps (over ₹500) and Alumni (behind plan).
3. Ask the analyst *"Should we release reserve money now?"* or *"What happens if we release ₹1L to Group Pass?"*. It answers with the price per extra attendee and the forecast effect, and follows the rule.
4. Data → **Change the constraints**: set the limit to ₹700 and watch the protect step start buying attendees at week 10; the analyst uses the new limit too.
5. Ask it to *"Pause Volunteer Corps"*: it opens the confirm panel. On confirm, the status changes, the forecast moves, a task goes to the owner, and the decision is logged with a review date. A release against the rule needs a written reason.
6. Change a campaign's budget or status yourself (Campaigns → click a row): the forecast and every screen update at once.

## 8. How the numbers are calculated

**Counting rules** (every screen and the analyst):
- Outside people only. Internal, staff and test people, and our own students, are excluded from outside totals.
- People are counted once by ID. Exact repeated IDs are removed (2025: 2 spend rows, 4 status rows, 20 check-ins).
- Status = the latest version on or before the date. Nothing after the date is used, by screens or the analyst.
- An attendee = an admitted **and** verified check-in. Spend is net of credits.
- Campaign credit is a link, not proof of cause. Bets prove cause with a comparison group.
- Estimates are marked **est.**; everything else is counted from records.

**Key formulas:**
- **Expected attendees (est.)** = confirmed × 75% + unconfirmed × 55% (falling to 5% on fest eve) + waitlisted × 20%, then ÷ (1 − 6% walk-ins). 2025: 73–77% of confirmed people came; 54–66% of people unconfirmed weeks out still came; 0 of 29 unconfirmed on fest eve came.
- **Forecast (est.)** = final registrations × chance each comes, + walk-ins. Final registrations = team members already in + pass registrations ÷ the share expected by now on 2025's curve (2025, with no curve: last 7 days' rate for the days left). Played 1,000 times with every input drawn from its range; **bad luck** = 1 in 10 runs did worse; **good luck** = 1 in 10 did better.
- **Verdict:** Safe = even bad luck beats the target · Ahead, not safe yet = most likely beats it, bad luck doesn't · Off track = most likely misses it.
- **Extra attendees (bets)** = people in test colleges × (test sign-up rate − comparison rate) × chance each comes. **Projected to the fest** = today's ÷ share of the bet's sign-up window passed.
- **Cost per extra** = the bet's own budget ÷ extra attendees projected to the fest (reserve money and the colleges it funded are judged apart).
- **Top-up price** = R ÷ [projected × (((P + R) ÷ P)^scale − 1) × share of sign-ups still to come × 80% yield].
- **Protect step:** the cheapest next ₹50k step among working campaigns (proven bets and channels), priced the same way, taken one at a time while most likely < target, the step costs ≤ ₹750 and the campaign has had ≤ ₹1.5L more.
- **Your decisions** (releases, budget changes, pauses) are dated and change the forecast from that date by the same top-up maths, until the data catches up.

## 9. The AI Growth Analyst

- **Grounded:** it has no data of its own. It calls the app's functions (the same engine as the screens): overview, forecast (with "what if we move money"), campaigns, bets, funnel, trends, what changed between dates, signals, a budget what-if, a safe query tool for unfamiliar questions (outside people only), and an exact calculator.
- **No future data:** tools never read past the selected date, so at week 10 it does not know how the fest ends.
- **Honest:** it says "not in the data" for things the data cannot answer (weather, revenue, competitors, sentiment), marks estimates, and flags groups under 30 people.
- **Connected to execution:** it can only propose actions (release reserve, pause, move budget, create a task). The user confirms in the same panel the screens use.
- **Changed data:** it reads the dataset, date and edits currently selected; its plan rules (targets, limits, reserve) are built from the data in view.
- **Model:** on the hosted site, Google Gemini (free tier) with Groq (free tier) as automatic backup, through `api/chat.js`. Keys stay on the server; the browser runs the data tools. `/api/health?check=1` tests both.

## 10. Testing

- `node scripts/test.js`: the engine reproduces an independent Python calculation of the 2025 numbers at four dates (2,050 visitors, 2,800 registered, ₹2,74,000, cost per visitor by campaign), plus edits and the calculator.
- `node scripts/t27.js`: rules that must hold for any data (the zero-range forecast equals the plain formula; same date, same answer; no data after the date; reserve never negative; the Bets page, the what-if and the forecast price money the same way; a pause lowers the forecast; your decisions never leak into rehearsal dates; the query tool counts the same people as the screens), then the rehearsal story.
- Headless Chrome (Playwright) at 1,400 px and 390 px: every page, no console errors.
- **Analyst:** Data → *Test the analyst* runs fixed questions (data, forecast, decision, calculation, diagnosis, a two-turn follow-up, "not in the data") whose expected answers are computed live by the engine. The demo video shows recorded live answers (see the top of this file).
- **Independent reviews:** separate reviewer agents graded the product and the slides against the brief; their findings drove the money-rule, rehearsal and analyst fixes.

## 11. Setup

1. Get a free key at https://aistudio.google.com (Get API key). Optional backup: a free key at https://console.groq.com.
2. Import this repo in Vercel (https://vercel.com/new) with default settings.
3. Project → Settings → Environment Variables: `GEMINI_API_KEY` (and `GROQ_API_KEY`). Optional: `GEMINI_MODEL` / `GROQ_MODEL`.
4. Deploy, open the link, press **Ask the analyst**.

Local: `npx vercel dev`. Regenerate the 2027 data: `node scripts/settle27.js`. Plan model: `python3 model/plan_model.py`.

## 12. Tools used, and what was reused, changed and checked

- Plain HTML, CSS and JavaScript (no framework); hand-drawn SVG charts. No templates reused.
- Vercel Hobby (free) for hosting and the two serverless functions; Google Gemini API and Groq API (free tiers).
- Claude (Anthropic, Pro plan; Claude Code and Claude in the web app) for analysis, modelling, code, testing and the independent reviews. I directed the strategy and decisions; Claude wrote the code.
- Python (standard library, pandas for the reference check) and Node for the model, simulation and checks; Playwright for UI tests and the demo video.
- Slides: HTML rendered to PDF with Chrome; Geist and Geist Mono fonts (SIL Open Font License).
- **Checked:** every 2025 number against an independent Python calculation; outside facts by opening each source (one claim, a Chess.com reward threshold, could not be sourced and was dropped).

## 13. Known limitations

- **2027 numbers are simulated.** They show the plan and the system working, not real results. The rehearsal is one run; a different run would give different numbers.
- **Our own students (~7,700) are an assumption.** 2025 has no data on them; a week-2 survey is the first check. That is why the verdict is on outside attendees.
- **Bet effects are planning estimates** until the tests read out; the ranges are our assumptions, listed in section 3.1.
- **The ₹500 price and the ₹750 protect ceiling are judgments.** ₹500 sits under what 2025 paid for its last ad attendees (₹550–670). At ₹300 the plan held back most of the reserve and the rehearsal missed the base by 44; at ₹500 it reaches it, but the week-7 top-ups came in at ₹633–800, above the promise. The limit is a dial, not a fact: change it on the Data page and every screen and the analyst follow.
- **Tests compare a few colleges.** With 6 vs 6 or 4 vs 4 colleges, real differences between colleges can remain. The college-level test is conservative, but five bets across three reviews still risk a false positive.
- **Signals not in the data:** crew captains, share of passes in groups, survey answers and deposits are in the plan but not tracked in the simulated tables.
- **Saving:** on the hosted site, edits and tasks are saved in the reviewer's browser (they survive a reload but are not shared). The Claude version shares them between signed-in viewers.
- **Free AI tier:** request limits per day, and a busy model can slow an answer; the app retries with the backup model.
- **2025 has no pace plan,** so its forecast extends the last 7 days of sign-ups and under-called 2025's late surge.
