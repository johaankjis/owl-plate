# Owl Plate

A host photographs leftover event food, reviews estimated servings and allergens, and publishes. A deterministic Python engine invites nearby, opted-in students who match the food, then widens H3 search rings as invitations expire. Hosts see serving counts. Every allergen display says **may contain, confirm with host**.

Built for the KSU AI Club Hackathon 2026. Pitch and submission materials are local drafts under `submission/`; Johaan owns submission.

## Current readiness

The integrated local demo uses synthetic accounts, 30 simulated students, arbitrary unverified coordinates, file-backed SQLite and clearly labeled cached vision. The web uses the API by default. Network errors remain errors; they never silently create fixture successes. Uploads are processed without storing photos.

Gemini and encrypted, allowlisted FCM demo adapters are implemented but require private configuration. No live credentials, real phone receipt, measured real-photo accuracy, campus policy approval, survey results or deployment are verified. Default log mode returns **503** for push-token registration. Entra/email-code auth, production deployment, S3 retention, Bedrock, SMS and meal swipes remain pending or deferred.

## Run locally

Requires Python 3.11, Node 20.9+ (Node 24 used for integration), GNU Make and `uv`.

```bash
cp .env.example .env
make setup
make demo
make dev
```

Open [host](http://localhost:3017/host), [student](http://localhost:3017/student) and [projector](http://localhost:3017/dispatch). API: http://localhost:8017, interactive schema: http://localhost:8017/docs. `make dev` loads root `.env` for both processes. Stop with Ctrl-C. Keep credentials private.

Owl defaults are `API_PORT=8017` and `WEB_PORT=3017`, separate from DeckScout. Override ports in `.env` together with `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS`. For a production web build, use `npm run start -- --port 3017`; `make dev` supplies the configured port automatically. Do not stop unrelated processes on ports 8000/3000.

Select a real JPEG/PNG file on the host page. In default fixture vision mode, uploaded pixels receive a clearly labeled cached estimate. Review to **2 servings**, keep dairy/gluten, leave vegetarian unselected, and confirm the three safety checks. Publish invites A/C; A holds one; C expires; the next wave at ring 4 invites D. Use the demo clock button to advance time explicitly. The projector polls `/demo/active-drop` independently of the host phone/browser. Reset clears all drops, invites, holds, clock offset and encrypted push registrations; it seeds students only. See [the runbook](docs/RUNBOOK.md).

`NEXT_PUBLIC_UI_FIXTURE_MODE=false` is the default. Set it to `true` only for a standalone UI showcase and rebuild/restart the web; a prominent banner identifies browser-only simulation, and no API requests or real push registration run. This is separate from API-backed cached **vision** and does not prove backend behavior.

## Verify

```bash
make test       # API/provider tests, stdlib eval tests, sandboxed client tests
make lint       # Ruff + ESLint + Prettier
make types      # composed OpenAPI -> generated TypeScript; UI uses schema aliases
make smoke      # isolated HTTP photo/review/publish/claim/expiry/widen/reset
make eval       # synthetic known-answer scoring checks, never model accuracy
cd apps/web && npm run typecheck && npm run build
```

Python/Ruff executables can be overridden, e.g. `make test PYTHON=/path/to/python3.11`; run from this checkout with `PYTHONPATH=.` when reusing another checkout's environment. Do not install into a shared environment. PWA PNG icons can be regenerated with `python -m scripts.build_icons`.

## Repository

| Path | Responsibility |
|---|---|
| `apps/web/` | Next.js 15 PWA: host, student, synthetic projector; deck.gl/H3 map |
| `services/api/routes/` | Thin authenticated HTTP adapters |
| `services/api/application.py` | Transactional drops, claims, waves and reset |
| `services/api/dispatch/` | Pure deterministic eligibility/ranking engine |
| `services/api/providers/`, `vision/` | Replaceable Gemini/FCM/log boundaries and vision safety |
| `services/api/db/`, `schemas/` | SQLModel persistence and Pydantic HTTP contracts |
| `data/seed/` | Private synthetic server seed; never a public web asset |
| `data/eval/` | Synthetic scoring fixtures and opt-in live runner; no real labeled-photo set yet |
| `submission/` | Draft deck, survey copy, recording plan and live-demo note |

Start with [AGENTS.md](AGENTS.md), [purpose](docs/SOUL.md), [architecture](docs/ARCHITECTURE.md), [API contract](docs/API_CONTRACT.md) and [privacy/safety](docs/PRIVACY_SAFETY.md). [HANDOFF.md](docs/HANDOFF.md) records exact integration evidence and outstanding proof. Verified KSU facts belong in [DOMAIN.md](docs/DOMAIN.md).

TODO(team): names and contributions before final submission.
