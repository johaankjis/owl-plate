"""Visitor session lifecycle: joins, tokens, limits, leave, and projector rows."""

from datetime import datetime, timedelta

import pytest
from sqlmodel import Session, select

from services.api.application import Backend, DomainError, grid_distance
from services.api.db.models import DemoSettings, Invite, Student, VisitorSession
from services.api.schemas.api import JoinRequest
from services.api.sessions import SESSION_LIMIT, hash_token
from services.api.tests.conftest import persona, publish_drop


def join(backend, nickname="Visitor", area="demo-venue", allergens=(), diets=()):
    """Create a visitor through the public service boundary."""
    return backend.join(
        JoinRequest(nickname=nickname, area=area, allergens=list(allergens), diets=list(diets))
    )


def test_join_creates_distinct_unpaused_visitors_with_hashed_tokens(backend):
    first = join(backend, "Riley")
    second = join(backend, "Jordan", area="demo-across-quad", allergens=["dairy"])
    assert first.token.startswith("demo-session-") and first.token != second.token
    assert first.student.id != second.student.id
    assert first.student.area == "demo-venue" and first.student.kind == "visitor"
    with Session(backend.engine) as session:
        records = session.exec(select(VisitorSession)).all()
        assert {r.student_id for r in records} == {
            str(first.student.id),
            str(second.student.id),
        }
        stored = {r.token_hash for r in records}
        assert stored == {hash_token(first.token), hash_token(second.token)}
        student = session.get(Student, str(first.student.id))
        assert student.is_simulated is False
        assert student.data["kind"] == "visitor"
        assert student.data["alerts_paused"] is False
        assert student.data["priority"] is False
        assert student.data["nickname"] == "Riley"
        presence = datetime.fromisoformat(student.data["valid_until"]) - datetime.fromisoformat(
            student.data["valid_from"]
        )
        assert presence == timedelta(hours=2)
        assert grid_distance(backend.origin, student.data["cell"]) == 0
        far = session.get(Student, str(second.student.id))
        assert grid_distance(backend.origin, far.data["cell"]) == 4


def test_visitor_tokens_resolve_and_fail_closed(backend):
    token = join(backend, "Riley").token
    actor = backend.actor(token)
    assert actor.role == "student" and actor.id != "Riley"
    with pytest.raises(DomainError) as failure:
        backend.actor(token + "tampered")
    assert failure.value.status == 401
    assert failure.value.message == "Session ended. Join again."
    assert backend.actor("demo-student-A").role == "student"


def test_visitor_tokens_fail_closed_outside_demo_gates(backend):
    token = join(backend, "Riley").token
    service = Backend(backend.engine, demo_mode=False, auth_mode="demo")
    with pytest.raises(DomainError) as failure:
        service.actor(token)
    assert failure.value.status == 401
    assert failure.value.message == "Session ended. Join again."


def test_join_requires_both_demo_gates(backend):
    service = Backend(backend.engine, demo_mode=False, auth_mode="demo")
    with pytest.raises(DomainError) as failure:
        service.join(JoinRequest(nickname="Riley", area="demo-venue"))
    assert failure.value.status == 403


def test_nicknames_unique_case_insensitive_until_leaving(backend):
    token = join(backend, "Riley").token
    with pytest.raises(DomainError) as failure:
        join(backend, "RILEY")
    assert failure.value.code == "nickname_taken" and failure.value.status == 409
    backend.leave(backend.actor(token))
    assert join(backend, "riley").student.nickname == "riley"


def test_session_limit_blocks_the_forty_first_visitor(backend):
    for index in range(SESSION_LIMIT):
        join(backend, f"Guest{index:02d}")
    with pytest.raises(DomainError) as failure:
        join(backend, "Guest40")
    assert failure.value.code == "session_limit" and failure.value.status == 409


def test_session_me_scoped_to_current_visitors(backend):
    token = join(backend, "Riley").token
    me = backend.session_me(backend.actor(token))
    assert me.nickname == "Riley" and me.area == "demo-venue" and me.kind == "visitor"
    with pytest.raises(DomainError) as failure:
        backend.session_me(persona(backend, "A"))
    assert failure.value.code == "not_a_session" and failure.value.status == 404


