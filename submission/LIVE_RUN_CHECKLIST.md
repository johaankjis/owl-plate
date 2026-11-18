# Owl Plate: single live-run checklist and evidence register

Status vocabulary: **verified** = directly observed local result or documented
approval; **simulated** = fixture/browser/log behavior only; **pending** = no
qualifying evidence yet. A healthy FCM endpoint, send ID, browser invite or log
entry does not verify a physical notification receipt.

Current application baseline: `684e20b8a6d145be27fe5eadcc0be5b6fadbb761`
(application code identical to independently reviewed `f025edd224fe06d2dadd94ae699dd393e8adf8da`).
Friday November 20, 2026 deadline: noon Eastern / 17:00 UTC. Johaan submits.

| Order | Check / operator action | Status now | Evidence required to mark verified |
|---|---|---|---|
| 1 | Johaan approves survey copy, audience and named distribution owner. Proposed audience: KSU students invited directly in person using the standalone form link/QR; no Discord or group-channel posts. Proposed owner: Johaan or a teammate he explicitly names. | pending | Approved standalone form/direct-sharing owner and assigned HTTPS link/QR; distribution remains unsent. Current n=0. |
| 2 | Nominate one authorized Android owner and one authorized Home Screen iPhone owner; consent to this synthetic demo and recording. Map Android to A, iPhone to C for first-wave receipts. | pending | Record owner authorization privately; public record uses device aliases only. No phone numbers, account IDs or tokens. |
| 3 | Arrange a reachable, trusted HTTPS web/API origin with correct CORS for both phones. Localhost on a phone points to that phone. Agree on private local HTTPS access or approve a separate deployment action. | pending | Both phones load the same Owl instance, service worker works in a secure context, no mixed-content/CORS failures. No deployment/tunnel has been started. |
| 4 | Configure Gemini privately: `GEMINI_API_KEY`, exact `GEMINI_MODEL`, `VISION_PROVIDER=gemini`. Keep demo auth and synthetic students. | pending | Private secret card/existing environment; successful validated estimate through POST /drops labeled `gemini`. Never print credentials. |
| 5 | Configure Firebase privately: messaging public config/VAPID, service-account JSON, project ID, Fernet token-encryption key, `NOTIFICATION_PROVIDER=fcm`, explicitly approved synthetic UUID allowlist. | pending | Startup/config checks plus own-token registration. Rebuild web for NEXT_PUBLIC config; never put server credentials in public config. No paid provisioning. |
| 6 | Prepare a tray with no people in shot. Count serving units before testing; record ingredient/menu labels for all nine allergen categories. Photograph and label samples independently of model predictions. | pending | Actual JPEG/PNG, hand-counted servings, human label provenance/date, ingredient evidence. Unknown ingredients are not negative allergen labels; exclude uncertain samples from quantitative recall/FPR. |
| 7 | Preserve an offline copy of the deck, PDF and captioned fallback MP4 on both laptops. Charge devices; check recording space and authorized venue Wi-Fi/hotspot. | pending | Both laptops play files without network; owners demonstrate Wi-Fi/hotspot access. Local package generation itself is verified below. |
| 8 | Run `make demo` on the synthetic instance before device registration. It clears encrypted push registrations too. Re-register both approved devices AFTER every reset. Never run reset against real data. | simulated | Clean reset is verified locally; repeat and timestamp the actual device run. |
| 9 | Android: load installed PWA, tap permission control, allow notifications, register as synthetic A. Put app in background/lock screen. | pending | Actual device model, Android/browser versions, permission state and successful registration; do not store the token in this checklist. |
| 10 | iPhone: supported iOS (16.4+), Add to Home Screen, launch from icon, tap permission control, register as synthetic C. Put app in background/lock screen. | pending | Device/iOS version, installed state, permission state and registration. Safari foreground alone is not Home Screen push proof. |
| 11 | Host uploads tray, verifies returned source is Gemini, edits servings to 2 for scripted demo, reviews allergens and all safety checks; halal/kosher only with host confirmation. | simulated | Live estimate captured without secrets; host confirms safety. Always say “may contain, confirm with host.” Cached fixture remains explicit fallback, never a hidden recovery. |
| 12 | Publish: ring 2; A/C invited, B dairy conflict excluded, D outside ring, E incompatible with this drop. | simulated | Browser route result verified locally. For live push, observe AND record actual Android A and iPhone C notification receipts with timestamps and uniform lock-screen text. |
| 13 | A opens invite and holds; counts become total 2 / available 1 / held 1 / picked up 0. | simulated | Actual phone claim through route and projector count update; duplicate tap produces same hold. |
| 14 | Leave C unanswered; after 60s plus scheduler/poll delay, C expires and D enters ring 4, with no repeated invite to A/C. | simulated | Local natural-expiry run verified. Observe live projector/browser on the physical run. D physical receipt needs an authorized device registered as D; use a separately labeled run if reusing either phone, and re-register after reset. Do not imply two phones prove three recipients at once. |
| 15 | Record actual receipts in the table below; mask private identifiers and tokens before retaining screenshots/video. Confirm uniform text, not tier or exact private location. | pending | Human-observed device notification, delivery time and redacted evidence file. Explicitly record failures or no receipt. |
| 16 | Run opt-in live eval on labeled photos; save predictions, exact model ID, UTC timestamp, evaluated/missing/failed sample counts. | pending | Report MAE, within ±2, recall TP/(TP+FN), false alarm rate FP/(FP+TN) over nine-allergen/sample pairs. Publish no model accuracy before a successful real run. |
| 17 | Thursday evening: full five-minute human rehearsal, actual teammate handoffs, physical recording and backup replay. | pending | Three timed runs, names/roles confirmed, selected take and working backup. Automated browser timing is not a timed spoken pitch. |
| 18 | Johaan reviews final deck/video/live-demo note, approves any deployment, distributes survey, and submits. | pending | Human actions/approval. Nothing has been deployed, distributed or submitted. |

