"""Project persisted domain rows into the Operations & Impact snapshot.

Callers run this inside the shared serialized transaction after the normal expiry sweep,
so statuses, holds and pantry allocations are current. Every number comes from durable
rows through the same per-drop ``Counts`` ledger the feed, map and projector use; nothing
here allocates, writes or calls a provider. Event dates are only the timestamps the app
actually captured: publication, ``HostPickupNotification.created_at``, a terminal
referral's ``updated_at`` and the drop's original deadline. Missing ones are disclosed,
never invented. No student, claim, host or session identifier leaves this module.
"""

import math
import re
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from pydantic import ValidationError
from sqlmodel import Session, select

from services.api.db.models import (
    Claim,
    DatasetMarker,
    Drop,
    HostPickupNotification,
    PantryReferral,
)
from services.api.feed import FEED_STATUSES, drop_mode
from services.api.pickup.service import pending_reviews
from services.api.schemas.api import Building, Counts
from services.api.schemas.operations import (
    ActivityKind,
    OperationsActivity,
    OperationsBuilding,
    OperationsCategory,
    OperationsDataset,
    OperationsEstimates,
    OperationsListing,
    OperationsOutcomes,
    OperationsPeriod,
    OperationsResponse,
    OperationsSeriesPoint,
    OperationsSummary,
)
from services.api.sessions import visitor_count
from services.api.storage.photos import has_stored_photo, photo_path

NEW_YORK = ZoneInfo("America/New_York")
PERIOD_DAYS: dict[OperationsPeriod, int | None] = {"today": 1, "7d": 7, "30d": 30, "all": None}
ACTIVITY_LIMIT = 20
# Illustrative assumptions only; configurable per deployment and never measured KSU facts.
DEFAULT_MEAL_VALUE_USD = 5.0
DEFAULT_FOOD_KG_PER_SERVING = 0.35
MAX_MEAL_VALUE_USD = 100.0
MAX_FOOD_KG_PER_SERVING = 5.0
# First match wins, item names only; mirrors the student feed's category chips.
CATEGORY_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Pizza", re.compile(r"\b(pizza|flatbread|calzone|stromboli|slices?)\b", re.IGNORECASE)),
    (
        "Sandwiches & wraps",
        re.compile(
            r"\b(sandwich(?:es)?|wraps?|subs?|paninis?|burgers?|sliders?|hoagies?|"
            r"quesadillas?|tacos?|burritos?|pitas?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "Salads & bowls",
        re.compile(
            r"\b(salads?|bowls?|greens|grains?|poke|pasta|rice|soups?|chili)\b", re.IGNORECASE
        ),
    ),
    (
        "Snacks & sides",
        re.compile(
            r"\b(snacks?|chips?|cookies?|brownies?|muffins?|pastr(?:y|ies)|fruit|veggie\s*tray|"
            r"pretzels?|popcorn|donuts?|cupcakes?|bagels?|breadsticks?|wings?|sides?|dips?|"
            r"hummus|desserts?|cakes?|bars?)\b",
            re.IGNORECASE,
        ),
    ),
)
OTHER_CATEGORY = "Other"
# Recency tie-break so equal timestamps always list in one stable order.
KIND_ORDER: dict[ActivityKind, int] = {
    "pantry_handoff": 0,
    "pantry_expired": 1,
    "pantry_rejected": 2,
    "pantry_accepted": 3,
    "pantry_requested": 4,
    "student_pickup": 5,
    "reservation_opened": 6,
    "listing_published": 7,
}
PANTRY_ACTIVITY: dict[str, ActivityKind] = {
    "requested": "pantry_requested",
    "accepted": "pantry_accepted",
    "rejected": "pantry_rejected",
    "handoff_confirmed": "pantry_handoff",
    "expired": "pantry_expired",
}
CURRENT_LABEL = "Current app data"
RECORDING_LABEL = "Recording dataset — simulated data"


@dataclass(frozen=True)
class ImpactAssumptions:
    """Per-serving illustrative values used only for clearly labeled estimates."""

    meal_value_usd: float = DEFAULT_MEAL_VALUE_USD
    food_kg_per_serving: float = DEFAULT_FOOD_KG_PER_SERVING

    def __post_init__(self) -> None:
        bounded(self.meal_value_usd, MAX_MEAL_VALUE_USD, "meal value")
        bounded(self.food_kg_per_serving, MAX_FOOD_KG_PER_SERVING, "food weight")


