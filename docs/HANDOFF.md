# Owl Plate checkpoint

Deadline: Friday November 20, 2026 at noon America/New_York (17:00 UTC). Johaan submits. Thursday evening reserved for rehearsal, physical-phone capture and backup. No pushes, default-branch merges, deployments, survey distribution or submission authorized.

## Preflight

Canonical root `/home/node/projects/owl-plate`, T3 Owl Plate project `093405f7-8dec-4840-b584-9743d828c0b5`. Separate from DeckScout. Original `main` SHA `d11c4be01bcbd375dafabf50c2f59c6daaf513ec`, clean. No other workers/worktrees at start. Local integration branch `integration/owl-plate-demo`. Full project brief attachment unavailable; user message plus existing docs are working spec. Read AGENTS.md, CLAUDE.md and all project docs.

## Routing and ownership

Confirmed capabilities: Codex `codex/gpt-6.1-sol`; Antigravity `antigravity/gemini-4-argon`; OpenCode `opencode/openrouter/z-ai/glm-5.3`. Claude instance `claudeAgent` exists, but “Uber’s Wi-Fi” resolves to no intended model. Claude idle; Codex fallback owns backend implementation until clarified. Worktrees must start from committed contract baseline, startFromOrigin=false. See API_CONTRACT.md for boundaries and accepted scheduling clarifications. Thread links, exact SHAs and check outputs will be appended as runs start/finish.

## Questions for Johaan

| Priority | Decision needed | Blocks | Safe interim choice | Latest useful time |
|---|---|---|---|---|
| 1 | Which exact Claude model did “Uber’s Wi-Fi” mean? T3 lists Opus 5.5, Sonnet 5.5, Fable 5.2, Haiku 5.5; none matches that label. | Claude backend routing | Leave Claude idle; Codex backend fallback | Before reassignment; independent work proceeds |
| 2 | Which Android and Home Screen iPhone are authorized demo recipients, and when can owners participate? | Physical push proof and recording | Synthetic log only; no real notifications | Wednesday evening; Thursday rehearsal latest |
| 3 | Provide access via private secret cards/existing environment for Gemini model/key and Firebase configuration when ready. Do not put secrets in chat. | Live vision and push verification | Explicit cached fixture and log adapter | Wednesday evening to collect evidence |
| 4 | Supply tray photo(s), hand-counted servings and ingredient/menu allergen labels. | Measured vision accuracy and known-photo cache | Clearly labeled offline fixtures; no accuracy claims | Thursday afternoon |
| 5 | Approve survey distribution/channel and nominate owner; real results needed with n. | Campus impact evidence | Prepare copy locally, no distribution | Wednesday to allow Thursday close |
| 6 | Confirm KSU food redistribution policy/contact and verified building coordinates. | Campus policy claims and real map | Synthetic origin; no approval claims | Before physical rehearsal/pitch |

Entra and deployment access will be queued only when needed. Meal swipes, Bedrock, Twilio, live Entra and learned show rate are deferred in that order to protect the demo loop.

## Evidence and next milestone

No app exists at preflight. No physical push, live Gemini photo, real survey responses, or measured vision accuracy yet. Initial milestone: local photo → labeled vision fixture → safety review → wave 1 A/C → A claim → C expires → wave 2 D, all through HTTP routes. No provider credentials printed or copied. Offline evidence must remain visibly labeled.

## Worker checkpoint: contract baseline committed

Shared starting SHA: `68ec96b44ec1db81039c405a867e1d7b5d499800`. All worktrees verified at that SHA with `git worktree list`; T3 readback confirms actual selected model and distinct bindings. No existing edits were overwritten. Repo-local Git identity is `Codex <codex@users.noreply.github.com>` because no identity was configured; no global Git config changed.

| Assignment | Thread link | Branch / worktree | Actual provider/model | State |
|---|---|---|---|---|
| Backend fallback | <t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/mcp:launch:71a8e43bc4c8b57c1c234254debae65192534617b27fe2e6a171b14d191b9da0> | `worker/owl-backend`, `/home/node/.t3/worktrees/owl-plate/worker-owl-backend` | codex / gpt-6.1-sol | Editing |
| Web | <t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/mcp:launch:fe974b4a28e2d0e0a1a3b965f4956b2533de81ee496eb5541fcf54de2f6e85e2> | `worker/owl-web`, `/home/node/.t3/worktrees/owl-plate/worker-owl-web` | antigravity / gemini-4-argon | Editing |
| Eval | <t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/mcp:launch:97e9634f666ab743c06f04e9ce216e3edaa39118c12700abe25af821f287d368> | `worker/owl-eval`, `/home/node/.t3/worktrees/owl-plate/worker-owl-eval` | opencode / openrouter/z-ai/glm-5.3 | Editing |

