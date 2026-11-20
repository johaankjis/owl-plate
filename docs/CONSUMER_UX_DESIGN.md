# Owl Plate Milestone 4.5 — Consumer UX Redesign & Architecture Proposal

Status: **Design checkpoint awaiting manager reconciliation & shared contract entry SHA.**
Author: Product Architect & Final Integrator (OpenCode / Gemini 4 Neon)
Baseline HEAD: `36e8b0ea97dd63412c0dfc047d5ab1c713e2cb64`

---

## 1. Purpose & Product Direction

Milestone 4.5 upgrades Owl Plate from a dark developer/rehearsal prototype into a **polished, light-first KSU consumer food-rescue experience** (with full dark-mode support) before Milestone 5.

### Design North Star

- **Consumer-grade food discovery (inspired by Uber Eats / DoorDash craft — zero borrowed assets, copy, or branding):** Clean photography-led rounded food cards, instant search and category pills, generous whitespace, calm hierarchy, thumb-friendly mobile bottom tabs, and clear sticky CTAs.
- **Unmistakably KSU & Owl Plate:** KSU Gold (`#FDBB30`) paired with crisp warm light surfaces and rich obsidian dark mode, rooted in verified Marietta Campus buildings and KSU's dignity-first mission (`docs/SOUL.md`).
- **Dignity, honesty, and zero jargon:** Public screens speak like a helpful campus app — short, warm, practical, never pitying, never cluttered with internal telemetry (`OpenRouter`, `Gemini`, `fixture`, `API`, `synthetic`, `dispatch`, `H3`, `ring`, `debug`). Diagnostics, scenario toggles, and seeded A–E rehearsal controls move to a dedicated `/admin` surface alongside `/dispatch`.
- **Zero regression on hard safeguards:** Every existing guarantee — CARE priority invisibility, hard dietary/allergen filtering, `"may contain, confirm with host"`, location-free campus-feed joins (no GPS), destination-only walking links, count-only host privacy, photo-assisted pickup non-proof notices, de-identified host review queue, five-bucket inventory conservation (`total = available + held + picked_up + pantry_held + pantry_transferred`), pantry policy prohibition & simulation disclosures at action, FCM push + iOS Home Screen guide, OpenRouter/Gemini/fixture vision composition, `/survey`, and `prototypes/itcan` — stays strictly intact.

---

## 2. Design System, Tokens & Theme Architecture

### 2.1 Theme Strategy (Light-First + Dark Support)

- Default theme: **Light** (`class` strategy via Tailwind `darkMode: "class"` + CSS custom properties in `apps/web/app/globals.css`).
- User control: `Light` / `Dark` / `System` selector stored in `localStorage` under `owl_plate_theme` (default `"light"` so first-load screenshots and campus demos always open in the crisp light KSU consumer palette, while immediately supporting dark mode without flash via an inline pre-hydration script in `apps/web/app/layout.tsx`).
- Iconography: **`lucide-react`** exclusively (`strokeWidth={1.75}` default, `2` for active nav icons). Do not use emojis as UI chrome or status markers.

### 2.2 Color & Surface Tokens (WCAG AA Compliant)

Gold (`#FDBB30`) is high-luminance and must **never** be used as small body text on white backgrounds. Use `#121214` ink on `#FDBB30` fills, and `#8A5E00` (`--owl-gold-text`) for gold accent text on light surfaces.

| Semantic Token | CSS Variable | Light Value | Dark Value | Intended Use |
| --- | --- | --- | --- | --- |
| Page Canvas | `--owl-bg` | `#F8F8FA` | `#0F1013` | Root page background |
| Primary Surface | `--owl-surface` | `#FFFFFF` | `#18191E` | Food cards, bottom sheets, top/bottom nav |
| Subtle Surface | `--owl-surface-subtle` | `#F1F2F6` | `#22242B` | Search inputs, chip backgrounds, skeleton tracks |
| Elevated Border | `--owl-border` | `#E4E5EC` | `#2C2F38` | Card borders, hairlines, dividers |
| Primary Ink | `--owl-ink` | `#121214` | `#F4F4F6` | Headings, card titles, primary values |
| Secondary Ink | `--owl-ink-muted` | `#525560` | `#A1A5B2` | Building metadata, helper copy, timestamps |
| KSU Gold Primary | `--owl-gold` | `#FDBB30` | `#FDBB30` | Primary CTA buttons, brand mark, active pins |
| KSU Gold Hover | `--owl-gold-hover` | `#E5A41B` | `#E5A41B` | Button hover/pressed states |
| Ink on Gold | `--owl-gold-ink` | `#121214` | `#121214` | Button labels & icons placed on `--owl-gold` |
| Gold Accent Text | `--owl-gold-text` | `#8A5E00` | `#FDBB30` | Inline links, active nav text, highlights |
| Gold Soft Tint | `--owl-gold-tint` | `#FEF6E1` | `rgba(253,187,48,0.14)` | Selected chips, active step badges |
| Success | `--owl-success` | `#15803D` | `#4ADE80` | Available servings, active hold, confirmed |
| Success Tint | `--owl-success-tint` | `#DCFCE7` | `rgba(34,197,94,0.14)` | Success pills & banners |
| Warning / Allergen | `--owl-warning` | `#B45309` | `#FBBF24` | Allergen callout, countdown < 10 min |
| Warning Tint | `--owl-warning-tint` | `#FEF3C7` | `rgba(245,158,11,0.14)` | Allergen card & caution chips |
| Danger | `--owl-danger` | `#BE123C` | `#FB7185` | Errors, destructive release/leave, conflict |
| Danger Tint | `--owl-danger-tint` | `#FFE4E6` | `rgba(244,63,94,0.14)` | Error banners & allergen conflict tags |

### 2.3 Geometry, Typography, Motion & Accessibility

- **Typography:** System geometric sans (`Inter` / system UI stack already configured), crisp numeric alignment (`tabular-nums`) for all serving counts and countdown timers.
  - Display/Page Title: `text-2xl sm:text-3xl font-bold tracking-tight`
  - Section Title: `text-lg font-semibold tracking-tight`
  - Card Title: `text-base font-semibold leading-snug`
  - Metadata / Pills: `text-xs font-medium` (never smaller than `11px` for secondary chips)
