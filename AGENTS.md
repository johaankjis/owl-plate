# AGENTS.md

Guide for any coding agent or teammate working on Owl Plate. Read this first, then `docs/SOUL.md`, then `docs/ARCHITECTURE.md` before changing structure.

## What we are building

Owl Plate routes leftover event food and spare meal swipes to KSU students who need them. A host snaps one photo. Vision AI estimates food, servings and allergens. A dispatch engine pings just enough nearby, opted in, diet compatible students, quietly prioritizing CARE Services students, and widens the search in waves if spots go unclaimed.

Hackathon: KSU AI Club Hackathon 2026. Deliverables due **Friday Nov 20, 12:00 PM**: pitch deck (PowerPoint) plus demo video. Pitches 5:30 to 8:30 PM, 5 minutes per team.
Tracks: AI Club (primary), Nudox (most organized codebase wins, so code quality is a prize here), it. track TBA.

## Doc map

| File | Read it when |
|---|---|
| docs/SOUL.md | You need to know why something exists or how it should feel |
| docs/ARCHITECTURE.md | You add a component, endpoint, table or integration |
| docs/DISPATCH.md | You touch matching, waves, claims or ranking |
| docs/PRIVACY_SAFETY.md | You touch student data, CARE priority, photos, allergens or notification text |
| docs/DATA.md | You touch seed data, personas, the eval set or the survey |
| docs/DOMAIN.md | You need any KSU fact or statistic. Never invent one |
| docs/DEMO.md | You touch anything a judge will see |
| docs/ROADMAP.md | You need to know what is next or what to cut |

## Ground rules

1. **The demo flow comes first.** Photo in, right phones buzz, map shows why. If a feature does not serve that flow by Thursday night, it waits.
2. **Never invent facts.** KSU facts and statistics come only from `docs/DOMAIN.md`. Missing facts get `TODO(verify)` and stay out of the UI and slides until verified.
3. **Label simulated data.** Simulated students carry `is_simulated = true` and render with a distinct marker. We tell judges which students are simulated.
4. **CARE priority is invisible.** No screen, log line visible to hosts, notification or API response to non admins may reveal that a student is prioritized. See `docs/PRIVACY_SAFETY.md`.
5. **Allergen output is an estimate.** Never present AI allergen detection as a guarantee. Every allergen display carries "may contain, confirm with host."
6. **Hard filters before ranking.** A student is never invited to food that conflicts with their declared allergens. This is tested and must stay tested.
7. **The engine decides, the LLM describes.** Dispatch is deterministic Python. LLMs may parse input and write alert text, never choose who gets invited.
8. **Sponsor tech must do real work.** No integration exists just for a logo.
9. **Secrets live in `.env`.** Keep `.env.example` current. Never commit keys, phone numbers, tokens or real student data.
10. **Photos are temporary.** Uploaded photos are deleted within 24 hours (S3 lifecycle rule plus local cleanup).

## Code organization (this is judged by Nudox)

* One responsibility per module. Business logic never lives in route handlers.
* `services/api/dispatch/` is pure Python with no web, database or network imports. It takes plain dataclasses in and returns decisions out. This keeps it testable and readable.
* External services (vision, push, SMS, auth) sit behind small interfaces in `services/api/providers/` so they can be swapped or faked in tests.
* Shared request and response models live in `services/api/schemas/`. Frontend types are generated from the OpenAPI schema (`make types`).
* Every public function has type hints and a short docstring explaining why, not what.
* Tests mirror the source tree under `services/api/tests/`.
* No dead code, no commented out blocks, no stray debug prints. Use the logger.
* Conventional commits: `feat(dispatch): widen ring after timeout`, `fix(web): ...`, `docs: ...`.

## Repo layout

```
apps/web/
  app/host/              Host flow: photo, review AI estimate, publish
  app/student/           Student flow: onboarding, alerts, claim
  app/dispatch/          Big screen: map, waves, reasons (demo view)
  public/firebase-messaging-sw.js
services/api/
  main.py                App factory, router registration only
  routes/                Thin HTTP layer
  dispatch/              Matching engine (pure)
  vision/                Food estimation using providers
  providers/             gemini.py, bedrock.py, fcm.py, twilio_sms.py, entra.py
  schemas/               Pydantic request and response models
  db/                    SQLModel tables, session, migrations
  tests/
data/seed/  data/eval/  docs/
```

## Commands

```
make setup     install deps
make seed      load buildings, simulated students, demo personas
make dev       run API and web
make test      run tests (dispatch tests must pass before any merge)
make lint      ruff + eslint + prettier
make types     regenerate frontend API types
make eval      run vision accuracy eval on data/eval
make demo      reset database and seed the scripted demo state
```

Create a target if it is missing.

## Conventions

* Python 3.11, ruff for lint and format, SQLModel tables, Pydantic v2 schemas.
* TypeScript strict, App Router, server components by default, client components only when needed.
* Times stored in UTC, shown in America/New_York.
* H3 resolution 11 for locations, rings computed with `grid_disk`.
* IDs are UUIDs. Building codes match `data/seed/buildings.yaml`.

## When unsure

Choose the simplest option that keeps the demo flow working, leave `TODO(team): <question>`, and note it in your summary. Do not stall.