def bounded(value: float, upper: float, name: str) -> float:
    """Refuse non-finite, negative or implausibly large assumptions at startup."""
    if not math.isfinite(value) or not 0 <= value <= upper:
        raise ValueError(f"Estimated {name} must be a finite number from 0 to {upper:g}")
    return value


def assumptions_from_env(meal_value: str | None, food_kg: str | None) -> ImpactAssumptions:
    """Parse optional deployment settings; blank means the documented default."""
    try:
        return ImpactAssumptions(
            meal_value_usd=float(meal_value) if meal_value else DEFAULT_MEAL_VALUE_USD,
            food_kg_per_serving=float(food_kg) if food_kg else DEFAULT_FOOD_KG_PER_SERVING,
        )
    except (TypeError, ValueError):
        raise ValueError(
            "OWL_ESTIMATED_MEAL_VALUE_USD and OWL_ESTIMATED_FOOD_KG_PER_SERVING must be "
            "finite, nonnegative and bounded"
        ) from None


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(UTC)


def local_date(instant: datetime) -> date:
    """The America/New_York calendar date of an instant, DST included."""
    return instant.astimezone(NEW_YORK).date()


def window_start(period: OperationsPeriod, now: datetime) -> datetime | None:
    """New York midnight that opens an inclusive window of whole local dates through now."""
    days = PERIOD_DAYS[period]
    if days is None:
        return None
    first = local_date(now) - timedelta(days=days - 1)
    return datetime.combine(first, time(0), tzinfo=NEW_YORK).astimezone(UTC)


def published_at(drop: Drop) -> datetime:
    """Publication time, falling back to creation only for legacy rows without it."""
    return _at(drop.data.get("published_at") or drop.data["created_at"])


def food_name(drop: Drop) -> str:
    items = drop.data["vision"]["items"]
    return items[0]["name"] if items else "Food"


def food_category(drop: Drop) -> str:
    """Classify by listing item names in a fixed order, with an honest Other fallback."""
    for item in drop.data["vision"]["items"]:
        for label, pattern in CATEGORY_RULES:
            if pattern.search(item["name"]):
                return label
    return OTHER_CATEGORY


def verified_building(drop: Drop) -> Building | None:
    """The publication-time verified building snapshot, or nothing; never a guessed point."""
    raw = drop.data.get("building")
    if not raw:
        return None
    try:
        return Building.model_validate(raw)
    except ValidationError:
        return None


def selected_drops(session: Session, start: datetime | None, now: datetime) -> list[Drop]:
    """Published campus-feed listings whose publication falls inside the window."""
    drops = [
        drop
        for drop in session.exec(select(Drop).where(Drop.status != "draft")).all()
        if drop_mode(drop) == "campus_feed"
        and (start is None or published_at(drop) >= start)
        and published_at(drop) <= now
    ]
    return sorted(drops, key=lambda drop: (published_at(drop), drop.id))


def dataset_for(session: Session) -> OperationsDataset:
    """Recording provenance from the persistent marker; otherwise ordinary app rows."""
    marker = session.get(DatasetMarker, 1)
    if marker is None:
        return OperationsDataset(
            kind="current",
            label=CURRENT_LABEL,
            is_simulated=False,
            seed_version=None,
            anchor_time=None,
        )
    return OperationsDataset(
        kind="recording",
        label=RECORDING_LABEL,
        is_simulated=True,
        seed_version=marker.seed_version,
        anchor_time=_at(marker.anchor_time),
    )


def percent(part: int, whole: int) -> float:
    """Full-precision percentage; zero when nothing was offered."""
    return 0.0 if whole <= 0 else part * 100 / whole


@dataclass
class _DropFacts:
    """Per-drop rows read once so every section uses the same snapshot."""

    drop: Drop
    counts: Counts
    claims: list[Claim]
    pickups: list[HostPickupNotification]
    referral: PantryReferral | None
    building: Building | None
    expired: bool

    @property
    def unclaimed(self) -> int:
        """Expired stock nobody collected or (simulated) transferred."""
        if not self.expired:
            return 0
        return self.counts.total - self.counts.picked_up - self.counts.pantry_transferred


