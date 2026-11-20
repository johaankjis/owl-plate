# Campus Milestone 1 — integration handoff

Historical checkpoint. `docs/FEED_HANDOFF.md` records the campus-feed successor;
normal visitor check-in/ring assumptions and the former visitor harness behavior
below are superseded. The explicitly seeded A–E rehearsal remains supported.

Local-only integration, November 19, 2026. No push, cloud deployment, canonical
restart, live provider request, or real It tap is part of this evidence.

## Checkout and provenance

- Integrator: Codex provider, `gpt-6.1-sol`, medium reasoning; verified using
  thread configuration before edits.
- Worktree: `<local-path>` (not canonical).
- Required and observed starting HEAD:
  `6441314d428817b60b53c8a307a8f46381ae89d7`.
- Initial branch was `t3/7b02a92a`; it was renamed externally before the first
  cherry-pick. Integration branch: `t3/campus-mobile-integration`.
- Tested implementation commit:
  `472073b33a931e9100f82701539ac326bb99950f`.
  The subsequent handoff commit changes documentation only; its exact final
  SHA is reported with the integration result rather than self-embedded here.

Worker commits were inspected and cherry-picked in this order:

| Worker   | Source SHA                                 | Local cherry-pick | Worker checkout / branch                                                             |
| -------- | ------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------ |
| Backend  | `95eaf51213c49ec676766174ba4a74f6bb6c15fe` | `e5cc229`         | `<local-path>`, `t3/campus-backend`                |
| Frontend | `2458dc7399d5cac1b3fa662745acfa93f84f5b4a` | `dc816b7`         | `<local-path>`, `t3/campus-building-selector`      |
| Dataset  | `a37319cd85747474b3e17abec6ab4dda8d4a8a82` | `7d88bb5`         | `<local-path>`, `t3/research-marietta-campus-data` |

Worker checkouts/branches were checked with `git worktree list` and completed
thread records. Provider/model metadata was confirmed from those thread/run
records (not inferred from shared Git author configuration):

- Backend: `claudeAgent`, `claude-opus-5-5` (Claude Opus 5.5).
- Frontend: `antigravity`, `gemini-4-argon` (Argon).
- Dataset: `opencode`, `openrouter/z-ai/glm-5.3` (GLM-5.3 via OpenRouter).

## Integrated behavior and fixes

- Public `/buildings` serves 43 verified records: 19 requested buildings and
  24 housing/check-in options. The registry computes resolution-11 H3 cells
  from the chosen coordinates; real joins have no synthetic jitter.
- Host and student use searchable building groups. Drops snapshot building,
  room and pickup instructions. Check-in refreshes the student's own building
  and two-hour presence without requesting GPS.
- Walking links use exact destination coordinates, `api=1`,
  `travelmode=walking`, and no origin. No directions exist for rehearsal drops.
- Regenerated OpenAPI/client types from the composed API with `make types`;
  replaced additive building/join/drop overrides with generated aliases.
- Runtime helper checks `verification_status === "verified"`, not
  `source.verified`. Backend rejects unknown/unverified selections before use.
- Fixed host publication reapplying campus defaults to an explicit
  `DEMO-ORIGIN` selection. Submission now preserves the chosen ID. Real-route
  seeded and four-visitor rehearsals exercise this regression with the actual
  campus dataset loaded.
- Fixed launcher fingerprint to include effective `OWL_API_ORIGIN`, including
  its default. Regression test distinguishes API 8027 from 8017. The tested
  production rewrite manifest targets `http://127.0.0.1:8027/:path*`.
- Extended FCM composition tests across fixture and OpenRouter vision with
  mock HTTP transport. Opted-in invite sends stay once-only and exact-invite
  linked; no real notification/vision network call is made.
- `make test` now includes campus and the six existing It companion tests;
  `make campus` validates the dataset and runs its tests. Campus Python files
  are included in `make lint`.

## Verification evidence

All application browser evidence uses real local routes, real sessions and
the real dataset, but synthetic people/image, fixture vision and log
notifications. Chromium touch/mobile emulation is **not a physical iPhone**.

| Check                         | Result                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| API pytest suite              | 174 passed; one upstream Starlette/httpx deprecation warning |
| Evaluation unit suite         | 116 passed; not measured live model accuracy                 |
| Campus dataset unit suite     | 4 passed                                                     |
| Dataset validator             | 43 verified records, 1,591 checks, zero failures             |
| It companion existing suite   | 6 passed; local mocked aggregate API, no real paired tap     |
| Frontend unit suite           | 35 passed                                                    |
| Ruff lint / format            | Pass, including campus files                                 |
| ESLint / Prettier             | Pass; browser scripts separately format-checked              |
| OpenAPI generation            | Pass, repeat generation produces no drift                    |
| Next route types / TypeScript | Pass                                                         |
| Production Next build         | Pass via isolated presentation launcher                      |

