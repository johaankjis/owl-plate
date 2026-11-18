# Owl Plate checkpoint

## Questions for Johaan — return queue (survey first)

**1. Approve survey copy, audience and named distribution owner.** Proposed
audience: KSU student members of AI Club Discord and team-accessible class/club
channels, with each channel owner's permission. Proposed owner: **Johaan**, or
one teammate he explicitly names. Create/approve the form link, copy and channels
before sending. Nothing has been distributed; **survey n=0**. Full questionnaire:
`submission/SURVEY.md`. Approval is useful on Wednesday so collection can close
Thursday evening; safe interim is unsent copy and no results on the deck.

Copy ready for approval (not sent):

> We’re building Owl Plate for the AI Club hackathon: a host photographs leftover event food, reviews an estimate, and invites nearby students who can eat it. Help us understand campus needs with a voluntary two-minute anonymous survey: [FORM LINK]. Skip any question; please don’t enter names or personal details. We’ll report aggregate counts with the number of responses. This is a student prototype, not an official KSU service.

| Priority | Decision / action | What it blocks | Safe interim | Latest useful decision |
|---|---|---|---|---|
| 2 | Name an authorized Android owner and Home Screen iPhone owner, approve recording, and arrange a reachable trusted HTTPS origin. Proposed synthetic mapping: Android A, iPhone C; D receipt can use a separately labeled authorized run. | Physical push receipts and phone recording | Browser/log demo only; no real sends or endpoint deployment | Wednesday evening, before Thursday rehearsal |
| 3 | Supply Gemini exact model/private access and Firebase config via private secret cards/existing environment; approve only nominated synthetic UUID recipients. No secrets in chat. | Live vision and FCM | Explicit fixture vision and log notifications | Wednesday evening / Thursday early afternoon latest |
| 4 | Provide tray JPEG/PNG photos, hand-counted serving units and ingredient/menu allergen evidence with human label provenance. | Real-photo vision evaluation | No measured accuracy; known-answer fixtures only | Thursday afternoon |
| 5 | Confirm campus food policy/contact and sourced building coordinates. | Campus policy claims and geographic realism | Arbitrary labeled H3 origin, no partnership/approval claims | Before physical rehearsal and pitch |
| 6 | Confirm speaker roles/team contributions and native PowerPoint/venue playback; review final deck/video/note. | Human pitch rehearsal and final package approval | Prepared cue sheet and rendered PDF fallback | Thursday evening |
| 7 | Clarify exact Claude model intended by “Uber’s Wi-Fi” if future work needs it. | Optional routing only | Claude remains idle; backend already implemented | Before reassignment |

Deployment, survey distribution and submission remain Johaan's approval/action.
No paid services provisioned, notifications sent to real phones, or secrets
requested in chat. The live checklist has empty receipt/eval fields ready for
actual evidence once access exists.

## Latest checkpoint: slides reviewed, timed rehearsal and labeled fallback complete

Continued from canonical `demo/owl-plate-ready` at
`684e20b8a6d145be27fe5eadcc0be5b6fadbb761`. **Reviewed application code is unchanged**
from GLM-passed `f025edd224fe06d2dadd94ae699dd393e8adf8da`. Only rehearsal tooling,
submission materials and docs changed; original main and all worker worktrees
remain intact. No new workers were launched. Exact final rehearsal commit is
recorded in the manager thread after committing this checkpoint.

All seven PowerPoint slides rendered with isolated LibreOffice 7.4.7 to PDF and
1600×901 PNGs and were visually inspected individually: readable, no clipping,
no footer collisions. Aptos substituted with embedded DejaVu Sans; native
PowerPoint/venue playback still needs a check. Changes: every footer now states
FIXTURE VISION / SIMULATED ALERTS / LIVE EVIDENCE PENDING (12pt); slide 4 says
“B is skipped” rather than promising “B stays safe.” No evidence values invented.
`submission/SLIDE_REVIEW.md` records the slide-by-slide results. PPTX seven-slide,
speaker-note, shape-bound and archive-integrity checks passed.

