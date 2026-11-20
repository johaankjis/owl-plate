"""Simulated pantry referral lifecycle under the shared serialized inventory boundary."""

import threading
from datetime import UTC, datetime

import pytest
from sqlmodel import Session, select

from services.api.application import Backend, DomainError, fixture_vision
from services.api.campus import CampusRegistry, load_registry
from services.api.db.models import HostPickupNotification, PantryReferral
from services.api.db.session import create_database
from services.api.pantry.service import DESTINATION_BUILDING_ID
from services.api.pickup.verifiers import FixturePickupVerifier
from services.api.schemas.api import PANTRY_NOTICE, DropEdit, JoinRequest, SafetyReview

SAFE = SafetyReview(covered_and_temperature_safe=True, served_within_two_hours=True, untouched=True)


def make_backend(tmp_path, name, campus):
    engine = create_database(f"sqlite:///{tmp_path}/{name}.db")
    backend = Backend(
        engine,
        analyze=fixture_vision,
        validate_photo=lambda b: b,
        verify_pickup=FixturePickupVerifier(),
        demo_mode=True,
        auth_mode="demo",
        clock=lambda: datetime(2026, 11, 18, 12, tzinfo=UTC),
        campus=campus,
    )
    backend.reset(backend.actor("demo-host"), "visitors")
    backend.notify = lambda *args, **kwargs: None
    backend.notify_host = lambda *args: None
    return backend


@pytest.fixture
def pantry(tmp_path):
    """Visitors scenario over the unchanged verified registry; offline fakes only."""
    backend = make_backend(tmp_path, "pantry", load_registry())
    yield backend
    backend.engine.dispose()


def host(backend):
    return backend.actor("demo-host")


def coordinator(backend):
    return backend.actor("demo-pantry-coordinator")


def publish(backend, servings, minutes=45):
    drop = backend.create_drop(host(backend), b"synthetic")
    backend.edit_drop(
        host(backend),
        str(drop.id),
        DropEdit(
            servings_final=servings,
            allergens_final=["dairy", "gluten"],
            diet_tags_final=[],
            building_code=DESTINATION_BUILDING_ID,
            room="214",
            expires_in_minutes=minutes,
            safety_review=SAFE,
        ),
    )
    return str(backend.publish(host(backend), str(drop.id)).id)


def visitor(backend, nickname):
    return backend.actor(backend.join(JoinRequest(nickname=nickname)).token)


def counts(backend, drop_id):
    return backend.get_drop(host(backend), drop_id).counts


def invariant(c):
    assert c.total == c.available + c.held + c.picked_up + c.pantry_held + c.pantry_transferred
    assert min(c.available, c.held, c.picked_up, c.pantry_held, c.pantry_transferred) >= 0


def code(call) -> str:
    with pytest.raises(DomainError) as failure:
        call()
    return failure.value.code


def referral_id(backend, drop_id):
    return str(backend.pantry_referral(host(backend), drop_id).referral.id)


def test_destination_is_the_verified_registry_point_and_absent_registry_fails_503(pantry, tmp_path):
    drop_id = publish(pantry, 4)
    body = pantry.pantry_referral(host(pantry), drop_id)
    assert body.referral is None and body.is_demo is True and body.notice == PANTRY_NOTICE
    place = body.destination
    assert place.name == "KSU CARE Pantry" and place.room == "Room 184"
    assert place.building.id == DESTINATION_BUILDING_ID
    assert (place.building.latitude, place.building.longitude) == (33.940665, -84.520395)
    assert place.directions_url == (
        "https://www.google.com/maps/dir/?api=1&destination=33.940665,-84.520395&travelmode=walking"
    )
    assert "origin" not in place.directions_url and "key=" not in place.directions_url
    assert place.care_source_url.endswith("/wellbeing/care-services/")
    assert place.catering_policy_url.endswith("/catering/policies.php")

    empty = make_backend(tmp_path, "empty", CampusRegistry())
    failure = pytest.raises(DomainError, empty.pantry_referrals, coordinator(empty))
    assert (failure.value.code, failure.value.status) == ("pantry_destination_unavailable", 503)
    empty.engine.dispose()


