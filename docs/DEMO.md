# DEMO.md

Everything a judge sees. Built around the official 5 minute structure and the AI Club rubric.

## Rubric map

| Criterion (points) | Where we earn it |
|---|---|
| Campus impact, real data (25) | Survey results (n = ?), CARE pantry demand, food thrown away at events |
| Use of AI as the core (25) | Vision estimate of food, servings and allergens with measured accuracy; dispatch decisions with reasons |
| Feasibility for KSU (20) | CARE Services as owner, KSU sign in, costs, rollout plan |
| Creativity (15) | Not a broadcast: just enough, need first, safe, one photo |
| Pitch (15) | One story, one live moment, every teammate speaks |

## Live demo setup

* Laptop on the projector showing `/dispatch` (map, waves, reasons).
* Host phone with the `/host` page open.
* 5 persona phones (A to E, see `DATA.md`) installed as PWA, alerts on, sound on, laid out on the table facing judges, each with a sticky note label ("Nearby", "Dairy allergy", "Next building", "Far away", "Vegetarian").
* A real tray of snacks or pizza.
* `make demo` run 10 minutes before.

## The 5 minutes

**0:00 to 1:00, Problem.** A club meeting ends, food goes in the trash, and across the building someone skipped lunch. KSU CARE runs two pantries and demand keeps growing. Show our survey numbers. Then: "Other schools fixed this with free food alerts. They broadcast to everyone, so the food goes to whoever is fastest."

**1:00 to 2:00, Solution.** Owl Plate: one photo from the host, AI sees the food, and it goes to just enough nearby students who can safely eat it, with students who need it most quietly first.

**2:00 to 4:00, Demo.**
1. Photograph the tray. The screen shows the AI estimate: items, about 8 servings, dairy and gluten likely. Host taps publish.
2. The map lights up. Wave 1 invites appear with reasons. Phone A and Phone C buzz. Phone B stays silent; the screen shows "skipped: allergen." Phone D stays silent; "outside wave 1."
3. A teammate taps "I'm coming" on Phone A. The counter drops.
4. Nobody answers on one invite. After 60 seconds the ring widens and Phone D buzzes. "Like a driver search widening, the food finds someone."

**4:00 to 5:00, How and next.** Architecture in one slide (Gemini sees the food, H3 rings, FCM delivers, Entra checks KSU accounts, runs on AWS). Our measured vision accuracy from the eval set. Next: CARE Services pilot on the Marietta campus, meal swipe matching on the same engine, native app via Capacitor. Each teammate says what they built.

## Submission (due Fri 12:00 PM)

* PowerPoint deck following the 5 minute structure.
* Demo video (2 to 3 minutes) recorded Thursday night showing the full flow with phones visible.
* Note that we will also demo live.

## Backups

* If push is slow: the dispatch screen still shows every decision. Point at it and continue.
* If vision fails: a cached estimate for the demo photo loads automatically in demo mode.
* If Wi Fi fails: phone hotspot, and the recorded video.
* Second laptop with the same build.

## Likely judge questions

* **"UT and other schools already have this."** Theirs broadcast to everyone, so the fastest person wins and hosts must type details. Ours sees the food from one photo and sends it to just enough students who can safely eat it.
* **"How accurate is the serving estimate?"** Give the eval numbers. The host can correct before publishing, and we log corrections to improve.
* **"How do you know who needs it?"** We don't guess. CARE Services, who already works with these students, sets the priority. Students never see it, and nobody else can tell.
* **"Food safety?"** Hosts confirm a checklist under KSU rules, drops expire, allergens are labeled as estimates.
* **"Would KSU actually use this?"** CARE Services is the natural owner. It runs on KSU sign in, costs a few dollars a month in hosting and AI calls at this scale (TODO(team): compute from real usage), and can pilot on one campus.
* **"What if nobody responds?"** Waves widen automatically until the food is claimed or expires.
* **"Why not just text everyone?"** Thirty people for eight slices wastes everyone's time and burns trust in alerts.

## Rehearsal

Run the full 5 minutes three times on Thursday with the real phones. Time each section. Cut anything over.
