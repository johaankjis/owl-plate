# Milestone 4: CARE Pantry Fallback — simulation only

Application baseline `2142a59c625877b72f39e8a11f01173148ed011e`.
Manager branch `feature/pantry-fallback`; workers start at the committed contract
above this baseline. Preserve canonical dirty cloud work, existing map runtime
`t3-50c95505` on3017/8017 and DeckScout8000. Candidate3027/8027 only.
No Git push, main merge, cloud deployment, presentation work or external messages.

## Official facts, policy and scope

Read updated `docs/DOMAIN.md`. Official CARE page verifies Marietta Pantry at
JMW Student Center, Room184. Demonstration destination is **KSU CARE Pantry**,
**Joe Mack Wilson Student Center, Room184**, building ID
`ksu-marietta-joe-mack-wilson-student-center`. Derive its building point from
unchanged verified43-location registry (33.940665,-84.520395), never GPS/entrance
claims. Google walking link: destination coordinates only, no origin/API key.
Official sources to display as links:
- https://campus.kennesaw.edu/current-students/student-affairs/wellbeing/care-services/
- https://campus.kennesaw.edu/offices-services/catering/policies.php

Required concise notice on host/coordinator cards and actions:
“Demo only — no request is sent to KSU CARE. KSU catering policy prohibits
removing leftovers from event spaces. This simulation does not authorize
redistribution or establish food safety.” Acknowledgment NEVER waives policy.
No email/phone/external send/contact; no inference that CARE accepts prepared
leftovers; no automatic donation or AI safety proof. Existing host-reviewed
safety/allergen statements remain estimates and host assertions. Handoff is
explicit **simulated** confirmation, not independently verified physical transfer.

## Inventory and lifecycle (single shared transaction boundary)

Add Counts.pantry_held:int>=0 default0 and Counts.pantry_transferred:int>=0 default0.
Existing picked_up means STUDENT pickups only and held means STUDENT holds only.
Invariant for every drop: total = available + held + picked_up + pantry_held +
pantry_transferred. No duplicated inventory ledger in UI/provider. All mutation
uses existing serialized transaction; _counts/_refresh/feed/distribution/maps/
notifications use this same invariant. Unexpired zero-capacity drops remain
claimed_out; expired drops never become live or reappear in feed/maps on release.
Pure seeded dispatch remains unchanged; pantry workflow supports campus_feed only.

One durable referral per drop (unique drop_id), idempotent creation/decisions.
Wire states: suggested,requested,accepted,handoff_confirmed,rejected,expired.
No repeated referrals after rejection/transfer this demo; record this scope.
Suggested/requested never allocate stock: students can reserve all available food.
Suggest once when unexpired published campus-feed drop has available>0 and
0<deadline-now<=10minutes (explicit reversible demo threshold, not KSU policy).
Existing scheduler/read transactions may create suggestion; no message or auto
request. Host may request earlier without a suggestion. No draft/seeded referrals.

requested_servings snapshots positive requested amount<=currently available.
It is not a reservation. Coordinator accepts chosen positive servings<=both
requested_servings and current available, rechecked under the SAME lock as student
reserve. Never cancel/shrink/override student holds or pickups. If fewer available
than displayed, accept must conflict409 or explicitly accept a smaller chosen
quantity. UI defaults to min(requested,eligible), never silently overbooks.
accepted allocation contributes pantry_held, reduces student/map availability,
remaining unallocated servings stay reservable. Same exact acceptance retry is
idempotent; different quantity/contradictory decision fails409.

Only publishing host can explicitly confirm accepted handoff before drop expiry.
Move accepted amount from pantry_held to pantry_transferred exactly once, preserving
student counts. No pickup photo check, no student identity, no host-pickup push for
pantry movement. Existing student pickup host notifications unchanged.
Coordinator reject only requested referrals (no inventory allocated), idempotent
repeat, otherwise409. Host request retry returns existing requested/accepted/final
record without changing quantity; suggested->requested is explicit. No reset of
terminal state. Expire suggested/requested/accepted at ORIGINAL drop deadline;
accepted untransferred allocation is released only on already-expired drop. That
food cannot reenter student feed. handoff_confirmed/rejected remain terminal.
Expiry/release/requests must never extend food deadlines. Demo reset clears referrals.

## Shared API (existing auth/error envelope, generated types)

New Actor role pantry_coordinator; synthetic token `demo-pantry-coordinator` valid
ONLY DEMO_MODE=true AND AUTH_MODE=demo. Coordinator endpoints enforce role+both
gates; no escalation through host/student/projector token. Existing role ACLs
unchanged. Host workflow also requires both demo gates + own published drop;
wrong host404, wrong role403. Students cannot access referrals/coordinator data.

PantryDestination:
`{name:string, building:Building, room:string, directions_url:string,
  care_source_url:string, catering_policy_url:string}`
Use verified destination; if registry destination absent, fail503 rather than
invent coordinates. Explicit fixture mode may provide existing verified registry
entry as a read-only destination; never make up campus points.

PantryReferral:
`{id:UUID,drop_id:UUID,status:PantryStatus,requested_servings:int,
  accepted_servings:int,transferred_servings:int,eligible_servings:int,
  created_at:UTC,updated_at:UTC,expires_at:UTC,
  destination:PantryDestination,drop:DropResponse,notice:string,is_demo:true}`
