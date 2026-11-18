# ARCHITECTURE.md

## Milestone v1 implementation contract

`docs/API_CONTRACT.md` is the frozen implementation reference for the current milestone and resolves the scheduling ambiguities below. In particular: invites do not reserve servings; declining an invite changes its opportunity, not inventory. A tick widens only after the current wave has no outstanding sent invitations. At max ring, remaining food is not marked consumed. Holds and pickups drive inventory counts transactionally.

Initial local composition is deliberately demo-only: synthetic auth, SQLModel SQLite, in-memory photo processing (no retained uploads), cached fixture or explicitly configured Gemini, and simulated notifications by default. Optional FCM composition encrypts device registrations with Fernet and permits sends only to an explicit synthetic UUID allowlist. It imports provider metadata before database creation and clears registrations atomically on demo reset. Both demo auth gates remain mandatory. Real Entra/email-code auth, production push composition, Vercel/AWS/Postgres deployment and S3 lifecycle are pending access/integration. Credentials and approved recipient configuration are absent; no real sends or physical-device receipts were verified. No live readiness claim is implied by these target architecture sections.

H3 fixture origin is an arbitrary coordinate labeled unverified, not a campus building. Only synthetic persona decisions may appear on the projector; production host responses contain counts. The full attached project brief was unavailable; accepted user instructions and repository docs supplied this milestone.

How Owl Plate fits together. Update this file when the shape of the system changes.

## System overview

```
 apps/web (Next.js PWA on Vercel, HTTPS)
   /host       camera -> upload -> review estimate -> publish
   /student    sign in -> preferences -> enable alerts -> claim
   /dispatch   big screen: map, waves, invite reasons (demo)
        │  REST (JSON)
        v
 services/api (FastAPI on AWS)
   routes/drops      POST create drop (photo) -> vision -> estimate
   routes/drops      POST publish -> dispatch.plan_wave() -> push
   routes/claims     POST claim / release
   routes/students   preferences, presence, push token
   routes/swipes     meal swipe offers and requests (stretch)
   scheduler         every 10s: expire invites, plan next wave
        │
        ├── vision/  ── providers/gemini.py (primary), providers/bedrock.py (fallback)
        ├── dispatch/ (pure engine, see DISPATCH.md)
        ├── providers/fcm.py (push), providers/twilio_sms.py (fallback)
        ├── providers/entra.py (KSU sign in), email code fallback
        ├── db/ (Postgres; SQLite locally)
        └── S3 (photos, deleted after 24 h)
```

## Components

### Vision (`services/api/vision/`)
* Input: one photo (JPEG, resized to 1024 px long edge) plus optional host note ("one tray is vegetarian").
* Provider call with a strict JSON schema (below). Primary: Gemini with structured output. Fallback: Amazon Bedrock multimodal model with the same schema. Model names come from `.env`.
* Post processing: clamp servings to a sane range, attach confidence, map allergen strings to our fixed allergen enum, drop unknown values.
* The host always sees the estimate and can adjust servings with plus and minus before publishing. Host edits are stored so we can measure the AI against them.

```json
{
  "items": [{"name": "cheese pizza", "portion_unit": "slice", "count_estimate": 14}],
  "servings_estimate": 8,
  "servings_low": 6,
  "servings_high": 10,
  "allergens_likely": ["dairy", "gluten"],
  "diet_tags": ["vegetarian"],
  "confidence": 0.74,
  "notes": "one wrap tray partially eaten"
}
```

Allergen enum: dairy, egg, gluten, peanut, tree_nut, soy, fish, shellfish, sesame.
Diet enum: vegetarian, vegan, halal, kosher, pork_free. Religious diet compliance cannot be judged from a photo, so those tags only come from the host, never from vision.

### Dispatch (`services/api/dispatch/`)
Pure engine. Spec in `DISPATCH.md`.

### Push
* Firebase Cloud Messaging web push. The web app registers `firebase-messaging-sw.js`, asks permission after a user tap, sends the FCM token to `POST /students/me/push-token`.
* iPhone requires Add to Home Screen (iOS 16.4 or later) before web push works. The onboarding screen detects iOS Safari and shows the steps.
* Twilio SMS fallback for students who opt in to text (trial accounts can only text verified numbers, which is fine for the demo).
* Notification payload contains the drop ID only; the app fetches details after opening, so lock screens show minimal info.

