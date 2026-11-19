"""Campus-feed service rules: location-free joins, reservations and one-time announcements."""

import threading
from uuid import uuid4

import pytest
from sqlmodel import Session, select

from services.api.application import DomainError
from services.api.db.models import (
    DemoSettings,
    Drop,
    FeedNotification,
    Invite,
    Student,
    VisitorSession,
)
from services.api.schemas.api import DropEdit, JoinRequest, Preferences, SafetyReview
from services.api.tests.conftest import publish_drop


@pytest.fixture
def feed(backend):
    """The default visitors scenario: campus feed, every seeded persona paused."""
    backend.reset(backend.actor("demo-host"), "visitors")
    sent: list[tuple] = []
    backend.notify = lambda *ids, **options: sent.append((*ids, options))
    backend.sent = sent
    return backend


def visitor(backend, nickname, **request):
    """Join through the service boundary and return the authenticated actor."""
    joined = backend.join(JoinRequest(nickname=nickname, **request))
    return backend.actor(joined.token)


def tile(backend, actor, drop_id):
    return next(item for item in backend.feed(actor).drops if item.drop.id == drop_id)


def code(call) -> str:
    with pytest.raises(DomainError) as failure:
        call()
    return failure.value.code


def test_join_is_location_free_and_ignores_deprecated_area(feed):
    actor = visitor(feed, "Riley", area="not-a-real-place")
    me = feed.session_me(actor)
    assert me.area is None
    with Session(feed.engine) as session:
        student = session.get(Student, actor.id)
        assert "cell" not in student.data and "area" not in student.data
        record = session.exec(select(VisitorSession)).one()
        assert record.area == ""
    assert code(lambda: feed.presence(actor, "DEMO-ORIGIN")) == "invalid_state"
    with Session(feed.engine) as session:
        assert "cell" not in session.get(Student, actor.id).data


def test_seeded_rehearsal_still_accepts_area_and_location_free_joins(backend):
    legacy = visitor(backend, "Legacy", area="demo-venue")
    plain = visitor(backend, "Plain")
    assert backend.session_me(legacy).area == "demo-venue"
    assert backend.session_me(plain).area is None
    drop = publish_drop(backend, servings=2)
    assert drop.distribution_mode == "seeded_waves"
    rows = {
        v.nickname: v
        for v in backend.dispatch(backend.actor("demo-projector"), str(drop.id)).visitors
    }
    assert rows["Legacy"].status == "sent"
    assert rows["Plain"].status == "excluded" and rows["Plain"].h3_cell is None
    assert code(lambda: backend.reserve(legacy, str(drop.id))) == "not_found"


def test_feed_lists_every_active_drop_newest_first_with_safe_explanations(feed):
    early = visitor(feed, "Early", diets=["vegetarian"])
    first = publish_drop(feed, servings=1)
    feed.tick(5)
    second = publish_drop(feed, servings=3, vegetarian=True)
    draft = feed.create_drop(feed.actor("demo-host"), b"draft")
    late = visitor(feed, "Late")

    for actor in (early, late):
        listing = feed.feed(actor)
        assert [item.drop.id for item in listing.drops] == [second.id, first.id]
        assert draft.id not in {item.drop.id for item in listing.drops}
    assert tile(feed, early, first.id).unavailable_reason == "diet_mismatch"
    assert tile(feed, early, second.id).can_reserve
    feed.reserve(late, str(first.id))
    # Dietary mismatch outranks capacity even once the drop is claimed out.
    assert tile(feed, early, first.id).unavailable_reason == "diet_mismatch"
    held = tile(feed, late, first.id)
    assert held.unavailable_reason == "already_reserved" and held.claim.status == "held"
    assert tile(feed, late, second.id).unavailable_reason == "active_claim"
    assert feed.get_drop(early, str(first.id)).counts.available == 0
    assert code(lambda: feed.get_drop(early, str(draft.id))) == "not_found"

    feed.tick(46 * 60)
    assert feed.feed(late).drops == []