def _facts(session: Session, drop: Drop, counts: Callable[[Drop], Counts]) -> _DropFacts:
    referral = session.exec(select(PantryReferral).where(PantryReferral.drop_id == drop.id)).first()
    return _DropFacts(
        drop=drop,
        counts=counts(drop),
        claims=list(session.exec(select(Claim).where(Claim.drop_id == drop.id)).all()),
        pickups=list(
            session.exec(
                select(HostPickupNotification).where(HostPickupNotification.drop_id == drop.id)
            ).all()
        ),
        referral=referral,
        building=verified_building(drop),
        expired=drop.status == "expired",
    )


def _outcomes(facts: Iterable[_DropFacts]) -> OperationsOutcomes:
    totals = Counter()
    for fact in facts:
        c = fact.counts
        totals["student_pickups"] += c.picked_up
        totals["pantry_transfers"] += c.pantry_transferred
        if fact.expired:
            totals["expired_unclaimed"] += fact.unclaimed
        else:
            totals["available"] += c.available
            totals["student_reserved"] += c.held
            totals["pantry_reserved"] += c.pantry_held
    return OperationsOutcomes(**{name: totals[name] for name in OperationsOutcomes.model_fields})


def _average_reservation_seconds(facts: Iterable[_DropFacts]) -> float | None:
    """Mean publication-to-claim delay over every created claim, each counted once."""
    delays = [
        max((_at(claim.created_at) - published_at(fact.drop)).total_seconds(), 0.0)
        for fact in facts
        for claim in fact.claims
    ]
    return sum(delays) / len(delays) if delays else None


def _event_dates(
    facts: Iterable[_DropFacts], first: date | None, last: date
) -> tuple[list[OperationsSeriesPoint], int]:
    """Count each event on its own New York date; return the series and undated pickups."""
    days: dict[date, Counter] = defaultdict(Counter)
    undated = 0
    for fact in facts:
        drop = fact.drop
        day = days[local_date(published_at(drop))]
        day["published_listings"] += 1
        day["servings_offered"] += fact.counts.total
        for record in fact.pickups:
            days[local_date(_at(record.created_at))]["student_pickups"] += 1
        undated += max(fact.counts.picked_up - len(fact.pickups), 0)
        referral = fact.referral
        if referral is not None and referral.status == "handoff_confirmed":
            transfer_day = days[local_date(_at(referral.updated_at))]
            transfer_day["pantry_transfers"] += referral.transferred_servings
        if fact.expired and fact.unclaimed:
            days[local_date(_at(drop.data["expires_at"]))]["expired_unclaimed"] += fact.unclaimed
    if first is None:
        if not days:
            return [], undated
        first = min(days)
    series = []
    current = first
    while current <= last:
        counts = days.get(current, Counter())
        series.append(
            OperationsSeriesPoint(
                date=current.isoformat(),
                **{
                    name: counts[name]
                    for name in OperationsSeriesPoint.model_fields
                    if name != "date"
                },
            )
        )
        current += timedelta(days=1)
    return series, undated


def _building_rows(facts: Iterable[_DropFacts]) -> list[OperationsBuilding]:
    groups: dict[str, dict] = {}
    for fact in facts:
        if fact.building is None:
            continue
        row = groups.setdefault(
            fact.building.id,
            {**dict.fromkeys(OperationsBuilding.model_fields, 0), "building": fact.building},
        )
        c = fact.counts
        row["published_listings"] += 1
        row["total_servings_offered"] += c.total
        row["student_pickups"] += c.picked_up
        row["pantry_transfers"] += c.pantry_transferred
        if fact.expired:
            row["expired_unclaimed_servings"] += fact.unclaimed
        else:
            row["active_listings"] += 1
            row["available_servings"] += c.available
            row["student_reserved_servings"] += c.held
            row["pantry_reserved_servings"] += c.pantry_held
    rows = [OperationsBuilding(**row) for row in groups.values()]
    return sorted(rows, key=lambda row: (-row.student_pickups, row.building.id))


def _category_rows(facts: Iterable[_DropFacts]) -> list[OperationsCategory]:
    groups: dict[str, Counter] = defaultdict(Counter)
    for fact in facts:
        group = groups[food_category(fact.drop)]
        group["published_listings"] += 1
        group["total_servings_offered"] += fact.counts.total
        group["student_pickups"] += fact.counts.picked_up
        group["pantry_transfers"] += fact.counts.pantry_transferred
    rows = [
        OperationsCategory(
            category=name,
            **{key: counts[key] for key in OperationsCategory.model_fields if key != "category"},
        )
        for name, counts in groups.items()
    ]
    return sorted(rows, key=lambda row: (-row.total_servings_offered, row.category))


