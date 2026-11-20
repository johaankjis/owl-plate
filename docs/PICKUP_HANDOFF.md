# Photo-assisted pickup integration handoff

Status: local integration complete; candidate verified and stopped. No live
provider or physical pickup claim is implied. The exact routes, models and
privacy rules are frozen in `docs/PICKUP_CONFIRMATION_CONTRACT.md`.

## Source and candidate bindings

- Required and verified entry HEAD: `d0a62666053a68ba8facc2eb131fe35817871a2e`.
- Worktree: `<local-path>`.
- Branch: `t3/pickup-confirmation-flow`; clean at entry.
- Actual provider/model: `codex` / `gpt-6.1-sol`, medium effort, confirmed from
  runtime metadata.
- Backend completed source: `53edc7be60437ebbd95385aae8dde156f5add739`, parent
  exactly the entry HEAD, services-only diff; cherry-picked FIRST as
  `dfd5e22b43c30d97cc2334c90a43fc558c4e5bf0`.
- Frontend completed source: `7c9aea3f88aa965db54479afd6885cb94ff88b7c`, parent
  exactly the entry HEAD, 15 apps/web files excluding generated artifacts;
  cherry-picked SECOND as `7ad23fb436d2dc2c6e88d0f3039f1c5ed606301b`.
- Browser-tested implementation: `01eae1ba06b0ba5fa1f40aa2ce0766af3ff7a9eb`.
  The final commit only completes this handoff; its SHA is returned separately
  because a document cannot contain its own commit hash.
- No unfinished worker source was inspected/integrated and no workers were
  polled. Prepared harness changes survived both cherry-picks.
- Canonical dirty `.env.example`, `docs/HANDOFF.md` and `docs/ARCHITECTURE.md`
  remain untouched. This candidate updates its own `.env.example`; the manager
  must preserve/reapply canonical changes when transferring it. Live feed
  checkout `t3-6914e326` on 3017/8017 and DeckScout8000 were never stopped/reset.

## Integration changes

Pickup HTTP types now alias the generated composed schema, including nullable
results and review state. `.env.example` documents offline fixture controls and
existing OpenRouter configuration without credentials. The feed harness now
requires a photo/result before explicit completion; seeded no-body completion
remains explicitly labeled and separately rehearsed. Added pickup route/mobile
harnesses and `make verify-pickup` / `make verify-pickup-mobile`.

Two actual integration gaps were fixed. Next's default 10 MB middleware buffer
truncated oversized multipart requests before the API could return its error;
its buffer now allows 12 MB while the API still enforces a 10 MiB photo limit.
Starlette normally spools files over 1 MiB to disk; the API now parses multipart
through a bounded memory-only route adapter (10 MiB plus 64 KiB form envelope),
closes form buffers after handling, and preserves FastAPI schema/validation.
Two regression tests verify a 2 MiB upload never rolls to disk and excessive
bodies fail without disk spill. No image bytes, metadata, hashes or data URLs are
stored by the application. The browser's temporary preview URL is revoked.

## Checks and coverage

- Backend: **245 pytest passed**, one upstream Starlette/httpx deprecation
  warning. Ruff check/format passed across services/scripts/eval/campus
  (**96 Python files**).
- Frontend: **45 units passed**, ESLint/Prettier passed, Next route types and
  TypeScript passed, production build passed with `/backend` rewriting to
  `http://127.0.0.1:8027`. Generated OpenAPI/TypeScript repeated with zero drift,
  including after the multipart route integration.
- Eval: **116 units passed**; synthetic fixture scoring passed. These fixture
  metrics validate scoring only and are not measured vision/pickup accuracy.
- Campus: **4 units passed**, **43 verified buildings / 1,591 validation checks /
  zero failures**. It companion: **6 stand-in units passed**, no physical tap.
- Node syntax/Prettier/whitespace passed for harnesses. **6 candidate guards**
  rejected protected/remote targets before HTTP/reset; evidence:
  `test-results/pickup-candidate-guards.json`.
- Dependencies installed only into this candidate's `apps/web/node_modules`.
  The canonical Python/ruff environment was executable read-only. npm reported
  17 existing audit findings (4 moderate, 13 high); upgrades were outside scope.

