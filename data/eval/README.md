# Vision eval set (`data/eval/`)

Measures how accurate the AI vision step really is, so the team can put honest
numbers on the "how it works" slide (`docs/DATA.md` section 4: "Do not round up").

**Current status: synthetic known-answer fixtures only.** No real photos have been
labeled yet (`TODO(team)` per `docs/HANDOFF.md` question 4). Until human-labeled
real photos are scored against live Gemini, nothing here may be cited as
measured model accuracy — the runner enforces this by labeling every report.

## Layout

```
data/eval/
  README.md            this spec (the gold-label JSON format lives here)
  run.py               CLI entrypoint (standard library only, no deps)
  gold.py              gold-label loading and validation
  estimate.py          mirror of the frozen VisionEstimate contract
  predictions.py       predictions-file loading and validation
  metrics.py           pure scoring math with explicit denominators
  report.py            text and JSON report rendering with honesty labels
  gemini_live.py       opt-in live Gemini adapter (env credentials, never printed)
  fixtures/
    samples.json       synthetic gold labels (clearly labeled as synthetic)
    predictions.json   synthetic predictions in the frozen shape
  tests/               known-answer tests (python3 -m unittest)
```

## Gold-label JSON format

Gold = the truth for one photo: servings counted by hand and allergens confirmed
from the packaging or menu. One JSON document is either a single sample, a
`{"samples": [...]}` list, or a directory of per-sample `.json` files.

```json
{
  "sample_id": "pizza-tray-01",
  "photo": "photos/pizza-tray-01.jpg",
  "labels": {
    "source": "human",
    "labeled_by": "johaan",
    "labeled_at": "2026-11-19T21:00:00Z",
    "servings": 8,
    "allergens_present": ["dairy", "gluten"],
    "items": [{"name": "cheese pizza", "portion_unit": "slice", "count": 14}]
  }
}
```

Rules (validated by `gold.py`, bad labels fail loudly):

| Field | Required | Rules |
|---|---|---|
| `sample_id` | yes | non-empty string, unique across the whole gold set |
| `photo` | no | non-empty path string; required for `--live`, resolved against the gold file's directory (or `--photos DIR`), absolute paths win |
| `labels.source` | yes | `"human"` or `"synthetic"`; drives the honesty labels |
| `labels.labeled_by` | yes | non-empty string; provenance is mandatory |
| `labels.labeled_at` | no | timezone-aware ISO 8601 (UTC recommended) |
| `labels.servings` | yes | integer hand count, `>= 0` (never a float) |
| `labels.allergens_present` | yes | list drawn from the nine allergens only, no duplicates |
| `labels.items` | no | informational only, never scored; each item needs a `name` |

Unknown keys are rejected so typos cannot silently change a label.

## Predictions file format

Predictions arrive as JSON so a live run can be captured once and re-scored
offline, and so the API's vision module can hand us estimates without code
coupling. Entries carry the **frozen `VisionEstimate` shape**
(`services/api/schemas/api.py`, frozen for eval per `docs/API_CONTRACT.md`).

```json
{
  "source": "gemini",
  "model": "gemini-2.5-flash",
  "synthetic": false,
  "generated_at": "2026-11-18T00:00:00Z",
  "predictions": [
    {"sample_id": "pizza-tray-01", "vision": { ...VisionEstimate... }}
  ]
}
```

- `source`: `"fixture"`, `"gemini"` or `"external"` (default `external`). The
  report always prints it — a fixture run is never presented as live output.
- `vision`: validated against `estimate.py`, which mirrors the frozen contract
  (items 1..30, servings 1..500 with `low <= estimate <= high`, the nine
  allergens, the five diets, confidence 0..1, notes <= 1000 chars, extra fields
  forbidden). If `schemas/api.py` changes, that mirror must change in the same
  commit; `tests/test_estimate.py` fails when the two drift.
- `low_confidence_inflated`: optional boolean, set by live runs when the
  contract's confidence rule fired (see below).

## Metrics (definitions, denominators, undefined cases)

`n` = number of **evaluated** samples (a gold label plus a matching prediction).
Allergen metrics pool **all nine allergens x evaluated samples** pairs, so
`pairs = 9 x n`.

