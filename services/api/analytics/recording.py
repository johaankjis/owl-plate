"""Deterministic, clearly simulated recording dataset written into ordinary domain tables.

The caller clears demo state and runs this in the same serialized transaction, so a
failure leaves the previous data untouched. Every UUID and timestamp derives from
``SEED_VERSION`` and the anchor instant, so a repeated seed with the same anchor yields
identical rows, metrics and activity. Nothing here touches the network, stores a photo,
creates a session token or push registration, or leaves an outbox entry that could send
anything: invites and pickup updates are written already consumed and no feed
announcement exists. The rows are synthetic and never measured campus impact.
"""

from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, time, timedelta
from uuid import NAMESPACE_URL, uuid5

from sqlmodel import Session

from services.api.analytics.operations import NEW_YORK, local_date
from services.api.campus import CampusRegistry
from services.api.db.models import (
    Claim,
    DatasetMarker,
    Drop,
    HostPickupNotification,
    Invite,
    PantryReferral,
    PickupAttempt,
    Student,
    Wave,
)

SEED_VERSION = "recording-v1"
HOLD = timedelta(minutes=10)
STUDENT_POOL = 24
HOLD_STUDENTS = 4  # Dedicated to current holds so nobody has two active holds.
SIMULATED_NOTE = "SIMULATED recording dataset listing; no photo was taken or analyzed."
REVIEW_NOTE = "SIMULATED recording dataset assessment; no photo was taken or analyzed."
HOSTS = ("demo-host", "demo-recording-host-b", "demo-recording-host-c")
BUILDINGS = (
    "ksu-marietta-joe-mack-wilson-student-center",
    "ksu-marietta-atrium-building",
    "ksu-marietta-academic-building",
    "ksu-marietta-lawrence-v-johnson-library",
    "ksu-marietta-engineering-technology-center",
    "ksu-marietta-stingers-dining-hall",
    "ksu-marietta-recreation-wellness-center",
)


class RecordingUnavailable(Exception):
    """The verified buildings the dataset needs are missing; nothing is invented instead."""


@dataclass(frozen=True)
class Referral:
    status: str
    requested: int = 0
    accepted: int = 0
    created: int = 0  # Minutes after publication (past) or before the anchor (today).
    updated: int = 0


@dataclass(frozen=True)
class Listing:
    """One synthetic listing; event offsets are minutes after publication for past days
    and minutes before the anchor for today's still-active food."""

    key: str
    days_ago: int
    publish: str | int  # "HH:MM" New York time for past days; minutes before anchor today.
    expires_in: int
    items: tuple[tuple[str, str, int], ...]
    servings: int
    building: int
    host: int
    allergens: tuple[str, ...] = ()
    diets: tuple[str, ...] = ()
    pickups: tuple[tuple[int, int], ...] = ()  # (reserved, collected)
    released: tuple[int, ...] = ()
    lapsed: tuple[int, ...] = ()  # Holds that ran out without pickup.
    held: tuple[int, ...] = ()  # Current holds, today only.
    review_hold: int | None = None  # Index into ``held`` with a pending host review.
    referral: Referral | None = None
    room: str = "Lobby table"