- **Radii & Elevation:**
  - Food photography cards: `rounded-2xl` (`16px`) with `overflow-hidden`, `border border-[var(--owl-border)]`, soft light shadow (`0 1px 3px rgba(18,18,20,0.06), 0 8px 24px rgba(18,18,20,0.04)`).
  - Primary CTA buttons: `rounded-xl` (`12px`), `min-h-[48px]`, full-width on mobile.
  - Filter chips & status pills: `rounded-full`, `min-h-[36px]` (or `44px` tap area for nav/primary actions).
- **Touch & Responsive Targets:**
  - Every interactive control has a minimum `44×44px` touch target.
  - Zero horizontal overflow at `390×844` (iPhone), `412×915` (Android), and `1440×1000` (desktop).
  - Mobile sticky bottom navigation respects `pb-[env(safe-area-inset-bottom)]` and main content adds bottom clearance (`pb-24 md:pb-10`) so no CTA is hidden behind the tab bar.
- **Skeletons & Empty States:**
  - Every data-backed list/detail renders structured `animate-pulse` skeletons matching the final card layout (`FoodCardSkeleton`, `DetailSkeleton`, `ListRowSkeleton`) — never a raw `"Loading..."` line.
  - Every empty state uses `EmptyState` (Lucide icon in soft circular tint, concise 1-line title, 1–2 sentence helpful next action, and optional CTA button).

---

## 3. Copy Hygiene, Public vs. `/admin` Separation & Preserved Safeguards

### 3.1 Jargon Ban-List on Public Consumer Screens

The following developer/demo terms **MUST NOT appear** in visible UI copy on `/`, `/join`, `/student`, `/student/drops/[id]`, `/host`, or `/pantry` (except where explicitly required by policy/simulation disclosure on pantry actions or the single discreet prototype notice):

- Provider / model / mode jargon: `OpenRouter`, `Gemini`, `fixture`, `vision_source`, `cached estimate`, `FCM`, `VAPID`, `API`, `live_api`, `offline_fixture`, `endpoint`, `bearer`, `token`
- Internal dispatch / geo jargon: `dispatch`, `H3`, `resolution 11`, `ring`, `ring_k`, `wave`, `seeded_waves`, `campus_feed`, `DEMO-ORIGIN`, `placeholder (0, 0)`, `synthetic` (on student/host copy; pantry simulation uses plain-English `"Demo simulation"` at action)
- Debug / telemetry banners: remove `DemoHeader`'s dual gold/purple telemetry chips (`Simulated notifications • Cached fixture`, `student-vision-mode-label`) from all consumer screens.

### 3.2 One Discreet Prototype Disclosure

- Every public layout renders **one** calm, unobtrusive `PrototypeNotice` in the page footer (and inside Profile on `/student`):
  - Default copy: `"KSU Marietta Campus prototype — alerts and pantry handoffs may run in demo mode."`
  - Includes one discreet subtle link to `/admin` labeled `"Demo controls"` (muted text, never competing with primary actions).
- Standalone `NEXT_PUBLIC_UI_FIXTURE_MODE === "true"` safety banner remains in `RootLayout` only when explicitly built in offline fixture mode.

### 3.3 Dedicated `/admin` & `/dispatch` Diagnostics Surface

- **`/admin` (new, Final Integrator owned):** Central hub for judges, presenters, and developers:
  - Live runtime diagnostics: vision provider mode (`fixture` / `gemini` / `openrouter`), notification transport (`simulated` / `fcm`), active scenario (`visitors` vs. `seeded`), server clock offset, and API connection health.
  - Presenter controls (`PresenterControls`): switch scenario (`Campus Feed` / `Seeded Waves`), advance demo clock, reset demo state.
  - Seeded rehearsal launcher: direct links to `/student?persona=A` through `/student?persona=E`, plus quick links to `/dispatch` (big-screen projector), `/host`, `/pantry`, `/join`, and `/survey`.
- **`/dispatch` (existing projector view, Final Integrator wired):** Continues to serve the big-screen presentation map, campus inventory aggregates, and seeded A–E wave table, cleanly styled to align with the refreshed Owl Plate tokens while preserving all projector testids and polling behavior.

### 3.4 Preserved Non-Negotiable Safeguards

| Safeguard | Requirement in Redesigned UI |
| --- | --- |
| **CARE priority invisibility** | Zero mention of priority tiers, CARE ranking, or eligibility reasons anywhere on student, host, or pantry screens. |
| **Allergen honesty** | Every food detail, host review, and pantry card displays `"may contain, confirm with host"` and `"Offered in good faith by the host. Allergens are estimates; confirm with the host."` via shared `AllergenCard`. Never claim `"allergen-free"`. |
| **Hard dietary filters** | Student feed continues showing incompatible drops with a calm disabled state + clear human reason (`"Contains dairy (on your allergen list)"`, `"Doesn't match vegan preference"`), never allowing reservation. |
| **No GPS / location-free join** | `/join` collects nickname + optional allergens/diets only. Zero geolocation calls (`navigator.geolocation` never invoked). Walking links open destination-only coordinates (`destination=lat,lng`, never `origin`). |
| **Count-only host privacy** | Host never sees student nicknames, emails, IDs, or pickup photos — aggregate counts only (`available`, `held`, `picked_up`, plus separate `pantry_held`, `pantry_transferred`). |
| **Photo-assisted pickup honesty** | Student pickup flow preserves explicit upload -> assessment -> explicit `"Confirm pickup"` button (photo alone never consumes a hold), `"Request host review"` / retake on uncertain or inconsistent results, and the mandatory `PICKUP_CONFIRMATION_NOTICE`. |
| **Pantry policy & simulation at action** | Host pantry referral card and `/pantry` coordinator actions always show the KSU catering policy prohibition, `"Demo only — no request is sent to KSU CARE"`, official CARE + KSU catering links, and require explicit checkbox confirmation before every mutation. Separate student vs. pantry counts (`Student pickups`, `Pantry reserved`, `Accepted servings`, `Pantry transfers`) remain strictly distinct. |
| **FCM + iOS Home Screen** | Student Profile and Host Dashboard preserve `usePushOptIn` (`POST /students/me/push-token`, `GET/POST/DELETE /hosts/me/push-token`) and iOS Safari Add-to-Home-Screen guidance, styled cleanly with Lucide icons and plain language. |
| **It companion & `/survey`** | Exact-drop It link (`owl-whats-left-<drop_id>`) remains accessible on Host active drop dashboard; `/survey` remains standalone and unmodified in behavior. |

---

## 4. Route Map & Screen-by-Screen UX Blueprint

