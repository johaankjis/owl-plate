# Owl Plate app — deployment approval bundle

Prepared November 18, 2026. **Not deployed; approval pending. Survey collection
stays off (`SURVEY_ENABLED=false`), n=0.** The reviewed application at
`98e5074e86139500127b2b96c51c4de5af56fed6` is the deployment source candidate;
this update changes documentation only. Main/default branch stays untouched.

## Proposed target and cost

Keep the existing Next.js app on **Vercel**. Recommend **Render paid Web Service
(`0.5c-512mb`, legacy Starter) + managed PostgreSQL
(`0.1c-256mb`, legacy Basic-256mb), 1 GB initial storage**, in
the same region/account. This is a proposed hackathon hosting exception to the
original AWS deployment plan, requiring Johaan's approval.

Expected monthly base: API $7 + PostgreSQL compute $6 = $13; allow up to $0.30
for 1 GB storage pending the dashboard's included-storage treatment. Budget
**about $13–14/month**, before tax or excess usage. Vercel Hobby is $0 if the
account/project qualifies; no paid Vercel upgrade is included. Proposed base
budget authorization: **up to $15/month**, with no plan upgrades, extra services,
or storage autoscaling without another approval. This is a planning allowance,
not an enforced total-bill cap; bandwidth/build overages can still apply. Confirm
the creation-screen quote before provisioning. If it differs, return for approval.
No Gemini usage, domain purchase or separate worker is included in this estimate.
After the hackathon, Johaan decides the retention/deletion date to stop costs.

Pricing checked against Render's official pricing and cost guide on Nov 18:
https://render.com/pricing
https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses
Vercel plan: https://vercel.com/docs/plans/hobby

## Account, source and private setup

1. Johaan chooses/authorizes the Vercel account/project and Render account with
   billing. No account binding or credentials currently exist here. Use private
   secret cards or the provider dashboards, never chat, for credentials.
2. Approve how this exact local SHA reaches the builder: an approved private Git
   remote/branch push for Render's repository build, or an approved private image
   registry. Existing local commits have not been pushed. Disable automatic
   deployment; deploy the recorded SHA manually. Do not merge into main.
3. Create paid PostgreSQL and API in the same Render region (proposed Virginia,
   subject to availability). Use the private/internal DB URL with the SQLAlchemy
   `postgresql+psycopg://` scheme and `sslmode=require`; restrict external database
   access. Start with 1 GB; no storage autoscaling. Create no object storage.
4. API: repository-root build context, `deploy/api.Dockerfile`, `PORT=8017`, one
   instance, one Uvicorn worker, health `/health`. Set private `DATABASE_URL`,
   `AUTH_MODE=demo`, `DEMO_MODE=true`, `VISION_PROVIDER=fixture`,
   `NOTIFICATION_PROVIDER=log`, `SURVEY_ENABLED=false`. Set CORS to the assigned
   web origin. No live provider secrets are required for this initial preview.
5. Vercel: root `apps/web`, `npm ci`, `npm run build`;
   `NEXT_PUBLIC_API_URL=/backend`, `NEXT_PUBLIC_UI_FIXTURE_MODE=false`,
   `OWL_API_ORIGIN=<actual API HTTPS origin>` before building. Use assigned HTTPS
   provider domains first; no purchased domain. Confirm both testers can open the
   deployment through its protection settings before generating the QR.

## Invitation scheduler

The existing FastAPI lifespan starts an asyncio task that calls `backend.tick`
every **10 seconds**. Keep **one paid always-running API instance and one worker**;
no additional scheduler service, cron job or browser activity is required. Render
Free sleeps after 15 minutes without inbound traffic and is unsuitable for this
scheduler. Restarts pause ticks until startup; PostgreSQL retains deadlines/state.
After deployment, prove a natural 60-second invite expiry and second-wave widening
with no demo clock advance and no API requests during the wait; then inspect the
persisted wave/invite timestamps with a read-only database query **before**
opening a route that could trigger lazy expiry. Repeat after an API restart to check persistence
and resumed ticking. Health alone does not prove scheduler progress. Avoid
redeploys during rehearsal; overlapping rollout processes may briefly coexist,
with existing transactional deduplication protecting invites/holds.

