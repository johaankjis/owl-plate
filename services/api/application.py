"""Coordinate private persistence and pure decisions behind thin HTTP routes."""

import json
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal, TypeVar
from uuid import uuid4

import h3
from sqlalchemy import Engine, delete, inspect
from sqlmodel import Session, SQLModel, select

from services.api.db.models import (
    Claim,
    Coordinator,
    DemoSettings,
    Drop,
    Invite,
    Student,
    VisitorSession,
    Wave,
)
from services.api.db.session import transaction
from services.api.dispatch import CandidateView, DropView, plan_wave
from services.api.dispatch.config import INITIAL_RING, MAX_RING, RING_STEP
from services.api.schemas.api import (
    ClaimResponse,
    Counts,
    DemoActiveDropResponse,
    DemoAreasResponse,
    DemoResetResponse,
    DemoStatusResponse,
    DispatchResponse,
    DropEdit,
    DropResponse,
    InviteResponse,
    InvitesResponse,
    JoinRequest,
    JoinResponse,
    PersonaDecision,
    Preferences,
    SafetyReview,
    Scenario,
    SessionLeftResponse,
    SessionStudent,
    VisionEstimate,
    WaveResponse,
)
from services.api.sessions import (
    TOKEN_PREFIX,
    SessionError,
    areas_response,
    create_session,
    end_session,
    require_session,
    resolve_token,
    session_student,
    visitor_count,
    visitor_decisions,
)

logger = logging.getLogger(__name__)
T = TypeVar("T")
VisionCallable = Callable[[bytes, str], tuple[VisionEstimate, Literal["fixture", "gemini"]]]
ALLERGENS = ["dairy", "egg", "gluten", "peanut", "tree_nut", "soy", "fish", "shellfish", "sesame"]
RELIGIOUS_DIETS = {"halal", "kosher", "pork_free"}
SEED_PATH = Path(__file__).resolve().parents[2] / "data/seed/demo.json"