| Evidence                                                                       | Actual coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test-results/campus-feed/evidence.json` and PNGs                              | Mobile UI: location-free join, real reviewed buildings, incompatible tiles, reserve/release, capture-enabled file input with synthetic PNG, consistent fixture result, mandatory notice, separate explicit completion, host counts. Actual routes: direct POST without result rejected and completion retry idempotent. Also Maps exact walking destination without origin, exact It drop href, aggregate projector, concurrent capacity, feed deep-link focus, no GPS/browser errors/mobile overflow. |
| `test-results/pickup-mobile-uncertain/evidence.json` and PNGs                  | Actual mobile student/host UI: upload progress (real requests with emulated latency), uncertain result, retake, explicit review request, de-identified host queue, reject, retake after rejection, explicit human approval, completed card and counts. Demo clock advance through a route, followed by UI hold/queue removal and stale approval POST rejection.                                                                                                                                        |
| `test-results/pickup-mobile-inconsistent/evidence.json` and PNGs               | Same actual UI sequence with inconsistent results; completion stays disabled. Neither bad-result phase silently consumes a serving.                                                                                                                                                                                                                                                                                                                                                                    |
| `test-results/pickup-routes-{consistent,uncertain,inconsistent}/evidence.json` | Separate real HTTP phases: unsupported/oversize images; own/foreign claims; request idempotency; no-result bypass; no silent consumption; bad results blocked; de-identified queue; reject/retry/supersede; explicit approve with idempotency/contradictory decision; release/expiry/stale rejection; restored counts and aggregate preservation. Log-mode host opt-in honestly returns unavailable without sending.                                                                                   |
| Backend and web unit suites                                                    | Processing/concurrency, stale processing recovery, expiry during model call, malformed/error provider fail-closed behavior, confidence normalization, authorization/foreign host, encrypted registration/reset, once-only own-host enqueue, deferred opt-out, mock FCM payload/privacy, role-specific opt-in and service-worker host/feed/seeded deep links, temporary preview revocation. No real transport or model calls.                                                                           |
| `test-results/rehearsal/timing.json` and PNGs                                  | Explicit seeded A–E browser rehearsal: A/C wave one, B dairy exclusion, A hold, natural C invite expiry, D at ring 4, then legacy no-body pickup/retry and final clean seeded reset. No demo clock advance in this run.                                                                                                                                                                                                                                                                                |

All successful final browser/route evidence binds the implementation SHA above.
Hold expiry in feed/pickup harnesses uses a labeled **601-second demo clock
advance**. Only the seeded invitation rehearsal waits naturally. Mobile camera
input/file upload is exercised with synthetic bytes; no physical camera receipt
or real photo is claimed. Host wrong-owner authorization and push registration/
transport behavior are unit/mock coverage, not a second physical host/device.
The exact It href is checked without following the companion link.

Shared preview status was unavailable and both preview opens failed with
"This host is missing libraries T3's browser needs". Actual Chromium checks used
the user-authorized Playwright fallback with the supplied library/font paths.

## Reproduce

Run from this worktree. This container lacks GNU Make; direct recipe commands:

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
```

Repeat generation and `git diff --exit-code -- apps/web/openapi.json
apps/web/lib/api.generated.ts` to check schema drift. Start ONLY the candidate:

```bash
NEXT_PUBLIC_IT_COMPANION_BASE_URL=http://127.0.0.1:9 \
  .venv/bin/python -m scripts.present \
  --port 3027 --api-port 8027 --vision fixture --notifications simulated --rebuild
```

The launcher builds production web, resets its own `build/present.db`, turns
survey collection off and labels fixture/log mode. Verify `/backend/health`
reports demo, fixture vision/pickup and simulated notifications before reset.
In a separate terminal:

```bash
export OWL_PLAYWRIGHT_MODULE=<local-tool-path>
export OWL_BROWSER_EXECUTABLE=<local-path>
export LD_LIBRARY_PATH=<local-tool-path>
export FONTCONFIG_FILE=<local-tool-path>
OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_campus_feed.cjs
OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_pickup_routes.cjs
OWL_RECORD_VIDEO=false OWL_WEB_URL=http://127.0.0.1:3027 OWL_API_URL=http://127.0.0.1:8027 node scripts/rehearse_demo.cjs
```

Bad-result phases run separately. Stop only this launcher with Ctrl+C, restart
with `PICKUP_FIXTURE_STATUS=uncertain` prefixed to the same fixture launcher
command (cached build may omit `--rebuild`), then run:

```bash
PICKUP_FIXTURE_STATUS=uncertain OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_pickup_routes.cjs
PICKUP_FIXTURE_STATUS=uncertain OWL_WEB_URL=http://127.0.0.1:3027 node scripts/verify_pickup_mobile.cjs
```

Repeat with `inconsistent` on both launcher and harnesses. They assert the
server's returned status matches the phase. Never run the consistent-only feed
harness in a bad-result phase. `PICKUP_FIXTURE_STATUS` works only with fixture
vision and explicit demo/auth gates; it does not alter live OpenRouter behavior.
All harnesses intentionally reset candidate state, so run them sequentially.
Reset revokes joined sessions and both role registrations. The only allowed
candidate reset URLs are `http://127.0.0.1:3027/backend/demo/reset` or direct API
`http://127.0.0.1:8027/demo/reset`; never reuse a live default reset command.

## Shutdown and remaining evidence

The final seeded natural-expiry rehearsal took **89.462 seconds**. A held at
30.811 seconds; C expiry / D ring 4 was observed at 72.803 seconds; legacy
seeded-only pickup/retry at 79.188 seconds; final reset at 85.372 seconds.

Candidate shutdown: `test-results/pickup-candidate-stopped.json`. Only the launcher
whose arguments specified 3027/8027 and whose `/proc/<pid>/cwd` matched this
worktree was signaled. Its own process groups exited cleanly. Ports 3027/8027
were closed afterward; protected 3017/8017/8000 were listening before and after.
`test-results/pickup-checks.json` consolidates check results and generated hashes.
All local evidence files are ignored artifacts; no binary photos, recordings or
student data were added to Git. The worktree is clean at the final handoff.

Physical Android/Home Screen iPhone push receipt, actual physical pickup,
independent live-model pickup accuracy, and a real paired It device tap remain
unverified. Fixture results, screenshots, transport acceptance and unit/mock
checks establish none of these. No real sends/photos/providers, Git push,
deployment, cloud changes, survey distribution or submission edits occurred.
A consistent photo result permits a separate explicit completion. Human host
approval is recorded as an override, not an AI consistent verdict. Every result,
review and completion carries: "Photo-assisted confirmation. A photo cannot
independently establish physical pickup or food safety."

Durable claim events prevent normal duplicate enqueue/consumption; stable tags
mitigate repeated notification display. Ambiguous transport acceptance followed
by a crash cannot guarantee exactly-once physical delivery. Live-model threshold
0.8 remains a conservative demo assumption rather than a measured accuracy
claim. Future framework upgrades must retain the memory parser regression tests.
