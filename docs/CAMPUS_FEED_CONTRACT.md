# Campus-wide food feed contract

User-authorized successor to the Marietta location milestone. Starting application
SHA `9a61904562fa4739526df2a488ff16338c09f23c`; manager branch
`feature/campus-food-feed`. Overrides older nearby-only product guidance for
normal joined students. Keep work local; preserve unrelated dirty cloud files.
No student GPS, required location, check-in UI or student-location map markers.
Host alone selects the verified pickup building, room and instructions.

## Modes and compatibility

- Default `visitors` scenario is `campus_feed`: joined sessions have no location.
- Explicit `seeded` scenario is `seeded_waves`: preserve deterministic A–E
  invitations, pure planner, ring widening, diet filtering and old rehearsal.
- New `JoinRequest` requires nickname only; optional allergens/diets unchanged.
  Deprecated optional `area` is permitted for legacy *seeded rehearsal* callers
  only. In campus feed mode ignore it without storing/deriving a student cell;
  public SessionStudent.area is null (allow nullable for old rehearsal responses).
  No student-facing page renders location controls, including menu/check-in.
- Student presence endpoint may remain for explicit seeded compatibility but
  must reject feed visitor check-ins; do not silently record student location.
- Snapshot each drop's `distribution_mode` at publication (`campus_feed` or
  `seeded_waves`); legacy persisted drops without it default `seeded_waves`.
  Switching a reset scenario never converts a live drop's mode. Reset deletes
  drops/sessions/holds/outbox consistently, survey untouched and collection off.

## API shapes (all existing auth/error conventions)

`GET /students/me/feed` (student role) -> FeedResponse:

```
{ drops: FeedDrop[], server_time: UTC ISO8601, is_demo: boolean }
FeedDrop = {
  drop: DropResponse,
  can_reserve: boolean,
  unavailable_reason: null | 'allergen_conflict' | 'diet_mismatch' |
    'active_claim' | 'capacity' | 'already_reserved',
  claim: ClaimResponse | null
}
```

Return all unexpired published campus-feed drops (live OR claimed_out), newest
first with stable ID tie-break. Include incompatible drops with disabled reserve
and explanation based on only this student's preferences. Never include drafts,
expired drops, other students' claims/tokens/location/preferences/private tiers.
Listings use existing food items, immutable building snapshot, room/instructions,
counts.available and expires_at. Allergen estimate notice remains everywhere.
`claim` is own claim for that drop (including final status if present).
`can_reserve=false` for prior terminal reservation; held claim supports its own
release/pickup UI. Dietary mismatches take precedence over capacity explanations.
Alert pause does not disable browsing or safe manual reservation.

`POST /drops/{drop_id}/reserve` (student role, no request body) -> ClaimResponse.
No invitation, presence, ring or notification receipt prerequisite. Under the
existing serialized transaction: expire deadlines; authorize actor; validate
published campus-feed drop, expiry, current allergens/diets, one active hold per
student across drops, and available capacity. Idempotent retry of own held or
picked_up reservation returns same ID, even after preferences change; no double
allocation. One reservation per student/drop lifecycle (released/expired cannot
be recreated), preserving existing limit. Internal unique student/drop invite
may back existing Claim foreign keys but creates NO notification on reserve.
Do not require an unexpired 60-second invite. Hold lasts min(10 minutes, drop
expiry). Existing release/pickup routes and 409 capacity/active_claim/
allergen_conflict/diet_mismatch/invalid_state/drop_expired envelopes apply;
unknown/nonpublished inaccessible drop ->404. Counts invariant unchanged.

Add `distribution_mode` to DropResponse and DispatchResponse, legacy default
`seeded_waves`. In campus-feed dispatch, next_wave_at=null, no widening/wave
promises or student geographic marker/decision rows. Existing seeded rows stay.

`GET /distribution` (demo projector role only) -> CampusDistributionResponse:

```
{ distribution_mode: 'campus_feed' | 'seeded_waves',
  active_drops: int, joined_students: int, counts: Counts,
  buildings: BuildingDistribution[], server_time: UTC ISO8601, is_demo: boolean }
BuildingDistribution = {
  building_code: string, building: Building|null,
  active_drops: int, counts: Counts
}
```

Aggregate unexpired published campus-feed drops by host building (or explicit
rehearsal location); no visitor nicknames, student areas/cells, preference/tier,
contact data or delivery-receipt claims. Counts available/held/picked_up across
active drops; active_drops counts live+claimed_out, excludes expired/draft.
Empty overview works without a selected active drop. Projector maps/tiles show
host pickup distribution and verified H3 res11 geography, not student positions.

## One notification per new drop

At campus-feed publish, enqueue one durable student/drop opportunity for each
currently joined, alerts-on, dietary-compatible student without another active
hold. No geographic or presence checks, no capacity wave-size cap (all eligible
opted-in students receive the one new-drop announcement). FCM only sends to
existing authorized, registered, opted-in devices. No extra sends on feed GET,
join after publish, reserve/release, hold/invite expiry, tick, token replacement,
or repeated publish. Preserve encrypted token policy and fail-closed config.
Unique student/drop records plus atomic outbox/dedup keep duplicate/concurrent
ticks/publish from producing duplicates. No physical-receipt claim from mocks.
Document provider crash/ambiguous-response limits honestly; use a stable drop
notification tag/topic to collapse retries on-device. Existing seeded-wave
notifications remain tied to legacy invites, separate from normal feed behavior.

Campus-feed push opens `/student?drop=<drop_uuid>`; client loads authenticated
feed and focuses matching drop (safe empty state if expired), never credentials.
Support older invite deep links for seeded compatibility. Provider may include
both drop_id and invite_id; service worker MUST prefer drop_id for feed messages
and use stable drop tag, falling back to legacy invite link when appropriate.
Lock-screen text remains minimal and generic. No food/building/diet/tier/contact.
Backend owns payload fields; frontend owns worker handling.

## Ownership and checks

Claude Opus owns `services/api/**` (including schema implementation from this
contract and focused API/mock-provider tests). Do not modify apps/web, scripts,
data or docs; report any contract objection before changing semantics.
Argon owns `apps/web/**` except `openapi.json`, `lib/api.generated.ts` (integrator
regenerates). Implement narrow local type aliases/interfaces until regenerated.
Own frontend tests, fixture feed/reservation semantics, FCM worker deep links,
simple join, feed mobile UX and campus-wide projector. Host selector and It
exact-drop aggregate link/polling remain functional. No GPS or student check-in.
Codex owns contract, app wiring, generated schema/types, browser/regression
harnesses/docs and integration. A separate Codex integrator may be assigned.
Fresh GLM reviews exact integrated SHA in clean isolated checkout after checks.

Acceptance tests: location-free join; all-building multi-drop listing (including
late join/no invite and dietary mismatch tiles); current diet safety on reserve;
concurrent last-serving claims; idempotence; one global active hold; expiry/release
restore capacity; picked-up consumption; once-only new-drop FCM mock across
publish/tick/late registration; paused alerts don't prohibit browsing/reservation;
private own-session responses; host counts/It aggregate; projector sums/empty
state/no student geography; Maps walking URL no origin; explicit fixture mode
and seeded rehearsal retained. Automated runs fixture/log only, isolated ports
3027/8027; do not signal live3017/8017 or DeckScout8000. No real sends/photos,
cloud provisioning/deployment, survey distribution or Git push.