## Actual phone receipt register — no receipts collected

| Run ID / UTC | Device alias / model / OS / browser | Authorized synthetic identity | Installed / permission | Background or locked | Observed receipt UTC / delay | Redacted evidence | Result |
|---|---|---|---|---|---|---|---|
| pending | Android — pending | A proposed, not authorized yet | pending | pending | pending | none | pending |
| pending | Home Screen iPhone — pending | C proposed, not authorized yet | pending | pending | pending | none | pending |
| pending | Authorized reassigned phone or third device | D, separate run if needed | pending | pending | pending | none | pending |

## Live vision evidence — zero real photos evaluated

Follow `data/eval/README.md` for gold labels. Keep source photos, raw exports and
private runs outside Git (for example `test-results/live-vision/`). Label each
photo before looking at predictions. Do not photograph people or identifying
material. A small convenience set is a smoke check, not broad accuracy evidence.
Use a larger independently labeled set when available and report actual n.

After private access and human labels exist:

```bash
.venv/bin/python data/eval/run.py --live \
  --gold test-results/live-vision/gold/ \
  --photos test-results/live-vision/photos/ \
  --save-predictions test-results/live-vision/predictions.json \
  --json > test-results/live-vision/report.json
```

Record exact model/date, gold total, evaluated n, missing/failed n, serving MAE,
percent within ±2, TP/FN/FP/TN, recall denominator and FPR denominator. Keep
undefined metrics as undefined. Report low-confidence conservative inflation.
Allergen output remains an estimate: **may contain, confirm with host**.

| Item | Status | Actual result |
|---|---|---|
| Physical Android receipt | pending | none observed |
| Physical Home Screen iPhone receipt | pending | none observed |
| Live Gemini through app | pending | no private config/source photos available |
| Live model accuracy | pending | evaluated real-photo n=0; no measured values |
| Survey | pending | n=0, not distributed |
| Local natural-expiry demo | simulated | Recorded browser evidence; no physical push |
| Seven-slide rendering and visual inspection | verified | LibreOffice PDF/PNG, all seven readable and unclipped |
| Offline five-minute technical playback | verified | 300.001s, captioned video 120.066–216.666s, transitions checked, zero external requests/page errors; no human rehearsal |

On a failure: record the real outcome, stop only Owl's processes, select explicit
fixture/log providers and replay the labeled fallback. Do not relabel simulated
sends as receipts or substitute fixture metrics for live measurements.

## One coordinated evidence session — proposed 75-minute slot

Johaan needs to provide/confirm these together before choosing the session time:

- Android tester alias, authorization for the synthetic demo/receipt capture,
  device/Android/browser versions and availability; proposed identity A.
- iPhone tester alias, authorization, device/iOS version and availability;
  app added to Home Screen and launched from its icon; proposed identity C.
- Exact Gemini model plus private API access, and Firebase project/service-account,
  public messaging config/VAPID and approved synthetic-recipient allowlist. The
  Fernet encryption key can be generated locally after configuration access exists.
  Provide secrets only through private secret cards or an existing private environment.
- A reachable trusted HTTPS origin both phones can use, and authorized venue
  Wi-Fi/hotspot access. No deployment, public tunnel or paid provisioning is assumed.
- JPEG/PNG tray photos, serving-unit definition and hand count, complete
  ingredient/menu allergen labels, labeler alias/date. Use a suitable dairy-containing,
  non-vegetarian tray if demonstrating B's dairy exclusion and E's diet mismatch;
  never alter truth labels to force the script. A mismatched real tray can be used
  for vision evaluation while the clearly labeled fixture drives the five-persona story.
- Names/availability for the four speaker roles (one person may cover multiple
  roles), plus the operator and final approver. Actual team time stays pending.

| Session elapsed | Coordinated action | Evidence to retain |
|---|---|---|
| 0–10 min | Check authorization, HTTPS/CORS, both phone installations, private setup and model ID. Confirm no real-student data. | Redacted run ID, UTC start, device/OS/browser aliases; no secrets |
| 10–20 min | Reset synthetic state, then register A Android/C iPhone AFTER reset; background/lock both; host analyzes a real labeled tray through the app. | Real estimate source/model/date, label reference; no claim of measured accuracy yet |
| 20–30 min | Publish reviewed compatible drop, observe actual A/C notifications, A claims, C expires, D browser wave widens. Record no receipt if it fails. | Separate Android/iPhone observed receipt times and redacted evidence; counts and wave timings |
| 30–40 min | If needed, a separately labeled D-receipt run on an approved reassigned device; repeat registration after reset. Verify uniform alerts without private information. | Distinct run ID and mapping; never imply all recipients were tested simultaneously |
| 40–50 min | Run opt-in live evaluation on independent human labels; save predictions/report, exact n and denominators. Investigate failures, do not replace them with fixtures. | MAE, within ±2, recall, FPR, TP/FN/FP/TN and evaluated/missing/failed counts |
| 50–70 min | Three spoken five-minute team runs with short feedback/handoffs. Play the 96.6s fallback and use its 23.4s buffer. | Actual human section-end/total times, selected take, device/provider delays |
| 70–75 min | Confirm evidence status, native PowerPoint/venue playback and copies on both laptops. Review candidate package with Johaan. | Verified/simulated/pending entries; approval/submission still Johaan's action |

The slot is a proposal, not a claimed appointment. No authorized testers, shared
availability, private configuration or real labels exist in the current checkout.
If an input is still missing, continue independent checks and retain the labeled
fallback; do not call the corresponding item verified.
