"""Verify wire contracts cannot bypass consent, ownership, or private data boundaries."""

import json
from uuid import uuid4

import pytest

from services.api.application import Actor, Backend, DomainError
from services.api.schemas.api import DropEdit, SafetyReview
from services.api.tests.conftest import invitation, persona, publish_drop


def headers(token="demo-host"):
    return {"Authorization": f"Bearer {token}"}


def test_full_http_smoke(client):
    assert client.post("/demo/reset", headers=headers()).json()["students"] == 30
    created = client.post(
        "/drops", headers=headers(), files={"photo": ("food.png", b"photo", "image/png")}
    )
    assert created.status_code == 200
    drop_id = created.json()["id"]
    edited = client.patch(
        f"/drops/{drop_id}",
        headers=headers(),
        json={
            "servings_final": 2,
            "allergens_final": ["dairy", "gluten"],
            "diet_tags_final": [],
            "building_code": "DEMO-ORIGIN",
            "safety_review": {
                "covered_and_temperature_safe": True,
                "served_within_two_hours": True,
                "untouched": True,
            },
        },
    )
    assert edited.status_code == 200
    assert client.post(f"/drops/{drop_id}/publish", headers=headers()).status_code == 200
    invites = client.get("/students/me/invites", headers=headers("demo-student-A")).json()
    invite_id = invites["invites"][0]["id"]
    path = f"/invites/{invite_id}/claim"
    held = client.post(path, headers=headers("demo-student-A"))
    assert held.status_code == 200
    assert client.post(path, headers=headers("demo-student-A")).json()["id"] == held.json()["id"]
    assert (
        client.post("/demo/tick", headers=headers(), json={"advance_seconds": 61}).status_code
        == 200
    )
    state = client.get(f"/drops/{drop_id}/dispatch", headers=headers("demo-projector")).json()
    assert state["ring_k"] == 4 and state["counts"]["held"] == 1
    assert {p["label"] for p in state["personas"] if p["status"] == "sent"} == {"D"}
    assert (
        client.get(f"/drops/{drop_id}", headers=headers()).json()["allergen_notice"]
        == "may contain, confirm with host"
    )


def test_ownership_and_private_response_fields(client, backend):
    drop = publish_drop(backend)
    invite = invitation(backend, "A", drop.id)
    assert (
        client.post(f"/invites/{invite.id}/claim", headers=headers("demo-student-B")).status_code
        == 404
    )
    assert client.get(f"/drops/{drop.id}", headers=headers("demo-student-B")).status_code == 404
    assert client.get(f"/drops/{drop.id}/dispatch", headers=headers()).status_code == 403
    assert client.get("/students/me/invites", headers=headers()).status_code == 403
    assert client.post("/demo/reset", headers=headers("demo-student-A")).status_code == 403
    assert client.post("/demo/tick", headers=headers("demo-projector"), json={}).status_code == 403
    other_host = Actor("host", "other")
    with pytest.raises(DomainError) as exc:
        backend.publish(other_host, str(drop.id))
    assert exc.value.status == 404
    claim = backend.claim(persona(backend, "A"), str(invite.id))
    assert (
        client.post(f"/claims/{claim.id}/release", headers=headers("demo-student-C")).status_code
        == 404
    )
    responses = [
        client.get(f"/drops/{drop.id}", headers=headers()).json(),
        client.get("/students/me/invites", headers=headers("demo-student-A")).json(),
        client.get(f"/drops/{drop.id}/dispatch", headers=headers("demo-projector")).json(),
    ]
    for response in responses:
        serialized = json.dumps(response)
        for secret in [
            "priority",
            "score",
            "student_id",
            "token",
            "email",
            "phone",
            "claims_last_7d",
        ]:
            assert secret not in serialized
    assert all(p["is_simulated"] for p in responses[-1]["personas"])
    assert client.get("/students", headers=headers()).status_code != 200


def test_demo_auth_requires_both_gates(backend):
    for demo_mode, auth_mode in [(False, "demo"), (True, "entra"), (False, "entra")]:
        service = Backend(backend.engine, demo_mode=demo_mode, auth_mode=auth_mode)
        for token in ["demo-host", "demo-projector", "demo-student-A"]:
            with pytest.raises(DomainError) as exc:
                service.actor(token)
            assert exc.value.status == 401
    service = Backend(
        backend.engine, demo_mode=False, authenticate=lambda _: Actor("student", "real-id")
    )
    with pytest.raises(DomainError):
        service.update_claim(Actor("student", "real-id"), str(uuid4()), pickup=True)
    assert service.actor("verified-token").id == "real-id"


