"""Pickup-attempt, review and host-update rules inside a caller-owned serialized session.

Nothing here performs network I/O: the application service commits a ``processing``
attempt, calls the verifier outside any transaction, then records the result here under a
fresh lock. No photo, image hash, data URL or EXIF is ever accepted by these functions.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import func
from sqlmodel import Session, select

from services.api.db.models import Claim, Drop, HostPickupNotification, PickupAttempt
from services.api.pickup.contract import ListingItem, PickupAssessment, normalize
from services.api.schemas.api import (
    HostPickupReview,
    PickupSource,
    PickupVerification,
    ReviewStatus,
)

STALE_AFTER = timedelta(seconds=120)
UNAVAILABLE = "The photo check could not finish. No result was made; try another photo."
TIMED_OUT = "The photo check timed out. No result was made; try another photo."
# Review states that end an attempt's authority to confirm or be approved.
CLOSED_REVIEWS = {"rejected", "expired", "superseded"}


class PickupError(Exception):
    """Pickup failures, mapped to the shared contract error envelope by the application."""

    def __init__(self, code: str, message: str, status: int = 409) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(UTC)


def hold_active(claim: Claim, drop: Drop, now: datetime) -> bool:
    """A hold can be checked, reviewed or completed only while it and its drop are live."""
    return (
        claim.status == "held"
        and now < _at(claim.held_until)
        and drop.status != "expired"
        and drop.data.get("expires_at") is not None
        and now < _at(drop.data["expires_at"])
    )


def listing_items(drop: Drop) -> list[ListingItem]:
    """The immutable published food items: names and portion units, nothing else."""
    return [
        ListingItem(name=item["name"], portion_unit=item["portion_unit"])
        for item in drop.data["vision"]["items"]
    ]


def latest_attempt(session: Session, claim_id: str) -> PickupAttempt | None:
    """Latest by explicit per-claim ordinal, never by clock or UUID."""
    return session.exec(
        select(PickupAttempt)
        .where(PickupAttempt.claim_id == claim_id)
        .order_by(PickupAttempt.ordinal.desc())
        .limit(1)
    ).first()


def _fail(attempt: PickupAttempt, explanation: str) -> None:
    attempt.status = "failed"
    attempt.match_status = None
    attempt.confidence = None
    attempt.explanation = explanation


def sweep(session: Session, now: datetime) -> None:
    """Time out stale checks and close reviews whose hold is gone, before any decision."""
    for attempt in session.exec(
        select(PickupAttempt).where(PickupAttempt.status == "processing")
    ).all():
        if now >= _at(attempt.created_at) + STALE_AFTER:
            _fail(attempt, TIMED_OUT)
            session.add(attempt)
    for attempt in session.exec(
        select(PickupAttempt).where(PickupAttempt.review_status == "pending")
    ).all():
        claim = session.get(Claim, attempt.claim_id)
        if claim.status != "held":
            attempt.review_status = "superseded" if claim.status == "picked_up" else "expired"
            session.add(attempt)
    session.flush()


def start_attempt(
    session: Session,
    claim: Claim,
    drop: Drop,
    request_id: UUID,
    source: PickupSource,
    now: datetime,
) -> tuple[PickupAttempt, bool]:
    """Return ``(attempt, is_new)``; only a new attempt may trigger one model call.

    A retried request ID returns its own attempt whatever its state. A different request
    while one is processing is refused, and a new attempt supersedes older authority.
    """
    existing = session.exec(
        select(PickupAttempt).where(
            PickupAttempt.claim_id == claim.id, PickupAttempt.request_id == str(request_id)
        )
    ).first()
    if existing is not None:
        return existing, False
    if not hold_active(claim, drop, now):
        raise PickupError("invalid_state", "This hold is no longer available.")
    if session.exec(
        select(PickupAttempt.id).where(
            PickupAttempt.claim_id == claim.id, PickupAttempt.status == "processing"
        )
    ).first():
        raise PickupError("verification_in_progress", "A photo check is already running.")
    ordinal = session.exec(
        select(func.max(PickupAttempt.ordinal)).where(PickupAttempt.claim_id == claim.id)
    ).one()
    for older in session.exec(
        select(PickupAttempt).where(
            PickupAttempt.claim_id == claim.id,
            PickupAttempt.review_status.in_(["not_requested", "pending"]),
        )
    ).all():
        older.review_status = "superseded"
        session.add(older)
    attempt = PickupAttempt(
        id=str(uuid4()),
        claim_id=claim.id,
        drop_id=drop.id,
        request_id=str(request_id),
        ordinal=(ordinal or 0) + 1,
        source=source,
        created_at=now.isoformat(),
    )
    session.add(attempt)
    session.flush()
    return attempt, True


def record_result(
    session: Session, attempt_id: str, assessment: PickupAssessment | None
) -> PickupAttempt:
    """Store a normalized result unless the attempt already timed out or was reset.

    A late result never overwrites a failed attempt, and a superseded attempt keeps its
    closed review state, so it can never confirm over a newer one.
    """
    attempt = session.get(PickupAttempt, attempt_id)
    if attempt is None:
        raise PickupError("not_found", "Not found.", 404)
    if attempt.status != "processing":
        return attempt
    if assessment is None:
        _fail(attempt, UNAVAILABLE)
    else:
        result = normalize(assessment)
        attempt.status = "ready"
        attempt.match_status = result.match_status
        attempt.confidence = result.confidence
        attempt.explanation = result.explanation
    session.add(attempt)
    session.flush()
    return attempt


def _is_latest(session: Session, attempt: PickupAttempt) -> bool:
    latest = latest_attempt(session, attempt.claim_id)
    return latest is not None and latest.id == attempt.id


def can_confirm(
    session: Session, attempt: PickupAttempt, claim: Claim, drop: Drop, now: datetime
) -> bool:
    """Derived on every read so expiry, release and newer attempts revoke authority."""
    return (
        attempt.status == "ready"
        and attempt.match_status == "consistent"
        and attempt.review_status not in CLOSED_REVIEWS
        and _is_latest(session, attempt)
        and hold_active(claim, drop, now)
    )


def verification_response(
    session: Session, attempt: PickupAttempt, claim: Claim, drop: Drop, now: datetime
) -> PickupVerification:
    """The student's own view of one attempt; it never contains a photo."""
    return PickupVerification(
        id=attempt.id,
        claim_id=attempt.claim_id,
        status=attempt.status,
        match_status=attempt.match_status,
        confidence=attempt.confidence,
        explanation=attempt.explanation,
        source=attempt.source,
        created_at=_at(attempt.created_at),
        review_status=attempt.review_status,
        can_confirm=can_confirm(session, attempt, claim, drop, now),
    )


