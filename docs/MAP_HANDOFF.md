# Campus food map integration handoff

Status: local integration verified; candidate stopped. Fixture/browser evidence does not establish
physical push, physical pickup, live accuracy or a paired It tap.

## Source bindings

- Worktree: `<local-path>`.
- Branch: `t3/map-handoff-harness`; clean entry HEAD:
  `80edd58cd5fa52db7bafddd6b90c9322a013c19a`.
- Application baseline: `32c630afb28c4066347fc3297ec867d0bb2f7438`.
- Actual runtime provider/model: Codex / `gpt-6.1-sol`, medium effort.
- Completed backend source `b0b04be3b5ad0d41be036a07ead0524a5ad654e6`,
  parent exactly entry HEAD, five services/api files only; integrated FIRST as
  `c2051813ec602a659f648e7ba235b2de8ba18712`.
- Completed frontend source `19dc4a5ed20f9df3caa5442156dcb787d41f1c50`,
  parent exactly entry HEAD, nine apps/web files excluding generated artifacts;
  integrated SECOND as `8d67686deb5221d66d31ca1022a029224c722475`.
- Implementation and final browser-evidence binding:
  `431f54427a50c3dc0be67af3d4a1bd9a4357fc05`.
  The final handoff-only commit is returned separately.

Workers were never polled, and unfinished source was never inspected or
integrated. Prepared harness edits survived both cherry-picks. No Git push,
cloud edits, subagents, real model calls, real photos or real notifications.
Canonical dirty changes and protected reviewed t3-ff981a24 runtime on 3017/8017,
plus DeckScout8000, remain untouched. The manager owns preservation, fresh
exact-SHA independent GLM5.3 review and any subsequent local runtime switch.

## Integration changes

Generated OpenAPI and TypeScript include required nonnegative available_drops
at campus and building levels. Temporary additive frontend overrides now alias
the generated schema directly. The feed regression's building-count selector
now selects list rows, excluding the new availability/status child labels.

`make verify-map` adds an isolated real-route mobile/desktop map harness.
It requires loopback HTTP 3027, validates fixture/log health before reset, uses
only synthetic PNGs/people and existing verified building records, and records
exact marker/H3 metadata. It does not mock application endpoints or counts.
Existing feed, pickup bad-result and natural-expiry seeded harnesses are retained.
Release tests use a different student to reserve reappearing capacity because
released claims cannot reserve the same drop again.

## Checks and evidence

- Full API: **248 passed**, one upstream Starlette/httpx deprecation warning.
- Web: **52 passed**; ESLint/Prettier, Next route types and TypeScript passed.
- Production build passed for candidate backend `http://127.0.0.1:8027`.
- Ruff check/format: **97 Python files** passed.
- Eval: **116 passed**, fixture scoring passed. Synthetic scoring is not measured
  model accuracy.
- Campus: **4 passed**, **43 verified buildings / 1,591 checks / zero failures**.
- It: **6 stand-in tests passed**, no paired physical tap.
- Repeated OpenAPI/TypeScript generation: zero hash drift.
- Node syntax/Prettier/whitespace: passed; six target guard rejections passed
  before HTTP/reset (`test-results/map-candidate-guards.json`).

