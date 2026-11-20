"""Simulated pantry referral endpoints over HTTP with existing auth and error envelopes."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.api.application import Actor, Backend, DomainError, fixture_vision
from services.api.campus import load_registry
from services.api.db.session import create_database
from services.api.pantry.service import DESTINATION_BUILDING_ID
from services.api.pickup.verifiers import FixturePickupVerifier
from services.api.routes.api import build_router
from services.api.schemas.api import PANTRY_NOTICE

HOST = {"Authorization": "Bearer demo-host"}
OTHER_HOST = {"Authorization": "Bearer other-host"}
PROJECTOR = {"Authorization": "Bearer demo-projector"}
COORDINATOR = {"Authorization": "Bearer demo-pantry-coordinator"}
SAFE = {"covered_and_temperature_safe": True, "served_within_two_hours": True, "untouched": True}
PICKUP = "ksu-marietta-joe-mack-wilson-student-center"
ACK = {"demo_policy_acknowledged": True}
PRIVATE = {"host_id", "student_id", "claim", "claim_id", "invite_id", "nickname", "token"}


def keys(value) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in keys(v)}
    return set()


def other_host(token: str) -> Actor:
    """A second synthetic host, only to prove cross-host isolation."""
    if token != "other-host":
        raise DomainError("unauthorized", "Sign in required.", 401)
    return Actor("host", "other-host")


@pytest.fixture
def backend(tmp_path):
    engine = create_database(f"sqlite:///{tmp_path}/pantry-routes.db")
    service = Backend(
        engine,
        analyze=fixture_vision,
        validate_photo=lambda b: b,
        verify_pickup=FixturePickupVerifier(),
        demo_mode=True,
        auth_mode="demo",
        clock=lambda: datetime(2026, 11, 18, 12, tzinfo=UTC),
        campus=load_registry(),
        authenticate=other_host,
    )
    service.reset(service.actor("demo-host"), "visitors")
    host_sends: list[tuple] = []
    service.notify = lambda *args, **kwargs: None
    service.notify_host = lambda *args: host_sends.append(args)
    service.host_sends = host_sends
    yield service
    engine.dispose()


@pytest.fixture
def client(backend):
    app = FastAPI()
    app.include_router(build_router(backend))
    with TestClient(app) as test_client:
        yield test_client


def join(client, nickname):
    response = client.post("/sessions", json={"nickname": nickname})
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def publish(client, servings, minutes=45):
    created = client.post(
        "/drops", headers=HOST, files={"photo": ("food.png", b"photo", "image/png")}
    ).json()
    edited = client.patch(
        f"/drops/{created['id']}",
        headers=HOST,
        json={
            "servings_final": servings,
            "allergens_final": ["dairy", "gluten"],
            "diet_tags_final": [],
            "building_code": PICKUP,
            "room": "214",
            "expires_in_minutes": minutes,
            "safety_review": SAFE,
        },
    )
    assert edited.status_code == 200, edited.text
    assert client.post(f"/drops/{created['id']}/publish", headers=HOST).status_code == 200
    return created["id"]


def error(response, status, code):
    assert response.status_code == status, response.text
    assert response.json()["detail"]["code"] == code


def test_contract_acceptance_flow_counts_pantry_separately_from_student_pickups(client, backend):
    drop_id = publish(client, 2)
    student = join(client, "Riley")
    claim = client.post(f"/drops/{drop_id}/reserve", headers=student).json()
    check = client.post(
        f"/claims/{claim['id']}/pickup-photo",
        headers=student,
        files={"photo": ("food.png", b"synthetic-photo", "image/png")},
        data={"request_id": str(uuid4())},
    ).json()
    picked = client.post(
        f"/claims/{claim['id']}/pickup", headers=student, json={"verification_id": check["id"]}
    )
    assert picked.status_code == 200 and picked.json()["status"] == "picked_up"
    backend.deliver_notifications()
    student_pushes = len(backend.host_sends)
    assert student_pushes == 1  # The existing student pickup update is unchanged.

    empty = client.get(f"/drops/{drop_id}/pantry-referral", headers=HOST)
    assert empty.status_code == 200
    body = empty.json()
    assert set(body) == {"referral", "destination", "notice", "is_demo"}
    assert body["referral"] is None and body["notice"] == PANTRY_NOTICE and body["is_demo"]
    assert body["destination"]["building"]["id"] == DESTINATION_BUILDING_ID

    requested = client.post(
        f"/drops/{drop_id}/pantry-referral", headers=HOST, json={"servings": 1, **ACK}
    )
    assert requested.status_code == 200, requested.text
    referral = requested.json()
    assert set(referral) == {
        "id",
        "drop_id",
        "status",
        "requested_servings",
        "accepted_servings",
        "transferred_servings",
        "eligible_servings",
        "created_at",
        "updated_at",
        "expires_at",
        "destination",
        "drop",
        "notice",
        "is_demo",
    }
    assert (referral["status"], referral["requested_servings"]) == ("requested", 1)
    assert referral["expires_at"] == referral["drop"]["expires_at"]

    queue = client.get("/pantry/referrals", headers=COORDINATOR)
    assert queue.status_code == 200
    assert [r["id"] for r in queue.json()["referrals"]] == [referral["id"]]
    assert queue.json()["is_demo"] is True
    assert not keys(queue.json()) & PRIVATE
    accepted = client.post(
        f"/pantry/referrals/{referral['id']}/decision",
        headers=COORDINATOR,
        json={"decision": "accept", "servings": 1, **ACK},
    )
    assert accepted.status_code == 200 and accepted.json()["status"] == "accepted"
    assert accepted.json()["drop"]["counts"]["pantry_held"] == 1
    assert accepted.json()["drop"]["status"] == "claimed_out"

    handoff = client.post(
        f"/drops/{drop_id}/pantry-referral/handoff",
        headers=HOST,
        json={"demo_handoff_confirmed": True},
    )
    assert handoff.status_code == 200 and handoff.json()["status"] == "handoff_confirmed"
    assert client.get(f"/drops/{drop_id}", headers=HOST).json()["counts"] == {
        "total": 2,
        "available": 0,
        "held": 0,
        "picked_up": 1,
        "pantry_held": 0,
        "pantry_transferred": 1,
    }
    backend.deliver_notifications()
    assert len(backend.host_sends) == student_pushes  # No host push for pantry movement.
    distribution = client.get("/distribution", headers=PROJECTOR).json()
    assert distribution["counts"]["pantry_transferred"] == 1
    assert distribution["counts"]["picked_up"] == 1
    assert distribution["available_drops"] == 0


def test_pantry_allocation_reduces_feed_and_map_availability(client):
    drop_id = publish(client, 3)
    student = join(client, "Riley")
    referral = client.post(
        f"/drops/{drop_id}/pantry-referral", headers=HOST, json={"servings": 3, **ACK}
    ).json()
    tile = client.get("/students/me/feed", headers=student).json()["drops"][0]
    assert tile["can_reserve"] is True and tile["drop"]["counts"]["available"] == 3
    client.post(
        f"/pantry/referrals/{referral['id']}/decision",
        headers=COORDINATOR,
        json={"decision": "accept", "servings": 2, **ACK},
    )
    tile = client.get("/students/me/feed", headers=student).json()["drops"][0]
    assert tile["drop"]["counts"]["available"] == 1 and tile["drop"]["counts"]["pantry_held"] == 2
    assert not keys(tile) & {"referral", "destination", "pantry_status"}
    row = client.get("/distribution", headers=PROJECTOR).json()["buildings"][0]
    assert row["counts"]["available"] == 1 and row["available_drops"] == 1
    assert client.post(f"/drops/{drop_id}/reserve", headers=student).status_code == 200
    error(client.post(f"/drops/{drop_id}/reserve", headers=join(client, "Casey")), 409, "capacity")
    row = client.get("/distribution", headers=PROJECTOR).json()["buildings"][0]
    assert row["available_drops"] == 0


def test_role_ownership_and_validation_gates(client):
    drop_id = publish(client, 2)
    student = join(client, "Riley")
    base = f"/drops/{drop_id}/pantry-referral"
    for headers in (student, PROJECTOR, COORDINATOR):
        error(client.get(base, headers=headers), 403, "forbidden")
        error(client.post(base, headers=headers, json={"servings": 1, **ACK}), 403, "forbidden")
        error(
            client.post(f"{base}/handoff", headers=headers, json={"demo_handoff_confirmed": True}),
            403,
            "forbidden",
        )
    error(client.get(base, headers=OTHER_HOST), 404, "not_found")
    error(client.post(base, headers=OTHER_HOST, json={"servings": 1, **ACK}), 404, "not_found")
    error(client.get(base), 401, "unauthorized")
    missing = "/drops/00000000-0000-0000-0000-000000000000/pantry-referral"
    error(client.get(missing, headers=HOST), 404, "not_found")

    for body in (
        {"servings": 1},
        {"servings": 1, "demo_policy_acknowledged": False},
        {"servings": 0, **ACK},
        {"servings": 501, **ACK},
    ):
        assert client.post(base, headers=HOST, json=body).status_code == 422
    assert client.post(f"{base}/handoff", headers=HOST, json={}).status_code == 422
    assert (
        client.post(
            f"{base}/handoff", headers=HOST, json={"demo_handoff_confirmed": False}
        ).status_code
        == 422
    )
    referral = client.post(base, headers=HOST, json={"servings": 1, **ACK}).json()
    decision = f"/pantry/referrals/{referral['id']}/decision"
    for headers in (student, PROJECTOR, HOST, OTHER_HOST):
        error(client.get("/pantry/referrals", headers=headers), 403, "forbidden")
        error(
            client.post(decision, headers=headers, json={"decision": "reject", **ACK}),
            403,
            "forbidden",
        )
    for body in (
        {"decision": "accept", **ACK},
        {"decision": "accept", "servings": 1},
        {"decision": "accept", "servings": 1, "demo_policy_acknowledged": False},
        {"decision": "maybe", "servings": 1, **ACK},
    ):
        assert client.post(decision, headers=COORDINATOR, json=body).status_code == 422
    error(
        client.post(
            "/pantry/referrals/00000000-0000-0000-0000-000000000000/decision",
            headers=COORDINATOR,
            json={"decision": "reject", **ACK},
        ),
        404,
        "not_found",
    )
    # The coordinator credential grants no student, host or projector reads.
    error(client.get(f"/drops/{drop_id}", headers=COORDINATOR), 404, "not_found")
    error(client.get("/students/me/feed", headers=COORDINATOR), 403, "forbidden")
    error(client.get("/distribution", headers=COORDINATOR), 403, "forbidden")
    error(client.post("/demo/reset", headers=COORDINATOR), 403, "forbidden")


def test_coordinator_token_requires_both_demo_gates(client, backend):
    backend.auth_mode = "entra"
    error(client.get("/pantry/referrals", headers=COORDINATOR), 401, "unauthorized")
    backend.auth_mode, backend.demo_mode = "demo", False
    error(client.get("/pantry/referrals", headers=COORDINATOR), 401, "unauthorized")
    error(client.get("/pantry/referrals", headers=OTHER_HOST), 403, "forbidden")


def test_conflicts_use_the_existing_error_envelope(client):
    drop_id = publish(client, 2)
    base = f"/drops/{drop_id}/pantry-referral"
    error(client.post(base, headers=HOST, json={"servings": 3, **ACK}), 409, "capacity")
    error(
        client.post(f"{base}/handoff", headers=HOST, json={"demo_handoff_confirmed": True}),
        409,
        "invalid_state",
    )
    referral = client.post(base, headers=HOST, json={"servings": 2, **ACK}).json()
    decision = f"/pantry/referrals/{referral['id']}/decision"
    first = client.post(
        decision, headers=COORDINATOR, json={"decision": "accept", "servings": 2, **ACK}
    )
    retry = client.post(
        decision, headers=COORDINATOR, json={"decision": "accept", "servings": 2, **ACK}
    )
    assert first.status_code == retry.status_code == 200
    assert first.json()["accepted_servings"] == retry.json()["accepted_servings"] == 2
    error(
        client.post(
            decision, headers=COORDINATOR, json={"decision": "accept", "servings": 1, **ACK}
        ),
        409,
        "invalid_state",
    )
    error(
        client.post(decision, headers=COORDINATOR, json={"decision": "reject", **ACK}),
        409,
        "invalid_state",
    )


def test_tick_materializes_a_suggestion_for_the_host_only(client):
    drop_id = publish(client, 2, minutes=12)
    assert client.get(f"/drops/{drop_id}/pantry-referral", headers=HOST).json()["referral"] is None
    client.post("/demo/tick", headers=HOST, json={"advance_seconds": 120})
    listed = client.get("/pantry/referrals", headers=COORDINATOR).json()["referrals"]
    assert [(r["status"], r["requested_servings"]) for r in listed] == [("suggested", 0)]
    host_view = client.get(f"/drops/{drop_id}/pantry-referral", headers=HOST).json()
    assert host_view["referral"]["status"] == "suggested"
    assert host_view["referral"]["eligible_servings"] == 2
