# Simulated pantry integration handoff

Status: integrated and verified locally; candidate stopped. All ten final route/browser
evidence files pass and bind the implementation SHA below. The final commit adds
only this handoff document.
All pantry requests, decisions and handoffs are simulation only. No request is sent to
KSU CARE. Official KSU catering policy prohibits removing leftovers from event spaces;
no demo acknowledgment waives that prohibition or establishes food safety or acceptance.

## Source and runtime bindings

- Actual integrator runtime: Codex / `gpt-6.1-sol`, medium effort.
- Isolated pwd and Git top level: `/home/node/.t3/worktrees/owl-plate/t3-fb57e289`.
- Branch: `t3/pantry-aggregate-compat`.
- Clean entry HEAD: `5596ccc2678fe506e539f2e10c8a9ce0ab0b38ec`.
- Contract application baseline: `2142a59c625877b72f39e8a11f01173148ed011e`.
- Completed backend source: `9e13cf2d5f975854acc7b061b3e063376e9afef6`, parent
  exactly entry HEAD, 13 services/api files only. Integrated FIRST as
  `7572676f614904ad830bf2262abdc7366a8e0f67`.
- Completed frontend source: `844d7f77c6dfe15d2005ca9375b965ff29456c37`, parent
  exactly entry HEAD, 18 apps/web files excluding generated artifacts. Integrated
  SECOND as `5a6e3fc05aaddbd1766024a79088071fbc77ca10`.
- Implementation and final evidence SHA: `a0cb9240bb30655b0a15baf5164bbc748fc8b91f`.
- Final handoff commit is a **docs-only tail** above this implementation;
  its SHA is returned separately. No application changes belong in that tail.

The ten prepared files survived backend integration byte-for-byte; frontend
integration preserved the independent edits and generated artifacts. Workers were
not polled and unfinished source was never inspected. No subagents, Git push,
cloud changes, presentation changes, contact, real provider calls, real photos or
real notifications. Protected t3-50c95505 on 3017/8017, DeckScout8000 and canonical
dirty cloud files were untouched. Canonical Python/Ruff were executable read-only,
with cwd and PYTHONPATH in this worktree. Only candidate 3027/8027 was launched.

## Integration changes and accepted details

Generated OpenAPI/TS includes the pantry endpoints and five-bucket inventory;
frontend temporary additive overrides now alias generated schemas. Coordinator
cards now carry official CARE/catering links directly alongside their policy
notice; the page-level official links also remain. Pantry room formatting already
handles the full backend `Room 184` string without a doubled prefix. Visual
inspection also caught a historical accepted quantity labeled Pantry reserved
after handoff. The coordinator now labels that history Accepted servings; actual
pantry reserved remains the separate current count. Final UI assertions and
screenshots verify the distinction. This correction is commit
`a0cb9240bb30655b0a15baf5164bbc748fc8b91f`, above integration implementation
`996580e8b0cfa4821c021c19462b87eb67e563b9`.

The It helper and actual HTML screen preserve the UUID/page binding, credential
boundary and original fields. Separate pantry_held and pantry_transferred
bindings/labels never inflate picked_up (student pickups) or held (student holds).
Legacy missing pantry fields default to zero. Every helper result must satisfy
`total = available + held + picked_up + pantry_held + pantry_transferred`, with
nonnegative counts. Ten stand-in tests include the earlier six invariants.

Accepted backend choices: seeded/draft GET referral returns null, their mutations
return HTTP 409; missing/nonaccepted handoff returns HTTP 409; coordinator GET/drop remains
404; coordinator list includes suggested referrals, but decisions require requested.
One durable referral per drop remains terminal after rejection or transfer.

New candidate-only harness targets are `make verify-pantry-routes` and
`make verify-pantry-ui`. Six guards reject unsafe targets before HTTP/reset.
The initial harness nickname exceeded the API's 24-character limit; it now uses a
short unique synthetic nickname. Host expiry intentionally retains the existing
return-to-upload behavior, so UI checks assert removal of stale pantry controls
rather than expect an expired host card. Existing feed/seeded count literals gained
explicit zero pantry fields; all previous count, dietary, privacy, map and expiry
assertions remain in force.

