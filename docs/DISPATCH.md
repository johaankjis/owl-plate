# DISPATCH.md

The matching engine. This is the heart of Owl Plate and the part judges will ask about. Lives in `services/api/dispatch/`, pure Python, no I/O.

## Goal

Get every serving to a student who can safely eat it, can reach it in time, and is most likely to need it, while pinging as few people as possible and never revealing who was prioritized.

## Inputs

```python
@dataclass(frozen=True)
class DropView:
    drop_id: str
    origin_cell: str          # H3 res 11
    servings_remaining: int
    allergens: frozenset[str] # final, after host review
    diet_tags: frozenset[str]
    expires_at: datetime

@dataclass(frozen=True)
class CandidateView:
    student_id: str
    cell: str | None          # current presence cell, None if unknown
    allergens: frozenset[str] # student's declared allergens
    diets: frozenset[str]     # student's required diets, e.g. {"vegetarian"}
    priority: bool            # CARE tier, never exposed outside the engine
    claims_last_7d: int
    invites_last_7d: int
    ignored_last_7d: int      # invites that expired without response
    already_invited: bool     # for this drop
```

## Step 1: hard filters (never ranked away, always excluded)

A candidate is ineligible if any of these hold:
* `allergens & drop.allergens` is not empty
* candidate requires a diet the drop is not tagged with (a vegetarian student only gets drops tagged vegetarian)
* no presence cell, or presence outside the current ring
* already invited to this drop
* has an active held claim on another drop
* alerts paused or quiet hours

Each exclusion records a reason code (`allergen_conflict`, `diet_mismatch`, `out_of_range`, ...). The demo screen shows these.

## Step 2: ranking

For eligible candidates, compute a score. Higher is invited first.

```
distance_term = 1 - (grid_distance(origin, cell) / (ring_k + 1))   # 0..1
priority_term = 1 if priority else 0
fairness_term = 1 / (1 + claims_last_7d)                            # spread food around
reliability   = 1 / (1 + ignored_last_7d)                           # people who respond

score = 0.40 * priority_term
      + 0.30 * distance_term
      + 0.20 * fairness_term
      + 0.10 * reliability
      + tiny random jitter (seeded by drop_id) to break ties
```

Weights live in `dispatch/config.py`. Priority is the largest single term but does not override everything: a CARE student five buildings away does not beat everyone next door when food expires in ten minutes. Tests lock in this behavior.

## Step 3: wave sizing

We do not invite everyone. We invite enough to fill the servings given that some people will not respond.

```
expected_show_rate r   default 0.6, later learned per campus and time of day
invite_count = ceil(servings_remaining / r), capped at eligible count
```

## Step 4: waves and rings

```
wave 1: ring_k = 2   (roughly same building and neighbors)
wave n: ring_k grows by 2 each wave, max ring_k = 12
timeout: fixed v1 value (90 seconds in production, 60 seconds in demo)
```

Every scheduler tick (10 s):
1. Expire invites past their timeout with no response.
2. Release claims past `held_until` (default 10 min) back to the pool.
3. If servings remain and the drop is live, plan the next wave with a wider ring.
4. Stop when servings run out, the drop expires, or the max ring is reached. Then mark the drop `claimed_out` or `expired`.

## Claims

* "I'm coming" creates a held claim for 10 minutes and decrements `servings_remaining`.
* "Can't make it" frees the spot instantly and lets the next tick fill it.
* If claims exceed servings because of a race, the latest claim gets a polite "just missed it" and the student keeps fairness credit.

## Output

```python
@dataclass(frozen=True)
class WavePlan:
    ring_k: int
    invites: list[tuple[str, list[str]]]   # (student_id, reason_codes)
    excluded: list[tuple[str, str]]        # (student_id, reason_code)
```

Reason codes for invited students are generic and safe to show on the demo screen: `nearby`, `diet_match`, `fair_share`. The priority signal maps to the same generic `fair_share` code outside admin views so nobody can infer CARE status from the dispatch screen.

## Meal swipes (stretch, same engine)

A swipe offer is a drop with `servings_remaining = count`, no allergens, no location ring (dining hall is fixed), and a longer expiry. Requests act as presence. Redemption flow depends on KSU Dining policy, see `DOMAIN.md` TODO(verify).

## Required tests

* allergen conflict always excluded, even for priority students
* diet requirement enforced
* invite count equals ceil(servings / r) capped by eligible
* priority student ranks above an equal non priority student
* far priority student does not beat many close students when ring is small
* expired invites trigger a new wave with a larger ring
* declined invite frees a serving immediately
* no output field exposes `priority`