def test_reserve_checks_current_preferences_but_retries_are_idempotent(feed):
    actor = visitor(feed, "Riley")
    drop = publish_drop(feed, servings=4)
    claim = feed.reserve(actor, str(drop.id))
    feed.preferences(actor, Preferences(allergens=["dairy"], diets=[]))
    assert feed.reserve(actor, str(drop.id)).id == claim.id
    feed.update_claim(actor, str(claim.id))
    assert code(lambda: feed.reserve(actor, str(drop.id))) == "invalid_state"

    other = visitor(feed, "Casey")
    feed.preferences(other, Preferences(allergens=["dairy"], diets=[]))
    assert code(lambda: feed.reserve(other, str(drop.id))) == "allergen_conflict"
    feed.preferences(other, Preferences(allergens=[], diets=["vegan"]))
    assert code(lambda: feed.reserve(other, str(drop.id))) == "diet_mismatch"
    feed.preferences(other, Preferences(allergens=[], diets=[]))
    assert feed.reserve(other, str(drop.id)).status == "held"
    with Session(feed.engine) as session:
        invites = session.exec(select(Invite).where(Invite.drop_id == str(drop.id))).all()
        assert len(invites) == 2 and all(i.notification_sent for i in invites)


def test_reserve_rejects_inaccessible_and_expired_drops(feed):
    actor = visitor(feed, "Riley")
    draft = feed.create_drop(feed.actor("demo-host"), b"draft")
    assert code(lambda: feed.reserve(actor, str(draft.id))) == "not_found"
    assert code(lambda: feed.reserve(actor, "00000000-0000-0000-0000-000000000000")) == "not_found"
    assert code(lambda: feed.reserve(feed.actor("demo-host"), str(draft.id))) == "forbidden"
    short = publish_drop(feed, servings=2, minutes=1)
    feed.tick(60)
    assert code(lambda: feed.reserve(actor, str(short.id))) == "drop_expired"


def test_one_active_hold_across_drops_and_expiry_restores_capacity(feed):
    actor = visitor(feed, "Riley")
    first = publish_drop(feed, servings=1)
    second = publish_drop(feed, servings=1, minutes=5)
    feed.reserve(actor, str(first.id))
    assert code(lambda: feed.reserve(actor, str(second.id))) == "active_claim"
    host = feed.actor("demo-host")
    assert feed.get_drop(host, str(first.id)).status == "claimed_out"

    feed.tick(601)
    assert tile(feed, actor, first.id).claim.status == "expired"
    assert feed.get_drop(host, str(first.id)).counts.available == 1
    assert tile(feed, actor, first.id).unavailable_reason == "already_reserved"
    assert code(lambda: feed.reserve(actor, str(first.id))) == "invalid_state"

    late = publish_drop(feed, servings=1, minutes=5)
    hold = feed.reserve(actor, str(late.id))
    assert hold.held_until == feed.get_drop(host, str(late.id)).expires_at
    assert code(lambda: feed.update_claim(actor, str(hold.id), pickup=True)) == (
        "pickup_verification_required"
    )
    check = feed.submit_pickup_photo(actor, str(hold.id), b"food photo", uuid4())
    picked = feed.update_claim(actor, str(hold.id), pickup=True, verification_id=check.id)
    assert picked.status == "picked_up"
    assert feed.reserve(actor, str(late.id)).id == hold.id
    counts = feed.get_drop(host, str(late.id)).counts
    assert (counts.available, counts.picked_up) == (0, 1)


