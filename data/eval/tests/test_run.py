"""End-to-end tests for the CLI: modes, exit codes and known-answer output."""

import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from run import main

VISION_OK = {
    "items": [{"name": "cheese pizza", "portion_unit": "slice", "count_estimate": 6}],
    "servings_estimate": 6,
    "servings_low": 6,
    "servings_high": 6,
    "allergens_likely": ["gluten"],
    "diet_tags": [],
    "confidence": 0.8,
    "notes": "",
}


def capture(args):
    """Run main() capturing stdout and stderr; return (code, out, err)."""
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = main(args)
    return code, out.getvalue(), err.getvalue()


class CliRulesTest(unittest.TestCase):
    def assert_usage_error(self, args: list[str]) -> None:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err), self.assertRaises(SystemExit) as ctx:
            main(args)
        self.assertEqual(ctx.exception.code, 2)

    def test_no_mode_is_a_usage_error(self) -> None:
        self.assert_usage_error([])

    def test_predictions_requires_gold(self) -> None:
        self.assert_usage_error(["--predictions", "p.json"])

    def test_live_requires_gold(self) -> None:
        self.assert_usage_error(["--live"])

    def test_fixtures_rejects_path_arguments(self) -> None:
        self.assert_usage_error(["--fixtures", "--gold", "g.json"])

    def test_save_predictions_requires_live(self) -> None:
        self.assert_usage_error(
            ["--predictions", "p.json", "--gold", "g.json", "--save-predictions", "s.json"]
        )

    def test_photos_requires_live(self) -> None:
        self.assert_usage_error(["--predictions", "p.json", "--gold", "g.json", "--photos", "d"])

    def test_modes_are_mutually_exclusive(self) -> None:
        self.assert_usage_error(["--fixtures", "--live"])


class FixturesModeTest(unittest.TestCase):
    def test_fixtures_report_known_answer_and_label(self) -> None:
        code, out, _ = capture(["--fixtures"])
        self.assertEqual(code, 0)
        self.assertIn("SYNTHETIC KNOWN-ANSWER FIXTURE", out)
        self.assertIn("Mode: fixtures | predictions: fixture [synthetic]", out)
        self.assertIn(
            "Sample counts: 4 gold, 4 evaluated, 0 missing predictions, 0 live failures", out
        )
        self.assertIn("mean absolute error: 1.25 servings", out)
        self.assertIn("within ±2 servings: 3/4 (75.0%)", out)
        self.assertIn("recall = TP/(TP+FN): 5/6 = 0.8333", out)
        self.assertIn("denominator: 6 gold-positive (allergen, sample) pairs", out)
        self.assertIn("false positive rate = FP/(FP+TN): 1/30 = 0.0333", out)
        self.assertIn("denominator: 30 gold-negative (allergen, sample) pairs", out)
        self.assertIn("may contain, confirm with host", out)
        self.assertIn("MEASURED-ACCURACY CLAIM: NOT SUPPORTED", out)

    def test_fixtures_json_known_answer(self) -> None:
        code, out, _ = capture(["--fixtures", "--json"])
        self.assertEqual(code, 0)
        doc = json.loads(out)
        self.assertEqual(
            doc["counts"],
            {
                "gold": 4,
                "evaluated": 4,
                "missing_predictions": 0,
                "live_failures": 0,
                "unmatched_predictions": [],
            },
        )
        self.assertEqual(doc["servings"]["mae"], 1.25)
        self.assertEqual(doc["servings"]["within_2"], 3)
        self.assertEqual(doc["servings"]["within_2_pct"], 75.0)
        allergens = doc["allergens"]
        self.assertEqual(allergens["pairs_total"], 36)
        self.assertEqual(
            (allergens["tp"], allergens["fn"], allergens["fp"], allergens["tn"]),
            (5, 1, 1, 29),
        )
        self.assertAlmostEqual(allergens["recall"], 5 / 6, places=12)
        self.assertAlmostEqual(allergens["fpr"], 1 / 30, places=12)
        self.assertFalse(doc["measured_claim"]["supported"])
        self.assertEqual(doc["gold_sources"], ["synthetic"])
        self.assertEqual(doc["prediction_source"], "fixture")
        self.assertEqual(doc["allergen_notice"], "may contain, confirm with host")


class PredictionsModeTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def write(self, name: str, doc: object) -> str:
        path = self.dir / name
        path.write_text(json.dumps(doc), encoding="utf-8")
        return str(path)

    def gold_doc(self, ids: list[str]) -> dict:
        return {
            "samples": [
                {
                    "sample_id": sample_id,
                    "labels": {
                        "source": "human",
                        "labeled_by": "johaan",
                        "servings": 6,
                        "allergens_present": ["gluten"],
                    },
                }
                for sample_id in ids
            ]
        }

    def test_matching_run_exits_zero(self) -> None:
        gold = self.write("gold.json", self.gold_doc(["t1"]))
        predictions = self.write(
            "preds.json", {"predictions": [{"sample_id": "t1", "vision": VISION_OK}]}
        )
        code, out, _ = capture(["--gold", gold, "--predictions", predictions])
        self.assertEqual(code, 0)
        self.assertIn("gold labels: human", out)
        self.assertIn("mean absolute error: 0.00 servings", out)
        self.assertIn("NOT SUPPORTED", out)  # predictions source is external, not live

    def test_missing_prediction_exits_one(self) -> None:
        gold = self.write("gold.json", self.gold_doc(["t1", "t2"]))
        predictions = self.write(
            "preds.json", {"predictions": [{"sample_id": "t1", "vision": VISION_OK}]}
        )
        code, out, _ = capture(["--gold", gold, "--predictions", predictions])
        self.assertEqual(code, 1)
        self.assertIn("1 missing predictions", out)

    def test_unmatched_prediction_warns_but_scores(self) -> None:
        gold = self.write("gold.json", self.gold_doc(["t1"]))
        predictions = self.write(
            "preds.json",
            {
                "predictions": [
                    {"sample_id": "t1", "vision": VISION_OK},
                    {"sample_id": "ghost", "vision": VISION_OK},
                ]
            },
        )
        code, out, err = capture(["--gold", gold, "--predictions", predictions])
        self.assertEqual(code, 0)
        self.assertIn("1 prediction(s) have no gold sample: ghost", err)
        self.assertIn("1 gold, 1 evaluated", out)

    def test_bad_gold_path_exits_one(self) -> None:
        predictions = self.write(
            "preds.json", {"predictions": [{"sample_id": "t1", "vision": VISION_OK}]}
        )
        code, _, err = capture(["--gold", "/nonexistent/gold.json", "--predictions", predictions])
        self.assertEqual(code, 1)
        self.assertIn("gold path not found", err)


if __name__ == "__main__":
    unittest.main()
