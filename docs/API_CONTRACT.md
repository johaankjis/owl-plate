# Frozen milestone contract, v1

Manager owns this document and `services/api/schemas/`. Request/response models are in `schemas/api.py`; generate frontend types from the composed OpenAPI (`make types`). UUID strings, timezone-aware ISO 8601 UTC timestamps; display America/New_York. Errors use `{"detail":{"code":"capacity","message":"..."}}`; FastAPI validation errors use standard 422 arrays. Never expose tiers, scores, contacts, tokens or student preference data in another user's response. Allergen displays: **may contain, confirm with host**.

## HTTP routes

Base URL http://localhost:8017. `Authorization: Bearer demo-host`, `demo-projector`, or `demo-student-A` through E. These are explicit synthetic credentials, enabled only with AUTH_MODE=demo AND DEMO_MODE=true. No real auth bypass outside demo. No public list of students. GET /health unauthenticated returns status.

| Method | Route | Request | Response / access |
|---|---|---|---|
| POST | /drops | multipart `photo` JPEG/PNG (max 10 MiB), optional `host_note` | DropResponse draft / host |
| PATCH | /drops/{id} | DropEdit (complete review) | DropResponse / owning host |
| POST | /drops/{id}/publish | none | DropResponse with wave 1 committed / owning host |
| GET | /drops/{id} | none | DropResponse / owning host or invited student, projector demo |
| GET | /students/me/invites | none | InvitesResponse / current student only |
| POST | /invites/{id}/claim | none | ClaimResponse / invite owner, idempotent while held |
| POST | /invites/{id}/decline | none | InviteResponse / invite owner, repeat safe |
| POST | /claims/{id}/release | none | ClaimResponse / owner, repeat safe |
| POST | /claims/{id}/pickup | none | ClaimResponse / owner demo only pending real pickup verification design |
| GET | /drops/{id}/dispatch | none | DispatchResponse / demo-projector only; synthetic personas only |
| PUT | /students/me/preferences | Preferences | Preferences / current student |
| POST | /students/me/presence | PresenceRequest | `{"valid_until": timestamp}` / current student, 2-hour lifetime |
| POST | /students/me/push-token | PushTokenRequest | `{"registered": true}` / current student, encrypted FCM mode only; explicit 503 in log mode |
| POST | /demo/reset | none | DemoResetResponse / demo-host, atomic reset |
| GET | /demo/active-drop | none | DemoActiveDropResponse `{"drop_id": UUID or null}` / demo-host or demo-projector only |
| POST | /demo/tick | DemoTick | `{"server_time": timestamp}` / demo-host; injectable clock, same scheduler service |

403 role/ownership mismatch (or 404 to avoid disclosing other users' IDs); 404 missing; 409 `allergen_conflict`, `diet_mismatch`, `capacity`, `invite_expired`, `invalid_state`, `active_claim`, `safety_review_required`; 503 provider failure. Publish retries must not duplicate waves/invites. Counts satisfy total = available + held + picked_up. Invites never reserve inventory. Expired/released holds restore availability; pickup consumes inventory. New holds recheck the student's current allergens and required diet tags atomically against the published drop; conflicts return 409 `allergen_conflict` or `diet_mismatch` without consuming inventory or changing the invite. Held claim repeats return same claim, including after a preference edit; this acknowledges the existing hold rather than allocating food again. Expired invite cannot claim. SQLite write transaction or equivalent serializes mutations; tick and claims share transaction boundary. Persist all state with SQLModel; planner is pure Python with distance injected via geography.

Manager-approved demo discovery addition: `/demo/active-drop` selects the latest `created_at` among draft/live/claimed_out drops under the same transaction boundary (expired drops excluded). Reset returns discovery to null. This lets a projector poll independently of the host's phone or browser storage. Students are denied; both demo gates are required. The response contains only the drop ID, never student data.

## Scheduler assumptions resolving doc ambiguities

Tick every 10 seconds; do not widen on every tick while sent invites remain active. Widen when the current wave has no outstanding sent invites (expiry/decline/claim), inventory remains, and a later tick occurs. Ring starts 2, +2 up to 12. At max ring, stop inviting after exhaustion but keep existing holds/invites valid until their deadline or drop expiry; do not mark remaining food consumed. Decline changes only invite status; it does not increment availability because invites reserve nothing. Holds last 600 seconds, invites 60 demo / 90 production. Default drop expiry 45 minutes, max 120. Drop expiry cancels pending invites and releases holds. Use UTC injectable clock. TTL deadline is exclusive (now >= deadline is expired).

## Fixture agreement

`data/seed/demo.json` is private server seed, NEVER a public/static web asset. Contains synthetic IDs and priority flags, not real data. Origin lat/lng are explicitly arbitrary placeholders, not verified campus coordinates. Compute H3 resolution 11 cells and use `grid_disk` to choose cells at specified ring distance. A/C eligible initial nonvegetarian dairy/gluten tray; B excluded dairy; D distance 4; E requires vegetarian. Other 25 simulated students start alerts paused so the five-persona demo is repeatable. A holds one; C expires; inventory remains; D enters wave 2. Vegetarian variant may invite E; capacity/ranking still applies.

## Vision and safety

VisionEstimate is frozen for eval and adapters. Vision cannot assert halal/kosher/pork_free; discard those tags until host confirmation. Confidence < 0.6 adds all nine common allergens. Removing any estimated allergen requires ingredient_information_checked. Host must confirm the first three safety checks to publish. Religious tags require religious_diets_confirmed. Uploaded bytes are processed without persistence initially; no photos stored. Never silently label fixture output live Gemini. Fixture mode is allowed only in explicit demo mode and UI must label it.

## Ownership

Manager: schemas, data/seed, docs, root configuration, main.py, routes composition, providers/, vision/, live checks and submission materials. Backend worker: dispatch/, db/, business service modules, routes implementation, tests/ excluding provider/vision tests. Web: apps/web/ only. Eval: data/eval/ only. Integrator: composition and repo wiring plus accepted integration fixes. Contract changes require manager coordination.

## Standalone survey addition (deployment approval preview)

The form is `/survey` in the existing web app, independent of synthetic demo
credentials. Browser requests use same-origin `/backend/survey/...`, rewritten
to the configured API origin; mobile production builds use
`NEXT_PUBLIC_API_URL=/backend` for existing host/student routes too.

- `GET /survey/status` → `{accepting: bool}`. No public response count.
- `POST /survey/responses` → `{accepted: bool, preview: bool}`. Input is
  `{submission_id: UUID, consent: true, preview?: bool, answers: SurveyAnswers}`. The shared
  schema is `services/api/schemas/survey.py`; extra fields are rejected, all
  questions are skippable, free text is capped at 500 characters. No account,
  contact, IP, user-agent or synthetic-persona association is saved.
- `SURVEY_ENABLED=false` (default): preview receipt, no row stored or counted.
  Collection is enabled only after Johaan approves the final form/sharing plan.
  A request marked `preview=true` never persists even if collection opens after
  the visitor loaded the preview page.
- `SURVEY_ENABLED=true`: persist once per anonymous submission UUID; repeat
  requests do not inflate count. Response totals mean submissions, not verified
  unique students. No claim of KSU membership verification is made.
- Survey rows survive `/demo/reset`; demo student/hold changes never change them.
  There is no public listing/count/export route. Raw responses, including free
  text, remain private; only aggregate actual counts may reach slides.
- Validation errors are 422. Network/database failure is not a saved response.
