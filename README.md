# CampusFest Growth Center

The command center for **Challenge A: Attendee Growth**: a dashboard, a campaign and task manager, and an AI Growth Analyst. Everything works on the provided 2025 data and on our 2027 plan.

- **Live app:** _add your Vercel link here_
- **Backup (inside Claude):** https://claude.ai/artifact/KXbRrm2dBVD9GWzMAm2cST

---

## 1. Five-minute tour

| Screen | What it answers |
|---|---|
| **Overview** | The numbers only. A status line (Safe / Ahead, not safe yet / Off track), a 3-line card for the selected week (what's happening · what the numbers say · the assumption behind it), a scorecard of targets vs actuals (reached → teams → registrations → confirmed → attendees, spend, cost per attendee) with where we're heading and 2025 at the same point, the top 3 things that need attention, and a campaign scorecard. |
| **Journey** | Where we are in the plan: the 15-week strip with the three checkpoints (**week 10 review**, **fest eve check**, **result**), what happens each week, how the forecast changed week by week, and what has been decided. |
| **Funnel** | The same 4 steps every year: reached → registered → confirmed → attended, with % of the step before, cost each, targets and 2025 at the same point. Plus gate capacity and registrations vs the plan. |
| **Campaigns** | What each campaign spent and got, and a verdict: Scale / Keep / Change / Stop. Click a row to edit. |
| **Bets** | Money on bets in one line (planned, spent, reserve left), then for each of our 5 bets: spent / planned, test vs comparison, "Is the gap real?" (High / Medium / Low), extra attendees with a range, next extra attendee vs limit, decision. Release reserve money here, with its effect on the forecast. |
| **Insights** | What is working, what is not, and why. Each item has a one-line reason with its number; "Why?" opens what we saw, why it matters, what we suggest and what happens if we do nothing. |
| **Money** | The budget today (spent, planned, reserve), money in vs people out per campaign, and who got the reserve and why. |
| **Tasks** | A simple table: edit title, owner, due date and status in place. Below it, the decision log with then / now numbers. |
| **Data** | What each dataset is, the assumptions with their 2025 evidence, the words, edit history, change records for testing, and the analyst test set. |
| **Understand this page** | On every page: five questions people ask about that page, answered with the live numbers. Every non-obvious number also has an ⓘ. |
| **Ask the analyst** | Questions in plain English, answered from the app's own data. It can test "what if we release ₹1L to Group Pass?" and set up actions for you to confirm. |

**The insight → action workflow to try (2027, week 10):**
1. **Overview** opens at week 10: *Ahead, not safe yet*, most likely 5,000 outside attendees vs a 4,800 target; bad luck (4,640) is below it.
2. On **Journey**, the week 10 review card lists what the data says to decide: release ₹1L each to Group Pass and Campus Outreach, fix Volunteer Corps and Paid Social, keep testing Day Scholars. It shows the effect: releasing ₹2L moves the forecast to *Safe*.
3. Click **Release** on Group Pass. The panel shows exactly what will change, including the forecast before → after. Nothing changes until you confirm.
4. Confirm. The bet's budget rises, reserve left drops to ₹3.5L, a task goes to the owner with a review date, the decision is logged, and the Overview verdict updates.
5. Or ask the analyst *"What happens if we release ₹1L to Group Pass?"*, then *"Do it"*. It opens the same panel.
6. Follow-up: move **As of** forward past the review date (week 12). The decision log compares the watched number then and now.

## 2. Data: what is sourced and what is simulated

| Dataset (picker at the top) | Source | Use |
|---|---|---|
| **2027 plan (simulated)**, the default | **Simulated by us**: our 2027 plan in New Delhi, all 15 weeks and both fest days, in the same tables and columns as the 2025 file. | Shows the system running the plan: forecasts, reviews, money decisions, fest-day checks. |
| **2025 actual** | **Provided dataset** (CampusFest 2025). The original is never changed; your changes are saved as edits on top, and a button switches between "original" and "with your edits". | Ground truth and "changed data" testing for the dashboard and the analyst. |

**2027 timeline (from the plan):** week 1 starts Mon 16 Nov 2026 (hire ambassadors) · competition registrations open in week 2 (teams need time to prepare) · pass registrations open Mon 30 Nov (week 3), 82 days before the fest, the same as 2025 · week 8 (4 Jan) is the big push: line-up, Group Pass, Welcome Back · money reviews at weeks 10, 12 and 14 · fest Fri–Sat 26–27 Feb 2027 (week 15).

**Pace plan = 2025's real sign-up curve.** Because we open at the same distance from the fest as 2025, the share of final sign-ups expected by each week is taken from 2025 (for example 34% by week 8, 49% by week 10, 95% by week 14), not assumed. Competition teams are paced on their own: 150 by week 6, 250 by week 8, 300 by week 10.

**From our plan:** campaigns and bets, owners, planned budgets (₹5.5L working + ₹4.5L reserve; campus ambassadors get perks such as a certificate and letter, a free pass and a backstage meet, not cash, which freed ₹0.6L; paid ads start at ₹0.8L), cost limits, how well each bet scales, test designs, targets (outside attendees 4,800 base / 9,000 stretch; registrations 5,760 / 10,400) and the registration pace curve.
**Generated** (`scripts/gen27.py`, fixed seed): people, registrations, status changes, interactions, daily spend and check-ins. Not real records; every 2027 screen says so.

**Why "today" is week 10.** It is the plan's first money review: about half of all sign-ups are in and the bets have run for weeks, enough to judge them. The dashboard opens there on purpose, to show the decision with only what was known that day. Dates after it are a **rehearsal**: one realistic run where the team takes the plan's decisions on time (`data27/plan_decisions.json`). It is not the best case: Day Scholar Turnout fails its test and is stopped at week 12, scaled bets do worse than their tests, no bet passes the money rule at weeks 12 and 14, so ₹2.5L of reserve stays unspent. Every later date shows a "Rehearsal" banner.

**How the rehearsal ends:** 6,114 outside attendees vs the 4,800 target (2025: 2,050), inside the fest-eve forecast of 5,750–6,230. At week 10 the forecast if nothing changed was 4,640–5,340 (most likely 5,000); releasing ₹2L moved it to 5,600–6,390.

## 3. How the numbers are calculated

**Counting rules** (same for every screen and for the analyst):
- Outside (external) people only. Internal, staff and test people are excluded.
- People are counted once by ID, not by rows. Exact repeated IDs are removed (2025: 2 spend rows, 4 status rows, 20 check-in rows).
- Status = the latest status version on or before the selected date. Nothing after that date is used.
- A visitor = an admitted **and** verified check-in. Show-up = registered visitors ÷ registered.
- Spend is net of credits. Reach is never added across days.
- Campaign credit = registration source (a link, not proof of cause).
- Estimates that use assumptions are marked **est.**; every other number is counted from the records.

**Key formulas:**
- **Expected attendees (est.)** = confirmed × 75% + unconfirmed × 55% (falling to 5% on fest eve) + waitlisted × 20%, plus a 6% walk-in share. Evidence from 2025: 73–77% of confirmed people came; 54–66% of people unconfirmed weeks out still came; 0 of 29 unconfirmed on fest eve came.
- **Forecast (est.)** = final registrations × the chance each comes, by status, + walk-ins. Final registrations = competitors already in + pass registrations so far ÷ share expected by now on 2025's curve (2025, with no curve: last 7 days' rate for the days left). The fest is played **1,000 times**, each input drawn from its range (Data page). **Bad luck** = only 1 in 10 runs did worse; **good luck** = only 1 in 10 did better. Fixed seed, so the same date gives the same numbers.
- **Verdict:** Safe = even bad luck beats the target · Ahead, not safe yet = most likely beats it, bad luck doesn't · Off track = most likely misses it.
- **Effect of moving money (est.):** each released rupee buys extra attendees at the bet's next extra attendee cost, delivering 50–100% of it (most likely 80%).
- **Pace levels:** at or above stretch pace = fine · above base = Watch · up to 15% below base = Warn · more = Act.
- **Extra registrations (bets)** = people in test colleges × (test registration rate − comparison rate).
- **Expected extra attendees (A)** = extra registrations × show-up by status of the test group.
- **Is the gap real?** = how likely the test-vs-comparison gap is above zero (two-group normal approximation), shown as High (90%+), Medium (80–90%) or Low. Words, not exact percentages, to avoid false precision.
- **Next-tranche cost (A)** = cost per extra attendee ÷ how well the bet scales (0.3–0.6 from the plan).
- **Decision:** test not fair yet (under 300 per group or under 2 weeks of registrations) → Too early · fair test but gap not 80%+ likely real → Stop · cost per extra above the limit → Change · next extra attendee also under the limit → Scale (gets reserve) · otherwise Keep.
- **Reserve:** released only at the reviews, cheapest next extra attendee first. ₹1L needs a High gap; ₹50k needs Medium. One release per bet until its next review.
- **Channel verdicts:** cost per expected (or verified) visitor vs a ₹250 cap; under half the cap with good show-up = Scale.

