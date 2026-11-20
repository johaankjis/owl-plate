# Milestone 5 — Operations & Impact Dashboard

Baseline: `6fdd96b983f41723229eb02b667eb160604ea402`.
Final branch: `feature/impact-dashboard`. Local only; no push, deployment or main merge.

## Product behavior

`/dispatch` and `/impact` share Food Rescue Analytics. The historical projector,
verified H3 aggregate map, seeded personas and rehearsal controls remain under
`/admin/projector`, linked from `/admin`. Normal navigation says Analytics.
The pantry workspace groups incoming requests, accepted requests and completed
simulated handoffs, with scoped food photos and policy acknowledgment at actions.

Analytics derives counts from persisted campus-feed records and uses the same
expire-first inventory ledger as reservations and pantry allocations. Drafts and
seeded-wave rehearsals are excluded. No student identities appear in responses.
The publication cohort follows Today, Last 7 days or All time in America/New_York.
Series uses stored event dates, not publication dates substituted for collection.
Missing legacy completion timestamps are disclosed rather than fabricated.

Inventory reconciles published servings into available, student reserved, student
pickups, pantry reserved, simulated pantry transfers and expired unclaimed.
Reservations, releases and pending pantry requests never count as recovered food.
Student recovery uses student pickups / published servings. Combined demonstration
recovery adds explicitly simulated pantry transfers. Both rates are zero-safe.
Participating students means distinct student sessions that successfully reserved
selected listings, including later released or expired reservations; it does not
assert unique people. Average reservation delay includes each successfully created
claim once, including released/expired claims. Hosts are distinct publishing owners.

Estimated meal value and recovered food weight are illustrative calculations, not
measured financial savings or food-waste reduction. Server defaults are configurable
with `OWL_ESTIMATED_MEAL_VALUE_USD` (5) and
`OWL_ESTIMATED_FOOD_KG_PER_SERVING` (0.35). The dashboard shows the assumptions and
allows temporary what-if adjustments. Recovery estimates include simulated pantry
transfers explicitly. These assumptions are not KSU measurements.

## Recording dataset

Start an isolated fixture/log runtime from the verified worktree:

```bash
NEXT_PUBLIC_IT_COMPANION_BASE_URL=http://127.0.0.1:9 PYTHONPATH=. \
  .venv/bin/python -m scripts.present \
  --port 3027 --api-port 8027 --vision fixture --notifications simulated --rebuild
```

In another terminal in that same checkout, explicitly replace only its demo records:

```bash
PYTHONPATH=. .venv/bin/python \
  -m scripts.load_recording_dataset --confirm-replace-demo-data
```

The command rejects live ports and verifies fixture vision plus simulated push.
The backend independently checks role, demo gates, provider configuration and
explicit confirmation. The dashboard also offers an unchecked confirmation in
recording-capable runtimes. GET never seeds data. Sample activity is persisted,
deterministic relative to its manifest anchor, and prominently labeled simulated.
It must never be described as real campus deployment results. Ordinary demo reset
clears the sample marker; the reset tools are in `/admin/projector`.

## Manual acceptance walkthrough

1. Start isolated fixture/log mode and reset to Visitors in `/admin/projector`.
2. Open `/dispatch` and confirm the empty dashboard.
3. In `/host`, upload a food-only photograph, review the recognition estimate,
   set 3 servings, select a verified building and room, complete safety assertions,
   and publish. Confirm that the listing photo and available count appear.
4. Join as one student, search food or building, open food details and reserve.
   Check the walking directions and hold countdown. Submit a pickup photograph,
   then explicitly confirm pickup. Repeat with a second student session in a separate browser profile or private window.
5. In the host workspace request a pantry referral for the remaining serving,
   after reading and acknowledging the policy notice. Pending allocates no stock.
6. In `/pantry`, review pickup/safety information, acknowledge the simulation and
   policy, and accept one serving. Back in the host workspace explicitly confirm
   the simulated handoff. Coordinator acceptance alone never marks a transfer.
7. Without reloading `/dispatch`, verify Published 3, Student pickups 2, Simulated
   pantry transfers 1, Available 0, Student reserved 0 and Pantry reserved 0.
   Student recovery is 66.7%; combined demonstration recovery is 100%.
8. Switch Today / Last 7 days / All time. Load the optional recording dataset using
   explicit confirmation and inspect charts, active listings and recent activity.
