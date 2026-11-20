# Milestone 5 — Operations & Impact Dashboard

Baseline: `6fdd96b983f41723229eb02b667eb160604ea402`.
Final branch: `feature/impact-dashboard`. Local only; no push, deployment or main merge.

## Product behavior

`/dispatch` and `/impact` share Food Rescue Analytics. The historical projector,
verified H3 aggregate map, seeded personas and rehearsal controls remain under
`/admin/projector`, linked from `/admin`. Normal navigation says Analytics.
The pantry workspace groups incoming requests, accepted requests and completed
simulated handoffs, with scoped food photos and policy acknowledgment at actions.

Analytics derives counts from persisted campus-feed records and uses the same
expire-first inventory ledger as reservations and pantry allocations. Drafts and
seeded-wave rehearsals are excluded. No student identities appear in responses.
The publication cohort follows Today, Last 7 days or All time in America/New_York.
Series uses stored event dates, not publication dates substituted for collection.
Missing legacy completion timestamps are disclosed rather than fabricated.

Inventory reconciles published servings into available, student reserved, student
pickups, pantry reserved, simulated pantry transfers and expired unclaimed.
Reservations, releases and pending pantry requests never count as recovered food.
Student recovery uses student pickups / published servings. Combined demonstration
recovery adds explicitly simulated pantry transfers. Both rates are zero-safe.
Participating students means distinct student sessions that successfully reserved
selected listings, including later released or expired reservations; it does not
assert unique people. Average reservation delay includes each successfully created
claim once, including released/expired claims. Hosts are distinct publishing owners.

Estimated meal value and recovered food weight are illustrative calculations, not
measured financial savings or food-waste reduction. Server defaults are configurable
with `OWL_ESTIMATED_MEAL_VALUE_USD` (5) and
`OWL_ESTIMATED_FOOD_KG_PER_SERVING` (0.35). The dashboard shows the assumptions and
allows temporary what-if adjustments. Recovery estimates include simulated pantry
transfers explicitly. These assumptions are not KSU measurements.

## Recording dataset

Start an isolated fixture/log runtime from the verified worktree:

```bash
NEXT_PUBLIC_IT_COMPANION_BASE_URL=http://127.0.0.1:9 PYTHONPATH=. \
  /home/node/projects/owl-plate/.venv/bin/python -m scripts.present \
  --port 3027 --api-port 8027 --vision fixture --notifications simulated --rebuild
```

In another terminal in that same checkout, explicitly replace only its demo records:

```bash
PYTHONPATH=. /home/node/projects/owl-plate/.venv/bin/python \
  -m scripts.load_recording_dataset --confirm-replace-demo-data
```

The command rejects live ports and verifies fixture vision plus simulated push.
The backend independently checks role, demo gates, provider configuration and
explicit confirmation. The dashboard also offers an unchecked confirmation in
recording-capable runtimes. GET never seeds data. Sample activity is persisted,
deterministic relative to its manifest anchor, and prominently labeled simulated.
It must never be described as real campus deployment results. Ordinary demo reset
clears the sample marker; the reset tools are in `/admin/projector`.

## Manual acceptance walkthrough

1. Start isolated fixture/log mode and reset to Visitors in `/admin/projector`.
2. Open `/dispatch` and confirm the empty dashboard.
3. In `/host`, upload a food-only photograph, review the recognition estimate,
   set 3 servings, select a verified building and room, complete safety assertions,
   and publish. Confirm that the listing photo and available count appear.
4. Join as one student, search food or building, open food details and reserve.
   Check the walking directions and hold countdown. Submit a pickup photograph,
   then explicitly confirm pickup. Repeat with a second student session.
5. In the host workspace request a pantry referral for the remaining serving,
   after reading and acknowledging the policy notice. Pending allocates no stock.
6. In `/pantry`, review pickup/safety information, acknowledge the simulation and
   policy, and accept one serving. Back in the host workspace explicitly confirm
   the simulated handoff. Coordinator acceptance alone never marks a transfer.
7. Without reloading `/dispatch`, verify Published 3, Student pickups 2, Simulated
   pantry transfers 1, Available 0, Student reserved 0 and Pantry reserved 0.
   Student recovery is 66.7%; combined demonstration recovery is 100%.
8. Switch Today / Last 7 days / All time. Load the optional recording dataset using
   explicit confirmation and inspect charts, active listings and recent activity.
9. Check `/impact`, the pantry portal and theme controls on mobile and desktop.

## Verification and source binding

Pending integration verification and independent exact-commit review. This section
will be replaced with actual results before the final handoff.

Physical push receipt, physical pickup, physical pantry transfer, independently
measured live-model accuracy and a paired It device remain unverified. Synthetic
fixture and browser checks do not establish those claims.
