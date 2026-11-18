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

# Revamp contract v2: Join Demo sessions and presenter controls (frozen 2026-11-18)

Additive to v1; every v1 route and shape above still holds unless changed here.
Shapes live in `services/api/schemas/api.py`; frontend types are regenerated in
`apps/web/lib/api.generated.ts`. Manager owns this section. Changes need manager sign-off.

## New and changed routes

| Method | Route | Auth | Request | Response |
|---|---|---|---|---|
| GET | /demo/areas | none (demo gates) | – | DemoAreasResponse |
| POST | /sessions | none (demo gates) | JoinRequest | 201 JoinResponse; 409 `nickname_taken`, 409 `session_limit` (40 visitors) |
| GET | /sessions/me | visitor token | – | SessionStudent; seeded persona tokens get 404 `not_a_session` |
| DELETE | /sessions/me | visitor token | – | SessionLeftResponse; holds released, sent invites declined, token revoked |
| POST | /demo/reset | demo-host **or demo-projector** | optional DemoResetRequest `{scenario}` (default `seeded`) | DemoResetResponse incl. `scenario` |
| POST | /demo/tick | demo-host **or demo-projector** | DemoTick | DemoTickResponse |
| GET | /demo/status | demo-host or demo-projector | – | DemoStatusResponse |
| GET | /drops/{id}/dispatch | demo-projector | – | DispatchResponse now adds `visitors` and `scenario` |

"Demo gates" = `DEMO_MODE=true` and `AUTH_MODE=demo`; otherwise these routes return 403 `forbidden`.

## Demo areas (fixed, simulated, unverified locations)

| id | label | ring_distance | first reached by |
|---|---|---|---|
| demo-venue | Event venue (demo) | 0 | wave 1 (ring 2) |
| demo-next-door | Next building over (demo) | 1 | wave 1 (ring 2) |
| demo-across-quad | Across the quad (demo) | 4 | wave 2 (ring 4) |
| demo-far-side | Far side of campus (demo) | 8 | wave 4 (ring 8) |

Descriptions must say the location is simulated. Server maps each area to an H3 res-11
cell at exactly that ring distance from the demo origin (visitors in one area may be spread
across cells of that ring for map readability; distance is what matters).

## Visitor sessions

- `POST /sessions` creates a new Student row per call: `is_simulated=false`,
  `data.kind="visitor"`, nickname, area cell, allergens, diets, `alerts_paused=false`,
  `priority=false` always, presence valid 2 hours from join.
- Token = `demo-session-` + `secrets.token_urlsafe(32)`. Store only its SHA-256; return the
  raw token once. Clients keep it in `localStorage` key `owl-plate.session`.
- Nicknames are unique case-insensitively among current visitors (409 `nickname_taken`).
- A visitor token resolves to `Actor("student", <visitor id>)`, so every v1 student route
  (`/students/me/invites`, claim, decline, release, pickup, preferences) works unchanged.
- **Isolation:** a visitor only ever sees and mutates their own invites and claims. Another
  student's invite or claim id returns 404 `not_found` (never 403, never data). `GET /drops/{id}`
  for a student requires an invite to that drop.
- Unknown, revoked or pre-reset tokens return 401 `unauthorized` ("Session ended. Join again.").
  Clients clear the stored token and return to Join on any 401.
- Seeded tokens `demo-student-A`…`E` still work for presenter rehearsal links.

## Scenarios and reset

- `seeded` (default, v1 behavior): 30 simulated students; A–E active, other 25 paused.
- `visitors`: the same 30 simulated rows exist but **all** are `alerts_paused`, so only joined
  visitors are matched. `personas` in DispatchResponse is `[]` in this scenario.
- Any reset deletes all visitor sessions (their tokens then 401), drops, waves, invites,
  claims, and the clock offset. Store the scenario in a **new table** (do not add columns to
  existing tables; `create_all` does not migrate existing SQLite files).
- Visitors may join in either scenario; in `seeded` they compete with A–E normally.
- The launcher resets to `visitors` on start.

## Matching

Visitors go through the existing pure `plan_wave` with the same hard filters, ranking,
capacity (`ceil(available / SHOW_RATE)`), 60 s demo invite TTL, 600 s holds and wave widening
(ring 2, +2 per wave) as seeded students. No new matching rules.

## Dispatch visitors rows (projector-safe)

`VisitorDecision`: nickname, area, ring_distance, status (`sent` | `claimed` | `declined` |
`expired` | `excluded` | `waiting`), reason_codes, h3_cell, wave_number (wave that invited them,
else null). Reason codes for visitors: invited → `["nearby","diet_match","fair_share"]`;
otherwise one of `dietary_filter` (covers both allergen and diet conflicts; never name the
allergen or diet), `out_of_range`, `not_selected`, `active_claim`, `already_invited`,
`not_published`. `waiting` = joined, no drop published yet. Never expose tokens, ids, priority,
or the visitor's allergen/diet lists. Rows ordered by join time. `PersonaDecision` and
`VisitorDecision` both carry `wave_number`.

## DemoStatusResponse

`{scenario, visitors (count of current visitor sessions), active_drop_id, server_time,
clock_offset_seconds}`.

## Ownership for the revamp (disjoint files)

- **Manager (Claude Opus):** `services/api/schemas/`, `services/api/routes/`, `services/api/main.py`,
  this document, `apps/web/lib/api.generated.ts`, `apps/web/openapi.json`, `apps/web/app/dispatch/**`,
  `apps/web/components/DispatchMap.tsx`, new `apps/web/components/presenter/**`,
  new `apps/web/lib/presenter-api.ts`, `scripts/`, `Makefile`, `data/seed/`, integration.