def test_suggestion_appears_once_only_in_last_ten_minutes_with_capacity(pantry):
    early = publish(pantry, 3, minutes=15)
    full = publish(pantry, 1, minutes=15)
    visitor_actor = visitor(pantry, "Riley")
    pantry.reserve(visitor_actor, full)
    pantry.tick(299)  # 10 minutes and 1 second left: not yet due.
    assert pantry.pantry_referral(host(pantry), early).referral is None
    pantry.tick(1)  # Exactly 10 minutes left.
    suggested = pantry.pantry_referral(host(pantry), early).referral
    assert suggested.status == "suggested"
    assert (suggested.requested_servings, suggested.accepted_servings) == (0, 0)
    assert suggested.eligible_servings == 3
    assert suggested.expires_at == pantry.get_drop(host(pantry), early).expires_at
    assert pantry.pantry_referral(host(pantry), full).referral is None  # No capacity left.
    c = counts(pantry, early)
    assert (c.available, c.pantry_held) == (3, 0)  # A suggestion allocates nothing.
    pantry.tick(60)
    again = pantry.pantry_referral(host(pantry), early).referral
    assert again.id == suggested.id and again.status == "suggested"
    with Session(pantry.engine) as session:
        assert len(session.exec(select(PantryReferral)).all()) == 1
    # Students can still reserve everything a suggestion covers.
    pantry.reserve(visitor(pantry, "Casey"), early)
    assert counts(pantry, early).available == 2


def test_seeded_and_draft_drops_never_get_referrals(pantry):
    draft = pantry.create_drop(host(pantry), b"synthetic")
    assert pantry.pantry_referral(host(pantry), str(draft.id)).referral is None
    assert code(lambda: pantry.request_pantry_referral(host(pantry), str(draft.id), 1)) == (
        "invalid_state"
    )
    pantry.reset(host(pantry), "seeded")
    seeded = publish(pantry, 3, minutes=5)
    pantry.tick(10)
    assert pantry.pantry_referral(host(pantry), seeded).referral is None
    assert code(lambda: pantry.request_pantry_referral(host(pantry), seeded, 1)) == (
        "invalid_state"
    )


def test_manual_early_request_reserves_nothing_and_retries_keep_quantity(pantry):
    drop_id = publish(pantry, 5)
    assert code(lambda: pantry.request_pantry_referral(host(pantry), drop_id, 6)) == "capacity"
    requested = pantry.request_pantry_referral(host(pantry), drop_id, 3)
    assert (requested.status, requested.requested_servings) == ("requested", 3)
    assert requested.eligible_servings == 5 and requested.notice == PANTRY_NOTICE
    retry = pantry.request_pantry_referral(host(pantry), drop_id, 1)
    assert (retry.id, retry.requested_servings) == (requested.id, 3)
    c = counts(pantry, drop_id)
    assert (c.available, c.pantry_held, c.pantry_transferred) == (5, 0, 0)
    # Students may reserve all of it while the request is pending.
    for name in ["A1", "A2", "A3", "A4", "A5"]:
        pantry.reserve(visitor(pantry, name), drop_id)
    assert counts(pantry, drop_id).available == 0
    rid = str(requested.id)
    assert code(lambda: pantry.decide_pantry_referral(coordinator(pantry), rid, "accept", 1)) == (
        "capacity"
    )


def test_suggestion_becomes_request_only_explicitly(pantry):
    drop_id = publish(pantry, 4, minutes=10)
    suggested = pantry.pantry_referral(host(pantry), drop_id).referral
    rid = str(suggested.id)
    assert code(lambda: pantry.decide_pantry_referral(coordinator(pantry), rid, "accept", 1)) == (
        "invalid_state"
    )
    assert code(
        lambda: pantry.decide_pantry_referral(coordinator(pantry), rid, "reject", None)
    ) == ("invalid_state")
    requested = pantry.request_pantry_referral(host(pantry), drop_id, 2)
    assert (requested.id, requested.status, requested.requested_servings) == (
        suggested.id,
        "requested",
        2,
    )
    assert requested.created_at == suggested.created_at


