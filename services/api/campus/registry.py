"""Load the Marietta building dataset once, keeping only verified, dispatchable entries."""

import json
import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from math import isfinite
from pathlib import Path
from typing import Literal

import h3
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from services.api.schemas.api import Building, BuildingCategory, BuildingSource, BuildingsResponse

logger = logging.getLogger(__name__)
DATASET_PATH = Path(__file__).resolve().parents[3] / "data/campus/marietta.json"
RESOLUTION = 11


class CampusDatasetError(ValueError):
    """The dataset exists but breaks the shared contract; refuse to guess locations."""


class _Record(BaseModel):
    """One dataset entry; extra research fields are tolerated but never served."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=80, pattern=r"^ksu-marietta-[a-z0-9]+(-[a-z0-9]+)*$")
    name: str = Field(min_length=1, max_length=120)
    building_code: str | None = Field(max_length=20)
    building_number: str | None = Field(max_length=20)
    category: BuildingCategory
    latitude: float | None
    longitude: float | None
    verification_status: Literal["verified", "unverified"]
    sources: list[BuildingSource]

    @model_validator(mode="after")
    def verified_has_location(self) -> "_Record":
        """A verified entry must carry real coordinates and the evidence for them."""
        if self.verification_status == "verified":
            if self.latitude is None or self.longitude is None:
                raise ValueError("verified building requires coordinates")
            if not (isfinite(self.latitude) and isfinite(self.longitude)):
                raise ValueError("coordinates must be finite")
            if not (-90 <= self.latitude <= 90 and -180 <= self.longitude <= 180):
                raise ValueError("coordinates out of range")
            if not self.sources:
                raise ValueError("verified building requires sources")
        return self


class _Dataset(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schema_version: Literal[1]
    campus: Literal["marietta"]
    buildings: list[_Record]


@dataclass(frozen=True)
class CampusRegistry:
    """Verified buildings by canonical ID with their precomputed H3 origin cells."""

    buildings: Mapping[str, Building] = field(default_factory=dict)
    cells: Mapping[str, str] = field(default_factory=dict)

    @classmethod
    def from_buildings(cls, buildings: Iterable[Building]) -> "CampusRegistry":
        """Index verified buildings so lookups and H3 cells stay consistent."""
        ordered = sorted(buildings, key=lambda b: (b.category, b.name.lower(), b.id))
        by_id = {b.id: b for b in ordered}
        if len(by_id) != len(ordered):
            raise CampusDatasetError("Duplicate building id in campus dataset")
        cells = {b.id: h3.latlng_to_cell(b.latitude, b.longitude, RESOLUTION) for b in ordered}
        return cls(buildings=by_id, cells=cells)

    def get(self, building_id: str) -> Building | None:
        """Return a dispatchable building, or None for unknown or unverified IDs."""
        return self.buildings.get(building_id)

    def response(self) -> BuildingsResponse:
        """Public directory of verified buildings, grouped-friendly by category order."""
        return BuildingsResponse(campus="marietta", buildings=list(self.buildings.values()))


def parse_registry(raw: object) -> CampusRegistry:
    """Validate the shared dataset contract and drop unverified entries from selection."""
    try:
        dataset = _Dataset.model_validate(raw)
    except ValidationError as exc:
        raise CampusDatasetError(
            f"Campus dataset failed validation ({exc.error_count()} errors)"
        ) from None
    ids = [record.id for record in dataset.buildings]
    if len(set(ids)) != len(ids):
        raise CampusDatasetError("Duplicate building id in campus dataset")
    return CampusRegistry.from_buildings(
        Building(
            id=record.id,
            name=record.name,
            building_code=record.building_code,
            building_number=record.building_number,
            category=record.category,
            latitude=record.latitude,
            longitude=record.longitude,
            verification_status="verified",
            sources=record.sources,
        )
        for record in dataset.buildings
        if record.verification_status == "verified"
    )


def load_registry(path: Path = DATASET_PATH) -> CampusRegistry:
    """Read the dataset if present; an absent file means no campus buildings yet."""
    if not path.exists():
        logger.warning("Campus dataset not found; only rehearsal locations are available")
        return CampusRegistry()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CampusDatasetError("Campus dataset is unreadable") from exc
    return parse_registry(raw)
