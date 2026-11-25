# CampusFest Growth Center

The command center for **Challenge A: Attendee Growth**: a dashboard, a campaign and task manager, and an AI Growth Analyst. Everything works on the provided 2025 data and on our 2027 plan.

- **Live app:** _add your Vercel link here_
- **Backup (inside Claude):** https://claude.ai/artifact/KXbRrm2dBVD9GWzMAm2cST

---

## 1. Five-minute tour

| Screen | What it answers |
|---|---|
| **Overview** | Are we on track this week? The 4 numbers that matter, registrations vs plan pace, top 3 issues. |
| **Funnel** | Where people drop: identified → started form → registered → confirmed → came. |
| **Campaigns** | What each campaign spent and got, and a verdict: Scale / Keep / Change / Stop. Click a row to edit. |
| **Bets** | For each of our 5 bets: test vs comparison, extra attendees, next-tranche cost vs cap, decision. Release reserve money from here. |
| **Signals** | Every Watch / Warn / Act flag with evidence, owner and a suggested action. |
| **Tasks** | Board of tasks with owners and due dates, plus the decision log with a before/after follow-up. |
| **Data** | What each dataset is, what the words mean, import a workbook, undo edits, change assumptions and thresholds, test the analyst. |
| **Ask the analyst** | Questions in plain English, answered from the app's own data. It can set up actions for you to confirm. |

**The insight → action workflow to try:**
1. Open **Bets**. Group Pass and Campus Outreach are cleared for reserve money.
2. Click **Release ₹1L** on Group Pass. A panel shows exactly what will change; nothing changes until you confirm.
3. Confirm. The bet's planned budget rises, reserve left drops to ₹2.5L, a task goes to the owner with a review date, and the decision is logged with today's "expected extra attendees".
4. Or ask the analyst *"Which bet should get reserve money first?"*, then *"Do it"*. It opens the same confirmation panel.
5. Follow-up: on **Tasks**, a decision becomes reviewable once the date passes its review date. To see one now: set **As of** to Week 8, act on a signal with a review date in week 10, switch back to Week 10, press **Review result**.

## 2. Data: what is sourced and what is simulated

| Dataset (picker at the top) | Source | Use |
|---|---|---|
| **2027 plan (simulated)**, the default | **Simulated by us**: our 2027 plan running in New Delhi, stopped at week 10 of 15 (14 Mar 2027). Same tables and columns as the 2025 file. | Shows how the team would run the plan and make the week-10 money decisions. |
| **2025 actual** | **Provided dataset** (CampusFest 2025). The original is never changed; your changes are saved as edits on top, and a button switches between "original" and "with your edits". | Ground truth and "changed data" testing for the dashboard and the analyst. |
| **Imported file** | Any workbook with the same sheets | Testing on new data (kept for the visit only). |

**In the 2027 data, from our plan:** campaigns and bets, owners, planned budgets (₹6.5L working + ₹3.5L reserve), cost caps, how well each bet scales, test designs, targets (base 5,760 registrations / ~4,800 outside attendees; stretch ~10,400 / ~9,000) and the registration pace curve.
**Generated** (`scripts/gen27.py`, fixed seed): people, registrations, status changes, interactions and daily spend. These are not real records; every 2027 screen is labelled *simulated data*.

The simulation is set to tell our plan's week-10 story: Outreach and Group Pass work and earn reserve money, Alumni works but its next rupee is above cap, Day Scholars is too early to judge, Volunteers and Paid Social cost too much.

