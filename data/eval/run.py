"""CLI entrypoint for the Owl Plate vision eval harness (standard library only).

Three modes, all documented in data/eval/README.md:
  --fixtures                      score the bundled synthetic known-answer fixture
  --predictions FILE --gold PATH  score a predictions file against gold labels
  --live --gold PATH             estimate the gold photos with Gemini (env key
                                  and model), then score

Fixture runs are labeled SYNTHETIC and can never be reported as measured
accuracy; docs/DATA.md section 4 is the honest-numbers rule this enforces.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from gemini_live import LiveConfigError, LiveRequest, live_estimates, require_live_env
from gold import GoldError, GoldSample, load_gold
from metrics import NINE_ALLERGENS, score_allergens, score_servings
from predictions import Prediction, PredictionsError, load_predictions
from report import (
    EvalBundle,
    SampleRow,
    measured_claim_support,
    render_json,
    render_text,
)

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def main(argv: Sequence[str] | None = None) -> int:
    """Run one eval and return the process exit code (see README.md)."""
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    _validate_cli(parser, args)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    log = logging.getLogger("eval")
    try:
        if args.fixtures:
            return _run_fixtures(args)
        if args.live:
            return _run_live(args, log)
        return _run_predictions(args)
    except (GoldError, PredictionsError, LiveConfigError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _build_parser() -> argparse.ArgumentParser:
    """Define the CLI; the mode flags are mutually exclusive by design."""
    parser = argparse.ArgumentParser(
        prog="python3 data/eval/run.py",
        description="Score Owl Plate vision estimates against gold labels.",
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--fixtures",
        action="store_true",
        help="score the bundled synthetic known-answer fixture",
    )
    modes.add_argument(
        "--predictions",
        metavar="FILE",
        help="score a predictions file (requires --gold)",
    )
    modes.add_argument(
        "--live",
        action="store_true",
        help="call Gemini on gold photos using env credentials (requires --gold)",
    )
    parser.add_argument(
        "--gold",
        metavar="PATH",
        help="gold labels: a JSON file or a directory of JSON files",
    )
    parser.add_argument(
        "--photos",
        metavar="DIR",
        help="directory prefix for photo paths in gold labels "
        "(default: the gold file's directory; --live only)",
    )
    parser.add_argument(
        "--save-predictions",
        metavar="FILE",
        help="with --live: save the estimates for offline re-scoring",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="print the report as JSON instead of text",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="log progress to stderr",
    )
    return parser


def _validate_cli(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    """Enforce mode rules so every invocation is unambiguous about its inputs."""
    if not (args.fixtures or args.predictions or args.live):
        parser.error("choose a mode: --fixtures, --predictions FILE or --live")
    if args.fixtures and (args.gold or args.photos or args.save_predictions):
        parser.error("--fixtures uses the bundled fixture files and takes no path arguments")
    if (args.predictions or args.live) and not args.gold:
        parser.error("--gold is required with --predictions and --live")
    if args.save_predictions and not args.live:
        parser.error("--save-predictions is only valid with --live")
    if args.photos and not args.live:
        parser.error("--photos is only valid with --live")


def _run_fixtures(args: argparse.Namespace) -> int:
    """Score the bundled synthetic fixture: the harness's known-answer self-check."""
    gold = load_gold(FIXTURES_DIR / "samples.json")
    predictions = load_predictions(FIXTURES_DIR / "predictions.json")
    return _report(
        args,
        gold=gold,
        predictions=list(predictions.entries),
        source=predictions.source,
        model=predictions.model,
        synthetic=predictions.synthetic,
        mode="fixtures",
    )


def _run_predictions(args: argparse.Namespace) -> int:
    """Score a user-supplied predictions file against user-supplied gold labels."""
    gold = load_gold(args.gold)
    predictions = load_predictions(args.predictions)
    return _report(
        args,
        gold=gold,
        predictions=list(predictions.entries),
        source=predictions.source,
        model=predictions.model,
        synthetic=predictions.synthetic,
        mode="predictions",
    )