def test_http_errors_and_strict_preferences(client):
    assert client.get("/students/me/invites").status_code == 401
    assert (
        client.post(
            "/drops", headers=headers(), files={"photo": ("x.txt", b"x", "text/plain")}
        ).status_code
        == 422
    )
    assert client.get(f"/drops/{uuid4()}", headers=headers()).status_code == 404
    response = client.put(
        "/students/me/preferences",
        headers=headers("demo-student-A"),
        json={
            "allergens": [],
            "diets": [],
            "priority": True,
        },
    )
    assert response.status_code == 422
    response = client.post(
        "/students/me/push-token",
        headers=headers("demo-student-A"),
        json={"token": "private-token"},
    )
    assert response.status_code == 503 and "private-token" not in response.text


def test_publish_review_and_allergen_clearance(backend):
    host = backend.actor("demo-host")
    drop = backend.create_drop(host, b"photo")
    with pytest.raises(DomainError) as exc:
        backend.publish(host, str(drop.id))
    assert exc.value.code == "safety_review_required"
    edit = DropEdit(
        servings_final=2,
        allergens_final=[],
        diet_tags_final=[],
        building_code="DEMO-ORIGIN",
        safety_review=SafetyReview(
            covered_and_temperature_safe=True, served_within_two_hours=True, untouched=True
        ),
    )
    with pytest.raises(DomainError):
        backend.edit_drop(host, str(drop.id), edit)
    edit.safety_review.ingredient_information_checked = True
    edit.diet_tags_final = ["halal"]
    with pytest.raises(DomainError):
        backend.edit_drop(host, str(drop.id), edit)
    edit.safety_review.religious_diets_confirmed = True
    backend.edit_drop(host, str(drop.id), edit)
    assert backend.publish(host, str(drop.id)).status == "live"


def test_low_confidence_and_religious_tags_never_bypass_safety(backend):
    from services.api.application import fixture_vision

    def unsafe_estimate(photo, note):
        estimate, source = fixture_vision(photo, note)
        estimate.confidence = 0.59
        estimate.diet_tags = ["halal", "kosher", "pork_free", "vegetarian"]
        return estimate, source

    backend.analyze = unsafe_estimate
    drop = backend.create_drop(backend.actor("demo-host"), b"photo")
    assert len(drop.allergens_final) == 9
    assert drop.diet_tags_final == ["vegetarian"]
    assert drop.vision.diet_tags == ["vegetarian"]
    assert drop.allergen_notice == "may contain, confirm with host"


def test_provider_errors_and_fixture_forbidden_outside_demo(backend):
    host = backend.actor("demo-host")

    def failing(photo, note):
        raise RuntimeError("secret provider credential")

    backend.analyze = failing
    with pytest.raises(DomainError) as exc:
        backend.create_drop(host, b"photo")
    assert exc.value.status == 503 and "secret" not in exc.value.message
    from services.api.application import fixture_vision

    backend.analyze = fixture_vision
    backend.demo_mode = False
    with pytest.raises(DomainError) as exc:
        backend.create_drop(host, b"photo")
    assert exc.value.status == 503


def test_notification_outbox_retries_without_duplicate_success(backend):
    received = []

    def unavailable(invite_id, student_id, drop_id):
        raise RuntimeError("provider unavailable")

    backend.notify = unavailable
    drop = publish_drop(backend)
    backend.notify = lambda *ids: received.append(ids)
    backend.tick(10)
    backend.tick(10)
    assert len(received) == 2
    assert all(ids[2] == str(drop.id) for ids in received)
    assert all(len(ids) == 3 for ids in received)


def test_unknown_building_and_cross_user_preferences(client, backend):
    response = client.post(
        "/students/me/presence",
        headers=headers("demo-student-A"),
        json={"building_code": "NOT-VERIFIED"},
    )
    assert response.status_code == 422
    response = client.put(
        "/students/me/preferences",
        headers=headers("demo-student-A"),
        json={
            "allergens": ["dairy"],
            "diets": ["vegetarian"],
            "alerts_paused": True,
        },
    )
    assert response.status_code == 200
    drop = publish_drop(backend)
    assert not backend.invites(persona(backend, "A")).invites
    assert len(backend.invites(persona(backend, "C")).invites) == 1
    assert client.get(f"/drops/{drop.id}", headers=headers("demo-student-A")).status_code == 404


def test_unvalidated_and_oversize_upload_rejected_without_vision(backend):
    host = backend.actor("demo-host")
    with pytest.raises(DomainError) as exc:
        backend.create_drop(host, b"x" * (10 * 1024 * 1024 + 1))
    assert exc.value.status == 413
    backend.validate_photo = None
    with pytest.raises(DomainError) as exc:
        backend.create_drop(host, b"photo")
    assert exc.value.status == 422
