# Milestone 4.5 frozen consumer interface contract

Application baseline36e8b0ea97dd63412c0dfc047d5ab1c713e2cb64. Design proposal
CONSUMER_UX_DESIGN.md is accepted with the specific overrides below. Workers start
only from the manager-supplied committed entry containing these shared foundations.
Keep canonical dirty files/private configs, reviewed t3-fb57e289 runtime3017/8017,
and DeckScout8000 untouched. Candidate3027/8027 only. No push/deploy/main/slides.

## Ownership and design

Codex owns this contract, globals.css,tailwind.config.ts,layout.tsx,lib/theme.tsx,
components/ui/**,AllergenBadge.tsx,DemoHeader.tsx,PushOptIn.tsx,lib/types/api.ts,
lib/api-client.ts,tests/consumer-shared.test.mjs. These shared components are now
implemented; consume their exported props directly. No worker edits to them.
AppShell variants public/student/host/pantry/admin, optionaltitle/headerAction/
bottomNav/maxWidth and one PrototypeNotice. ThemeProvider is mounted globally;
useTheme supports light/dark/system and persists owl_plate_theme. Tokens include
bg-canvas,bg-surface,bg-surface-subtle,text-ink,text-ink-muted,border-line,
text-owl-goldText,bg-owl-goldTint,success/warning/danger with -tint colors.
Primary .consumer-button, .consumer-button-secondary, .consumer-input,
.consumer-card utilities. Lucide only; no emojis or borrowed proprietary assets.
DropPhoto fetches only an authenticated host-listing JPEG; exposes data-photo-state.
FoodCard accepts drop/authToken/href/onSelect/footer/badge/disabledReason.
AllergenCard wraps backward-compatible AllergenListDisplay with mandatory notice.
BottomNav activeTab/onSelectTab/activeHoldCount; testids nav-tab-home/map/
reservations/profile. Skeleton/EmptyState/StatusBadge available.

Antigravity owns app/page.tsx,app/join/**,app/student/**,
components/StudentCampusMap.tsx,components/CampusMapCanvas.tsx,
lib/fixtures/demo-fixtures.ts,tests/student-helpers.test.mjs,tests/campus-map.test.mjs,
new tests/consumer-student.test.mjs. Preserve existing fixture contracts; add own
reservation-history coverage and expiry/ownership. New bottom-tab view routes can
use /student?tab=home|map|reservations|profile. /student?drop= keeps notifications
compatible and must open details safely. Dedicated /student/drops/[id] page;
seeded?persona behavior remains reachable through admin and functional. Raw
verification provenance is not normal-screen copy: show 'Photo assessment' and
'Sample assessment' for simulated results, mandatory photo-assisted non-proof
notice retained. No image assets needed: actual listings use DropPhoto, missing
ones use polished placeholder. Landing photography may use a supplied real listing
only for joined/authorized users; do not fake uploaded food or public listing auth.

Claude owns services/api/**,app/host/**,app/pantry/**,
components/HostPantryCard.tsx,components/BuildingSelector.tsx,
lib/pantry-api.ts,lib/pantry-helpers.ts,tests/host-helpers.test.mjs,
tests/pantry.test.mjs,new tests/consumer-host.test.mjs. Host3step Photo/Review/
Publish plus recoverable My Listings dashboard. Pantry separate, clean but all
mandatory policy/simulation/acknowledgment text remains at actions. No coordinate
or building-ID chrome, use verified display names. Host-photo preview upload
ObjectURLs revoked on change/unmount; no extra image-recognition safety claims.

OpenCode Neon integrator owns app/admin/**,app/dispatch/**,components/DispatchMap.tsx,
scripts/**,Makefile,prototypes/itcan/**,generatedopenapi.json/api.generated.ts,
docs/CONSUMER_UX_HANDOFF.md and final wiring after completed worker commits.
May simplify temporary type aliases after regeneration; do not mutate shared UX
without manager coordination. Update old harness selectors for intentional new
navigation/copy, preserve the actual safeguards/assertions. Only technical admin
screens may show API/provider/model/scenario/presenter/credential/debug details.
One discreet prototype disclosure per public page; point-of-action simulated
assessment and pantry notices remain truthful. Existing browser code should not
silently erase required notices to pass a jargon scan.

## Additive backend API (Claude, agreed before parallel edits)

- DropResponse: has_photo:boolean defaultfalse; photo_url:string|null defaultnull.
  Relative API path /drops/{id}/photo only, no dataURL/tokens/embeddedbytes.
- GET /drops/{id}/photo: raw sanitized JPEG; Bearer auth ONLY, no query tokens;
  Cache-Control: private, no-store; X-Content-Type-Options:nosniff;
  Content-Disposition:inline; filename="drop-photo.jpg". 401 invalid/absent auth;
  404 missing/out-of-scope/expired including wrong host (avoid existence leak).
- Host own draft/live/claimed_out until imageTTL. Students: published unexpired
  campus-feed listings for joined visitors; seeded via own invite/claim only.
  Never student drafts/foreign claims. Coordinator: existing referral and both
  demo gates, unexpired drop. Projector: published unexpired listings only.
- Only host listing photo is retained, sanitized real bytes from the same upload
  passed to vision; strip metadata, orient correctly, <=1024px RGB JPEG. Small
  DropPhoto SQLModel table in local DB behind a small storage boundary, no new
  dependencies/cloud. Not a fake production S3 implementation. Private pickup
  verification bytes MUST remain in-memory only with existing regressions.
- Deadline=min(created_at+24h, drop.expires_at) for published photos. Draft image
  deadline=min(created_at+24h,created_at+2h). Publish may extend draft TTL to the
  published rule but never creation+24h. Purge on expiry/tick/read/reset. Drop
  history survives photo deletion. Photo deletion must occur before response
  authorization; expiredfood never reappears. No photo in logs/public JSON.
- GET /students/me/reservations: student only, own claims newest created_at first,
  id tie break; {reservations:[{claim:ClaimResponse,drop:DropResponse,
  pickup_verification:PickupVerification|null}],server_time,is_demo}. All statuses
  held/picked_up/released/expired, expiry sweep first. No other students/priority.
- GET /hosts/me/drops: host only, own drops allstatuses newestcreated_at/id first;
  {drops:DropResponse[],server_time,is_demo}. No presenter dependency to restore
  dashboard. Existing data models/counts/endpoints otherwise unchanged.

Manager client getDropPhotoBlob(dropId,token,signal?) returns Blob with timeout,
no-store and no querycredentials. getMyReservations(token),getHostDrops(token)
return ApiResult. Temporary interfaces in types/api.ts; integrator regenerates.
Explicit offline fixture mode uses getMyReservations/getHostDrops implemented
from existing isolated state; missing uploaded image has an honest placeholder.
Student worker improves fixture parity as needed without silently mocking live API.

## Acceptance and evidence

Preserve inventory total=available+held+picked_up+pantry_held+pantry_transferred,
all dietary/atomic capacity/auth/expiry/notification/pickup-review/pantry safeguards.
Run all existing272+API/60+web/116eval/4campus/10It/1591dataset/Ruff/lint/types/build,
schema zero drift. Actual browser acceptance on iPhone390x844,Android412x915,
desktop1440x1000: join,browse/search/categories/detail,reserve,countdown,directions,
photoassessment/explicitpickup/history/profile; hostupload/AIreview/publish/
listingdashboard/reviews/pantry; coordinatoraccept/hostsimulatedhandoff. Real
synthetic uploaded image rendered (not stock/placeholder), bytes/EXIF/ACL/TTL/
reset verified; private pickup images never retrievable. NoGPS,horizontaloverflow,
brokenroutes,publicdeveloperjargon; darkmode and keyboardfocus. Screenshot every
redesigned route/state at all3sizes with applicationSHA binding. Regression maps/
feed/uncertain+inconsistent reviews/seedednaturalexpiry/It and exact pantrycounts.
No physical push/pickup/pantrytransfer/liveaccuracy/pairedIt claim from fixtures.
Fresh GLM exactintegratedcommit review then managerrestarter3017 withprivate
existingOpenRouter/Firebase. Preservecanonical16dirtyfilehashes andmain.
