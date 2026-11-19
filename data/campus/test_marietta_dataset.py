"""Unittest wrapper around the Marietta dataset contract validation.

Kept beside the dataset (data/campus/** is owned by the dataset worker)
while staying discoverable by plain unittest:

    python -m unittest discover -s data/campus -p 'test_*.py'

The integrator can add data/campus to the Makefile test target with that
one command and get the same coverage as validate_marietta.py.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import validate_marietta


class MariettaDatasetContractTest(unittest.TestCase):
    """Every check from validate_marietta must pass, plus round-trip sanity."""

    def setUp(self) -> None:
        self.doc = json.loads(
            (Path(__file__).resolve().parent / "marietta.json").read_text(encoding="utf-8")
        )

    def test_contract_validation_passes(self) -> None:
        report = validate_marietta.validate(self.doc)
        self.assertEqual(
            report.failures, [], msg="contract violations:\n" + "\n".join(report.failures)
        )

    def test_all_records_verified_with_coordinates(self) -> None:
        """Dispatch only exposes verified records, so every record must qualify."""
        for building in self.doc["buildings"]:
            with self.subTest(building=building["id"]):
                self.assertEqual(building["verification_status"], "verified")
                self.assertIsInstance(building["latitude"], float)
                self.assertIsInstance(building["longitude"], float)

    def test_initially_requested_buildings_present(self) -> None:
        ids = {b["id"] for b in self.doc["buildings"]}
        self.assertTrue(validate_marietta.EXPECTED_IDS <= ids)

    def test_housing_options_present(self) -> None:
        """Verified housing check-in options are part of the milestone scope."""
        ids = {b["id"] for b in self.doc["buildings"]}
        for housing_id in (
            "ksu-marietta-hornet-village-100",
            "ksu-marietta-hornet-village-200",
            "ksu-marietta-howell-hall",
            "ksu-marietta-housing-residence-life-office",
            "ksu-marietta-university-commons-300",
            "ksu-marietta-university-courtyard-2000",
            "ksu-marietta-university-columns-activity-center",
        ):
            self.assertIn(housing_id, ids)


if __name__ == "__main__":
    unittest.main()