### 4.1 Route Overview

| Route | Audience | Purpose | Owner |
| --- | --- | --- | --- |
| `/` | Public / All | Clean consumer landing: Find Food / Share Food | Worker 2 (Antigravity) |
| `/join` | Student | Quick 1-screen join: nickname + optional allergens/diets (no GPS) | Worker 2 (Antigravity) |
| `/student` | Student | 4-tab consumer app (`Home`, `Map`, `Reservations`, `Profile`) + seeded `?persona=A..E` support | Worker 2 (Antigravity) |
| `/student/drops/[id]` | Student | Dedicated food detail page (hero photo, allergens, directions, reserve/hold) | Worker 2 (Antigravity) |
| `/host` | Event Host | 3-step guided listing flow (`Photo` -> `Review` -> `Publish`) + Host Listing Dashboard | Worker 1 (Claude) |
| `/pantry` | Pantry Coord. | Clean standalone coordinator workspace with policy/simulation notice at action | Worker 1 (Claude) |
| `/admin` | Demo / Staff | Diagnostics, provider/mode status, scenario switch, reset, seeded A–E links | Final Integrator |
| `/dispatch` | Projector | Big-screen campus aggregate & seeded wave projector view | Final Integrator |
| `/survey` | Public | Standalone anonymous survey (preserved as-is) | Existing / Unchanged |

> **Deep-link compatibility:** Push notifications open `/student?drop=<id>`. When `/student` mounts with `?drop=<id>` in normal campus-feed mode, it smoothly navigates or highlights/opens `/student/drops/<id>` (or selects the building pin when `?tab=map&drop=<id>`), ensuring existing FCM notification payloads work without backend push payload changes.

### 4.2 `/` — Consumer Landing

- **Top bar:** Crisp Owl Plate brand mark (KSU Gold rounded square + Owl Plate wordmark) + subtle Light/Dark theme toggle button. No diagnostic pills.
- **Hero:** Concise headline (`"Free campus food, shared before it goes to waste"`) + 1-sentence subtitle (`"Event hosts snap one photo. Nearby KSU Marietta students reserve a serving in seconds."`).
- **Two clear consumer action cards (side-by-side on desktop, stacked on mobile):**
  1. **Find Food** (KSU Gold primary CTA): Routes to `/student` if active session token exists (`"Open campus feed"`), else `/join` (`"Browse food now"`).
  2. **Share Leftover Food** (Crisp outlined secondary CTA): Routes to `/host` (`"Post a food drop"`).
- **Compact 3-step visual strip (Lucide icons):** `Snap a photo` -> `Reserve a plate` -> `Pick up on campus` (short 6–8 word captions).
- **Footer:** Allergen reminder (`"Allergens always say: may contain, confirm with host."`), calm link to `/pantry` (`"Pantry Coordinator"`), and `PrototypeNotice` with discreet `"Demo controls"` link to `/admin`.

### 4.3 `/join` — Simple Student Onboarding (No GPS)

- Clean centered card (`max-w-md`), single step, zero friction:
  - Session-ended calm notice banner when `?reason=session_ended`.
  - **Nickname input** (required, 1–24 chars, clear inline error on duplicate `nickname_taken`).
  - **Dietary preferences (optional):** Clean pill grids for **Allergens to avoid** (9 standard allergens) and **Dietary preferences** (`Vegetarian`, `Vegan`, `Halal`, `Kosher`, `Pork-free`). Collapsed or compactly grouped so a student with no restrictions can join in 2 taps.
  - **Notifications note (informational, non-blocking):** One compact line with `Bell` icon explaining they can turn on food alerts right after joining (no OS permission prompt before joining).
  - **Privacy reassurance:** `"No GPS, phone number, or student ID needed. Your food preferences stay private."`
  - **Primary KSU Gold button:** `"Start browsing food"` -> creates session via `POST /sessions` and navigates to `/student`.

### 4.4 `/student` — Consumer Student App (Mobile Bottom Tabs)

Uses `AppShell` with `BottomNav` on mobile (`< md`) and compact top tab bar on desktop (`>= md`). Active tab syncs with `?tab=home|map|reservations|profile` (defaults to `home`; if `?drop=<id>` is passed without a tab, routes directly to `/student/drops/<id>`).

#### Tab 1: **Home** (`UtensilsCrossed` icon)
- **Compact active-hold floating banner** (only when the student currently has a held serving): gold-accented compact strip showing food name, remaining hold countdown, and `"View hold"` button jumping to **Reservations**.
- **Search bar:** Rounded pill search input (`Search` icon + clear button) filtering drops instantaneously by food item name, notes, building name, or building code.
- **Horizontal category & quick-filter chips** (smooth touch scroll, zero wrap overflow):
  - Quick filters: `All`, `Available now`, `Safe for me`
  - Dietary & food category chips: `Vegetarian`, `Vegan`, `Halal`, `Kosher`, `Pizza`, `Wraps & Sandwiches`, `Salads & Fruit`, `Baked & Snacks` (food categories matched deterministically client-side from `drop.vision.items[].name` + `diet_tags_final`).
