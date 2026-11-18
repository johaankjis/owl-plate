# Demo and pitch

The current rehearsal package is in `submission/`. Use
`submission/PITCH_SCRIPT.md` for the five-minute cue sheet and
`submission/LIVE_RUN_CHECKLIST.md` as the **single live-run checklist and evidence
register**. The latest checkpoint and Johaan's decisions are in `docs/HANDOFF.md`.
Those records supersede early aspirational demo notes.

## Run the local demo

`make present` builds the web app when its sources change, starts API and web
together on one browser port (3017; the API stays on loopback behind `/backend`)
and resets to the live-visitor scenario. Fixture vision and simulated
notifications are always on and labeled; the survey is off. On a ZimaOS
container use `make present-zima` and tunnel port 3017 over SSH.

- Live vision: `make present-live` sends the uploaded photo to Gemini. It needs
  `GEMINI_API_KEY=...` in the gitignored repo-root `.env` (or exported in the
  shell); `GEMINI_MODEL` defaults to `gemini-3.8-flash`. Live failures show an
  error and never fall back to the saved estimate. Results are labeled
  **Live Gemini** or **Saved demo estimate**.
- Visitors open `/join` (or Home → Find food), pick a nickname, a simulated demo
  area and optional restrictions, then see only their own invites on `/student`.
- The host uses Home → Share food: upload → review (safety checks) → publish.
- `/dispatch` is the projector view. Presenter controls at the bottom reset for
  live visitors, load the seeded A–E rehearsal (with `/student?persona=X` links),
  and advance the clock.
- `node scripts/verify_join_flow.cjs` re-checks the four-visitor flow with
  natural expiry (see the script header). `scripts/rehearse_demo.cjs` and
  `scripts/browser_smoke.cjs` target the pre-revamp screens.

## What can be shown now

The reviewed application runs through photo upload → fixture estimate → host
review/safety checklist → publish → A/C invitations → A holds → C expires → D
gets wave two → clean reset. All students are synthetic. The origin is arbitrary,
not verified campus geography. Current notifications are simulated logs.
Allergen estimates say **may contain, confirm with host**.

`submission/Owl_Plate_Fallback.mp4` is a silent captioned browser recording with
fixture vision and simulated notifications visibly labeled throughout. It records
real application routes and natural expiry, not physical phones or live AI.
`submission/evidence/rehearsal-timing.json` records measured events. Replay the
video locally if a live service fails; declare the mode explicitly.

## Five-minute pitch

- 0:00–1:00: problem as a design hypothesis, survey pending n=0.
- 1:00–2:00: photo, host correction, hard filters, deterministic dispatch, atomic claims.
- 2:00–4:00: two-serving scripted demo; A/C invited, B excluded, A holds, C expires, D ring 4.
- 4:00–5:00: architecture and evidence still needed before a policy-approved pilot.

A human pitch and teammate contributions remain unverified until rehearsal.
Do not claim survey results, pantry demand trends, campus-wide prevalence,
CARE partnership, approved redistribution rules, measured vision accuracy,
physical push delivery, live Entra or completed deployment without evidence.
Verified KSU facts come only from `docs/DOMAIN.md`.

## Physical rehearsal and fallback

Thursday evening is reserved for the integrated phone rehearsal, recording and
backup run. Approve devices and private access first. Reset before push
registration; reset clears registrations. Browser invite cards and FCM send
responses do not prove receipt. Observe actual Android and Home Screen iPhone
notifications, then record them in the single checklist. Keep venue Wi-Fi and an
authorized hotspot available. Two laptops should hold the local PDF/MP4 copies.

Fixture vision is an explicitly chosen provider, not a hidden retry after live
Gemini fails. Never use synthetic evaluation metrics as measured model accuracy.
Keep source photos free of people and identifying material; uploaded photos are
currently processed in memory, not retained.

## Submission

Due Friday November 20, 2026, noon Eastern / 17:00 UTC: editable PowerPoint plus
video or live-demo note. The local fallback is available; physical-device capture
and Johaan's final review remain pending. Johaan handles submission. Deployment,
survey distribution and submission require Johaan's approval or action.
