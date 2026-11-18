"""Known-answer test for the bundled synthetic fixture set.

The fixture numbers were computed by hand and pinned here, so the shipped
fixture and the scoring math cannot drift apart:

  errors:   |8-7|=1, |12-15|=3, |18-18|=0, |10-9|=1  -> MAE 5/4 = 1.25, 3/4 within ±2
  pairs:    9 allergens x 4 samples = 36; gold-positive 6, gold-negative 30
  allergens: TP 5, FN 1 (egg missed), FP 1 (peanut false alarm), TN 29
  recall 5/6, false positive rate 1/30
"""

import unittest
from pathlib import Path

from gold import load_gold
from metrics import score_allergens, score_servings
from predictions import load_predictions
from report import measured_claim_support

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def fixture_data():
    gold = load_gold(FIXTURES_DIR / "samples.json")
    predictions = load_predictions(FIXTURES_DIR / "predictions.json")
    by_id = {prediction.sample_id: prediction for prediction in predictions.entries}
    serving_pairs = []
    allergen_pairs = []
    for sample in gold:
        prediction = by_id[sample.sample_id]
        serving_pairs.append((sample.servings, prediction.vision["servings_estimate"]))
        allergen_pairs.append(
            (sample.allergens, frozenset(prediction.vision["allergens_likely"]))
        )
    return gold, predictions, serving_pairs, allergen_pairs


class FixtureFormatTest(unittest.TestCase):
    def test_fixture_files_load_and_match(self) -> None:
        gold, predictions, _, _ = fixture_data()
        self.assertEqual(len(gold), 4)
        self.assertTrue(all(sample.source == "synthetic" for sample in gold))
        self.assertEqual(predictions.source, "fixture")
        self.assertTrue(predictions.synthetic)
        self.assertEqual(len(predictions.entries), 4)
        self.assertEqual(
            {sample.sample_id for sample in gold},
            {prediction.sample_id for prediction in predictions.entries},
        )
        self.assertTrue(all(sample.photo is None for sample in gold))

    def test_fixture_labels_carry_provenance(self) -> None:
        gold, _, _, _ = fixture_data()
        self.assertTrue(all(sample.labeled_by for sample in gold))
        self.assertTrue(all(sample.labeled_at for sample in gold))


class FixtureKnownAnswerTest(unittest.TestCase):
    def test_servings_known_answer(self) -> None:
        _, _, serving_pairs, _ = fixture_data()
        score = score_servings(serving_pairs)
        self.assertEqual(score.n, 4)
        self.assertEqual(score.mae, 1.25)
        self.assertEqual(score.within_2, 3)
        self.assertEqual(score.within_2_pct, 75.0)

    def test_allergens_known_answer(self) -> None:
        _, _, _, allergen_pairs = fixture_data()
        score = score_allergens(allergen_pairs)
        self.assertEqual(score.pairs_total, 36)
        self.assertEqual(score.gold_positive_pairs, 6)
        self.assertEqual(score.gold_negative_pairs, 30)
        self.assertEqual((score.tp, score.fn, score.fp, score.tn), (5, 1, 1, 29))
        self.assertAlmostEqual(score.recall, 5 / 6, places=12)
        self.assertAlmostEqual(score.fpr, 1 / 30, places=12)

    def test_per_allergen_known_answers(self) -> None:
        _, _, _, allergen_pairs = fixture_data()
        per = score_allergens(allergen_pairs).per_allergen
        dairy = per["dairy"]
        self.assertEqual(
            (dairy.gold_positive, dairy.tp, dairy.fn, dairy.fp, dairy.tn), (2, 2, 0, 0, 2)
        )
        self.assertEqual(dairy.recall, 1.0)
        self.assertEqual(dairy.fpr, 0.0)
        egg = per["egg"]
        self.assertEqual((egg.gold_positive, egg.tp, egg.fn), (1, 0, 1))
        self.assertEqual(egg.recall, 0.0)
        peanut = per["peanut"]
        self.assertEqual((peanut.gold_positive, peanut.fp, peanut.tn), (0, 1, 3))
        self.assertIsNone(peanut.recall)
        self.assertAlmostEqual(peanut.fpr, 1 / 4, places=12)
        sesame = per["sesame"]
        self.assertEqual((sesame.gold_positive, sesame.fp, sesame.tn), (0, 0, 4))
        self.assertIsNone(sesame.recall)
        self.assertEqual(sesame.fpr, 0.0)

    def test_fixture_claim_is_never_measured_accuracy(self) -> None:
        claim = measured_claim_support(("synthetic",), "fixture", 4)
        self.assertFalse(claim.supported)
        self.assertIn("non-human", claim.reason)


if __name__ == "__main__":
    unittest.main()
