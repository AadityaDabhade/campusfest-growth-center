# CampusFest Growth Center

**Dabhade Aaditya Kishor · 22EX23005 · IIT Kharagpur**
RISA Labs Growth APM assignment · **Challenge A: Attendee Growth** · CampusFest 2027, New Delhi

- **Live app:** https://campusfest-growth-center-sand.vercel.app (dashboard, campaign and task manager, AI analyst)
- **Code:** https://github.com/AadityaDabhade/campusfest-growth-center
- **Backup inside Claude:** https://claude.ai/artifact/KXbRrm2dBVD9GWzMAm2cST (the analyst runs on the viewer's Claude account)
- **Slides:** `CampusFest_Growth_Strategy_Dabhade_22EX23005.pdf` (3 slides)
- **Demo video:** `Growth_Center_demo.mp4` (the analyst answering real questions on the live site)

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
| **Base: what we commit to** (9 in 10 simulated runs do better, no reserve spent) | **4,500** (2.2×) | **12,000** |
| Most likely (middle run, reserve on proof) | ~5,600 | ~13,500 |
| **Stretch** (1 in 10 runs do better, reserve on proof) | **6,100** (3.0×) | **14,100** |
| Gate limit if arrivals bunch like 2025 / with entry windows | – | 16,900 / 22,200 |

- **City:** New Delhi. **Dates:** Fri–Sat 26–27 Feb 2027. **Campaign:** 15 weeks from Mon 16 Nov 2026.
- **Budget:** ₹10L marketing = ₹2.3L channels + ₹3.2L for five bets + ₹4.5L reserve, released only on proof at the money reviews (weeks 7, 10, 12).
- **The verdict is on outside attendees.** They are what marketing moves and the only part the 2025 data can check. Our own students (4,000 hostel, 6,000 day scholars) add about 7,500, but they need no registration and 2025 has no data on them, so they are an assumption shown next to the verdict, never inside it.
- **Strategy in one line:** back people who bring people (2025: people brought by a person came 75–86% of the time; people from ads 50%), test every new idea against comparison colleges, and only put more money where a top-up still buys an extra attendee for under ₹300.

## 2. Research: what we learned and from where

### 2.1 The provided 2025 data (computed by the app's engine and checked in Python)

| Measure | 2025 |
|---|---|
| Outside people who responded (did something back) | 3,625 |
| Registered | 2,800 (77% of those who responded) |
| Registered people who came | 1,925 (68.75% show-up) |
| Walk-ins (came without registering) | 125 (6.1% of attendees) |
| Unique verified outside attendees | **2,050** (57% of those who responded) |
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
| Paid channels' attendees | 2025 channel attendees × (2027 spend ÷ 2025 spend)^b | S + A | 2025 cost per attendee, with diminishing returns |
| b, how well channel spend scales | 0.4 / 0.5 / 0.7 | A | Doubling spend does not double people |
| 2027 channel spend | Paid ₹80k, Creators ₹80k, College Partnerships ₹70k | D | Ads only for the line-up reveal and reminders |
| Unpaid search | 2025's 195 × 0.9 / 1.0 / 1.2 | S + A | Keeps working |
| Competition teams | 300 teams × 3.0 / 3.5 / 4.0 people × 85 / 90 / 95% come | D + A | Core team's slots; 2025 partnerships came at 86% |
| Walk-ins | 4 / 6 / 8% of attendees | S (6.1%) | |
| Hostel students who come | 85 / 90 / 95% of 4,000 | A | Already on campus |
| Day scholars who come | 55 / 65 / 75% of 6,000 | A | Biggest assumption; a week-2 survey checks it |
| Campus Outreach: captains × share with 10+ friends × crew size | 430 × 12 / 20 / 28% × 10 / 12 / 14; minus the ~4 per crew who would come anyway; halved for overlap with Group Pass | A | |
| Campus Outreach: team supporters via squad links | 300 teams × 1.0 / 2.0 / 2.5 × 90% | A | |
| Group Pass: extra attendees from group sign-ups | 320 / 632 / 880 | A | Tested 4 vs 4 colleges |
| Group Pass: show-up lift from confirm + waitlist | 0 / 6 / 9 points on 5,850 base registrants | A | 2025: everyone who came had confirmed |
| Volunteers | 300 / 600 / 700 sign-ups × 30 / 45 / 60% who would not come anyway × 92% × (1 + 0.3 / 0.5 / 0.8 friends each) | A | No comparison group, so heavily discounted |
| Day Scholar Turnout | 0 / 501 / 570 more of our day scholars | A | Zero if they already come |
| Alumni Homecoming | 410 / 468 / 565, only if the university approves (60%) | A | |
| Reserve, week-7 review | ₹50k or ₹1L to a bet only if each extra attendee costs ≤ ₹300; 76% of sign-ups still to come; new money delivers 50 / 80 / 100% of the test | S (curve) + A | |