**Checks:** `scripts/ref.py` computes the 2025 numbers independently in Python and `scripts/test.js` confirms the app's engine matches them at four dates (for example, 2,050 verified outside visitors, 2,800 registered, ₹2,74,000 spend, cost per visitor by campaign). `scripts/t27.js` checks the forecast: with every range shut it equals the plain formula, the same date always gives the same answer, the range narrows from week 10 to fest eve, the result lands inside the fest-eve range, and no data after the selected date leaks in.

## 4. AI Growth Analyst

- **Grounded:** it has no data of its own. It calls the app's functions (the same engine as the screens): overview, the forecast (with "what if we move money"), campaigns, bets, funnel, trends, what changed between dates, signals, budget what-ifs, a safe query tool for unfamiliar questions, and an exact calculator.
- **Honest:** it is told to say "not in the data" for things the data cannot answer (weather, revenue, competitors…), to tag evidence S or A, and to flag samples under 30 people.
- **Connected to execution:** it can only *propose* actions (release reserve, pause, move budget, create a task…). The user confirms in the same panel the screens use.
- **Changed data:** it always reads the dataset and date selected at the top, including your edits.
- **Testing:** Data → *Test the analyst* runs fixed questions. The expected answers are computed live by the engine, so they move when the data changes.

**Model:** on the hosted site, Google Gemini (free tier, a current Flash model) with Groq (free tier, Llama 3.3 70B) as an automatic backup when Gemini is busy, through `api/chat.js`. Keys stay on the server and the browser runs the data tools. `/api/health?check=1` tests both. Inside Claude, it uses the viewer's own Claude account.

