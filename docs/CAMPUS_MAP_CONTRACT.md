# Milestone 3: campus food availability map

Application baseline: `32c630afb28c4066347fc3297ec867d0bb2f7438`.
Manager branch: `feature/campus-food-map`. Worker entry is the committed
contract immediately above that baseline. Keep all work local; no Git push,
cloud deployment, live provider call, real notification or submission edits.
Preserve canonical dirty cloud files and reviewed runtime t3-ff981a24 on
3017/8017, plus unrelated DeckScout8000. Candidate ports3027/8027 only.

## Shared API and inventory contract

Reuse `GET /students/me/feed` (student session) as the complete student source.
No new student map endpoint, area, GPS, presence, geographic filter or location
permission. FeedDrop already carries DropResponse with immutable verified
building snapshot, room, pickup instructions, food, deadline, Counts,
can_reserve/unavailable_reason and own claim. Reserve remains
`POST /drops/{id}/reserve`; Map and Feed share selection/reservation/hold state
and all existing dietary, one-active-hold, transactional capacity and
photo-assisted completion rules. A map action cannot bypass these controls.

Reuse projector-only `GET /distribution`. Preserve all existing fields,
permissions and meanings. Add exactly these additive integer fields (>=0):

- CampusDistributionResponse.available_drops
- BuildingDistribution.available_drops

`active_drops` includes unexpired published live/claimed_out campus-feed drops.
`available_drops` counts only those active drops with Counts.available >0.
Counts stay `{total,available,held,picked_up}` from the same serialized inventory
snapshot as existing feed/reserve/pickup. Never recalculate capacity from
notifications/waves or store duplicate map inventory. Draft, expired and seeded
wave drops are absent from campus distribution. Keep claimed_out contributions
to held/collected totals until drop expiry, even if available_drops becomes0.
A building with no available servings can remain in projector totals/status;
it is not advertised as active food availability. Release/hold expiry restores
availability on next poll. At drop expiry all its contributions leave the active
snapshot. The counts represent current unexpired drops, not lifetime totals.

No coordinates for students, student identifiers, nicknames, claims, tokens,
priority, diets or preferences in projector aggregates. Host verified building
coordinates are public pickup points; derive res11 H3 via existing h3-js and
verified snapshot, no new topology API. `GET /buildings` remains43 verified
records. Do not edit/research/invent campus coordinates this milestone.

## Student interface

Add Feed / Map toggle on normal campus student view, Feed stays default.
Map fits Marietta verified building points, permits touch/desktop pan and zoom,
and shows clear north/geographic context. Reuse existing mapping components or
factor shared geometry, with no paid mapping service/key. A campus plot with
verified building reference labels is acceptable; if external OpenStreetMap
tiles are used, include visible attribution and graceful network failure.
Never fabricate roads/building footprints or mislabel schematic locations.

Available markers require: unexpired campus-feed DropResponse, verified building
snapshot via existing verification helper, Counts.available >0. Coordinate is
exact snapshot latitude/longitude, never jittered/offset for overlap. Same
building may group drops: marker badge sums available servings, tap opens the
list of individual listings at that exact building. Each listing keeps own drop
ID, food, building/room/instructions, counts, deadline, dietary notice,
reservation/disabled reason and exact Google Maps walking destination. Directions
have no origin/API key/GPS. Students may see incompatible listings but cannot
reserve them. Reserve delegates existing action and opens/retains existing hold
and photo-assisted pickup flow. Deep links continue to work on Feed and Map.

Active availability removes exhausted/expired markers automatically. Keep own
hold/pickup UI accessible when its available marker disappears; do not erase
active claims by filtering marker data. Handle selected drop exhausting,
expiring, releasing, disappearing or losing verified coordinates without stale
reserve action. No synthetic point on real campus. Explain unplottable rehearsal
listings separately and keep usable Feed fallback. Empty/loading/error/fallback
states are explicit. Include accessible DOM marker buttons/list alternatives,
selected state and44px targets; avoid mobile overflow. No WebGL must still allow
browse/reserve/directions with honest fallback.

## Projector

Replace/factor only campus-feed branch of DispatchMap as needed; preserve the
explicit seeded map and deterministic A-E natural-expiry rehearsal. Use verified
pickup building coordinates and res11 H3 aggregates; fit all actual points,
no student dots, GPS claims, synthetic jitter or concentric invitation rings in
campus mode. Show available/reserved/collected terminology mapping held=>reserved
and picked_up=>collected. Badge/legend distinguishes availability from exhausted
but held/collected status. Poll existing sources about2seconds; update on publish,
reserve, release, photo-assisted completion or host approval. Use snapshot
counts, not guessed deltas. Include aggregate accessible text and empty state.
Keep fixture vision/simulated notifications labels independent of real campus
coordinate provenance: actual campus points do not imply real people or push.

## Ownership and verification

Claude Opus owns only services/api/**: inspect existing contracts, implement
minimal additive fields and tests. No frontend/generated/doc edits. Test counts
across2buildings/multiple drops, reserve/release/pickup/review/hold expiry/drop
expiry and privacy/permissions; full API and Ruff. No new storage/provider.

Antigravity Neon owns apps/web/** EXCEPT openapi.json/lib/api.generated.ts.
Implement shared map interfaces/helpers, student toggle/actions, projector,
fixtures and frontend tests. Use narrow additive types for available_drops until
integration regeneration. Preserve all other app and SW/FCM/pickup/It behavior.
No backend/scripts/docs edits. Tests/lint/types/build required.

Separate Codex integrator owns scripts/**, Makefile, docs/MAP_HANDOFF.md,
generated OpenAPI/TS, final wiring and alias cleanup. It receives completed
backend SHA FIRST then frontend SHA SECOND; no polling unfinished workers.
Prepare harness independently and commit only after combined actual checks.
Use isolated3027/8027 fixture vision/log notifications/synthetic photos. Verify
mobile+desktop2real buildings at exact coordinates, pan/zoom/marker tap->reserve,
polled count change after photo-assisted pickup, last-serving disappearance,
release reappearance, expiry removal, multiple drops/same-building aggregation,
noGPS, accessible fallback and no stale actions. Keep seeded natural-expiry
rehearsal and full feed/pickup/Maps/It regression. Report actual UI vs route/mock
coverage. Run245+API,45+web,116eval,4campus,6It,1591dataset checks; Ruff,
ESLint/Prettier/types/build/schema zero drift. Shut down candidate; protected
services untouched. Final exact-SHA independent GLM5.3 review before any local
runtime switch. Fixture/mobile emulation do not prove physical push, real pickup,
live-model accuracy or paired It tap; those remain unverified.