def test_concurrent_reservations_never_oversell_the_last_serving(feed):
    actors = [visitor(feed, f"Racer{i}") for i in range(6)]
    drop = publish_drop(feed, servings=1)
    barrier = threading.Barrier(len(actors))
    outcomes: list[str] = []

    def race(actor):
        barrier.wait()
        try:
            feed.reserve(actor, str(drop.id))
            outcomes.append("held")
        except DomainError as exc:
            outcomes.append(exc.code)

    threads = [threading.Thread(target=race, args=(a,)) for a in actors]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(outcomes) == ["capacity"] * 5 + ["held"]
    counts = feed.get_drop(feed.actor("demo-host"), str(drop.id)).counts
    assert (counts.available, counts.held) == (0, 1)


def test_publish_announces_once_to_every_eligible_student_without_geography(feed):
    names = [f"Guest{i:02d}" for i in range(12)]
    actors = {name: visitor(feed, name) for name in names}
    allergic = visitor(feed, "Allergic", allergens=["dairy"])
    paused = visitor(feed, "Paused")
    feed.preferences(paused, Preferences(allergens=[], diets=[], alerts_paused=True))
    holder = visitor(feed, "Holder")
    feed.reserve(holder, str(publish_drop(feed, servings=1).id))
    feed.sent.clear()

    drop = publish_drop(feed, servings=2)
    recipients = [student for _, student, _, options in feed.sent]
    assert sorted(recipients) == sorted(a.id for a in actors.values())
    assert all(options == {"mode": "campus_feed"} for *_, options in feed.sent)
    assert all(sent_drop == str(drop.id) for _, _, sent_drop, _ in feed.sent)

    host = feed.actor("demo-host")
    feed.publish(host, str(drop.id))
    feed.deliver_notifications()
    feed.tick(30)
    visitor(feed, "LateJoin")
    feed.feed(actors["Guest00"])
    claim = feed.reserve(actors["Guest00"], str(drop.id))
    feed.update_claim(actors["Guest00"], str(claim.id))
    feed.tick(700)
    assert len(feed.sent) == len(names)
    with Session(feed.engine) as session:
        rows = session.exec(
            select(FeedNotification).where(FeedNotification.drop_id == str(drop.id))
        ).all()
        assert len(rows) == len(names) and all(row.sent for row in rows)
    for actor in (allergic, paused):
        assert tile(feed, actor, drop.id) is not None
    assert feed.reserve(paused, str(drop.id)).status == "held"