| Metric | Formula | Denominator | Undefined when |
|---|---|---|---|
| serving MAE | `(1/n) * sum(abs(servings_estimate - servings_truth))` | `n` evaluated samples | `n = 0` |
| within ±2 | `100 * count(abs error <= 2) / n` | `n` evaluated samples | `n = 0` |
| allergen recall | `TP / (TP + FN)` | gold-positive pairs = pairs where the allergen truly is in the food | `TP + FN = 0` (no gold allergens at all) |
| allergen false positive rate | `FP / (FP + TN)` | gold-negative pairs = `9n - (TP + FN)` | `FP + TN = 0` (every pair gold-positive) |

- TP: allergen present in gold and flagged. FN: present, not flagged.
  FP: absent but flagged. TN: absent, not flagged.
- Sample counts reported on every run: gold total, evaluated, missing
  predictions, live failures, unmatched predictions.
- Every allergen display carries the contract notice:
  **may contain, confirm with host**.

## CLI

```bash
# Score the bundled synthetic known-answer fixture (offline, no network)
python3 data/eval/run.py --fixtures

# Machine-readable output (identical numbers, full precision)
python3 data/eval/run.py --fixtures --json

# Score any predictions file against gold labels (offline)
python3 data/eval/run.py --gold data/eval/gold/ --predictions run-2026-11-19.json

# Opt-in live mode: Gemini estimates the gold photos, then we score.
# Credentials come from GEMINI_API_KEY / GEMINI_MODEL (env or repo .env),
# are never printed, and the run is labeled "gemini".
python3 data/eval/run.py --live --gold data/eval/gold/ \
  --photos data/eval/photos --save-predictions run-2026-11-19.json
```

Exit codes: `0` clean run (every gold sample evaluated, no live failures),
`1` problems (bad input files, missing predictions, live failures, nothing
evaluated), `2` CLI usage error.

Suggested `make eval` wiring for the integrator (the root `Makefile` is
manager-owned, so it is not created here):

```make
eval:
	python3 data/eval/run.py --fixtures
```

### Live mode details

- Explicit opt-in only (`--live`); the only code path that touches the network.
- `GEMINI_API_KEY` and `GEMINI_MODEL` are read from the environment or the
  repo `.env` file (existing environment values win). Values are never printed,
  logged, or written to saved files; error messages only name missing keys.
- Photos: jpeg/png/webp, max 10 MiB (the API contract upload cap).
- Gemini is asked for the frozen shape with a strict response schema, and the
  answer is re-validated locally. Per `docs/API_CONTRACT.md`, the live adapter
  applies the contract safety rule *confidence < 0.6 adds all nine common
  allergens* (marked `low_confidence_inflated`), so scored estimates match what
  a host would actually see. Vision never outputs halal/kosher/pork_free tags;
  the response schema only allows vegetarian and vegan.
- `--save-predictions FILE` persists the estimates so the same run can be
  re-scored deterministically offline with `--predictions FILE`. Live runs
  themselves are network-dependent and therefore not bit-reproducible; the
  saved file is.

## Tests

```bash
python3 -m unittest discover -s data/eval -p "test_*.py"
```

Known-answer tests hand-compute every metric (including the undefined cases)
and pin the bundled fixture aggregates, so the scoring math cannot silently
regress. `pytest data/eval` also works.

## Adding the real eval set (team TODO, blocks pitch numbers)

Per `docs/DATA.md` section 4, collect 20 to 30 photos of real food setups
(pizza boxes, sandwich platters, cookie trays, wraps, fruit, mixed tables).
Food only, no people (`docs/PRIVACY_SAFETY.md`).

1. Add photos and one gold JSON per photo with `source: "human"`,
   hand-counted `servings`, and allergens from the packaging or menu.
2. Run `--live` with credentials in `.env` and `--save-predictions`.
3. Re-score offline from the saved file; sanity-check the numbers.
4. Put the real numbers on the "how it works" slide with the sample size
   ("n = 24"), unrounded, and keep "may contain, confirm with host" on every
   allergen display.

Photos are large binaries; whether to commit them is a team decision (this
directory does not gitignore them). No student data, no people, no secrets
ever belong in `data/eval/`.
