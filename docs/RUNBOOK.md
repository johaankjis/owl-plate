# Local demo runbook

Use synthetic students and a demo tray. No campus policy approval, partner access, survey results, live vision accuracy or physical push receipt is implied by local mode.

## Install and start

Python 3.11, Node 20.9+, GNU Make and `uv` are required. Integration used Node 24. From the integration checkout:

```bash
cp .env.example .env
make setup
make demo
make dev
```

Web: http://localhost:3017. API: http://localhost:8017, OpenAPI docs `/docs`. `.env.example` selects explicit demo auth, fixture vision, simulated notifications and API-backed web. `make dev` loads root `.env` for both processes, uses the selected Python interpreter, and stops both process groups when either exits or Ctrl-C is pressed. `.env` remains private. If either port is occupied, stop the earlier Owl Plate process before restarting; do not kill unrelated projects.

Owl uses `API_PORT=8017` and `WEB_PORT=3017` by default, separate from DeckScout's occupied port 8000. Never stop or signal DeckScout or any unrelated service. To change Owl ports, update API_PORT/WEB_PORT plus the matching public API URL and CORS origin. The launch script reads both port variables.

The web defaults to API requests. Failed requests remain visible errors; failed mutations never silently succeed in a local fixture. Photo uploads allow 65 seconds. For a standalone UI showcase only, explicitly set `NEXT_PUBLIC_UI_FIXTURE_MODE=true` before starting/building web. A global banner labels browser-only simulation, no API calls run, and real FCM registration is disabled. Keep this false for integrated rehearsals. This flag is separate from server `VISION_PROVIDER=fixture`, which still runs real API transitions and labels only the vision estimate as cached.

Next public settings are embedded at web build time. When serving a production build, set `NEXT_PUBLIC_API_URL=http://localhost:8017` and fixture mode before `npm run build`, then `npm run start -- --port 3017`. Phone access requires the API URL to be reachable from the phone, not its own localhost; set `CORS_ORIGINS` to the actual web origin. HTTPS/install/device push proof remains separate.

## Deterministic rehearsal

Open `/host`, `/student` on each demo phone and `/dispatch` on the projector. Use explicit synthetic roles. Select a genuine JPEG/PNG on the host; empty upload is rejected, and no SVG sample is mislabeled as an image. Keep the host's browser tab open while reviewing and publishing. Allergen estimates always say “may contain, confirm with host.” Cached server vision is labeled and does not analyze uploaded pixels. Avoid photographing people.

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

`make test` runs API/provider, supported eval root discovery and sandboxed client tests. `make lint` includes Ruff for services/scripts/eval and web ESLint/Prettier. `make types` exports composed OpenAPI and formats generated TypeScript; frontend HTTP types alias its schema definitions. `npm run typecheck` is also available in apps/web. `make eval` runs **offline synthetic calculation checks**, not measured vision accuracy. Only hand-labeled real photos plus live provider predictions can establish measured accuracy. See `data/eval/README.md`.

Manifest PNG icons are 192x192 and 512x512; apple-touch-icon is 180x180, matching the existing owl mark. Regenerate deterministically with `python -m scripts.build_icons`. Valid icons/manifest do not by themselves prove installation or phone delivery.

## Live checks and backups

The optional browser proof script `scripts/browser_smoke.cjs` uses independent host, projector and mobile student contexts against the real local routes. It resets demo state and checks the full two-wave loop, a deck.gl canvas, no cross-student invites and no uncaught browser errors. Install Playwright Core/Chromium outside the repo or in your own developer tooling, set `OWL_PLAYWRIGHT_MODULE` to its package path, optionally set `OWL_BROWSER_EXECUTABLE`, then run `node scripts/browser_smoke.cjs` while Owl is running. It uses API 8017/web 3017 by default; override `OWL_API_URL` and `OWL_WEB_URL` together with server configuration. The tested projector viewport is 1920×1080 and the mobile viewport is 390×844. Output screenshots go to gitignored `test-results/browser/` unless `OWL_BROWSER_ARTIFACTS` is set. This script is for synthetic demo mode only and resets the database.

Gemini: set VISION_PROVIDER=gemini and a configured GEMINI_MODEL/key privately; keep demo auth while using synthetic students. A provider failure returns an error, never an unlabeled fixture. Record source photo, ingredient truth, model ID, timestamp and response for eval without saving private images in Git.

Physical push requires HTTPS, Firebase project configuration, authorized Android and Home Screen iPhone, and observed device receipts. Default `NOTIFICATION_PROVIDER=log` remains simulated and push-token registration returns an explicit 503. Entra and email-code auth are pending; composition requires both `AUTH_MODE=demo` and `DEMO_MODE=true`.

Optional FCM composition is implemented for explicitly approved synthetic demo recipients. To configure it privately, set `NOTIFICATION_PROVIDER=fcm`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` (one-line JSON), `PUSH_TOKEN_ENCRYPTION_KEY` (a Fernet key), and comma-separated synthetic UUIDs in `FCM_ALLOWED_STUDENT_IDS`. Keep server credentials/key out of `NEXT_PUBLIC_*`, Git, screenshots and logs. The allowed IDs must come from the private synthetic seed; set them only after the device owners are explicitly authorized. Missing or invalid configuration fails startup. No real sends were run during integration checks; absent configuration and observed receipts remain readiness blockers.

FCM mode registers the authenticated student's token through encrypted persistence and resolves plaintext only inside the transport. The public registration response is only `{"registered": true}`. The notification contains uniform text and the drop ID; host views remain serving counts. `make demo` clears encrypted token registrations in the same reset transaction, so authorized devices must register again after every reset. Health reports `fcm` as the selected transport, which does not prove delivery. No external send is authorized beyond explicitly nominated demo phones.

The manager-approved `GET /demo/active-drop` returns only `{"drop_id": UUID or null}` to demo host/projector roles. It discovers the newest draft/live/claimed-out drop across devices and returns null after reset; students and production auth cannot access it. The projector polls this endpoint every two seconds independently of host browser storage, shows a waiting state after reset, and fetches only synthetic persona decisions. Reset seeds students only; it never creates a drop or invitations.

Final integrated browser proof belongs to the manager. Shared preview launch failed missing system libraries; the manager has a working temporary Playwright/Chromium fallback. Until the final candidate is exercised, route/unit/build evidence is not browser proof.

No deployment/provisioning is authorized. Vercel/AWS are intended targets. Before retaining uploaded photos, wire S3 24-hour lifecycle plus local cleanup. Current route processing retains no uploads. Keep a local cached estimate, phone hotspot, recorded backup and second laptop for Thursday rehearsal.

## Submission

`submission/` contains the local editable PowerPoint, survey copy, recording plan and draft live-demo note. `make deck` regenerates slides. Verify slides visually in PowerPoint/LibreOffice, insert only actual evidence and team contributions, and record the backup after physical rehearsal. Johaan submits by Friday November 20 noon Eastern (17:00 UTC). Do not push, deploy, distribute survey text or submit without Johaan's action/approval.
