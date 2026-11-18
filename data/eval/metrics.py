"""Pure scoring math for the vision eval, with explicit denominators.

Every number the team might put on a slide comes from this module, so each
metric states what it is computed over and returns None instead of a number
when its denominator is zero. Keeping the module free of I/O makes the whole
harness repeatable: identical inputs always produce identical scores.

Definitions (also in data/eval/README.md):
  serving MAE      mean of |servings_estimate - servings_truth| over n samples
  within ±2        share of samples with an absolute error of at most 2
  allergen recall  TP / (TP + FN) pooled over all nine allergens x n samples
  allergen FPR     FP / (FP + TN) over the same pairs
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

NINE_ALLERGENS: tuple[str, ...] = (
    "dairy",
    "egg",
    "gluten",
    "peanut",
    "tree_nut",
    "soy",
    "fish",
    "shellfish",
    "sesame",
)


@dataclass(frozen=True)
class ServingScore:
    """Servings metrics; mae and within_2_pct are None when n == 0."""

    n: int
    mae: float | None
    within_2: int
    within_2_pct: float | None


@dataclass(frozen=True)
class AllergenCounts:
    """Confusion counts for one allergen across all evaluated samples."""

    gold_positive: int
    tp: int
    fn: int
    fp: int
    tn: int
    recall: float | None
    fpr: float | None


@dataclass(frozen=True)
class AllergenScore:
    """Pooled allergen metrics over all nine allergens x evaluated samples."""

    pairs_total: int
    gold_positive_pairs: int
    gold_negative_pairs: int
    tp: int
    fn: int
    fp: int
    tn: int
    recall: float | None
    fpr: float | None
    per_allergen: dict[str, AllergenCounts] = field(default_factory=dict)


def score_servings(pairs: Sequence[tuple[int, int]]) -> ServingScore:
    """Score servings estimates against hand-counted truth.

    The denominator is the number of (truth, estimate) pairs given, i.e.
    samples that have both a gold label and a prediction. Both ratio fields
    are None when there are no pairs so callers must say "undefined" instead
    of printing a misleading number.
    """
    errors = [abs(truth - estimate) for truth, estimate in pairs]
    n = len(errors)
    if n == 0:
        return ServingScore(n=0, mae=None, within_2=0, within_2_pct=None)
    within_2 = sum(1 for error in errors if error <= 2)
    return ServingScore(
        n=n,
        mae=sum(errors) / n,
        within_2=within_2,
        within_2_pct=100.0 * within_2 / n,
    )


def score_allergens(
    pairs: Sequence[tuple[Iterable[str], Iterable[str]]],
    allergens: Sequence[str] = NINE_ALLERGENS,
) -> AllergenScore:
    """Score allergen flags pooled over every (allergen, sample) pair.

    Each pair is one of the nine allergens on one sample: gold positive means
    the allergen truly is in the food, predicted positive means the estimate
    flags it. Recall uses the gold-positive pairs (TP + FN) as its denominator
    and the false positive rate uses the gold-negative pairs (FP + TN); either
    is None (undefined) when its denominator is zero. Duplicate flags count
    once because sets are compared.
    """
    flags = [(frozenset(gold), frozenset(predicted)) for gold, predicted in pairs]
    per_allergen: dict[str, AllergenCounts] = {}
    tp = fn = fp = tn = gold_positive_pairs = 0
    for allergen in allergens:
        allergen_gold = allergen_tp = allergen_fn = allergen_fp = allergen_tn = 0
        for gold_flags, predicted_flags in flags:
            present = allergen in gold_flags
            flagged = allergen in predicted_flags
            if present:
                allergen_gold += 1
                if flagged:
                    allergen_tp += 1
                else:
                    allergen_fn += 1
            elif flagged:
                allergen_fp += 1
            else:
                allergen_tn += 1
        per_allergen[allergen] = AllergenCounts(
            gold_positive=allergen_gold,
            tp=allergen_tp,
            fn=allergen_fn,
            fp=allergen_fp,
            tn=allergen_tn,
            recall=allergen_tp / allergen_gold if allergen_gold else None,
            fpr=allergen_fp / (allergen_fp + allergen_tn) if (allergen_fp + allergen_tn) else None,
        )
        gold_positive_pairs += allergen_gold
        tp += allergen_tp
        fn += allergen_fn
        fp += allergen_fp
        tn += allergen_tn
    pairs_total = len(flags) * len(tuple(allergens))
    gold_negative_pairs = pairs_total - gold_positive_pairs
    return AllergenScore(
        pairs_total=pairs_total,
        gold_positive_pairs=gold_positive_pairs,
        gold_negative_pairs=gold_negative_pairs,
        tp=tp,
        fn=fn,
        fp=fp,
        tn=tn,
        recall=tp / gold_positive_pairs if gold_positive_pairs else None,
        fpr=fp / gold_negative_pairs if gold_negative_pairs else None,
        per_allergen=per_allergen,
    )
