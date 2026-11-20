"""Host pickup push: encrypted own-host registration, once per claim, opt-out honored.

Composes the real app in FCM mode with every HTTP call answered by a mock transport.
"""

import io
import json
import uuid

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session, select

from services.api import main
from services.api.providers import fcm

PICKUP_VERDICT = {"match_status": "consistent", "confidence": 0.93, "explanation": "Pizza."}


@pytest.fixture(params=["fixture", "openrouter"])
def push_app(monkeypatch, tmp_path, request):
    monkeypatch.setattr(main, "load_dotenv", lambda: None)
    for key, value in {
        "AUTH_MODE": "demo",
        "DEMO_MODE": "true",
        "VISION_PROVIDER": request.param,
        "OPENROUTER_API_KEY": "synthetic-test-key",
        "OPENROUTER_VISION_MODEL": "google/gemini-3.8-flash",
        "PICKUP_FIXTURE_STATUS": "consistent",
        "NOTIFICATION_PROVIDER": "fcm",
        "FCM_ALLOWED_STUDENT_IDS": "",
        "FIREBASE_SERVICE_ACCOUNT_JSON": "{}",
        "FIREBASE_PROJECT_ID": "synthetic-project",
        "PUSH_TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(fcm, "service_account_access_token", lambda _: lambda: "oauth")
    sent: list[dict] = []
    checks: list[dict] = []

    def transport(request: httpx.Request) -> httpx.Response:
        if request.url.host == "openrouter.ai":
            body = json.loads(request.content)
            if body["response_format"]["json_schema"]["name"] == "pickup_check":
                checks.append(body)
                content = PICKUP_VERDICT
            else:
                content = {
                    "items": [
                        {"name": "roasted chicken", "portion_unit": "piece", "count_estimate": 2}
                    ],
                    "servings_estimate": 2,
                    "servings_low": 1,
                    "servings_high": 3,
                    "allergens_likely": ["dairy", "gluten"],
                    "diet_tags": [],
                    "confidence": 0.9,
                    "notes": "Mock transport only",
                }
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": json.dumps(content)}}]},
                request=request,
            )
        assert request.url.host == "fcm.googleapis.com"
        sent.append(json.loads(request.content)["message"])
        return httpx.Response(200, json={"name": "projects/x/messages/1"}, request=request)

    original = httpx.Client
    monkeypatch.setattr(
        httpx, "Client", lambda **kw: original(transport=httpx.MockTransport(transport))
    )
    return main.create_app(f"sqlite:///{tmp_path}/push.db"), sent, checks, request.param


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


HOST = bearer("demo-host")


def png() -> bytes:
    pixels = io.BytesIO()
    Image.new("RGB", (40, 40), "orange").save(pixels, "PNG")
    return pixels.getvalue()


def publish(client: TestClient, servings: int = 3) -> str:
    drop = client.post(
        "/drops", headers=HOST, files={"photo": ("p.png", png(), "image/png")}
    ).json()
    client.patch(
        f"/drops/{drop['id']}",
        headers=HOST,
        json={
            "servings_final": servings,
            "allergens_final": ["dairy", "gluten"],
            "diet_tags_final": [],
            "building_code": "DEMO-ORIGIN",
            "safety_review": {
                "covered_and_temperature_safe": True,
                "served_within_two_hours": True,
                "untouched": True,
            },
        },
    ).raise_for_status()
    client.post(f"/drops/{drop['id']}/publish", headers=HOST).raise_for_status()
    return drop["id"]


def collect(client: TestClient, drop_id: str, nickname: str) -> tuple[dict, str]:
    joined = client.post("/sessions", json={"nickname": nickname}).json()
    student = bearer(joined["token"])
    claim = client.post(f"/drops/{drop_id}/reserve", headers=student).json()
    check = client.post(
        f"/claims/{claim['id']}/pickup-photo",
        headers=student,
        files={"photo": ("food.png", png(), "image/png")},
        data={"request_id": str(uuid.uuid4())},
    ).json()
    assert check["can_confirm"], check
    done = client.post(
        f"/claims/{claim['id']}/pickup", headers=student, json={"verification_id": check["id"]}
    )
    assert done.status_code == 200
    return joined, claim["id"]


