# Local demo runbook

Use synthetic students and a demo tray. No campus policy approval, partner access, survey results, live vision accuracy or physical push receipt is implied by local mode.

## Install and start

Python 3.11, Node 20+, GNU Make and `uv` are required. From the integration checkout:

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

Physical push requires HTTPS, Firebase project configuration, authorized Android and Home Screen iPhone, and observed device receipts. Default `NOTIFICATION_PROVIDER=log` remains simulated and push-token registration returns an explicit 503. Entra and email-code auth are pending; composition requires both `AUTH_MODE=demo` and `DEMO_MODE=true`.

Optional FCM composition is implemented for explicitly approved synthetic demo recipients. To configure it privately, set `NOTIFICATION_PROVIDER=fcm`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` (one-line JSON), `PUSH_TOKEN_ENCRYPTION_KEY` (a Fernet key), and comma-separated synthetic UUIDs in `FCM_ALLOWED_STUDENT_IDS`. Keep server credentials/key out of `NEXT_PUBLIC_*`, Git, screenshots and logs. The allowed IDs must come from the private synthetic seed; set them only after the device owners are explicitly authorized. Missing or invalid configuration fails startup. No real sends were run during integration checks; absent configuration and observed receipts remain readiness blockers.

FCM mode registers the authenticated student's token through encrypted persistence and resolves plaintext only inside the transport. The public registration response is only `{"registered": true}`. The notification contains uniform text and the drop ID; host views remain serving counts. `make demo` clears encrypted token registrations in the same reset transaction, so authorized devices must register again after every reset. Health reports `fcm` as the selected transport, which does not prove delivery. No external send is authorized beyond explicitly nominated demo phones.

The manager-approved `GET /demo/active-drop` returns only `{"drop_id": UUID or null}` to demo host/projector roles. It discovers the newest draft/live/claimed-out drop across devices and returns null after reset; students and production auth cannot access it. The projector frontend will use this endpoint after accepted web integration. Reset seeds students only; it never creates a drop or invitations.

No deployment/provisioning is authorized. Vercel/AWS are intended targets. Before retaining uploaded photos, wire S3 24-hour lifecycle plus local cleanup. Current route processing retains no uploads. Keep a local cached estimate, phone hotspot, recorded backup and second laptop for Thursday rehearsal.

## Submission

`submission/` contains the local editable PowerPoint, survey copy, recording plan and draft live-demo note. `make deck` regenerates slides. Verify slides visually in PowerPoint/LibreOffice, insert only actual evidence and team contributions, and record the backup after physical rehearsal. Johaan submits by Friday November 20 noon Eastern (17:00 UTC). Do not push, deploy, distribute survey text or submit without Johaan's action/approval.