### 3.2 Results

| Part (average of runs) | Outside attendees |
|---|---|
| Floor: no bet works (channels 1,115 + unpaid 202 + teams 945, plus walk-ins) | **2,406** |
| + Campus Outreach | +893 |
| + Group Pass | +961 |
| + Volunteer Corps | +361 |
| + Alumni Homecoming | +311 |
| **Most likely without reserve** | **4,932** |
| + Reserve released on proof | +660 |
| Most likely with reserve | 5,592 |

| Percentile | Outside, no reserve | Outside, with reserve | All, with reserve |
|---|---|---|---|
| Bad luck (10th) | **4,462 → base 4,500** | 5,031 | 12,773 |
| Most likely (50th) | 4,954 | 5,614 | 13,461 |
| Good luck (90th) | 5,365 | **6,121 → stretch 6,100** | **14,091 → 14,100** |

All-attendee base 12,000 = 4,500 outside + 7,500 own students at the assumed rates (3,600 hostel + 3,900 day scholars), without the day-scholar bet.

### 3.3 The base funnel, step by step (outside people)

| Step | 2027 base | Calculation | 2025 |
|---|---|---|---|
| Pass registrations | 4,800 | (4,500 × 0.94 − 945 teams) ÷ 68.75% show-up | 2,800 |
| Team members registered | 1,050 | 300 × 3.5 | – |
| Responded | 7,300 | 4,800 ÷ 77.2% + 1,050 | 3,625 |
| Registered people who came | 4,245 | 4,800 × 68.75% + 1,050 × 90% | 1,925 |
| Walk-ins | 270 | 6% of attendees | 125 |
| **Outside attendees** | **4,500** | 4,245 ÷ 0.94 | **2,050** |

Pass holders keep 2025's own rates exactly (77% register, 69% come). The overall rates are higher only because teams register and come at 90%.

### 3.4 Money, cost and capacity

- **Cost per outside attendee:** base ₹5.5L committed ÷ 4,500 = ₹122 (2025: ₹134). If all ₹10L were spent: ₹222.
- **Top-up cost** (the reserve rule): ₹R ÷ (extra attendees at plan × ((plan + R) ÷ plan)^scale − 1) × share of sign-ups still to come. At the week-7 review, if a bet tests like the plan: Campus Outreach ₹221 (₹50k) / ₹248 (₹1L); Group Pass ₹191 / ₹207. Volunteers, Day Scholars and Alumni: ₹636–972, so they never get reserve.
- **One limit:** ₹300 per extra attendee for every campaign and top-up, about our most expensive 2025 channel (Paid Social, ₹274).
- **Gate limit:** 6 lanes × 420 scans an hour = 2,520 an hour. A day holds 2,520 ÷ busiest-hour share; unique people = day capacity × 2 days ÷ 1.35 days each, plus 3,600 hostel students who never queue. With 2025's 28% busiest hour: **16,900**. With entry windows (20%): **22,200**. Stretch (14,100) uses 83% of the 2025-style limit.
- **What moves the base most:** day scholars' attendance (55–75%, ±600 people), whether the two group bets work (if both fail, outside falls to about 3,200), and channel diminishing returns.

## 4. The five bets and how we ranked them

**Gates (all must pass):** safe and legal · fits gate capacity · live by week 9 · measurable (a comparison group, or a direct count with a stated discount).
**Score:** extra attendees in the bad case (10th percentile) per ₹1,000. A bet that may not launch counts as zero in its bad case.

| Rank | Bet | Risk | Budget | Extra outside people (bad / likely / good) | ₹ per extra (average) | Bad case per ₹1k | Test |
|---|---|---|---|---|---|---|---|
| 1 | Campus Outreach: ambassadors build crews of 10+ friends; team squad links; perks, not cash, paid on verified check-ins | Low | ₹60k | 698 / 844 / 972 | ₹72 | 11.6 | 6 test vs 6 matched colleges |
| 2 | Group Pass: one link registers 4–10 friends; confirm 48 h before or the pass goes to the waitlist | Low | ₹70k | 695 / 907 / 1,106 | ₹78 | 9.9 | 4 vs 4 colleges |
| 3 | Volunteer Corps: two shifts for a capped concert pass and meals; ₹299 deposit back as food credit | Medium | ₹60k | 243 / 336 / 440 | ₹177 | 4.0 | Count only; 45% counted as new |
| 4 | Day Scholar Turnout: late shuttle and metro-timed schedule (our own students) | Medium | ₹70k | 165 / 376 / 507 | ₹197 | 2.4 | Far commuters offered vs not |
| 5 | Alumni Homecoming: ₹299 pass back as food credit, reunions; needs university approval | High | ₹60k | 0 / 450 / 515 | ₹205 | 0.0 | Alumni split at random |