- **Rounded Food Photography Cards Grid** (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`):
  - Uses shared `<FoodCard>`:
    - **16:10 rounded hero photo** (`<DropPhoto>` rendering actual sanitized host listing JPEG, with warm food-themed fallback graphic only when `has_photo === false`).
    - Top-left floating pill: servings remaining (`"6 servings left"`, or `"Claimed out"` in neutral slate).
    - Top-right floating pill: time remaining (`"32m left"`, switching to warning tint `< 10m`).
    - Card body: bold food title (e.g., `"Cheese Pizza & Veggie Wraps"`), `MapPin` icon + verified building name & room (`"Joe Mack Wilson Student Center · Room 214"`), compact diet tag chips, and compact allergen micro-note (`"May contain dairy, gluten"`).
    - Bottom row: clear primary action (`"Reserve"` or `"View details"`), or subtle muted compatibility pill (`"Contains dairy"` / `"You already have a hold"`) when `can_reserve === false`. Tapping the photo or title navigates to `/student/drops/[id]`.
- **Skeletons & Empty States:** 3 `FoodCardSkeleton` cards while loading; calm `EmptyState` when no drops match (`"No food drops right now"` with `"Turn on alerts"` button jumping to Profile, or `"Clear filters"` when search/chips narrow to zero).

#### Tab 2: **Map** (`MapPin` icon)
- Full-bleed responsive Marietta Campus map container (`CampusMapCanvas` styled cleanly for light & dark themes, preserving exact verified coordinates, resolution-11 H3 aggregation, zero GPS, touch pan/zoom/fit-to-campus controls).
- **Floating search/filter pill** at top of map (filter to `"Available only"` or search a building).
- **Interactive building pins:** Gold circular count badges showing available servings per building (muted when claimed out).
- **Uber Eats-style Preview Sheet** (anchored bottom sheet on mobile, right-hand side panel on desktop) when a building pin is tapped:
  - Building name, code, destination-only `"Walking directions"` button (opens Google Maps with `destination=lat,lng` only, never `origin`).
  - Scrollable compact `<FoodCard variant="compact">` list for drops in that building with actual host food photo, servings left, mandatory allergen notice, and `"View details"` / `"Reserve"` actions.
- **Accessible fallback list toggle** (`"List view"` / `"Map view"` fallback preserved for keyboard/screen-reader accessibility and WebGL-less environments).

#### Tab 3: **Reservations** (`Clock` / `ShoppingBag` icon, shows active badge dot when holding 1 serving)
- **Active Hold Section (top):**
  - Prominent elevated card for the student's current `held` claim:
    - Sanitized host food photo thumbnail + food title + building/room + pickup instructions.
    - Prominent live 10-minute hold countdown (`tabular-nums`).
    - Destination-only `"Walking directions"` button.
    - **Photo-Assisted Pickup Confirmation Card** (clean, calm consumer redesign of the existing Milestone 2 pickup flow):
      - Step guidance: `"At pickup, snap a quick photo of your plate to confirm."`
      - Camera/file upload button with local preview and upload progress bar.
      - Honest assessment feedback (`Consistent`, `Needs a closer look`, `Doesn't look like a match`) with `PICKUP_CONFIRMATION_NOTICE`.
      - Explicit `"Confirm pickup"` button (enabled only when `can_confirm === true`; photo upload alone never consumes the hold).
      - On uncertain/inconsistent result: clear `"Retake photo"` and `"Ask host to review"` buttons, showing live review status (`Pending host review` -> `Approved` or `Retake requested`) via polling.
    - Secondary `"Release spot"` button (returns serving to campus feed immediately).
- **Past Reservations Section (below, powered by `GET /students/me/reservations`):**
  - Chronological list of past reservations (`Picked up`, `Released`, `Expired`) with food summary, building name, timestamp (America/New_York), and status pill. Note: expired drops cleanly show the food fallback icon once their listing photo has been purged (`has_photo === false`).
- **Empty State:** When no active hold and no history, shows `EmptyState` with `"Browse campus food"` button back to **Home**.

#### Tab 4: **Profile** (`User` icon)
- **Identity card:** Student nickname + `"Marietta Campus"` subtitle (no email, no student ID, no priority tier).
- **Dietary & Allergen Preferences:** Clean interactive toggle pills for all 9 allergens and 5 diets, with `"Save preferences"` button and inline confirmation toast.
- **Notifications Card:**
  - Clean `PushOptIn` component (enables FCM web push or shows iOS Safari Add-to-Home-Screen steps in plain language — no `"not configured in this build"` jargon; if push is unavailable locally, calmly says `"Live push alerts aren't active on this preview — check back here for new drops."`).
  - `"Pause food alerts"` toggle (`alerts_paused` via `PUT /students/me/preferences`).
- **Appearance:** `Light` / `Dark` / `System` segmented control.
- **Session & Prototype Info:** `PrototypeNotice` + `"Leave session"` danger-outline button (`DELETE /sessions/me`, redirects to `/join`).

#### Seeded Rehearsal Mode Compatibility (`?persona=A..E`)
- When `/student?persona=A..E` is opened (launched from `/admin` or automated rehearsal scripts), `/student` renders the clean redesigned consumer card shell while preserving the exact invite-based claim/decline/pickup flow, `data-testid` anchors for rehearsal assertions, and explicit `"Demo persona"` indicator so `rehearse_demo.cjs` stays 100% green.

### 4.5 `/student/drops/[id]` — Dedicated Food Detail Page

- **Top bar:** Back button (`ArrowLeft` -> returns to `/student` preserving tab) + Share/Directions shortcut.
- **Hero Photo:** Full-width rounded (`rounded-2xl` / `rounded-3xl`) 16:10 `<DropPhoto>` showing the **actual sanitized host listing photo** with floating servings pill and expiry countdown.
- **Title & Location Block:**
  - Food title + host notes (when present).
  - Itemized servings list (`"Cheese pizza · ~14 slices"`, `"Veggie wraps · ~6 halves"`).
  - Verified building card: `MapPin` icon, building name & code, room number, host pickup instructions, and destination-only `"Walking directions"` link (`target="_blank" rel="noopener noreferrer"`).
- **Dietary & Allergen Section:**
  - Diet tags row (when host-confirmed).
  - Shared `<AllergenCard>` prominently showing all tagged allergens and mandatory notice: `"may contain, confirm with host"` + `"Offered in good faith by the host. Allergens are estimates; confirm with the host."`
- **Sticky Bottom Action Bar:**
  - If student has an active hold on this drop -> `"Manage active hold"` (navigates to `/student?tab=reservations`).
  - If `can_reserve === true` -> full-width KSU Gold `"Reserve 1 serving (10-min hold)"` button -> calls `POST /drops/{id}/reserve`, then routes smoothly to `/student?tab=reservations`.
  - If `can_reserve === false` -> disabled button with clear, empathetic explanation pill (`unavailable_reason`: allergen conflict, diet mismatch, already holding another serving, or all servings claimed).

### 4.6 `/host` — 3-Step Host Flow + Listing Dashboard

Clean top header (`AppShell`, `role="host"`) with a compact view switcher when the host has existing drops: **`Share Food`** (3-step wizard) and **`My Listings`** (Host Dashboard, backed by `GET /hosts/me/drops`).

#### Guided 3-Step Creation Flow (`HostStepProgress`: `1. Photo` -> `2. Review` -> `3. Publish`)
1. **Step 1 — Photo:**
   - Large, inviting rounded upload dropzone (`Camera` / `Upload` Lucide icon) supporting mobile camera capture (`accept="image/jpeg,image/png"`) and desktop file picker, with instant local preview before submitting.
   - Calm privacy cue: `"Snap food trays only — avoid capturing faces or people. Photos are automatically deleted when the drop expires (max 24 hours)."`
   - Optional short host note input (`"Optional note, e.g. one tray is vegan"`).
   - Primary KSU Gold CTA: `"Analyze food photo"` (`POST /drops`).
2. **Step 2 — Review:**
   - Side-by-side (desktop) or stacked (mobile) layout showing the uploaded host photo thumbnail alongside clean editable sections:
     - **Estimated food & servings:** Detected items summary + large `- / +` servings stepper (`servings_final`, 1–500).
     - **Allergens & Dietary tags:** Toggle pills for all 9 allergens (with mandatory `"may contain, confirm with host"` preview) and 5 dietary tags. Selecting `halal`, `kosher`, or `pork_free` reveals the required explicit religious-diet host confirmation checkbox (`religious_diets_confirmed`).
     - **Pickup location:** Verified Marietta Campus `BuildingSelector` (searchable, categorized, zero GPS) + Room input + optional pickup instructions + expiry window chips (`30 min`, `45 min` default, `60 min`, `90 min`, `120 min`). Note: `DEMO-ORIGIN` rehearsal option is hidden on the standard consumer host screen and shown only when explicitly enabled via `?rehearsal=1` (used by `/admin` & seeded rehearsal scripts).
     - **Required Food Safety Checklist:** Clean 3-checkbox card (`covered_and_temperature_safe`, `served_within_two_hours`, `untouched`) with honest note that Owl Plate does not certify food safety.
   - Sticky bottom bar: `"Back"` + primary KSU Gold `"Publish food drop"` (`PATCH /drops/{id}` + `POST /drops/{id}/publish`).
3. **Step 3 — Published & Active Listing Dashboard:**
   - **Live Listing Header Card:** Actual sanitized host listing photo (`<DropPhoto>`), food summary, building & room, live countdown timer, and `"Live"` / `"Claimed out"` / `"Expired"` status badge.
   - **Aggregate Counts Grid (Strictly Count-Only — Zero Student PII):**
     - `Available` | `Held (students)` | `Student pickups`
     - And when pantry activity exists (or in dedicated pantry row): `Pantry reserved` | `Pantry transfers` — visibly separated from student counts.
   - **Host Push Notifications Card:** Clean `PushOptIn` (`role="host"`) explaining count-only pickup alerts (food name & remaining count only, zero student data).
   - **De-Identified Pickup Review Queue:** Appears cleanly when `pickupReviews.length > 0` — shows opaque review card (never student name/ID, never pickup photo), assessment badge, brief explanation, and `"Approve pickup"` / `"Ask to retake"` actions.
   - **Pantry Fallback Card (`HostPantryCard`):** Clean card showing Marietta Campus Pantry destination, official KSU CARE & catering policy links, explicit policy prohibition + `"Demo simulation"` notice right above the required acknowledgment checkbox, serving stepper, `"Request demo referral"` button, and (once coordinator accepts) explicit `"Confirm simulated handoff"` checkbox + button.
   - **Companion Quick Link:** Clean compact link card for the exact-drop It companion (`owl-whats-left-<drop_id>`).

#### Host Listing Dashboard (`My Listings`)
- Powered by `GET /hosts/me/drops` (active and recent drops for the authenticated host, newest first).
- Displays each drop as a clean row/card with its sanitized photo (when unexpired), food title, building/room, status pill (`Draft`, `Live`, `Claimed out`, `Expired`), aggregate counts summary, and action (`"Resume draft"` -> Step 2, or `"Manage drop"` -> Step 3 dashboard).
- Prominent `"+ New food drop"` button to start Step 1 at any time.

### 4.7 `/pantry` — Separate Pantry Coordinator Workspace

- Standalone consumer-polished workspace (`AppShell`, `role="pantry_coordinator"`) keeping the dedicated coordinator credential boundary (`demo-pantry` in demo mode) intact.
- **Header & Policy Summary:** `"Marietta Campus Pantry — Coordinator"` with verified destination building (`Student Center · Room 184`), destination-only walking link, and official KSU CARE & KSU catering policy links.
- **Filter Tabs:** `Action needed` (`requested` + `suggested`), `Accepted` (`accepted`), `Completed & Past` (`handoff_confirmed`, `rejected`, `expired`).
- **Coordinator Referral Cards:**
  - Shows **actual sanitized host food photo** (`<DropPhoto>` when unexpired), food title, host building/room, destination-only directions link, deadline countdown, and host safety checklist summary.
  - **Explicitly Separated Counts Row:** `Available`, `Student pickups`, `Pantry reserved` (current `counts.pantry_held`), plus historical `Accepted servings` (when transferred/expired) and `Pantry transfers` (`counts.pantry_transferred`) — strictly preserving the clarity fix documented in `docs/PANTRY_HANDOFF.md`.
  - **Mandatory Policy & Simulation Block at Action:** On every `requested` card, directly adjacent to the serving quantity stepper and `"Accept servings"` / `"Decline"` buttons:
    - Clear callout box with KSU catering policy prohibition (`"Demo only — no request is sent to KSU CARE. KSU catering policy prohibits removing leftovers from event spaces..."`), direct official CARE & catering policy links, and mandatory unchecked acknowledgment checkbox required to enable decision buttons.
  - Read-only state summaries for `suggested`, `accepted`, `handoff_confirmed`, `rejected`, and `expired` referrals.

---

## 5. Real Sanitized Host Listing Photos — Storage, Privacy & Authorization

### 5.1 Non-Negotiable Photo Rules

1. **Actual host listing photos only:** Food cards, map previews, food details, host dashboards, and pantry referral cards display the **actual sanitized JPEG** uploaded by the host in `POST /drops`. Never use borrowed stock photography, external image URLs, or hard-coded demo food images.
2. **Private pickup photos are NEVER stored or served:** `POST /claims/{claim_id}/pickup-verification` continues to decode/validate in memory, send to the pickup verifier, and discard image bytes immediately. Zero persistence, zero read endpoint, zero exposure to hosts or other students.
3. **Metadata stripping & sanitization:** Every uploaded host photo passes through `validate_photo(photo: bytes) -> bytes` enhanced with `PIL.ImageOps.exif_transpose(image)` before `.thumbnail((1024, 1024))`, `.convert("RGB")`, and clean JPEG re-encoding (`quality=85`) — stripping 100% of EXIF, GPS tags, camera serials, and ICC/XMP metadata, and enforcing the `10 MiB` byte bound and `20 MP` pixel bound.
4. **Temporary retention — max 24h OR deadline cleanup:**
   - Every stored listing photo records `expires_at` (UTC):
     - On `POST /drops` (draft created): `photo_expires_at = created_at + min(2 hours, 24 hours)` (drafts are cleaned up if abandoned).
     - On `POST /drops/{id}/publish`: `photo_expires_at = min(drop.expires_at, drop.created_at + 24 hours)` (so the photo is guaranteed to expire **on or before** the drop's pickup deadline and never later than 24 hours after upload).
   - **Automatic purge points (all four active):**
     1. Drop expiry sweep (`_expire()` in `application.py`, triggered on ticks and state-changing reads/writes) deletes any `DropPhoto` where `now >= photo.expires_at` or whose parent drop is `expired`.
     2. Lazy enforcement on `GET /drops/{id}/photo`: if `now >= photo.expires_at` or drop is `expired`, delete the row and return `404`.
     3. `POST /demo/reset`: atomically deletes all `DropPhoto` records.
     4. Production deployment: S3 bucket 24-hour lifecycle rule backs the same `PhotoStore` interface.

### 5.2 Storage Abstraction (`services/api/storage/photos.py`)

Keep external/storage concerns behind a small protocol matching `AGENTS.md`:

```python
class PhotoStore(Protocol):
    def put(self, session: Session, drop_id: str, jpeg_bytes: bytes, expires_at: str) -> None: ...
    def get(self, session: Session, drop_id: str, now_iso: str) -> bytes | None: ...
    def update_expiry(self, session: Session, drop_id: str, expires_at: str) -> None: ...
    def has_active(self, session: Session, drop_id: str, now_iso: str) -> bool: ...
    def purge_expired(self, session: Session, now_iso: str) -> int: ...
    def purge_all(self, session: Session) -> int: ...
```

- **Local / SQLite implementation (`DbDropPhotoStore` + SQLModel table `DropPhoto`):**
  ```python
  class DropPhoto(SQLModel, table=True):
      """Ephemeral sanitized host listing photo; purged at drop deadline (max 24h) or reset."""
      drop_id: str = Field(foreign_key="drop.id", primary_key=True)
      content_type: str = "image/jpeg"
      data: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
      size_bytes: int
      created_at: str
      expires_at: str
  ```
- **Why `DropPhoto` table (behind `PhotoStore`) is ideal locally:**
  - Single transactional boundary with SQLite — `demo_reset` and drop expiry leave zero orphaned files on disk.
  - Zero risk of path traversal or accidental commits of temporary uploaded images in git worktrees.
  - Swapping in `S3PhotoStore` for AWS deployment requires zero route or service changes.
- **Note for unit tests where `validate_photo` is mocked as identity `lambda b: b`:** `POST /drops` saves the validated bytes only when non-empty; `services/api/main.py` uses real `validate_photo` so all real HTTP uploads produce genuine sanitized JPEG bytes (`0xFF 0xD8`).

### 5.3 Scoped Authorization Matrix (`GET /drops/{drop_id}/photo`)

Because `<img>` tags cannot attach `Authorization: Bearer` headers without leaking tokens into query strings, `GET /drops/{drop_id}/photo` **strictly requires the standard `Authorization: Bearer <token>` header** (never query-string tokens), and the shared frontend `<DropPhoto>` component fetches the image via `fetch()` with the Bearer header and renders an in-memory `URL.createObjectURL(blob)` (revoked on unmount).

| Caller Role | Authorized When | Otherwise |
| --- | --- | --- |
| Unauthenticated / invalid token | Never | `401 unauthorized` |
| `host` | `drop.host_id == actor.id` AND `drop.status in {"draft", "live", "claimed_out"}` AND `now < photo.expires_at` | `403` (wrong host) / `404` (expired/missing) |
| `student` (joined visitor) | (`drop.distribution_mode == "campus_feed"` AND `drop.status in {"live", "claimed_out"}` AND `now < photo.expires_at`) OR (student owns a claim on `drop.id` AND `now < photo.expires_at`) | `404` (never leak draft/expired existence) |
| `student` (seeded persona) | Student has an `Invite` on `drop.id` AND `now < photo.expires_at` | `404` |
| `pantry_coordinator` | Drop has a `PantryReferral` AND `drop.status != "expired"` AND `now < photo.expires_at` | `404` (preserves coordinator 404 privacy boundary) |
| `projector` | `drop.status in {"live", "claimed_out"}` AND `now < photo.expires_at` | `404` |

Response headers on `200 OK`:
- `Content-Type: image/jpeg`
- `Cache-Control: private, max-age=300`
- `X-Content-Type-Options: nosniff`
- `Content-Disposition: inline; filename="drop-photo.jpg"`

---

## 6. Minimal Backend Endpoint & Schema Contract Additions

All 38 existing routes stay **100% backward-compatible**. Only **2 additive fields** on `DropResponse` and **3 minimal endpoints** are needed.

### 6.1 Additive Fields on `DropResponse`

```python
class DropResponse(ContractModel):
    # ... all existing fields unchanged ...
    has_photo: bool = False
    photo_url: str | None = None  # "/drops/{id}/photo" when has_photo is True, else None
```

- `has_photo` reflects live unexpired photo presence (`now < photo.expires_at` and drop not expired).
- `photo_url` is a relative API path (`f"/drops/{drop.id}/photo"`) when `has_photo` is `True`, else `None`. Frontend resolves it against `API_BASE_URL` (e.g., `/backend/drops/{id}/photo` in phone/HTTPS builds) and fetches with `Authorization: Bearer ...`.

### 6.2 New Endpoint 1 — Scoped Sanitized Host Photo

- **`GET /drops/{drop_id}/photo`**
  - Auth: `Authorization: Bearer <token>` (any authorized role per Section 5.3).
  - Success: `200 OK`, raw sanitized `image/jpeg` bytes + headers above.
  - Errors: `401` (unauthenticated), `403` (different host), `404` (missing, unauthorized scope, or expired/purged).

### 6.3 New Endpoint 2 — Student Reservation History (Active + Past)

Powers the **Reservations** bottom tab cleanly in a single call.

- **`GET /students/me/reservations`**
  - Auth: `Authorization: Bearer <student-session-or-persona-token>` (`role == "student"`).
  - Runs expiry sweep first so hold/drop statuses are always current.
  - Returns the caller's own claims across all drops (newest `claim.created_at` first, tie-broken by `claim.id`), including `held`, `picked_up`, `released`, and `expired`.
  - Schema:
    ```python
    class StudentReservationItem(ContractModel):
        claim: ClaimResponse
        drop: DropResponse
        pickup_verification: PickupVerification | None = None

    class StudentReservationsResponse(ContractModel):
        reservations: list[StudentReservationItem]
        server_time: datetime
        is_demo: bool
    ```
  - Privacy guarantee: returns only the authenticated student's own claims; never exposes `priority_tier` or other students.

### 6.4 New Endpoint 3 — Host Listings Dashboard

Powers the Host **My Listings** switcher and post-reload dashboard recovery without relying solely on `GET /demo/active-drop`.

- **`GET /hosts/me/drops`**
  - Auth: `Authorization: Bearer <host-token>` (`role == "host"`).
  - Runs expiry sweep first.
  - Returns drops owned by `actor.id` (`draft`, `live`, `claimed_out`, `expired`), newest `created_at` first (tie-broken by `id`).
  - Schema:
    ```python
    class HostDropsResponse(ContractModel):
        drops: list[DropResponse]
        server_time: datetime
        is_demo: bool
    ```
  - Privacy guarantee: `DropResponse` carries aggregate `counts` only — never student names, IDs, or pickup photos.

---

## 7. Shared Component Interfaces & File Ownership Matrix (Proposal for Manager Codex)

Manager (Codex) owns the reconciled contract, design tokens, shared UI primitives, and additive API client types/methods on the **contract entry commit**. Workers branch in parallel **only from that entry SHA** and never edit each other's files.

### 7.1 Proposed Shared Primitives (Manager-Owned in `apps/web/components/ui/` & `apps/web/lib/`)

1. **`apps/web/lib/theme.ts`**
   ```ts
   export type ThemePreference = "light" | "dark" | "system";
   export interface ThemeContextValue {
     preference: ThemePreference;
     resolved: "light" | "dark";
     setPreference: (next: ThemePreference) => void;
   }
   export function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element;
   export function useTheme(): ThemeContextValue;
   ```
2. **`apps/web/components/ui/AppShell.tsx`**
   ```ts
   export type AppShellVariant = "public" | "student" | "host" | "pantry" | "admin";
   export interface AppShellProps {
     variant: AppShellVariant;
     title?: string;
     headerAction?: React.ReactNode;
     bottomNav?: React.ReactNode;
     showPrototypeNotice?: boolean;
     maxWidth?: "md" | "lg" | "xl" | "wide";
     children: React.ReactNode;
   }
   ```
   - Renders clean consumer top bar (Owl Plate KSU Gold mark, optional desktop nav / right action, theme toggle — **zero developer telemetry badges**), main content region with proper bottom-nav clearance, and single discreet `PrototypeNotice` footer.
3. **`apps/web/components/ui/BottomNav.tsx`**
   ```ts
   export type StudentTabId = "home" | "map" | "reservations" | "profile";
   export interface BottomNavProps {
     activeTab: StudentTabId;
     onSelectTab: (tab: StudentTabId) => void;
     activeHoldCount?: number;
   }
   ```
   - Fixed mobile bottom bar (`md:hidden`, 4 tabs: `Home`, `Map`, `Reservations`, `Profile` with Lucide icons, active gold indicator, hold dot badge, `data-testid="nav-tab-<id>"`) + matching horizontal tab strip helper for desktop `md:flex`.
4. **`apps/web/components/ui/DropPhoto.tsx`**
   ```ts
   export interface DropPhotoProps {
     dropId: string;
     hasPhoto?: boolean;
     photoUrl?: string | null;
     authToken?: string | null;
     alt: string;
     aspect?: "16/10" | "4/3" | "square" | "hero";
     className?: string;
     overlayTopLeft?: React.ReactNode;
     overlayTopRight?: React.ReactNode;
     testId?: string;
   }
   ```
   - Fetches sanitized host photo via `getDropPhotoBlob(dropId, authToken)` using `Authorization: Bearer ...`, creates & caches an ObjectURL, revokes cleanly on cleanup, shows a matching skeleton while loading, and falls back gracefully to a clean Lucide `UtensilsCrossed` warm card background only when `hasPhoto` is false or the photo expired (`404`).
   - Exposes `data-photo-state="loaded" | "loading" | "fallback"` on the container so regression scripts can verify real uploaded JPEG rendering (`img.naturalWidth > 0`).
5. **`apps/web/components/ui/FoodCard.tsx`**
   ```ts
   export interface FoodCardProps {
     drop: DropResponse;
     authToken?: string | null;
     variant?: "feed" | "compact" | "host" | "pantry";
     badge?: React.ReactNode;
     footer?: React.ReactNode;
     disabledReason?: string | null;
     nowIso?: string;
     href?: string;
     onSelect?: () => void;
     testId?: string;
   }
   ```
   - Shared Uber Eats-inspired rounded food photography card (`rounded-2xl`), displaying `<DropPhoto>`, servings pill, countdown timer, food title, building + room, diet chips, compact allergen micro-notice, and slot for role-specific actions.
6. **`apps/web/components/ui/AllergenCard.tsx`** (and light/dark refreshed `apps/web/components/AllergenBadge.tsx` re-exporting/wrapping it so existing imports keep working)
   ```ts
   export interface AllergenCardProps {
     allergens: ReadonlyArray<Allergen>;
     notice?: string;
     compact?: boolean;
     title?: string;
   }
   ```
   - Always renders `"may contain, confirm with host"` and preserves `data-testid="allergen-display-box"` and `data-testid="allergen-warning-banner"`.
7. **`apps/web/components/ui/StatusBadge.tsx`**, **`Skeleton.tsx`** (`FoodCardSkeleton`, `DetailSkeleton`, `ListRowSkeleton`), **`EmptyState.tsx`**, and **`PrototypeNotice.tsx`**.
8. **Shared API types & client methods (Manager-owned on entry SHA):**
   - `apps/web/lib/types/api.ts`: add `has_photo?: boolean`, `photo_url?: string | null` to `DropResponse`, plus `StudentReservationItem`, `StudentReservationsResponse`, `HostDropsResponse`.
   - `apps/web/lib/api-client.ts`: add `getDropPhotoBlob(dropId, token)`, `getMyReservations(token)`, `getHostDrops(token)` (plus clean offline fixture fallbacks when `UI_FIXTURE_MODE === true`).

### 7.2 Strict Zero-Overlap File Ownership Matrix

| Role | Exclusive File Ownership | Explicit Do-Not-Touch Boundary |
| --- | --- | --- |
| **Manager (Codex)** — Entry SHA | `docs/CONSUMER_UX_CONTRACT.md` (if added), `apps/web/tailwind.config.ts`, `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/lib/theme.ts`, `apps/web/components/ui/**`, `apps/web/components/AllergenBadge.tsx`, `apps/web/lib/types/api.ts`, `apps/web/lib/api-client.ts`, `apps/web/lib/fixtures/demo-fixtures.ts` | Do not start workers until entry SHA is committed and clean. |
| **Worker 1 (Claude)** — Backend + Host + Pantry | `services/api/storage/**`, `services/api/db/models.py`, `services/api/schemas/api.py`, `services/api/vision/service.py` (EXIF transpose), `services/api/application.py`, `services/api/routes/api.py`, `services/api/tests/**`, `apps/web/app/host/**`, `apps/web/components/host/**`, `apps/web/components/HostPantryCard.tsx`, `apps/web/components/BuildingSelector.tsx`, `apps/web/app/pantry/**`, `apps/web/components/pantry/**`, `apps/web/lib/pantry-helpers.ts`, `apps/web/lib/pantry-api.ts`, `apps/web/tests/host-helpers.test.mjs`, `apps/web/tests/pantry.test.mjs` | Never edit `/`, `/join`, `/student/**`, `StudentCampusMap.tsx`, `CampusMapCanvas.tsx`, `PushOptIn.tsx`, `/dispatch`, `/admin`, `scripts/**`, `openapi.json`, or `api.generated.ts`. |
| **Worker 2 (Antigravity)** — Consumer Landing + Join + Student | `apps/web/app/page.tsx`, `apps/web/app/join/**`, `apps/web/app/student/**` (including new `apps/web/app/student/drops/[id]/page.tsx`), `apps/web/components/student/**`, `apps/web/components/StudentCampusMap.tsx`, `apps/web/components/CampusMapCanvas.tsx`, `apps/web/components/PushOptIn.tsx`, `apps/web/tests/student-helpers.test.mjs`, `apps/web/tests/campus-map.test.mjs`, `apps/web/tests/push-helpers.test.mjs` | Never edit `services/api/**`, `/host/**`, `/pantry/**`, `/dispatch/**`, `/admin/**`, `BuildingSelector.tsx`, `HostPantryCard.tsx`, `scripts/**`, `openapi.json`, or `api.generated.ts`. |
| **Final Integrator (OpenCode Gemini Neon)** — Integration, Admin & Verification | `apps/web/app/admin/**`, `apps/web/app/dispatch/**`, `apps/web/components/presenter/**`, `apps/web/components/DemoHeader.tsx`, `apps/web/openapi.json`, `apps/web/lib/api.generated.ts`, `scripts/**`, `Makefile`, `prototypes/itcan/**` (only if needed), cross-cutting tests not worker-owned, `docs/CONSUMER_UX_HANDOFF.md` | Integrates Claude FIRST, Antigravity SECOND; never polls workers or reads unfinished branches; never touches protected runtimes (`3017`/`8017`, `8000`) or canonical dirty cloud files. |

---

## 8. Final Integration & Verification Plan (Post-Worker Execution)

When Manager Codex supplies the reconciled contract entry SHA and later the completed worker SHAs:

1. **Fast-forward cleanly:** Fast-forward this isolated worktree (`t3-d6a2fd52`, branch `t3/consumer-ux-design`) to the Manager entry SHA and prepare integration/browser verification scripts while workers run (without polling or reading unfinished worker trees).
2. **Ordered Integration:**
   - Merge/cherry-pick **Worker 1 (Claude: backend + host + pantry) FIRST**, regenerate `apps/web/openapi.json` & `apps/web/lib/api.generated.ts` (verify zero hash drift across two runs), and run full Python pytest + ruff + eval + campus + It suites.
   - Merge/cherry-pick **Worker 2 (Antigravity: landing + join + student) SECOND**, wire `/admin` and `/dispatch`, and run `npm --prefix apps/web test`, `lint`, `types`, and production build against candidate port `8027`.
3. **Candidate-Only Live Browser & Cross-Device Regression (`3027`/`8027`, fixture/log, synthetic photos only):**
   - Capture and visually inspect screenshots across **all redesigned pages** (`/`, `/join`, `/student` Home/Map/Reservations/Profile, `/student/drops/[id]`, `/host` Steps 1–3 & Dashboard, `/pantry`, `/admin`, `/dispatch`) in both Light and Dark themes across three viewports:
     - **iPhone mobile:** `390×844`
     - **Android mobile:** `412×915`
     - **Desktop:** `1440×1000`
   - **Automated assertions:**
     - Zero horizontal overflow (`scrollWidth <= clientWidth`) on every page and viewport.
     - Zero banned jargon strings (`OpenRouter`, `Gemini`, `fixture`, `live_api`, `synthetic`, `dispatch`, `H3`, `DEMO-ORIGIN`) on public consumer screens (`/`, `/join`, `/student`, `/student/drops/[id]`, `/host`, `/pantry`).
     - Real uploaded JPEG byte verification: `POST /drops` synthetic PNG/JPEG -> `GET /drops/{id}/photo` returns HTTP `200` valid JPEG bytes (`0xFF 0xD8`), EXIF stripped, rendered `<img naturalWidth > 0>` on Student Home, Map sheet, Food Details, Host Dashboard, and Pantry Coordinator; returns `401` unauthenticated, `403`/`404` out-of-scope, and `404` after drop expiry or `POST /demo/reset`.
     - Private pickup photo verification: confirm pickup upload bytes are never stored in `DropPhoto` and never returned by any endpoint.
     - Full regression of existing harnesses: `verify_pantry_routes`, `verify_pantry_ui`, `verify_campus_map`, `verify_campus_feed`, `verify_pickup_routes` + `verify_pickup_mobile` (`consistent`, `uncertain`, `inconsistent`), and natural-expiry `rehearse_demo` (`seeded` A–E).
   - Stop candidate `3027`/`8027` cleanly, verify protected `3017`/`8017`/`8000` untouched, and record final evidence & SHA bindings in `docs/CONSUMER_UX_HANDOFF.md`.