### Sign in
* Microsoft Entra ID through MSAL. Accept only the KSU tenant ID (check the `tid` claim). Scope: basic profile and email only.
* If KSU blocks user consent ("Need admin approval"), switch to fallback: one time code sent to a KSU email address. Config flag `AUTH_MODE=entra|email_code|demo`.
* Production story: KSU IT grants admin consent once for the whole university.

### Geography
* Buildings and rooms in `data/seed/buildings.yaml` with lat and lng.
* Student presence is coarse: a building or H3 cell, never raw GPS history. Sources: the student taps "I'm on campus near X" (lasts 2 hours) or declares usual buildings and time windows.
* H3 resolution 11. Rings via `grid_disk(origin, k)`. Map drawn with deck.gl `H3HexagonLayer` plus a scatter layer for students.

## Data model (SQLModel)

```
Student(id, display_name, ksu_email_hash, auth_mode, allergens[], diets[],
        priority_tier: none|care, is_simulated, sms_opt_in, phone_enc?,
        created_at)
Presence(id, student_id, building_code, h3_cell, source: checkin|schedule,
         valid_from, valid_until)
PushToken(id, student_id, kind: fcm|sms, token_enc, created_at, revoked_at?)
Drop(id, host_id, building_code, room, h3_cell, photo_key, vision_json,
     servings_estimate, servings_final, allergens_final[], diet_tags_final[],
     status: draft|live|claimed_out|expired, expires_at, created_at)
Wave(id, drop_id, number, ring_k, planned_at, invite_count)
Invite(id, drop_id, wave_id, student_id, reason_codes[], sent_at,
       expires_at, status: sent|claimed|declined|expired)
Claim(id, invite_id, student_id, held_until, status: held|picked_up|released)
SwipeOffer(id, donor_id, count, valid_until, status)          (stretch)
SwipeRequest(id, student_id, needed_by, status)               (stretch)
```

`priority_tier` is only writable by an admin role (CARE staff) and is never returned by any non admin endpoint.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | /drops | Upload photo, run vision, return draft estimate |
| PATCH | /drops/{id} | Host adjusts servings, allergens, room, expiry |
| POST | /drops/{id}/publish | Go live, plan and send wave 1 |
| GET | /drops/{id} | Public drop details for invited students |
| GET | /drops/{id}/dispatch | Admin and demo view: waves, invites, reason codes |
| POST | /invites/{id}/claim | Hold a serving |
| POST | /invites/{id}/decline | Free the spot immediately |
| POST | /students/me/presence | Check in near a building |
| PUT | /students/me/preferences | Allergens, diets, alert channels |
| POST | /students/me/push-token | Register FCM token |
| POST | /demo/reset | Reset to scripted demo state (demo mode only) |

The dispatch screen polls `/drops/{id}/dispatch` every 2 seconds. No websockets.

## Sponsor tech map

| Company | Tech | Real job |
|---|---|---|
| Google | Gemini | Sees the food: items, servings, allergens |
| Google | Firebase Cloud Messaging | Delivers alerts to phones |
| Uber | H3 | Nearby rings for wave dispatch |
| Uber | deck.gl | Dispatch map |
| Amazon | AWS (API hosting, S3) | Runs the backend, stores photos briefly |
| Amazon | Bedrock | Fallback vision provider |
| Microsoft | Entra ID | Only verified KSU students can join |

## Environment (.env.example)

```
DATABASE_URL=
GEMINI_API_KEY=
GEMINI_MODEL=
AWS_REGION=
AWS_S3_BUCKET=
BEDROCK_MODEL_ID=
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=
NEXT_PUBLIC_FIREBASE_CONFIG=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
AUTH_MODE=demo
ENTRA_CLIENT_ID=
ENTRA_ALLOWED_TENANT_ID=
DEMO_MODE=true
INVITE_TIMEOUT_SECONDS=90
```