Two complete natural-expiry browser rehearsals passed, through actual HTTP routes
with independent host/projector/student contexts: **109.823s** first run;
**97.027s** selected capture, both including clean reset. Selected run: fixture
estimate 3.245s; A/C wave 1 at 11.010s; C own invite 16.211s; B no invite 21.362s;
A held 30.943s; C expired/D ring 4 at 80.630s; D own invite 86.767s; final reset
92.979s. No clock advance was used. The 60-second invite timeout plus 10-second
scheduler and browser polling explains the observed widening delay. Counts
remained total 2 / available 1 / held 1 / picked up 0; no repeated A/C invites,
no uncaught page errors or private projector fields. Reset returned no drop/invites.

`submission/Owl_Plate_Fallback.mp4`: **96.6 seconds**, 1920×1080, 25fps, silent
with burned-in simulation labels and action captions. Actual host/projector/mobile
browser capture; no physical phone or live Gemini implied. Full decode passed,
and nine scene frames/transitions were visually inspected. Screenshot and timing
evidence in `submission/evidence/`; raw WebM captures preserved locally under
ignored `test-results/rehearsal/raw/`. `scripts/rehearse_demo.cjs` reproduces
capture with Playwright/Chromium; `scripts/build_fallback_recording.py` assembles
captions using Pillow/FFmpeg. See submission README for commands and artifact map.

Five-minute cue sheet: `submission/PITCH_SCRIPT.md`, exact 1m problem / 1m solution /
2m demo / 1m architecture-next allocation. Spoken sections are 100/102/105 words,
approximately 52/53/55s at 115 wpm. The 97s demo leaves 23s of its slot; narration
overlaps actions/wait. **Human spoken timing, speaker handoffs and physical-device
rehearsal remain pending.** Three human runs are reserved for Thursday evening.

Single live checklist/receipt register: `submission/LIVE_RUN_CHECKLIST.md`.
Status is explicit per check: verified, simulated or pending. Private-access
presence check found no root .env and incomplete Gemini/Firebase configuration;
no values printed. No real photos evaluated, no live model accuracy, no phone
receipts, survey n=0. Do not substitute browser invites, transport IDs or fixture
metrics for these missing results. Access/phones/labels are the deadline risk;
Friday November 20 noon Eastern (17:00 UTC) remains the submission deadline.

Verification this turn: unchanged app production build passed; timed browser flow
and MP4 decode passed; script syntax/Prettier and Ruff check/format passed; final
diff and package hashes recorded after packaging. Earlier reviewed 65 API tests,
116 eval tests and five client tests stand; no app code changed to warrant reruns.
Shared preview failed twice with missing host libraries; used isolated Playwright
fallback. LibreOffice/dependencies downloaded/extracted under /tmp only, no system
packages installed. Capture-tool failures before the selected take were not used
as proof; one attempt was interrupted when temporary servers stopped. All owned
servers/capture browsers were stopped after the successful take; DeckScout port
8000 was never contacted, reused or signaled. No push, merge, deploy, distribution
or submission occurred. Entra, meal swipes, Bedrock/Twilio and deployment remain
outside this rehearsal slice; live-readiness limits below still apply.

## Previous checkpoint: local demo milestone independently passed (November 18)

**Reviewed application/checkpoint SHA: `f025edd224fe06d2dadd94ae699dd393e8adf8da`.**
Fresh OpenCode `openrouter/z-ai/glm-5.3` verified that exact SHA in clean isolated
worktree `/home/node/.t3/worktrees/owl-plate/t3-c25c3d0f`, branch
`t3/review-provider-recheck`. Verdict: **PASS for the local demo milestone**;
all three prior findings resolved, no objections. Review record:
<t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/thread:delegated-task:command%3Amcp%3Abc385daf-2cbb-4ebd-8d99-5c263e1bcab1%3Adelegate-task%3Aowl-review-f025edd>.

Reviewer reran 65 API tests, Ruff check/format, route smoke and diff check;
all passed with the one known TestClient deprecation warning. Independent probes
also passed last-serving conflicts with unchanged inventory, restored preferences,
picked-up retry idempotence, vegan mismatch and compatible vegetarian claiming.
Prior unchanged web/browser/eval evidence remains below; it was not rerun.

