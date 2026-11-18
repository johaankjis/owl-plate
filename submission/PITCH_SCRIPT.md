# Five-minute pitch cue sheet

The allocation is exactly 5:00: problem 1:00, solution 1:00, demonstration 2:00,
architecture/next steps 1:00. These are cue targets, not claimed human timings.
The natural-expiry browser run fits the demo block; physical-device and spoken
team rehearsals remain pending. Assign speakers at Johaan's return.

## 0:00–1:00 — Problem (slides 1–2)

Imagine a club meeting ending with food still on the table. The host needs to
pack up. A student nearby could use a meal, but they do not know about it in time.
That is the situation we designed Owl Plate around. We are testing this problem;
we are not claiming a measured rate of food waste or skipped meals at KSU.
Our short campus survey is ready, but it has not been distributed and has zero
responses. The question is practical: can a host share leftovers quickly, and can
students receive useful alerts for food that matches their preferences?

Cue: title for first 15 seconds, problem slide for the remainder. Pause for the
story; do not fill the time with unsupported statistics.

## 1:00–2:00 — Solution (slide 3)

Owl Plate starts with one photograph. Gemini is the vision provider: it returns
food items, an estimated serving count and likely allergens. The host reviews
and corrects that estimate, then confirms the safety checklist before publishing.
Diet and allergen filters run before any ranking. The dispatch engine is
deterministic Python; the language model never chooses recipients. Invitations
are sized from remaining servings and widen in waves. A claim checks capacity
inside a transaction, so sending invitations does not reserve or overbook food.
Today our recorded backup uses fixture vision and simulated alerts. Live vision
accuracy and physical phone delivery are still pending.

Cue: say “may contain, confirm with host” with the allergen display. Change the
last sentence only after collecting the actual evidence.

## 2:00–4:00 — Demonstration (slides 4–5, then app or fallback)

Start the demo timer at 2:00. Keep the two-serving reviewed drop and synthetic
personas. The prerecorded fallback is silent with burned-in captions; narrate
only the actions below. Do not play it on top of a second live attempt.

| Video time / pitch time | Operator / Role 3 spoken cue |
|---|---|
| 0:00–0:11 / 2:00–2:11 | “This recorded backup uses fixture vision, simulated alerts and synthetic students.” Host uploads, reviews to two servings, checks safety and publishes. |
| 0:11–0:16 / 2:11–2:16 | “A and C are invited. B has a dairy conflict; D is outside ring two.” Point to projector reasons. |
| 0:16–0:21 / 2:16–2:21 | “C sees only C's browser invitation.” No physical receipt claim. |
| 0:21–0:26 / 2:21–2:26 | “B has no invitation.” Allergy filtering happens before ranking. |
| 0:26–0:36 / 2:26–2:36 | “A holds one serving. One remains available, one is held.” Claim happens at about 0:31. |
| 0:36–1:20 / 2:36–3:20 | “We leave C unanswered. Demo invites expire after sixty seconds; the scheduler checks every ten.” Use the real wait to explain counts, generic reasons and simulated map markers. Say “may contain, confirm with host.” |
| 1:20–1:26 / 3:20–3:26 | “C expired. Ring two widens to ring four. D is invited; earlier invitees are not contacted again.” |
| 1:26–1:33 / 3:26–3:33 | “D now sees its own invitation.” |
| 1:33–1:36.6 / 3:33–3:36.6 | “Reset clears the run for the next rehearsal.” |
| 1:36.6–2:00 / 3:36.6–4:00 | 23.4 seconds for the operator/speaker handoff or brief delay recovery. No new unsupported claims. Switch to architecture at exactly 4:00. |

For a live provider delay, use the labeled recording at once rather than letting
a 65-second upload timeout consume the pitch. With two phones, demonstrate A and
C receipts; D's separate-run receipt needs explicit authorized registration.

## 4:00–5:00 — Architecture and next steps (slides 6–7)

The web app is a Next.js PWA. FastAPI composes vision, notifications and the
planner behind small interfaces. H3 rings and deck.gl explain the search. SQLModel
persists inventory and serializes claims. The FCM adapter sends uniform alerts;
we will claim real delivery only after observing approved devices. The local
backup is repeatable because it uses explicit fixture providers and demo auth.
Next we need hand-labeled photo evaluation, survey responses with their sample
size, and campus food-policy confirmation before any pilot. Deployment and
sign-in are future readiness work. Our goal is a host sharing food quickly,
with students getting useful, compatible invitations.

Cue: architecture for 35 seconds, next steps for 25. Team contributions are
pending team confirmation; do not invent roles or partnerships.

## Timing check and rehearsal log

At roughly 115–125 words/minute, each prepared one-minute spoken section fits
its slot with short pauses. The demo narration overlaps the app actions and
60-second expiry wait; it is not added on top of them. The measured browser flow
is recorded in `evidence/rehearsal-timing.json`. This validates demo feasibility,
not human delivery. Thursday evening: time three full runs; record actual section
ends, device/provider latency, speaker handoffs and selected take.

| Human run | Problem end | Solution end | Demo end | Total | Result |
|---|---|---|---|---|---|
| 1 | pending | pending | pending | pending | pending |
| 2 | pending | pending | pending | pending | pending |
| 3 | pending | pending | pending | pending | pending |


## Coordinated speaker handoffs

| Role | Proposed responsibility | Name / availability |
|---|---|---|
| 1 | Problem, slides 1–2, handoff “Here is how Owl Plate works.” at 1:00 | Johaan confirms; pending |
| 2 | Solution, slide 3, handoff “Let us show one tray and five synthetic personas.” at 2:00 | Johaan confirms; pending |
| 3 | Demo narration and playback operator; at 3:36.6 use buffer, handoff “Here is what makes the flow repeatable.” at 4:00 | Johaan confirms; pending |
| 4 | Architecture 4:00–4:35 and next steps 4:35–5:00; close at 5:00 | Johaan confirms; pending |

Open `REHEARSAL.html` directly from this folder for the offline timed companion.
It shows the checked slide renders, plays the actual MP4 at 2:00, and transitions
to slide 6 at 4:00 and slide 7 at 4:35. Slides 4–5 remain operator thumbnails
during the video. Default mode is **technical playback check — no speakers**.
For a real team run, choose **Actual spoken team rehearsal** only when the team
participates, press Start, and save the timing JSON. The page records no microphone.
Record actual names, spoken section-end times, pauses, problems and selected take
in the human log above. Technical timer events are not proof of spoken delivery.


Latest technical verification: **300.001s** wall/active time, no speakers present.
Video played from 120.066s to 216.666s; architecture transitioned at 240.001s,
next steps at 275.001s. Zero external requests/page errors. This verifies local
playback/captions/transitions, not human speech. Actual team times above remain
pending until the team participates and returns the saved log.
