# Deployment candidate for approval

Web target selected by Johaan: **Vercel**. Root directory `apps/web`; copy the
settings in `deploy/vercel.json` into that project's Vercel configuration (the
file is a review artifact, not a claim the project exists). API hosting remains
to be selected. Intended architecture remains FastAPI/Python 3.11 and PostgreSQL
on AWS; `deploy/api.Dockerfile` packages this service for the selected host.
No project, domain, paid service, deployment or tunnel has been created.

## Concrete configuration

- Vercel web: Next.js 15.5.29, `npm ci`, `npm run build`, project root `apps/web`.
- Web build env: `NEXT_PUBLIC_API_URL=/backend`,
  `NEXT_PUBLIC_UI_FIXTURE_MODE=false`, `OWL_API_ORIGIN=<assigned API HTTPS origin>`.
  This uses a same-origin Next rewrite; phones never call their own localhost.
- API: Dockerfile at `deploy/api.Dockerfile`, context repository root,
  port 8017, one worker/scheduler, health `/health`, private PostgreSQL connection
  via `DATABASE_URL=postgresql+psycopg://…`. No ephemeral filesystem database.
- Demo providers: explicit demo auth, fixture vision, simulated log notifications.
  No real student data or actual push sends. Photos processed in memory.
- Survey: standalone `/survey`; no login, no public response/count/export endpoint.
  `SURVEY_ENABLED=false` for approval preview. Open collection only after approval;
  research rows persist through demo resets in the durable database.
- Keep provider/database secrets server-side, never in NEXT_PUBLIC variables.
- QR destinations after assignment: `https://<Vercel origin>/` (choose host/student),
  `https://<Vercel origin>/survey` (independent form). No invented/unreserved domain
  is encoded as a public URL.

## Approval requested, after reviewing the form/mobile evidence

1. Create/bind the Vercel project and identify its owner/account.
2. Select the API hosting account/service and existing PostgreSQL endpoint;
   approve any costs before provisioning. AWS is the original architecture target.
3. Publish the demo and survey preview, then verify the actual assigned HTTPS
   origins on authorized phones. Opening survey collection/distributing its QR is
   a separate approval, even if the preview is deployed.
4. After HTTPS assignment, run the QR generator below and verify both QR targets.

The demo credentials are synthetic and visible in the app. This is a supervised
hackathon demo, not production authentication. Keep FCM/log settings unchanged
for public review; live authorized-device FCM evidence belongs in its coordinated
session. Existing dependency advisories and production-auth/rate-limit limits
remain in HANDOFF.md; this package does not claim public production readiness.

## Local verification, no deployment

Use `scripts/serve_https_review.py` with a locally generated certificate (example
in its help) to proxy the existing web app on loopback HTTPS. The test certificate
is not publicly trusted; local browser tests explicitly trust it. This proves
HTTPS routing/mobile UI behavior, not a public phone-accessible URL or push receipt.
No SSL keys/certificates are committed.

## QR generation after approval and origin assignment

```bash
.venv/bin/python scripts/build_qr.py --origin https://ASSIGNED-ORIGIN \
  --output submission/qr
```

Only use an origin assigned to this Owl Plate deployment. The generated PNGs
include human-readable URLs and labels, and `links.json` records exact targets.
The local-review QR samples are marked **LOCAL REVIEW ONLY**, point to localhost,
and must not be distributed or presented as phone-ready public links.

## Rollback and data

Retain `ec518ee8dda225e831bf27ebe3e88e4a1d6f97b2` as the prior reviewed/rehearsed
baseline. The matching/claim planner and existing route behavior are unchanged;
new survey modules and origin configuration are additive. Disable collection
before rollback. Back up/export actual survey responses privately; do not reset
or delete the database to roll back web assets. The 96.6s captioned MP4 is unchanged.