This checkpoint changes documentation only: records the verdict and removes two
stale timeout-variable references from ARCHITECTURE/DISPATCH, resolving the new
low documentation finding. Application code is identical to the reviewed SHA.
The exact final documentation commit is recorded in the manager thread. Canonical
branch remains `demo/owl-plate-ready`, original `main` unchanged, all worktrees
preserved. No pushes, merges into main, deployments, distribution or submission.

Next milestone needs Johaan's decision queue below: authorized Android and Home
Screen iPhone recipients, private Firebase/Gemini access, labeled food photos,
survey distribution owner, campus policy/coordinates, then optional Claude model
clarification. Interim providers remain explicit fixtures/logs/demo auth. Survey
n=0; no physical push receipt, measured vision accuracy or live service proof.
Access and phone availability threaten Thursday evening evidence/rehearsal;
Friday November 20 noon Eastern (17:00 UTC) submission remains Johaan's action.
Local commands: `make demo`, `make dev` (API 8017/web 3017), `make smoke`;
use the Make binary workaround below if GNU Make is absent. Submission package is
in `submission/`; PowerPoint visual review and physical-device capture remain
pending. No new independent review is claimed for this documentation-only commit.

## Previous checkpoint: GLM findings fixed, exact-SHA recheck next (November 18)

Canonical branch: `demo/owl-plate-ready`. Product/docs fix commit:
`f0cceb9178ad06adaafd2081a523860130d15811`, based on reviewed
`94773c9520fa9e4ec5b2ab3a53d75788f777b13e`. The manager thread records the
exact subsequent checkpoint SHA supplied to the fresh recheck. Original `main`
remains `d11c4be01bcbd375dafabf50c2f59c6daaf513ec`; no pushes, default-branch
merges, deployment, distribution or submission occurred. Existing worktrees remain.

Independent OpenCode `openrouter/z-ai/glm-5.3` review verified exact HEAD
`94773c9520fa9e4ec5b2ab3a53d75788f777b13e` in clean worktree
`/home/node/.t3/worktrees/owl-plate/t3-c912437d`, branch
`t3/review-local-demo-milestone`. It passed 62 API tests, 116 eval tests, five
client tests, Ruff and route smoke, plus concurrency, inventory and ownership
probes. No blocking findings for the local milestone; it found one medium
claim-time compatibility gap and two low configuration/documentation issues.
Review record:
<t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/thread:delegated-task:command%3Amcp%3Abc385daf-2cbb-4ebd-8d99-5c263e1bcab1%3Adelegate-task%3Aowl-review-94773c9>.

Manager resolved all three findings: new claims atomically recheck current
allergens and required diet tags, returning 409 `allergen_conflict` or
`diet_mismatch` without allocating inventory. Existing-held retries remain
idempotent. The contract documents this addition. `.env.example` now documents
fixed v1 timings rather than ineffective variables; uploads remain memory-only.
Architecture diet enums and DATA seed documentation now match the implementation,
and the public-facing internal persona table no longer identifies a private tier.
New HTTP regressions prove both preference conflicts, successful claims after
compatible preferences are restored, and unchanged existing-hold retries.

Actual manager verification on the fix: **65 API tests passed**, Ruff check and
format passed (49 files), `git diff --check` passed, and route smoke passed:
30 students → photo/review/publish → A/C → A hold → C expiry → D ring 4 → reset.
One known TestClient deprecation warning remains. No frontend/schema shape edits;
previous lint/types/build and Full HD browser evidence below still applies to
those unchanged files. A fresh GLM recheck of the final checkpoint is next;
no approval of that new SHA is implied yet.

Evidence remains offline: fixture vision, synthetic students, simulated log
notifications. No physical Android/iPhone push receipt, live Gemini accuracy,
survey responses (n=0), live Entra/Postgres/deployment or phone recording.
Deadline risk: access, authorized phones and labeled photos are needed before
Thursday evening rehearsal to collect real evidence. Submission remains Friday
November 20 at noon Eastern (17:00 UTC); Johaan submits. The package and prioritized
Questions for Johaan below remain current. Notification delivery currently holds
the database transaction during sends; FCM latency and rate limiting are live
readiness follow-ups alongside dependency advisories, not offline-demo evidence.

