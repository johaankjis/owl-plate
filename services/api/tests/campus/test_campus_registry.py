"""The registry serves only verified, well-formed buildings and refuses to guess."""

import json

import h3
import pytest

from services.api.campus import CampusDatasetError, load_registry, parse_registry
from services.api.tests.conftest import fixture_dataset

NEAR = "ksu-marietta-fixture-near"
FAR = "ksu-marietta-fixture-far"


def test_absent_dataset_means_no_campus_buildings(tmp_path):
    registry = load_registry(tmp_path / "missing.json")
    assert registry.response().buildings == [] and dict(registry.cells) == {}


def test_only_verified_buildings_are_selectable(campus_path):
    registry = load_registry(campus_path)
    assert set(registry.buildings) == {NEAR, FAR}
    assert registry.get("ksu-marietta-fixture-pending") is None
    assert registry.get("ksu-marietta-fixture-unproven") is None
    for building_id, building in registry.buildings.items():
        cell = registry.cells[building_id]
        assert h3.get_resolution(cell) == 11
        assert cell == h3.latlng_to_cell(building.latitude, building.longitude, 11)


def test_extra_research_fields_are_tolerated_but_not_served():
    raw = fixture_dataset()
    raw["notes"] = "research log"
    raw["buildings"][0]["uncertainty"] = "entrance unknown"
    building = parse_registry(raw).get(NEAR)
    assert "uncertainty" not in building.model_dump()


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d.update(schema_version=2),
        lambda d: d.update(campus="kennesaw"),
        lambda d: d["buildings"][0].update(latitude=None),
        lambda d: d["buildings"][0].update(latitude=91.0),
        lambda d: d["buildings"][0].update(sources=[]),
        lambda d: d["buildings"][0].update(id="marietta-hall"),
        lambda d: d["buildings"][0].update(category="parking"),
        lambda d: d["buildings"][0].update(verification_status="probably"),
        lambda d: d["buildings"][0].pop("building_code"),
        lambda d: d["buildings"].append(dict(d["buildings"][1])),
        lambda d: d["buildings"][2].update(id=d["buildings"][0]["id"]),
    ],
)
def test_contract_violations_fail_loudly(mutate):
    raw = fixture_dataset()
    mutate(raw)
    with pytest.raises(CampusDatasetError):
        parse_registry(raw)


def test_unreadable_dataset_fails_loudly(tmp_path):
    path = tmp_path / "marietta.json"
    path.write_text("{not json")
    with pytest.raises(CampusDatasetError):
        load_registry(path)


def test_nonfinite_coordinates_are_rejected(tmp_path):
    raw = fixture_dataset()
    raw["buildings"][0]["latitude"] = float("nan")
    path = tmp_path / "marietta.json"
    path.write_text(json.dumps(raw))
    with pytest.raises(CampusDatasetError):
        load_registry(path)
