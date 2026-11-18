"""Prove cross-device discovery shares only the current synthetic drop ID."""

import pytest

from services.api.application import Backend, DomainError
from services.api.tests.conftest import invitation, persona, publish_drop


def test_discovery_is_latest_drop_and_reset_is_null(client, backend):
    host = {"Authorization": "Bearer demo-host"}
    projector = {"Authorization": "Bearer demo-projector"}
    assert client.get("/demo/active-drop", headers=projector).json() == {"drop_id": None}
    first = publish_drop(backend, servings=1)
    assert client.get("/demo/active-drop", headers=host).json() == {"drop_id": str(first.id)}
    backend.claim(persona(backend, "A"), str(invitation(backend, "A", first.id).id))
    assert client.get("/demo/active-drop", headers=projector).json() == {"drop_id": str(first.id)}
    backend.tick(1)
    draft = backend.create_drop(backend.actor("demo-host"), b"test-adapter-validated")
    assert client.get("/demo/active-drop", headers=projector).json() == {"drop_id": str(draft.id)}
    assert client.post("/demo/reset", headers=host).status_code == 200
    assert client.get("/demo/active-drop", headers=projector).json() == {"drop_id": None}


def test_discovery_excludes_expired_drops(client, backend):
    publish_drop(backend, minutes=1)
    backend.tick(60)
    assert client.get(
        "/demo/active-drop", headers={"Authorization": "Bearer demo-projector"}
    ).json() == {"drop_id": None}


def test_discovery_denies_students_and_requires_both_demo_gates(client, backend):
    assert client.get("/demo/active-drop").status_code == 401
    assert (
        client.get(
            "/demo/active-drop", headers={"Authorization": "Bearer demo-student-A"}
        ).status_code
        == 403
    )
    for demo, auth in [(False, "demo"), (True, "entra")]:
        service = Backend(backend.engine, demo_mode=demo, auth_mode=auth)
        for role in ["host", "projector"]:
            with pytest.raises(DomainError) as failure:
                service.active_drop(backend.actor(f"demo-{role}"))
            assert failure.value.status == 403
