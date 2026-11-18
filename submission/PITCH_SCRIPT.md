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

| Demo elapsed | Action / short narration |
|---|---|
| 0:00–0:15 | “This backup is a real browser capture of our app routes using a synthetic image, fixture vision and simulated notifications.” Upload, review to two servings, safety checks, publish. |
| 0:15–0:35 | “A and C have invitations. B has a dairy conflict. D is outside ring two.” Show C's own invite and B's empty inbox. |
| 0:35–0:50 | “A holds one serving. One is held, one remains available.” Show the claim and projector counts. |
| 0:50–1:25 | “We leave C unanswered. These are normal 60-second demo invitations; the scheduler checks every ten seconds.” While waiting, explain generic reasons and synthetic map markers. |
| 1:25–1:45 | “C expired; the ring widens from two to four. D now has an invitation. A and C are not contacted again.” Show D's own inbox. |
| 1:45–2:00 | End/reset, or use remaining time as buffer. Switch to architecture at exactly 4:00. |

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