## Previous checkpoint: local browser milestone verified, independent review next

Manager verified the integrated code at `337af5cd081572d1fa555475b22b73735f58772e`, with a final browser-script change to use a standard Full HD projector (1920×1080). The canonical checkout is now on `demo/owl-plate-ready`; `integration/owl-plate-verified` preserves the integration worktree. The exact checkpoint HEAD is recorded in the T3 manager thread after this documentation commit. Original `main` remains `d11c4be01bcbd375dafabf50c2f59c6daaf513ec`. No pushes, default-branch merges, deployments, survey distribution or submission occurred.

Accepted original worker commits: backend `f712f4087ed2f3c9d5e5f7a213b195f8cb83af1e`, web `f748c8325890a0aec58643c30138ef942b208121`, eval `bd423acf364f235661f596833206bd7236b73173`; manager FCM `3b35054c111099512d6a7fe442ec9a6b1a8c77c5`. All were inspected and cherry-picked by the integrator, then composition fixes were committed. All workers are finished; Claude remains idle because the intended label is unresolved. Thread links below preserve their live records.

Integrator: <t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/mcp:launch:8f85c5dc9d076be2472ee45b52e47033bd857db23d19aaa33453c837b0eb5b3b>. Its final candidate `327635f3bb4510ffe1d49c5d66d2af9b008caa8e` passed 62 API tests, 116 eval tests, five client tests, lint (Ruff/ESLint/Prettier), generated types, strict typecheck, route smoke, CORS check and Next 15.5.29 production build. Manager then compacted projector explanations to A–E (all 30 synthetic markers remain on the map), repeated web lint/types/build and client tests, and passed the full browser flow. One TestClient deprecation warning remains; no functional check failure remains.

Browser proof: separate host, projector and mobile student contexts completed upload → safety review → publish → A/C first wave → A hold → C expiry → D ring 4 → reset, through actual API routes. B had no invite; D saw only its own invite; projector discovered the host's drop with empty browser storage; deck.gl canvas rendered; no uncaught browser errors. A–E fit at 1920×1080. The initial 1440×1000 fit assertion failed; the supported proof viewport is Full HD. These are synthetic pixels, fixture vision and simulated notifications, **not physical phone push or measured vision accuracy**.

Reproducible browser entrypoint: `scripts/browser_smoke.cjs`. It requires a separately installed Playwright Core module and Chromium, running Owl API/web servers, and explicit demo auth. It resets the demo DB at both ends; never run against a real-data deployment. Module/executable/API/web/artifact paths are configurable through `OWL_PLAYWRIGHT_MODULE`, `OWL_BROWSER_EXECUTABLE`, `OWL_API_URL`, `OWL_WEB_URL`, `OWL_BROWSER_ARTIFACTS`. Screenshots default to gitignored `test-results/browser/`. Manager evidence exists locally in `/tmp/owl-browser-run/proof/`.

Shared preview failed twice because host browser libraries are absent. Manager used Playwright Core 1.58.2 with cached Chromium, Debian libraries and fonts extracted only under `/tmp/owl-browser-libs`, `FONTCONFIG_FILE=/tmp/owl-browser-libs/fonts.conf`, and `LD_LIBRARY_PATH=/tmp/owl-browser-libs/root/usr/lib/x86_64-linux-gnu:/tmp/owl-browser-libs/root/lib/x86_64-linux-gnu`. No system packages were installed. Temporary Owl servers on 8017/3017 were stopped after proof; all browser contexts were closed. DeckScout's port 8000 process was never contacted, signaled or reused. Owl defaults are API **8017**, web **3017**.

Submission package: `submission/Owl_Plate_Pitch.pptx` (seven editable slides, speaker notes and archive integrity verified), survey and distribution copy, recording plan, and draft live-demo note. Visual PowerPoint/LibreOffice review, actual team contributions and device capture remain pending. Real survey n=0; no live vision metrics or physical phone receipts exist. Thursday evening is reserved for integrated rehearsal and backup capture. Deadline remains Friday Nov 20 noon Eastern / 17:00 UTC, Johaan submits.

