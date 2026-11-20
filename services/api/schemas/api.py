"""Freeze public shapes so independent clients and services agree on safe data."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Allergen = Literal[
    "dairy", "egg", "gluten", "peanut", "tree_nut", "soy", "fish", "shellfish", "sesame"
]
Diet = Literal["vegetarian", "vegan", "halal", "kosher", "pork_free"]
BuildingCategory = Literal["academic", "student_life", "housing", "other"]
# A canonical campus building ID or a legacy rehearsal ID; the server validates which.
LocationId = Annotated[str, Field(min_length=1, max_length=80)]
# Snapshotted per drop at publication; legacy drops without a snapshot are seeded waves.
DistributionMode = Literal["campus_feed", "seeded_waves"]
UnavailableReason = Literal[
    "allergen_conflict", "diet_mismatch", "active_claim", "capacity", "already_reserved"
]


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


class BuildingSource(ContractModel):
    url: str = Field(min_length=1, max_length=500, pattern=r"^https?://")
    title: str = Field(min_length=1, max_length=200)


class Building(ContractModel):
    """A verified campus building; public map data, never a student's location."""

    id: str = Field(min_length=1, max_length=80, pattern=r"^ksu-marietta-[a-z0-9]+(-[a-z0-9]+)*$")
    name: str = Field(min_length=1, max_length=120)
    building_code: str | None = Field(default=None, max_length=20)
    building_number: str | None = Field(default=None, max_length=20)
    category: BuildingCategory
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    verification_status: Literal["verified"] = "verified"
    sources: list[BuildingSource] = Field(min_length=1)


class BuildingsResponse(ContractModel):
    campus: Literal["marietta"] = "marietta"
    buildings: list[Building]


class DropEdit(ContractModel):
    servings_final: int = Field(ge=1, le=500)
    allergens_final: list[Allergen]
    diet_tags_final: list[Diet]
    building_code: LocationId
    room: str = Field(default="", max_length=80)
    pickup_instructions: str = Field(default="", max_length=500)
    expires_in_minutes: int = Field(default=45, ge=1, le=120)
    safety_review: SafetyReview


class Counts(ContractModel):
    """Per-drop inventory: total = available + held + picked_up + pantry_held + pantry_transferred.

    ``held`` and ``picked_up`` are student holds and pickups only; simulated pantry
    allocations are reported separately and never folded into student pickups.
    """

    total: int
    available: int
    held: int
    picked_up: int
    pantry_held: int = Field(default=0, ge=0)
    pantry_transferred: int = Field(default=0, ge=0)


class DropResponse(ContractModel):
    id: UUID
    status: Literal["draft", "live", "claimed_out", "expired"]
    building_code: str
    room: str
    pickup_instructions: str = ""
    building: Building | None = None
    vision: VisionEstimate
    vision_source: Literal["fixture", "gemini", "openrouter"]
    servings_final: int
    allergens_final: list[Allergen]
    diet_tags_final: list[Diet]
    safety_review: SafetyReview | None
    counts: Counts
    created_at: datetime
    expires_at: datetime | None
    allergen_notice: str = "may contain, confirm with host"
    distribution_mode: DistributionMode = "seeded_waves"
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
    wave_number: int | None = None


DemoAreaId = Literal["demo-venue", "demo-next-door", "demo-across-quad", "demo-far-side"]
Scenario = Literal["visitors", "seeded"]


class DemoArea(ContractModel):
    """A labeled, unverified demo location mapped server-side to an H3 ring."""

    id: DemoAreaId
    label: str
    description: str
    ring_distance: int


class DemoAreasResponse(ContractModel):
    areas: list[DemoArea]


class JoinRequest(ContractModel):
    """Everything a visitor shares to join; no contact details, identity or location.

    ``area`` is deprecated: honored only for explicit seeded rehearsal callers and ignored
    (never stored) in the campus-feed scenario.
    """

    nickname: str = Field(min_length=1, max_length=24, pattern=r"^[A-Za-z0-9 _.-]+$")
    area: LocationId | None = None
    allergens: list[Allergen] = Field(default_factory=list)
    diets: list[Diet] = Field(default_factory=list)


class SessionStudent(ContractModel):
    id: UUID
    nickname: str
    area: LocationId | None = None
    allergens: list[Allergen]
    diets: list[Diet]
    kind: Literal["visitor"] = "visitor"
    valid_until: datetime


class JoinResponse(ContractModel):
    """The bearer token is shown once; the client keeps it in local storage."""

    token: str
    student: SessionStudent


class SessionLeftResponse(ContractModel):
    status: Literal["left"] = "left"


class VisitorDecision(ContractModel):
    """Projector row for a joined visitor; never includes which allergen or diet applied."""

    nickname: str
    area: LocationId | None = None
    ring_distance: int | None
    status: str
    reason_codes: list[str]
    h3_cell: str | None
    wave_number: int | None = None


class DispatchResponse(ContractModel):
    drop_id: UUID
    status: str
    origin_cell: str
    ring_k: int
    counts: Counts
    waves: list[WaveResponse]
    personas: list[PersonaDecision]
    visitors: list[VisitorDecision] = Field(default_factory=list)
    scenario: Scenario = "seeded"
    distribution_mode: DistributionMode = "seeded_waves"
    next_wave_at: datetime | None
    server_time: datetime
    is_demo: bool


class FeedDrop(ContractModel):
    """One campus-wide listing judged only against the caller's own preferences."""

    drop: DropResponse
    can_reserve: bool
    unavailable_reason: UnavailableReason | None
    claim: ClaimResponse | None


class FeedResponse(ContractModel):
    drops: list[FeedDrop]
    server_time: datetime
    is_demo: bool


