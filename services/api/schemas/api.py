"""Freeze public shapes so independent clients and services agree on safe data."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Allergen = Literal[
    "dairy", "egg", "gluten", "peanut", "tree_nut", "soy", "fish", "shellfish", "sesame"
]
Diet = Literal["vegetarian", "vegan", "halal", "kosher", "pork_free"]


class ContractModel(BaseModel):
    """Reject unexpected fields to catch contract drift early."""

    model_config = ConfigDict(extra="forbid")


class FoodItem(ContractModel):
    name: str = Field(min_length=1, max_length=100)
    portion_unit: str = Field(min_length=1, max_length=40)
    count_estimate: int = Field(ge=0, le=1000)


class VisionEstimate(ContractModel):
    items: list[FoodItem] = Field(min_length=1, max_length=30)
    servings_estimate: int = Field(ge=1, le=500)
    servings_low: int = Field(ge=1, le=500)
    servings_high: int = Field(ge=1, le=500)
    allergens_likely: list[Allergen]
    diet_tags: list[Diet]
    confidence: float = Field(ge=0, le=1)
    notes: str = Field(max_length=1000)

    @model_validator(mode="after")
    def ordered_range(self) -> "VisionEstimate":
        """Keep uncertainty ranges meaningful for the host."""
        if not self.servings_low <= self.servings_estimate <= self.servings_high:
            raise ValueError("serving estimate must lie inside low/high range")
        return self


class SafetyReview(ContractModel):
    covered_and_temperature_safe: bool
    served_within_two_hours: bool
    untouched: bool
    ingredient_information_checked: bool = False
    religious_diets_confirmed: bool = False


class DropEdit(ContractModel):
    servings_final: int = Field(ge=1, le=500)
    allergens_final: list[Allergen]
    diet_tags_final: list[Diet]
    building_code: str = Field(min_length=1, max_length=40)
    room: str = Field(default="", max_length=80)
    expires_in_minutes: int = Field(default=45, ge=1, le=120)
    safety_review: SafetyReview


class Counts(ContractModel):
    total: int
    available: int
    held: int
    picked_up: int


class DropResponse(ContractModel):
    id: UUID
    status: Literal["draft", "live", "claimed_out", "expired"]
    building_code: str
    room: str
    vision: VisionEstimate
    vision_source: Literal["fixture", "gemini"]
    servings_final: int
    allergens_final: list[Allergen]
    diet_tags_final: list[Diet]
    safety_review: SafetyReview | None
    counts: Counts
    created_at: datetime
    expires_at: datetime | None
    allergen_notice: str = "may contain, confirm with host"
    is_demo: bool


class ClaimResponse(ContractModel):
    id: UUID
    invite_id: UUID
    drop_id: UUID
    status: Literal["held", "picked_up", "released", "expired"]
    held_until: datetime


class InviteResponse(ContractModel):
    id: UUID
    drop: DropResponse
    status: Literal["sent", "claimed", "declined", "expired"]
    expires_at: datetime
    claim: ClaimResponse | None = None


class InvitesResponse(ContractModel):
    invites: list[InviteResponse]


class WaveResponse(ContractModel):
    number: int
    ring_k: int
    planned_at: datetime
    invite_count: int


class PersonaDecision(ContractModel):
    label: str
    is_simulated: Literal[True] = True
    ring_distance: int | None
    status: str
    reason_codes: list[str]
    h3_cell: str | None


class DispatchResponse(ContractModel):
    drop_id: UUID
    status: str
    origin_cell: str
    ring_k: int
    counts: Counts
    waves: list[WaveResponse]
    personas: list[PersonaDecision]
    next_wave_at: datetime | None
    server_time: datetime
    is_demo: bool


class DemoTick(ContractModel):
    advance_seconds: int = Field(default=10, ge=0, le=7200)


class DemoResetResponse(ContractModel):
    status: Literal["reset"] = "reset"
    students: int
    personas: dict[str, UUID]


class DemoActiveDropResponse(ContractModel):
    """Let the synthetic projector find a host's drop across devices."""

    drop_id: UUID | None


class Preferences(ContractModel):
    allergens: list[Allergen]
    diets: list[Diet]
    alerts_paused: bool = False


class PresenceRequest(ContractModel):
    building_code: str


class PushTokenRequest(ContractModel):
    token: str = Field(min_length=1, max_length=4096)


class PresenceResponse(ContractModel):
    valid_until: datetime


class PushTokenResponse(ContractModel):
    registered: bool


class DemoTickResponse(ContractModel):
    server_time: datetime


class ErrorDetail(ContractModel):
    code: str
    message: str


class ErrorResponse(ContractModel):
    detail: ErrorDetail