def own_attempt(session: Session, claim: Claim, verification_id: UUID) -> PickupAttempt:
    """An attempt that does not belong to this claim is simply an invalid state."""
    attempt = session.get(PickupAttempt, str(verification_id))
    if attempt is None or attempt.claim_id != claim.id:
        raise PickupError("invalid_state", "This photo check does not apply to this hold.")
    return attempt


def require_confirmable(
    session: Session, attempt: PickupAttempt, claim: Claim, drop: Drop, now: datetime
) -> None:
    """Only the latest consistent result on a live hold may complete pickup."""
    if not can_confirm(session, attempt, claim, drop, now):
        raise PickupError("invalid_state", "This photo check cannot confirm pickup.")


def request_review(
    session: Session, attempt: PickupAttempt, claim: Claim, drop: Drop, now: datetime
) -> PickupAttempt:
    """Ask the host to look, idempotently; never extends the hold or completes pickup."""
    if attempt.review_status == "pending" and hold_active(claim, drop, now):
        return attempt
    if (
        attempt.status != "ready"
        or attempt.review_status != "not_requested"
        or not _is_latest(session, attempt)
        or not hold_active(claim, drop, now)
    ):
        raise PickupError("invalid_state", "Host review is not available for this check.")
    attempt.review_status = "pending"
    attempt.review_requested_at = now.isoformat()
    session.add(attempt)
    session.flush()
    return attempt


def review_response(attempt: PickupAttempt, claim: Claim) -> HostPickupReview:
    """De-identified: opaque attempt ID, assessment and hold deadline only."""
    return HostPickupReview(
        id=attempt.id,
        drop_id=attempt.drop_id,
        match_status=attempt.match_status,
        confidence=attempt.confidence,
        explanation=attempt.explanation,
        source=attempt.source,
        created_at=_at(attempt.created_at),
        held_until=_at(claim.held_until),
        review_status=attempt.review_status,
    )


def pending_reviews(session: Session, drop: Drop, now: datetime) -> list[HostPickupReview]:
    """Current requests on one drop, oldest request first; closed ones drop out."""
    reviews = []
    for attempt in session.exec(
        select(PickupAttempt)
        .where(PickupAttempt.drop_id == drop.id, PickupAttempt.review_status == "pending")
        .order_by(PickupAttempt.review_requested_at, PickupAttempt.id)
    ).all():
        claim = session.get(Claim, attempt.claim_id)
        if hold_active(claim, drop, now) and _is_latest(session, attempt):
            reviews.append(review_response(attempt, claim))
    return reviews


def decide_review(
    session: Session,
    attempt: PickupAttempt,
    claim: Claim,
    drop: Drop,
    decision: str,
    now: datetime,
) -> bool:
    """Apply a host decision; return True only when this call approves (consumes) the hold.

    Same-decision retries are no-ops. Contradictory, stale, superseded or expired
    reviews are refused even if the host's screen still shows them.
    """
    target: ReviewStatus = "approved" if decision == "approve" else "rejected"
    if attempt.review_status == target:
        return False
    if (
        attempt.review_status != "pending"
        or not _is_latest(session, attempt)
        or not hold_active(claim, drop, now)
    ):
        raise PickupError("invalid_state", "This review is no longer current.")
    attempt.review_status = target
    attempt.reviewed_at = now.isoformat()
    if target == "approved":
        attempt.completed_by = "host_approval"
        claim.status = "picked_up"
        session.add(claim)
    session.add(attempt)
    session.flush()
    return target == "approved"


def complete_with_result(session: Session, attempt: PickupAttempt, claim: Claim) -> None:
    """Consume the hold on the student's explicit request after a consistent result."""
    attempt.completed_by = "student_consistent"
    claim.status = "picked_up"
    session.add(attempt)
    session.add(claim)
    session.flush()


def enqueue_host_update(
    session: Session, claim: Claim, drop: Drop, available: int, now: datetime
) -> None:
    """One durable host event per claim, with the count captured at this commit."""
    if session.exec(
        select(HostPickupNotification.id).where(HostPickupNotification.claim_id == claim.id)
    ).first():
        return
    session.add(
        HostPickupNotification(
            id=str(uuid4()),
            claim_id=claim.id,
            drop_id=drop.id,
            host_id=drop.host_id,
            food=drop.data["vision"]["items"][0]["name"],
            available=available,
            created_at=now.isoformat(),
        )
    )
    session.flush()


def host_update_body(record: HostPickupNotification) -> str:
    """Food name and aggregate count only; never who collected it."""
    servings = "serving" if record.available == 1 else "servings"
    return (
        f"A serving of {record.food} was marked collected. {record.available} {servings} available."
    )
