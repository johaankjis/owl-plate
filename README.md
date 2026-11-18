# Owl Plate

Leftover food and spare meal swipes, sent to the KSU students who need them, not just the ones who happen to be fastest.

An event host takes one photo of leftover food. AI identifies the food, estimates servings and flags likely allergens. A dispatch engine then notifies only as many nearby, opted in students as there are servings, skipping anyone the food is unsafe for and quietly prioritizing students registered with CARE Services. If nobody claims a spot in time, it moves to the next student in a wider ring.

Built for the KSU AI Club Hackathon 2026 (CampusOS), Nov 16 to 20, Marietta Campus.
Tracks: AI Club (primary), Nudox (most organized codebase), it. track if it fits.

## Why

* KSU CARE Services runs a pantry on each campus, and demand keeps growing. See `docs/DOMAIN.md`.
* Many universities run free food alerts, but they broadcast to everyone. Food goes to whoever is closest and quickest, hosts have to type details, and nothing matches servings, allergies or need.
* Owl Plate fixes that with one photo and smart dispatch.

## How it works

```
Host snaps photo ──> Vision AI ──> {food, servings, allergens, confidence}
                                         │
Opted in students (diet, allergens,      v
presence, priority) ────────────> Dispatch engine ──> Wave 1 pushes (just enough)
                                         │                    │
                                         │            "I'm coming" claims
                                         v                    │
                              Unclaimed after timeout ──> Wave 2, wider H3 ring
```

## Stack

| Layer | Tech |
|---|---|
| Web app (PWA) | Next.js (App Router, TypeScript), Tailwind, deck.gl + h3-js |
| Push | Firebase Cloud Messaging (web push), Twilio SMS fallback |
| API | FastAPI (Python 3.11), SQLModel, Postgres (SQLite locally) |
| Vision | Gemini (structured JSON output), Amazon Bedrock as fallback provider |
| Geo | Uber H3 (Python `h3` v4 and `h3-js`) |
| Sign in | Microsoft Entra ID (KSU accounts) with KSU email code fallback |
| Hosting | Web on Vercel, API on AWS, photos in S3 with 24 hour deletion |

## Quickstart

```bash
cp .env.example .env          # fill in keys, see docs/ARCHITECTURE.md
make setup                    # install Python and Node deps
make seed                     # load demo campus, buildings and simulated students
make dev                      # API on :8000, web on :3000
make test                     # unit tests
```

Push notifications need HTTPS. Use the deployed web app, or a tunnel, when testing on phones.

## Repo layout

```
apps/web/            Next.js PWA: host flow, student flow, dispatch screen
services/api/        FastAPI: drops, vision, dispatch, claims, push, auth
services/api/dispatch/   The matching engine (pure Python, fully tested)
services/api/vision/     Vision providers behind one interface
data/seed/           Buildings, simulated students, demo personas
data/eval/           Food photo set with hand counted servings (vision accuracy)
docs/                Project docs (start with AGENTS.md at the root)
```

## Docs

| Doc | What it covers |
|---|---|
| AGENTS.md | Rules and conventions for anyone (human or AI) writing code here |
| docs/SOUL.md | Purpose, principles, voice |
| docs/ARCHITECTURE.md | Components, data model, API, sponsor tech |
| docs/DISPATCH.md | The matching engine spec |
| docs/PRIVACY_SAFETY.md | Dignity, privacy and food safety rules |
| docs/DATA.md | Seed data, demo personas, vision eval set, survey |
| docs/DOMAIN.md | Verified KSU and market facts with sources |
| docs/DEMO.md | Demo script, pitch, judge Q&A |
| docs/ROADMAP.md | Build plan through Friday noon |

## Team

TODO(team): names and who owns what.
