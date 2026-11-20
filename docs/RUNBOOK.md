# Local runbook

How to install, run, reset and verify Owl Plate on a developer machine. Local mode uses synthetic roles and demo authentication. It does not imply campus policy approval, CARE partnership, measured live vision accuracy or physical push receipt.

## Install

Requirements: Python 3.11, `uv`, Node 20.9+ (integration used Node 24) and GNU Make.

```bash
cp .env.example .env    # private and gitignored
make setup              # .venv, Python deps, npm ci in apps/web
```

`.env.example` selects explicit demo auth (`AUTH_MODE=demo`, `DEMO_MODE=true`), fixture vision, log notifications, API-backed web and survey collection off. Fixture vision and fixture pickup checks refuse to start unless both demo gates are set.

## Start

| Goal | Command | Notes |
|---|---|---|
| Presentation, offline | `make present` | Production web build plus API. Resets to the campus feed and prints the active modes |
| Presentation, live vision | `make present-openrouter` or `make present-live` | Needs `OPENROUTER_API_KEY` or `GEMINI_API_KEY` in `.env` |
| Real push | `python -m scripts.present --vision openrouter --notifications fcm` | Needs a Firebase service account (`.secrets/firebase-service-account.json` or `FIREBASE_SERVICE_ACCOUNT_JSON`), `NEXT_PUBLIC_FIREBASE_CONFIG` and `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. Generates `PUSH_TOKEN_ENCRYPTION_KEY` into `.env` if it is missing |
| Seeded wave rehearsal | `python -m scripts.present --scenario seeded` | Five synthetic personas A–E |
| Development (hot reload) | `make demo` then `make dev` | Loads root `.env` for both processes |
| Reset a running demo | `make demo-reset` | Clears sessions, listings, holds, outbox and push registrations |

Defaults are web `http://localhost:3017` and API `http://localhost:8017` (OpenAPI at `/docs`). To move them, set `WEB_PORT` and `API_PORT`, together with `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS`. The launcher refuses to start on an occupied port. Stop only your own earlier Owl Plate process, never unrelated services. The `*-zima` targets bind `0.0.0.0` for LAN access.

Main routes: `/host`, `/join`, `/student`, `/pantry`, `/dispatch` (analytics), `/impact`, `/admin`.

`NEXT_PUBLIC_*` values are embedded at web build time. Phones must reach the API through the web origin: build with `NEXT_PUBLIC_API_URL=/backend` and set `OWL_API_ORIGIN` for the server-side rewrite. `NEXT_PUBLIC_UI_FIXTURE_MODE=true` is a separate browser-only showcase that makes no API calls and shows a banner. Keep it `false` for integrated runs.

## Walkthrough (campus feed)

1. **Host** `/host`: upload a real JPEG/PNG of food (no people), get the estimate, adjust servings and allergens, confirm the safety checks, choose a verified building, and publish.
2. **Student** `/join` in a separate browser profile: enter a nickname and dietary preferences, then optionally enable notifications. Find the listing in the feed or on the map, then **Reserve — hold 10 min**. Use the walking-directions link.
3. **Pickup**: take a food-only photo and review the assessment. A consistent result enables **Confirm pickup**. Otherwise, request host review, and the host approves or rejects it in their review queue.
4. **Pantry (simulated)**: the host requests a pantry referral. The coordinator on `/pantry` reads the notice, acknowledges it and accepts. The host confirms the simulated handoff.
5. **Analytics** `/dispatch`: student pickups and simulated pantry transfers appear as separate counts.

In fixture mode, the estimate and the pickup assessment are labeled saved results. `PICKUP_FIXTURE_STATUS` (`consistent`, `uncertain`, `inconsistent`) exercises the review path offline. It never affects live assessments.

## Live providers

- **Vision**: `VISION_PROVIDER=openrouter` uses `OPENROUTER_API_KEY` and `OPENROUTER_VISION_MODEL` (default `google/gemini-3.8-flash`) for both the estimate and the pickup assist. `VISION_PROVIDER=gemini` uses `GEMINI_API_KEY` and `GEMINI_MODEL` for the estimate. Pickup assist uses OpenRouter and stays unavailable without an OpenRouter key. Provider failures are shown as errors and never fall back to fixtures.
- **Push**: FCM needs HTTPS or `localhost`, a supported browser and, on iPhone, Add to Home Screen (iOS 16.4+). Tokens are stored encrypted and cleared on every reset, so devices must re-enable alerts afterwards. Keep server credentials out of `NEXT_PUBLIC_*`, Git, screenshots and logs.

## Verification

```bash
make test        # pytest, eval, campus, It and web unit tests
make lint        # Ruff check/format, ESLint, Prettier
make eval        # offline synthetic scoring checks, not measured accuracy
make campus      # verified Marietta registry validation
make smoke       # isolated HTTP pass over the seeded rehearsal
make types && git diff --exit-code apps/web/openapi.json apps/web/lib/api.generated.ts
cd apps/web && npm run typecheck && npm run build
```

To run with an interpreter from another checkout, prefix the command with `PYTHONPATH=.` and pass `PYTHON=/path/to/python3.11`. Don't install into a shared environment.

### Browser harnesses

`scripts/verify_*.cjs` drive real routes with Playwright. They reset state, so run them only against an **isolated** fixture/log runtime:

```bash
python -m scripts.present --port 3027 --api-port 8027 --vision fixture --notifications simulated --rebuild
OWL_WEB_URL=http://127.0.0.1:3027 OWL_API_URL=http://127.0.0.1:8027 node scripts/verify_operations_ui.cjs
```

Set `OWL_PLAYWRIGHT_MODULE` (and optionally `OWL_BROWSER_EXECUTABLE`) to a Playwright installation outside the repository. The output goes to the gitignored `test-results/`. `OWL_TEST_FOOD_PHOTO` optionally uploads a real food photograph instead of synthetic pixels. See `FINAL_UI_HANDOFF.md` for the current set of harnesses and their coverage.

## It (itcan.do)

Setup, pairing, publishing and troubleshooting for the pickup display and the Campus Rescue Command Center are in `prototypes/itcan/README.md`. The local stand-in tests run with:

```bash
python3 -m unittest discover -s prototypes/itcan/tests -p 'test_*.py'
```

Stand-in tests don't prove a paired It interaction.

## Not available locally

KSU sign-in (Entra ID), managed hosting, PostgreSQL and photo object storage are not provisioned (see `ARCHITECTURE.md`). Do not deploy, contact KSU offices or send real notifications to anyone who has not explicitly agreed to it.
