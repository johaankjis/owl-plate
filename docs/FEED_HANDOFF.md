# Campus feed integration handoff

Status: local integration complete. Both source commits and integration fixes
are committed. The isolated fixture/log candidate was verified and stopped.

## Baseline and ownership

- Required starting application HEAD: `65b138860a288d7e5d3418ad87eec2361bb457e6`.
- Worktree: `<local-path>`.
- Branch: `t3/campus-feed-integration`; clean at entry.
- Runtime: Codex harness, `gpt-6.1-sol`, medium reasoning effort.
- Backend source commit: `6c6f82932ffdf6f481749d02c47e0517a66bace3`;
  inspected services-only diff and cherry-picked as `cc17951`.
- Frontend source commit: `0fa57559fb40818728ad4881734588b70b0573af`;
  inspected apps-only diff and cherry-picked as `a2a1e18`.
- Integration order: backend, then frontend; never read/cherry-pick unfinished work.
- Integrator owns scripts, generated OpenAPI/types, wiring, alias cleanup and docs.
  No competing backend/frontend source changes before their completed commits.
- Canonical dirty cloud docs and the live campus checkout are untouched.
  This clean worktree updates `ARCHITECTURE.md` and marks the old campus handoff
  historical; manager must preserve/reapply canonical cloud edits if cherry-picking
  documentation overlaps them. Canonical `docs/HANDOFF.md` was never edited here.

## Reproduce isolated checks

The canonical Python environment is executable read-only. Do not install into it.
Install frontend dependencies into this candidate's own `apps/web/node_modules`.
Run all commands from this worktree. Leave ports 3017/8017 and DeckScout8000 alone.

```bash
npm ci --prefix apps/web
.venv/bin/python -m scripts.export_openapi
npx --prefix apps/web --yes openapi-typescript@7.10.1 apps/web/openapi.json -o apps/web/lib/api.generated.ts
apps/web/node_modules/.bin/prettier --write apps/web/openapi.json apps/web/lib/api.generated.ts
.venv/bin/python -m pytest -q
.venv/bin/python -m unittest discover -s data/eval -p 'test_*.py'
.venv/bin/python -m unittest discover -s data/campus -p 'test_*.py'
.venv/bin/python -m unittest discover -s prototypes/itcan/tests -p 'test_*.py'
.venv/bin/ruff check services scripts data/eval data/campus
.venv/bin/ruff format --check services scripts data/eval data/campus
.venv/bin/python data/campus/validate_marietta.py
.venv/bin/python data/eval/run.py --fixtures
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run types
npm --prefix apps/web run build
```

Start only the isolated candidate, with an intentionally non-live companion origin
for exact-drop link checks (the browser harness never clicks that link):

```bash
NEXT_PUBLIC_IT_COMPANION_BASE_URL=http://127.0.0.1:9 \
  .venv/bin/python -m scripts.present \
  --port 3027 --api-port 8027 --vision fixture --notifications simulated --rebuild
```

The launcher uses this worktree's `build/present.db`; survey collection is off.
Fixture vision and log notifications must be verified by `/backend/health` before
any reset. Uploaded image and all visitor identities are synthetic. No mocked
HTTP routes or substituted campus dataset are used by the harness.

Browser prerequisites on this machine:

```bash
export OWL_PLAYWRIGHT_MODULE=<local-tool-path>
export OWL_BROWSER_EXECUTABLE=<local-path>
export LD_LIBRARY_PATH=<local-tool-path>
export FONTCONFIG_FILE=<local-tool-path>
OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_campus_feed.cjs
OWL_RECORD_VIDEO=false OWL_WEB_URL=http://127.0.0.1:3027 OWL_API_URL=http://127.0.0.1:8027 node scripts/rehearse_demo.cjs
```

`verify-feed` resets visitors mode and exercises actual campus feed routes at
mobile width. It checks location-free join payloads/menu, no GPS, two building
feed tiles, late joins without invites, disabled dietary mismatch, reservation,
idempotence, one global hold, concurrent last-serving allocation, paused-alert
browsing/reservation, release/pickup counts, expiry restoration, exact
walking links without origin, companion exact-drop href, aggregate projector and
deep-link focus. Hold expiry uses a labeled **demo clock advance**, not a claim
of ten real elapsed minutes. Backend tests cover transactional races and provider
mock deduplication; neither proves physical notification receipt.

`rehearse-seeded` explicitly resets `scenario=seeded` and preserves the old A–E
wave rehearsal, dairy exclusion, natural 60-second invite expiry and ring 4.
It does not use the feed's clock advance. Run it after the feed harness because
both intentionally reset the isolated database. Stop the launcher with Ctrl+C
when finished; its process groups belong only to this candidate. The launcher
prints a reset command containing the actual candidate API port and scenario.

Candidate URLs: `http://127.0.0.1:3027/host`, `/join`, `/student` and `/dispatch`.
The reset endpoint is **only** `http://127.0.0.1:3027/backend/demo/reset`
(direct API equivalent `http://127.0.0.1:8027/demo/reset`). For example:

```bash
curl --fail-with-body -X POST http://127.0.0.1:3027/backend/demo/reset \
  -H 'Authorization: Bearer demo-projector' -H 'Content-Type: application/json' \
  -d '{"scenario":"visitors"}'
```

Use `{"scenario":"seeded"}` only for the explicit A–E wave rehearsal. Reset
revokes joined sessions and device registrations. Do not use a default/live reset
command while verifying this candidate.

