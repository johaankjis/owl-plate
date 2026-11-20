# Milestone 5 — Operations & Impact Dashboard and pantry cleanup

Baseline: 6fdd96b983f41723229eb02b667eb160604ea402. Branch:
feature/impact-dashboard. Read AGENTS,SOUL,ARCHITECTURE,PRIVACY_SAFETY,
CONSUMER_UX_CONTRACT,PANTRY_FALLBACK_CONTRACT. Preserve reviewed functionality,
canonical dirty deployment/AWS files/private configuration and live3017/8017 plus
DeckScout8000. Candidate3027/8027 only. No push/deploy/main/slides/external contact.

The full user specification is authoritative. Do not invent measured KSU impact,
monetary savings, food weights, accuracy or physical receipts. Estimated impact
uses explicit configurable illustrative assumptions only.

## Ownership (workers branch only from committed contract entry)

Codex: architecture/contract, apps/web/lib/types/operations.ts,
apps/web/lib/operations-api.ts, generated OpenAPI/TS, scripts/**,Makefile,
docs/OPERATIONS_HANDOFF.md, app/admin/**, app/impact/**, navigation labels, integration/actual browser evidence/final verification.
Antigravity Neon: app/dispatch/**,components/operations/**,
components/DispatchMap.tsx,lib/operations-helpers.ts,
tests/operations-dashboard.test.mjs. Reuse existing shared design tokens/ui/map;
no dependency changes unless coordinated. No student/host/pantry/backend edits.
Claude Opus: services/api/**,app/pantry/**,components/HostPantryCard.tsx,
lib/pantry-helpers.ts,tests/pantry.test.mjs,new tests/pantry-cleanup.test.mjs.
Backend analytics/tests and deterministic recording dataset live under
services/api/analytics/**; minimal main/routes/application/model composition only.
No shared frontend contracts/generated files or scripts edits.
GLM5.3: fresh exact-integrated-commit read-only independent review later.
No Argon. No worker may start subagents or poll another worker.

## Data provenance, scope and inventory

GET /analytics/operations?period=today|7d|30d|all (default7d), projector ONLY.
All data from persisted domain tables in the configured database, via existing
serialized transaction/expiry sweep first. No random/client-generated counters,
no provider calls. Campus-feed published cohort only; drafts and seeded waves
excluded from operations analytics (seeded rehearsal remains intact separately).
Filter cohort by published_at (legacy fallback created_at); inclusive NY date
window through server_time. Summary/outcomes/buildings/categories/active listings
all refer to this publication cohort. Series and activity further restrict events
to the window and use actual event dates: publication timestamp,
HostPickupNotification.created_at (unique claim), terminal PantryReferral.updated_at,
and original deadline for expiry. Never assign pickups to publication dates or
invent missing historical completion timestamps; disclose missing coverage in notes.
Snapshot schema/version v1.

Every selected published drop's total inventory is assigned to exactly one of:
available (unexpired),student_reserved (unexpired held),student_pickups,
pantry_reserved (unexpired accepted),pantry_transfers (simulated confirmed),
expired_unclaimed (expired total minus picked_up minus pantry_transferred).
These six outcomes sum to total_servings_offered. Historical expired stock is
never shown as currently available. Counts/availability use the existing _counts
ledger, never a parallel allocator. No added event logging or claim schema
migration is necessary. Idempotent repeats never inflate metrics.
No claim/student/host identifiers, nicknames, preferences, tokens, CARE priority,
private photos or GPS appear in analytics. Drop UUID/building verified registry
metadata only where operationally useful. Joined_sessions means sessions, not
unique people; count only actual visitor sessions, never seeded personas. It is
current DB context (unfiltered by listing cohort), explicitly described in notes.
Pantry movement always visibly simulated; student pickup is a recorded app state,
not independently verified physical food collection. No numerical real-world
impact claim from the recording dataset.

## Exact response

`apps/web/lib/types/operations.ts` is the exact field/type contract. Retain older
fields for compatibility, add required fields:

- summary.combined_recovery_rate_percent = 100*(student_pickups+pantry_transfers)/total_servings_offered.
- summary.student_pickup_rate_percent = 100*student_pickups/total_servings_offered.
  Both zero when denominator zero; UI one decimal, API full precision permitted.
- summary.average_reservation_seconds: number|null. Mean nonnegative delay from
  publication to successfully created claim, including held/picked_up/released/
  expired claims. Successful reservation is not successful recovery. Each claim
  once. Null when none; document definition in notes.
- summary.participating_hosts: distinct owners of selected published listings.
- summary.participating_students: distinct students with successfully created
  claims on selected listings. Sessions, never asserted unique physical people.
- categories: deterministic documented food-name classification with Other fallback,
  category/published_listings/total_servings_offered/student_pickups/pantry_transfers.
- active_listings: unexpired selected listings with drop_id/food/category/building/
  room/published_at/expires_at/status/has_photo/photo_url/total_servings/available/
  held/picked_up/pantry_held/pantry_transferred. No identities; scoped JPEG endpoint
  uses bearer header, never tokens in URL or private verification images.
- estimates: currency USD, meal_value_per_serving, food_kg_per_serving,
  recovered_servings, equivalent_meal_value, recovered_food_kg, assumptions[].
  Recovered = student pickups + explicitly simulated transfers; visible labels
  distinguish them. Backend env `OWL_ESTIMATED_MEAL_VALUE_USD` default5 and
  `OWL_ESTIMATED_FOOD_KG_PER_SERVING` default0.35, finite nonnegative bounded
  values. Illustrative choices, not measured KSU facts; document beside estimates.

GET period today|7d|30d|all; UI Today/Last7days/Alltime. America/New_York dates
including DST. Six outcomes sum total offered. All16 user metrics required.

## Deterministic recording data

POST /demo/recording-dataset with {confirm_reset:true}; projector, BOTH demo gates
AND fixture vision + log notification configuration ONLY. 422 absent/false ack,
403 wrong role/gates,409 recording_unavailable when live providers configured.
Never callable automatically by GET, a query param or a timer. Explicit confirmation
warns that it replaces app demo data; default app startup remains visitors.
Use normal persisted domain tables, existing inventory rules and verified campus
registry. No network, real photos, real users/tokens, pushes or external messages.
Atomic reset+seed; normal reset clears dataset marker. Marker persists across app
restart and GET reflects recording provenance. Return OperationsResponse(all).
Backend recording composition flag must be server-derived (not body/query).
Direct seed is allowed only through a small service with injectable anchor_time;
relative timestamps and UUIDs fixed by seed_version+anchor so repeated fixed-anchor
seeds produce identical metrics/activity. Manifest supplies seed_version and actual
anchor_time. At least6 verified buildings,8 published drops across7days, mixed
foods, current capacity/holds, student pickups, expired unclaimed, all pantry
states including transfer and pending requests, a pending de-identified pickup
review. All inventory balances; active food has future deadline, holds valid.
No outbox entries can cause external sends; delivery flags consumed/registrations
empty. Never label the dataset as measured campus impact or current live demand.
UI must prominently and persistently label Recording dataset / Simulated data
when active, also in charts/tooltips. Switching to current app data requires
explicit ordinary demo reset; no hidden data swapping. No disconnected fake JSON
response in the frontend. Current DB empty state stays truthfully zero.

## Dashboard design and pantry cleanup

Replace /dispatch with main Food Rescue Analytics. /impact aliases that exact
implementation. Remove H3 map, audience/QR/persona/clock/provider/rehearsal controls
from analytics. Manager preserves baseline projector/rehearsal under
/admin/projector, linked from /admin. Consumer nav says Analytics. Preserve
/distribution, maps and It contracts. Existing consumer light/dark tokens, KSU gold,
professional desktop-first responsive charts, accessible labels/contrast, restrained
motion, empty/loading/stale/error states. Header brand/title/date filters/update time.
Primary shared/collected/available/student recovery; secondary students/reservation
delay/hosts/simulated transfers. Separate combined demo recovery. Charts actual-date
publishing/collection, buildings, six outcomes, categories. Active listings table
with scoped photos/location/counts/deadline/status; recent activity. Estimates show
assumptions. Auto polling, no overflow,44px mobile controls. Persistent recording
simulation label. Destructive seed only explicitly confirmed in server-enabled
fixture/log mode; diagnostics/reset/presenter stay admin.

Pantry cards: reduce repeated page/banner/policy clutter, clean photo/food/quantity/
pickup/deadline hierarchy, concise state/action labels, separate historical Accepted
servings from CURRENT Pantry reserved/Student held/Student pickups/Pantry transfers.
Keep one concise full required policy notice and official CARE/catering links at
EACH confirmation context. Never remove required notice, explicit unchecked ack,
separate host handoff, simulated wording, allergen notice or host-assertion framing.
Do not imply CARE approval or image proof of safety. Pending reserves nothing.
Students continue reserving until acceptance, no hold override. Preserve testids
where practical and no student admin UI. Mobile44px targets, keyboard focus, dark
mode, no horizontal overflow. Do not alter host wizard/student consumer journeys.

## Verification and handoff

API analytics fixtures prove exact totals/cohortdates/NY boundaries/zero denominators/
periodvalidation/auth/privacy/expired exclusion/idempotent actions and inventory
sum, recording fixed-anchor repeatability/atomic reset/provider gate/reset marker.
Web helpers test data math/formatting, chartempty/zero and responsive states.
All prior API/web/eval/campus/It/dataset1591/Ruff/lint/types/build/schema drift;
actual dashboard+pantry mobile390x844,Android412x915,desktop1440x1000 with screenshots,
loaded recording dataset shown as simulated, current empty state, period changes,
reservation and pickup change DB metrics without refresh, pantry acceptance/handoff
exact3/0/0/2/0/1 plus student66.7%/combined100%, map/feed/photoACL/TTL/diet/expiry/concurrency/pushcontract/It/seeded
rehearsal. Distinguish backend/unit/browser/physical evidence honestly. Browser
preview_status/open first per tools; fallback Chromium plus existing /tmp libs if
unsupported/two failures. No missing-browser claim until existing known tools tried.
Fresh GLM exactSHA review, then manager restarts reviewed app3017 with existing
private OpenRouter/Firebase. Dataset current default; no real messages/providers
for test runs. Physical push/pickup/transfer/liveaccuracy/pairedIt remain unverified.
