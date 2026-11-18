"""Tests for gold-label loading and validation (the eval's source of truth)."""

import json
import tempfile
import unittest
from pathlib import Path

from gold import GoldError, GoldSample, load_gold


def sample(sample_id: str = "s1", **overrides) -> dict:
    """Build a minimal valid gold sample, then apply overrides for bad cases."""
    labels = {
        "source": "human",
        "labeled_by": "johaan",
        "servings": 8,
        "allergens_present": ["dairy"],
    }
    labels.update(overrides.pop("labels", {}))
    doc = {"sample_id": sample_id, "labels": labels}
    doc.update(overrides)
    return doc


def write_json(directory: Path, name: str, doc: object) -> Path:
    path = directory / name
    path.write_text(json.dumps(doc), encoding="utf-8")
    return path


class LoadGoldTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_single_sample_file(self) -> None:
        path = write_json(self.dir, "one.json", sample())
        loaded = load_gold(path)
        self.assertEqual(len(loaded), 1)
        got = loaded[0]
        self.assertIsInstance(got, GoldSample)
        self.assertEqual(got.sample_id, "s1")
        self.assertEqual(got.servings, 8)
        self.assertEqual(got.allergens, frozenset({"dairy"}))
        self.assertEqual(got.source, "human")
        self.assertIsNone(got.photo)

    def test_samples_document_loads_many(self) -> None:
        doc = {"samples": [sample("a"), sample("b", labels={"servings": 3})]}
        path = write_json(self.dir, "all.json", doc)
        loaded = load_gold(path)
        self.assertEqual([s.sample_id for s in loaded], ["a", "b"])

    def test_directory_loads_each_file(self) -> None:
        write_json(self.dir, "a.json", sample("a"))
        write_json(self.dir, "b.json", sample("b"))
        loaded = load_gold(self.dir)
        self.assertEqual({s.sample_id for s in loaded}, {"a", "b"})

    def test_photo_and_optional_fields_accepted(self) -> None:
        doc = sample(
            photo="photos/a.jpg",
            labels={
                "labeled_at": "2026-11-19T21:00:00Z",
                "items": [{"name": "cheese pizza", "portion_unit": "slice", "count": 14}],
            },
        )
        path = write_json(self.dir, "photo.json", doc)
        got = load_gold(path)[0]
        self.assertEqual(got.photo, "photos/a.jpg")
        self.assertEqual(got.labeled_at, "2026-11-19T21:00:00Z")
        self.assertEqual(got.items[0]["name"], "cheese pizza")

    def test_zero_servings_allowed(self) -> None:
        path = write_json(self.dir, "zero.json", sample(labels={"servings": 0}))
        self.assertEqual(load_gold(path)[0].servings, 0)

    def test_empty_allergen_list_allowed(self) -> None:
        path = write_json(self.dir, "none.json", sample(labels={"allergens_present": []}))
        self.assertEqual(load_gold(path)[0].allergens, frozenset())


class GoldValidationTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def assert_gold_error(self, doc: object, pattern: str) -> None:
        path = write_json(self.dir, "bad.json", doc)
        with self.assertRaisesRegex(GoldError, pattern):
            load_gold(path)

    def test_duplicate_ids_across_files_rejected(self) -> None:
        write_json(self.dir, "a.json", sample("dup"))
        write_json(self.dir, "b.json", sample("dup"))
        with self.assertRaisesRegex(GoldError, "duplicate sample_id"):
            load_gold(self.dir)

    def test_unknown_top_level_key_rejected(self) -> None:
        self.assert_gold_error({**sample(), "surprise": 1}, "unknown key")

    def test_unknown_allergen_rejected(self) -> None:
        self.assert_gold_error(sample(labels={"allergens_present": ["milk"]}), "expected one of")

    def test_duplicate_allergens_rejected(self) -> None:
        self.assert_gold_error(
            sample(labels={"allergens_present": ["dairy", "dairy"]}), "duplicate"
        )

    def test_negative_servings_rejected(self) -> None:
        self.assert_gold_error(sample(labels={"servings": -1}), "cannot be negative")

    def test_float_servings_rejected(self) -> None:
        self.assert_gold_error(sample(labels={"servings": 8.5}), "expected an integer")

    def test_unknown_source_rejected(self) -> None:
        self.assert_gold_error(sample(labels={"source": "guess"}), "expected one of")

    def test_empty_labeled_by_rejected(self) -> None:
        self.assert_gold_error(sample(labels={"labeled_by": " "}), "non-empty string")

    def test_naive_labeled_at_rejected(self) -> None:
        self.assert_gold_error(
            sample(labels={"labeled_at": "2026-11-19T21:00:00"}), "timezone"
        )

    def test_unknown_label_key_rejected(self) -> None:
        self.assert_gold_error(sample(labels={"serves": 8}), "unknown key")

    def test_item_without_name_rejected(self) -> None:
        self.assert_gold_error(
            sample(labels={"items": [{"portion_unit": "slice"}]}), "missing required key"
        )

    def test_item_unknown_key_rejected(self) -> None:
        self.assert_gold_error(
            sample(labels={"items": [{"name": "pizza", "weight": 1}]}), "unknown key"
        )

    def test_empty_photo_rejected(self) -> None:
        self.assert_gold_error(sample(photo=""), "non-empty string")

    def test_missing_path_rejected(self) -> None:
        with self.assertRaisesRegex(GoldError, "gold path not found"):
            load_gold(self.dir / "nope.json")

    def test_empty_directory_rejected(self) -> None:
        with self.assertRaisesRegex(GoldError, "contains no .json"):
            load_gold(self.dir)

    def test_invalid_json_rejected(self) -> None:
        (self.dir / "broken.json").write_text("{not json", encoding="utf-8")
        with self.assertRaisesRegex(GoldError, "cannot read gold file"):
            load_gold(self.dir)


if __name__ == "__main__":
    unittest.main()
