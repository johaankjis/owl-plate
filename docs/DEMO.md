# Demo and pitch

The current rehearsal package is in `submission/`. Use
`submission/PITCH_SCRIPT.md` for the five-minute cue sheet and
`submission/LIVE_RUN_CHECKLIST.md` as the **single live-run checklist and evidence
register**. The latest checkpoint and Johaan's decisions are in `docs/HANDOFF.md`.
Those records supersede early aspirational demo notes.

## Run the local demo

The campus-feed successor is specified in `docs/CAMPUS_FEED_CONTRACT.md`;
`docs/FEED_HANDOFF.md` tracks its integration status and isolated 3027/8027
commands/evidence. Normal visitors join without location and browse all active
food drops. Hosts alone select verified pickup buildings. The old A–E seeded
wave rehearsal and fallback recording remain a separate, explicitly synthetic
scenario with unverified rehearsal geography.

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
- Live vision via OpenRouter: `make present-openrouter` (ZimaOS:
  `PRESENT_HOST=0.0.0.0 .venv/bin/python -m scripts.present --vision openrouter`).
  Needs `OPENROUTER_API_KEY=...` in the gitignored repo-root `.env`;
  `OPENROUTER_VISION_MODEL` defaults to `google/gemini-3.8-flash`. Results are
  labeled **Live Gemini via OpenRouter**; failures show an error, never the saved estimate.
- Real push (Firebase): add `--notifications fcm`. Needs the service-account JSON
  at `.secrets/firebase-service-account.json` and `NEXT_PUBLIC_FIREBASE_CONFIG`,
  `NEXT_PUBLIC_FIREBASE_VAPID_KEY` in `.env` (all gitignored); the launcher creates
  `PUSH_TOKEN_ENCRYPTION_KEY`. A joined student taps **Enable notifications** (on
  iPhone only from the installed Home Screen app). An eligible feed announcement
  opens `/student?drop=<id>`; seeded-wave invites retain `/student?invite=<id>`.
  Students who did not opt in, and the default launch, stay **simulated**.
- Visitors open `/join` (or Home → Find food), pick a nickname and optional
  restrictions, then browse the campus feed on `/student`. No student location
  or GPS is requested. Dietary mismatches remain visible with reserve disabled.
- The host uses Home → Share food: upload → review (safety checks) → publish.
- `/dispatch` is the projector view. Presenter controls at the bottom reset for
  live visitors, load the seeded A–E rehearsal (with `/student?persona=X` links),
  and advance the clock.
- `make verify-feed` checks the actual mobile feed on isolated 3027/8027 only.
  The old `verify_join_flow.cjs` and `verify_campus_mobile.cjs` names forward to
  this harness; four-visitor/check-in/ring assumptions no longer apply in normal
  visitors mode. `make rehearse-seeded` explicitly checks A–E waves and natural
  invite expiry. `scripts/browser_smoke.cjs` is historical, pre-revamp coverage.

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
