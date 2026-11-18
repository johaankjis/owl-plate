"""Known-answer tests for the pure scoring math (docs/DATA.md section 4).

Every expected value below was computed by hand from the tiny fixture in this
file, so a regression in MAE, within-±2, recall, false positive rate or the
undefined-case handling fails loudly here.
"""

import unittest

import metrics
from metrics import score_allergens, score_servings

# Tiny known-answer fixture, hand-computed:
#   s1: truth 8 / est 7   (error 1, within ±2), gold {dairy, gluten}, pred {dairy, gluten}
#   s2: truth 12 / est 15 (error 3, outside),    gold {gluten, egg},    pred {gluten}
#   s3: truth 5 / est 5   (error 0, within ±2), gold {soy},            pred {soy, sesame}
SERVING_PAIRS = [(8, 7), (12, 15), (5, 5)]
ALLERGEN_PAIRS = [
    ({"dairy", "gluten"}, {"dairy", "gluten"}),
    ({"gluten", "egg"}, {"gluten"}),
    ({"soy"}, {"soy", "sesame"}),
]


class ScoreServingsTest(unittest.TestCase):
    def test_known_answer(self) -> None:
        score = score_servings(SERVING_PAIRS)
        self.assertEqual(score.n, 3)
        self.assertAlmostEqual(score.mae, (1 + 3 + 0) / 3, places=12)
        self.assertEqual(score.within_2, 2)
        self.assertAlmostEqual(score.within_2_pct, 100.0 * 2 / 3, places=12)

    def test_zero_error_sample(self) -> None:
        score = score_servings([(4, 4)])
        self.assertEqual(score.mae, 0.0)
        self.assertEqual(score.within_2, 1)
        self.assertEqual(score.within_2_pct, 100.0)

    def test_empty_is_undefined(self) -> None:
        score = score_servings([])
        self.assertEqual((score.n, score.within_2), (0, 0))
        self.assertIsNone(score.mae)
        self.assertIsNone(score.within_2_pct)

    def test_boundary_exactly_two_is_within(self) -> None:
        score = score_servings([(10, 12), (10, 13)])
        self.assertEqual(score.within_2, 1)
        self.assertAlmostEqual(score.mae, 2.5, places=12)


class ScoreAllergensTest(unittest.TestCase):
    def test_known_answer(self) -> None:
        # 3 samples x 9 allergens = 27 pairs. Gold-positive pairs: 2 + 2 + 1 = 5.
        # TP: dairy, gluten (s1), gluten (s2), soy (s3) = 4. FN: egg (s2) = 1.
        # FP: sesame (s3) = 1. TN: 27 - 5 - 1 = 21.
        score = score_allergens(ALLERGEN_PAIRS)
        self.assertEqual(score.pairs_total, 27)
        self.assertEqual(score.gold_positive_pairs, 5)
        self.assertEqual(score.gold_negative_pairs, 22)
        self.assertEqual((score.tp, score.fn, score.fp, score.tn), (4, 1, 1, 21))
        self.assertAlmostEqual(score.recall, 4 / 5, places=12)
        self.assertAlmostEqual(score.fpr, 1 / 22, places=12)

    def test_per_allergen_counts(self) -> None:
        score = score_allergens(ALLERGEN_PAIRS)
        dairy = score.per_allergen["dairy"]
        self.assertEqual(
            (dairy.gold_positive, dairy.tp, dairy.fn, dairy.fp, dairy.tn), (1, 1, 0, 0, 2)
        )
        self.assertEqual(dairy.recall, 1.0)
        self.assertEqual(dairy.fpr, 0.0)
        peanut = score.per_allergen["peanut"]
        self.assertEqual(
            (peanut.gold_positive, peanut.tp, peanut.fn, peanut.fp, peanut.tn), (0, 0, 0, 0, 3)
        )
        self.assertIsNone(peanut.recall)
        self.assertEqual(peanut.fpr, 0.0)
        sesame = score.per_allergen["sesame"]
        self.assertEqual((sesame.fp, sesame.tn), (1, 2))
        self.assertIsNone(sesame.recall)
        self.assertAlmostEqual(sesame.fpr, 1 / 3, places=12)

    def test_no_gold_positive_pairs_recall_undefined(self) -> None:
        score = score_allergens([(set(), set())])
        self.assertEqual(score.gold_positive_pairs, 0)
        self.assertIsNone(score.recall)
        self.assertEqual(score.fpr, 0.0)

    def test_no_gold_negative_pairs_fpr_undefined(self) -> None:
        all_nine = set(metrics.NINE_ALLERGENS)
        score = score_allergens([(all_nine, all_nine)])
        self.assertEqual(score.gold_negative_pairs, 0)
        self.assertIsNone(score.fpr)
        self.assertEqual(score.recall, 1.0)

    def test_empty_is_undefined(self) -> None:
        score = score_allergens([])
        self.assertEqual(score.pairs_total, 0)
        self.assertEqual(score.gold_positive_pairs, 0)
        self.assertEqual(score.gold_negative_pairs, 0)
        self.assertIsNone(score.recall)
        self.assertIsNone(score.fpr)

    def test_duplicate_predicted_flags_count_once(self) -> None:
        score = score_allergens([({"soy"}, ["soy", "soy"])])
        self.assertEqual((score.tp, score.fn, score.fp, score.tn), (1, 0, 0, 8))


if __name__ == "__main__":
    unittest.main()