## Harness compatibility

`verify_campus_mobile.cjs` and `verify_join_flow.cjs` now forward to the feed
harness. Their old normal-visitor check-in/ring/four-visitor assumptions were
superseded by `CAMPUS_FEED_CONTRACT.md`. The seeded rehearsal remains in
`scripts/rehearse_demo.cjs`; historical recording evidence is unchanged.

## Evidence and pending work

- Node syntax checks: passed. Script Ruff check/format: passed.
- Candidate guard checks: 5 passed; live ports/remote hosts rejected before
  HTTP/reset (`test-results/candidate-guards.json`).
- Launcher unit tests: 14 passed after honoring explicit startup scenario.
- Integrated backend pytest: 197 passed (one upstream Starlette/httpx deprecation warning).
- Ruff check/format: passed across services, scripts, eval and campus Python.
- Evaluation units: 116 passed; fixture scoring run passed (synthetic scoring
  validation only, no measured live accuracy).
- Campus units: 4 passed; registry validator: 43 verified buildings, 1,591 checks,
  zero failures.
- It companion units: 6 passed; stand-ins only, no paired device tap.
- OpenAPI/types generation: passed from composed backend, repeat generation has
  zero drift; handwritten feed/join/drop/distribution overrides replaced with
  generated aliases. Frontend 39 units, ESLint/Prettier, Next
  route types/TypeScript and production build passed. Build rewrite points to
  `http://127.0.0.1:8027/:path*`.
- Composed backend smoke: passed with actual 43-building registry, late
  location-free join, two buildings, reserve/global hold/release and aggregate;
  `test-results/backend-feed-smoke.json`. Fixture/log only, temporary SQLite.
- Mobile actual-route feed: PASS on integration implementation commit
  `088d1945beab4723775af9ca1eae5d305bd08103` (recorded in
  `test-results/campus-feed/evidence.json`). Second-host
  publication uses real restore → Share another drop. Two-building projector
  UI and aggregate API match, including current joined count. All mobile pages
  have no horizontal overflow; no browser errors/GPS attempts/location payloads.
- Browser evidence uses the authorized Playwright/Chrome fallback. Preview status
  was unavailable; both preview opens failed with "This host is missing libraries
  T3's browser needs". Supplied library/font paths allowed real Chromium checks.
- Seeded A–E actual-route natural expiry: PASS, A/C wave one, B dairy
  exclusion, A held, natural C expiry and D ring four, followed by clean reset.
  No student location controls appear in seeded menus either. The final run took
  93.389 seconds with no clock advance, on the same browser-tested code SHA.
- Evidence output: `test-results/campus-feed/evidence.json` and PNGs;
  `test-results/rehearsal/timing.json` and PNGs (local ignored files).
- Browser-tested application code: `088d1945beab4723775af9ca1eae5d305bd08103`.
  The final commit only finalizes handoff documentation; its exact SHA is returned
  with the result because this file cannot embed its own commit hash.
- Student/join headers now explicitly label fixture vision as saved demo
  estimates alongside simulated notifications. The launcher reset hint includes
  API 8027 and the actual scenario; its 14 unit tests still pass.
- Candidate shutdown evidence: `test-results/candidate-stopped.json`; only the
  verified launcher from this checkout was signalled, which stopped its own
  API/web process groups. Ports 3027/8027 closed afterward; protected live ports
  3017/8017 and DeckScout8000 remained listening before and after shutdown.

Physical Android and Home Screen iPhone push receipt, live-model accuracy on an
independent labeled set, and a paired It device tap remain unverified. Mock/log
sends and exact companion hrefs do not establish these outcomes. No real vision,
push, cloud provisioning, survey distribution, deployment or Git push is part of
this integration. This container has no `make` binary. Validation uses the exact
recipe commands directly; Make targets are included for teammates with GNU Make. The canonical
Python environment is used only to execute installed tools.

Backend limits: feed sends happen while holding the serialized database lock, so
provider latency delays writes. A crash after transport acceptance and before
outbox commit can repeat an announcement; the stable drop tag/Web Push topic
mitigates device duplicates but does not establish exactly-once delivery. Feed
FCM TTL is 900 seconds. A unique student/drop outbox prevents normal repeated
publish/tick enqueueing. Older database rows retain compatibility without a
schema migration; feed visitor area is an empty database string and public null,
with no derived student cell or location in student data.

Integration fix: failed-send retries now recheck joined session validity,
alert consent, current allergens/diets, and existing reservations. Ineligible
opportunities are consumed without transport while retaining the unique pair;
restoring preferences does not revive them. Five regression cases cover leaving,
pausing, allergen/diet changes, and acquiring a hold. `sent` internally means
handled (including cancelled), never a physical delivery receipt.

Own existing claims take explanation precedence over dietary mismatch; current
dietary checks still gate a new reservation.

Payload wiring uses `notification_mode=campus_feed|seeded_waves`. Feed payloads
contain `drop_id` and no `invite_id`. The service worker honors the mode, prefers
the feed drop destination and stable tag, and keeps seeded/invite-only fallback.
Mock FCM composition covers both fixture and mocked OpenRouter composition,
once-only enqueue/send semantics, late registration and legacy seeded payloads;
no real provider is called.

The existing recorded fallback is explicitly the legacy seeded-wave scenario,
not a campus-feed recording. Submission deck/video are unchanged in this milestone.