# fmt: off
LISTINGS: tuple[Listing, ...] = (
    Listing(
        "today-pizza", 0, 25, 120, (("cheese pizza", "slice", 24),), 12, 0, 0,
        ("dairy", "gluten"), ("vegetarian",),
        pickups=((22, 15), (20, 12), (18, 10)), held=(4, 3), review_hold=1,
        referral=Referral("requested", requested=3, created=6, updated=6),
    ),
    Listing(
        "today-wraps", 0, 40, 120, (("veggie wraps", "wrap", 8),), 8, 1, 0,
        ("gluten", "soy"), ("vegetarian", "vegan"),
        pickups=((35, 30), (33, 28)), held=(5,),
        referral=Referral("accepted", requested=4, accepted=3, created=20, updated=12),
    ),
    Listing(
        "today-fruit", 0, 35, 44, (("fruit cups", "cup", 6),), 6, 2, 1,
        pickups=((30, 25),), held=(2,),
        referral=Referral("suggested", created=1, updated=1),
    ),
    Listing(
        "day1-pasta", 1, "12:30", 90, (("pasta salad", "bowl", 10),), 10, 3, 1,
        ("gluten", "egg"), ("vegetarian",),
        pickups=((5, 12), (8, 20), (11, 25), (15, 30), (21, 33), (30, 41)), lapsed=(35,),
        referral=Referral("handoff_confirmed", requested=2, accepted=2, created=50, updated=70),
    ),
    Listing(
        "day2-sandwiches", 2, "11:45", 90, (("turkey sandwiches", "sandwich", 15),), 15, 4, 2,
        ("gluten",),
        pickups=tuple((m, m + 9) for m in (3, 6, 9, 12, 16, 22, 28, 35, 41)), released=(14,),
        referral=Referral("rejected", requested=4, created=55, updated=62),
    ),
    Listing(
        "day3-bagels", 3, "08:30", 120, (("bagels", "bagel", 12),), 12, 5, 0,
        ("gluten", "sesame"), ("vegetarian",),
        pickups=tuple((m, m + 6) for m in (2, 4, 7, 10, 18, 26, 31)),
        referral=Referral("handoff_confirmed", requested=5, accepted=5, created=60, updated=95),
    ),
    Listing(
        "day4-burritos", 4, "13:10", 60, (("bean burritos", "burrito", 10),), 10, 0, 1,
        ("dairy", "gluten"), ("vegetarian",),
        pickups=((4, 10), (9, 15), (13, 20), (19, 26)),
        referral=Referral("expired", requested=3, accepted=3, created=30, updated=60),
    ),
    Listing(
        "day5-cookies", 5, "15:00", 120, (("chocolate chip cookies", "cookie", 40),), 20, 1, 2,
        ("dairy", "egg", "gluten"), ("vegetarian",),
        pickups=tuple((m, m + 5) for m in range(2, 72, 5)),
        lapsed=(80,),
    ),
    Listing(
        "day6-rice", 6, "12:00", 90, (("chicken rice bowls", "bowl", 9),), 9, 6, 0,
        ("soy",),
        pickups=tuple((m, m + 8) for m in (5, 9, 14, 20, 26)),
        referral=Referral("handoff_confirmed", requested=4, accepted=4, created=45, updated=75),
    ),
    Listing(
        "day6-hummus", 6, "17:20", 45, (("hummus and pita", "plate", 7),), 7, 3, 2,
        ("gluten", "sesame"), ("vegan", "vegetarian"),
        pickups=((6, 14), (12, 21)), released=(18,),
    ),
    Listing(
        "day12-rolls", 12, "14:00", 60, (("vegetable spring rolls", "roll", 16),), 8, 5, 1,
        (), ("vegan", "vegetarian"),
        pickups=tuple((m, m + 7) for m in (3, 8, 13, 21, 30)),
    ),
)
# fmt: on


@dataclass
class RecordingManifest:
    """What was seeded, for the response and tests; contains no student identity."""

    seed_version: str
    anchor_time: datetime
    drop_ids: list[str] = field(default_factory=list)
    building_ids: list[str] = field(default_factory=list)


def _uuid(anchor: datetime, *parts: object) -> str:
    """Stable ID from seed version, anchor and a local key; never random."""
    name = "|".join([SEED_VERSION, anchor.isoformat(), *map(str, parts)])
    return str(uuid5(NAMESPACE_URL, f"owl-plate-recording:{name}"))


def _published(anchor: datetime, listing: Listing) -> datetime:
    """Publication instant from the anchor's New York date; today stays inside today."""
    today = local_date(anchor)
    midnight = datetime.combine(today, time(0), tzinfo=NEW_YORK).astimezone(UTC)
    if listing.days_ago == 0:
        return max(anchor - timedelta(minutes=int(listing.publish)), midnight)
    hour, minute = map(int, str(listing.publish).split(":"))
    day = today - timedelta(days=listing.days_ago)
    return datetime.combine(day, time(hour, minute), tzinfo=NEW_YORK).astimezone(UTC)


