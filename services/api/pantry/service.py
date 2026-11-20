"""Simulated CARE pantry referral rules inside a caller-owned serialized session.

Milestone 4 is a demonstration only: nothing here contacts KSU, sends a message or claims
a real transfer. KSU catering policy prohibits removing leftovers from event spaces and no
acknowledgment waives it. Callers run every function under the same serialized
transaction as student reservations, so pantry allocation and student holds can never
both consume the last serving. Nothing here reads or returns a student identity.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlmodel import Session, select

from services.api.campus import CampusRegistry
from services.api.db.models import Drop, PantryReferral
from services.api.feed import drop_mode
from services.api.schemas.api import DropResponse, PantryDestination
from services.api.schemas.api import PantryReferral as PantryReferralOut

DESTINATION_BUILDING_ID = "ksu-marietta-joe-mack-wilson-student-center"
DESTINATION_NAME = "KSU CARE Pantry"
DESTINATION_ROOM = "Room 184"
CARE_SOURCE_URL = (
    "https://campus.kennesaw.edu/current-students/student-affairs/wellbeing/care-services/"
)
CATERING_POLICY_URL = "https://campus.kennesaw.edu/offices-services/catering/policies.php"
# Explicit, reversible demo threshold for suggesting a referral; not a KSU policy.
SUGGEST_WINDOW = timedelta(minutes=10)
# States that end at the drop's original deadline; the others are terminal.
OPEN_STATES = frozenset({"suggested", "requested", "accepted"})


class PantryError(Exception):
    """Pantry failures, mapped to the shared contract error envelope by the application."""

    def __init__(self, code: str, message: str, status: int = 409) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(UTC)


def destination(campus: CampusRegistry) -> PantryDestination:
    """Build the verified destination from the registry; refuse to invent coordinates."""
    building = campus.get(DESTINATION_BUILDING_ID)
    if building is None:
        raise PantryError(
            "pantry_destination_unavailable",
            "The verified pantry destination is not available on this server.",
            503,
        )
    return PantryDestination(
        name=DESTINATION_NAME,
        building=building,
        room=DESTINATION_ROOM,
        # Destination coordinates only: no origin, no API key, no student location.
        directions_url=(
            "https://www.google.com/maps/dir/?api=1"
            f"&destination={building.latitude},{building.longitude}&travelmode=walking"
        ),
        care_source_url=CARE_SOURCE_URL,
        catering_policy_url=CATERING_POLICY_URL,
    )


def referral_for(session: Session, drop_id: str) -> PantryReferral | None:
    """The single referral a drop may ever have, in any state."""
    return session.exec(select(PantryReferral).where(PantryReferral.drop_id == drop_id)).first()


def allocation(referral: PantryReferral | None) -> tuple[int, int]:
    """Return ``(pantry_held, pantry_transferred)`` for the inventory invariant.

    Only an accepted referral holds stock and only a confirmed handoff counts as
    transferred; suggested, requested, rejected and expired referrals hold nothing.
    """
    if referral is None:
        return 0, 0
    if referral.status == "accepted":
        return referral.accepted_servings, 0
    if referral.status == "handoff_confirmed":
        return 0, referral.transferred_servings
    return 0, 0


def expire_with_drop(session: Session, drop: Drop, now: datetime) -> None:
    """End open referrals at the drop's original deadline, releasing untransferred stock.

    Runs only once the drop itself is expired, so released servings can never reenter the
    student feed, and nothing here touches the drop deadline.
    """
    if drop.status != "expired":
        return
    referral = referral_for(session, drop.id)
    if referral is not None and referral.status in OPEN_STATES:
        referral.status = "expired"
        referral.updated_at = now.isoformat()
        session.add(referral)


def suggest_if_due(session: Session, drop: Drop, available: int, now: datetime) -> None:
    """Record one suggestion in the last ten minutes of an unexpired feed drop with food left.

    A suggestion allocates nothing, sends nothing and never becomes a request on its own.
    """
    if drop_mode(drop) != "campus_feed" or drop.status != "live" or available <= 0:
        return
    remaining = _at(drop.data["expires_at"]) - now
    if not timedelta(0) < remaining <= SUGGEST_WINDOW:
        return
    if referral_for(session, drop.id) is not None:
        return
    session.add(
        PantryReferral(
            id=str(uuid4()),
            drop_id=drop.id,
            status="suggested",
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
        )
    )
    session.flush()


def request(
    session: Session, drop: Drop, servings: int, available: int, now: datetime
) -> PantryReferral:
    """Snapshot a host's requested quantity; it reserves nothing.

    A retry returns the existing requested, accepted or final record unchanged; only a
    suggestion becomes a request, and only through this explicit call.
    """
    if drop_mode(drop) != "campus_feed" or drop.status == "draft":
        raise PantryError("invalid_state", "Pantry referrals apply to published feed drops.")
    referral = referral_for(session, drop.id)
    if referral is not None and referral.status != "suggested":
        return referral
    if drop.status == "expired":
        raise PantryError("drop_expired", "This food is no longer available.")
    if servings > available:
        raise PantryError(
            "capacity", f"Only {available} servings are available to request right now."
        )
    if referral is None:
        referral = PantryReferral(id=str(uuid4()), drop_id=drop.id, created_at=now.isoformat())
    referral.status = "requested"
    referral.requested_servings = servings
    referral.updated_at = now.isoformat()
    session.add(referral)
    session.flush()
    return referral


def decide(
    session: Session,
    referral: PantryReferral,
    decision: str,
    servings: int | None,
    available: int,
    now: datetime,
) -> PantryReferral:
    """Apply a simulated coordinator decision; acceptance allocates only free stock.

    ``available`` must be counted under the same lock as student reservations. Student
    holds and pickups are never cancelled, shrunk or overridden. Exact retries are
    idempotent; contradictory decisions or quantities conflict.
    """
    if decision == "reject":
        if referral.status == "rejected":
            return referral
        if referral.status != "requested":
            raise PantryError("invalid_state", "Only a requested referral can be rejected.")
        referral.status = "rejected"
    else:
        if referral.status in {"accepted", "handoff_confirmed"}:
            if servings == referral.accepted_servings:
                return referral
            raise PantryError("invalid_state", "This referral was accepted with another amount.")
        if referral.status == "expired":
            raise PantryError("referral_expired", "This referral has expired.")
        if referral.status != "requested":
            raise PantryError("invalid_state", "Only a requested referral can be accepted.")
        if servings is None or servings < 1:
            raise PantryError("invalid_quantity", "Choose how many servings to accept.", 422)
        if servings > referral.requested_servings:
            raise PantryError("invalid_quantity", "Accept no more than the requested servings.")
        if servings > available:
            raise PantryError(
                "capacity", f"Only {available} servings are available to accept right now."
            )
        referral.status = "accepted"
        referral.accepted_servings = servings
    referral.updated_at = now.isoformat()
    session.add(referral)
    session.flush()
    return referral


def confirm_handoff(session: Session, referral: PantryReferral, now: datetime) -> PantryReferral:
    """Move the accepted amount to transferred exactly once; a simulated confirmation only."""
    if referral.status == "handoff_confirmed":
        return referral
    if referral.status == "expired":
        raise PantryError("referral_expired", "This referral has expired.")
    if referral.status != "accepted":
        raise PantryError("invalid_state", "Only an accepted referral can be handed off.")
    referral.status = "handoff_confirmed"
    referral.transferred_servings = referral.accepted_servings
    referral.updated_at = now.isoformat()
    session.add(referral)
    session.flush()
    return referral


def referral_response(
    referral: PantryReferral,
    drop: Drop,
    drop_response: DropResponse,
    place: PantryDestination,
) -> PantryReferralOut:
    """Public referral shape: aggregate counts and host-reviewed food only, no identities."""
    return PantryReferralOut(
        id=referral.id,
        drop_id=referral.drop_id,
        status=referral.status,
        requested_servings=referral.requested_servings,
        accepted_servings=referral.accepted_servings,
        transferred_servings=referral.transferred_servings,
        # Unallocated stock for display only; never a promise or a reservation.
        eligible_servings=max(drop_response.counts.available, 0),
        created_at=_at(referral.created_at),
        updated_at=_at(referral.updated_at),
        expires_at=_at(drop.data["expires_at"]),
        destination=place,
        drop=drop_response,
    )