## Checks and evidence

Final results and SHA bindings are recorded in ignored `test-results/pantry-checks.json`.

- Full API: **272 passed**, one upstream Starlette/httpx deprecation warning.
- Web: **60 passed**; ESLint/Prettier, Next route types and TypeScript passed.
- Production candidate build passed, including `/pantry`, against API 8027.
- Eval: **116 passed**; synthetic fixture scorer passed, with no live-accuracy claim.
- Campus: **4 passed**, **43 verified buildings / 1,591 checks / zero failures**.
- It: **10 stand-in tests passed**, with no paired physical tap.
- Ruff check/format: **105 Python files** passed.
- New/updated harness syntax, Prettier and whitespace checks passed; six candidate
  target guards rejected before HTTP/reset.
- Repeated OpenAPI/TS generation: **zero hash drift**. SHA256:
  OpenAPI `4e4ed866d53d40efb472b41d2d0de739f89c7a094d0fec4f03bd5bfa79ffa886`;
  TS `cbf2dd137fb76259ec47dd1c1cc6567213a8242515414df3dc49360ea94bce49`.
  Mobile coverage uses Chromium mobile viewport/touch emulation, not a physical
  phone. No binary photo, screenshot, student record or recording is committed.

| Artifact                                                                       | Coverage and limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-results/pantry-routes/evidence.json`                                     | Actual candidate HTTP: early manual request; pending requests allocate nothing and allow student reserve/photo/explicit pickup; request/accept/handoff retries and contradictions; separate final counts; partial acceptance bounded by current capacity; existing holds preserved; remaining stock reservable; rejection allocates nothing; suggestion only within final 10 minutes using an explicitly labeled demo clock; requested/accepted expiry blocks accept/handoff and release cannot resurrect feed/map inventory; five last-serving student-vs-pantry races; concurrent duplicate request/accept/handoff; role/privacy and official policy/destination. No browser/physical proof from these checks.                                                                                                                                                                                                                                                                                                                                  |
| `test-results/pantry-ui/evidence.json` and PNGs                                | Actual mobile 390x844 and desktop 1440x1000 UI: host publishes 2, student reserves/uploads a synthetic photo/explicitly completes 1, host manually requests 1 before suggestion, separate synthetic coordinator accepts 1, publishing host checks confirmation and explicitly records simulated handoff. Final total 2 / available 0 / held 0 / picked_up 1 / pantry_held 0 / pantry_transferred 1. Host/projector/map update by polling without reload; student pin disappears on acceptance; projector keeps student and pantry counts distinct; exact-drop It helper reads the real route. Both viewports also exercise suggestion/request/reject, requested expiry and accepted expiry; stale host/coordinator actions disappear, HTTP rejects stale mutation, expired inventory leaves projector. Dedicated coordinator credentials are checked on actual requests. No GPS attempts, page errors or horizontal overflow in main flow. Host/coordinator notices and official links checked. It helper/href are stand-ins for a paired It tap. |
| `test-results/campus-map/evidence.json` and PNGs                               | Existing actual mobile/desktop map, exact verified building coordinates/res11 H3, grouping, touch/drag/zoom/fit, dietary disabled actions, pickup directions without origin/GPS, fallback accessible list, reserve/release, synthetic-photo explicit completion, polled projector aggregates and no stale pins/actions. Hold/drop expiry uses labeled demo advance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `test-results/campus-feed/evidence.json` and PNGs                              | Existing actual mobile location-free join, reviewed host buildings, dietary tiles, reserve/release, synthetic-photo explicit completion, host polling, destination-only walking links, exact It href without following it, capacity race, feed deep links and aggregate privacy. Hold expiry uses labeled demo advance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `test-results/pickup-routes-{consistent,uncertain,inconsistent}/evidence.json` | Actual HTTP image validation, authorization, required verification, idempotency, no silent bad-result consumption, de-identified review queue, reject/retry/supersede, explicit approval, contradictory/stale decisions, release/expiry and aggregate preservation. Fixture status is configured separately for each phase.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `test-results/pickup-mobile-{uncertain,inconsistent}/evidence.json` and PNGs   | Actual mobile student/host upload progress with network latency, bad result, retake/review request, de-identified queue, reject, retake, explicit host approval, completed card and counts. Labeled demo advance expires a hold and removes stale review UI; HTTP rejects stale approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `test-results/rehearsal/timing.json` and PNGs                                  | Explicit seeded A–E browser regression, synthetic geography/personas, dietary exclusion, A hold, natural C invitation expiry, D/ring4 widening, seeded-only legacy pickup/retry and final clean reset. No demo clock advance. This is the natural-expiry evidence; pantry/map/feed/pickup advances are not natural expiry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| API/web/It unit and ASGI suites                                                | Deterministic dietary filtering, serialized inventory, ACL/demo gates/privacy, pantry states/races/idempotency/expiry, notification payloads/outbox separation, malformed-provider fail-closed behavior, student pickup review, map geometry/selection and It aggregate compatibility. Provider/transport tests use mocks; no real push/vision/device.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Shared preview status was unavailable. Both preview opens failed with
“This host is missing libraries T3's browser needs” (including libglib/libnss and
other Chromium libraries). The explicitly authorized fallback below performed
actual Chromium checks. No shared preview tab was created.

## Reproduce locally

This container lacks GNU Make. Run the equivalent direct recipes from this worktree:

```bash
PYTHONPATH=. /home/node/projects/owl-plate/.venv/bin/python -m pytest -q
PYTHONPATH=. /home/node/projects/owl-plate/.venv/bin/python -m unittest discover -s data/eval -p 'test_*.py'
PYTHONPATH=. /home/node/projects/owl-plate/.venv/bin/python -m unittest discover -s data/campus -p 'test_*.py'
PYTHONPATH=. /home/node/projects/owl-plate/.venv/bin/python -m unittest discover -s prototypes/itcan/tests -p 'test_*.py'
PYTHONPATH=. /home/node/projects/owl-plate/.venv/bin/python data/campus/validate_marietta.py
PYTHONPATH=. /home/node/projects/owl-plate/.venv/bin/python data/eval/run.py --fixtures
/home/node/projects/owl-plate/.venv/bin/ruff check services scripts data/eval data/campus prototypes/itcan
/home/node/projects/owl-plate/.venv/bin/ruff format --check services scripts data/eval data/campus prototypes/itcan
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run types
```

Regenerate twice and compare SHA256 hashes:

```bash
PYTHONPATH=. /home/node/projects/owl-plate/.venv/bin/python -m scripts.export_openapi
npx --prefix apps/web --yes openapi-typescript@7.10.1 apps/web/openapi.json -o apps/web/lib/api.generated.ts
apps/web/node_modules/.bin/prettier --write apps/web/openapi.json apps/web/lib/api.generated.ts
```

Start only the candidate in a dedicated terminal:

```bash
NEXT_PUBLIC_IT_COMPANION_BASE_URL=http://127.0.0.1:9 PYTHONPATH=. \
  /home/node/projects/owl-plate/.venv/bin/python -m scripts.present \
  --port 3027 --api-port 8027 --vision fixture --notifications simulated --rebuild
