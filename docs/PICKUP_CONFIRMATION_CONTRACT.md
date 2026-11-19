# Milestone 2: photo-assisted pickup confirmation

Manager baseline application: `d3bc6a3f2bf0b05ac007593cddf927e6c18ab54f`,
branch `feature/campus-food-feed`. New local branch:
`feature/photo-assisted-pickup`. Preserve dirty cloud work, current feed, Maps,
student FCM, It aggregate counts, verified campus registry and seeded rehearsal.
User's new photo-assisted confirmation supersedes old proof-free pickup wording
for normal campus-feed claims. No push/cloud deployment without user approval.

## Meaning and privacy

Required visible notice on results, review and pickup completion:
"Photo-assisted confirmation. A photo cannot independently establish physical
pickup or food safety."

Compare the submitted food photo to the immutable host-reviewed listing's food
items/portion descriptions, not to an unavailable stored host photo. Existing
OpenRouter credentials, requested model `google/gemini-3.8-flash`; configurable
private model environment may reuse OPENROUTER_VISION_MODEL with that default.
Reuse the existing OpenRouter HTTP/schema boundary, never a separate paid setup.
Prompt excludes student identity, contact data, location, tokens and private
preferences. Treat photos/listing text as untrusted input, never instructions.
Return match_status consistent|uncertain|inconsistent, confidence finite0..1,
short explanation(max500). Consistent confidence below0.8 becomes uncertain.
This conservative reversible threshold is a demo assumption, not measured
accuracy. Never infer physical presence, ownership, quantity removed, allergens
or safety from the image. Malformed/provider error fails closed; no fallback
from live errors to fixture success.

JPEG/PNG only,10MiB/20Mpixel bounds, resize/strip metadata through existing
validator. Process in memory, do not persist files, bytes, EXIF, hashes or data
URLs/logs. Only structured assessment/idempotency state is retained. Consequently
host review displays assessment/listing metadata, not a retained photo or proof.
UI prompts food-only photos without people. No public photo endpoint.

## Student API (existing auth/error envelopes)

`POST /claims/{claim_id}/pickup-photo`: multipart `photo` + `request_id` UUID.
Requires caller's own active/unexpired held claim and unexpired drop BEFORE any
model call. New request_id per selected photo, stable on network retry. Persist a
unique(claim_id,request_id) attempt, then call model OUTSIDE DB write transaction.
Recheck ownership/hold/expiry/latest attempt after model response; no inventory
mutation here. Same-key retry returns same attempt/result; concurrent processing
returns processing response without another model call. Different request while
one is processing ->409 verification_in_progress. Stale processing attempts can
fail after120seconds to permit retry; late results cannot overwrite a newer
attempt. Use explicit monotonic attempt order, not UUID sorting on equal clocks.

Returns200(or202 while processing) PickupVerification:
```
{ id:UUID, claim_id:UUID,
  status:'processing'|'ready'|'failed',
  match_status:'consistent'|'uncertain'|'inconsistent'|null,
  confidence:number|null, explanation:string,
  source:'fixture'|'openrouter', created_at:UTC ISO8601,
  review_status:'not_requested'|'pending'|'approved'|'rejected'|'expired'|'superseded',
  can_confirm:boolean, notice:string }
```
`GET /claims/{claim_id}/pickup-verification` ->
`{verification:PickupVerification|null}` latest attempt, own claim only. Derive
can_confirm on read (ready, normalized consistent, latest, own still-held claim,
unexpired, not rejected/superseded). Expired/inaccessible holds cannot confirm.

`POST /claims/{claim_id}/pickup` now accepts optional JSON
`{verification_id:UUID}`. For campus-feed claims it is REQUIRED: latest successful
consistent attempt, claim ownership/hold/drop deadlines and state all checked
inside the same serialized transaction as consuming inventory. Missing result
->409 pickup_verification_required; other invalid attempt/state ->409 invalid_state;
expired hold cannot complete. Existing picked_up retry returns same ClaimResponse
without another mutation or notification. No-body bypass remains ONLY explicit
seeded_waves + existing demo gates, clearly labeled legacy rehearsal. Even fixture
campus-feed pickups require the fixture photo/result step, honestly labeled.
Release and hold expiry invalidate pending attempts/reviews and restore counts.

`POST /claims/{claim_id}/pickup-review` body `{verification_id:UUID}` ->
PickupVerification with review_status pending. Explicit student's request only,
latest ready result with active hold; idempotent. No implicit pickup/extension.
A new photo attempt supersedes any older pending review/confirmation authority.

## Host review API

`GET /drops/{drop_id}/pickup-reviews` ->
`{reviews:HostPickupReview[],server_time:UTC ISO8601}` pending/current only.
`POST /drops/{drop_id}/pickup-reviews/{verification_id}` body
`{decision:'approve'|'reject'}` -> HostPickupReview.

