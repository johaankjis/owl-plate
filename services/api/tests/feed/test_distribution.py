"""Projector availability aggregate: available_drops tracks the shared inventory snapshot."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from services.api.application import Backend, DomainError, fixture_vision
from services.api.campus import load_registry
from services.api.db.session import create_database
from services.api.pickup.verifiers import FixturePickupVerifier
from services.api.schemas.api import DropEdit, JoinRequest, SafetyReview

NEAR = "ksu-marietta-fixture-near"
FAR = "ksu-marietta-fixture-far"
SAFE = SafetyReview(covered_and_temperature_safe=True, served_within_two_hours=True, untouched=True)
PRIVATE = ("Riley", "Casey", "Avery", "token", "nickname", "h3", "diets", "allergens", "claim")


@pytest.fixture
def campus(tmp_path, campus_path):
    """Visitors scenario over two verified fixture buildings, with offline fakes only."""
    engine = create_database(f"sqlite:///{tmp_path}/distribution.db")
    backend = Backend(
        engine,
        analyze=fixture_vision,
        validate_photo=lambda b: b,
        verify_pickup=FixturePickupVerifier(),
        demo_mode=True,
        auth_mode="demo",
        clock=lambda: datetime(2026, 11, 18, 12, tzinfo=UTC),
        campus=load_registry(campus_path),
    )
    backend.reset(backend.actor("demo-host"), "visitors")
    backend.notify = lambda *args, **kwargs: None
    backend.notify_host = lambda *args: None
    yield backend
    engine.dispose()


def publish(backend, building, servings, minutes=45, vegetarian=False):
    host = backend.actor("demo-host")
    drop = backend.create_drop(host, b"synthetic")
    backend.edit_drop(
        host,
        str(drop.id),
        DropEdit(
            servings_final=servings,
            allergens_final=["dairy", "gluten"],
            diet_tags_final=["vegetarian"] if vegetarian else [],
            building_code=building,
            expires_in_minutes=minutes,
            safety_review=SAFE,
        ),
    )
    return str(backend.publish(host, str(drop.id)).id)


def visitor(backend, nickname, **request):
    return backend.actor(backend.join(JoinRequest(nickname=nickname, **request)).token)


def snapshot(backend):
    """(available_drops, active_drops, counts) overall and per building, from one poll."""
    body = backend.distribution(backend.actor("demo-projector"))
    rows = {
        row.building_code: (row.available_drops, row.active_drops, row.counts.model_dump())
        for row in body.buildings
    }
    assert body.available_drops == sum(a for a, _, _ in rows.values())
    assert body.active_drops == sum(d for _, d, _ in rows.values())
    return body, rows


def counts(total, available, held=0, picked_up=0):
    return {"total": total, "available": available, "held": held, "picked_up": picked_up}


def test_available_drops_follow_reserve_release_pickup_and_expiry(campus):
    near_one = publish(campus, NEAR, 1)
    publish(campus, NEAR, 2)
    far_one = publish(campus, FAR, 1, minutes=30)
    riley, casey, avery = (visitor(campus, name) for name in ("Riley", "Casey", "Avery"))

    body, rows = snapshot(campus)
    assert (body.available_drops, body.active_drops) == (3, 3)
    assert rows == {NEAR: (2, 2, counts(3, 3)), FAR: (1, 1, counts(1, 1))}

    # Reserving the last serving exhausts that drop; it stays active with its hold.
    claim = campus.reserve(riley, near_one)
    body, rows = snapshot(campus)
    assert (body.available_drops, body.active_drops) == (2, 3)
    assert rows[NEAR] == (1, 2, counts(3, 2, held=1))
    assert body.counts.model_dump() == counts(4, 3, held=1)

    # Release restores availability on the next poll.
    campus.update_claim(riley, str(claim.id))
    assert snapshot(campus)[1][NEAR] == (2, 2, counts(3, 3))

    # Photo-assisted completion collects the last serving: held moves to collected.
    claim = campus.reserve(casey, near_one)
    result = campus.submit_pickup_photo(casey, str(claim.id), b"synthetic", uuid4())
    assert result.can_confirm
    campus.update_claim(casey, str(claim.id), pickup=True, verification_id=result.id)
    body, rows = snapshot(campus)
    assert rows[NEAR] == (1, 2, counts(3, 2, picked_up=1))
    assert body.available_drops == 2

    # Host approval of an uncertain check also collects, exhausting the far building.
    campus.verify_pickup = FixturePickupVerifier("uncertain")
    claim = campus.reserve(avery, far_one)
    result = campus.submit_pickup_photo(avery, str(claim.id), b"synthetic", uuid4())
    campus.request_pickup_review(avery, str(claim.id), result.id)
    assert snapshot(campus)[1][FAR] == (0, 1, counts(1, 0, held=1))
    campus.decide_pickup_review(campus.actor("demo-host"), far_one, str(result.id), "approve")
    body, rows = snapshot(campus)
    assert rows[FAR] == (0, 1, counts(1, 0, picked_up=1))
    assert (body.available_drops, body.active_drops) == (1, 3)

    # Drop expiry removes every contribution of that drop, collected ones included.
    campus.tick(31 * 60)
    body, rows = snapshot(campus)
    assert FAR not in rows and (body.available_drops, body.active_drops) == (1, 2)
    campus.tick(15 * 60)
    body, rows = snapshot(campus)
    assert (body.available_drops, body.active_drops, rows) == (0, 0, {})
    assert body.counts.model_dump() == counts(0, 0)


def test_hold_expiry_restores_availability_without_losing_held_totals_early(campus):
    drop = publish(campus, FAR, 1)
    campus.reserve(visitor(campus, "Avery"), drop)
    campus.tick(9 * 60)
    assert snapshot(campus)[1][FAR] == (0, 1, counts(1, 0, held=1))
    campus.tick(60)
    assert snapshot(campus)[1][FAR] == (1, 1, counts(1, 1))


def test_feed_stays_campus_wide_with_dietary_controls_and_aggregate_stays_private(campus):
    vegetarian = visitor(campus, "Riley", diets=["vegetarian"])
    plain = publish(campus, NEAR, 2)
    veggie = publish(campus, FAR, 1, vegetarian=True)
    campus.create_drop(campus.actor("demo-host"), b"draft")

    listing = {str(item.drop.id): item for item in campus.feed(vegetarian).drops}
    assert set(listing) == {plain, veggie}
    assert listing[plain].unavailable_reason == "diet_mismatch"
    assert listing[veggie].can_reserve
    with pytest.raises(DomainError):
        campus.reserve(vegetarian, plain)
    campus.reserve(vegetarian, veggie)

    body, rows = snapshot(campus)
    assert (body.available_drops, body.active_drops) == (1, 2)
    assert rows[FAR] == (0, 1, counts(1, 0, held=1))
    text = body.model_dump_json()
    assert vegetarian.id not in text and not any(word in text for word in PRIVATE)
    for denied in (vegetarian, campus.actor("demo-host")):
        with pytest.raises(DomainError) as failure:
            campus.distribution(denied)
        assert failure.value.code == "forbidden"
