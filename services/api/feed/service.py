"""Campus-feed rules kept apart from transactions, routes and the pure wave planner.

Every function here works inside a caller-owned database session so the application
service can keep reservations, capacity and announcements under one serialized lock.
Nothing here reads, stores or derives a student location.
"""

from collections.abc import Callable, Iterable, Mapping
from datetime import datetime
from typing import Literal
from uuid import uuid4

from sqlmodel import Session, select

from services.api.db.models import Claim, Drop, FeedNotification, Invite, Student, VisitorSession
from services.api.schemas.api import (
    BuildingDistribution,
    Counts,
    DistributionMode,
    Scenario,
    UnavailableReason,
)

MODE_BY_SCENARIO: Mapping[Scenario, DistributionMode] = {
    "visitors": "campus_feed",
    "seeded": "seeded_waves",
}
FEED_STATUSES = ("live", "claimed_out")


def drop_mode(drop: Drop) -> DistributionMode:
    """Read the publication snapshot; drops persisted before the feed are seeded waves."""
    return drop.data.get("distribution_mode", "seeded_waves")


def preference_conflict(
    student: Student, drop: Drop
) -> Literal["allergen_conflict", "diet_mismatch"] | None:
    """Judge food against this student's current declared preferences only."""
    if set(student.data.get("allergens", [])) & set(drop.data["allergens_final"]):
        return "allergen_conflict"
    if not set(student.data.get("diets", [])) <= set(drop.data["diet_tags_final"]):
        return "diet_mismatch"
    return None


def has_active_hold(session: Session, student_id: str) -> bool:
    """One held serving per student across every drop, feed or seeded."""
    return (
        session.exec(
            select(Claim.id).where(Claim.student_id == student_id, Claim.status == "held")
        ).first()
        is not None
    )


def own_feed_claim(session: Session, student_id: str, drop_id: str) -> Claim | None:
    """The single reservation a student may ever have on one drop, in any final state."""
    return session.exec(
        select(Claim).where(Claim.student_id == student_id, Claim.drop_id == drop_id)
    ).first()


def unavailable_reason(
    session: Session,
    student: Student,
    drop: Drop,
    claim: Claim | None,
    available: int,
) -> UnavailableReason | None:
    """Explain a disabled reserve button; dietary reasons outrank capacity ones."""
    if claim is not None:
        return "already_reserved"
    conflict = preference_conflict(student, drop)
    if conflict:
        return conflict
    if has_active_hold(session, student.id):
        return "active_claim"
    if available <= 0:
        return "capacity"
    return None


def announcement_eligible(
    session: Session, record: FeedNotification, drop: Drop, now: datetime
) -> bool:
    """Recheck consent and safety before a deferred send; revoked opportunities stay cancelled."""
    student = session.get(Student, record.student_id)
    joined = session.exec(
        select(VisitorSession).where(VisitorSession.student_id == record.student_id)
    ).first()
    return bool(
        student is not None
        and joined is not None
        and now < datetime.fromisoformat(student.data["valid_until"])
        and now < datetime.fromisoformat(drop.data["expires_at"])
        and not student.data.get("alerts_paused", False)
        and not preference_conflict(student, drop)
        and not has_active_hold(session, student.id)
        and own_feed_claim(session, student.id, drop.id) is None
    )


def _published_at(drop: Drop) -> str:
    return drop.data.get("published_at") or drop.data["created_at"]


def active_feed_drops(session: Session) -> list[Drop]:
    """Unexpired published campus-feed drops, newest first with a stable ID tie-break.

    Callers must expire deadlines first in the same transaction so status is current.
    """
    drops = [
        drop
        for drop in session.exec(select(Drop).where(Drop.status.in_(FEED_STATUSES))).all()
        if drop_mode(drop) == "campus_feed"
    ]
    return sorted(drops, key=lambda d: (_published_at(d), d.id), reverse=True)


def enqueue_announcements(session: Session, drop: Drop, now: datetime) -> int:
    """Record one durable new-drop announcement per eligible joined student.

    Eligibility is preference and consent only: no location, ring or wave-size cap. The
    unique student/drop pair means repeated publishes can never enqueue a second one.
    """
    queued = 0
    existing = set(
        session.exec(
            select(FeedNotification.student_id).where(FeedNotification.drop_id == drop.id)
        ).all()
    )
    for record in session.exec(
        select(VisitorSession).order_by(VisitorSession.sequence, VisitorSession.student_id)
    ).all():
        student = session.get(Student, record.student_id)
        if (
            student is None
            or student.id in existing
            or student.data.get("alerts_paused", False)
            or preference_conflict(student, drop)
            or has_active_hold(session, student.id)
        ):
            continue
        session.add(
            FeedNotification(
                id=str(uuid4()),
                drop_id=drop.id,
                student_id=student.id,
                created_at=now.isoformat(),
            )
        )
        queued += 1
    session.flush()
    return queued


def feed_invite(session: Session, drop_id: str, student_id: str) -> Invite | None:
    """Internal row that backs a feed reservation's claim foreign key; never notified."""
    return session.exec(
        select(Invite).where(Invite.drop_id == drop_id, Invite.student_id == student_id)
    ).first()


def distribution_rows(
    drops: Iterable[Drop], counts: Callable[[Drop], Counts]
) -> tuple[Counts, list[BuildingDistribution]]:
    """Sum host pickup counts by host building; no student is represented at all.

    A drop is "available" only while its own snapshot still has a serving to reserve, so a
    claimed-out drop keeps its held/collected contribution without advertising food.
    """
    totals = {"total": 0, "available": 0, "held": 0, "picked_up": 0}
    groups: dict[str, dict] = {}
    for drop in drops:
        drop_counts = counts(drop).model_dump()
        code = drop.data["building_code"]
        group = groups.setdefault(
            code,
            {
                "building": drop.data.get("building"),
                "active_drops": 0,
                "available_drops": 0,
                "counts": dict.fromkeys(totals, 0),
            },
        )
        group["active_drops"] += 1
        group["available_drops"] += int(drop_counts["available"] > 0)
        for key, value in drop_counts.items():
            group["counts"][key] += value
            totals[key] += value
    rows = [
        BuildingDistribution(
            building_code=code,
            building=group["building"],
            active_drops=group["active_drops"],
            available_drops=group["available_drops"],
            counts=Counts(**group["counts"]),
        )
        for code, group in sorted(groups.items())
    ]
    return Counts(**totals), rows