```

Browser environment and sequential checks (every harness resets state):

```bash
export OWL_PLAYWRIGHT_MODULE=/tmp/owl-browser-run/node_modules/playwright-core
export OWL_BROWSER_EXECUTABLE=/home/node/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome
export LD_LIBRARY_PATH=/tmp/owl-https-review/libs/usr/lib/x86_64-linux-gnu:/tmp/owl-https-review/libs/lib/x86_64-linux-gnu
export FONTCONFIG_FILE=/tmp/owl-campus-tools/fonts.conf
export OWL_WEB_URL=http://127.0.0.1:3027
export OWL_API_URL=http://127.0.0.1:8027
export OWL_RECORD_VIDEO=false
node scripts/verify_pantry_routes.cjs
node scripts/verify_pantry_ui.cjs
node scripts/verify_campus_map.cjs
node scripts/verify_campus_feed.cjs
node scripts/verify_pickup_routes.cjs
node scripts/rehearse_demo.cjs
```

Stop this candidate with Ctrl+C in its launcher terminal. Restart the same command
with `PICKUP_FIXTURE_STATUS=uncertain` prefixed (cached build may omit `--rebuild`),
then run the two commands below. Repeat separately with `inconsistent`, on both
launcher and commands. Do not run consistent-only pantry/map/feed in these phases.

```bash
PICKUP_FIXTURE_STATUS=uncertain node scripts/verify_pickup_routes.cjs
PICKUP_FIXTURE_STATUS=uncertain node scripts/verify_pickup_mobile.cjs
```

## Exact manual simulation

Use the consistent fixture/log candidate above. Generate a synthetic PNG locally:

```bash
OWL_WEB_URL=http://127.0.0.1:3027 node -e 'require("node:fs").writeFileSync("/tmp/owl-pantry-synthetic.png", require("./scripts/pantry_harness.cjs").photo)'
```

1. Open `http://127.0.0.1:3027/host`. Upload that PNG, analyze the saved estimate,
   set 2 servings, choose a reviewed building/room, check the demo host safety
   assertions and publish. These assertions do not certify food safety.