Next: fresh OpenCode `openrouter/z-ai/glm-5.3` review of the exact checkpoint SHA for overbooking, privacy and offline reliability. Review status and any fixes will be recorded in the manager thread and a subsequent handoff checkpoint. Questions for Johaan below remain the prioritized return queue; no secrets belong in chat. The latest useful decisions are approved Android/iPhone recipients and private Firebase/Gemini access, labeled food photos, survey distribution ownership, and campus policy/coordinates. Live Entra and deployment remain deferred; the local app deliberately fails closed outside explicit demo mode.

Canonical checkout checks: clean switch to the ready branch, `main` SHA unchanged, route smoke passed again from `/home/node/projects/owl-plate`, and `npm ci` succeeded. Its audit reported 35 dependency advisories overall; `npm audit --omit=dev` reported 17 (13 high, four moderate, zero critical), through deck.gl loaders/texture tooling, Firebase's unused Firestore/gRPC dependency path, and Next's nested PostCSS. These were inspected; no forced downgrades or major migrations were applied. The local demo uses trusted repository CSS and H3 cells, no external archives/models, and only Firebase messaging imports. Dependency remediation is a deployment-readiness item, in addition to production auth/live service access; this branch is a local demo milestone, not approved for public deployment.

Deadline: Friday November 20, 2026 at noon America/New_York (17:00 UTC). Johaan submits. Thursday evening reserved for rehearsal, physical-phone capture and backup. No pushes, default-branch merges, deployments, survey distribution or submission authorized.

## Preflight

Canonical root `/home/node/projects/owl-plate`, T3 Owl Plate project `093405f7-8dec-4840-b584-9743d828c0b5`. Separate from DeckScout. Original `main` SHA `d11c4be01bcbd375dafabf50c2f59c6daaf513ec`, clean. No other workers/worktrees at start. Local integration branch `integration/owl-plate-demo`. Full project brief attachment unavailable; user message plus existing docs are working spec. Read AGENTS.md, CLAUDE.md and all project docs.

## Routing and ownership

Confirmed capabilities: Codex `codex/gpt-6.1-sol`; Antigravity `antigravity/gemini-4-argon`; OpenCode `opencode/openrouter/z-ai/glm-5.3`. Claude instance `claudeAgent` exists, but “Uber’s Wi-Fi” resolves to no intended model. Claude idle; Codex fallback owns backend implementation until clarified. Worktrees must start from committed contract baseline, startFromOrigin=false. See API_CONTRACT.md for boundaries and accepted scheduling clarifications. Thread links, exact SHAs and check outputs will be appended as runs start/finish.

## Initial decision queue (superseded)

Use the consolidated **Questions for Johaan — return queue** at the top of this
handoff; survey approval is now first. Historical worker/checkpoint entries below
remain for traceability.

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

## Final web candidate for manager browser verification (Nov 18)

This section supersedes the earlier pending-web checkpoints. Inspected accepted web `f748c8325890a0aec58643c30138ef942b208121` (apps/web only) and cherry-picked it as `d4b3778539112c74d66ba89c342934508b93b2e7`. No conflicts; no unaccepted branch changes. Runtime and binding remain Codex gpt-6.1-sol, `/home/node/.t3/worktrees/owl-plate/integration-owl-plate-verified`, `integration/owl-plate-verified`.

Acceptance fixes:

