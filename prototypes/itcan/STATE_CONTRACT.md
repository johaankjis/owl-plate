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
all ≥ 0; otherwise the helper fails closed (no counts patched).

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