def _event(anchor: datetime, published: datetime, listing: Listing, minutes: int) -> datetime:
    """Past listings count forward from publication; today's count back from the anchor."""
    if listing.days_ago == 0:
        return min(max(anchor - timedelta(minutes=minutes), published), anchor)
    return published + timedelta(minutes=minutes)


def _students(session: Session, anchor: datetime) -> list[str]:
    ids = []
    for number in range(1, STUDENT_POOL + 1):
        student_id = _uuid(anchor, "student", number)
        session.add(
            Student(
                id=student_id,
                label=f"Simulated recording student {number:02d}",
                is_simulated=True,
                data={
                    "kind": "recording",
                    "allergens": [],
                    "diets": [],
                    "alerts_paused": True,
                    "priority": False,
                    "claims_last_7d": 0,
                    "ignored_last_7d": 0,
                    "valid_from": anchor.isoformat(),
                    "valid_until": (anchor + timedelta(hours=2)).isoformat(),
                },
            )
        )
        ids.append(student_id)
    return ids


def _drop(
    listing: Listing, drop_id: str, published: datetime, expires: datetime, building, cell: str
) -> Drop:
    items = [{"name": n, "portion_unit": u, "count_estimate": c} for n, u, c in listing.items]
    return Drop(
        id=drop_id,
        host_id=HOSTS[listing.host],
        status="live",
        data={
            "building_code": building.id,
            "room": listing.room,
            "pickup_instructions": "Simulated recording listing.",
            "building": building.model_dump(mode="json"),
            "origin_cell": cell,
            "vision": {
                "items": items,
                "servings_estimate": listing.servings,
                "servings_low": listing.servings,
                "servings_high": listing.servings,
                "allergens_likely": list(listing.allergens),
                "diet_tags": [d for d in listing.diets if d in {"vegetarian", "vegan"}],
                "confidence": 0.8,
                "notes": SIMULATED_NOTE,
            },
            "vision_source": "fixture",
            "servings_final": listing.servings,
            "allergens_final": list(listing.allergens),
            "diet_tags_final": list(listing.diets),
            "safety_review": {
                "covered_and_temperature_safe": True,
                "served_within_two_hours": True,
                "untouched": True,
                "ingredient_information_checked": True,
                "religious_diets_confirmed": False,
            },
            "created_at": (published - timedelta(minutes=2)).isoformat(),
            "published_at": published.isoformat(),
            "expires_at": expires.isoformat(),
            "expires_in_minutes": listing.expires_in,
            "distribution_mode": "campus_feed",
            "recording_dataset": SEED_VERSION,
        },
    )


def _claim(
    session: Session,
    *,
    anchor: datetime,
    drop: Drop,
    wave_id: str,
    student_id: str,
    key: str,
    status: str,
    created: datetime,
    expires: datetime,
) -> Claim:
    held_until = min(created + HOLD, expires)
    invite = Invite(
        id=_uuid(anchor, drop.id, key, "invite"),
        drop_id=drop.id,
        wave_id=wave_id,
        student_id=student_id,
        status="claimed",
        sent_at=created.isoformat(),
        expires_at=held_until.isoformat(),
        notification_sent=True,  # Never an outbox entry.
    )
    session.add(invite)
    session.flush()
    claim = Claim(
        id=_uuid(anchor, drop.id, key, "claim"),
        invite_id=invite.id,
        drop_id=drop.id,
        student_id=student_id,
        status=status,
        created_at=created.isoformat(),
        held_until=held_until.isoformat(),
    )
    session.add(claim)
    return claim