def test_partial_acceptance_uses_current_capacity_and_preserves_holds(pantry):
    drop_id = publish(pantry, 6)
    rid = str(pantry.request_pantry_referral(host(pantry), drop_id, 5).id)
    students = [visitor(pantry, f"S{i}") for i in range(3)]
    claims = [pantry.reserve(actor, drop_id) for actor in students]
    accept = pantry.decide_pantry_referral
    assert code(lambda: accept(coordinator(pantry), rid, "accept", 4)) == "capacity"
    assert code(lambda: accept(coordinator(pantry), rid, "accept", 6)) == "invalid_quantity"
    accepted = accept(coordinator(pantry), rid, "accept", 2)
    assert (accepted.status, accepted.accepted_servings, accepted.eligible_servings) == (
        "accepted",
        2,
        1,
    )
    c = counts(pantry, drop_id)
    assert (c.available, c.held, c.pantry_held) == (1, 3, 2)
    invariant(c)
    # Holds were neither cancelled nor shrunk, and the remainder stays reservable.
    for actor, claim in zip(students, claims, strict=True):
        tile = next(t for t in pantry.feed(actor).drops if str(t.drop.id) == drop_id)
        assert tile.claim.status == "held" and tile.claim.id == claim.id
    feed_actor = visitor(pantry, "Late")
    assert pantry.reserve(feed_actor, drop_id).status == "held"
    full = pantry.get_drop(host(pantry), drop_id)
    assert (full.status, full.counts.available) == ("claimed_out", 0)
    # A student release returns only the student's serving, never the pantry's.
    pantry.update_claim(students[0], str(claims[0].id))
    c = counts(pantry, drop_id)
    assert (c.available, c.held, c.pantry_held) == (1, 3, 2)
    invariant(c)


def test_decisions_are_idempotent_and_contradictions_conflict(pantry):
    drop_id = publish(pantry, 4)
    rid = str(pantry.request_pantry_referral(host(pantry), drop_id, 3).id)
    decide = pantry.decide_pantry_referral
    first = decide(coordinator(pantry), rid, "accept", 2)
    assert decide(coordinator(pantry), rid, "accept", 2) == first
    assert code(lambda: decide(coordinator(pantry), rid, "accept", 3)) == "invalid_state"
    assert code(lambda: decide(coordinator(pantry), rid, "reject", None)) == "invalid_state"
    assert counts(pantry, drop_id).pantry_held == 2

    other = publish(pantry, 2)
    other_id = str(pantry.request_pantry_referral(host(pantry), other, 2).id)
    rejected = decide(coordinator(pantry), other_id, "reject", 2)
    assert rejected.status == "rejected" and rejected.accepted_servings == 0
    assert decide(coordinator(pantry), other_id, "reject", None).status == "rejected"
    assert code(lambda: decide(coordinator(pantry), other_id, "accept", 1)) == "invalid_state"
    c = counts(pantry, other)
    assert (c.available, c.pantry_held) == (2, 0)
    # No repeated referral after rejection in this demo: retry returns the final record.
    again = pantry.request_pantry_referral(host(pantry), other, 1)
    assert (str(again.id), again.status) == (other_id, "rejected")
    assert code(lambda: decide(coordinator(pantry), uuid_zero(), "reject", None)) == "not_found"


def keys(value) -> set[str]:
    """Every key anywhere in a JSON document, to prove absent private fields."""
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in keys(v)}
    return set()


def uuid_zero():
    return "00000000-0000-0000-0000-000000000000"


def test_handoff_moves_pantry_held_to_transferred_once_without_host_push(pantry):
    drop_id = publish(pantry, 3)
    assert code(lambda: pantry.confirm_pantry_handoff(host(pantry), drop_id)) == "invalid_state"
    rid = str(pantry.request_pantry_referral(host(pantry), drop_id, 2).id)
    assert code(lambda: pantry.confirm_pantry_handoff(host(pantry), drop_id)) == "invalid_state"
    pantry.decide_pantry_referral(coordinator(pantry), rid, "accept", 2)
    pantry.reserve(visitor(pantry, "Riley"), drop_id)
    done = pantry.confirm_pantry_handoff(host(pantry), drop_id)
    assert (done.status, done.accepted_servings, done.transferred_servings) == (
        "handoff_confirmed",
        2,
        2,
    )
    assert pantry.confirm_pantry_handoff(host(pantry), drop_id) == done
    c = counts(pantry, drop_id)
    assert (c.available, c.held, c.picked_up, c.pantry_held, c.pantry_transferred) == (
        0,
        1,
        0,
        0,
        2,
    )
    invariant(c)
    assert pantry.request_pantry_referral(host(pantry), drop_id, 1).status == "handoff_confirmed"
    with Session(pantry.engine) as session:
        assert session.exec(select(HostPickupNotification)).all() == []
    # Terminal after the deadline too; transfers are never released back.
    pantry.tick(46 * 60)
    final = pantry.pantry_referral(host(pantry), drop_id).referral
    assert final.status == "handoff_confirmed"
    c = counts(pantry, drop_id)
    assert (c.pantry_transferred, c.pantry_held) == (2, 0)