9. Check `/impact`, the pantry portal and theme controls on mobile and desktop.

## Verification and source binding

Application and browser evidence commit:
`d638e2037be322c0748f7904e9cbbb18a1fef960`.
The final handoff commit adds documentation and a Make target confirmation guard;
application sources remain byte-identical. Independent exact-commit review and
post-review runtime binding are recorded in local evidence
`test-results/operations-glm-review.md` and `test-results/operations-runtime.json`.
No review verdict or runtime restart is claimed by this source document itself.

| Check | Result |
| --- | --- |
| API | 315 passed; one upstream Starlette/httpx deprecation warning |
| Web | 93 passed (clean checkout; excludes 5 unrelated uncommitted origin tests) |
| Evaluation / campus / It companion | 116 / 4 / 10 passed |
| Verified Marietta dataset | 43 buildings, 1,591 checks, zero failures |
| Ruff | check and format pass across 113 Python files |
| ESLint / Prettier / TypeScript | pass |
| Production build | pass, including `/dispatch`, `/impact`, `/pantry`, `/admin/projector` |
| Regenerated OpenAPI and TypeScript | byte-identical, zero drift |
| Real HTTP acceptance and races | pass |
| iPhone 390×844 / Android 412×915 / desktop 1440×1000 | pass; zero browser errors and no horizontal overflow |
| Natural seeded rehearsal | pass, 97.782 seconds, no video recorded |
| Explicit recording CLI | pass on isolated fixture/log runtime |

All four final browser/route/rehearsal evidence artifacts bind the application
commit above. `test-results/operations-checks.json` consolidates coverage and
hashes; `test-results/operations-logs/` holds command logs. Browser actions include
host upload/recognition/review/publication, scoped photo loading, student join,
map marker coordinates, search/details/reservation/directions/photo verification,
two explicit pickups, pantry acceptance, host handoff, automatic analytics polling,
date filters, confirmed recording loading, and `/impact` parity. The HTTP harness
adds empty/zero-denominator/role/privacy cases, pending and rejected pantry,
release, reservation and listing expiry, duplicate actions, five inventory races,
multiple buildings/categories and dataset reset/regeneration.

Screenshot folders: `test-results/operations-ui/` contains empty, acceptance and
recording analytics, incoming/completed/recording pantry, and host handoff at all
three sizes. Photos in acceptance are deliberately synthetic PNG uploads. The
recording dataset has no actual food photos and uses the polished placeholders;
normal scoped host uploads remain available in cards and details. No private
pickup verification photo is stored or exposed.

OpenAPI SHA256: `3389fe5957b33c3449ec46c3ef8aedb238663cea6a006dfcc73efa734d017587`.
Generated TS SHA256: `54d70f0ec6004f8d369734c5af07c6d92fdbc54d1ad165b349b1f3d80edd6b08`.

Worker source commits:

- Antigravity `gemini-4-neon`: `040da48afcc8ccd0f7f1db851992aac623f9b502`, integrated as `bf322dd`.
- Claude `claude-opus-5-5`: `2a754420ceeb4ce277d85f791a6b174fe8d3f65b`, integrated as `25d98ef`.
- Manager: shared contract, generated aliases, admin migration, `/impact`, navigation,
  recording CLI, acceptance scripts, final integration and the pantry receipt copy fix.

Frontend thread:
<t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/thread:delegated-task:command%3Amcp%3A7f19e7db-e2bf-40dc-b6f9-db077aac0d26%3Adelegate-task%3A388fea0d-8fbe-4e24-b145-35e1a31d303b>

Backend/pantry thread:
<t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/thread:delegated-task:command%3Amcp%3A7f19e7db-e2bf-40dc-b6f9-db077aac0d26%3Adelegate-task%3Ab6931439-12f2-4784-84f3-27106834d7b7>

The optional Make target also requires explicit acknowledgment:
`make recording-dataset CONFIRM_REPLACE_DEMO_DATA=true`. Direct Python commands
above are available where Make is not installed. Existing canonical dirty files
(16 hash-checked paths), private `.env` and Firebase service account are preserved.
The canonical pre-switch database is preserved; the verified runtime uses its own
worktree database. No cloud, Git push, main merge or submission materials changed.

Physical push receipt, physical pickup, physical pantry transfer, independently
measured live-model accuracy and a paired It device remain unverified. Synthetic
fixture and browser checks do not establish those claims.