| Artifact                                                                       | Actual coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-results/campus-map/evidence.json` and PNGs                               | Actual mobile and desktop UI: Feed default, Map toggle, verified Academic Building and Library exact lat/lng and res11 H3, same-building two-drop grouping/badge/IDs, 44px marker targets, touch-driven mobile pan, desktop drag, zoom controls/fit, marker-to-details and exact walking destination without origin/GPS. Both viewports reserve/upload synthetic photo/explicitly complete; photo alone leaves collected count unchanged. Projector polls available/reserved/collected and active/available drop metadata without reload. Last-serving pin disappears while own hold remains; release restores availability, then another student reserves it. No-WebGL accessible list shows dietary disabled reason/directions and separately performs actual reserve/release. Map hold expiry uses a labeled 601-second demo advance; UI hold disappears/capacity restores and stale pickup HTTP rejects. A further 2701-second advance removes expired pins, selected actions and projector inventory; stale reserve HTTP rejects. No browser errors/GPS/mobile overflow. |
| `test-results/campus-feed/evidence.json` and PNGs                              | Existing actual mobile join/feed, reviewed host buildings, dietary tiles, reserve/release, consistent photo and separate completion, host count polling, Maps URL, exact It href without following it, concurrent last-serving HTTP capacity, feed deep-link focus and aggregate projector privacy. Hold expiry is labeled demo advance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `test-results/pickup-routes-{consistent,uncertain,inconsistent}/evidence.json` | Actual HTTP: image validation, authorization, idempotency, required verification, no silent bad-result consumption, de-identified queue, reject/retry/supersede, explicit approval and contradictory/stale decisions, release/expiry and aggregate preservation. No browser or physical delivery claim from these route checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `test-results/pickup-mobile-{uncertain,inconsistent}/evidence.json` and PNGs   | Actual mobile student/host UI: upload progress with emulated network latency, bad result, retake, review request, de-identified host queue, reject, retake, explicit approval, completed card and counts. Labeled demo advance expires a hold and removes stale review UI; HTTP rejects stale approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `test-results/rehearsal/timing.json` and PNGs                                  | Existing explicit seeded A–E browser rehearsal: synthetic geography/personas, A/C wave 1, B dairy exclusion, A hold, natural C invite expiry, D ring 4, seeded-only legacy pickup/retry, final clean reset. No demo clock advance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| API/web unit suites                                                            | Dietary safety, transactional inventory, ACL/privacy, available-drop lifecycle, malformed providers fail closed, host approval, notification payloads/deep links, browser temporary preview revocation and map geometry/selection helpers. Provider/transport tests are mocks; no real push/vision/device.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

All eight final browser/HTTP evidence files bind the implementation SHA above. Screenshots
are ignored local artifacts; no binary photos, student records or recordings
are committed. Map completed status is verified by hold removal, route snapshot
and projector polling; the existing `picked-up-card` is a Feed-view element.
Only the explicitly seeded invitation rehearsal establishes natural expiry;
map/feed/pickup hold/drop expiry checks use labeled demo clock advances.

Shared preview status was unavailable. Both preview opens failed with
"This host is missing libraries T3's browser needs". Actual Chromium checks use
the authorized fallback paths below. No shared preview tab was created.

## Reproduce

This container lacks GNU Make; use direct recipes from this worktree:

```bash
PYTHONPATH=. .venv/bin/python -m pytest -q
PYTHONPATH=. .venv/bin/python -m unittest discover -s data/eval -p 'test_*.py'
PYTHONPATH=. .venv/bin/python -m unittest discover -s data/campus -p 'test_*.py'
PYTHONPATH=. .venv/bin/python -m unittest discover -s prototypes/itcan/tests -p 'test_*.py'
PYTHONPATH=. .venv/bin/python data/campus/validate_marietta.py
PYTHONPATH=. .venv/bin/python data/eval/run.py --fixtures
.venv/bin/ruff check services scripts data/eval data/campus
.venv/bin/ruff format --check services scripts data/eval data/campus
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run types
```

Regenerate twice and compare file hashes:

```bash
PYTHONPATH=. .venv/bin/python -m scripts.export_openapi
npx --prefix apps/web --yes openapi-typescript@7.10.1 apps/web/openapi.json -o apps/web/lib/api.generated.ts
apps/web/node_modules/.bin/prettier --write apps/web/openapi.json apps/web/lib/api.generated.ts
```

Start candidate ONLY:

```bash
NEXT_PUBLIC_IT_COMPANION_BASE_URL=http://127.0.0.1:9 PYTHONPATH=. \
  .venv/bin/python -m scripts.present \
  --port 3027 --api-port 8027 --vision fixture --notifications simulated --rebuild
```

Browser environment and sequential checks:

```bash
export OWL_PLAYWRIGHT_MODULE=<local-tool-path>
export OWL_BROWSER_EXECUTABLE=<local-path>
export LD_LIBRARY_PATH=<local-tool-path>
export FONTCONFIG_FILE=<local-tool-path>
export OWL_WEB_URL=http://127.0.0.1:3027
export OWL_API_URL=http://127.0.0.1:8027
export OWL_RECORD_VIDEO=false
node scripts/verify_campus_map.cjs
node scripts/verify_campus_feed.cjs
node scripts/verify_pickup_routes.cjs
node scripts/rehearse_demo.cjs
```

Stop only this candidate launcher. Restart with
`PICKUP_FIXTURE_STATUS=uncertain` prefixed to the same launcher (cached build may
omit --rebuild), then run both `scripts/verify_pickup_routes.cjs` and
`scripts/verify_pickup_mobile.cjs` with matching `PICKUP_FIXTURE_STATUS=uncertain`.
Repeat separately with `inconsistent`. Each harness resets state; run sequentially.
Never run the consistent-only feed/map harness in a bad-result phase. Canonical
Python/Ruff are executable read-only; all commands use this worktree as cwd.

## Shutdown and remaining evidence

All final phases passed: map, feed, consistent/uncertain/inconsistent pickup
routes, uncertain/inconsistent mobile host/student review, and seeded rehearsal.
The natural seeded rehearsal took **89.599 seconds**; D browser invite appeared
at 79.195 seconds, seeded legacy pickup/retry at 79.309 seconds, and final reset
was verified at 85.508 seconds.

`test-results/map-checks.json` consolidates actual checks, eight PASS evidence
bindings and generated hashes. `test-results/map-candidate-stopped.json` confirms
3027/8027 closed while protected 3017/8017/8000 remained listening. Only launchers
whose arguments named 3027/8027 and whose /proc cwd matched this worktree were
sent SIGINT; each launcher shut down its own API/web children cleanly. The final
handoff commit changes only this document; the worktree is clean at handoff.
Physical Android/Home Screen iPhone push, actual physical pickup, independent
live-model accuracy and real paired It remain unverified. Fixture assessments,
synthetic screenshots and transport acceptance establish none of these. Final
exact-SHA independent GLM5.3 review is the manager's next step before any local
runtime switch. No objection to local review is known once final phases pass.
