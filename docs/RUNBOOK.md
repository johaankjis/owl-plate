# Local demo runbook

Use synthetic students and a demo tray. No campus policy approval, partner access, survey results, live vision accuracy or physical push receipt is implied by local mode.

## Install and start

Python 3.11, Node 20+ and `uv` are required. From the integration checkout:

```bash
cp .env.example .env
make setup
make demo
make dev
```

Web: http://localhost:3000. API: http://localhost:8000, OpenAPI docs `/docs`. `.env.example` selects explicit demo auth, fixture vision and simulated notifications. `.env` remains private. Stop with Ctrl-C. If either port is occupied, stop the earlier Owl Plate process before restarting; do not kill unrelated projects.

## Deterministic rehearsal

Open `/host`, `/student` on each demo phone and `/dispatch` on the projector. Use explicit synthetic roles. Keep the host's browser tab open while reviewing and publishing. Allergen estimates always say “may contain, confirm with host.” Fixture mode is labeled and does not analyze uploaded pixels. Avoid photographing people.

For the short two-wave script, set final servings to **2**, leave dairy/gluten selected, and leave vegetarian unselected. Confirm the three safety checks. Ingredient review is required to remove estimated allergens. Publish invites A and C. B has a dairy conflict, D is outside ring 2, E requires vegetarian food. A claims one serving. C expires after 60 demo seconds; the next 10-second scheduler tick widens to ring 4 and invites D. A and C never receive another invitation for this drop. Available/held/picked-up counts remain consistent.

The default fixture estimate is 8 servings; 2 is a deliberate host edit for this short rehearsal. The other 25 simulated students have alerts paused to keep the script repeatable. A vegetarian variant can invite E subject to eligibility and ranking. Coordinates are arbitrary placeholders, not verified campus locations.

`make demo` atomically resets the persisted local DB through the application's `/demo/reset` route. It clears drops, invites, holds and demo clock offset, then reseeds 30 synthetic students. Reset after each full run. `make smoke` uses an isolated temporary SQLite database and actual HTTP entrypoints to verify the same loop without touching rehearsal state.

## Verification

```bash
make test
make lint
make types
make smoke
cd apps/web && npm run build
```

`make eval` runs **offline synthetic calculation checks**, not measured vision accuracy. Only hand-labeled real photos plus live provider predictions can establish measured accuracy. See `data/eval/README.md` when integrated.

## Live checks and backups

Gemini: set VISION_PROVIDER=gemini and a configured GEMINI_MODEL/key privately; keep demo auth while using synthetic students. A provider failure returns an error, never an unlabeled fixture. Record source photo, ingredient truth, model ID, timestamp and response for eval without saving private images in Git.

Physical push requires HTTPS, Firebase project configuration, private encrypted token resolution/server composition, authorized Android and Home Screen iPhone, and observed device receipts. Current log adapter is simulated. No external send is authorized beyond explicitly nominated demo phones. Entra and email-code auth are pending; production composition fails closed.

No deployment/provisioning is authorized. Vercel/AWS are intended targets. Before retaining uploaded photos, wire S3 24-hour lifecycle plus local cleanup. Current route processing retains no uploads. Keep a local cached estimate, phone hotspot, recorded backup and second laptop for Thursday rehearsal.

## Submission

`submission/` contains the local editable PowerPoint, survey copy, recording plan and draft live-demo note. `make deck` regenerates slides. Verify slides visually in PowerPoint/LibreOffice, insert only actual evidence and team contributions, and record the backup after physical rehearsal. Johaan submits by Friday November 20 noon Eastern (17:00 UTC). Do not push, deploy, distribute survey text or submit without Johaan's action/approval.
