"""Rendering of eval reports, text and JSON, with honesty labels built in.

Every report states where predictions came from, whether the gold labels are
human or synthetic, the denominator behind each metric, and which metrics are
undefined. That is the difference between an accuracy number and a claim the
team can stand behind at the pitch (docs/DATA.md section 4: "Do not round up").
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from metrics import AllergenScore, ServingScore

ALLERGEN_NOTICE = "may contain, confirm with host"
"""Contract-mandated notice: allergen flags are estimates, never guarantees."""


@dataclass(frozen=True)
class SampleRow:
    """One evaluated sample with both truth and estimate, for display."""

    sample_id: str
    gold_servings: int
    estimated_servings: int
    abs_error: int
    within_2: bool
    gold_allergens: tuple[str, ...]
    predicted_allergens: tuple[str, ...]
    low_confidence_inflated: bool = False


@dataclass(frozen=True)
class MeasuredClaim:
    """Whether this run's numbers may be quoted as measured accuracy."""

    supported: bool
    reason: str


@dataclass(frozen=True)
class EvalBundle:
    """Everything a report needs; assembled by run.py, rendered here."""

    run_at: str
    run_mode: str
    prediction_source: str
    prediction_model: str | None
    prediction_synthetic: bool | None
    gold_sources: tuple[str, ...]
    counts_gold: int
    counts_evaluated: int
    counts_missing: int
    failures: tuple[tuple[str, str], ...]
    unmatched: tuple[str, ...]
    rows: tuple[SampleRow, ...]
    servings: ServingScore
    allergens: AllergenScore
    measured_claim: MeasuredClaim


def measured_claim_support(
    gold_sources: tuple[str, ...],
    prediction_source: str,
    evaluated: int,
    *,
    prediction_synthetic: bool | None = None,
) -> MeasuredClaim:
    """Decide whether this run's numbers may be quoted as measured accuracy.

    Only human-labeled real photos scored against live Gemini support that
    claim; anything else validates the harness only. Synthetic fixtures can
    never become pitch numbers, so the reason is printed next to every report.
    """
    reasons: list[str] = []
    if evaluated == 0:
        reasons.append("no evaluated samples")
    if prediction_synthetic:
        reasons.append("predictions are labeled synthetic")
    if not gold_sources:
        reasons.append("no human gold provenance")
    non_human = sorted(set(gold_sources) - {"human"})
    if non_human:
        reasons.append("gold labels include non-human sources: " + ", ".join(non_human))
    if prediction_source != "gemini":
        reasons.append(f"predictions did not come from live Gemini (source: {prediction_source})")
    if reasons:
        return MeasuredClaim(False, "; ".join(reasons))
    return MeasuredClaim(True, f"human-labeled photos scored against live Gemini, n = {evaluated}")


def render_text(bundle: EvalBundle) -> str:
    """Render the human-readable report with labels, denominators, warnings."""
    lines: list[str] = []
    add = lines.append
    add("=" * 78)
    add("Owl Plate vision eval")
    add(f"Run at: {bundle.run_at} (scores depend only on the inputs, not the clock)")
    model_note = f", model: {bundle.prediction_model}" if bundle.prediction_model else ""
    synthetic_note = " [synthetic]" if bundle.prediction_synthetic else ""
    add(
        f"Mode: {bundle.run_mode} | predictions: {bundle.prediction_source}{model_note}"
        f"{synthetic_note} | gold labels: {', '.join(bundle.gold_sources) or 'none'}"
    )
    add("=" * 78)
    if _is_synthetic_run(bundle):
        add("*** SYNTHETIC KNOWN-ANSWER FIXTURE - these numbers validate the")
        add("*** scoring harness only. They are NOT model accuracy. Do not cite")
        add("*** them in slides, the demo or the docs.")
        add("")
    add(
        f"Sample counts: {bundle.counts_gold} gold, {bundle.counts_evaluated} evaluated, "
        f"{bundle.counts_missing} missing predictions, {len(bundle.failures)} live failures"
    )
    if bundle.unmatched:
        add(f"Unmatched predictions (ignored): {', '.join(bundle.unmatched)}")
    add("")
    _render_servings(bundle, lines)
    _render_allergens(bundle, lines)
    _render_failures(bundle, lines)
    _render_per_sample(bundle, lines)
    _render_per_allergen(bundle, lines)
    _render_claim(bundle, lines)
    return "\n".join(lines) + "\n"


