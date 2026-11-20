# It pickup companion: page state contract (Milestone 6, frozen)

The manager owns this file. `create_companion.py` sets the initial state with
`it create --state`; `whats_left.py` replaces it with `it patch`. The page
(`whats-left.html`) only reads these keys through `It.onState` and
`data-it-bind`. Keys not listed here must not be added without manager
sign-off.

## Binding (set at create, repeated in every patch, never changed)

| key | type | meaning |
|---|---|---|
| `drop_id` | string | canonical lowercase UUID of exactly one published listing |
| `page_id` | string | always `owl-whats-left-{drop_id}` |

The page enables **What's left?** only when both match. It sends
`It.action("whats_left", {drop_id, page_id})` and nothing else.

## Listing details (strings, display-ready, safe to show anyone at the table)

| key | example | source |
|---|---|---|
| `food_name` | `Margherita pizza slices` | `vision.items[].name` joined with `, `; max 80 chars, `…` when cut |
| `location` | `Atrium Building · Room 214` | `building.name` (else `building_code`) plus ` · Room {room}` when a room exists |
| `status_label` | `Available now` | `live` → `Available now`; `claimed_out` → `All servings taken`; `expired` → `Listing ended`; `draft` → `Not published yet` |

## Counts (integers, from `GET /drops/{drop_id}` `counts` only)

| key | label on screen |
|---|---|
| `total` | Total servings |
| `available` | Available |
| `held` | Student reservations |
| `picked_up` | Completed pickups |
| `pantry_held` | Pantry reserved |
| `pantry_transferred` | Pantry transfers (simulated) |

Invariant: `total = available + held + picked_up + pantry_held + pantry_transferred`,
all ≥ 0; otherwise the helper fails closed (no counts patched). Older Owl Plate
responses without `pantry_held` / `pantry_transferred` are read as 0 for those two
keys; the invariant still applies.

## Freshness and outcome

| key | type | meaning |
|---|---|---|
| `checked_at` | string | display time, America/New_York, e.g. `3:42:07 PM` |
| `checked_at_iso` | string | UTC ISO-8601 of the same moment |
| `answer` | string | one plain sentence, e.g. `3 of 3 servings left` |
| `ok` | boolean | `true` when counts came from Owl Plate just now |
| `error` | string | empty when `ok`; otherwise a plain message such as `Couldn't reach Owl Plate. Try again in a moment.` Counts keys are left unchanged on error. |

## Privacy

Never in state: host or student credentials, student names or nicknames,
per-student status, photos or photo URLs, push tokens, priority, allergen or
diet preferences of students. Listing allergens are not shown on the companion.

---

# Command center page (sponsor showcase, manager-owned)

The manager owns this section. `create_command_center.py` creates the page
with `it create`; `campus_center.py` patches it with `it patch`. The pickup
companion above is unchanged and remains the verified fallback. The command
center is campus-wide: it binds only to `page_id`, never to a drop.

`command-center.html` owns everything visual; `campus_center.py` owns every
byte of data and every patch payload. Keys not listed here must not be added
without manager sign-off.

## Binding (set at create, repeated in every patch, never changed)

| key | type | value |
|---|---|---|
| `page_id` | string | always `owl-rescue-command-center` |

The page enables no action until `page_id` matches exactly. Every action
payload carries `page_id`; `--it-patch` refuses any other page id.

## Actions (page -> paired Claude Code conversation)

Every handler is read-only against Owl Plate (GET only). Nothing on this page
may publish, reserve, edit, reset or otherwise change app data.
`dismiss_recommendations` edits only this page's state.

| action | payload | handler (printed by `create_command_center.py`) |
|---|---|---|
| `refresh_campus_activity` | `{page_id}` | `campus_center.py --refresh` |
| `select_building` | `{page_id, building_id}` | `campus_center.py --select-building <building_id>` |
| `inspect_listing` | `{page_id, drop_id}` | `campus_center.py --inspect <drop_id>` |
| `whats_left` | `{page_id, drop_id}` | `campus_center.py --whats-left <drop_id>` (the preserved verified interaction) |
| `analyze_remaining_food` | `{page_id}` | conversation runs `campus_center.py --brief`, then the agent's own words via `campus_center.py --respond '<text>'` |
| `show_recommendations` | `{page_id}` | brief, then `campus_center.py --recommend '<json>'` |
| `dismiss_recommendations` | `{page_id}` | `campus_center.py --dismiss-recommendations` |