def test_concurrent_publish_retries_enqueue_exactly_once(feed):
    actor = visitor(feed, "Riley")
    host = feed.actor("demo-host")
    drop = feed.create_drop(host, b"photo")
    feed.edit_drop(
        host,
        str(drop.id),
        DropEdit(
            servings_final=2,
            allergens_final=[],
            diet_tags_final=[],
            building_code="DEMO-ORIGIN",
            safety_review=SafetyReview(
                covered_and_temperature_safe=True,
                served_within_two_hours=True,
                untouched=True,
                ingredient_information_checked=True,
            ),
        ),
    )
    barrier = threading.Barrier(4)

    def retry():
        barrier.wait()
        feed.publish(host, str(drop.id))

    threads = [threading.Thread(target=retry) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    feed.tick()
    assert [student for _, student, *_ in feed.sent] == [actor.id]


def test_failed_announcement_retries_until_sent_and_never_after_expiry(feed):
    visitor(feed, "Riley")
    attempts: list[str] = []

    def flaky(*ids, **options):
        attempts.append(ids[0])
        if len(attempts) == 1:
            raise RuntimeError("transport down")

    feed.notify = flaky
    publish_drop(feed, servings=1)
    assert len(attempts) == 1
    feed.tick()
    feed.tick()
    assert len(attempts) == 2 and attempts[0] == attempts[1]

    feed.notify = None  # Adapter offline: the announcement stays queued.
    publish_drop(feed, servings=1, minutes=1)
    feed.tick(61)
    feed.notify = lambda *ids, **options: attempts.append("late")
    feed.deliver_notifications()
    assert "late" not in attempts


def test_distribution_aggregates_host_buildings_without_students(feed):
    projector = feed.actor("demo-projector")
    empty = feed.distribution(projector)
    assert (empty.active_drops, empty.buildings, empty.distribution_mode) == (0, [], "campus_feed")
    actor = visitor(feed, "Riley")
    first = publish_drop(feed, servings=3)
    publish_drop(feed, servings=2)
    feed.create_drop(feed.actor("demo-host"), b"draft")
    publish_drop(feed, servings=4, minutes=1)
    feed.reserve(actor, str(first.id))
    feed.tick(60)
    overview = feed.distribution(projector)
    assert overview.active_drops == 2 and overview.joined_students == 1
    assert overview.counts.model_dump() == {"total": 5, "available": 4, "held": 1, "picked_up": 0}
    (row,) = overview.buildings
    assert row.building_code == "DEMO-ORIGIN" and row.active_drops == 2
    text = overview.model_dump_json()
    assert "Riley" not in text and actor.id not in text and "h3" not in text
    for denied in (actor, feed.actor("demo-host")):
        assert code(lambda denied=denied: feed.distribution(denied)) == "forbidden"


def test_legacy_drop_without_mode_snapshot_stays_seeded_waves(feed):
    drop = publish_drop(feed, servings=1)
    with Session(feed.engine) as session:
        stored = session.get(Drop, str(drop.id))
        stored.data = {k: v for k, v in stored.data.items() if k != "distribution_mode"}
        session.add(stored)
        session.commit()
    host = feed.actor("demo-host")
    assert feed.get_drop(host, str(drop.id)).distribution_mode == "seeded_waves"
    assert feed.distribution(feed.actor("demo-projector")).active_drops == 0


def test_live_drop_keeps_its_snapshot_and_reset_clears_feed_state(feed):
    actor = visitor(feed, "Riley")
    drop = publish_drop(feed, servings=1)
    with Session(feed.engine) as session:
        settings = session.get(DemoSettings, 1)
        settings.scenario = "seeded"
        session.add(settings)
        session.commit()
    feed.tick(10)
    assert feed.get_drop(feed.actor("demo-host"), str(drop.id)).distribution_mode == "campus_feed"
    assert feed.reserve(actor, str(drop.id)).status == "held"

    feed.reset(feed.actor("demo-host"), "seeded")
    with Session(feed.engine) as session:
        assert session.exec(select(FeedNotification)).all() == []
        assert session.exec(select(Drop)).all() == []
    assert publish_drop(feed, servings=1).distribution_mode == "seeded_waves"


@pytest.mark.parametrize("change", ["leave", "pause", "allergen", "diet", "hold"])
def test_failed_announcement_cancels_if_recipient_is_no_longer_eligible(feed, change):
    """A deferred transport attempt must respect consent and diet changes before retry."""
    actor = visitor(feed, "Riley")
    attempts = []

    def unavailable(*ids, **options):
        attempts.append(ids)
        raise RuntimeError("synthetic transport failure")

    feed.notify = unavailable
    drop = publish_drop(feed, servings=1)
    assert len(attempts) == 1
    if change == "leave":
        feed.leave(actor)
    elif change == "hold":
        feed.reserve(actor, str(drop.id))
    else:
        feed.preferences(
            actor,
            Preferences(
                allergens=["dairy"] if change == "allergen" else [],
                diets=["vegan"] if change == "diet" else [],
                alerts_paused=change == "pause",
            ),
        )
    feed.notify = lambda *ids, **options: attempts.append(ids)
    feed.tick()
    assert len(attempts) == 1
    if change not in {"leave", "hold"}:
        feed.preferences(actor, Preferences(allergens=[], diets=[], alerts_paused=False))
        feed.tick()
        assert len(attempts) == 1, (
            "cancelled announcements never resurrect after preferences revert"
        )
    with Session(feed.engine) as session:
        rows = session.exec(
            select(FeedNotification).where(FeedNotification.drop_id == str(drop.id))
        ).all()
        assert len(rows) == 1 and rows[0].sent, "retain the unique consumed opportunity"
