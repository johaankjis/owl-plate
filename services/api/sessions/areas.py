"""Fixed, unverified demo areas mapped server-side onto H3 rings of the demo origin."""

from collections.abc import Sequence

import h3

from services.api.schemas.api import DemoArea, DemoAreasResponse

FIXED_AREAS: tuple[DemoArea, ...] = (
    DemoArea(
        id="demo-venue",
        label="Event venue (demo)",
        description="Simulated event venue; not a verified campus location.",
        ring_distance=0,
    ),
    DemoArea(
        id="demo-next-door",
        label="Next building over (demo)",
        description="Simulated neighboring building; not a verified campus location.",
        ring_distance=1,
    ),
    DemoArea(
        id="demo-across-quad",
        label="Across the quad (demo)",
        description="Simulated spot across the quad; not a verified campus location.",
        ring_distance=4,
    ),
    DemoArea(
        id="demo-far-side",
        label="Far side of campus (demo)",
        description="Simulated far side of campus; not a verified campus location.",
        ring_distance=8,
    ),
)
RING_DISTANCE = {area.id: area.ring_distance for area in FIXED_AREAS}


def areas_response() -> DemoAreasResponse:
    """Return the contract table verbatim so clients never hardcode locations."""
    return DemoAreasResponse(areas=list(FIXED_AREAS))


def area_cell(origin: str, ring_distance: int, index: int) -> str:
    """Pick a res-11 cell at exactly the contract ring distance, spread for map overlap."""
    if ring_distance == 0:
        return origin
    cells: Sequence[str] = sorted(
        set(h3.grid_disk(origin, ring_distance)) - set(h3.grid_disk(origin, ring_distance - 1))
    )
    return cells[index % len(cells)]
