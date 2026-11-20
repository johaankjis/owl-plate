# Submission repository review

The submission preserves the application baseline `ecb881285d5c5c9de9db9443650c3363b557bec5`, including the Campus Rescue Command Center and final UI corrections. Integration uses ordinary merge commits; no squashing or history rewriting is required.

## Scope and reproducibility

Source, dependency manifests and the npm lockfile, OpenAPI schema, generated API types, verified campus dataset, fixtures, tests and working fallback implementations remain tracked. Private environment files, credentials, local It installations, caches, dependencies, runtime databases, test output and separately submitted deliverables are ignored. The 50 previously tracked files under `submission/` are excluded from the final tree; their existing history and local copies are preserved. Historic media therefore remains in Git history by design.

No deployment work from the dirty canonical checkout is included. No production deployment or Nudox indexing is claimed. Nudox is already installed on the owner's Mac; nothing was installed on the server.

## Nudox exploration targets

| Start here | Explore |
|---|---|
| `services/api/application.py`, `services/api/db/` | Reservation, expiry, pickup and pantry inventory transaction dependencies |
| `services/api/routes/`, `services/api/schemas/`, `apps/web/openapi.json`, `apps/web/lib/api.generated.ts` | Frontend/backend contracts and generated types |
| `services/api/vision/`, `services/api/providers/openrouter.py`, `services/api/providers/gemini.py` | Vision interface, Gemini providers and fixture behavior |
| `services/api/providers/fcm.py`, `services/api/providers/notifications.py`, `apps/web/public/firebase-messaging-sw.js` | Notification outbox, encrypted registrations and listing deep links |
| `services/api/dispatch/`, `services/api/campus/`, `data/campus/` | Pure deterministic planning, H3 rings and building validation |
| `prototypes/itcan/` | Companion publication, snapshots, action handlers and command center |
| `apps/web/components/`, `apps/web/lib/` | Shared UI, API clients, map and presentation dependencies |

## Nonblocking debt

- The backend `Backend` facade and student/pantry pages are large; domain services and smaller stateful components would improve navigation after the hackathon.
- Legacy `DemoHeader` and compatibility verification wrappers merit a later usage review. They are retained to avoid last-minute behavior changes.
- Browser verification scripts share a harness named for pantry; a later naming cleanup would clarify its wider role.
- Root Ruff targets omit the It prototype. Its independent test suite remains part of `make test`.
- The existing deployment Dockerfile omits the campus dataset; it must be corrected and validated before any deployment. Deployment is outside this submission's verified scope.
- Historical milestone handoffs contain environment-specific records and superseded plans. Current README and architecture describe the supported local application; historical records are evidence, not current deployment instructions.
- Python dependencies use bounded ranges rather than a committed resolved lockfile. npm dependencies have a committed lockfile.

## Publication boundary

Publish only the reviewed submission branch. Do not use `git push --all`, `--mirror` or force-push: unrelated worktrees and orchestration checkpoint refs are outside the submission audit. The security audit covers publication-reachable history, including deleted files; deleting a file from the current tree does not remove it from history.