**Why week 10?** A live tool only has data up to today. We stop the simulation at week 10 because that's the plan's first money decision: stop rules fire and the first reserve release happens. You can step back through weeks 1–10 with **As of**; weeks 11–15 haven't happened yet.

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
- **Expected visitors (A)** = confirmed × 0.75 + interested × 0.40 + waitlisted × 0.25, plus a 6% walk-in share. Assumptions are editable in Data.
- **2027 forecast (A)** = registrations so far ÷ share expected by this week on the pace curve, × show-up by status, + walk-ins.
- **Pace levels:** at or above stretch pace = fine · above base = Watch · up to 15% below base = Warn · more = Act.
- **Extra registrations (bets)** = people in test colleges × (test registration rate − comparison rate).
- **Expected extra attendees (A)** = extra registrations × show-up by status of the test group.
- **How sure** = probability the lift is above zero (two-group normal approximation).
- **Next-tranche cost (A)** = cost per extra attendee ÷ how well the bet scales (0.3–0.6 from the plan).
- **Decision:** evidence rule not met → Too early · no lift → Stop · cost per extra above cap → Change · next-tranche cost under cap → Scale (gets reserve) · otherwise Keep.
- **Evidence rule:** at least 2 weeks live, 300+ people per group, 80%+ sure. Releases above ₹50k need 90%+ (the two-segment check is confirmed by the owner, not automated).
- **Channel verdicts:** cost per expected (or verified) visitor vs a ₹250 cap; under half the cap with good show-up = Scale.

**Checks:** `scripts/ref.py` computes the 2025 numbers independently in Python and `scripts/test.js` confirms the app's engine matches them at four dates (for example, 2,050 verified outside visitors, 2,800 registered, ₹2,74,000 spend, cost per visitor by campaign).

## 4. AI Growth Analyst

- **Grounded:** it has no data of its own. It calls the app's functions (the same engine as the screens): overview, campaigns, bets, funnel, trends, what changed between dates, signals, budget what-ifs, a safe query tool for unfamiliar questions, and an exact calculator.
- **Honest:** it is told to say "not in the data" for things the data cannot answer (weather, revenue, competitors…), to tag evidence S or A, and to flag samples under 30 people.
- **Connected to execution:** it can only *propose* actions (release reserve, pause, move budget, create a task…). The user confirms in the same panel the screens use.
- **Changed data:** it always reads the dataset and date selected at the top, including your edits.
- **Testing:** Data → *Test the analyst* runs fixed questions. The expected answers are computed live by the engine, so they move when the data changes.

**Model:** on the hosted site, Google Gemini (free tier, a Flash model) through `api/chat.js`. The API key stays on the server and the browser runs the data tools. Inside Claude, it uses the viewer's own Claude account.

## 5. Setup (hosted copy)

1. Get a free API key at https://aistudio.google.com (Get API key).
2. Import this repo in Vercel (https://vercel.com/new) with the default settings.
3. In Project → Settings → Environment Variables, add `GEMINI_API_KEY` = your key. Optionally add `GEMINI_MODEL` to pin a model; by default it picks a current Flash model.
4. Deploy. Open the link, then **Ask the analyst**.

Local run: `npx vercel dev` (needs the same environment variable).

## 6. Tools used

- Plain HTML, CSS and JavaScript (no framework). Charts are hand-drawn SVG. SheetJS (cdnjs) is used only for importing workbooks.
- Vercel (Hobby, free) for hosting and the one serverless function. Google Gemini API (free tier) for the hosted analyst.
- Claude (Anthropic) for analysis, modelling, code and testing. Claude artifacts host the backup copy.
- Python (pandas) and Node for the reference checks and the simulated data. Headless Chrome (Playwright) for UI tests on desktop and phone widths.

## 7. Known limitations

- **2027 numbers are simulated.** They show the plan working, not real results.
- **Test vs comparison is an estimate, not proof.** Test colleges are picked by coin flip within matched pairs and money moves only when we are 80%+ sure, but hidden differences can remain.
- **Saving:** on the hosted site, edits and tasks save in the reviewer's own browser (they survive a reload but are not shared between people). The Claude version shares them between signed-in viewers.
- **Free AI tier:** Google limits requests per day and may use prompts to improve its products. All data here is simulated or provided, so nothing private is sent.
- The 2027 "today" is the last day of the data, so follow-ups are shown by moving the date back and forward.
- Imported files must use the same sheet names and columns as the 2025 workbook.