**Double down:** Campus Outreach and Group Pass, the only bets whose top-up can stay under ₹300.
**Rejected:** more ads and creators (2025: ₹274–337 per attendee, 50% came; kept at ₹1.6L for the line-up reveal and reminders) · buses from far areas (~₹550 per extra person, assumption) · college pavilions (no signal before week 12) · deposits for everyone (a fee on a free fest kills sign-ups) · fan-voted headliner (cannot be undone).
**Overlap:** crews and group passes reach the same friends, so crews count at half. Both rest on "people come in groups", so they are tested first.
**Dependencies:** 300 team slots and prizes by week 2 (core team); alumni approval by week 6 (university); vendors accept food credit by week 8.

## 5. Signals, thresholds and the money rule

**One rule, in this order, for every bet** (the Bets page and the analyst apply exactly this):

1. **Too early** if under 300 people on a side, under 2 weeks of sign-ups, or under 50 sign-ups in the test group.
2. **Stop** if the gap is not 80%+ likely to be real, or is under 2 points. Its money goes to College Partnerships (2025's best channel). "Likely to be real" compares college with college (Welch t-test) when each side has 3+ colleges; otherwise person with person.
3. **Change** if planned budget ÷ extra attendees projected to the fest is above ₹300.
4. **Scale** only at a money review (weeks 7, 10, 12), if a ₹50k top-up buys extra attendees under ₹300 each (₹1L if that also passes and the gap is High, 90%+).
5. Otherwise **Keep**.

**Why the first review is week 7:** money added late can only move sign-ups still to come. By 2025's curve 76% of sign-ups are still ahead at week 7, 51% at week 10 and about 30% at week 12. After that, no top-up can pay.

| Bet | Early signal (by when) | Scale | Change | Stop |
|---|---|---|---|---|
| Campus Outreach | Sign-up gap vs comparison colleges (wk 7); crew captains (wk 10) | Top-up under ₹300 each | Over ₹300 → cut merch, focus on top colleges | No real gap, or under 200 captains by wk 10 |
| Group Pass | Sign-up gap (wk 7); share of passes in groups (wk 10) | Top-up under ₹300 each | Under 25% in groups → group food discount | No real gap after a fair test |
| Volunteer Corps | Sign-ups and deposits (wk 10) | Never | Over ₹300 → one tee, meals on shift days only | Under 300 sign-ups by wk 10 |
| Day Scholar Turnout | Survey (wk 2); "I'm coming" gap (wk 10) | Never | Under 10% cite late travel → drop the bus | No real gap after a fair test |
| Alumni Homecoming | Approval (wk 6); waitlist (wk 9) | Never | Under 20% of the waitlist buy → stop paid pushes | No approval, or under 200 waitlisted |

**Whole-fest signals:** pass sign-ups vs 2025's curve (24% by week 7, 49% by week 10, 95% by week 14); the forecast verdict; guardrails: busiest hour ≤ 2,500 entries, opt-outs under 15%, walk-ins over 15% → help desk to the gate.

## 6. Data: what is sourced and what is simulated

| Dataset (picker at the top) | Source | Use |
|---|---|---|
| **2027 plan (simulated)**, the default | Simulated by us (`scripts/gen27.py`, fixed seed), in the same tables and columns as the 2025 file | Shows the system running the plan: forecasts, reviews, money decisions, fest days |
| **2025 actual** | The provided dataset. Never changed; your edits are saved on top and can be switched off | Ground truth and "changed data" testing |

**"Today" is the end of week 10 (Sun 24 Jan 2027),** the second of three money reviews. Dates after it are a **rehearsal**, labelled on every screen. Money and status changes can only be made at today; later dates follow the plan's own decisions (`data27/plan_decisions.json`).

**The rehearsal is not built to agree with the forecast.** Its simulated "truth" deliberately differs from the forecast's assumptions: sign-ups arrive later than 2025's curve (46.5% by week 10 instead of 49%), walk-ins are 5.5% instead of 6%, and our own students come at 88% / 63% instead of 90% / 65%. Reserve money opens nine farther colleges that exist in the data from the start at a ~5% baseline; a release only adds the bet's lift there, and the colleges that don't get it remain the comparison. `scripts/settle27.js` makes the plan's releases follow the money rule at each review.

**How the rehearsal goes:** week 7 forecast Off track (4,170) → the rule releases ₹50k to Campus Outreach (₹296 per extra attendee) · week 10 "Ahead, not safe yet" (most likely 4,760, bad luck 4,420) → no top-up under ₹300, so ₹4L is held; Paid Social is cut (opt-outs above 15%) · week 12 Day Scholar Turnout is stopped (no real gap) · result: **5,198 outside attendees** (target 4,500), 7,274 of our own students, ₹5.38L spent, ₹4L reserve returned. The week-10 forecast was 8% too low (the later sign-ups), and the week-7 top-up bought 142 extra attendees at ₹352 each, over the limit: the Result card flags both.

## 7. The Growth Center: a five-minute tour

| Screen | What it answers |
|---|---|
| **Overview** | The verdict on outside attendees (bad luck / most likely / good luck), all attendees with our students next to it, registrations (pass holders + team members) vs plan, spend; a "Watch now" line; the scorecard (target vs actual for every funnel step); the campaign table; this week in three lines |
| **Journey** | The 15-week plan, the three checkpoints (week 10 review, fest eve check, result), the forecast over time, what has been decided |
| **Funnel** | Responded → registered → confirmed → attended, with % of the step before, cost each, targets and 2025 at the same point |
| **Campaigns** | Spend, registrations, expected attendees by the fest, cost per attendee vs ₹300, verdict. Click to edit owner, budget or status |
| **Bets** | Test vs comparison, how sure, extra attendees (projected to the fest), cost per extra, ₹50k top-up cost vs limit, decision; the reserve release with its effect on the forecast |
| **Insights** | Working / not working / watch, each with one reason and its number; "Act on this" drafts the action |
| **Money** | Budget today, money in vs people out, who got the reserve and why |
| **Tasks** | Editable tasks (owner, due, status) and the decision log with before / now numbers |
| **Data** | What each dataset is, assumptions with evidence, edit history, change records for testing, the analyst test set |

**Insight → action workflow to try (2027, week 10):**
1. Overview: "Ahead, not safe yet". Watch now says why.
2. Journey → week 10 review card: hold the reserve (cheapest top-up ₹616 per extra attendee, because only 51% of sign-ups are left); cut Paid Social (opt-outs); fix Volunteer Corps (over ₹300).
3. Press **Act** on Paid Social, or ask the analyst *"Should we release ₹1L to Group Pass?"* It answers with the cost per extra attendee (₹806) and the forecast effect, and advises against it.
4. Say *"Do it anyway"*: it opens the confirm panel. A release against the rule needs a written reason. On confirm: budget and reserve change, the forecast moves, a task goes to the owner, the decision is logged with a review date.
5. Change a campaign's status (pause Paid Social): the forecast drops at once.

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
- **Cost per extra** = planned budget ÷ extra attendees projected to the fest.
- **Top-up cost** = R ÷ (projected × ((P + R) ÷ P)^scale − projected) × share of sign-ups still to come.
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
- **Analyst:** Data → *Test the analyst* runs fixed questions whose expected answers are computed live by the engine. The demo video shows a live session (data question, calculation, follow-up, what-if, refusal, action with confirmation).
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
- **Our own students (7,500) are an assumption.** 2025 has no data on them; a week-2 survey is the first check. That is why the verdict is on outside attendees.
- **Bet effects are planning estimates** until the tests read out; the ranges are our assumptions, listed in section 3.1.
- **Tests compare a few colleges.** With 6 vs 6 or 4 vs 4 colleges, real differences between colleges can remain. The college-level test is conservative, but five bets across three reviews still risk a false positive.
- **Signals not in the data:** crew captains, share of passes in groups, survey answers and deposits are in the plan but not tracked in the simulated tables.
- **Saving:** on the hosted site, edits and tasks are saved in the reviewer's browser (they survive a reload but are not shared). The Claude version shares them between signed-in viewers.
- **Free AI tier:** request limits per day, and a busy model can slow an answer; the app retries with the backup model.
- **2025 has no pace plan,** so its forecast extends the last 7 days of sign-ups and under-called 2025's late surge.
