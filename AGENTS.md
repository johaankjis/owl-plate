# AGENTS.md

Guide for any coding agent or teammate working on Owl Plate. Read this first, then `docs/SOUL.md`, then `docs/ARCHITECTURE.md` before changing structure.

## What we are building

Owl Plate routes leftover event food and spare meal swipes to KSU students who need them. A host snaps one photo. Vision AI estimates food, servings and allergens. A dispatch engine pings just enough nearby, opted in, diet compatible students, quietly prioritizing CARE Services students, and widens the search in waves if spots go unclaimed.

Hackathon: KSU AI Club Hackathon 2026. Submission due **Friday Nov 20, 12:00 PM Eastern**. Pitches 5:30 to 8:30 PM, 5 minutes per team.
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
  app/host/              Host flow: photo, review estimate, publish, inventory, pickup reviews
  app/join/, app/student/  Student flow: join, campus feed and map, hold, photo-assisted pickup
  app/pantry/            Simulated CARE Pantry coordinator
  app/dispatch/, app/impact/  Food rescue analytics
  app/admin/             Diagnostics, dataset controls, seeded wave projector
  components/, lib/      Shared UI, maps, API clients, generated OpenAPI types
  public/firebase-messaging-sw.js
services/api/
  main.py                App factory, provider composition, router registration
  routes/                Thin HTTP layer
  application.py         Serialized transaction owner composing domain services
  feed/ pickup/ pantry/ analytics/   Domain rules inside the caller's session
  dispatch/              Seeded-wave matching engine (pure)
  vision/                Vision contract and safety post-processing
  providers/             openrouter.py, gemini.py, fcm.py, notifications.py
  campus/ sessions/ storage/   Verified buildings (H3), visitor sessions, short-lived photos
  schemas/               Pydantic request and response models
  db/                    SQLModel tables and serialized sessions
  tests/
prototypes/itcan/        It (itcan.do) pickup display and Campus Rescue Command Center
data/campus/  data/seed/  data/eval/  docs/  scripts/
```

## Commands

```
make setup     install deps
make seed      load buildings, simulated students, demo personas
make dev       run API and web
make test      run tests (dispatch tests must pass before any merge)
make lint      ruff + eslint + prettier
make types     regenerate frontend API types
make eval      offline synthetic vision scoring checks (not measured accuracy)
make campus    validate the verified Marietta building registry
make present   build and start the presentation demo (see docs/RUNBOOK.md)
make demo      reset database and seed the scripted demo state
```

Create a target if it is missing.

## Conventions

* Python 3.11, ruff for lint and format, SQLModel tables, Pydantic v2 schemas.
* TypeScript strict, App Router, server components by default, client components only when needed.
* Times stored in UTC, shown in America/New_York.
* H3 resolution 11 for locations, rings computed with `grid_disk`.
* IDs are UUIDs. Building IDs match the verified registry in `data/campus/marietta.json`.

## When unsure

Choose the simplest option that keeps the demo flow working, leave `TODO(team): <question>`, and note it in your summary. Do not stall.
