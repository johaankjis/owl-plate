"""Coordinate private persistence and pure decisions behind thin HTTP routes."""

import json
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal, TypeVar
from uuid import UUID, uuid4

import h3
from sqlalchemy import Engine, delete, inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, SQLModel, select

from services.api.campus import CampusRegistry, load_registry
from services.api.db.models import (
    Claim,
    Coordinator,
    DemoSettings,
    Drop,
    FeedNotification,
    HostPickupNotification,
    Invite,
    PantryReferral,
    PickupAttempt,
    Student,
    VisitorSession,
    Wave,
)
from services.api.db.session import transaction
from services.api.dispatch import CandidateView, DropView, plan_wave
from services.api.dispatch.config import INITIAL_RING, MAX_RING, RING_STEP
from services.api.feed import (
    FEED_STATUSES,
    MODE_BY_SCENARIO,
    active_feed_drops,
    announcement_eligible,
    distribution_rows,
    drop_mode,
    enqueue_announcements,
    feed_invite,
    has_active_hold,
    own_feed_claim,
    preference_conflict,
    unavailable_reason,
)
from services.api.pantry import (
    PantryError,
    allocation,
    confirm_handoff,
    decide,
    destination,
    expire_with_drop,
    referral_for,
    referral_response,
    request,
    suggest_if_due,
)
from services.api.pickup.contract import PickupAssessment
from services.api.pickup.service import (
    PickupError,
    complete_with_result,
    decide_review,
    enqueue_host_update,
    host_update_body,
    latest_attempt,
    listing_items,
    own_attempt,
    pending_reviews,
    record_result,
    request_review,
    require_confirmable,
    review_response,
    start_attempt,
    sweep,
    verification_response,
)
from services.api.pickup.verifiers import PickupVerifier
from services.api.providers.notifications import HostPushRegistry
from services.api.schemas.api import (
    BuildingsResponse,
    CampusDistributionResponse,
    ClaimResponse,
    Counts,
    DemoActiveDropResponse,
    DemoAreasResponse,
    DemoResetResponse,
    DemoStatusResponse,
    DispatchResponse,
    DistributionMode,
    DropEdit,
    DropResponse,
    FeedDrop,
    FeedResponse,
    HostDropsResponse,
    HostPantryReferralResponse,
    HostPickupReview,
    HostPickupReviewsResponse,
    InviteResponse,
    InvitesResponse,
    JoinRequest,
    JoinResponse,
    PantryDestination,
    PantryReferralsResponse,
    PersonaDecision,
    PickupVerification,
    PickupVerificationResponse,
    Preferences,
    PushTokenResponse,
    SafetyReview,
    Scenario,
    SessionLeftResponse,
    SessionStudent,
    StudentReservation,
    StudentReservationsResponse,
    VisionEstimate,
    WaveResponse,
)
from services.api.schemas.api import PantryReferral as PantryReferralOut
from services.api.sessions import (
    TOKEN_PREFIX,
    SessionError,
    areas_response,
    create_session,
    end_session,
    move_session,
    require_session,
    resolve_token,
    session_student,
    visitor_count,
    visitor_decisions,
)
from services.api.storage.photos import (
    has_stored_photo,
    photo_bytes,
    photo_path,
    publish_photo,
    purge_all_photos,
    purge_expired_photos,
    store_photo,
)
from services.api.vision.errors import VisionUnavailable

logger = logging.getLogger(__name__)
T = TypeVar("T")
VisionCallable = Callable[
    [bytes, str], tuple[VisionEstimate, Literal["fixture", "gemini", "openrouter"]]
]
ALLERGENS = ["dairy", "egg", "gluten", "peanut", "tree_nut", "soy", "fish", "shellfish", "sesame"]
RELIGIOUS_DIETS = {"halal", "kosher", "pork_free"}
SEED_PATH = Path(__file__).resolve().parents[2] / "data/seed/demo.json"
HOLD_DURATION = timedelta(minutes=10)
MAX_PHOTO_BYTES = 10 * 1024 * 1024
# Optional per-deployment tables, created only when FCM composition imports them.
PUSH_REGISTRATION_TABLES = ("pushregistration", "hostpushregistration")


@dataclass(frozen=True)
class Actor:
    role: Literal["host", "student", "projector", "pantry_coordinator"]
    id: str


class DomainError(Exception):
    """Carry stable contract errors without leaking stored objects."""

    def __init__(self, code: str, message: str, status: int = 409) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def timestamp(value: str) -> datetime:
    """Restore timezone-aware instants from portable JSON timestamp storage."""
    return datetime.fromisoformat(value).astimezone(UTC)


def grid_distance(origin: str, cell: str) -> int | None:
    """Treat incompatible or unresolvable H3 cells as outside the search."""
    try:
        if h3.get_resolution(origin) != 11 or h3.get_resolution(cell) != 11:
            return None
        return h3.grid_distance(origin, cell)
    except (ValueError, h3.H3BaseException):
        return None


def fixture_vision(photo: bytes, host_note: str = "") -> tuple[VisionEstimate, Literal["fixture"]]:
    """Provide an explicitly synthetic estimate for isolated demo integration."""
    return VisionEstimate(
        items=[{"name": "Simulated tray", "portion_unit": "serving", "count_estimate": 8}],
        servings_estimate=8,
        servings_low=6,
        servings_high=10,
        allergens_likely=["dairy", "gluten"],
        diet_tags=[],
        confidence=0.8,
        notes="Simulated fixture estimate",
    ), "fixture"


