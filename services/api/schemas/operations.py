"""Operations & Impact response shapes: aggregate counts only, never identities.

Mirrors ``apps/web/lib/types/operations.ts``. Nothing here carries a student, claim,
host or session identifier, a nickname, a preference, a token, a CARE priority, a
private photo or a location beyond the verified host pickup building. Pantry movement
is always a simulation; student pickups are a recorded app state, not independently
verified physical collection.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from services.api.schemas.api import Building, ContractModel

OperationsPeriod = Literal["today", "7d", "30d", "all"]
ActivityKind = Literal[
    "listing_published",
    "reservation_opened",
    "student_pickup",
    "pantry_requested",
    "pantry_accepted",
    "pantry_rejected",
    "pantry_handoff",
    "pantry_expired",
]


def _count() -> int:
    return Field(ge=0)


class OperationsDataset(ContractModel):
    """Provenance of the rows being shown; ``recording`` is always simulated data."""

    kind: Literal["current", "recording"]
    label: str
    is_simulated: bool
    seed_version: str | None
    anchor_time: datetime | None


class OperationsSummary(ContractModel):
    published_listings: int = _count()
    active_listings: int = _count()
    total_servings_offered: int = _count()
    available_servings: int = _count()
    student_reserved_servings: int = _count()
    student_pickups: int = _count()
    pantry_reserved_servings: int = _count()
    pantry_transfers: int = _count()
    expired_unclaimed_servings: int = _count()
    pending_pickup_reviews: int = _count()
    pending_pantry_requests: int = _count()
    buildings_served: int = _count()
    joined_sessions: int = _count()
    student_pickup_rate_percent: float = Field(ge=0, le=100)
    combined_recovery_rate_percent: float = Field(ge=0, le=100)
    average_reservation_seconds: float | None = Field(ge=0)
    participating_hosts: int = _count()
    participating_students: int = _count()


class OperationsOutcomes(ContractModel):
    """Six mutually exclusive buckets that always sum to servings offered."""

    available: int = _count()
    student_reserved: int = _count()
    student_pickups: int = _count()
    pantry_reserved: int = _count()
    pantry_transfers: int = _count()
    expired_unclaimed: int = _count()


class OperationsSeriesPoint(ContractModel):
    """One New York day; every count is dated by its own durable event timestamp."""

    date: str
    published_listings: int = _count()
    servings_offered: int = _count()
    student_pickups: int = _count()
    pantry_transfers: int = _count()
    expired_unclaimed: int = _count()


class OperationsBuilding(ContractModel):
    building: Building
    published_listings: int = _count()
    active_listings: int = _count()
    available_servings: int = _count()
    student_reserved_servings: int = _count()
    student_pickups: int = _count()
    pantry_reserved_servings: int = _count()
    pantry_transfers: int = _count()
    total_servings_offered: int = _count()
    expired_unclaimed_servings: int = _count()


class OperationsActivity(ContractModel):
    kind: ActivityKind
    occurred_at: datetime
    drop_id: UUID
    food: str
    building_name: str
    servings: int = _count()
    is_simulated: bool


class OperationsCategory(ContractModel):
    category: str
    published_listings: int = _count()
    total_servings_offered: int = _count()
    student_pickups: int = _count()
    pantry_transfers: int = _count()


class OperationsListing(ContractModel):
    """One unexpired selected listing; the photo is the bearer-scoped relative path only."""

    drop_id: UUID
    food: str
    category: str
    building: Building
    room: str
    published_at: datetime
    expires_at: datetime
    status: Literal["live", "claimed_out"]
    has_photo: bool
    photo_url: str | None
    total_servings: int = _count()
    available: int = _count()
    held: int = _count()
    picked_up: int = _count()
    pantry_held: int = _count()
    pantry_transferred: int = _count()


class OperationsEstimates(ContractModel):
    """Illustrative, server-configured per-serving assumptions; never measured impact."""

    currency: Literal["USD"] = "USD"
    meal_value_per_serving: float = Field(ge=0)
    food_kg_per_serving: float = Field(ge=0)
    recovered_servings: int = _count()
    equivalent_meal_value: float = Field(ge=0)
    recovered_food_kg: float = Field(ge=0)
    assumptions: list[str]


class OperationsResponse(ContractModel):
    schema_version: Literal[1] = 1
    dataset: OperationsDataset
    recording_available: bool
    period: OperationsPeriod
    timezone: Literal["America/New_York"] = "America/New_York"
    window_start: datetime | None
    server_time: datetime
    summary: OperationsSummary
    outcomes: OperationsOutcomes
    series: list[OperationsSeriesPoint]
    buildings: list[OperationsBuilding]
    activity: list[OperationsActivity]
    categories: list[OperationsCategory]
    active_listings: list[OperationsListing]
    estimates: OperationsEstimates
    notes: list[str]


class RecordingDatasetRequest(ContractModel):
    """Loading replaces all demo app data, so the caller must confirm explicitly."""

    confirm_reset: Literal[True]
