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