- **Backend worker (OpenCode GLM 5.3):** `services/api/application.py`, `services/api/db/**`,
  `services/api/dispatch/**`, new `services/api/sessions/**`, `services/api/tests/**`
  (excluding `tests/providers/` and `tests/vision/`).
- **Web worker (Antigravity Argon):** `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`,
  `apps/web/app/globals.css`, `apps/web/app/host/**`, `apps/web/app/student/**`, new
  `apps/web/app/join/**`, `apps/web/components/**` except `DispatchMap.tsx` and `presenter/**`,
  `apps/web/lib/api-client.ts`, `apps/web/lib/fixtures/**`, `apps/web/lib/types/**`,
  `apps/web/lib/time.ts`, new `apps/web/lib/session.ts`, `apps/web/tests/**`.

# Contract v2.1: host live counts and honest vision source (frozen 2026-11-18)

No new routes or response models. Manager owns this section.

## Host counts (web worker)

- After publish, the host page shows the current drop with `counts.available`, `counts.held`,
  `counts.picked_up` (and `counts.total`) from the existing `DropResponse.counts`.
- Refresh: poll `GET /drops/{id}` (owning host) every 2 s while the page is open.
- Restore on reload: `GET /demo/active-drop` (demo-host allowed) → `GET /drops/{id}`. A `draft`
  restores the review step; `live` / `claimed_out` restores the counts panel. `drop_id: null`
  starts at upload. Hosts never see student names, nicknames or per-student status.
- `total = available + held + picked_up`. Claim moves one serving available → held; student
  "Confirm picked up (demo)" (`POST /claims/{id}/pickup`) moves held → picked_up.

## Vision source (backend worker)

- `DropResponse.vision_source` stays `"fixture" | "gemini"` and must be the provider that
  actually produced that drop's estimate. UI labels: `gemini` → **Live Gemini**,
  `fixture` → **Saved demo estimate**.
- `GET /health` adds `vision: "fixture" | "gemini"` = the configured mode (public, no secrets).
- Live mode (`VISION_PROVIDER=gemini`) never falls back to the fixture. Any Gemini failure,
  timeout, invalid output or missing credential → `POST /drops` returns **503**
  `{"detail": {"code": "vision_unavailable", "message": <human-readable, no key/URL/body>}}`
  and no drop is created. The host UI shows that message and offers retry; it never shows a
  fixture estimate in live mode.
- The uploaded image bytes (after `validate_photo` re-encode) are what Gemini receives.
  The host note is optional and untrusted data.
- `GEMINI_API_KEY` and `GEMINI_MODEL` are server-side only (gitignored `.env` at repo root or
  the launching shell). Never `NEXT_PUBLIC_*`, never logged, never returned.

## Ownership for this change

- Manager: `services/api/main.py`, `services/api/schemas/`, `services/api/routes/`, this doc,
  `apps/web/lib/api.generated.ts`, `apps/web/openapi.json`, integration and browser checks.
- Backend worker (GLM 5.3): `services/api/providers/gemini.py`, `services/api/vision/**`,
  `create_drop` error mapping in `services/api/application.py`, `scripts/present.py`,
  `Makefile`, `services/api/tests/**`.
- Web worker (Argon): `apps/web/app/host/**`, `apps/web/lib/api-client.ts`,
  `apps/web/lib/fixtures/**`, `apps/web/lib/types/**`, `apps/web/tests/**`,
  `apps/web/components/**` except `DispatchMap.tsx` and `presenter/**`.

# Contract v2.2: live vision via OpenRouter (frozen 2026-11-18)

- `DropResponse.vision_source` is `"fixture" | "gemini" | "openrouter"`; `GET /health` `vision`
  reports the configured mode with the same values. `"openrouter"` means a Gemini model reached
  through OpenRouter produced this drop's estimate. UI label on success: **Live Gemini via
  OpenRouter**. `fixture` stays **Saved demo estimate**; direct `gemini` stays **Live Gemini**.
- `VISION_PROVIDER=openrouter` reads `OPENROUTER_API_KEY` (server-side only: gitignored repo-root
  `.env` or the launching shell) and `OPENROUTER_VISION_MODEL` (a Gemini model on OpenRouter whose
  model listing supports image input and structured outputs; launcher provides a verified default).
- The actual uploaded photo (after `validate_photo` re-encode) is sent. The reply is validated
  against `VisionEstimate`; the existing `SafeVision` policies still apply.
- Any failure (missing key, HTTP error, timeout, refusal, invalid JSON, schema mismatch) →
  `POST /drops` 503 `vision_unavailable` with a human message containing no key, URL or body,
  no drop created, never a fixture fallback. Fixture mode remains for offline rehearsal.

Ownership: backend worker (GLM 5.3) owns `services/api/providers/openrouter.py` (new),
`services/api/vision/**`, `create_drop` source handling in `services/api/application.py`,
`scripts/present.py`, `Makefile`, `services/api/tests/**`. Web worker (Argon) owns
`apps/web/app/host/**`, `apps/web/components/**` except DispatchMap and presenter,
`apps/web/lib/api-client.ts`, `apps/web/lib/fixtures/**`, `apps/web/lib/types/**`,
`apps/web/tests/**`. Manager owns schemas, main.py, this doc, generated types,
`apps/web/lib/vision-mode.ts`, `apps/web/app/dispatch/**`, and integration.