Render references:
https://render.com/docs/free
https://render.com/docs/web-services
https://render.com/docs/postgresql-creating-connecting

## Phone verification after approval and publication

1. Open the **actual assigned HTTPS origin** on authorized Android Chrome and
   iPhone Safari; verify trusted TLS, no localhost API requests, no mixed content,
   usable portrait forms/buttons and no horizontal overflow. Record OS/browser
   versions and run ID. Decode/open the generated demo QR on both phones.
2. Reset once, select synthetic identities, then run the existing host upload →
   fixture estimate → edit servings → complete safety review → publish flow.
   Confirm A/C invites, B dairy exclusion, A's single idempotent hold, counts and
   capacity response. Wait for C to expire naturally, then D ring 4 without
   contacting earlier invitees again. Check decline/reset and DB restart recovery.
   This run proves app behavior; log notifications remain **simulated**.
3. iPhone: add the app to Home Screen and launch from its icon. Web Push requires
   iOS 16.4+ and Home Screen installation. Android: use supported Chrome and
   enable notifications through the app's user gesture. Inspect service-worker
   registration/permission on both. Installation/permission is not receipt proof.
4. For a separate live-push run only after authorized testers/private Firebase
   setup: set encrypted token storage, exact synthetic A/C recipient allowlist,
   Firebase messaging config/VAPID and service-account access privately. Reset
   **before** registering tokens; background/lock both devices, publish once and
   record each actual receipt time, tap-through and generic lock-screen text.
   Record failure honestly. Current receipt evidence: **none**.
5. Keep `/backend/survey/status` at `accepting:false`; count actual submissions
   operator-side (currently n=0). Run source-labeled Gemini/photo evaluation only
   when separately supplied credentials and counted/ingredient-labeled photos
   exist. Live vision accuracy remains unverified (real-photo n=0).

Apple Web Push reference:
https://webkit.org/blog/13966/webkit-features-in-safari-16-4/

## Current evidence, limits and rollback

Local HTTPS is running at **https://localhost:3443/** on this machine only, with
a local test certificate; host `/host`, student `/student`, and proxied health
respond 200; health explicitly reports simulated notifications. Survey status
reports `accepting:false`, actual persisted local n=0. Ports: API 8017, web 3017,
TLS 3443. Supervisor PID file `/tmp/owl-https-review/preview.pid`; stop only that
process with SIGTERM when review ends. No public tunnel or trusted public phone
URL is implied. Never share the localhost QR as a public demo link.

Prior Chromium Pixel 7/iPhone layout checks passed the host/student flow, labeled
fixture/log, without mixed content/overflow. Physical Safari/Android, public TLS,
container startup and live PostgreSQL remain pending. Automated checks at the
candidate: 73 API, 116 eval-calculation and 5 client tests; lint/types/build passed.
OpenCode GLM 5.3 completed the exact-SHA review: **PASS, local approval candidate
only**, with 73 API tests, 116 eval tests, Ruff and all 49 package hashes passing.
No blocking app-preview findings. Conditional medium: anonymous survey writes
need a tested gateway rate limit covering direct API access or a row ceiling
before any future public collection; keep collection off. Low findings: survey
503 error envelope inconsistency and `crypto.randomUUID` requiring HTTPS/localhost.
Operator count tool must run from repo root against the intended DATABASE_URL.
These do not change the reviewed app baseline; public TLS, container, live DB,
Safari and physical devices remain unverified. Require HTTP-to-HTTPS redirect.
No second reviewer or duplicate task started.

This is a supervised synthetic demo using visible demo credentials/shared reset,
not production access control. Dependency advisories remain a readiness item.
FCM sends currently hold the DB transaction; review latency during the authorized
push run. Keep collection off, fixture/log labels on, and limit sharing to the
approved rehearsal audience. Retain the checked deck and **96.6-second captioned
fallback**. If deployment verification fails, use that fallback; stop/deactivate
paid compute only with Johaan's approved retention/cleanup decision.

Approval requested together: Vercel project/account binding, Render API+Postgres
instead of AWS for the hackathon, the up-to-$15 monthly base allowance, approved
source transfer/push or image publication, and limited-audience preview publication.
Survey collection/distribution, live notification sends and submission remain
separate and unapproved. Deadline: Friday Nov 20, 2026, noon Eastern / 17:00 UTC.