def test_expiry_releases_accepted_stock_without_resurrecting_the_drop(pantry):
    accepted = publish(pantry, 3, minutes=15)
    requested = publish(pantry, 2, minutes=15)
    suggested = publish(pantry, 2, minutes=15)
    rid = str(pantry.request_pantry_referral(host(pantry), accepted, 3).id)
    pantry.decide_pantry_referral(coordinator(pantry), rid, "accept", 3)
    pantry.request_pantry_referral(host(pantry), requested, 1)
    student = visitor(pantry, "Riley")
    assert code(lambda: pantry.reserve(student, accepted)) == "capacity"
    assert pantry.get_drop(host(pantry), accepted).status == "claimed_out"
    pantry.tick(5 * 60 + 1)
    assert pantry.pantry_referral(host(pantry), suggested).referral.status == "suggested"
    deadline = pantry.get_drop(host(pantry), accepted).expires_at
    pantry.tick(10 * 60)
    for drop_id in (accepted, requested, suggested):
        referral = pantry.pantry_referral(host(pantry), drop_id).referral
        assert referral.status == "expired" and referral.expires_at == deadline
        assert pantry.get_drop(host(pantry), drop_id).status == "expired"
    released = pantry.pantry_referral(host(pantry), accepted).referral
    assert released.accepted_servings == 3 and released.transferred_servings == 0
    c = counts(pantry, accepted)
    assert (c.available, c.pantry_held, c.pantry_transferred) == (3, 0, 0)
    invariant(c)
    assert pantry.feed(student).drops == []
    assert code(lambda: pantry.reserve(student, accepted)) == "drop_expired"
    assert pantry.distribution(pantry.actor("demo-projector")).active_drops == 0
    assert code(lambda: pantry.confirm_pantry_handoff(host(pantry), accepted)) == (
        "referral_expired"
    )
    assert code(lambda: pantry.decide_pantry_referral(coordinator(pantry), rid, "accept", 3)) == (
        "referral_expired"
    )
    assert pantry.request_pantry_referral(host(pantry), accepted, 1).status == "expired"
    assert pantry.get_drop(host(pantry), accepted).expires_at == deadline


def test_late_drop_creates_no_new_suggestion_after_expiry(pantry):
    drop_id = publish(pantry, 2, minutes=5)
    pantry.tick(5 * 60)
    assert pantry.pantry_referral(host(pantry), drop_id).referral is None
    assert code(lambda: pantry.request_pantry_referral(host(pantry), drop_id, 1)) == (
        "drop_expired"
    )