def render_json(bundle: EvalBundle) -> dict[str, Any]:
    """Render the machine-readable report: same numbers, full precision."""
    return {
        "run_at": bundle.run_at,
        "mode": bundle.run_mode,
        "prediction_source": bundle.prediction_source,
        "prediction_model": bundle.prediction_model,
        "prediction_synthetic": bundle.prediction_synthetic,
        "gold_sources": list(bundle.gold_sources),
        "allergen_notice": ALLERGEN_NOTICE,
        "measured_claim": {
            "supported": bundle.measured_claim.supported,
            "reason": bundle.measured_claim.reason,
        },
        "counts": {
            "gold": bundle.counts_gold,
            "evaluated": bundle.counts_evaluated,
            "missing_predictions": bundle.counts_missing,
            "live_failures": len(bundle.failures),
            "unmatched_predictions": list(bundle.unmatched),
        },
        "servings": {
            "n": bundle.servings.n,
            "mae": bundle.servings.mae,
            "within_2": bundle.servings.within_2,
            "within_2_pct": bundle.servings.within_2_pct,
            "denominator": "n evaluated samples (gold + prediction present)",
        },
        "allergens": {
            "pairs_total": bundle.allergens.pairs_total,
            "gold_positive_pairs": bundle.allergens.gold_positive_pairs,
            "gold_negative_pairs": bundle.allergens.gold_negative_pairs,
            "tp": bundle.allergens.tp,
            "fn": bundle.allergens.fn,
            "fp": bundle.allergens.fp,
            "tn": bundle.allergens.tn,
            "recall": bundle.allergens.recall,
            "recall_denominator": "TP + FN (gold-positive pairs)",
            "fpr": bundle.allergens.fpr,
            "fpr_denominator": "FP + TN (gold-negative pairs)",
            "per_allergen": {
                name: asdict(counts) for name, counts in bundle.allergens.per_allergen.items()
            },
        },
        "failures": [
            {"sample_id": sample_id, "reason": reason} for sample_id, reason in bundle.failures
        ],
        "per_sample": [
            {
                "sample_id": row.sample_id,
                "gold_servings": row.gold_servings,
                "estimated_servings": row.estimated_servings,
                "abs_error": row.abs_error,
                "within_2": row.within_2,
                "gold_allergens": list(row.gold_allergens),
                "predicted_allergens": list(row.predicted_allergens),
                "low_confidence_inflated": row.low_confidence_inflated,
            }
            for row in bundle.rows
        ],
    }


def _is_synthetic_run(bundle: EvalBundle) -> bool:
    """A run is synthetic when any truth or estimate came from a fixture."""
    return bool(bundle.prediction_synthetic) or bool(set(bundle.gold_sources) - {"human"})


def _render_servings(bundle: EvalBundle, lines: list[str]) -> None:
    score = bundle.servings
    lines.append(
        f"SERVINGS (denominator: {score.n} evaluated samples, each with gold + prediction)"
    )
    if score.n == 0:
        lines.append("  mean absolute error: undefined (no evaluated samples)")
        lines.append("  within ±2 servings: undefined (no evaluated samples)")
    else:
        lines.append(f"  mean absolute error: {score.mae:.2f} servings")
        lines.append(
            f"  within ±2 servings: {score.within_2}/{score.n} ({score.within_2_pct:.1f}%)"
        )
    lines.append("")