Reusable real-route browser commands:

```sh
node scripts/rehearse_demo.cjs
node scripts/verify_join_flow.cjs
node scripts/verify_campus_mobile.cjs
```

They must run sequentially because each resets the same isolated database.
The campus harness requires an explicitly supplied, noncanonical loopback
`OWL_WEB_URL`, requires fixture/log health, and refuses an empty registry.
There are no browser route mocks or fabricated campus coordinates.

Local artifacts (gitignored, retained in this worktree):

- `test-results/rehearsal/timing.json` and screenshots: seeded A/C wave one,
  B dietary exclusion, A hold, natural C expiry, D ring four, final reset.
  Measured duration 87.376 s; wave one 10.924 s, A held 30.822 s, wave two
  70.832 s, final reset 83.289 s from script start.
  This run disables video recording; it does not replace the fallback video.
- `test-results/join-flow/evidence.json` and screenshots: four separate
  visitor contexts, natural expiry/widening, ownership isolation and no
  dietary/priority details leaked to other students or projector.
  A held 6.740 s, Ben expired 64.700 s, Dee wave two 72.567 s, isolation
  verified 72.773 s from script start.
- `test-results/campus-mobile/evidence.json`, `01-campus-invite.png`,
  `02-campus-host-counts.png`: housing join then building check-in, Library
  (k=2) to Academic host, Administration (k=4) after natural invite expiry;
  exact destination directions on invite and hold cards; dietary exclusion;
  reserve/pickup updates host counts; no GPS calls, uncaught browser errors,
  or 390px horizontal overflow. Final counts: total 2, available 1, held 0,
  picked up 1. No demo clock advance is used.
  Final campus run started at `2026-11-19T07:14:32.431Z`; drop
  `0e6f525b-e168-4f5e-86d5-ebbb67c9671c`. All three browser artifacts record
  implementation SHA `472073b33a931e9100f82701539ac326bb99950f` and PASS.
- Campus test link uses `https://companion.example.test` solely to verify
  `/p/owl-whats-left-<exact-drop-uuid>` construction. It is not a paired site
  and is not opened. Real It tap-to-update remains pending.
- Full terminal evidence: `<local-tool-path>`,
  `<local-tool-path>`, `<local-tool-path>`,
  `<local-tool-path>`, `<local-tool-path>`.

Unknown and unverified building exclusion is also covered by route-level tests
using a clearly synthetic temporary registry, including unverified entries
with coordinates. The actual reviewed dataset has no unverified entries to
select. Dietary safety, privacy, capacity and atomic claims retain API tests.

## Exact local startup and manual acceptance

From this integration checkout, with 3027/8027 free:

```sh
cd <local-path>
PYTHONDONTWRITEBYTECODE=1 NEXT_TELEMETRY_DISABLED=1 \
  .venv/bin/python -m scripts.present \
  --vision fixture --notifications simulated --port 3027 --api-port 8027
```

The canonical interpreter is used without installing/editing its dependencies;
web dependencies were installed with `npm ci` in this worktree only. Startup
builds if needed and resets **this checkout's** `build/present.db` to visitors.
It fails safely if either port is busy. Never stop or reset 3017/8017.

1. Host normal browser window: `http://127.0.0.1:3027/host`.
2. Separate private/incognito browser context: `http://127.0.0.1:3027/join`.
   Use a synthetic nickname, select **Lawrence V. Johnson Library**, and join
   without restrictions for the positive test. Do not reuse another visitor's
   localStorage/session. A separate browser profile/context is needed for
   each additional visitor, not just another tab.
3. Host uploads a nonpersonal test photo. Confirm **Saved demo estimate** /
   simulated notifications; select **Academic Building**, enter a room and
   pickup instructions, set two servings and complete the safety checklist.
   Publish. Fixture vision does not analyze the submitted pixels.
4. The Library student receives an invite in the real app. Confirm Academic
   building/room/instructions; directions must target
   `33.938224,-84.520565`, walking, no origin. The app requests no GPS.
5. Reserve: host available 2→1, held 0→1. Confirm pickup: held 1→0,
   picked-up 0→1. Host updates through polling without reload.
