# Owl Plate HTTPS demo and survey — approval candidate

**Prepared, not deployed.** No public HTTPS origin has been assigned. Vercel web
is Johaan's selected target; API hosting remains to be selected. The supervised
hackathon experience uses the existing app, not a replacement site.

## What is ready

- Existing host/student/projector routes; same-origin `/backend` proxy so phone
  browsers do not call their own localhost or make mixed HTTP/HTTPS requests.
- Standalone `/survey`, separate from demo persona UI and sign-in. Eight reviewed
  questions, optional answers, affirmative consent, bounded optional feedback.
- Collection defaults off. Preview submissions are not stored/counted, n=0.
  Approved responses deduplicate retries, survive demo resets and have no public
  listing/count endpoint. Export/count is operator-only via `scripts/survey_results.py`.
- Vercel settings, server environment template and API Dockerfile under `deploy/`.
  API package and PostgreSQL DDL checked; no Docker executable or live Postgres
  instance was available, so container execution/live database remain pending.
- Separate demo and survey QR generator; local samples independently decoded.
  They are marked LOCAL REVIEW ONLY and encode localhost. Do not distribute them.
- The checked PowerPoint/PDF and 96.6s captioned fallback remain unchanged.

## Phone/browser evidence

Chromium emulation for Pixel 7 and iPhone 13, through a local HTTPS proxy with an
explicitly trusted test certificate, passed upload → fixture review → safety
checks → publish → A/C invites → B exclusion → A claim → explicit +60s demo clock
→ D wave two → reset. Survey preview, optional clearing, consent, no horizontal
overflow and no page errors passed. Browser requests stayed on the HTTPS origin.
These are emulated browser results with fixture vision/simulated notifications;
not public TLS, Safari verification, physical phones or push receipts.

WebKit's downloaded runtime loaded but stalled creating a page on this host.
Safari/Home Screen iPhone checks remain pending. Shared browser tools also lacked
host libraries; isolated local Playwright used, no system packages installed.

## Final sharing plan for approval

Audience: KSU students invited **directly in person** by Johaan or a named
teammate. Use only the standalone survey QR/link with the exact invitation in
`SURVEY.md`; no Discord, group-channel posts, bulk messages or mailing lists.
Form review: `SURVEY_APPROVAL.html` and actual mobile screenshot
`evidence/mobile-https/chromium-iphone-layout-survey.png`.

After an origin is assigned, the separate targets are:

- Demo QR: `<assigned HTTPS web origin>/` → existing host/student choices.
- Survey QR: `<assigned HTTPS web origin>/survey` → standalone form.

These are target paths, **not live URLs**. Generate the final PNGs with
`scripts/build_qr.py --origin <assigned HTTPS web origin> --output submission/qr`;
verify by decoding and opening both on authorized phones. Never replace the
origin with an invented or unreserved domain.

## Decisions needed before publishing/distribution

1. Approve creation/binding of the Vercel web project in the chosen account.
2. Select/provide the API service's account/HTTPS origin and durable PostgreSQL
   endpoint. Intended architecture is AWS; use `deploy/api.Dockerfile`. Approve
   any provisioning cost before creation. No paid service is provisioned now.
3. Approve the final form and direct in-person sharing owner. Publishing the
   preview does not itself approve enabling collection or distributing the QR.
4. After actual HTTPS checks and the collection safeguards below, approve opening `SURVEY_ENABLED=true` and direct
   sharing. Count only real persisted responses; current n=0.

Public review remains fixture vision + simulated notifications, synthetic demo
auth. Live Gemini/FCM requires separate private configuration and explicitly
approved testers. Deployment and hackathon submission are Johaan's approval/action.
Deadline remains Friday November 20, 2026, noon Eastern / 17:00 UTC.

## Public collection gate — independent review condition

The independent GLM review passed the local candidate at
`98e5074e86139500127b2b96c51c4de5af56fed6`. It did not approve public collection.
Distinct anonymous UUIDs can currently create unlimited submissions once the gate
opens. Retry deduplication does not establish unique people or prevent abuse.

Before enabling collection, implement a gateway rate limit or an application row
ceiling, verify it on the selected API service, and name the operator who can
close the gate. Controls must cover the direct API origin as well as the Vercel
proxy; CORS alone is insufficient. Do not store IP addresses in survey rows.
Keep `SURVEY_ENABLED=false` until the control is demonstrated and Johaan approves
collection/distribution. Preview deployment may stay gate-off. The control is
pending, not implemented or verified by this document.

Serve the form only over trusted HTTPS: its anonymous retry ID uses secure-context
`crypto.randomUUID()`. Verify HTTP redirects to HTTPS and the assigned origin on
both physical phones. Local emulation is not physical-device evidence.

Run operator count/export from the repository root with the intended private
`DATABASE_URL`. Its fallback SQLite path is CWD-relative; verify the selected
database before reporting n. Counts mean submissions, not verified unique people.