Manager checks so far: four vision safety/provenance tests passed; manager Python Ruff check and format passed. PowerPoint reload/archive integrity passed, seven slides with notes on all seven. Actual PowerPoint visual inspection remains pending. Initial python venv creation failed due missing ensurepip; `uv venv --python 3.11` succeeded, dependencies installed locally. Credentials check found no `.env`, Gemini, Firebase or Entra config; no values were printed. KSU News source returned HTTP 200 and verified the narrow CARE program-description claim, not policy or demand.

Next: inspect committed worker diffs, compose backend using its documented hooks, generate types, run combined checks and route demo, then independent review of exact integration SHA. Local commands after integration: `cp .env.example .env`, `make setup`, `make demo`, `make dev`; verification `make test lint types smoke`, `cd apps/web && npm run build`.

## Verified integrator: initial local pass (Nov 18)

This checkpoint supersedes the earlier worker states for backend integration only. T3 configuration and active-run readback confirm actual `codex/gpt-6.1-sol` (medium), bound to canonical `/home/node/.t3/worktrees/owl-plate/integration-owl-plate-verified`, branch `integration/owl-plate-verified`. `pwd -P`, Git top-level and T3 worktree binding agree; the manager checkout remains distinct. Starting HEAD was exactly `68ec96b44ec1db81039c405a867e1d7b5d499800`, with clean status before edits.

Integrator thread: <t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/mcp:launch:8f85c5dc9d076be2472ee45b52e47033bd857db23d19aaa33453c837b0eb5b3b>.

Inspected accepted diffs; no overlapping file paths or cherry-pick conflicts. Applied only these source commits, in this order:

| Accepted source | Local cherry-pick |
|---|---|
| `c6b85e191eefd57fcfba4c09fa4364992434080e` (manager adapters/composition/materials) | `296a0cf5e60ba351ff9e6e8688dd5c715f70569e` |
| `915d22aa28656d0ccb6b16a7689f220de61e5bb8` (manager runbook/config) | `5da35508d2033aaa0968f08dbf771855bcda56b9` |
| `f712f4087ed2f3c9d5e5f7a213b195f8cb83af1e` (backend) | `7a569a3957d410032573980e5c3b82e5d5f2e8e2` |

Integration fix `059d58d526c77f539d884606720d641124f7b623` sorts the composed app's imports to satisfy Ruff. No behavioral changes were needed for the initial route flow. The manager packaging fix is included; the backend README's earlier setuptools discovery warning is historical, resolved by the accepted manager commit.

Checks use manager Python **3.11.2** at `/home/node/projects/owl-plate/.venv/bin/python`, from this worktree with `PYTHONPATH=.`; imported `services.api.application.__file__` resolves inside this worktree. No shared-environment packages were installed or changed.

| Check | Actual result |
|---|---|
| `PYTHONPATH=. /home/node/projects/owl-plate/.venv/bin/python -m pytest -q services/api/tests` | 47 passed; one Starlette/httpx TestClient deprecation warning |
| `/home/node/projects/owl-plate/.venv/bin/ruff check services scripts` | All checks passed |
| `/home/node/projects/owl-plate/.venv/bin/ruff format --check services scripts` | 27 files already formatted |
| `git diff --check` | Passed |
| `PYTHONPATH=. /tmp/owl-plate-verified-tools/root/usr/bin/make smoke PYTHON=/home/node/projects/owl-plate/.venv/bin/python` | Passed through composed HTTP app and isolated temporary SQLite |
| Composed route probes | `/health` 200, unauthenticated invites 401, push-token registration 503 `provider_unavailable` without echoing token, `/openapi.json` 200 with 15 paths |

The smoke verified 30 synthetic students, valid raster upload, explicitly fixture vision, host review to **2 servings**, A/C wave 1, B/E excluded, A idempotent hold, C expiry, D wave 2 at ring 4, consistent counts, private synthetic projector output and clean reset. Host responses remain counts/food only; projector access is restricted to synthetic personas. No real tiers, contacts or tokens were logged.

Container prerequisite: `make` is absent from system PATH. A Debian GNU Make 4.3 binary was downloaded/extracted only under `/tmp/owl-plate-verified-tools` to execute the real target; no system package or shared Python environment was modified. Install GNU Make on a rehearsal machine. The temporary tool path is environment-specific, not a project dependency.

### Continuation after accepted web/eval SHAs

Web and eval directories are absent from this integration checkout. Do not pick their branches or edit web before exact accepted SHAs arrive. Full `make test`, `make lint`, `make types`, web build and shared-preview browser verification remain pending, as do final root README/runbook accuracy and generated frontend aliases derived from actual composed OpenAPI. Browser run is authorized by the user; no browser flow has been verified yet. No subagents, pushes, deployments or default-branch merges were performed or authorized.

