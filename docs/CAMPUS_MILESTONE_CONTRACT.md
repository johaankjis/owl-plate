# Milestone 1: Marietta locations and walking directions

Manager baseline: `168e9164f8e6cf2927941ef0aa826c0b74758f6f` on
`revamp/join-demo`. Work stays local. Existing uncommitted cloud changes are
excluded and must remain untouched. Preserve OpenRouter, FCM, It companion,
capacity, safety filters, waves and deterministic seeded rehearsal.

## Shared dataset contract

`data/campus/marietta.json`: object with `schema_version: 1`,
`campus: "marietta"`, `buildings: [...]`.
Each building contains:

- `id`: stable lowercase slug prefixed `ksu-marietta-`; canonical application key.
- `name`: official current name.
- `building_code`: official letter/code string or null, never invented.
- `building_number`: official number string or null, never invented.
- `category`: `academic`, `student_life`, `housing`, or `other`.
- `latitude`, `longitude`: verified numeric coordinates, otherwise null.
- `verification_status`: `verified` or `unverified`.
- `sources`: array of `{url, title}` records. Coordinate evidence and official
  KSU map identity cross-check must be traceable in research notes.

Include initial requested buildings plus verified housing check-in options.
Retain unresolved records with null coordinates and documented uncertainty;
never enable them for selection/dispatch. Backend validation excludes them.
Coordinates represent a building location, not promised accessible entrances.
Dataset worker owns `data/campus/**` including validation and research notes.

## API contract (additive, existing conventions)

`GET /buildings` -> `{campus: "marietta", buildings: Building[]}`.
`Building` uses the same fields as verified dataset entries, with non-null
coordinates. Public building coordinates are safe. Do not expose student cells
or precise GPS. No location permission required.

Existing `DropEdit.building_code` accepts the canonical registry `id` for real
buildings, plus legacy rehearsal codes for deterministic demo compatibility.
Add `pickup_instructions: string = ""` (max 500) to DropEdit and DropResponse.
Add `building: Building | null = null` to DropResponse; null denotes rehearsal
locations. Preserve `room` (max 80), counts, auth and existing response fields.
Actual drop origin H3 cell comes from the verified registry coordinate at res 11.

Existing JoinRequest.area, SessionStudent.area, VisitorDecision.area become
bounded strings (max 80) accepting either canonical building IDs or four legacy
demo-area IDs. Join at a real building uses that building's res-11 H3 cell,
without artificial per-visitor location jitter. Invalid IDs -> 422
`invalid_building`. `POST /students/me/presence` already accepts building_code;
real building check-in refreshes both private cell/presence and own session area.
Keep two-hour presence expiry and stable session credentials.

`GET /demo/areas` remains the legacy fixture directory. Seeded A–E scenario and
its synthetic geography stay exactly reproducible. Campus joins/host selection
use `/buildings`; fixture choices must be clearly labeled and separate.
Wave gating remains actual H3 grid distance: k=2 then +2 up to 12, tick 10s,
60s demo invites, unchanged capacity and dietary rules.

## Frontend behavior

Searchable grouped building selector for host and student; categories from API.
Default campus mode uses verified entries only. Explicit rehearsal mode retains
legacy controls and fixtures without silently replacing campus coordinates.
Host submits canonical ID, room and pickup instructions. Student food cards show
building.name, room, pickup instructions. `Get directions` opens a Google Maps
URL with `api=1`, `destination=<latitude>,<longitude>`, `travelmode=walking`.
Omit origin (Google Maps may ask independently); do not request or store GPS.
Show directions only for verified building coordinates, never synthetic origin.
Keep mobile styling and companion's exact-drop aggregate link intact.

Backend worker owns `services/api/**`, focused API tests; may export a candidate
OpenAPI file under `build/` for integrator but must not edit apps/web.
Frontend worker owns `apps/web/**` except generated OpenAPI/schema artifacts,
which integrator regenerates from combined API. Develop against this contract
and locally typed building fields; do not fabricate campus coordinate fixtures.
Manager owns this contract. Codex integrator owns generated types, composition,
regression/browser harness, docs and combined verification after worker commits.
All editing workers commit only assigned paths and report actual provider/model,
starting SHA, worktree, branch, final SHA, checks, objections and limitations.

## Verification and approval boundaries

Use fixture vision/log notifications for automated tests; no real pushes or live
vision calls without an explicitly authorized photo/device. Preserve configured
live adapters and prove composition without leaking credentials. No pushes,
cloud deployments or default-branch merges. Local ZimaOS app restart for final
verification is authorized; preserve current live setup until candidate passes.
Physical receipt remains unverified until observed. Real It tap remains pending.