For suggested requested_servings=0; accepted/transferred start0. eligible_servings
is current available count (unallocated), never a promise. After acceptance,
accepted_servings remains historical accepted quantity even after handoff/expiry;
transferred_servings is0 until confirmed. DropResponse has host-reviewed safety
and aggregate counts only; no host/student IDs, preferences, token or claim rows.
All response fields public to authorized host/coordinator only. No photo retention.

- GET /drops/{drop_id}/pantry-referral ->
  `{referral:PantryReferral|null,destination:PantryDestination,notice:string,is_demo:true}`
  Own host; auto-suggestion may materialize under conditions above.
- POST /drops/{drop_id}/pantry-referral body
  `{servings:int>=1<=500,demo_policy_acknowledged:true}` -> PantryReferral.
  False/missing acknowledgment rejected with existing validation/error envelope.
- POST /drops/{drop_id}/pantry-referral/handoff body
  `{demo_handoff_confirmed:true}` -> PantryReferral. Own host only.
- GET /pantry/referrals -> `{referrals:PantryReferral[],server_time:UTC,is_demo:true}`
  Coordinator only; includes all demo lifecycle states; deterministic ordering.
- POST /pantry/referrals/{referral_id}/decision body
  `{decision:'accept'|'reject',servings?:int>=1<=500,demo_policy_acknowledged:true}`
  -> PantryReferral. Accept requires servings; reject must not allocate stock.

## Frontend contract and preservation

Host published Pickup counts screen: Donate remaining food card, remaining
eligible servings, quantity (positive<=current available), state, demo notice,
official links, destination/room/directions, explicit Request demo referral,
Confirm simulated handoff only for accepted. Poll about2seconds alongside counts.
Link Open demo pantry coordinator to `/pantry`; keep admin UI off student screens.
Coordinator `/pantry`: clearly Demo coordinator, own synthetic role client (not
projector credential), no real sign-in/KSUpartner claim. Cards show food, quantity,
pickup building/room/instructions, reviewed safety assertions/allergen estimate,
remaining collection time, current available vs requested, destination, state,
explicit simulated accept/reject and policy acknowledgment. Poll2seconds, disable
stale/expired/invalid controls, handle409 then refresh. No student identities.

Counts display distinguishes Student pickups, Pantry reserved, Pantry transfers;
existing available/reserved/collected student terminology remains truthful on map
and projector. Never combine pantry transfers into student pickups. Student UI
has no admin actions; availability/drop details automatically reflect actual stock.
Campus map geometry/coordinates/GPS privacy unchanged. Update offline fixtures with
same semantics and clear simulation labels; no silent API fallback. Maintain full
photo-assisted pickup and Firebase opt-ins/deep links. No new push recipients.

It companion must handle extended counts invariant, expose separate pantry_held
and pantry_transferred bindings/labels while preserving original fields/pageUUID
binding and backward compatibility with legacy counts lacking pantry fields.
Never report pantry movement as picked_up. Integrator owns prototypes/itcan/**.

## Disjoint ownership and required verification

Claude Opus: services/api/** only, business service in pantry module, schemas/
models/auth/router/composition/reset/counts/aggregate propagation and tests. No
frontend/generated/docs/scripts edits. Prove accept vs last-student-serving race,
duplicateaccept/handoff/request, existingholds,partialaccept/reject/expiry and
noexpiredresurrection/privacy/ACL/demo-gates; no realproviders/photos/push/servers.

Antigravity Neon: apps/web/** EXCEPT openapi.json/lib/api.generated.ts. Hostcard,
coordinator/client/types/fixtures/countdisplay/map aggregation/frontendtests. Use
narrow additive types until regentypes. No backend/docs/scripts/prototypes edits.
No liveports/realproviders/photos/push/servers/subagents/cloud/Gitpush.

Separate Codex integrator: scripts/**,Makefile,prototypes/itcan/**,
docs/PANTRY_HANDOFF.md,generatedOpenAPI/TS,finalwiring+aliascleanup. Prepare harness
independently; manager sends completed backendFIRST thenfrontendSECOND exactSHAs.
Do not poll workers/cherrypickunfinishedsource. Candidate3027/8027 fixture/log only.
Actual mobile+desktop UI acceptance: publish2/studentphoto+complete1/request1/
coordinatoraccept1/explicit hosthandoff ->total2 available0 held0 picked_up1
pantry_held0 pantry_transferred1. Additional real-route/UI checks suggestedtiming,
manualearly/reject/expiry/duplicate/races/capacity/map/noGPS/noadminstudents/It.
Demo-clock expiry distinct from natural seeded rehearsal. Run full248+API/52+web,
116eval,4campus,6+It,1591dataset,Ruff/lint/types/build/zero schema drift and existing
map/feed/pickupbad-result/seedednaturalexpiry regressions. Stop candidate, commit
clean exactSHA+handoff, then freshGLM5.3 review; manager switches local3017 only
afterreview, private existingOpenRouter/FCMconfig. Physicalpush/pickup/pantrytransfer,
liveaccuracy and realpairedIt remainUNVERIFIED. Returnactualworkerbindings/checks/
evidence/manualcommands/limitations. Never infer physical or KSU policy approval.