class Backend:
    """Keep all state transitions inside a shared database transaction boundary."""

    def __init__(
        self,
        engine: Engine,
        *,
        analyze: VisionCallable | None = None,
        validate_photo: Callable[[bytes], bytes] | None = None,
        notify: Callable[..., None] | None = None,
        verify_pickup: PickupVerifier | None = None,
        demo_mode: bool = False,
        auth_mode: str = "",
        clock: Callable[[], datetime] | None = None,
        buildings: Mapping[str, str] | None = None,
        campus: CampusRegistry | None = None,
        authenticate: Callable[[str], Actor] | None = None,
    ) -> None:
        self.engine = engine
        self.analyze = analyze
        self.validate_photo = validate_photo
        self.notify = notify
        self.notify_host: Callable[[str, str, str, str], None] | None = None
        self.verify_pickup = verify_pickup
        self.forget_push: Callable[[str], None] | None = None
        self.host_push: HostPushRegistry | None = None
        self.demo_mode = demo_mode
        self.auth_mode = auth_mode
        self.clock = clock or (lambda: datetime.now(UTC))
        self.authenticate = authenticate
        self.seed = json.loads(SEED_PATH.read_text())
        self.origin = h3.latlng_to_cell(self.seed["origin"]["lat"], self.seed["origin"]["lng"], 11)
        self.campus = campus if campus is not None else load_registry()
        # Legacy rehearsal codes map straight to cells; campus IDs go through the registry.
        self.buildings = dict(buildings or {})
        if demo_mode:
            self.buildings[self.seed["origin"]["building_code"]] = self.origin
        for cell in self.buildings.values():
            if not h3.is_valid_cell(cell) or h3.get_resolution(cell) != 11:
                raise ValueError("Building cells must be H3 resolution 11")

    def actor(self, token: str) -> Actor:
        """Enable synthetic credentials only under both explicit demo gates."""
        if self.demo_mode and self.auth_mode == "demo":
            if token == "demo-host":
                return Actor("host", "demo-host")
            if token == "demo-projector":
                return Actor("projector", "demo-projector")
            if token == "demo-pantry-coordinator":
                # Simulated coordinator only; no KSU account, partner or real sign-in.
                return Actor("pantry_coordinator", "demo-pantry-coordinator")
            if token.startswith("demo-student-"):
                label = token.removeprefix("demo-student-")
                for student in self.seed["students"][:5]:
                    if student["label"] == label:
                        return Actor("student", student["id"])
        if token.startswith(TOKEN_PREFIX):
            student_id = None
            if self.demo_mode and self.auth_mode == "demo":
                with Session(self.engine) as session:
                    student_id = resolve_token(session, token)
            if student_id is None:
                raise DomainError("unauthorized", "Session ended. Join again.", 401)
            return Actor("student", student_id)
        if token.startswith("demo-") or self.authenticate is None:
            raise DomainError("unauthorized", "Sign in required.", 401)
        return self.authenticate(token)

    def require(self, actor: Actor, role: str, *, demo: bool = False) -> None:
        """Centralize role and demo gates so service callers get the same protection."""
        if actor.role != role or (demo and not (self.demo_mode and self.auth_mode == "demo")):
            raise DomainError("forbidden", "Access denied.", 403)

    def require_presenter(self, actor: Actor) -> None:
        """Presenter controls run from the host screen or the projector, demo only."""
        if actor.role not in {"host", "projector"} or not (
            self.demo_mode and self.auth_mode == "demo"
        ):
            raise DomainError("forbidden", "Access denied.", 403)

    def _demo_gates(self) -> bool:
        """Both explicit demo switches; synthetic roles never work without them."""
        return self.demo_mode and self.auth_mode == "demo"

    def _require_demo(self) -> None:
        """Restrict unauthenticated demo surfaces to explicit demo gates."""
        if not self._demo_gates():
            raise DomainError("forbidden", "Access denied.", 403)

    def areas(self) -> DemoAreasResponse:
        """Return the four fixed, unverified demo areas under demo gates only."""
        self._require_demo()
        return areas_response()

    def campus_buildings(self) -> BuildingsResponse:
        """Public directory of verified buildings; no student location is involved."""
        return self.campus.response()

    def _location_cell(self, building_code: str) -> str:
        """Resolve a host or check-in location, refusing anything not verified or rehearsal."""
        cell = self.campus.cells.get(building_code) or self.buildings.get(building_code)
        if cell is None:
            raise DomainError("invalid_building", "Choose a building from the campus list.", 422)
        return cell

    def _session_run(self, operation: Callable[[Session, datetime], T]) -> T:
        """Run visitor-session logic and map its failures to contract errors."""
        try:
            return self._run(operation)
        except SessionError as exc:
            raise DomainError(exc.code, exc.message, exc.status) from None

    def _pantry_run(self, operation: Callable[[Session, datetime], T]) -> T:
        """Run pantry rules and map their failures to contract errors."""
        try:
            return self._run(operation)
        except PantryError as exc:
            raise DomainError(exc.code, exc.message, exc.status) from None

    def _pickup_run(self, operation: Callable[[Session, datetime], T]) -> T:
        """Run pickup rules and map their failures to contract errors."""
        try:
            return self._run(operation)
        except PickupError as exc:
            raise DomainError(exc.code, exc.message, exc.status) from None

    def join(self, request: JoinRequest) -> JoinResponse:
        """Create a distinct visitor session per docs/API_CONTRACT.md v2."""
        self._require_demo()
        return self._session_run(
            lambda session, now: create_session(
                session,
                origin=self.origin,
                now=now,
                request=request,
                campus=self.campus,
                location_free=self._mode(session) == "campus_feed",
            )
        )

    def session_me(self, actor: Actor) -> SessionStudent:
        """Return the caller's own visitor session, or nothing for seeded personas."""

        def operation(session: Session, now: datetime) -> SessionStudent:
            return session_student(session, require_session(session, actor.id))

        return self._session_run(operation)

    def leave(self, actor: Actor) -> SessionLeftResponse:
        """Revoke the visitor token, release holds, decline pending invites, forget the device."""

        def operation(session: Session, now: datetime) -> SessionLeftResponse:
            for drop in end_session(session, actor.id):
                self._refresh(session, drop)
            sweep(session, now)
            return SessionLeftResponse()

        result = self._session_run(operation)
        if self.forget_push is not None:
            self.forget_push(actor.id)
        return result

    def is_visitor(self, student_id: str) -> bool:
        """Tell the push policy whether this ID is a current joined visitor."""
        with Session(self.engine) as session:
            return self._is_visitor_in(session, student_id)

    def demo_status(self, actor: Actor) -> DemoStatusResponse:
        """Give presenter controls a projector-safe overview."""
        self.require_presenter(actor)

        def operation(session: Session, now: datetime) -> DemoStatusResponse:
            drop = self._active_drop(session)
            return DemoStatusResponse(
                scenario=self._scenario(session),
                visitors=visitor_count(session),
                active_drop_id=drop.id if drop else None,
                server_time=now,
                clock_offset_seconds=session.get(Coordinator, 1).clock_offset,
            )

        return self._run(operation)

    def _scenario(self, session: Session) -> Scenario:
        """Read the presenter-selected scenario, defaulting to v1 behavior."""
        settings = session.get(DemoSettings, 1)
        return settings.scenario if settings else "seeded"

    def _mode(self, session: Session) -> DistributionMode:
        """Map the presenter scenario to the distribution new publications snapshot."""
        return MODE_BY_SCENARIO[self._scenario(session)]

    def _active_drop(self, session: Session) -> Drop | None:
        """Find the latest non-expired drop so presenters never share browser state."""
        return session.exec(
            select(Drop)
            .where(Drop.status.in_(["draft", "live", "claimed_out"]))
            .order_by(Drop.data["created_at"].as_string().desc(), Drop.id.desc())
            .limit(1)
        ).first()

    def _now(self, session: Session) -> datetime:
        now = self.clock()
        if now.tzinfo is None:
            raise ValueError("Clock must return timezone-aware UTC timestamps")
        return now.astimezone(UTC) + timedelta(seconds=session.get(Coordinator, 1).clock_offset)

    def _run(self, operation: Callable[[Session, datetime], T]) -> T:
        with transaction(self.engine) as session:
            now = self._now(session)
            self._expire(session, now)
            result = operation(session, now)
        return result

    def _get(self, session: Session, model: type[T], object_id: str) -> T:
        obj = session.get(model, object_id)
        if obj is None:
            raise DomainError("not_found", "Not found.", 404)
        return obj

    def _owned_drop(self, session: Session, actor: Actor, drop_id: str) -> Drop:
        self.require(actor, "host")
        drop = self._get(session, Drop, drop_id)
        if drop.host_id != actor.id:
            raise DomainError("not_found", "Not found.", 404)
        return drop

    def _owned_invite(self, session: Session, actor: Actor, invite_id: str) -> Invite:
        self.require(actor, "student")
        invite = self._get(session, Invite, invite_id)
        if invite.student_id != actor.id:
            raise DomainError("not_found", "Not found.", 404)
        return invite

    def _counts(self, session: Session, drop: Drop) -> Counts:
        """The one inventory invariant every feed, map, projector and host view shares."""
        claims = session.exec(select(Claim).where(Claim.drop_id == drop.id)).all()
        held = sum(c.status == "held" for c in claims)
        picked_up = sum(c.status == "picked_up" for c in claims)
        pantry_held, pantry_transferred = allocation(referral_for(session, drop.id))
        total = drop.data["servings_final"]
        return Counts(
            total=total,
            available=total - held - picked_up - pantry_held - pantry_transferred,
            held=held,
            picked_up=picked_up,
            pantry_held=pantry_held,
            pantry_transferred=pantry_transferred,
        )

    def _refresh(self, session: Session, drop: Drop) -> None:
        session.flush()
        if drop.status not in {"draft", "expired"}:
            drop.status = "claimed_out" if self._counts(session, drop).available == 0 else "live"
            session.add(drop)

    def _expire(self, session: Session, now: datetime) -> None:
        for drop in session.exec(select(Drop)).all():
            if drop.status == "draft":
                continue
            expired = now >= timestamp(drop.data["expires_at"])
            if expired:
                drop.status = "expired"
                session.add(drop)
            for invite in session.exec(select(Invite).where(Invite.drop_id == drop.id)).all():
                if invite.status == "sent" and (expired or now >= timestamp(invite.expires_at)):
                    invite.status = "expired"
                    session.add(invite)
            for claim in session.exec(select(Claim).where(Claim.drop_id == drop.id)).all():
                if claim.status == "held" and (expired or now >= timestamp(claim.held_until)):
                    claim.status = "expired"
                    session.add(claim)
            expire_with_drop(session, drop, now)
            self._refresh(session, drop)
            if drop.status == "live" and drop_mode(drop) == "campus_feed":
                suggest_if_due(session, drop, self._counts(session, drop).available, now)
        session.flush()
        sweep(session, now)
        # After drop statuses settle, so expired food never keeps a retrievable photo.
        purge_expired_photos(session, now)

    def _response(self, session: Session, drop: Drop) -> DropResponse:
        has_photo = drop.status != "expired" and has_stored_photo(session, drop.id)
        return DropResponse(
            id=drop.id,
            status=drop.status,
            building_code=drop.data["building_code"],
            room=drop.data["room"],
            pickup_instructions=drop.data.get("pickup_instructions", ""),
            building=drop.data.get("building"),
            vision=drop.data["vision"],
            vision_source=drop.data["vision_source"],
            servings_final=drop.data["servings_final"],
            allergens_final=drop.data["allergens_final"],
            diet_tags_final=drop.data["diet_tags_final"],
            safety_review=drop.data["safety_review"],
            counts=self._counts(session, drop),
            created_at=timestamp(drop.data["created_at"]),
            expires_at=timestamp(drop.data["expires_at"]) if drop.data["expires_at"] else None,
            distribution_mode=drop_mode(drop),
            is_demo=self.demo_mode,
            has_photo=has_photo,
            photo_url=photo_path(drop.id) if has_photo else None,
        )

    def _claim_response(self, claim: Claim) -> ClaimResponse:
        return ClaimResponse(
            id=claim.id,
            invite_id=claim.invite_id,
            drop_id=claim.drop_id,
            status=claim.status,
            held_until=timestamp(claim.held_until),
        )

    def _invite_response(self, session: Session, invite: Invite) -> InviteResponse:
        claim = session.exec(select(Claim).where(Claim.invite_id == invite.id)).first()
        return InviteResponse(
            id=invite.id,
            drop=self._response(session, self._get(session, Drop, invite.drop_id)),
            status=invite.status,
            expires_at=timestamp(invite.expires_at),
            claim=self._claim_response(claim) if claim else None,
        )

    def create_drop(self, actor: Actor, photo: bytes, host_note: str = "") -> DropResponse:
        """Run injected vision in memory before persisting only its safe estimate."""
        self.require(actor, "host")
        if len(photo) > 10 * 1024 * 1024:
            raise DomainError("photo_too_large", "Photo exceeds 10 MiB.", 413)
        if not photo or self.validate_photo is None:
            raise DomainError("invalid_photo", "A validated JPEG or PNG is required.", 422)
        try:
            photo = self.validate_photo(photo)
        except Exception as exc:
            raise DomainError("invalid_photo", "A valid JPEG or PNG is required.", 422) from exc
        if self.analyze is None:
            raise DomainError(
                "vision_unavailable",
                "Live Gemini is not configured on the server. No estimate was made.",
                503,
            )
        try:
            estimate, source = self.analyze(photo, host_note)
            estimate = VisionEstimate.model_validate(estimate).model_copy(deep=True)
            if source not in {"fixture", "gemini", "openrouter"} or (
                source == "fixture" and not self.demo_mode
            ):
                raise ValueError("Invalid source")
        except VisionUnavailable as exc:
            # The provider names itself for the host without keys, URLs or bodies; never fall back.
            raise DomainError("vision_unavailable", str(exc), 503) from exc
        except Exception as exc:
            # Live vision never falls back to the fixture: fail the request without a drop.
            raise DomainError(
                "vision_unavailable",
                "Live vision could not analyze this photo. No estimate was made.",
                503,
            ) from exc
        estimate.diet_tags = [d for d in estimate.diet_tags if d not in RELIGIOUS_DIETS]
        if estimate.confidence < 0.6:
            estimate.allergens_likely = list(ALLERGENS)

        def operation(session: Session, now: datetime) -> DropResponse:
            drop = Drop(
                id=str(uuid4()),
                host_id=actor.id,
                data={
                    "building_code": self.seed["origin"]["building_code"] if self.demo_mode else "",
                    "room": "",
                    "pickup_instructions": "",
                    "building": None,
                    "origin_cell": self.origin if self.demo_mode else "",
                    "vision": estimate.model_dump(mode="json"),
                    "vision_source": source,
                    "servings_final": estimate.servings_estimate,
                    "allergens_final": estimate.allergens_likely,
                    "diet_tags_final": estimate.diet_tags,
                    "safety_review": None,
                    "created_at": now.isoformat(),
                    "expires_at": None,
                    "expires_in_minutes": 45,
                    # Provisional for drafts; publication takes the binding snapshot.
                    "distribution_mode": self._mode(session),
                },
            )
            session.add(drop)
            session.flush()
            # The same sanitized bytes the vision provider saw; never the raw upload.
            store_photo(session, drop.id, photo, now)
            return self._response(session, drop)

        return self._run(operation)

    def edit_drop(self, actor: Actor, drop_id: str, edit: DropEdit) -> DropResponse:
        """Require explicit ingredient and religious review before relaxing estimates."""

        def operation(session: Session, now: datetime) -> DropResponse:
            drop = self._owned_drop(session, actor, drop_id)
            if drop.status != "draft":
                raise DomainError("invalid_state", "Only draft drops can be edited.")
            origin_cell = self._location_cell(edit.building_code)
            building = self.campus.get(edit.building_code)
            estimated = set(drop.data["vision"]["allergens_likely"])
            if (
                estimated - set(edit.allergens_final)
                and not edit.safety_review.ingredient_information_checked
            ):
                raise DomainError("safety_review_required", "Confirm ingredient information first.")
            if (
                set(edit.diet_tags_final) & RELIGIOUS_DIETS
                and not edit.safety_review.religious_diets_confirmed
            ):
                raise DomainError(
                    "safety_review_required", "Confirm religious diet information first."
                )
            drop.data = {
                **drop.data,
                **edit.model_dump(mode="json"),
                "origin_cell": origin_cell,
                # Snapshot the verified building so the drop keeps its place if data changes.
                "building": building.model_dump(mode="json") if building else None,
            }
            session.add(drop)
            return self._response(session, drop)

        return self._run(operation)

    def _candidates(self, session: Session, drop: Drop, now: datetime) -> list[CandidateView]:
        candidates = []
        cutoff = now - timedelta(days=7)
        for student in session.exec(select(Student)).all():
            data = student.data
            invites = session.exec(select(Invite).where(Invite.student_id == student.id)).all()
            claims = session.exec(select(Claim).where(Claim.student_id == student.id)).all()
            candidates.append(
                CandidateView(
                    student_id=student.id,
                    cell=data.get("cell"),
                    allergens=frozenset(data.get("allergens", [])),
                    diets=frozenset(data.get("diets", [])),
                    priority=data.get("priority", False),
                    claims_last_7d=data.get("claims_last_7d", 0)
                    + sum(
                        c.status in {"held", "picked_up"} and timestamp(c.created_at) >= cutoff
                        for c in claims
                    ),
                    invites_last_7d=sum(timestamp(i.sent_at) >= cutoff for i in invites),
                    ignored_last_7d=data.get("ignored_last_7d", 0)
                    + sum(
                        i.status == "expired" and timestamp(i.sent_at) >= cutoff for i in invites
                    ),
                    already_invited=any(i.drop_id == drop.id for i in invites),
                    active_claim_elsewhere=any(
                        c.status == "held" and c.drop_id != drop.id for c in claims
                    ),
                    alerts_paused=data.get("alerts_paused", False),
                    quiet_hours=data.get("quiet_hours", False),
                    presence_valid_from=timestamp(data["valid_from"])
                    if data.get("valid_from")
                    else None,
                    presence_valid_until=timestamp(data["valid_until"])
                    if data.get("valid_until")
                    else None,
                )
            )
        return candidates

    def _wave(self, session: Session, drop: Drop, ring: int, number: int, now: datetime) -> None:
        plan = plan_wave(
            DropView(
                drop.id,
                drop.data["origin_cell"],
                self._counts(session, drop).available,
                frozenset(drop.data["allergens_final"]),
                frozenset(drop.data["diet_tags_final"]),
                timestamp(drop.data["expires_at"]),
            ),
            self._candidates(session, drop, now),
            ring,
            now,
            grid_distance,
        )
        wave = Wave(
            id=str(uuid4()),
            drop_id=drop.id,
            number=number,
            ring_k=ring,
            planned_at=now.isoformat(),
            decisions={"invited": dict(plan.invites), "excluded": dict(plan.excluded)},
        )
        session.add(wave)
        session.flush()
        deadline = min(
            now + timedelta(seconds=60 if self.demo_mode else 90),
            timestamp(drop.data["expires_at"]),
        )
        for student_id, _ in plan.invites:
            session.add(
                Invite(
                    id=str(uuid4()),
                    drop_id=drop.id,
                    wave_id=wave.id,
                    student_id=student_id,
                    sent_at=now.isoformat(),
                    expires_at=deadline.isoformat(),
                )
            )
        session.flush()

    def _feed_wave(self, session: Session, drop: Drop, now: datetime) -> Wave:
        """Create the single internal wave that feed reservation invites hang off.

        It satisfies existing foreign keys only; it invites nobody and never widens.
        """
        wave = Wave(
            id=str(uuid4()),
            drop_id=drop.id,
            number=1,
            ring_k=0,
            planned_at=now.isoformat(),
            decisions={"invited": {}, "excluded": {}},
        )
        session.add(wave)
        session.flush()
        return wave

    def publish(self, actor: Actor, drop_id: str) -> DropResponse:
        """Commit the first wave once even when a host retries publish."""

        def operation(session: Session, now: datetime) -> DropResponse:
            drop = self._owned_drop(session, actor, drop_id)
            if drop.status != "draft":
                return self._response(session, drop)
            if not drop.data["safety_review"]:
                raise DomainError("safety_review_required", "Review food safety before publishing.")
            safety = SafetyReview.model_validate(drop.data["safety_review"])
            if not (
                safety.covered_and_temperature_safe
                and safety.served_within_two_hours
                and safety.untouched
            ):
                raise DomainError("safety_review_required", "Confirm all three food safety checks.")
            mode = self._mode(session)
            drop.status = "live"
            drop.data = {
                **drop.data,
                "distribution_mode": mode,
                "published_at": now.isoformat(),
                "expires_at": (
                    now + timedelta(minutes=drop.data["expires_in_minutes"])
                ).isoformat(),
            }
            session.add(drop)
            session.flush()
            publish_photo(session, drop.id, timestamp(drop.data["expires_at"]))
            if mode == "campus_feed":
                self._feed_wave(session, drop, now)
                enqueue_announcements(session, drop, now)
            else:
                self._wave(session, drop, INITIAL_RING, 1, now)
            return self._response(session, drop)

        result = self._run(operation)
        self.deliver_notifications()
        return result

    def get_drop(self, actor: Actor, drop_id: str) -> DropResponse:
        """Return counts and food details only to an owner or invited student."""

        def operation(session: Session, now: datetime) -> DropResponse:
            drop = self._get(session, Drop, drop_id)
            allowed = actor.role == "host" and drop.host_id == actor.id
            if actor.role == "projector":
                self.require(actor, "projector", demo=True)
                allowed = True
            if actor.role == "student":
                allowed |= (drop_mode(drop) == "campus_feed" and drop.status in FEED_STATUSES) or (
                    session.exec(
                        select(Invite).where(
                            Invite.drop_id == drop.id, Invite.student_id == actor.id
                        )
                    ).first()
                    is not None
                )
            if not allowed:
                raise DomainError("not_found", "Not found.", 404)
            return self._response(session, drop)

        return self._run(operation)

    def _may_view_photo(self, session: Session, actor: Actor, drop: Drop) -> bool:
        """Scope listing photos per role; every refusal looks like a missing photo."""
        if actor.role == "host":
            return drop.host_id == actor.id and drop.status in {"draft", *FEED_STATUSES}
        if actor.role == "projector":
            return self._demo_gates() and drop.status in FEED_STATUSES
        if actor.role == "pantry_coordinator":
            return (
                self._demo_gates()
                and drop.status != "expired"
                and referral_for(session, drop.id) is not None
            )
        if actor.role != "student" or drop.status not in FEED_STATUSES:
            return False
        own_invite = session.exec(
            select(Invite.id).where(Invite.drop_id == drop.id, Invite.student_id == actor.id)
        ).first()
        own_claim = session.exec(
            select(Claim.id).where(Claim.drop_id == drop.id, Claim.student_id == actor.id)
        ).first()
        if own_invite is not None or own_claim is not None:
            return True
        # Joined visitors browse the campus feed; seeded personas only see their own food.
        return drop_mode(drop) == "campus_feed" and self._is_visitor_in(session, actor.id)

    @staticmethod
    def _is_visitor_in(session: Session, student_id: str) -> bool:
        """Whether this student ID belongs to a current joined visitor session."""
        return (
            session.exec(
                select(VisitorSession.student_id).where(VisitorSession.student_id == student_id)
            ).first()
            is not None
        )

    def drop_photo(self, actor: Actor, drop_id: str) -> bytes:
        """Serve the sanitized listing JPEG after purging expired photos, scoped per role.

        Missing, expired and out-of-scope photos all return the same 404 so a caller can
        never learn that another host's draft or a foreign claim exists.
        """

        def operation(session: Session, now: datetime) -> bytes | None:
            drop = session.get(Drop, drop_id)
            if drop is None or not self._may_view_photo(session, actor, drop):
                return None
            return photo_bytes(session, drop_id, now)

        # Refuse only after the transaction commits, so the purge is never rolled back.
        content = self._run(operation)
        if content is None:
            raise DomainError("not_found", "Not found.", 404)
        return content

    def my_reservations(self, actor: Actor) -> StudentReservationsResponse:
        """The caller's own holds in every status, newest first; nobody else's."""
        self.require(actor, "student")

        def operation(session: Session, now: datetime) -> StudentReservationsResponse:
            claims = sorted(
                session.exec(select(Claim).where(Claim.student_id == actor.id)).all(),
                key=lambda claim: (timestamp(claim.created_at), claim.id),
                reverse=True,
            )
            reservations = []
            for claim in claims:
                drop = self._get(session, Drop, claim.drop_id)
                attempt = latest_attempt(session, claim.id)
                reservations.append(
                    StudentReservation(
                        claim=self._claim_response(claim),
                        drop=self._response(session, drop),
                        pickup_verification=verification_response(
                            session, attempt, claim, drop, now
                        )
                        if attempt
                        else None,
                    )
                )
            return StudentReservationsResponse(
                reservations=reservations, server_time=now, is_demo=self.demo_mode
            )

        return self._run(operation)

    def host_drops(self, actor: Actor) -> HostDropsResponse:
        """The calling host's own listings in every status so a dashboard can recover."""
        self.require(actor, "host")

        def operation(session: Session, now: datetime) -> HostDropsResponse:
            drops = sorted(
                session.exec(select(Drop).where(Drop.host_id == actor.id)).all(),
                key=lambda drop: (timestamp(drop.data["created_at"]), drop.id),
                reverse=True,
            )
            return HostDropsResponse(
                drops=[self._response(session, drop) for drop in drops],
                server_time=now,
                is_demo=self.demo_mode,
            )

        return self._run(operation)

    def invites(self, actor: Actor) -> InvitesResponse:
        """Keep each student's invitation history scoped to their identity."""
        self.require(actor, "student")
        # Feed reservations ride on internal invites; they belong to /students/me/feed.
        return self._run(
            lambda s, now: InvitesResponse(
                invites=[
                    self._invite_response(s, invite)
                    for invite in s.exec(
                        select(Invite)
                        .where(Invite.student_id == actor.id)
                        .order_by(Invite.sent_at, Invite.id)
                    ).all()
                    if drop_mode(self._get(s, Drop, invite.drop_id)) == "seeded_waves"
                ]
            )
        )

    def feed(self, actor: Actor) -> FeedResponse:
        """List every active campus drop, judged against only the caller's preferences."""
        self.require(actor, "student")

        def operation(session: Session, now: datetime) -> FeedResponse:
            student = self._get(session, Student, actor.id)
            listings = []
            for drop in active_feed_drops(session):
                claim = own_feed_claim(session, actor.id, drop.id)
                counts = self._counts(session, drop)
                reason = unavailable_reason(session, student, drop, claim, counts.available)
                listings.append(
                    FeedDrop(
                        drop=self._response(session, drop),
                        can_reserve=reason is None,
                        unavailable_reason=reason,
                        claim=self._claim_response(claim) if claim else None,
                    )
                )
            return FeedResponse(drops=listings, server_time=now, is_demo=self.demo_mode)

        return self._run(operation)

    def reserve(self, actor: Actor, drop_id: str) -> ClaimResponse:
        """Hold one serving from the feed atomically; retries return the same hold.

        No invitation, presence or notification is required, and none is created.
        """
        self.require(actor, "student")

        def operation(session: Session, now: datetime) -> ClaimResponse:
            drop = session.get(Drop, drop_id)
            if drop is None or drop.status == "draft" or drop_mode(drop) != "campus_feed":
                raise DomainError("not_found", "Not found.", 404)
            previous = own_feed_claim(session, actor.id, drop.id)
            if previous and previous.status in {"held", "picked_up"}:
                return self._claim_response(previous)
            if drop.status == "expired":
                raise DomainError("drop_expired", "This food is no longer available.")
            if previous:
                raise DomainError("invalid_state", "You already reserved this one.")
            conflict = preference_conflict(self._get(session, Student, actor.id), drop)
            if conflict == "allergen_conflict":
                raise DomainError("allergen_conflict", "This food conflicts with your allergens.")
            if conflict == "diet_mismatch":
                raise DomainError(
                    "diet_mismatch", "This food does not meet your dietary preferences."
                )
            if has_active_hold(session, actor.id):
                raise DomainError("active_claim", "You already have a held spot.")
            if self._counts(session, drop).available <= 0:
                raise DomainError("capacity", "You just missed this one. More soon.")
            held_until = min(now + HOLD_DURATION, timestamp(drop.data["expires_at"]))
            invite = feed_invite(session, drop.id, actor.id)
            if invite is None:
                wave = session.exec(select(Wave).where(Wave.drop_id == drop.id)).first()
                wave = wave or self._feed_wave(session, drop, now)
                invite = Invite(
                    id=str(uuid4()),
                    drop_id=drop.id,
                    wave_id=wave.id,
                    student_id=actor.id,
                    sent_at=now.isoformat(),
                    expires_at=held_until.isoformat(),
                    # Never an outbox entry: reserving must not notify anyone.
                    notification_sent=True,
                )
            invite.status = "claimed"
            session.add(invite)
            session.flush()
            claim = Claim(
                id=str(uuid4()),
                invite_id=invite.id,
                drop_id=drop.id,
                student_id=actor.id,
                created_at=now.isoformat(),
                held_until=held_until.isoformat(),
            )
            session.add(claim)
            self._refresh(session, drop)
            return self._claim_response(claim)

        return self._run(operation)

    def distribution(self, actor: Actor) -> CampusDistributionResponse:
        """Projector aggregate of host pickup points; contains no student geography."""
        self.require(actor, "projector", demo=True)

        def operation(session: Session, now: datetime) -> CampusDistributionResponse:
            drops = active_feed_drops(session)
            counts, buildings = distribution_rows(drops, lambda drop: self._counts(session, drop))
            return CampusDistributionResponse(
                distribution_mode=self._mode(session),
                active_drops=len(drops),
                available_drops=sum(row.available_drops for row in buildings),
                joined_students=visitor_count(session),
                counts=counts,
                buildings=buildings,
                server_time=now,
                is_demo=True,
            )

        return self._run(operation)

    def _pantry_destination(self) -> PantryDestination:
        """Resolve the verified destination before any transaction; 503 when absent."""
        try:
            return destination(self.campus)
        except PantryError as exc:
            raise DomainError(exc.code, exc.message, exc.status) from None

    def _pantry_host_drop(self, session: Session, actor: Actor, drop_id: str) -> Drop:
        """Pantry host actions need both demo gates and the caller's own drop."""
        self.require(actor, "host", demo=True)
        return self._owned_drop(session, actor, drop_id)

    def _referral_response(
        self, session: Session, referral: PantryReferral, place: PantryDestination
    ) -> PantryReferralOut:
        drop = self._get(session, Drop, referral.drop_id)
        return referral_response(referral, drop, self._response(session, drop), place)

    def pantry_referral(self, actor: Actor, drop_id: str) -> HostPantryReferralResponse:
        """The host's own drop referral; a due suggestion materializes in this read."""
        self.require(actor, "host", demo=True)
        place = self._pantry_destination()

        def operation(session: Session, now: datetime) -> HostPantryReferralResponse:
            drop = self._pantry_host_drop(session, actor, drop_id)
            referral = referral_for(session, drop.id)
            return HostPantryReferralResponse(
                referral=self._referral_response(session, referral, place) if referral else None,
                destination=place,
            )

        return self._pantry_run(operation)

    def request_pantry_referral(
        self, actor: Actor, drop_id: str, servings: int
    ) -> PantryReferralOut:
        """Explicit simulated host request; reserves nothing and contacts no one."""
        self.require(actor, "host", demo=True)
        place = self._pantry_destination()

        def operation(session: Session, now: datetime) -> PantryReferralOut:
            drop = self._pantry_host_drop(session, actor, drop_id)
            available = self._counts(session, drop).available
            referral = request(session, drop, servings, available, now)
            return self._referral_response(session, referral, place)

        return self._pantry_run(operation)

    def confirm_pantry_handoff(self, actor: Actor, drop_id: str) -> PantryReferralOut:
        """Publishing host's simulated handoff confirmation; no pickup push is enqueued."""
        self.require(actor, "host", demo=True)
        place = self._pantry_destination()

        def operation(session: Session, now: datetime) -> PantryReferralOut:
            drop = self._pantry_host_drop(session, actor, drop_id)
            referral = referral_for(session, drop.id)
            if referral is None:
                raise PantryError("invalid_state", "Only an accepted referral can be handed off.")
            confirm_handoff(session, referral, now)
            self._refresh(session, drop)
            return self._referral_response(session, referral, place)

        return self._pantry_run(operation)

    def pantry_referrals(self, actor: Actor) -> PantryReferralsResponse:
        """Every demo referral for the simulated coordinator, oldest first, de-identified."""
        self.require(actor, "pantry_coordinator", demo=True)
        place = self._pantry_destination()

        def operation(session: Session, now: datetime) -> PantryReferralsResponse:
            referrals = session.exec(
                select(PantryReferral).order_by(PantryReferral.created_at, PantryReferral.id)
            ).all()
            return PantryReferralsResponse(
                referrals=[self._referral_response(session, r, place) for r in referrals],
                server_time=now,
            )

        return self._pantry_run(operation)

    def decide_pantry_referral(
        self, actor: Actor, referral_id: str, decision: str, servings: int | None
    ) -> PantryReferralOut:
        """Simulated accept or reject, rechecked under the student reservation lock."""
        self.require(actor, "pantry_coordinator", demo=True)
        place = self._pantry_destination()

        def operation(session: Session, now: datetime) -> PantryReferralOut:
            referral = self._get(session, PantryReferral, referral_id)
            drop = self._get(session, Drop, referral.drop_id)
            available = self._counts(session, drop).available
            decide(session, referral, decision, servings, available, now)
            self._refresh(session, drop)
            return self._referral_response(session, referral, place)

        return self._pantry_run(operation)

    def claim(self, actor: Actor, invite_id: str) -> ClaimResponse:
        """Hold capacity atomically and return the existing hold on retry."""

        def operation(session: Session, now: datetime) -> ClaimResponse:
            invite = self._owned_invite(session, actor, invite_id)
            previous = session.exec(select(Claim).where(Claim.invite_id == invite.id)).first()
            if previous and previous.status in {"held", "picked_up"}:
                return self._claim_response(previous)
            if invite.status == "expired":
                raise DomainError("invite_expired", "This invitation has expired.")
            if invite.status != "sent" or previous:
                raise DomainError("invalid_state", "This invitation is no longer available.")
            drop = self._get(session, Drop, invite.drop_id)
            student = self._get(session, Student, actor.id)
            if set(student.data.get("allergens", [])) & set(drop.data["allergens_final"]):
                raise DomainError("allergen_conflict", "This food conflicts with your allergens.")
            if not set(student.data.get("diets", [])) <= set(drop.data["diet_tags_final"]):
                raise DomainError(
                    "diet_mismatch", "This food does not meet your dietary preferences."
                )
            if session.exec(
                select(Claim).where(Claim.student_id == actor.id, Claim.status == "held")
            ).first():
                raise DomainError("active_claim", "You already have a held spot.")
            if self._counts(session, drop).available <= 0:
                raise DomainError("capacity", "You just missed this one. More soon.")
            claim = Claim(
                id=str(uuid4()),
                invite_id=invite.id,
                drop_id=drop.id,
                student_id=actor.id,
                created_at=now.isoformat(),
                held_until=min(
                    now + timedelta(seconds=600), timestamp(drop.data["expires_at"])
                ).isoformat(),
            )
            invite.status = "claimed"
            session.add(invite)
            session.add(claim)
            self._refresh(session, drop)
            return self._claim_response(claim)

        return self._run(operation)

    def decline(self, actor: Actor, invite_id: str) -> InviteResponse:
        """Decline without touching inventory, because an invite never reserves it."""

        def operation(session: Session, now: datetime) -> InviteResponse:
            invite = self._owned_invite(session, actor, invite_id)
            if invite.status == "claimed":
                raise DomainError("invalid_state", "Release your held spot instead.")
            if invite.status == "sent":
                invite.status = "declined"
                session.add(invite)
            return self._invite_response(session, invite)

        return self._run(operation)

    def _own_claim(self, session: Session, actor: Actor, claim_id: str) -> Claim:
        claim = self._get(session, Claim, claim_id)
        if claim.student_id != actor.id:
            raise DomainError("not_found", "Not found.", 404)
        return claim

    def update_claim(
        self,
        actor: Actor,
        claim_id: str,
        *,
        pickup: bool = False,
        verification_id: UUID | None = None,
    ) -> ClaimResponse:
        """Release holds, or complete pickup with safe retries.

        Campus-feed pickup needs the latest consistent photo-assisted result and is checked
        in the same serialized transaction that consumes inventory. Only explicit seeded
        rehearsal keeps the legacy no-body pickup, behind the existing demo gates.
        """
        self.require(actor, "student", demo=pickup)
        completed = False

        def operation(session: Session, now: datetime) -> ClaimResponse:
            nonlocal completed
            claim = self._own_claim(session, actor, claim_id)
            target = "picked_up" if pickup else "released"
            if claim.status == target:
                return self._claim_response(claim)
            drop = self._get(session, Drop, claim.drop_id)
            if pickup and claim.status != "held":
                raise DomainError("invalid_state", "This hold is no longer available.")
            if pickup and drop_mode(drop) == "campus_feed":
                if verification_id is None:
                    raise DomainError(
                        "pickup_verification_required",
                        "Check a photo of your food before confirming pickup.",
                    )
                attempt = own_attempt(session, claim, verification_id)
                require_confirmable(session, attempt, claim, drop, now)
                complete_with_result(session, attempt, claim)
                self._refresh(session, drop)
                enqueue_host_update(
                    session, claim, drop, self._counts(session, drop).available, now
                )
                completed = True
                return self._claim_response(claim)
            if claim.status == "held":
                claim.status = target
                session.add(claim)
            self._refresh(session, drop)
            sweep(session, now)
            return self._claim_response(claim)

        result = self._pickup_run(operation)
        if completed:
            self.deliver_notifications()
        return result

    def submit_pickup_photo(
        self, actor: Actor, claim_id: str, photo: bytes, request_id: UUID
    ) -> PickupVerification:
        """Check one food photo against the published listing; never consumes inventory.

        Ownership, hold and expiry are checked and a processing attempt is committed before
        the model call, which runs outside any database transaction. The photo lives only
        in this call's memory and is never stored, hashed or logged.
        """
        self.require(actor, "student")
        if len(photo) > MAX_PHOTO_BYTES:
            raise DomainError("photo_too_large", "Photo exceeds 10 MiB.", 413)
        if not photo or self.validate_photo is None:
            raise DomainError("invalid_photo", "A validated JPEG or PNG is required.", 422)
        try:
            photo = self.validate_photo(photo)
        except Exception as exc:
            raise DomainError("invalid_photo", "A valid JPEG or PNG is required.", 422) from exc
        verifier = self.verify_pickup
        if (
            verifier is None
            or verifier.source not in {"fixture", "openrouter"}
            or (verifier.source == "fixture" and not self.demo_mode)
        ):
            raise DomainError(
                "pickup_verification_unavailable",
                "Photo checks are not configured on the server. No result was made.",
                503,
            )

        def begin(session: Session, now: datetime) -> tuple[PickupVerification, list | None]:
            claim = self._own_claim(session, actor, claim_id)
            drop = self._get(session, Drop, claim.drop_id)
            if drop_mode(drop) != "campus_feed":
                raise DomainError("invalid_state", "Photo checks apply to campus-feed holds.")
            attempt, is_new = start_attempt(session, claim, drop, request_id, verifier.source, now)
            response = verification_response(session, attempt, claim, drop, now)
            return response, listing_items(drop) if is_new else None

        started, listing = self._pickup_run(begin)
        if listing is None:
            return started  # Same-key retry: same attempt, no second model call.
        try:
            raw = verifier.assess(photo, listing)
            assessment: PickupAssessment | None = PickupAssessment.model_validate(raw.model_dump())
        except Exception:  # noqa: BLE001 - any provider or shape failure fails closed
            logger.warning("Pickup photo check failed closed; no result recorded")
            assessment = None

        def finish(session: Session, now: datetime) -> PickupVerification:
            attempt = record_result(session, str(started.id), assessment)
            claim = self._get(session, Claim, attempt.claim_id)
            drop = self._get(session, Drop, claim.drop_id)
            return verification_response(session, attempt, claim, drop, now)

        return self._pickup_run(finish)

    def pickup_verification(self, actor: Actor, claim_id: str) -> PickupVerificationResponse:
        """The latest attempt on the caller's own claim, with authority derived now."""
        self.require(actor, "student")

        def operation(session: Session, now: datetime) -> PickupVerificationResponse:
            claim = self._own_claim(session, actor, claim_id)
            attempt = latest_attempt(session, claim.id)
            if attempt is None:
                return PickupVerificationResponse(verification=None)
            drop = self._get(session, Drop, claim.drop_id)
            return PickupVerificationResponse(
                verification=verification_response(session, attempt, claim, drop, now)
            )

        return self._pickup_run(operation)

    def request_pickup_review(
        self, actor: Actor, claim_id: str, verification_id: UUID
    ) -> PickupVerification:
        """Explicitly ask the host to review; never completes pickup or extends the hold."""
        self.require(actor, "student")

        def operation(session: Session, now: datetime) -> PickupVerification:
            claim = self._own_claim(session, actor, claim_id)
            drop = self._get(session, Drop, claim.drop_id)
            attempt = request_review(
                session, own_attempt(session, claim, verification_id), claim, drop, now
            )
            return verification_response(session, attempt, claim, drop, now)

        return self._pickup_run(operation)

    def pickup_reviews(self, actor: Actor, drop_id: str) -> HostPickupReviewsResponse:
        """Pending de-identified review requests on the host's own drop only."""

        def operation(session: Session, now: datetime) -> HostPickupReviewsResponse:
            drop = self._owned_drop(session, actor, drop_id)
            return HostPickupReviewsResponse(
                reviews=pending_reviews(session, drop, now), server_time=now
            )

        return self._pickup_run(operation)

    def decide_pickup_review(
        self, actor: Actor, drop_id: str, verification_id: str, decision: str
    ) -> HostPickupReview:
        """Record an explicit human decision; approval consumes the live hold atomically."""
        approved = False

        def operation(session: Session, now: datetime) -> HostPickupReview:
            nonlocal approved
            drop = self._owned_drop(session, actor, drop_id)
            attempt = session.get(PickupAttempt, verification_id)
            if attempt is None or attempt.drop_id != drop.id:
                raise DomainError("not_found", "Not found.", 404)
            claim = self._get(session, Claim, attempt.claim_id)
            approved = decide_review(session, attempt, claim, drop, decision, now)
            if approved:
                self._refresh(session, drop)
                enqueue_host_update(
                    session, claim, drop, self._counts(session, drop).available, now
                )
            return review_response(attempt, claim)

        result = self._pickup_run(operation)
        if approved:
            self.deliver_notifications()
        return result

    def host_push_status(self, actor: Actor) -> PushTokenResponse:
        """Backend truth for the host's opt-in, so client flags cannot outlive a reset."""
        self.require(actor, "host")
        try:
            return PushTokenResponse(
                registered=self.host_push is not None and self.host_push.has(actor.id)
            )
        except (RuntimeError, ValueError, SQLAlchemyError):
            raise self._push_unavailable() from None

    def register_host_push(self, actor: Actor, token: str) -> PushTokenResponse:
        """Bind a device to the authenticated host only; no target ID is ever accepted."""
        self.require(actor, "host")
        if self.host_push is None:
            raise self._push_unavailable()
        try:
            self.host_push.register(actor.id, token)
        except (RuntimeError, ValueError, SQLAlchemyError):
            raise self._push_unavailable() from None
        return PushTokenResponse(registered=True)

    def forget_host_push(self, actor: Actor) -> PushTokenResponse:
        """Opt out; deferred host updates recheck this before any send."""
        self.require(actor, "host")
        if self.host_push is not None:
            try:
                self.host_push.forget(actor.id)
            except (RuntimeError, ValueError, SQLAlchemyError):
                raise self._push_unavailable() from None
        return PushTokenResponse(registered=False)

    @staticmethod
    def _push_unavailable() -> DomainError:
        return DomainError("provider_unavailable", "Encrypted push registration unavailable.", 503)

    def tick(self, advance_seconds: int = 0) -> datetime:
        """Expire deadlines and widen exhausted waves under the same lock as claims."""
        if advance_seconds and not self.demo_mode:
            raise DomainError("forbidden", "Clock advance is demo only.", 403)
        if not 0 <= advance_seconds <= 7200:
            raise DomainError("invalid_advance", "Invalid clock advance.", 422)
        with transaction(self.engine) as session:
            coordinator = session.get(Coordinator, 1)
            coordinator.clock_offset += advance_seconds
            session.add(coordinator)
            now = self._now(session)
            self._expire(session, now)
            for drop in session.exec(select(Drop).where(Drop.status == "live")).all():
                if drop_mode(drop) == "campus_feed":
                    continue  # Announced once at publish; the feed never widens or re-sends.
                waves = session.exec(
                    select(Wave).where(Wave.drop_id == drop.id).order_by(Wave.number)
                ).all()
                if not waves:
                    continue
                last = waves[-1]
                sent = session.exec(
                    select(Invite).where(Invite.drop_id == drop.id, Invite.status == "sent")
                ).first()
                if (
                    not sent
                    and now >= timestamp(last.planned_at) + timedelta(seconds=10)
                    and last.ring_k < MAX_RING
                ):
                    self._wave(
                        session, drop, min(MAX_RING, last.ring_k + RING_STEP), last.number + 1, now
                    )
        self.deliver_notifications()
        return now

    def deliver_notifications(self) -> None:
        """Retry committed outbox entries without ever sending private metadata."""
        # Hold coordination while sending to avoid overlapping workers delivering the same entry.
        # Adapters must have bounded timeouts and deduplicate by invite_id for crash recovery.
        # Feed announcements pass their outbox ID with mode="campus_feed"; a crash between an
        # accepted send and commit can repeat one, which the stable per-drop topic collapses.
        # Host pickup updates are likewise at-least-once across a crash; their stable
        # per-event tag and topic collapse such a repeat on the host's device.
        with transaction(self.engine) as session:
            now = self._now(session)
            if self.notify is not None:
                self._deliver_student_alerts(session, now)
            if self.notify_host is not None:
                self._deliver_host_updates(session)

    def _deliver_student_alerts(self, session: Session, now: datetime) -> None:
        for invite in session.exec(
            select(Invite).where(Invite.notification_sent == False, Invite.status == "sent")
        ).all():
            if now >= timestamp(invite.expires_at):
                continue
            try:
                self.notify(invite.id, invite.student_id, invite.drop_id)
            except Exception:  # noqa: BLE001 - adapter failures must not roll back committed waves
                logger.warning("Notification delivery deferred")
            else:
                invite.notification_sent = True
                session.add(invite)
        for record in session.exec(
            select(FeedNotification).where(FeedNotification.sent == False)
        ).all():
            drop = session.get(Drop, record.drop_id)
            if drop is None or drop.status not in FEED_STATUSES:
                continue  # Never announce food that is already gone.
            if not announcement_eligible(session, record, drop, now):
                # Consume cancelled opportunities without transport; keep their unique pair
                # so restoring consent/preferences cannot resurrect a stale announcement.
                record.sent = True
                session.add(record)
                continue
            try:
                self.notify(record.id, record.student_id, record.drop_id, mode="campus_feed")
            except Exception:  # noqa: BLE001 - adapter failures must not roll back publishes
                logger.warning("Notification delivery deferred")
            else:
                record.sent = True
                session.add(record)

    def _deliver_host_updates(self, session: Session) -> None:
        """Send each committed pickup event to its publishing host, once when accepted."""
        for record in session.exec(
            select(HostPickupNotification).where(HostPickupNotification.sent == False)
        ).all():
            drop = session.get(Drop, record.drop_id)
            if drop is not None and drop.host_id == record.host_id:
                try:
                    self.notify_host(
                        record.id, record.host_id, record.drop_id, host_update_body(record)
                    )
                except Exception:  # noqa: BLE001 - adapter failures must not roll back pickups
                    logger.warning("Host pickup update deferred")
                    continue
            record.sent = True
            session.add(record)

    def active_drop(self, actor: Actor) -> DemoActiveDropResponse:
        """Discover the latest demo drop without sharing browser state or recipient details."""
        self.require(actor, "host" if actor.role == "host" else "projector", demo=True)
        return self._run(
            lambda session, now: DemoActiveDropResponse(
                drop_id=drop.id if (drop := self._active_drop(session)) else None
            )
        )

    def reset(self, actor: Actor, scenario: Scenario = "seeded") -> DemoResetResponse:
        """Replace demo state atomically; any reset ends every visitor session."""
        self.require_presenter(actor)
        with transaction(self.engine) as session:
            for name in PUSH_REGISTRATION_TABLES:
                registrations = SQLModel.metadata.tables.get(name)
                if registrations is not None and inspect(session.connection()).has_table(name):
                    session.execute(delete(registrations))
            purge_all_photos(session)
            for model in (
                HostPickupNotification,
                PickupAttempt,
                FeedNotification,
                PantryReferral,
                Claim,
                Invite,
                Wave,
                Drop,
                VisitorSession,
                Student,
            ):
                session.execute(delete(model))
            coordinator = session.get(Coordinator, 1)
            coordinator.clock_offset = 0
            session.add(coordinator)
            settings = session.get(DemoSettings, 1)
            if settings is None:
                session.add(DemoSettings(id=1, scenario=scenario))
            else:
                settings.scenario = scenario
                session.add(settings)
            now = self._now(session)
            for record in self.seed["students"]:
                ring = record["ring_distance"]
                cells = sorted(
                    set(h3.grid_disk(self.origin, ring))
                    - set(h3.grid_disk(self.origin, ring - 1) if ring else [])
                )
                cell = next(cell for cell in cells if grid_distance(self.origin, cell) == ring)
                session.add(
                    Student(
                        id=record["id"],
                        label=record["label"],
                        is_simulated=True,
                        data={
                            **record,
                            "alerts_paused": record["alerts_paused"] or scenario == "visitors",
                            "cell": cell,
                            "valid_from": now.isoformat(),
                            "valid_until": (now + timedelta(hours=2)).isoformat(),
                        },
                    )
                )
            return DemoResetResponse(
                students=len(self.seed["students"]),
                personas={row["label"]: row["id"] for row in self.seed["students"][:5]},
                scenario=scenario,
            )

    def preferences(self, actor: Actor, preferences: Preferences) -> Preferences:
        """Allow students to change consent and filters without accessing private tiers."""
        self.require(actor, "student")

        def operation(session: Session, now: datetime) -> Preferences:
            student = self._get(session, Student, actor.id)
            student.data = {**student.data, **preferences.model_dump(mode="json")}
            session.add(student)
            return preferences

        return self._run(operation)

    def presence(self, actor: Actor, building_code: str) -> datetime:
        """Replace the current coarse check-in instead of retaining a location history."""
        self.require(actor, "student")
        cell = self._location_cell(building_code)
        real = self.campus.get(building_code) is not None

        def operation(session: Session, now: datetime) -> datetime:
            if self._mode(session) == "campus_feed":
                # The feed never records student location; check-ins are seeded rehearsal only.
                raise DomainError("invalid_state", "Check-ins are not used for the campus feed.")
            student = self._get(session, Student, actor.id)
            until = now + timedelta(hours=2)
            student.data = {
                **student.data,
                "cell": cell,
                "valid_from": now.isoformat(),
                "valid_until": until.isoformat(),
            }
            if real and student.data.get("kind") == "visitor":
                student.data = {**student.data, "area": building_code}
                move_session(session, actor.id, building_code)
            session.add(student)
            return until

        return self._run(operation)

    def dispatch(self, actor: Actor, drop_id: str) -> DispatchResponse:
        """Expose only synthetic map decisions and generic reasons to the demo projector."""
        self.require(actor, "projector", demo=True)

        def operation(session: Session, now: datetime) -> DispatchResponse:
            drop = self._get(session, Drop, drop_id)
            waves = session.exec(
                select(Wave).where(Wave.drop_id == drop.id).order_by(Wave.number)
            ).all()
            invites = {
                i.student_id: i
                for i in session.exec(select(Invite).where(Invite.drop_id == drop.id)).all()
            }
            mode = drop_mode(drop)
            if mode == "campus_feed":
                return DispatchResponse(
                    drop_id=drop.id,
                    status=drop.status,
                    origin_cell=drop.data["origin_cell"],
                    ring_k=0,
                    counts=self._counts(session, drop),
                    waves=[],
                    personas=[],
                    visitors=[],
                    scenario=self._scenario(session),
                    distribution_mode=mode,
                    next_wave_at=None,
                    server_time=now,
                    is_demo=True,
                )
            last = waves[-1] if waves else None
            scenario = self._scenario(session)
            personas = []
            if scenario != "visitors":
                numbers = {w.id: w.number for w in waves}
                for student in session.exec(
                    select(Student).where(Student.is_simulated == True)
                ).all():
                    invite = invites.get(student.id)
                    reason = (
                        last.decisions["excluded"].get(student.id, "not_selected")
                        if last
                        else "not_published"
                    )
                    reasons = ["nearby", "diet_match", "fair_share"] if invite else [reason]
                    personas.append(
                        PersonaDecision(
                            label=student.label,
                            ring_distance=grid_distance(
                                drop.data["origin_cell"], student.data.get("cell", "")
                            ),
                            status=invite.status if invite else "excluded",
                            reason_codes=reasons,
                            h3_cell=student.data.get("cell"),
                            wave_number=numbers.get(invite.wave_id) if invite else None,
                        )
                    )
            visitors = visitor_decisions(
                session,
                origin_cell=drop.data["origin_cell"],
                waves=waves,
                invites=invites,
                distance=grid_distance,
            )
            pending = [timestamp(i.expires_at) for i in invites.values() if i.status == "sent"]
            next_wave_at = None
            if last and last.ring_k < MAX_RING and drop.status == "live":
                next_wave_at = max(pending) if pending else now + timedelta(seconds=10)
            return DispatchResponse(
                drop_id=drop.id,
                status=drop.status,
                origin_cell=drop.data["origin_cell"],
                ring_k=last.ring_k if last else 0,
                counts=self._counts(session, drop),
                waves=[
                    WaveResponse(
                        number=w.number,
                        ring_k=w.ring_k,
                        planned_at=timestamp(w.planned_at),
                        invite_count=len(w.decisions["invited"]),
                    )
                    for w in waves
                ],
                personas=personas,
                visitors=visitors,
                scenario=scenario,
                distribution_mode=mode,
                next_wave_at=next_wave_at,
                server_time=now,
                is_demo=True,
            )

        return self._run(operation)