def test_host_push_registration_is_encrypted_scoped_and_reset(push_app) -> None:
    app, sent, _, _ = push_app
    with TestClient(app) as client:
        client.post("/demo/reset", headers=HOST, json={"scenario": "visitors"})
        assert client.get("/hosts/me/push-token", headers=HOST).json() == {"registered": False}
        assert client.post(
            "/hosts/me/push-token", headers=HOST, json={"token": "host-device"}
        ).json() == {"registered": True}
        assert client.get("/hosts/me/push-token", headers=HOST).json() == {"registered": True}
        visitor = client.post("/sessions", json={"nickname": "Ivy"}).json()
        student = bearer(visitor["token"])
        assert (
            client.post("/hosts/me/push-token", headers=student, json={"token": "x"}).status_code
            == 403
        )
        assert (
            client.post("/students/me/push-token", headers=HOST, json={"token": "x"}).status_code
            == 403
        )
        client.post("/students/me/push-token", headers=student, json={"token": "ivy-device"})
        with Session(app.state.backend.engine) as session:
            rows = session.exec(select(fcm.HostPushRegistration)).all()
            assert [row.host_id for row in rows] == ["demo-host"]
            assert "host-device" not in rows[0].ciphertext
            assert len(session.exec(select(fcm.PushRegistration)).all()) == 1
        assert sent == []
        client.post("/demo/reset", headers=HOST, json={"scenario": "visitors"})
        assert client.get("/hosts/me/push-token", headers=HOST).json() == {"registered": False}
        with Session(app.state.backend.engine) as session:
            assert session.exec(select(fcm.HostPushRegistration)).all() == []
            assert session.exec(select(fcm.PushRegistration)).all() == []


def test_pickup_alerts_only_opted_in_publishing_host_once(push_app) -> None:
    app, sent, checks, mode = push_app
    backend = app.state.backend
    with TestClient(app) as client:
        client.post("/demo/reset", headers=HOST, json={"scenario": "visitors"})
        assert client.get("/health").json()["pickup_verification"] == mode
        client.post("/hosts/me/push-token", headers=HOST, json={"token": "host-device"})
        drop_id = publish(client, servings=3)
        joined, claim_id = collect(client, drop_id, "Ivy")
        host_messages = [m for m in sent if m["data"]["notification_mode"] == "host_pickup"]
        assert len(host_messages) == 1
        message = host_messages[0]
        data = message["data"]
        assert message["token"] == "host-device"
        assert data["title"] == "Owl Plate: Pickup update"
        assert data["drop_id"] == drop_id and data["url"] == f"/host?drop={drop_id}"
        name = "roasted chicken" if mode == "openrouter" else "Demo pizza tray"
        assert data["body"] == f"A serving of {name} was marked collected. 2 servings available."
        assert data["tag"] == f"owl-pickup-{data['notification_id']}"
        assert message["webpush"]["headers"]["Topic"] == uuid.UUID(data["notification_id"]).hex
        assert len(message["webpush"]["headers"]["Topic"]) == 32
        serialized = json.dumps(message)
        for private in (claim_id, joined["student"]["id"], "Ivy", joined["token"]):
            assert private not in serialized
        if mode == "openrouter":
            assert len(checks) == 1
            prompt = json.dumps(checks[0])
            assert checks[0]["model"] == "google/gemini-3.8-flash"
            assert "Ivy" not in prompt and joined["student"]["id"] not in prompt
            assert "roasted chicken" in prompt

        before = len(sent)
        client.post(f"/claims/{claim_id}/pickup", headers=bearer(joined["token"]))
        backend.deliver_notifications()
        backend.tick()
        assert len(sent) == before, "retries and ticks never resend a handled event"

        client.delete("/hosts/me/push-token", headers=HOST)
        collect(client, drop_id, "Max")
        client.post("/hosts/me/push-token", headers=HOST, json={"token": "host-device-2"})
        backend.deliver_notifications()
        assert len(sent) == before, "opt-out honored; opt-in later replays nothing"


def test_deferred_host_send_rechecks_opt_out(push_app, monkeypatch) -> None:
    app, sent, _, _ = push_app
    backend = app.state.backend
    with TestClient(app) as client:
        client.post("/demo/reset", headers=HOST, json={"scenario": "visitors"})
        client.post("/hosts/me/push-token", headers=HOST, json={"token": "host-device"})
        drop_id = publish(client, servings=2)
        real = backend.notify_host

        def down(*args):
            raise RuntimeError("transport down")

        backend.notify_host = down
        collect(client, drop_id, "Ivy")
        assert not [m for m in sent if m["data"]["notification_mode"] == "host_pickup"]
        client.delete("/hosts/me/push-token", headers=HOST)
        backend.notify_host = real
        backend.deliver_notifications()
        assert not [m for m in sent if m["data"]["notification_mode"] == "host_pickup"]