def test_leave_releases_holds_declines_invites_and_revokes(backend):
    joined = join(backend, "Riley")
    visitor = backend.actor(joined.token)
    first = publish_drop(backend, servings=2)
    invite_one = next(i for i in backend.invites(visitor).invites if i.drop.id == first.id)
    second = publish_drop(backend, servings=2)
    invite_two = next(i for i in backend.invites(visitor).invites if i.drop.id == second.id)
    backend.claim(visitor, str(invite_one.id))
    host = backend.actor("demo-host")

    backend.leave(visitor)

    with pytest.raises(DomainError) as failure:
        backend.actor(joined.token)
    assert failure.value.message == "Session ended. Join again."
    assert backend.get_drop(host, str(first.id)).counts.held == 0
    assert backend.get_drop(host, str(second.id)).counts.available == 2
    with Session(backend.engine) as session:
        statuses = {
            i.id: i.status
            for i in session.exec(select(Invite).where(Invite.student_id == visitor.id)).all()
        }
    assert statuses[str(invite_one.id)] == "claimed"
    assert statuses[str(invite_two.id)] == "declined"
    third = publish_drop(backend, servings=2)
    with Session(backend.engine) as session:
        later = session.exec(
            select(Invite).where(Invite.student_id == visitor.id, Invite.drop_id == str(third.id))
        ).all()
    assert later == []
    state = backend.dispatch(backend.actor("demo-projector"), str(second.id))
    assert state.visitors == []


def test_dispatch_rows_are_projector_safe_and_ordered(backend):
    join(backend, "Riley")
    join(backend, "Casey", area="demo-next-door", allergens=["dairy"])
    drop = publish_drop(backend)
    state = backend.dispatch(backend.actor("demo-projector"), str(drop.id))
    assert state.scenario == "seeded" and len(state.personas) == 30
    assert [v.nickname for v in state.visitors] == ["Riley", "Casey"]
    riley, casey = state.visitors
    assert riley.status == "sent" and riley.wave_number == 1
    assert riley.reason_codes == ["nearby", "diet_match", "fair_share"]
    assert riley.ring_distance == 0 and riley.h3_cell
    assert casey.status == "excluded" and casey.wave_number is None
    assert casey.reason_codes == ["dietary_filter"] and casey.ring_distance == 1
    for row in state.visitors:
        assert set(row.model_dump(mode="json")) == {
            "nickname",
            "area",
            "ring_distance",
            "status",
            "reason_codes",
            "h3_cell",
            "wave_number",
        }


def test_visitors_wait_until_the_first_publish(backend):
    join(backend, "Riley")
    drop = backend.create_drop(backend.actor("demo-host"), b"photo")
    state = backend.dispatch(backend.actor("demo-projector"), str(drop.id))
    assert state.visitors[0].status == "waiting"
    assert state.visitors[0].reason_codes == ["not_published"]


def test_reset_scenarios_swap_the_matching_pool(backend):
    host = backend.actor("demo-host")
    backend.reset(host, "visitors")
    join(backend, "Riley")
    drop = publish_drop(backend, servings=2)
    state = backend.dispatch(backend.actor("demo-projector"), str(drop.id))
    assert state.scenario == "visitors" and state.personas == []
    assert [v.nickname for v in state.visitors if v.status == "sent"] == ["Riley"]
    with Session(backend.engine) as session:
        seeded = session.exec(select(Student).where(Student.is_simulated == True)).all()
        assert all(s.data["alerts_paused"] for s in seeded)
    assert backend.reset(host).scenario == "seeded"
    with Session(backend.engine) as session:
        assert session.get(DemoSettings, 1).scenario == "seeded"
    again = publish_drop(backend, servings=2)
    seeded_state = backend.dispatch(backend.actor("demo-projector"), str(again.id))
    assert seeded_state.scenario == "seeded" and len(seeded_state.personas) == 30
    assert {p.label for p in seeded_state.personas if p.status == "sent"} == {"A", "C"}
