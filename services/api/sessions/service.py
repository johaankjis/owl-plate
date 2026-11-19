"""Visitor session lifecycle for the Join Demo, isolated from host and projector flows."""

from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from uuid import UUID, uuid4

from sqlmodel import Session, select

from services.api.campus import CampusRegistry
from services.api.db.models import Claim, Drop, Invite, Student, VisitorSession, Wave
from services.api.schemas.api import (
    JoinRequest,
    JoinResponse,
    SessionStudent,
    VisitorDecision,
)
from services.api.sessions.areas import RING_DISTANCE, area_cell

SESSION_LIMIT = 40
TOKEN_PREFIX = "demo-session-"
INVITED_REASONS = ["nearby", "diet_match", "fair_share"]
REASON_MAP = {"allergen_conflict": "dietary_filter", "diet_mismatch": "dietary_filter"}


class SessionError(Exception):
    """Visitor-session failures, mapped to contract errors at the application edge."""

    def __init__(self, code: str, message: str, status: int = 409) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def hash_token(token: str) -> str:
    """Store only a one-way digest so a leaked database cannot resurrect sessions."""
    return sha256(token.encode()).hexdigest()


def resolve_token(session: Session, token: str) -> str | None:
    """Map a raw session token to its student id, or None once revoked or reset."""
    record = session.exec(
        select(VisitorSession).where(VisitorSession.token_hash == hash_token(token))
    ).first()
    return record.student_id if record else None


def _join_cell(
    session: Session, origin: str, area: str | None, campus: CampusRegistry
) -> str | None:
    """Resolve a legacy rehearsal ring or a verified building's own cell, nothing else."""
    if area is None:
        return None
    if area in RING_DISTANCE:
        neighbors = session.exec(
            select(VisitorSession.student_id).where(VisitorSession.area == area)
        ).all()
        return area_cell(origin, RING_DISTANCE[area], len(neighbors))
    cell = campus.cells.get(area)
    if cell is None:
        raise SessionError("invalid_building", "Choose a building from the campus list.", 422)
    return cell


def create_session(
    session: Session,
    *,
    origin: str,
    now: datetime,
    request: JoinRequest,
    campus: CampusRegistry,
    location_free: bool = False,
) -> JoinResponse:
    """Create a distinct visitor student and a revocable token record per join call.

    In location-free (campus feed) mode the deprecated area is ignored entirely: nothing
    is validated, stored or derived from it, so no student cell ever exists.
    """
    area = None if location_free else request.area
    cell = _join_cell(session, origin, area, campus)
    if len(session.exec(select(VisitorSession.student_id)).all()) >= SESSION_LIMIT:
        raise SessionError("session_limit", "This demo session is full.")
    key = request.nickname.lower()
    if session.exec(select(VisitorSession).where(VisitorSession.nickname_key == key)).first():
        raise SessionError("nickname_taken", "That nickname is already in this demo.")
    student_id = str(uuid4())
    valid_until = now + timedelta(hours=2)
    data = {
        "kind": "visitor",
        "nickname": request.nickname,
        "allergens": list(request.allergens),
        "diets": list(request.diets),
        "alerts_paused": False,
        "priority": False,
        "claims_last_7d": 0,
        "ignored_last_7d": 0,
        "valid_from": now.isoformat(),
        "valid_until": valid_until.isoformat(),
    }
    if cell is not None:
        data |= {"area": area, "cell": cell}
    session.add(Student(id=student_id, label=request.nickname, is_simulated=False, data=data))
    token = TOKEN_PREFIX + token_urlsafe(32)
    session.add(
        VisitorSession(
            student_id=student_id,
            token_hash=hash_token(token),
            nickname=request.nickname,
            nickname_key=key,
            area=area or "",
            joined_at=now.isoformat(),
        )
    )
    session.flush()
    return JoinResponse(
        token=token,
        student=SessionStudent(
            id=UUID(student_id),
            nickname=request.nickname,
            area=area,
            allergens=list(request.allergens),
            diets=list(request.diets),
            kind="visitor",
            valid_until=valid_until,
        ),
    )


def require_session(session: Session, student_id: str) -> VisitorSession:
    """Allow only current visitor sessions on session endpoints."""
    record = session.exec(
        select(VisitorSession).where(VisitorSession.student_id == student_id)
    ).first()
    if record is None:
        raise SessionError("not_a_session", "No visitor session for this token.", 404)
    return record


def move_session(session: Session, student_id: str, area: str) -> None:
    """Keep a visitor's shown area in step with their latest real-building check-in."""
    record = session.exec(
        select(VisitorSession).where(VisitorSession.student_id == student_id)
    ).first()
    if record is not None:
        record.area = area
        session.add(record)


def session_student(session: Session, record: VisitorSession) -> SessionStudent:
    """Reflect the visitor's current preferences alongside the session record."""
    student = session.get(Student, record.student_id)
    return SessionStudent(
        id=UUID(record.student_id),
        nickname=record.nickname,
        area=record.area or None,
        allergens=list(student.data.get("allergens", [])),
        diets=list(student.data.get("diets", [])),
        kind="visitor",
        valid_until=datetime.fromisoformat(student.data["valid_until"]),
    )


def end_session(session: Session, student_id: str) -> list[Drop]:
    """Revoke the token, unwind holds and pending invites, and stop future matching."""
    record = require_session(session, student_id)
    for invite in session.exec(
        select(Invite).where(Invite.student_id == student_id, Invite.status == "sent")
    ).all():
        invite.status = "declined"
        session.add(invite)
    drops = []
    for claim in session.exec(
        select(Claim).where(Claim.student_id == student_id, Claim.status == "held")
    ).all():
        claim.status = "released"
        session.add(claim)
        drops.append(session.get(Drop, claim.drop_id))
    student = session.get(Student, student_id)
    student.data = {**student.data, "alerts_paused": True}
    session.add(student)
    session.delete(record)
    session.flush()
    return drops


def visitor_count(session: Session) -> int:
    """Count current visitor sessions for the presenter status overview."""
    return len(session.exec(select(VisitorSession.student_id)).all())


def visitor_decisions(
    session: Session,
    *,
    origin_cell: str,
    waves: Sequence[Wave],
    invites: Mapping[str, Invite],
    distance: Callable[[str, str], int | None],
) -> list[VisitorDecision]:
    """Build projector rows per visitor without exposing tokens, ids, or private filters."""
    records = session.exec(
        select(VisitorSession).order_by(VisitorSession.sequence, VisitorSession.student_id)
    ).all()
    if not records:
        return []
    numbers = {wave.id: wave.number for wave in waves}
    last = waves[-1] if waves else None
    rows = []
    for record in records:
        student = session.get(Student, record.student_id)
        invite = invites.get(record.student_id)
        cell = student.data.get("cell")
        if invite:
            status, reasons, wave_number = (
                invite.status,
                INVITED_REASONS,
                numbers.get(invite.wave_id),
            )
        elif last:
            reason = last.decisions["excluded"].get(record.student_id, "not_selected")
            status, reasons, wave_number = "excluded", [REASON_MAP.get(reason, reason)], None
        else:
            status, reasons, wave_number = "waiting", ["not_published"], None
        rows.append(
            VisitorDecision(
                nickname=record.nickname,
                area=record.area or None,
                ring_distance=distance(origin_cell, cell) if cell else None,
                status=status,
                reason_codes=reasons,
                h3_cell=cell,
                wave_number=wave_number,
            )
        )
    return rows