## Campus summary (numbers from `GET /analytics/operations` `summary`)

| key | screen label |
|---|---|
| `total_published_servings` | Servings published |
| `available_servings` | Available now |
| `student_reserved_servings` | Student reservations |
| `completed_pickups` | Completed pickups |
| `pantry_reserved_servings` | Pantry reserved |
| `pantry_transferred_simulated` | Pantry transfers (simulated) |
| `student_recovery_percent` | Student recovery |
| `active_buildings_count` | Buildings with food |

## Structured values (rendered by the page script, not `data-it-bind`)

`campus_buildings`: one entry per **verified** Marietta campus building (from
`GET /buildings`, only `verification_status === "verified"` with coordinates),
each `{id, name, category, latitude, longitude, active_listings,
total_servings, available_servings, held_servings, picked_up, pantry_held,
pantry_transferred_simulated}`. Coordinates pass through verbatim from the
verified record: never altered, never repositioned, never invented. Invariant
per building: `total_servings = available + held + picked_up + pantry_held +
pantry_transferred_simulated`, all ≥ 0.

`active_listings`: one entry per live listing plus the most recent expired one
(so the map never silently forgets a building), each `{drop_id, food,
description, category, building_id, building_name, room, status,
total_servings, available_servings, held_servings, picked_up, pantry_held,
pantry_transferred_simulated, expires_at, expires_at_iso, updated_at,
updated_at_iso, answer}`. Same invariant. `answer` is one plain sentence,
e.g. `3 of 8 servings left`, following the pickup companion's rules.
`description` is the listing's vision note, trimmed to 160 characters.

`trend_points`: from analytics `series`, oldest first, each `{date,
servings_offered, student_pickups, pantry_transfers, expired_unclaimed}`.
Never fabricated, never extrapolated; an empty window is an empty array.

`activity_events`: from analytics `activity`, newest first, at most 12, each
`{kind, occurred_at, occurred_at_iso, food, building_name, servings,
is_simulated}`.

`agent_recommendations`: at most 6 entries of `{title, detail}`.

## Selected target

| key | type |
|---|---|
| `selected_building_id` | string or null |
| `selected_drop_id` | string or null |
| `selected_listing` | one `active_listings` entry or null |
| `selected_answer` | string or null; `whats_left` fills it |

## Agent panel

| key | type |
|---|---|
| `agent_status` | `idle` \| `thinking` \| `ready` \| `error` |
| `agent_response` | string; the actual latest agent message; empty until the paired agent writes one |
| `agent_error` | string; empty unless `agent_status` is `error` |
| `agent_updated_at` | display time, America/New_York |
| `agent_updated_at_iso` | UTC ISO of the same moment |

`campus_center.py` never writes `agent_response` or recommendation content.
Only the paired agent does, through `--respond` and `--recommend`, which
validate and bound the text. The page ships no canned agent text: empty until
patched, a visible waiting state after `analyze_remaining_food` or
`show_recommendations` is sent, and the last agent message stays visible
after `dismiss_recommendations`.

## Dataset label (so sample data is never mistaken for app data)

| key | type |
|---|---|
| `dataset_label` | e.g. `Current app data` / `Recording dataset` |
| `dataset_is_simulated` | boolean |

## Freshness and failure

| key | rules |
|---|---|
| `checked_at`, `checked_at_iso` | stamped on every patch |
| `ok` | `true` only when data came from Owl Plate just now |
| `error` | empty when `ok`; otherwise one plain sentence |

On any fetch failure only `page_id`, freshness, `ok` and `error` are patched,
so the page keeps its last good campus, selection and agent panel.

## Privacy

Never in state: student names or nicknames, per-student status, photos or
photo URLs, push tokens, host notes, credentials, priority or diet data. The
helpers' synthetic demo bearers stay inside the helpers.

## Disclosures the page must carry

- Building footprints are stylized illustrative geometry; positions come from
  the verified campus coordinates. One concise visible line says so.
- Pantry transfers stay labeled `(simulated)`; the dataset label stays visible.
- The header carries no `Demo` pill.
- The policy disclosure line is preserved, e.g. `Pantry transfers are
  simulated · not a KSU CARE acceptance or catering approval`, linking the
  two official KSU pages (CARE Services and catering policies).