HostPickupReview:
```
{ id:UUID,drop_id:UUID,match_status:consistent|uncertain|inconsistent,
  confidence:number,explanation:string,source:fixture|openrouter,
  created_at:UTC ISO8601,held_until:UTC ISO8601,
  review_status:pending|approved|rejected|expired|superseded,notice:string }
```

Require publishing host actor.id==drop.host_id for EVERY read/write; wrong owner
->404, wrong role->403. Opaque review ID is not a student/claim ID. Never return
student ids/nicknames/tokens/preferences/location or photo data to hosts/projector.
Explicit host approval consumes the active unexpired hold transactionally and is
recorded as a human override, not an AI consistent verdict. Rejection leaves hold
until its existing expiry, allows a new photo, and cannot silently confirm.
Approval/rejection retries idempotent; contradictory/stale review ->409. No
approval after expiry/release/superseding attempt, even if UI is stale. Queue
updates automatically through polling. Hosts may act only on information they
actually have; assessment-only review cannot establish pickup independently.

## Optional host notifications

`POST /hosts/me/push-token` existing PushTokenRequest -> PushTokenResponse.
`GET /hosts/me/push-token` -> PushTokenResponse with current registration flag.
`DELETE /hosts/me/push-token` -> PushTokenResponse(registered=false).
Host role required; server binds authenticated host id, never accepts target id.
Separate encrypted host registrations from student namespace/policy; reuse
private Firebase config/Fernet key. No widening of student recipient policy.
Backend status check prevents static demo-host local flags surviving reset;
clear both host and student registrations on demo reset.

Successful pickup (student consistent completion OR explicit host approval)
atomically inserts one durable host outbox event unique by claim. Repeated HTTP,
concurrent completion/approval, ticks or provider retries cannot create new events
or consume twice. Only publishing host's opted-in token may receive it; no
broadcast or student-target leakage. Opt-in after pickup does not replay old
handled events; opt-out respected on deferred send. Preserve lock-screen privacy
for student alerts; host explicitly opts into food name + aggregate count here.

FCM data.notification_mode='host_pickup', drop_id, opaque notification_id,
title='Owl Plate: Pickup update', body e.g.
'A serving of roasted chicken was marked collected. 4 servings available.',
url='/host?drop=<UUID>'; stable event tag/topic (32char topic bound). No student
or claim identity/photo/preferences. Capture counts.available at the committed
pickup for event text, not a stale pre-transaction count. Notifications are
advisory; transport acceptance is not physical receipt. Ambiguous send/crash
exactly-once limitations must be documented; stable tags/topics mitigate repeats.
Host deep link loads ONLY authorized own drop. FCM service worker supports this
new host route while retaining campus_feed and seeded_waves student routes.

## Composition, fixtures and ownership

Claude Opus owns services/api/** including models, schemas, routes, pickup module,
OpenRouter adapter extension/reuse, composition, encrypted host registrations,
outbox and focused tests. Keep model network outside DB lock. No frontend/docs/
scripts/data edits. Host/claim safety must be enforced in services, not routes.
Argon owns apps/web/** EXCEPT openapi.json/lib/api.generated.ts. Add camera/file
input(capture=environment), progress/results/retry/review/explicit completion to
held feed card; no direct feed pickup bypass. Host opt-in and de-identified review
queue, authorized deep link and worker handling. Reuse per-role push registration
logic without breaking student opt-in. New types may be narrow local interfaces
until integrator regenerates. Maintain explicit offline fixtures and seeded UI;
never silently fallback on API errors. New student flow has no GPS/location.
Codex owns contract, integration/generated types, docs and regression harness.

Fixture verifier is available ONLY with VISION_PROVIDER=fixture and explicit
DEMO_MODE/AUTH_MODE gates, returns clearly labeled simulated assessment, default
consistent. Optional PICKUP_FIXTURE_STATUS=consistent|uncertain|inconsistent can
control OFFLINE tests/rehearsal only; it MUST NOT affect live OpenRouter behavior.
No new live credentials needed. Fake/malformed providers in tests fail closed.
Keep health source labels honest if new pickup-provider health field is added.

Run full regression + meaningful tests: own activehold photo, unsupported/oversize,
expired/foreign claims rejected BEFORE provider call, concurrent idempotency,
processing/retry/expiry during model call, stale attempt, consistent explicit pickup,
uncertain/inconsistent cannot pickup, host request/approve/reject/expiry/ownership,
capacity/pickup races, once-only own-host notifications and opt-out, encrypted
storage/no identities/no retained photos, reset, feed/Maps/studentFCM/It and seeded
natural-expiry rehearsal. Integration browser tests fixture/log only on isolated
3027/8027; no real photos/push/vision calls without explicit authorized evidence.
Live3017/8017 and DeckScout8000 stay untouched until candidate verified. No Git
push/cloud deployment, survey distribution or submission edits. Fresh GLM review
binds clean worktree to exact integrated SHA after checks. Return actual
provider/model/base/worktree/branch/commit/checks/objections and limitations.