def _render_allergens(bundle: EvalBundle, lines: list[str]) -> None:
    score = bundle.allergens
    lines.append("ALLERGENS (pooled over all nine allergens x evaluated samples)")
    lines.append(
        f"  recall = TP/(TP+FN): "
        f"{_ratio(score.tp, score.gold_positive_pairs, score.recall, 'TP+FN')}"
    )
    lines.append(
        f"    denominator: {score.gold_positive_pairs} gold-positive (allergen, sample) pairs"
    )
    lines.append(
        f"  false positive rate = FP/(FP+TN): "
        f"{_ratio(score.fp, score.gold_negative_pairs, score.fpr, 'FP+TN')}"
    )
    lines.append(
        f"    denominator: {score.gold_negative_pairs} gold-negative (allergen, sample) pairs"
    )
    lines.append(f"  confusion counts: TP {score.tp}, FN {score.fn}, FP {score.fp}, TN {score.tn}")
    lines.append(f"  Allergen flags are estimates: {ALLERGEN_NOTICE}.")
    lines.append("")


def _render_failures(bundle: EvalBundle, lines: list[str]) -> None:
    if not bundle.failures:
        return
    lines.append(f"LIVE FAILURES ({len(bundle.failures)})")
    for sample_id, reason in bundle.failures:
        lines.append(f"  {sample_id}: {reason}")
    lines.append("")


def _render_per_sample(bundle: EvalBundle, lines: list[str]) -> None:
    if not bundle.rows:
        return
    id_width = max(len("sample_id"), *(len(row.sample_id) for row in bundle.rows))
    gold_width, predicted_width = 22, 28
    lines.append("PER SAMPLE")
    lines.append(
        f"  {'sample_id'.ljust(id_width)}  gold  est  |err|  ±2   "
        f"{'gold allergens'.ljust(gold_width)}predicted allergens"
    )
    for row in bundle.rows:
        within = "yes" if row.within_2 else "no"
        inflated = "  [all nine flagged: low confidence]" if row.low_confidence_inflated else ""
        gold_flags = ", ".join(row.gold_allergens) if row.gold_allergens else "(none)"
        predicted_flags = (
            ", ".join(row.predicted_allergens) if row.predicted_allergens else "(none)"
        )
        lines.append(
            f"  {row.sample_id.ljust(id_width)}  {row.gold_servings:4d}  "
            f"{row.estimated_servings:3d}"
            f"  {row.abs_error:5d}  {within:3s}  "
            f"{gold_flags.ljust(gold_width)}{predicted_flags.ljust(predicted_width)}{inflated}"
        )
    lines.append("")


def _render_per_allergen(bundle: EvalBundle, lines: list[str]) -> None:
    lines.append(f"PER ALLERGEN (over {bundle.counts_evaluated} evaluated samples)")
    lines.append("  allergen     gold+   TP   FN   FP   TN  recall  FPR")
    for allergen, counts in bundle.allergens.per_allergen.items():
        recall = f"{counts.recall:.4f}" if counts.recall is not None else "undef"
        fpr = f"{counts.fpr:.4f}" if counts.fpr is not None else "undef"
        lines.append(
            f"  {allergen.ljust(12)} {counts.gold_positive:5d} {counts.tp:4d} {counts.fn:4d}"
            f" {counts.fp:4d} {counts.tn:4d}  {recall}  {fpr}"
        )
    lines.append("  (recall undefined when the allergen never appears in gold labels;")
    lines.append("   FPR undefined when it appears in every evaluated sample)")
    lines.append("")


def _render_claim(bundle: EvalBundle, lines: list[str]) -> None:
    claim = bundle.measured_claim
    lines.append("-" * 78)
    if claim.supported:
        lines.append(f"MEASURED-ACCURACY CLAIM: SUPPORTED ({claim.reason})")
        lines.append("  Cite with the sample size, and keep every allergen display")
        lines.append(f'  labeled as an estimate: "{ALLERGEN_NOTICE}".')
    else:
        lines.append(f"MEASURED-ACCURACY CLAIM: NOT SUPPORTED ({claim.reason})")
        lines.append("  These numbers validate the scoring harness only. Do not present")
        lines.append("  them as measured model accuracy in the deck, demo or docs.")
    lines.append("-" * 78)


def _ratio(numerator: int, denominator: int, value: float | None, label: str) -> str:
    """Show the fraction behind a ratio, and undefined when its denominator is 0."""
    if denominator == 0:
        return f"undefined ({label} = 0)"
    return f"{numerator}/{denominator} = {value:.4f}"
