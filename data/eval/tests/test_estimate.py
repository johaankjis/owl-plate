"""Tests for the mirror of the frozen VisionEstimate contract.

The eval must accept exactly the shape defined in
services/api/schemas/api.py (frozen for eval per docs/API_CONTRACT.md), so
these tests pin the validation rules and check the mirror against the schema
file itself so the two cannot drift apart silently.
"""

import ast
import copy
import unittest
from pathlib import Path

from estimate import ALLERGENS, DIETS, ShapeError, validate_vision_estimate

SCHEMA_FILE = Path(__file__).resolve().parents[3] / "services" / "api" / "schemas" / "api.py"

VALID = {
    "items": [{"name": "cheese pizza", "portion_unit": "slice", "count_estimate": 14}],
    "servings_estimate": 8,
    "servings_low": 6,
    "servings_high": 10,
    "allergens_likely": ["dairy", "gluten"],
    "diet_tags": ["vegetarian"],
    "confidence": 0.74,
    "notes": "one wrap tray partially eaten",
}


def valid_copy() -> dict:
    return copy.deepcopy(VALID)


class ValidateVisionEstimateTest(unittest.TestCase):
    def test_valid_estimate_passes(self) -> None:
        data = valid_copy()
        self.assertEqual(validate_vision_estimate(data), data)

    def test_unknown_key_rejected(self) -> None:
        data = valid_copy()
        data["servings_mid"] = 7
        with self.assertRaisesRegex(ShapeError, "unknown key"):
            validate_vision_estimate(data)

    def test_missing_key_rejected(self) -> None:
        data = valid_copy()
        del data["confidence"]
        with self.assertRaisesRegex(ShapeError, "missing required key"):
            validate_vision_estimate(data)

    def test_empty_items_rejected(self) -> None:
        data = valid_copy()
        data["items"] = []
        with self.assertRaisesRegex(ShapeError, "between 1 and 30"):
            validate_vision_estimate(data)

    def test_too_many_items_rejected(self) -> None:
        data = valid_copy()
        data["items"] = [{"name": "x", "portion_unit": "piece", "count_estimate": 1}] * 31
        with self.assertRaisesRegex(ShapeError, "between 1 and 30"):
            validate_vision_estimate(data)

    def test_food_item_extra_key_rejected(self) -> None:
        data = valid_copy()
        data["items"][0]["weight"] = "200g"
        with self.assertRaisesRegex(ShapeError, "unknown key"):
            validate_vision_estimate(data)

    def test_empty_food_item_name_rejected(self) -> None:
        data = valid_copy()
        data["items"][0]["name"] = ""
        with self.assertRaisesRegex(ShapeError, "length must be between 1 and 100"):
            validate_vision_estimate(data)

    def test_servings_range_disorder_rejected(self) -> None:
        data = valid_copy()
        data["servings_low"] = 11
        with self.assertRaisesRegex(ShapeError, "must lie within"):
            validate_vision_estimate(data)

    def test_servings_out_of_bounds_rejected(self) -> None:
        for field, value in (
            ("servings_estimate", 0),
            ("servings_estimate", 501),
            ("servings_low", 0),
            ("servings_high", 501),
        ):
            with self.subTest(field=field, value=value):
                data = valid_copy()
                data[field] = value
                with self.assertRaisesRegex(ShapeError, "expected an integer between"):
                    validate_vision_estimate(data)

    def test_bool_servings_rejected(self) -> None:
        data = valid_copy()
        data["servings_estimate"] = True
        with self.assertRaisesRegex(ShapeError, "expected an integer"):
            validate_vision_estimate(data)

    def test_unknown_allergen_rejected(self) -> None:
        data = valid_copy()
        data["allergens_likely"] = ["peanuts"]
        with self.assertRaisesRegex(ShapeError, "expected one of"):
            validate_vision_estimate(data)

    def test_unknown_diet_rejected(self) -> None:
        data = valid_copy()
        data["diet_tags"] = ["paleo"]
        with self.assertRaisesRegex(ShapeError, "expected one of"):
            validate_vision_estimate(data)

    def test_confidence_bounds_rejected(self) -> None:
        for value in (1.5, -0.1, True):
            with self.subTest(value=value):
                data = valid_copy()
                data["confidence"] = value
                with self.assertRaises(ShapeError):
                    validate_vision_estimate(data)

    def test_confidence_integer_one_accepted(self) -> None:
        data = valid_copy()
        data["confidence"] = 1
        self.assertEqual(validate_vision_estimate(data)["confidence"], 1)

    def test_notes_too_long_rejected(self) -> None:
        data = valid_copy()
        data["notes"] = "x" * 1001
        with self.assertRaisesRegex(ShapeError, "length must be between 0 and 1000"):
            validate_vision_estimate(data)

    def test_count_estimate_bounds_rejected(self) -> None:
        for value in (-1, 1001):
            with self.subTest(value=value):
                data = valid_copy()
                data["items"][0]["count_estimate"] = value
                with self.assertRaisesRegex(ShapeError, "expected an integer between"):
                    validate_vision_estimate(data)

    def test_non_dict_rejected(self) -> None:
        with self.assertRaisesRegex(ShapeError, "expected an object"):
            validate_vision_estimate([VALID])


class SchemaMirrorDriftTest(unittest.TestCase):
    """Fail when estimate.py drifts from the frozen schema file."""

    def _literal_names(self, line_prefix: str) -> tuple[str, ...]:
        tree = ast.parse(SCHEMA_FILE.read_text(encoding="utf-8"))
        for node in tree.body:
            if (
                isinstance(node, ast.Assign)
                and any(
                    isinstance(target, ast.Name) and target.id == line_prefix
                    for target in node.targets
                )
                and isinstance(node.value, ast.Subscript)
                and isinstance(node.value.value, ast.Name)
                and node.value.value.id == "Literal"
            ):
                return tuple(ast.literal_eval(node.value.slice))
        self.fail(f"could not find `{line_prefix} = Literal[...]` in {SCHEMA_FILE}")

    def test_allergens_match_frozen_schema(self) -> None:
        self.assertEqual(self._literal_names("Allergen"), ALLERGENS)

    def test_diets_match_frozen_schema(self) -> None:
        self.assertEqual(self._literal_names("Diet"), DIETS)


if __name__ == "__main__":
    unittest.main()