def _listing_rows(session: Session, facts: Iterable[_DropFacts]) -> list[OperationsListing]:
    rows = []
    for fact in facts:
        drop = fact.drop
        if fact.expired or drop.status not in FEED_STATUSES or fact.building is None:
            continue
        has_photo = has_stored_photo(session, drop.id)
        c = fact.counts
        rows.append(
            OperationsListing(
                drop_id=drop.id,
                food=food_name(drop),
                category=food_category(drop),
                building=fact.building,
                room=drop.data.get("room", ""),
                published_at=published_at(drop),
                expires_at=_at(drop.data["expires_at"]),
                status=drop.status,
                has_photo=has_photo,
                photo_url=photo_path(drop.id) if has_photo else None,
                total_servings=c.total,
                available=c.available,
                held=c.held,
                picked_up=c.picked_up,
                pantry_held=c.pantry_held,
                pantry_transferred=c.pantry_transferred,
            )
        )
    return sorted(rows, key=lambda row: (row.expires_at, str(row.drop_id)))


def _activity(
    facts: Iterable[_DropFacts], start: datetime | None, now: datetime, simulated: bool
) -> list[OperationsActivity]:
    """Latest actual actions first; pantry rows show only the referral's current state."""
    events: list[OperationsActivity] = []

    def add(kind: ActivityKind, at: datetime, fact: _DropFacts, servings: int, sim: bool) -> None:
        if (start is None or at >= start) and at <= now:
            events.append(
                OperationsActivity(
                    kind=kind,
                    occurred_at=at,
                    drop_id=fact.drop.id,
                    food=food_name(fact.drop),
                    building_name=fact.building.name if fact.building else "Unverified location",
                    servings=servings,
                    is_simulated=sim,
                )
            )

    for fact in facts:
        add("listing_published", published_at(fact.drop), fact, fact.counts.total, simulated)
        for claim in fact.claims:
            add("reservation_opened", _at(claim.created_at), fact, 1, simulated)
        for record in fact.pickups:
            add("student_pickup", _at(record.created_at), fact, 1, simulated)
        referral = fact.referral
        kind = PANTRY_ACTIVITY.get(referral.status) if referral else None
        if kind is not None:
            servings = {
                "pantry_requested": referral.requested_servings,
                "pantry_rejected": referral.requested_servings,
                "pantry_accepted": referral.accepted_servings,
                "pantry_handoff": referral.transferred_servings,
                "pantry_expired": referral.accepted_servings or referral.requested_servings,
            }[kind]
            # Pantry movement is always a simulation, whatever the dataset.
            add(kind, _at(referral.updated_at), fact, servings, True)
    events.sort(key=lambda e: (-e.occurred_at.timestamp(), KIND_ORDER[e.kind], str(e.drop_id)))
    return events[:ACTIVITY_LIMIT]


def _estimates(outcomes: OperationsOutcomes, assumptions: ImpactAssumptions) -> OperationsEstimates:
    recovered = outcomes.student_pickups + outcomes.pantry_transfers
    return OperationsEstimates(
        meal_value_per_serving=assumptions.meal_value_usd,
        food_kg_per_serving=assumptions.food_kg_per_serving,
        recovered_servings=recovered,
        equivalent_meal_value=round(recovered * assumptions.meal_value_usd, 2),
        recovered_food_kg=round(recovered * assumptions.food_kg_per_serving, 3),
        assumptions=[
            (
                f"Illustrative estimate: ${assumptions.meal_value_usd:.2f} equivalent meal value "
                "per serving (OWL_ESTIMATED_MEAL_VALUE_USD). Not a measured KSU figure or savings."
            ),
            (
                f"Illustrative estimate: {assumptions.food_kg_per_serving:g} kg of food per "
                "serving (OWL_ESTIMATED_FOOD_KG_PER_SERVING). Food was not weighed."
            ),
            "Recovered servings = recorded student pickups + simulated pantry transfers.",
        ],
    )