Manager review requirements to check after web acceptance: API is the default, network/mutation failures remain visible errors, standalone UI fixtures require explicit build/env opt-in plus a clear banner, photo upload timeout is at least 60 seconds, and sample images contain genuine raster bytes rather than SVG mislabeled as JPEG. Inspect accepted eval test layout and run the worker's exact test command; root unittest discovery may miss nested tests without package markers. Do not claim zero-discovered tests as validation.

FCM/encrypted push registration, Entra, deployment, live provider credentials, physical-device delivery and measured real-photo vision accuracy remain pending. Push registration's explicit 503 is intentional evidence of missing integration. Fixture/log success proves local deterministic behavior only.

## Accepted FCM/eval and integration hooks (Nov 18 continuation)

Accepted manager FCM `3b35054c111099512d6a7fe442ec9a6b1a8c77c5` was inspected and cherry-picked as `2e1e54bf9df27bdbddbffa7fcbb62240d37b048b`. Accepted eval `bd423acf364f235661f596833206bd7236b73173` was inspected and cherry-picked next as `6b2851266af78d61d994b5d0141fcfdd167e9507`. No unaccepted worker branch was integrated. Manager-owned FCM/provider tests were left untouched until acceptance; subsequent changes there are import sorting only.

Optional `NOTIFICATION_PROVIDER=fcm` now imports the provider's table metadata before database creation, instantiates encrypted TokenVault and allowlisted FcmNotifications, and injects registration into the route after current-student authorization. The allowlist must contain synthetic seed UUIDs. Configuration errors fail closed without printing credentials. `log` mode still returns 503 for registration. Auth requires explicit `AUTH_MODE=demo` and `DEMO_MODE=true`, including for live Gemini. Reset deletes any present PushRegistration table's records in the same transaction as all other demo state, while tolerating older stores without that table. Scheduler catches SQLAlchemyError and retries with a generic message, without SQL parameters or exception bodies.

The only approved contract addition is `GET /demo/active-drop`, with DemoActiveDropResponse generated from its Pydantic schema once web lands. Demo host/projector only; selects newest created_at among draft/live/claimed_out under the backend transaction boundary, excludes expired drops, and returns only a UUID or null. Reset restores null. Tests cover selection, claims, drafts, expiry, reset and role/demo gates.

Eval's original 114-test discovery command is correct: `python -m unittest discover -s data/eval -p 'test_*.py'`. Keep the existing make command; the alternate `-s data/eval/tests` is unsupported. Initial combined run found a schema-drift test regex that could not parse the manager's multiline Allergen Literal. Replaced it with Python AST inspection. Routine Ruff cleanup covers eval; `make lint` now includes data/eval. Added two honesty checks: explicitly synthetic predictions cannot support measured accuracy even if labeled source=gemini, and missing human provenance cannot support it. Eval now has 116 tests. Fixture text and JSON passed; missing live credentials returned exit 1 before a provider request. No fixture numbers were added to slides.

Mocked composition checks cover encrypted own-token registration, unauthorized roles, log-mode 503, sanitized database errors, token cleanup on reset, missing allowlist, explicit auth gates and scheduler recovery after SQLAlchemyError. Provider HTTP tests use MockTransport; service-account setup is mocked in route checks. No real FCM or Gemini sends, no live credentials, no observed device receipts. The shared Python environment already supplied the FCM dependencies; no packages were changed there. Runbook and architecture now distinguish implemented demo FCM from unverified delivery/production readiness.

Final continuation checks: `PYTHONPATH=. /tmp/owl-plate-verified-tools/root/usr/bin/make test smoke PYTHON=/home/node/projects/owl-plate/.venv/bin/python` passed: **62 API tests**, **116 eval tests**, and full composed HTTP demo smoke. One Starlette/httpx deprecation warning remains. Ruff check passed for services/scripts/data/eval; Ruff format reports 48 files already formatted. `git diff --check` passed. Full make lint still awaits accepted web. Fixture CLI text/JSON and missing-credentials guard passed separately; these prove harness behavior only.

Web acceptance remains pending. After the exact SHA arrives: API default with visible errors; explicit fixture opt-in/banner; >=60s photo timeout; raster sample bytes; projector polls active-drop across devices; truthful reset message (students seeded, no wave); remove visible CARE/priority-tier phrases while retaining serving-count privacy copy and simulated markers. Generate true schema aliases/OpenAPI including DemoActiveDropResponse, finish full lint/build/types and root README accuracy. Manager owns final integrated browser proof: shared preview failed missing system libraries, and manager is preparing temporary Playwright libraries. Integrator must not duplicate browser/server setup; provide the final candidate SHA for that verification.