- API is the default. Network/timeout/HTTP errors remain visible failures and never fall back after failed mutations. Standalone UI simulation requires explicit build-time `NEXT_PUBLIC_UI_FIXTURE_MODE=true`, has a global banner, makes no API calls and disables real FCM registration. Default is false. Server fixture vision remains separately labeled.
- Upload timeout is 65 seconds. Host requires a selected genuine JPEG/PNG; removed SVG bytes mislabeled JPEG. Empty uploads cannot fabricate a sample success.
- Projector polls `/demo/active-drop` independently of host localStorage, handles null as a waiting state and uses only synthetic persona output. Host and projector reset messages truthfully describe reseeding students without drops/invites; the standalone fixture reset now matches. Visible CARE/priority-tier copy was removed from home, host, student, projector and map. Host copy is “Hosts see serving counts.” Allergen notices and simulated markers remain.
- Exported actual composed OpenAPI to `apps/web/openapi.json`; generated `lib/api.generated.ts` with openapi-typescript 7.10.1. `lib/types/api.ts` HTTP types are schema aliases, including DemoActiveDropResponse. Existing presence/push/tick success envelopes and error envelopes now have explicit Pydantic schema models with unchanged JSON shapes. `make types` formats both artifacts so regeneration passes Prettier.
- Registry lookup selected latest stable Next 15 patch **15.5.29**, pinned together with matching eslint-config-next. No framework migration. Added Prettier to the required lint chain and sandboxed client tests to make test. Next route type generation runs before standalone typecheck. Removed tracked tsconfig.tsbuildinfo and ignored all *.tsbuildinfo.
- Added deterministic matching owl PNG icons (192/512) and apple-touch-icon (180), referenced by manifest/layout. Pillow validation confirmed PNG formats and exact dimensions. Rebuild with `python -m scripts.build_icons`. This is not installation or physical receipt evidence.
- Root README/runbook now describe actual readiness, the two vision/UI fixture modes, photo selection, cross-device discovery, reset and private optional FCM setup. scripts/dev.py loads root env for both apps, uses the selected Python, and terminates only its own child process groups when either app exits.

### Owl port isolation

Manager identified DeckScout already occupying 8000 (PID 950177); integrator did not contact, stop or signal it. Owl defaults are now **API 8017 / web 3017** via API_PORT/WEB_PORT, NEXT_PUBLIC_API_URL and CORS_ORIGINS. Updated dev launcher, API CORS/client defaults, contract base URL, README and runbook. Alternate ports require matching public URL/CORS configuration. Mocked launch checks verified defaults and custom 8123/3123 overrides plus cleanup of only the two fake child groups; no actual processes were launched or signaled. Default CORS preflight returned 200 with `http://localhost:3017` allowed. The final web build explicitly uses `NEXT_PUBLIC_API_URL=http://localhost:8017` and `NEXT_PUBLIC_UI_FIXTURE_MODE=false`.

### Final verification

From this worktree with `PYTHONPATH=.` and manager's existing Python 3.11 environment, without installing/changing shared Python packages:

| Command/check | Result |
|---|---|
| `make test` with temporary GNU Make/Python overrides documented above | 62 API tests, 116 eval tests, 5 sandboxed client tests passed |
| `make lint` with shared Ruff executable override | Ruff check passed; 49 files formatted; ESLint and Prettier passed |
| `make types` | Composed OpenAPI and genuine generated types/aliases exported and formatted successfully |
| `make smoke` | Photo/review to 2 servings; A/C wave1; A idempotent hold; C expires; D ring4; private snapshot; clean reset passed |
| `npm run typecheck` | Next route type generation and strict tsc passed |
| `NEXT_PUBLIC_API_URL=http://localhost:8017 NEXT_PUBLIC_UI_FIXTURE_MODE=false npm run build` | Passed; production Next 15.5.29 build completed with home/host/student/dispatch static routes |
| Default CORS / log push probe | Owl origin 3017 allowed; registration explicit 503 without echoing synthetic token |
| `git diff --check` | Passed |

One Starlette/httpx TestClient deprecation warning remains; no failed checks from it. An initial final-lint attempt found JSON formatting drift after OpenAPI export; make types now formats JSON and generated TS, and the subsequent full lint/types/smoke passed. An earlier build on old ports was superseded by the explicit 8017 rebuild.

Integrator started **no API/web/browser servers**, so has none to stop. Manager owns the final integrated browser run on this candidate with separate host/projector contexts: null after reset → host uploads/reviews 2 → A/C wave1 → A holds → C expiry → D ring4 → reset clears. Use API 8017/web 3017 and preserve DeckScout. Manager fallback path is `/tmp/owl-browser-run/node_modules/playwright-core`, Chromium `/home/node/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`, with manager-provided temporary LD_LIBRARY_PATH. No browser proof is claimed here.

No subagents, pushes, deployments, default-branch merges, real sends, live provider calls, real recipient data or token/contact logs. FCM/Entra/live credentials and physical Android/iPhone receipts remain absent/unverified; no measured model accuracy, survey results or policy approval are implied. The exact final candidate SHA is reported by the integrator after committing this record.