@dataclass(frozen=True)
class Actor:
    role: Literal["host", "student", "projector"]
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
        notify: Callable[[str, str, str], None] | None = None,
        demo_mode: bool = False,
        auth_mode: str = "",
        clock: Callable[[], datetime] | None = None,
        buildings: Mapping[str, str] | None = None,
        authenticate: Callable[[str], Actor] | None = None,
    ) -> None:
        self.engine = engine
        self.analyze = analyze
        self.validate_photo = validate_photo
        self.notify = notify
        self.demo_mode = demo_mode
        self.auth_mode = auth_mode
        self.clock = clock or (lambda: datetime.now(UTC))
        self.authenticate = authenticate
        self.seed = json.loads(SEED_PATH.read_text())
        self.origin = h3.latlng_to_cell(self.seed["origin"]["lat"], self.seed["origin"]["lng"], 11)
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

    def _require_demo(self) -> None:
        """Restrict unauthenticated demo surfaces to explicit demo gates."""
        if not (self.demo_mode and self.auth_mode == "demo"):
            raise DomainError("forbidden", "Access denied.", 403)

    def areas(self) -> DemoAreasResponse:
        """Return the four fixed, unverified demo areas under demo gates only."""
        self._require_demo()
        return areas_response()

    def _session_run(self, operation: Callable[[Session, datetime], T]) -> T:
        """Run visitor-session logic and map its failures to contract errors."""
        try:
            return self._run(operation)
        except SessionError as exc:
            raise DomainError(exc.code, exc.message, exc.status) from None

    def join(self, request: JoinRequest) -> JoinResponse:
        """Create a distinct visitor session per docs/API_CONTRACT.md v2."""
        self._require_demo()
        return self._session_run(
            lambda session, now: create_session(
                session, origin=self.origin, now=now, request=request
            )
        )

    def session_me(self, actor: Actor) -> SessionStudent:
        """Return the caller's own visitor session, or nothing for seeded personas."""

        def operation(session: Session, now: datetime) -> SessionStudent:
            return session_student(session, require_session(session, actor.id))

        return self._session_run(operation)

    def leave(self, actor: Actor) -> SessionLeftResponse:
        """Revoke the visitor token, release holds, and decline pending invites."""

        def operation(session: Session, now: datetime) -> SessionLeftResponse:
            for drop in end_session(session, actor.id):
                self._refresh(session, drop)
            return SessionLeftResponse()

        return self._session_run(operation)

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
        claims = session.exec(select(Claim).where(Claim.drop_id == drop.id)).all()
        held = sum(c.status == "held" for c in claims)
        picked_up = sum(c.status == "picked_up" for c in claims)
        total = drop.data["servings_final"]
        return Counts(
            total=total, available=total - held - picked_up, held=held, picked_up=picked_up
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
            self._refresh(session, drop)
        session.flush()

    def _response(self, session: Session, drop: Drop) -> DropResponse:
        return DropResponse(
            id=drop.id,
            status=drop.status,
            building_code=drop.data["building_code"],
            room=drop.data["room"],
            vision=drop.data["vision"],
            vision_source=drop.data["vision_source"],
            servings_final=drop.data["servings_final"],
            allergens_final=drop.data["allergens_final"],
            diet_tags_final=drop.data["diet_tags_final"],
            safety_review=drop.data["safety_review"],
            counts=self._counts(session, drop),
            created_at=timestamp(drop.data["created_at"]),
            expires_at=timestamp(drop.data["expires_at"]) if drop.data["expires_at"] else None,
            is_demo=self.demo_mode,
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
            if source not in {"fixture", "gemini"} or (source == "fixture" and not self.demo_mode):
                raise ValueError("Invalid source")
        except Exception as exc:
            # Live vision never falls back to the fixture: fail the request without a drop.
            raise DomainError(
                "vision_unavailable",
                "Live Gemini could not analyze this photo. No estimate was made; try again, or check the server's Gemini key and model.",
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
                },
            )
            session.add(drop)
            session.flush()
            return self._response(session, drop)

        return self._run(operation)

    def edit_drop(self, actor: Actor, drop_id: str, edit: DropEdit) -> DropResponse:
        """Require explicit ingredient and religious review before relaxing estimates."""

        def operation(session: Session, now: datetime) -> DropResponse:
            drop = self._owned_drop(session, actor, drop_id)
            if drop.status != "draft":
                raise DomainError("invalid_state", "Only draft drops can be edited.")
            if edit.building_code not in self.buildings:
                raise DomainError("invalid_building", "Unknown building.", 422)
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
                "origin_cell": self.buildings[edit.building_code],
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
            drop.status = "live"
            drop.data = {
                **drop.data,
                "expires_at": (
                    now + timedelta(minutes=drop.data["expires_in_minutes"])
                ).isoformat(),
            }
            session.add(drop)
            session.flush()
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
                allowed |= (
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

    def invites(self, actor: Actor) -> InvitesResponse:
        """Keep each student's invitation history scoped to their identity."""
        self.require(actor, "student")
        return self._run(
            lambda s, now: InvitesResponse(
                invites=[
                    self._invite_response(s, invite)
                    for invite in s.exec(
                        select(Invite)
                        .where(Invite.student_id == actor.id)
                        .order_by(Invite.sent_at, Invite.id)
                    ).all()
                ]
            )
        )

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

    def update_claim(self, actor: Actor, claim_id: str, *, pickup: bool = False) -> ClaimResponse:
        """Release holds or consume a serving on a demo pickup, with safe retries."""
        self.require(actor, "student", demo=pickup)

        def operation(session: Session, now: datetime) -> ClaimResponse:
            claim = self._get(session, Claim, claim_id)
            if claim.student_id != actor.id:
                raise DomainError("not_found", "Not found.", 404)
            target = "picked_up" if pickup else "released"
            if claim.status == target:
                return self._claim_response(claim)
            if claim.status == "held":
                claim.status = target
                session.add(claim)
            elif pickup:
                raise DomainError("invalid_state", "This hold is no longer available.")
            self._refresh(session, self._get(session, Drop, claim.drop_id))
            return self._claim_response(claim)

        return self._run(operation)

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
        if self.notify is None:
            return
        # Hold coordination while sending to avoid overlapping workers delivering the same entry.
        # Adapters must have bounded timeouts and deduplicate by invite_id for crash recovery.
        with transaction(self.engine) as session:
            now = self._now(session)
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
            registrations = SQLModel.metadata.tables.get("pushregistration")
            if registrations is not None and inspect(session.connection()).has_table(
                registrations.name
            ):
                session.execute(delete(registrations))
            for model in (Claim, Invite, Wave, Drop, VisitorSession, Student):
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
        if building_code not in self.buildings:
            raise DomainError("invalid_building", "Unknown building.", 422)

        def operation(session: Session, now: datetime) -> datetime:
            student = self._get(session, Student, actor.id)
            until = now + timedelta(hours=2)
            student.data = {
                **student.data,
                "cell": self.buildings[building_code],
                "valid_from": now.isoformat(),
                "valid_until": until.isoformat(),
            }
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
                next_wave_at=next_wave_at,
                server_time=now,
                is_demo=True,
            )

        return self._run(operation)
