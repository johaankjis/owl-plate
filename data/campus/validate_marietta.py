"""Validate data/campus/marietta.json against the frozen Milestone 1 contract.

The contract in docs/CAMPUS_MILESTONE_CONTRACT.md is frozen, so this script
enforces its exact shape: schema_version, campus name, per-building fields,
and the invariant that only records with verified coordinates may be marked
verified (the backend excludes null-coordinate buildings from selection and
dispatch, so a "verified" record without coordinates would silently break
that promise).

Runs with Python 3.11 standard library only, because the dataset worker may
not add dependencies. Usage:

    python3 data/campus/validate_marietta.py

Exit status is 0 when every check passes, 1 otherwise.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path
from typing import Any

DATASET = Path(__file__).resolve().parent / "marietta.json"

REQUIRED_KEYS = (
    "id",
    "name",
    "building_code",
    "building_number",
    "category",
    "latitude",
    "longitude",
    "verification_status",
    "sources",
)
CATEGORIES = {"academic", "student_life", "housing", "other"}
STATUSES = {"verified", "unverified"}
ID_PATTERN = re.compile(r"^ksu-marietta-[a-z0-9]+(?:-[a-z0-9]+)*$")

# Generous sanity box around the KSU Marietta campus (1100 S Marietta Pkwy).
# Its only job is to catch transposed or truncated coordinates, not to
# second-guess verified evidence.
CAMPUS_BBOX = {"lat_min": 33.90, "lat_max": 33.96, "lon_min": -84.56, "lon_max": -84.48}

# The 19 initially requested buildings. Guards against accidentally dropping
# a requested record while the dataset evolves.
EXPECTED_IDS = {
    "ksu-marietta-academic-building",
    "ksu-marietta-administration-building",
    "ksu-marietta-architecture-building",
    "ksu-marietta-atrium-building",
    "ksu-marietta-civil-environmental-engineering",
    "ksu-marietta-crawford-lab-building",
    "ksu-marietta-design-1-building",
    "ksu-marietta-design-2-building",
    "ksu-marietta-heatherington-engineering-lab",
    "ksu-marietta-engineering-technology-center",
    "ksu-marietta-hornet-hub",
    "ksu-marietta-lawrence-v-johnson-library",
    "ksu-marietta-mathematics-building",
    "ksu-marietta-shore-innovation-center",
    "ksu-marietta-w-clair-harris-textile-center",
    "ksu-marietta-joe-mack-wilson-student-center",
    "ksu-marietta-event-center",
    "ksu-marietta-recreation-wellness-center",
    "ksu-marietta-stingers-dining-hall",
}


class Report:
    """Collects check failures so the caller gets one complete picture."""

    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks = 0

    def check(self, ok: bool, message: str) -> None:
        self.checks += 1
        if not ok:
            self.failures.append(message)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in meters, used only to flag duplicates."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def validate(doc: Any) -> Report:
    report = Report()

    report.check(isinstance(doc, dict), "top level must be a JSON object")
    if not isinstance(doc, dict):
        return report

    report.check(doc.get("schema_version") == 1, "schema_version must be 1")
    report.check(doc.get("campus") == "marietta", 'campus must be "marietta"')
    buildings = doc.get("buildings")
    report.check(
        isinstance(buildings, list) and len(buildings) > 0, "buildings must be a non-empty array"
    )
    if not isinstance(buildings, list):
        return report

    ids: set[str] = set()
    points: list[tuple[float, float, str]] = []

    for i, b in enumerate(buildings):
        where = f"buildings[{i}]"
        report.check(isinstance(b, dict), f"{where} must be an object")
        if not isinstance(b, dict):
            continue

        for key in REQUIRED_KEYS:
            report.check(key in b, f"{where}: missing required key {key!r}")

        bid = b.get("id")
        report.check(
            isinstance(bid, str) and bool(ID_PATTERN.match(bid or "")),
            f"{where}: id must match {ID_PATTERN.pattern}",
        )
        if isinstance(bid, str):
            report.check(bid not in ids, f"{where}: duplicate id {bid!r}")
            ids.add(bid)

        name = b.get("name")
        report.check(
            isinstance(name, str) and name.strip() != "",
            f"{where}: name must be a non-empty string",
        )

        code = b.get("building_code")
        report.check(
            code is None or (isinstance(code, str) and code.strip() != ""),
            f"{where}: building_code must be null or a non-empty string",
        )

        number = b.get("building_number")
        report.check(
            number is None or (isinstance(number, str) and number.strip() != ""),
            f"{where}: building_number must be null or a non-empty string",
        )

        report.check(
            b.get("category") in CATEGORIES,
            f"{where}: category must be one of {sorted(CATEGORIES)}",
        )
        report.check(
            b.get("verification_status") in STATUSES,
            f"{where}: verification_status must be one of {sorted(STATUSES)}",
        )

        lat = b.get("latitude")
        lon = b.get("longitude")
        for key, value in (("latitude", lat), ("longitude", lon)):
            report.check(
                value is None or _is_number(value), f"{where}: {key} must be null or a number"
            )
        if _is_number(lat) and _is_number(lon):
            report.check(
                CAMPUS_BBOX["lat_min"] <= lat <= CAMPUS_BBOX["lat_max"],
                f"{where}: latitude {lat} outside campus sanity bbox",
            )
            report.check(
                CAMPUS_BBOX["lon_min"] <= lon <= CAMPUS_BBOX["lon_max"],
                f"{where}: longitude {lon} outside campus sanity bbox",
            )
            points.append((float(lat), float(lon), str(bid)))

        # Contract invariant: verified records carry usable coordinates,
        # because the backend only exposes verified entries for selection.
        if b.get("verification_status") == "verified":
            report.check(
                _is_number(lat) and _is_number(lon),
                f"{where}: verified record {bid!r} must have coordinates",
            )

        sources = b.get("sources")
        report.check(
            isinstance(sources, list) and len(sources) > 0,
            f"{where}: sources must be a non-empty array",
        )
        if isinstance(sources, list):
            for j, s in enumerate(sources):
                sw = f"{where}.sources[{j}]"
                report.check(
                    isinstance(s, dict) and set(s) == {"url", "title"},
                    f"{sw}: must be an object with exactly url and title",
                )
                if isinstance(s, dict):
                    url = s.get("url")
                    title = s.get("title")
                    report.check(
                        isinstance(url, str) and url.startswith("https://"),
                        f"{sw}: url must be an https URL",
                    )
                    report.check(
                        isinstance(title, str) and title.strip() != "",
                        f"{sw}: title must be a non-empty string",
                    )

    # Distinct buildings must not share one point: the dispatch engine derives
    # H3 cells from these coordinates and two buildings in one cell would be
    # indistinguishable to wave logic.
    for a in range(len(points)):
        for c in range(a + 1, len(points)):
            lat1, lon1, id1 = points[a]
            lat2, lon2, id2 = points[c]
            if _haversine_m(lat1, lon1, lat2, lon2) < 5.0:
                report.check(False, f"buildings {id1!r} and {id2!r} are under 5 m apart")

    missing = EXPECTED_IDS - ids
    report.check(not missing, f"expected building ids missing from dataset: {sorted(missing)}")

    return report


def main() -> int:
    """Run all contract checks and print a one-screen summary."""
    try:
        doc = json.loads(DATASET.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"FAIL: dataset not found at {DATASET}")
        return 1
    except json.JSONDecodeError as exc:
        print(f"FAIL: {DATASET} is not valid JSON: {exc}")
        return 1

    report = validate(doc)
    buildings = doc.get("buildings", []) if isinstance(doc, dict) else []
    verified = [
        b for b in buildings if isinstance(b, dict) and b.get("verification_status") == "verified"
    ]
    by_cat: dict[str, int] = {}
    for b in verified:
        by_cat[b["category"]] = by_cat.get(b["category"], 0) + 1

    print(f"dataset: {DATASET}")
    print(
        f"records: {len(buildings)} | verified: {len(verified)} | "
        + " | ".join(f"{cat}: {n}" for cat, n in sorted(by_cat.items()))
    )
    print(f"checks run: {report.checks} | failures: {len(report.failures)}")
    for failure in report.failures:
        print(f"  FAIL: {failure}")
    if report.failures:
        return 1
    print("OK: marietta.json conforms to the Milestone 1 campus dataset contract")
    return 0


if __name__ == "__main__":
    sys.exit(main())