6. Optional wave test: before publish, add a second unrestricted Library
   visitor, a dairy-restricted Library visitor, and an unrestricted
   Administration visitor in separate contexts. Dairy visitor is excluded;
   Administration is outside k=2. Let the other Library invite expire
   naturally; the scheduler widens to k=4 and invites Administration.
7. Projector: `http://127.0.0.1:3027/dispatch`. Presenter controls provide
   the separate seeded A–E rehearsal and reset for visitors. All persona
   geography remains explicitly synthetic, with no directions links.

## Reproducing automation in this container

Shared preview was attempted first and failed because T3's browser lacks system
libraries. Authorized Playwright fallback needed local fontconfig as well:
without it Chrome aborted in Skia while rendering text. No global packages
were installed and no canonical dependencies were changed.

```sh
export OWL_WEB_URL=http://127.0.0.1:3027
export OWL_API_URL=http://127.0.0.1:8027
export OWL_PLAYWRIGHT_MODULE=<local-tool-path>
export OWL_BROWSER_EXECUTABLE=<local-path>
export LD_LIBRARY_PATH=<local-tool-path>
export FONTCONFIG_FILE=<local-tool-path>
export OWL_RECORD_VIDEO=false
node scripts/rehearse_demo.cjs
node scripts/verify_join_flow.cjs
node scripts/verify_campus_mobile.cjs
```

`fonts.conf` is a temporary fontconfig document with font directory
`<local-tool-path>` and cache directory
`<local-tool-path>`. Temporary tooling is not part of the repo.
GNU make was absent; an uninstalled Debian make binary was extracted under
`<local-tool-path>`. Exact combined check command:

```sh
<local-tool-path> test lint campus types \
  PYTHON=.venv/bin/python \
  RUFF=.venv/bin/ruff
cd apps/web && npm run typecheck
```

## Limits, objections and preserved state

- Real physical iPhone locked-screen/background push remains pending.
  Mock FCM transport and browser invite cards do not prove delivery/receipt.
- A real paired It tap-to-update remains pending. Six contract tests and an
  exact-drop browser href are not that evidence.
- No live vision call was needed or re-measured. Fixture/log browser tests
  are not live evidence or measured model accuracy.
- Hornet Hub uses footprint/address corroboration; Shore uses a corroborated
  address point, not official interactive pins. Preserve their source URLs
  and caveats in `data/campus/RESEARCH.md`. Coordinates are building points,
  not promised accessible entrances or verified walking routes. Positional
  agreement does not guarantee H3 cell inclusion across boundaries; the
  registry computes the cell for the chosen coordinate only.
- Existing canonical cloud edits, including dirty `docs/HANDOFF.md`, were not
  changed or copied. Canonical `git status --short` matched the manager's
  `<local-tool-path>`; canonical presentation/API PIDs 1142904
  and 1142905 remained active, with no signals or test requests sent to them.
- Only isolated 3027/8027 were used. Candidate launcher PID 1152919 and its
  API/web children were stopped after verification; the startup command above
  can start a fresh candidate. No production readiness or deployment approval
  is implied.
- Fresh exact-SHA manager review still follows this integration handoff.

## Manager checkpoint after integration

- Canonical feature branch: `feature/marietta-locations`, fast-forwarded to
  integration `cbeab00b5946c98e4db1f7b8a08179ef9839f02a`; default branch untouched.
  Pre-existing cloud edits remain uncommitted. Their saved hashes match, except
  `docs/ARCHITECTURE.md`, which preserves the same cloud diff and additionally
  contains the committed campus architecture paragraph.
- Fresh GLM review of `cbeab00` reported PASS with no blocking findings. Its
  frontend count of 40 includes the five unrelated uncommitted cloud tests in
  canonical; the isolated implementation count is 35. A clean-worktree final
  recheck follows the small projector label correction below.
- Manager repeated the mobile campus flow at exact `cbeab00`: PASS, including
  natural expiry to ring four, exact walking destination, reserve/pickup counts,
  no GPS and no horizontal overflow. Artifacts are in the integrator worktree's
  `test-results/campus-manager-cbeab00/`; both phone-width screenshots were
  visually inspected and are readable. Companion was not configured in this
  additional run; exact-drop href coverage remains the integrator's evidence.
- Manager found and corrected a projector copy issue: verified campus drops
  previously inherited the synthetic-coordinate warning. Campus drops now show
  their building name and a verified-building-point label; rehearsal drops keep
  the placeholder warning. Marker copy allows both selected campus buildings
  and synthetic rehearsal areas and discloses display offsets.
- No physical push receipt, paired It tap, live model evaluation, cloud
  deployment or push to Git is claimed. Survey collection remains disabled.