def _seed_listing(
    session: Session,
    anchor: datetime,
    listing: Listing,
    campus: CampusRegistry,
    students: Sequence[str],
    holders: Iterator[str],
) -> str:
    building = campus.get(BUILDINGS[listing.building])
    published = _published(anchor, listing)
    expires = published + timedelta(minutes=listing.expires_in)
    drop_id = _uuid(anchor, listing.key, "drop")
    drop = _drop(listing, drop_id, published, expires, building, campus.cells[building.id])
    session.add(drop)
    session.flush()
    wave = Wave(
        id=_uuid(anchor, drop_id, "wave"),
        drop_id=drop_id,
        number=1,
        ring_k=0,
        planned_at=published.isoformat(),
        decisions={"invited": {}, "excluded": {}},
    )
    session.add(wave)
    session.flush()

    def at(minutes: int) -> datetime:
        return _event(anchor, published, listing, minutes)

    pool = iter(students[: STUDENT_POOL - HOLD_STUDENTS])
    remaining = listing.servings
    for index, (reserved, collected) in enumerate(listing.pickups):
        claim = _claim(
            session,
            anchor=anchor,
            drop=drop,
            wave_id=wave.id,
            student_id=next(pool),
            key=f"pickup-{index}",
            status="picked_up",
            created=at(reserved),
            expires=expires,
        )
        remaining -= 1
        session.add(
            HostPickupNotification(
                id=_uuid(anchor, drop_id, index, "pickup-update"),
                claim_id=claim.id,
                drop_id=drop_id,
                host_id=drop.host_id,
                food=listing.items[0][0],
                available=max(remaining, 0),
                created_at=at(collected).isoformat(),
                sent=True,  # Already consumed: never delivered by this dataset.
            )
        )
    for status, offsets in (("released", listing.released), ("expired", listing.lapsed)):
        for index, minutes in enumerate(offsets):
            _claim(
                session,
                anchor=anchor,
                drop=drop,
                wave_id=wave.id,
                student_id=next(pool),
                key=f"{status}-{index}",
                status=status,
                created=at(minutes),
                expires=expires,
            )
    for index, minutes in enumerate(listing.held):
        holder = next(holders)
        claim = _claim(
            session,
            anchor=anchor,
            drop=drop,
            wave_id=wave.id,
            student_id=holder,
            key=f"held-{index}",
            status="held",
            created=at(minutes),
            expires=expires,
        )
        if listing.review_hold == index:
            session.flush()
            session.add(
                PickupAttempt(
                    id=_uuid(anchor, drop_id, "review"),
                    claim_id=claim.id,
                    drop_id=drop_id,
                    request_id=_uuid(anchor, drop_id, "review-request"),
                    ordinal=1,
                    status="ready",
                    match_status="uncertain",
                    confidence=0.5,
                    explanation=REVIEW_NOTE,
                    source="fixture",
                    created_at=at(max(minutes - 1, 0)).isoformat(),
                    review_status="pending",
                    review_requested_at=at(max(minutes - 2, 0)).isoformat(),
                )
            )
    referral = listing.referral
    if referral is not None:
        updated = expires if referral.status == "expired" else at(referral.updated)
        session.add(
            PantryReferral(
                id=_uuid(anchor, drop_id, "referral"),
                drop_id=drop_id,
                status=referral.status,
                requested_servings=referral.requested,
                accepted_servings=referral.accepted,
                transferred_servings=referral.accepted
                if referral.status == "handoff_confirmed"
                else 0,
                created_at=at(referral.created).isoformat(),
                updated_at=updated.isoformat(),
            )
        )
    drop.status = "expired" if expires <= anchor else "live"
    session.add(drop)
    return drop_id


def seed_recording(
    session: Session, *, anchor: datetime, campus: CampusRegistry
) -> RecordingManifest:
    """Write the dataset and its persistent marker; the caller has already cleared state.

    The application refreshes drop statuses through the shared ledger afterwards, so a
    fully allocated listing becomes claimed out exactly as a live one would.
    """
    if anchor.tzinfo is None:
        raise ValueError("Recording anchor must be timezone-aware")
    anchor = anchor.astimezone(UTC).replace(microsecond=0)
    missing = [b for b in BUILDINGS if campus.get(b) is None or b not in campus.cells]
    if missing:
        raise RecordingUnavailable("Verified campus buildings for the recording are missing.")
    students = _students(session, anchor)
    session.flush()
    manifest = RecordingManifest(SEED_VERSION, anchor, building_ids=list(BUILDINGS))
    holders = iter(students[STUDENT_POOL - HOLD_STUDENTS :])
    for listing in LISTINGS:
        manifest.drop_ids.append(_seed_listing(session, anchor, listing, campus, students, holders))
    session.add(DatasetMarker(id=1, seed_version=SEED_VERSION, anchor_time=anchor.isoformat()))
    session.flush()
    return manifest