## 5. Setup (hosted copy)

1. Get a free API key at https://aistudio.google.com (Get API key).
2. Import this repo in Vercel (https://vercel.com/new) with the default settings.
3. In Project → Settings → Environment Variables, add `GEMINI_API_KEY` = your key. Recommended: also add `GROQ_API_KEY` (free at https://console.groq.com, no card) as an automatic backup when Gemini is busy. Optional: `GEMINI_MODEL` / `GROQ_MODEL` to pin models.
4. Deploy. Open the link, then **Ask the analyst**.

Local run: `npx vercel dev` (needs the same environment variable).

## 6. Tools used

- Plain HTML, CSS and JavaScript (no framework). Charts are hand-drawn SVG.
- Vercel (Hobby, free) for hosting and the serverless functions. Google Gemini API and Groq API (both free tiers) for the hosted analyst.
- Claude (Anthropic) for analysis, modelling, code and testing. Claude artifacts host the backup copy.
- Python (pandas) and Node for the reference checks and the simulated data. Headless Chrome (Playwright) for UI tests on desktop and phone widths.

## 7. Known limitations

- **2027 numbers are simulated.** They show the plan working, not real results.
- **Test vs comparison is an estimate, not proof.** Test colleges are picked by coin flip within matched pairs and money moves only when we are 80%+ sure, but hidden differences can remain.
- **Saving:** on the hosted site, edits and tasks save in the reviewer's own browser (they survive a reload but are not shared between people). The Claude version shares them between signed-in viewers.
- **Free AI tier:** Google limits requests per day and may use prompts to improve its products. All data here is simulated or provided, so nothing private is sent.
- **The forecast is only as good as its ranges.** They come from 2025 and the plan; if 2027 behaves differently, the ranges are off. That is why it is re-read every week and checked at each review.
- **2025 has no pace plan**, so its forecast just extends the last 7 days of sign-ups. It under-called 2025's late surge (at 33 days out it said 1,440–1,860; 2,050 came), which is why 2027 forecasts with a curve.
- **Money left unspent:** in the rehearsal ₹3.1L of the ₹10L is never spent (₹2.5L reserve plus cuts). That is the money rule working, not a gap: no bet was cheap enough for the next rupee.
- **Rehearsal tasks:** after week 10, plan tasks due before the viewed date are shown as done, because the rehearsal assumes the team works on time.