2. In a separate browser context open `/join`, enter a synthetic nickname,
   reserve the drop, upload the same synthetic PNG and explicitly confirm pickup.
   The photo alone does not consume the hold. Host should show 1 available / 1 student
   pickup and no pantry allocation.
3. On the host pantry card review the policy prohibition and official links,
   choose 1 serving, acknowledge the demo notice and click Request demo referral.
   This creates a pending simulation and reserves nothing; students can still
   reserve available stock until an acceptance allocates it.
4. Open `/pantry` in a separate context. It identifies the dedicated synthetic
   demo coordinator. Acknowledge the notice and explicitly accept 1 serving.
   Host/projector show pantry-held 1 and student-picked-up 1. Student map availability
   disappears for this exhausted drop. No contact or transfer occurs.
5. Back on the publishing host check the simulated handoff confirmation and click
   Confirm simulated handoff. Expect total 2 / available 0 / student-held 0 / student-picked-up 1 /
   pantry-held 0 / pantry-transferred 1. `/dispatch` updates automatically.
6. Read the exact-drop It helper without pairing or sending an It action:

   ```bash
   python3 prototypes/itcan/whats_left.py --base http://127.0.0.1:3027 --drop-id <published-uuid>
   ```

   Its same six counts are aggregate-only. The companion href remains bound to
   `owl-whats-left-<published-uuid>`; localhost port 9 is a deliberate nonpaired test
   target. Physical paired It setup/tap requires separate verification.

Pantry suggestion/expiry demonstrations use the explicit demo clock in the
harness: 2101 seconds total enters the final 10 minutes of a 45-minute drop;
2701 seconds expires a fresh 45-minute drop. This threshold is a reversible demo
choice, not KSU policy. Only the seeded rehearsal verifies natural timeout.

## Shutdown and limits

All final phases passed: pantry routes and both-viewports UI, map, feed,
consistent/uncertain/inconsistent pickup routes, uncertain/inconsistent mobile
review flows, and seeded natural expiry. The natural seeded rehearsal took
**91.483 seconds**; D's browser invite appeared at
81.099 seconds and the final reset was verified at
87.394 seconds.

`test-results/pantry-checks.json` consolidates actual checks, ten PASS evidence
bindings and generated hashes. `test-results/pantry-candidate-stopped.json`
confirms 3027/8027 closed while protected 3017/8017/8000 remain listening. Only
launchers whose arguments named 3027/8027 and whose /proc cwd matched this
worktree received SIGINT; each shut down its own API/web children cleanly. No
application source changed after the final evidence SHA. The docs-only tail
records these results; the checkout is clean at handoff.

The manager's next step is fresh exact-SHA independent GLM review before any
local runtime switch. No objection to that local review is known.
Physical Android/Home Screen iPhone push, actual pickup, actual pantry transfer,
independent live-model accuracy and real paired It remain **UNVERIFIED**. No
simulation, fixture photo assessment or acknowledgment authorizes real
redistribution, proves food safety or establishes that CARE accepts prepared
leftovers. No nonessential product question blocks local review. The manager owns
fresh exact-SHA GLM review and any subsequent authorized local runtime switch.
