"""Exercise inventory, scheduling, persistence and concurrent write boundaries."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import h3
import pytest
from sqlmodel import Session, select

from services.api.application import Backend, DomainError, grid_distance
from services.api.db.models import Claim, Drop, Invite, Student, Wave
from services.api.tests.conftest import invitation, persona, publish_drop


def test_demo_first_and_second_wave(backend):
    drop = publish_drop(backend, servings=2)
    first = backend.dispatch(backend.actor("demo-projector"), str(drop.id))
    assert {p.label for p in first.personas if p.status == "sent"} == {"A", "C"}
    assert first.waves[0].ring_k == 2
    a = invitation(backend, "A", drop.id)
    held = backend.claim(persona(backend, "A"), str(a.id))
    assert backend.claim(persona(backend, "A"), str(a.id)) == held
    backend.tick(10)
    assert len(backend.dispatch(backend.actor("demo-projector"), str(drop.id)).waves) == 1
    backend.tick(51)
    second = backend.dispatch(backend.actor("demo-projector"), str(drop.id))
    assert [w.ring_k for w in second.waves] == [2, 4]
    assert next(p for p in second.personas if p.label == "D").status == "sent"
    assert second.counts.available == 1 and second.counts.held == 1
    assert invitation(backend, "C", drop.id).status == "expired"
    with pytest.raises(DomainError, match="expired"):
        backend.claim(persona(backend, "C"), str(invitation(backend, "C", drop.id).id))
    backend.publish(backend.actor("demo-host"), str(drop.id))
    with Session(backend.engine) as session:
        assert len(session.exec(select(Wave)).all()) == 2
        assert len(session.exec(select(Invite)).all()) == 3


def test_decline_does_not_reserve_or_restore_inventory(backend):
    drop = publish_drop(backend, servings=2)
    for label in ["A", "C"]:
        invite = invitation(backend, label, drop.id)
        declined = backend.decline(persona(backend, label), str(invite.id))
        assert declined.drop.counts.available == 2
        assert backend.decline(persona(backend, label), str(invite.id)).status == "declined"
    backend.tick(10)
    assert invitation(backend, "D", drop.id).status == "sent"
    assert backend.get_drop(backend.actor("demo-host"), str(drop.id)).counts.available == 2


def test_claim_expiry_exact_deadline_restores_and_release_retry(backend):
    drop = publish_drop(backend, servings=1)
    a = invitation(backend, "A", drop.id)
    claim = backend.claim(persona(backend, "A"), str(a.id))
    backend.tick(599)
    assert backend.get_drop(backend.actor("demo-host"), str(drop.id)).counts.held == 1
    backend.tick(1)
    current = backend.get_drop(backend.actor("demo-host"), str(drop.id))
    assert current.counts.available == 1 and current.counts.held == 0
    assert backend.update_claim(persona(backend, "A"), str(claim.id)).status == "expired"


def test_release_and_pickup_inventory(backend):
    drop = publish_drop(backend, servings=2)
    claim_a = backend.claim(persona(backend, "A"), str(invitation(backend, "A", drop.id).id))
    claim_c = backend.claim(persona(backend, "C"), str(invitation(backend, "C", drop.id).id))
    assert backend.get_drop(backend.actor("demo-host"), str(drop.id)).status == "claimed_out"
    assert backend.update_claim(persona(backend, "A"), str(claim_a.id)).status == "released"
    assert backend.update_claim(persona(backend, "A"), str(claim_a.id)).status == "released"
    picked = backend.update_claim(persona(backend, "C"), str(claim_c.id), pickup=True)
    assert picked.status == "picked_up"
    assert backend.update_claim(persona(backend, "C"), str(claim_c.id), pickup=True) == picked
    counts = backend.get_drop(backend.actor("demo-host"), str(drop.id)).counts
    assert counts.total == counts.available + counts.held + counts.picked_up == 2
    assert counts.available == 1 and counts.picked_up == 1


def test_drop_expiry_releases_holds_and_cancels_invites(backend):
    drop = publish_drop(backend, servings=2, minutes=1)
    a = backend.claim(persona(backend, "A"), str(invitation(backend, "A", drop.id).id))
    backend.tick(60)
    current = backend.get_drop(backend.actor("demo-host"), str(drop.id))
    assert current.status == "expired" and current.counts.available == 2
    assert invitation(backend, "C", drop.id).status == "expired"
    assert backend.update_claim(persona(backend, "A"), str(a.id)).status == "expired"


def test_concurrent_capacity_claims_and_duplicate_retries(backend):
    drop = publish_drop(backend, servings=1)
    ids = {label: str(invitation(backend, label, drop.id).id) for label in ["A", "C"]}

    def attempt(label):
        try:
            return backend.claim(persona(backend, label), ids[label])
        except DomainError as exc:
            return exc.code

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(attempt, ["A", "C"] * 4))
    successes = [r for r in results if not isinstance(r, str)]
    assert len({r.id for r in successes}) == 1
    assert {r for r in results if isinstance(r, str)} == {"capacity"}
    assert backend.get_drop(backend.actor("demo-host"), str(drop.id)).counts.available == 0
    with Session(backend.engine) as session:
        assert len(session.exec(select(Claim)).all()) == 1


def test_active_claim_elsewhere_is_filtered_and_claim_time_enforced(backend):
    first = publish_drop(backend)
    second = publish_drop(backend)
    backend.claim(persona(backend, "A"), str(invitation(backend, "A", first.id).id))
    with pytest.raises(DomainError) as exc:
        backend.claim(persona(backend, "A"), str(invitation(backend, "A", second.id).id))
    assert exc.value.code == "active_claim"
    third = publish_drop(backend)
    assert not any(i.drop.id == third.id for i in backend.invites(persona(backend, "A")).invites)


def test_overlapping_ticks_use_database_lock_across_backend_instances(backend):
    drop = publish_drop(backend)
    backend.tick(60)
    # Reuse the same durable database from independent service instances.
    services = [Backend(backend.engine, demo_mode=True, clock=backend.clock) for _ in range(8)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda b: b.tick(), services))
    with Session(backend.engine) as session:
        waves = session.exec(select(Wave).where(Wave.drop_id == str(drop.id))).all()
        assert [w.ring_k for w in waves] == [2, 4]
        invites = session.exec(select(Invite)).all()
        assert len({(i.drop_id, i.student_id) for i in invites}) == len(invites)


def test_reset_30_h3_boundaries_and_atomic_cleanup(backend):
    publish_drop(backend)
    backend.tick(60)
    result = backend.reset(backend.actor("demo-host"))
    assert result.students == 30 and set(result.personas) == set("ABCDE")
    with Session(backend.engine) as session:
        assert not session.exec(select(Drop)).all()
        for student in session.exec(select(Student)).all():
            cell = student.data["cell"]
            ring = student.data["ring_distance"]
            assert h3.get_resolution(cell) == 11
            assert grid_distance(backend.origin, cell) == ring
            assert cell in h3.grid_disk(backend.origin, ring)
            if ring:
                assert cell not in h3.grid_disk(backend.origin, ring - 1)
    assert backend.tick() == backend.clock()


def test_no_extra_waves_at_max_ring_and_inventory_stays_available(backend):
    drop = publish_drop(backend)
    for _ in range(20):
        backend.tick(61)
    state = backend.dispatch(backend.actor("demo-projector"), str(drop.id))
    assert [w.ring_k for w in state.waves] == [2, 4, 6, 8, 10, 12]
    assert state.counts.available == state.counts.total
    assert state.status == "live" and state.next_wave_at is None


def test_persistence_survives_service_recreation(backend):
    drop = publish_drop(backend)
    backend.claim(persona(backend, "A"), str(invitation(backend, "A", drop.id).id))
    rebuilt = Backend(backend.engine, demo_mode=True, auth_mode="demo", clock=backend.clock)
    assert rebuilt.get_drop(rebuilt.actor("demo-host"), str(drop.id)).counts.held == 1


def test_expired_presence_excluded_in_database(backend):
    backend.tick(7200)
    drop = publish_drop(backend)
    assert backend.invites(persona(backend, "A")).invites == []
    assert drop.counts.available == 8
    assert backend.presence(persona(backend, "A"), "DEMO-ORIGIN") == backend.clock() + timedelta(
        hours=4
    )


def test_empty_waves_cannot_widen_on_overlapping_ticks(backend):
    backend.tick(7200)  # All presence is now expired.
    drop = publish_drop(backend)
    backend.tick(10)
    # A real clock advances slightly between simultaneous scheduler calls.
    frozen = backend.clock()
    backend.clock = lambda: frozen + timedelta(microseconds=1)
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: backend.tick(), range(8)))
    state = backend.dispatch(backend.actor("demo-projector"), str(drop.id))
    assert [w.ring_k for w in state.waves] == [2, 4]


def test_claim_and_expiry_tick_concurrently_never_overbook(backend):
    drop = publish_drop(backend, servings=1)
    invite_id = str(invitation(backend, "A", drop.id).id)

    def claim():
        try:
            return backend.claim(persona(backend, "A"), invite_id)
        except DomainError as exc:
            assert exc.code == "invite_expired"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(claim), pool.submit(backend.tick, 60)]
        for future in futures:
            future.result()
    counts = backend.get_drop(backend.actor("demo-host"), str(drop.id)).counts
    assert counts.total == counts.available + counts.held + counts.picked_up == 1
    assert counts.available >= 0