@pytest.mark.parametrize("round_", range(5))
def test_last_serving_race_between_acceptance_and_student_reserve(pantry, round_):
    drop_id = publish(pantry, 1)
    rid = str(pantry.request_pantry_referral(host(pantry), drop_id, 1).id)
    student = visitor(pantry, f"Racer{round_}")
    barrier = threading.Barrier(2)
    outcomes: dict[str, str] = {}

    def accept():
        barrier.wait()
        try:
            pantry.decide_pantry_referral(coordinator(pantry), rid, "accept", 1)
            outcomes["pantry"] = "ok"
        except DomainError as exc:
            outcomes["pantry"] = exc.code

    def reserve():
        barrier.wait()
        try:
            pantry.reserve(student, drop_id)
            outcomes["student"] = "ok"
        except DomainError as exc:
            outcomes["student"] = exc.code

    threads = [threading.Thread(target=accept), threading.Thread(target=reserve)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(outcomes.values()) == ["capacity", "ok"]
    c = counts(pantry, drop_id)
    invariant(c)
    assert c.available == 0 and c.held + c.pantry_held == 1


def test_concurrent_duplicate_requests_and_acceptances_allocate_once(pantry):
    drop_id = publish(pantry, 4)
    barrier = threading.Barrier(4)
    results: list = []

    def request(n):
        barrier.wait()
        results.append(pantry.request_pantry_referral(host(pantry), drop_id, n))

    threads = [threading.Thread(target=request, args=(n,)) for n in (1, 2, 3, 4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len({r.id for r in results}) == 1 and len({r.requested_servings for r in results}) == 1
    rid = str(results[0].id)
    amount = results[0].requested_servings
    barrier = threading.Barrier(3)
    accepted: list = []

    def accept():
        barrier.wait()
        accepted.append(pantry.decide_pantry_referral(coordinator(pantry), rid, "accept", amount))

    threads = [threading.Thread(target=accept) for _ in range(3)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(accepted) == 3 and {a.accepted_servings for a in accepted} == {amount}
    c = counts(pantry, drop_id)
    assert c.pantry_held == amount and c.available == 4 - amount
    invariant(c)


def test_reset_clears_referrals_and_coordinator_list_is_ordered_and_deidentified(pantry):
    first, second, third = publish(pantry, 2), publish(pantry, 2), publish(pantry, 2)
    pantry.request_pantry_referral(host(pantry), second, 1)
    pantry.tick(1)
    pantry.request_pantry_referral(host(pantry), first, 1)
    pantry.request_pantry_referral(host(pantry), third, 1)
    listed = pantry.pantry_referrals(coordinator(pantry))
    tied = sorted(
        (r for r in listed.referrals if str(r.drop_id) != second), key=lambda r: str(r.id)
    )
    # Oldest referral first, ties broken by referral ID: stable across polls.
    assert [str(r.id) for r in listed.referrals] == [
        str(listed.referrals[0].id),
        *[str(r.id) for r in tied],
    ]
    assert str(listed.referrals[0].drop_id) == second
    assert pantry.pantry_referrals(coordinator(pantry)).referrals == listed.referrals
    assert listed.is_demo is True
    assert "demo-host" not in listed.model_dump_json()
    private = {"host_id", "student_id", "claim", "claim_id", "invite_id", "nickname", "token"}
    assert not keys(listed.model_dump(mode="json")) & private
    pantry.reset(host(pantry), "visitors")
    assert pantry.pantry_referrals(coordinator(pantry)).referrals == []
    with Session(pantry.engine) as session:
        assert session.exec(select(PantryReferral)).all() == []


def test_role_and_demo_gates(pantry):
    drop_id = publish(pantry, 2)
    student = visitor(pantry, "Riley")
    projector = pantry.actor("demo-projector")
    for actor in (student, projector, coordinator(pantry)):
        assert code(lambda a=actor: pantry.pantry_referral(a, drop_id)) == "forbidden"
        assert code(lambda a=actor: pantry.request_pantry_referral(a, drop_id, 1)) == "forbidden"
        assert code(lambda a=actor: pantry.confirm_pantry_handoff(a, drop_id)) == "forbidden"
    for actor in (student, projector, host(pantry)):
        assert code(lambda a=actor: pantry.pantry_referrals(a)) == "forbidden"
        assert code(
            lambda a=actor: pantry.decide_pantry_referral(a, uuid_zero(), "reject", None)
        ) == ("forbidden")
    # The coordinator never gains host, projector or student powers.
    assert code(lambda: pantry.get_drop(coordinator(pantry), drop_id)) == "not_found"
    assert code(lambda: pantry.reserve(coordinator(pantry), drop_id)) == "forbidden"
    assert code(lambda: pantry.distribution(coordinator(pantry))) == "forbidden"
    assert code(lambda: pantry.reset(coordinator(pantry))) == "forbidden"
    assert code(lambda: pantry.active_drop(coordinator(pantry))) == "forbidden"
    coordinator_actor, host_actor = coordinator(pantry), host(pantry)
    pantry.auth_mode = "entra"
    assert code(lambda: pantry.actor("demo-pantry-coordinator")) == "unauthorized"
    assert code(lambda: pantry.pantry_referrals(coordinator_actor)) == "forbidden"
    assert code(lambda: pantry.pantry_referral(host_actor, drop_id)) == "forbidden"
    assert code(lambda: pantry.request_pantry_referral(host_actor, drop_id, 1)) == "forbidden"
    pantry.auth_mode, pantry.demo_mode = "demo", False
    assert code(lambda: pantry.actor("demo-pantry-coordinator")) == "unauthorized"