def _notes(
    dataset: OperationsDataset,
    undated: int,
    unlocated: int,
    unlisted_active: int,
) -> list[str]:
    notes = [
        (
            "Listings are selected by publication date in America/New_York; summary, outcomes, "
            "buildings, categories and active listings describe that publication cohort."
        ),
        (
            "The daily series and recent activity date each event by its own recorded time: "
            "publication, recorded student pickup, final simulated pantry decision, or the "
            "listing's original deadline for expired unclaimed food."
        ),
        (
            "Average reservation time runs from publication to each reservation the app "
            "created, including later released or expired ones; a reservation is not a pickup."
        ),
        (
            "Joined sessions counts current visitor sessions in this database, not unique "
            "people, and is not filtered by the selected period."
        ),
        (
            "Participating students counts distinct demo student records with a reservation "
            "(visitor sessions or simulated students), never identified people."
        ),
        "Student pickups are recorded app states, not independently verified collection.",
        (
            "Pantry requests, decisions and transfers are simulations; nothing is sent to KSU "
            "CARE and no real transfer is implied."
        ),
    ]
    if dataset.kind == "recording":
        notes.insert(
            0,
            f"{RECORDING_LABEL} (seed {dataset.seed_version}). These rows are synthetic and "
            "are not measured campus impact or live demand.",
        )
    else:
        notes.insert(
            0,
            "Current app data: rows created in this demo app. Not independently verified "
            "physical impact.",
        )
    if undated:
        notes.append(
            f"{undated} recorded student pickup(s) have no pickup timestamp and are left out "
            "of the daily series rather than given an invented date."
        )
    if unlocated:
        notes.append(
            f"{unlocated} listing(s) have no verified building and are left out of building "
            "rows; campus totals still include them."
        )
    if unlisted_active:
        notes.append(
            f"{unlisted_active} active listing(s) without a verified building are counted in "
            "totals but not shown in the active listings table."
        )
    return notes


def build_operations(
    session: Session,
    *,
    now: datetime,
    period: OperationsPeriod,
    counts: Callable[[Drop], Counts],
    recording_available: bool,
    assumptions: ImpactAssumptions,
) -> OperationsResponse:
    """Assemble one consistent snapshot from the caller's already-swept transaction."""
    start = window_start(period, now)
    dataset = dataset_for(session)
    facts = [_facts(session, drop, counts) for drop in selected_drops(session, start, now)]
    outcomes = _outcomes(facts)
    total = sum(fact.counts.total for fact in facts)
    active = [fact for fact in facts if not fact.expired]
    first = local_date(start) if start is not None else None
    series, undated = _event_dates(facts, first, local_date(now))
    claims = [claim for fact in facts for claim in fact.claims]
    summary = OperationsSummary(
        published_listings=len(facts),
        active_listings=len(active),
        total_servings_offered=total,
        available_servings=outcomes.available,
        student_reserved_servings=outcomes.student_reserved,
        student_pickups=outcomes.student_pickups,
        pantry_reserved_servings=outcomes.pantry_reserved,
        pantry_transfers=outcomes.pantry_transfers,
        expired_unclaimed_servings=outcomes.expired_unclaimed,
        pending_pickup_reviews=sum(len(pending_reviews(session, f.drop, now)) for f in active),
        pending_pantry_requests=sum(
            f.referral is not None and f.referral.status == "requested" for f in facts
        ),
        buildings_served=len({f.building.id for f in facts if f.building is not None}),
        joined_sessions=visitor_count(session),
        student_pickup_rate_percent=percent(outcomes.student_pickups, total),
        combined_recovery_rate_percent=percent(
            outcomes.student_pickups + outcomes.pantry_transfers, total
        ),
        average_reservation_seconds=_average_reservation_seconds(facts),
        participating_hosts=len({f.drop.host_id for f in facts}),
        participating_students=len({claim.student_id for claim in claims}),
    )
    return OperationsResponse(
        dataset=dataset,
        recording_available=recording_available,
        period=period,
        window_start=start,
        server_time=now,
        summary=summary,
        outcomes=outcomes,
        series=series,
        buildings=_building_rows(facts),
        activity=_activity(facts, start, now, dataset.is_simulated),
        categories=_category_rows(facts),
        active_listings=_listing_rows(session, facts),
        estimates=_estimates(outcomes, assumptions),
        notes=_notes(
            dataset,
            undated,
            unlocated=sum(f.building is None for f in facts),
            unlisted_active=sum(f.building is None for f in active),
        ),
    )
