# ROADMAP.md

Where Owl Plate stands at the hackathon submission (November 20, 2026), and what comes next. The original Wednesday-to-Friday build checklist is in Git history.

## Delivered (local, demo authentication)

- Photo → Gemini estimate (OpenRouter or direct, plus a labeled fixture) → host review with safety checks → publish
- Campus feed and map over 43 verified Marietta buildings (H3 resolution 11, deck.gl), dietary hard filters, no student GPS
- 10-minute holds in a single serialized inventory transaction
- Listing-specific FCM web push with encrypted tokens, plus host review alerts
- Google Maps walking links (destination only)
- Photo-assisted pickup with host review of uncertain results
- Simulated CARE Pantry referral and handoff
- Food rescue analytics (`/dispatch`, `/impact`) with an explicitly loaded sample dataset
- Seeded A–E wave rehearsal of the pure dispatch engine (`/admin`)
- It pickup display and Campus Rescue Command Center driven by a paired Claude Code conversation

## Evidence still needed

- Measured vision and pickup-assist accuracy on a consented, hand-labeled photo set
- Observed physical push receipt on Android and a Home Screen iPhone
- A recorded paired Command Center session
- Student survey results (collection is currently off, n=0)

## Next

1. Work with KSU CARE Services, Dining and event offices on an approved leftover-handling policy. Only then can the pantry handoff become real.
2. Add KSU sign-in through Microsoft Entra ID, with an admin-only CARE priority tier.
3. Deploy: managed PostgreSQL, API hosting, the Vercel web and photo storage with 24-hour lifecycle rules. Before that, add `data/campus/` to `deploy/api.Dockerfile`.
4. Extend the registry to the Kennesaw campus, and later to partner universities.
5. Add meal-swipe sharing as a second supply source.

Not planned for now: an Amazon Bedrock fallback provider and a Twilio SMS fallback.
