# Milestone 5 — Operations & Impact Dashboard and pantry cleanup

Baseline: 6fdd96b983f41723229eb02b667eb160604ea402. Branch:
feature/operations-impact-dashboard. Read AGENTS,SOUL,ARCHITECTURE,PRIVACY_SAFETY,
CONSUMER_UX_CONTRACT,PANTRY_FALLBACK_CONTRACT. Preserve reviewed functionality,
canonical dirty deployment/AWS files/private configuration and live3017/8017 plus
DeckScout8000. Candidate3027/8027 only. No push/deploy/main/slides/external contact.

The earlier detailed M5 request is absent from recovered thread/parent/repo.
Manager has requested any missing details asynchronously. This contract implements
all recoverable requirements; later user details steer ongoing work. Do not invent
KSU impact facts, monetary savings, CO2 weights, accuracy or physical receipts.

## Ownership (workers branch only from committed contract entry)

Codex: architecture/contract, apps/web/lib/types/operations.ts,
apps/web/lib/operations-api.ts, generated OpenAPI/TS, scripts/**,Makefile,
docs/OPERATIONS_HANDOFF.md, integration/actual browser evidence/final verification.
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
window through server_time. Chart series uses listing publication date/cohort,
NOT an invented pickup completion time. Snapshot schema/version v1.

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

## Exact response (frontend types committed beside this document)

OperationsResponse {
 schema_version:1,recording_available:boolean,
 dataset:{kind:'current'|'recording',label:string,is_simulated:boolean,
          seed_version:string|null,anchor_time:string|null},
 period:'today'|'7d'|'30d'|'all',timezone:'America/New_York',
 window_start:string|null,server_time:string,
 summary:{published_listings,active_listings,total_servings_offered,
          available_servings,student_reserved_servings,student_pickups,
          pantry_reserved_servings,pantry_transfers,expired_unclaimed_servings,
          pending_pickup_reviews,pending_pantry_requests,buildings_served,
          joined_sessions,student_pickup_rate_percent},
 outcomes:{available,student_reserved,student_pickups,pantry_reserved,
           pantry_transfers,expired_unclaimed},
 series:[{date:'YYYY-MM-DD',published_listings,servings_offered,
          student_pickups,pantry_transfers,expired_unclaimed}],
 buildings:[{building:Building,published_listings,active_listings,
             available_servings,student_reserved_servings,student_pickups,
             pantry_reserved_servings,pantry_transfers,total_servings_offered,
             expired_unclaimed_servings}],
 activity:[{kind:'listing_published'|'reservation_opened'|'student_pickup'|
                 'pantry_requested'|'pantry_accepted'|'pantry_rejected'|
                 'pantry_handoff'|'pantry_expired',
            occurred_at:string,drop_id:string,food:string,building_name:string,
            servings:number,is_simulated:boolean}],
 notes:string[]
}
recording_available is server-derived fixture/log+both-demo-gates capability, never
client-selected. Dataset current is_simulated=false means non-recording app rows,
not independently verified physical impact; notes explain that distinction.
All counts nonnegative integers. Rate is0 when total0, otherwise studentpickups /
totaloffered*100 (rounded2decimals). Series chronological; buildings sort by
student_pickups descending then building.id; activity latest first stable ties,
max20 rows. Activity timestamps must be actual persisted action times:
Drop.published_at; Claim.created_at for reservation_opened (NOT completion),
HostPickupNotification.created_at for student_pickup (if present),
PantryReferral.updated_at for its current state only. No fabricated event history
for data the app never captured. No Claim IDs in responses. Skip unverified or
missing building snapshots from building rows with an honest note; campus totals
still include them; verified location points never invented. Period/metadata
must label what is shown; series outcomes attributed to publication cohorts.
GET is read-only apart from normal expiry/suggestion/photo cleanup.

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

Replace dark engineering projector chrome with professional light-first responsive
Operations & Impact dashboard using existing consumer tokens/dark support/lucide.
Clear heading, period selector, updated time/error/stale handling, discreet prototype
disclosure. KPI cards for available/reserved/studentpickups/simulatedpantrytransfers,
secondary total/active/review/request counts. Accessible SVG/CSS charts (no paid
chart service): publication-cohort trend, six-bucket serving outcomes, top buildings.
Always provide textual totals/accessible chart labels and empty states; no fabricated
line through no data. Retain verified interactive H3 campus map and all existing
aggregate count hooks/metadata, no student dots/GPS in campus mode. Existing
seeded wave/persona/ring rehearsal may live in a separate explicit Rehearsal panel
or route linked from /admin; preserve all timing controls and functionality.
Include recent activity and attention-needed summaries; keep presenter/reset/seed
controls in an explicit admin area or collapsible controls, not normal KPI content.
Recording load is explicit confirmed action; visible only if server fixture/log
capability established, otherwise a helpful disabled status/admin instruction.
Preserve existing /distribution, maps and It fields/counts; endpoint not replaced.

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
exact2/0/0/1/0/1, map/feed/photoACL/TTL/diet/expiry/concurrency/pushcontract/It/seeded
rehearsal. Distinguish backend/unit/browser/physical evidence honestly. Browser
preview_status/open first per tools; fallback Chromium plus existing /tmp libs if
unsupported/two failures. No missing-browser claim until existing known tools tried.
Fresh GLM exactSHA review, then manager restarts reviewed app3017 with existing
private OpenRouter/Firebase. Dataset current default; no real messages/providers
for test runs. Physical push/pickup/transfer/liveaccuracy/pairedIt remain unverified.
