"""Tests for report rendering: labels, denominators and honesty claims."""

import unittest

from metrics import score_allergens, score_servings
from report import (
    ALLERGEN_NOTICE,
    EvalBundle,
    SampleRow,
    measured_claim_support,
    render_json,
    render_text,
)


def make_row(sample_id: str = "s1", gold: int = 8, est: int = 7, gold_flags=("dairy",),
             pred_flags=("dairy",), low_confidence_inflated: bool = False) -> SampleRow:
    error = abs(est - gold)
    return SampleRow(
        sample_id=sample_id,
        gold_servings=gold,
        estimated_servings=est,
        abs_error=error,
        within_2=error <= 2,
        gold_allergens=tuple(gold_flags),
        predicted_allergens=tuple(pred_flags),
        low_confidence_inflated=low_confidence_inflated,
    )


def make_bundle(rows, gold_sources=("synthetic",), source="fixture", synthetic=True,
                missing=0, failures=()) -> EvalBundle:
    servings = score_servings([(row.gold_servings, row.estimated_servings) for row in rows])
    allergens = score_allergens(
        [(set(row.gold_allergens), set(row.predicted_allergens)) for row in rows]
    )
    return EvalBundle(
        run_at="2026-11-18T00:00:00Z",
        run_mode="fixtures",
        prediction_source=source,
        prediction_model=None,
        prediction_synthetic=synthetic,
        gold_sources=gold_sources,
        counts_gold=max(len(rows) + missing, 1),
        counts_evaluated=len(rows),
        counts_missing=missing,
        failures=tuple(failures),
        unmatched=(),
        rows=tuple(rows),
        servings=servings,
        allergens=allergens,
        measured_claim=measured_claim_support(tuple(gold_sources), source, len(rows)),
    )


class MeasuredClaimSupportTest(unittest.TestCase):
    def test_synthetic_gold_never_supports_claim(self) -> None:
        claim = measured_claim_support(("synthetic",), "gemini", 4)
        self.assertFalse(claim.supported)
        self.assertIn("non-human", claim.reason)

    def test_non_live_predictions_never_support_claim(self) -> None:
        claim = measured_claim_support(("human",), "fixture", 4)
        self.assertFalse(claim.supported)
        self.assertIn("did not come from live Gemini", claim.reason)

    def test_no_samples_never_supports_claim(self) -> None:
        claim = measured_claim_support(("human",), "gemini", 0)
        self.assertFalse(claim.supported)
        self.assertIn("no evaluated samples", claim.reason)

    def test_human_gold_plus_live_gemini_supports_claim(self) -> None:
        claim = measured_claim_support(("human",), "gemini", 24)
        self.assertTrue(claim.supported)
        self.assertIn("n = 24", claim.reason)


class RenderTextTest(unittest.TestCase):
    def test_known_answer_bundle(self) -> None:
        text = render_text(make_bundle([make_row()]))
        self.assertIn("SYNTHETIC KNOWN-ANSWER FIXTURE", text)
        self.assertIn("mean absolute error: 1.00 servings", text)
        self.assertIn("within ±2 servings: 1/1 (100.0%)", text)
        self.assertIn("recall = TP/(TP+FN): 1/1 = 1.0000", text)
        self.assertIn("denominator: 1 gold-positive (allergen, sample) pairs", text)
        self.assertIn("false positive rate = FP/(FP+TN): 0/8 = 0.0000", text)
        self.assertIn("denominator: 8 gold-negative (allergen, sample) pairs", text)
        self.assertIn(ALLERGEN_NOTICE, text)
        self.assertIn("NOT SUPPORTED", text)

    def test_undefined_metrics_stated(self) -> None:
        text = render_text(make_bundle([]))
        self.assertIn("mean absolute error: undefined (no evaluated samples)", text)
        self.assertIn("recall = TP/(TP+FN): undefined (TP+FN = 0)", text)
        self.assertIn("false positive rate = FP/(FP+TN): undefined (FP+TN = 0)", text)

    def test_supported_claim_rendered(self) -> None:
        bundle = make_bundle(
            [make_row()], gold_sources=("human",), source="gemini", synthetic=False
        )
        text = render_text(bundle)
        self.assertIn("MEASURED-ACCURACY CLAIM: SUPPORTED", text)
        self.assertNotIn("SYNTHETIC KNOWN-ANSWER FIXTURE", text)

    def test_failures_listed(self) -> None:
        bundle = make_bundle([], failures=(("s1", "photo not found"),))
        self.assertIn("LIVE FAILURES (1)", render_text(bundle))
        self.assertIn("s1: photo not found", render_text(bundle))

    def test_per_sample_row_and_low_confidence_marker(self) -> None:
        row = make_row(low_confidence_inflated=True)
        text = render_text(make_bundle([row]))
        self.assertIn("s1", text)
        self.assertIn("[all nine flagged: low confidence]", text)


class RenderJsonTest(unittest.TestCase):
    def test_known_answer_bundle(self) -> None:
        doc = render_json(make_bundle([make_row()]))
        self.assertEqual(doc["servings"]["mae"], 1.0)
        self.assertEqual(doc["servings"]["within_2_pct"], 100.0)
        self.assertEqual(doc["allergens"]["recall"], 1.0)
        self.assertEqual(doc["allergens"]["gold_positive_pairs"], 1)
        self.assertEqual(doc["allergens"]["gold_negative_pairs"], 8)
        self.assertEqual(doc["allergen_notice"], ALLERGEN_NOTICE)
        self.assertFalse(doc["measured_claim"]["supported"])
        self.assertEqual(doc["per_sample"][0]["sample_id"], "s1")

    def test_undefined_metrics_are_null(self) -> None:
        doc = render_json(make_bundle([]))
        self.assertIsNone(doc["servings"]["mae"])
        self.assertIsNone(doc["allergens"]["recall"])
        self.assertIsNone(doc["allergens"]["fpr"])
        self.assertEqual(doc["counts"]["evaluated"], 0)


if __name__ == "__main__":
    unittest.main()
