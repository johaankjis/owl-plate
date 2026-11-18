"""Verify the fixed demo areas and their server-side H3 ring mapping."""

import h3
import pytest

from services.api.application import Backend, DomainError
from services.api.sessions import area_cell


def test_areas_match_the_frozen_contract_table(client):
    areas = client.get("/demo/areas").json()["areas"]
    assert [(a["id"], a["ring_distance"]) for a in areas] == [
        ("demo-venue", 0),
        ("demo-next-door", 1),
        ("demo-across-quad", 4),
        ("demo-far-side", 8),
    ]
    assert [a["label"] for a in areas] == [
        "Event venue (demo)",
        "Next building over (demo)",
        "Across the quad (demo)",
        "Far side of campus (demo)",
    ]
    assert all("simulated" in a["description"].lower() for a in areas)


def test_areas_require_both_demo_gates(backend):
    service = Backend(backend.engine, demo_mode=False, auth_mode="demo")
    with pytest.raises(DomainError) as failure:
        service.areas()
    assert failure.value.status == 403


@pytest.mark.parametrize("ring", [0, 1, 4, 8])
def test_area_cells_sit_at_the_exact_ring_distance(backend, ring):
    for index in range(3):
        cell = area_cell(backend.origin, ring, index)
        assert h3.get_resolution(cell) == 11
        assert cell in h3.grid_disk(backend.origin, ring)
        if ring:
            assert cell not in h3.grid_disk(backend.origin, ring - 1)