def _run_live(args: argparse.Namespace, log: logging.Logger) -> int:
    """Estimate gold photos with Gemini, then score the same as any other run."""
    gold = load_gold(args.gold)
    api_key, model = require_live_env()
    gold_path = Path(args.gold)
    gold_root = gold_path.resolve().parent if gold_path.is_file() else gold_path.resolve()
    photos_dir = Path(args.photos).resolve() if args.photos else None
    failures: list[tuple[str, str]] = []
    requests: list[LiveRequest] = []
    for sample in gold:
        if not sample.photo:
            failures.append(
                (sample.sample_id, "gold label has no photo path; live mode needs photos")
            )
            continue
        requests.append(
            LiveRequest(sample.sample_id, _resolve_photo(sample.photo, gold_root, photos_dir))
        )
    results = live_estimates(requests, api_key, model, log=log)
    for result in results:
        if result.error:
            failures.append((result.sample_id, result.error))
    predictions = [
        Prediction(result.sample_id, result.vision, result.low_confidence_inflated)
        for result in results
        if result.vision is not None
    ]
    log.info("live run: %d estimates, %d failures", len(predictions), len(failures))
    if args.save_predictions:
        _save_predictions(Path(args.save_predictions), predictions, model)
    return _report(
        args,
        gold=gold,
        predictions=predictions,
        source="gemini",
        model=model,
        synthetic=False,
        mode="live",
        failures=tuple(failures),
    )


def _report(
    args: argparse.Namespace,
    *,
    gold: list[GoldSample],
    predictions: list[Prediction],
    source: str,
    model: str | None,
    synthetic: bool | None,
    mode: str,
    failures: tuple[tuple[str, str], ...] = (),
) -> int:
    """Match gold to predictions, score, print the report, pick the exit code."""
    if not gold:
        print("error: no gold samples found", file=sys.stderr)
        return 1
    by_id = {prediction.sample_id: prediction for prediction in predictions}
    rows: list[SampleRow] = []
    missing: list[str] = []
    for sample in sorted(gold, key=lambda item: item.sample_id):
        prediction = by_id.get(sample.sample_id)
        if prediction is None:
            missing.append(sample.sample_id)
            continue
        error = abs(prediction.vision["servings_estimate"] - sample.servings)
        rows.append(
            SampleRow(
                sample_id=sample.sample_id,
                gold_servings=sample.servings,
                estimated_servings=prediction.vision["servings_estimate"],
                abs_error=error,
                within_2=error <= 2,
                gold_allergens=_ordered_allergens(sample.allergens),
                predicted_allergens=_ordered_allergens(
                    frozenset(prediction.vision["allergens_likely"])
                ),
                low_confidence_inflated=prediction.low_confidence_inflated,
            )
        )
    unmatched = tuple(sorted(set(by_id) - {sample.sample_id for sample in gold}))
    if unmatched:
        print(
            f"warning: {len(unmatched)} prediction(s) have no gold sample: {', '.join(unmatched)}",
            file=sys.stderr,
        )
    servings = score_servings([(row.gold_servings, row.estimated_servings) for row in rows])
    allergens = score_allergens([(row.gold_allergens, row.predicted_allergens) for row in rows])
    gold_sources = tuple(sorted({sample.source for sample in gold}))
    bundle = EvalBundle(
        run_at=_utc_now(),
        run_mode=mode,
        prediction_source=source,
        prediction_model=model,
        prediction_synthetic=synthetic,
        gold_sources=gold_sources,
        counts_gold=len(gold),
        counts_evaluated=len(rows),
        counts_missing=len(missing),
        failures=failures,
        unmatched=unmatched,
        rows=tuple(rows),
        servings=servings,
        allergens=allergens,
        measured_claim=measured_claim_support(
            gold_sources, source, len(rows), prediction_synthetic=synthetic
        ),
    )
    if args.json:
        print(json.dumps(render_json(bundle), indent=2))
    else:
        print(render_text(bundle))
    problems = bool(missing) or bool(failures) or not rows
    return 1 if problems else 0


def _resolve_photo(photo: str, gold_root: Path, photos_dir: Path | None) -> Path:
    """Resolve a gold photo path: absolute wins, else --photos prefix, else gold root."""
    candidate = Path(photo)
    if candidate.is_absolute():
        return candidate
    if photos_dir is not None:
        return photos_dir / candidate
    return gold_root / candidate


def _save_predictions(path: Path, predictions: list[Prediction], model: str) -> None:
    """Persist live estimates so the run can be re-scored offline later."""
    doc = {
        "source": "gemini",
        "model": model,
        "synthetic": False,
        "generated_at": _utc_now(),
        "predictions": [
            {
                "sample_id": prediction.sample_id,
                "vision": prediction.vision,
                **({"low_confidence_inflated": True} if prediction.low_confidence_inflated else {}),
            }
            for prediction in predictions
        ],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(f"saved {len(predictions)} live predictions to {path}", file=sys.stderr)


def _ordered_allergens(flags: frozenset[str]) -> tuple[str, ...]:
    """Show allergens in canonical order so reports stay diff-able."""
    return tuple(allergen for allergen in NINE_ALLERGENS if allergen in flags)


def _utc_now() -> str:
    """Timestamp for report headers; the scores never depend on it."""
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
