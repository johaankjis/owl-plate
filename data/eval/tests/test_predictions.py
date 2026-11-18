"""Tests for predictions-file loading, validation and provenance labels."""

import copy
import unittest

from predictions import PredictionsError, load_predictions, parse_predictions

VALID_VISION = {
    "items": [{"name": "cheese pizza", "portion_unit": "slice", "count_estimate": 14}],
    "servings_estimate": 8,
    "servings_low": 6,
    "servings_high": 10,
    "allergens_likely": ["dairy", "gluten"],
    "diet_tags": ["vegetarian"],
    "confidence": 0.74,
    "notes": "one wrap tray partially eaten",
}

VALID_FILE = {
    "source": "gemini",
    "model": "gemini-2.5-flash",
    "synthetic": False,
    "generated_at": "2026-11-18T00:00:00Z",
    "predictions": [{"sample_id": "s1", "vision": copy.deepcopy(VALID_VISION)}],
}


class ParsePredictionsTest(unittest.TestCase):
    def test_valid_file_parses(self) -> None:
        parsed = parse_predictions(copy.deepcopy(VALID_FILE))
        self.assertEqual(parsed.source, "gemini")
        self.assertEqual(parsed.model, "gemini-2.5-flash")
        self.assertFalse(parsed.synthetic)
        self.assertEqual(len(parsed.entries), 1)
        self.assertEqual(parsed.entries[0].sample_id, "s1")
        self.assertEqual(parsed.entries[0].vision["servings_estimate"], 8)
        self.assertFalse(parsed.entries[0].low_confidence_inflated)

    def test_source_defaults_to_external(self) -> None:
        doc = {"predictions": [{"sample_id": "s1", "vision": copy.deepcopy(VALID_VISION)}]}
        parsed = parse_predictions(doc)
        self.assertEqual(parsed.source, "external")
        self.assertIsNone(parsed.synthetic)

    def test_unknown_source_rejected(self) -> None:
        doc = {**copy.deepcopy(VALID_FILE), "source": "guess"}
        with self.assertRaisesRegex(PredictionsError, "expected one of"):
            parse_predictions(doc)

    def test_unknown_file_key_rejected(self) -> None:
        doc = {**copy.deepcopy(VALID_FILE), "extra": True}
        with self.assertRaisesRegex(PredictionsError, "unknown key"):
            parse_predictions(doc)

    def test_missing_predictions_rejected(self) -> None:
        with self.assertRaisesRegex(PredictionsError, "missing required key"):
            parse_predictions({"source": "fixture"})

    def test_predictions_must_be_list(self) -> None:
        with self.assertRaisesRegex(PredictionsError, "expected a list"):
            parse_predictions({"predictions": {}})

    def test_duplicate_ids_rejected(self) -> None:
        doc = {
            "predictions": [
                {"sample_id": "s1", "vision": copy.deepcopy(VALID_VISION)},
                {"sample_id": "s1", "vision": copy.deepcopy(VALID_VISION)},
            ]
        }
        with self.assertRaisesRegex(PredictionsError, "duplicate"):
            parse_predictions(doc)

    def test_unknown_entry_key_rejected(self) -> None:
        doc = {"predictions": [{"sample_id": "s1", "vision": VALID_VISION, "score": 1}]}
        with self.assertRaisesRegex(PredictionsError, "unknown key"):
            parse_predictions(doc)

    def test_bad_vision_rejected_with_entry_context(self) -> None:
        vision = copy.deepcopy(VALID_VISION)
        vision["allergens_likely"] = ["milk"]
        doc = {"predictions": [{"sample_id": "s1", "vision": vision}]}
        with self.assertRaisesRegex(PredictionsError, "predictions\\[0\\].vision"):
            parse_predictions(doc)

    def test_low_confidence_inflated_flag_accepted(self) -> None:
        doc = {
            "predictions": [
                {"sample_id": "s1", "vision": VALID_VISION, "low_confidence_inflated": True}
            ]
        }
        parsed = parse_predictions(doc)
        self.assertTrue(parsed.entries[0].low_confidence_inflated)

    def test_empty_predictions_allowed(self) -> None:
        parsed = parse_predictions({"predictions": []})
        self.assertEqual(parsed.entries, ())

    def test_load_predictions_missing_file(self) -> None:
        with self.assertRaisesRegex(PredictionsError, "cannot read predictions file"):
            load_predictions("/nonexistent/predictions.json")


if __name__ == "__main__":
    unittest.main()