class BuildingDistribution(ContractModel):
    """Host pickup aggregate per building; never a student position."""

    building_code: str
    building: Building | None
    active_drops: int
    available_drops: int = Field(ge=0)
    counts: Counts


class CampusDistributionResponse(ContractModel):
    distribution_mode: DistributionMode
    active_drops: int
    available_drops: int = Field(ge=0)
    joined_students: int
    counts: Counts
    buildings: list[BuildingDistribution]
    server_time: datetime
    is_demo: bool


class DemoTick(ContractModel):
    advance_seconds: int = Field(default=10, ge=0, le=7200)


class DemoResetRequest(ContractModel):
    scenario: Scenario = "seeded"


class DemoResetResponse(ContractModel):
    status: Literal["reset"] = "reset"
    students: int
    personas: dict[str, UUID]
    scenario: Scenario = "seeded"


class DemoStatusResponse(ContractModel):
    """Presenter overview that is safe to show on a projector."""

    scenario: Scenario
    visitors: int
    active_drop_id: UUID | None
    server_time: datetime
    clock_offset_seconds: int


class DemoActiveDropResponse(ContractModel):
    """Let the synthetic projector find a host's drop across devices."""

    drop_id: UUID | None


class Preferences(ContractModel):
    allergens: list[Allergen]
    diets: list[Diet]
    alerts_paused: bool = False


class PresenceRequest(ContractModel):
    building_code: LocationId


class PushTokenRequest(ContractModel):
    token: str = Field(min_length=1, max_length=4096)


class PresenceResponse(ContractModel):
    valid_until: datetime


class PushTokenResponse(ContractModel):
    registered: bool


class DemoTickResponse(ContractModel):
    server_time: datetime


MatchStatus = Literal["consistent", "uncertain", "inconsistent"]
ReviewStatus = Literal["not_requested", "pending", "approved", "rejected", "expired", "superseded"]
PickupSource = Literal["fixture", "openrouter"]
PICKUP_NOTICE = (
    "Photo-assisted confirmation. A photo cannot independently establish physical "
    "pickup or food safety."
)


class PickupVerification(ContractModel):
    """A student's own photo-assisted check; never proof of pickup or food safety."""

    id: UUID
    claim_id: UUID
    status: Literal["processing", "ready", "failed"]
    match_status: MatchStatus | None
    confidence: float | None
    explanation: str
    source: PickupSource
    created_at: datetime
    review_status: ReviewStatus
    can_confirm: bool
    notice: str = PICKUP_NOTICE


class PickupVerificationResponse(ContractModel):
    verification: PickupVerification | None


class PickupRequest(ContractModel):
    """Optional for legacy seeded rehearsal; required for campus-feed pickups."""

    verification_id: UUID | None = None


class PickupReviewRequest(ContractModel):
    verification_id: UUID


class HostPickupReview(ContractModel):
    """De-identified assessment metadata; the opaque ID is neither a student nor a claim ID."""

    id: UUID
    drop_id: UUID
    match_status: MatchStatus
    confidence: float
    explanation: str
    source: PickupSource
    created_at: datetime
    held_until: datetime
    review_status: ReviewStatus
    notice: str = PICKUP_NOTICE


class HostPickupReviewsResponse(ContractModel):
    reviews: list[HostPickupReview]
    server_time: datetime


class HostReviewDecision(ContractModel):
    decision: Literal["approve", "reject"]


class ErrorDetail(ContractModel):
    code: str
    message: str


class ErrorResponse(ContractModel):
    detail: ErrorDetail


PantryStatus = Literal[
    "suggested", "requested", "accepted", "handoff_confirmed", "rejected", "expired"
]
PANTRY_NOTICE = (
    "Demo only — no request is sent to KSU CARE. KSU catering policy prohibits removing "
    "leftovers from event spaces. This simulation does not authorize redistribution or "
    "establish food safety."
)


class PantryDestination(ContractModel):
    """The verified demo pantry destination; directions target the building point only."""

    name: str
    building: Building
    room: str
    directions_url: str
    care_source_url: str
    catering_policy_url: str


class PantryReferral(ContractModel):
    """A simulated pantry referral; never a real request, approval or food-safety claim."""

    id: UUID
    drop_id: UUID
    status: PantryStatus
    requested_servings: int = Field(ge=0)
    accepted_servings: int = Field(ge=0)
    transferred_servings: int = Field(ge=0)
    eligible_servings: int = Field(ge=0)
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    destination: PantryDestination
    drop: DropResponse
    notice: str = PANTRY_NOTICE
    is_demo: Literal[True] = True


class HostPantryReferralResponse(ContractModel):
    referral: PantryReferral | None
    destination: PantryDestination
    notice: str = PANTRY_NOTICE
    is_demo: Literal[True] = True


class PantryReferralRequest(ContractModel):
    """Acknowledging the demo notice never waives KSU catering policy."""

    servings: int = Field(ge=1, le=500)
    demo_policy_acknowledged: Literal[True]


class PantryHandoffRequest(ContractModel):
    demo_handoff_confirmed: Literal[True]


class PantryDecisionRequest(ContractModel):
    decision: Literal["accept", "reject"]
    servings: int | None = Field(default=None, ge=1, le=500)
    demo_policy_acknowledged: Literal[True]

    @model_validator(mode="after")
    def accept_needs_servings(self) -> "PantryDecisionRequest":
        """An acceptance must name its quantity so it can never silently overbook."""
        if self.decision == "accept" and self.servings is None:
            raise ValueError("accept requires servings")
        return self


class PantryReferralsResponse(ContractModel):
    referrals: list[PantryReferral]
    server_time: datetime
    is_demo: Literal[True] = True
