# DATA.md

All data Owl Plate needs for development, the demo and the pitch.

## 1. Seed fixture (`data/seed/demo.json`)

The committed fixture is the single source for the local demo. `make seed` runs
`scripts.demo --reset` through application routes and loads 30 synthetic students.
Every record has a deterministic UUID and `is_simulated: true`. It specifies ring
distance, allergens, required diet tags, private ranking inputs and alert consent.
There are no `buildings.yaml`, `students_sim.yaml` or `personas.yaml` artifacts.

The origin is `DEMO-ORIGIN`, at arbitrary coordinates (0, 0), explicitly marked
unverified. H3 resolution 11 cells are generated around it. These are placeholders,
not campus building locations. TODO(verify): obtain sourced building coordinates
before claiming campus geography. There is no asserted population distribution;
the fixture includes one private priority persona solely to exercise ranking.

## 2. Synthetic students

Five named personas A–E drive the repeatable story; the other 25 synthetic students
populate the map. No real student records, contact information or CARE data are
used. Public persona reasons are generic, and only simulated records may expose
per-person decision reasons. Private fixture ranking inputs stay off projector,
host and student API responses.

## 3. Demo personas

Physical phone receipt remains pending; these personas currently run in browser
contexts with demo credentials and simulated notifications.

| Persona | Fixture location | Diet / allergen | What it shows |
|---|---|---|---|
| A | Origin ring | none | Invited in wave 1; holds a serving |
| B | Origin ring | dairy allergy | Skipped for allergen, stays silent |
| C | Nearby ring | none | Invited in wave 1; invite expires in the scripted path |
| D | Outside initial ring | none | Invited after widening to ring 4 |
| E | Origin ring | vegetarian | Eligible only for a suitable vegetarian drop, subject to capacity and ranking |

## 4. Vision eval set (`data/eval/`)

We must be able to say how accurate the AI is.
* 20 to 30 photos of real food setups: pizza boxes, sandwich platters, cookie trays, wraps, fruit, mixed tables. Take them at club meetings, the dining hall, or set them up with grocery store platters.
* For each photo, a human writes `truth.json`: items, servings counted by hand, allergens from the packaging or menu.
* `make eval` reports: servings mean absolute error, percent of photos within plus or minus 2 servings, allergen recall (did we catch the allergens that were there), allergen false alarm rate.
* Put the real numbers on the "how it works" slide. Do not round up.

## 5. Survey (impact data for the rubric)

Campus impact is 25 points and must be backed by real data. Use the standalone Owl Plate `/survey` web form, with its own HTTPS link and QR code, for direct in-person sharing with KSU students after Johaan approves the final form and sharing plan. No Discord or group-channel distribution. Proposed close: Thursday evening. Preview collection stays off and actual n=0 until real responses arrive.

Questions (keep it under 2 minutes):
1. Campus you're usually on (Kennesaw, Marietta, both)
2. In the past month, how often did you skip a meal because of money or time? (never, once or twice, weekly, more)
3. Have you seen leftover food from an event get thrown away? (yes, no)
4. Have you ever heard about free leftover food too late to get any? (yes, no)
5. Do you know about KSU CARE Services pantries? (yes, no)
6. Would you turn on alerts for free food nearby? (yes, maybe, no)
7. If you host events: what usually happens to leftovers? (thrown out, taken home, posted somewhere, other)
8. Optional: anything else about food on campus

Store raw exports in `data/survey/` (gitignored if any free text could identify someone). Report counts and percentages with the sample size on the slide ("n = 47").

## 6. Market and KSU facts

Only from `docs/DOMAIN.md`.
