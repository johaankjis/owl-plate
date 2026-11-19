"""Real push reaches only opted-in visitors, once per new invite, linking to their own invite."""

import io
import json

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from PIL import Image

from services.api import main
from services.api.providers import fcm


@pytest.fixture(params=["fixture", "openrouter"])
def push_app(monkeypatch, tmp_path, request):
    """Compose the real app in FCM mode with the transport mocked; nothing leaves the test."""
    monkeypatch.setattr(main, "load_dotenv", lambda: None)
    for key, value in {
        "AUTH_MODE": "demo",
        "DEMO_MODE": "true",
        "VISION_PROVIDER": request.param,
        "OPENROUTER_API_KEY": "synthetic-test-key",
        "OPENROUTER_VISION_MODEL": "google/gemini-3.8-flash",
        "NOTIFICATION_PROVIDER": "fcm",
        "FCM_ALLOWED_STUDENT_IDS": "",
        "FIREBASE_SERVICE_ACCOUNT_JSON": "{}",
        "FIREBASE_PROJECT_ID": "synthetic-project",
        "PUSH_TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode(),
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(fcm, "service_account_access_token", lambda _: lambda: "oauth")
    sent: list[dict] = []

    def transport(request: httpx.Request) -> httpx.Response:
        if request.url.host == "openrouter.ai":
            payload = {
                "items": [
                    {"name": "Mock campus pizza", "portion_unit": "slice", "count_estimate": 2}
                ],
                "servings_estimate": 2,
                "servings_low": 1,
                "servings_high": 3,
                "allergens_likely": ["dairy", "gluten"],
                "diet_tags": [],
                "confidence": 0.9,
                "notes": "Mock transport only, not measured live vision",
            }
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": json.dumps(payload)}}]},
                request=request,
            )
        assert request.url.host == "fcm.googleapis.com"
        sent.append(json.loads(request.content)["message"])
        return httpx.Response(200, json={"name": "projects/x/messages/1"}, request=request)

    original = httpx.Client
    monkeypatch.setattr(
        httpx, "Client", lambda **kw: original(transport=httpx.MockTransport(transport))
    )
    return main.create_app(f"sqlite:///{tmp_path}/push.db"), sent


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def publish_two_servings(client: TestClient) -> None:
    pixels = io.BytesIO()
    Image.new("RGB", (40, 40), "orange").save(pixels, "PNG")
    drop = client.post(
        "/drops",
        headers=bearer("demo-host"),
        files={"photo": ("p.png", pixels.getvalue(), "image/png")},
    ).json()
    assert drop["vision_source"] == client.get("/health").json()["vision"]
    if drop["vision_source"] == "openrouter":
        assert drop["vision"]["items"][0]["name"] == "Mock campus pizza"
    review = {
        "servings_final": 2,
        "allergens_final": ["dairy", "gluten"],
        "diet_tags_final": [],
        "building_code": "DEMO-ORIGIN",
        "room": "",
        "expires_in_minutes": 45,
        "safety_review": {
            "covered_and_temperature_safe": True,
            "served_within_two_hours": True,
            "untouched": True,
        },
    }
    client.patch(f"/drops/{drop['id']}", headers=bearer("demo-host"), json=review)
    client.post(f"/drops/{drop['id']}/publish", headers=bearer("demo-host")).raise_for_status()


def register(client: TestClient, token: str, device: str) -> None:
    response = client.post("/students/me/push-token", headers=bearer(token), json={"token": device})
    assert response.status_code == 200


def test_feed_push_once_per_opted_in_visitor_per_drop(push_app) -> None:
    app, sent = push_app
    backend = app.state.backend
    with TestClient(app) as client:
        client.post("/demo/reset", headers=bearer("demo-projector"), json={"scenario": "visitors"})
        opted = client.post("/sessions", json={"nickname": "Ivy"}).json()
        quiet = client.post("/sessions", json={"nickname": "Max"}).json()
        register(client, opted["token"], "ivy-device")
        seeded = client.post(
            "/students/me/push-token",
            headers=bearer("demo-student-A"),
            json={"token": "seeded-device"},
        )
        assert seeded.status_code == 403
        assert sent == []

        publish_two_servings(client)
        drop_id = client.get("/students/me/feed", headers=bearer(opted["token"])).json()["drops"][
            0
        ]["drop"]["id"]
        assert len(sent) == 1, "exactly one real push, only for the opted-in visitor"
        message = sent[0]
        assert message["token"] == "ivy-device"
        assert message["data"]["notification_mode"] == "campus_feed"
        assert message["data"]["drop_id"] == drop_id and "invite_id" not in message["data"]
        assert message["data"]["url"] == f"/student?drop={drop_id}"
        assert message["data"]["tag"] == f"owl-drop-{drop_id}"
        assert message["webpush"]["headers"]["Topic"] == drop_id.replace("-", "")
        assert "Ivy" not in json.dumps(message) and "Max" not in json.dumps(message)

        late = client.post("/sessions", json={"nickname": "Late"}).json()
        register(client, late["token"], "late-device")
        register(client, quiet["token"], "max-device")
        register(client, opted["token"], "ivy-rotated-device")
        backend.deliver_notifications()
        backend.tick()
        client.post("/demo/tick", headers=bearer("demo-host"), json={"advance_seconds": 120})
        held = client.post(f"/drops/{drop_id}/reserve", headers=bearer(late["token"])).json()
        client.post(f"/claims/{held['id']}/release", headers=bearer(late["token"]))
        client.post(f"/drops/{drop_id}/reserve", headers=bearer(opted["token"]))
        client.post("/demo/tick", headers=bearer("demo-host"), json={"advance_seconds": 700})
        client.post(f"/drops/{drop_id}/publish", headers=bearer("demo-host"))
        client.get("/students/me/feed", headers=bearer(late["token"]))
        assert len(sent) == 1, "no sends on polls, ticks, late joins, reserve or expiry"

        client.delete("/sessions/me", headers=bearer(opted["token"])).raise_for_status()
        assert not backend.is_visitor(opted["student"]["id"])


def test_seeded_rehearsal_push_keeps_legacy_invite_payload(push_app) -> None:
    app, sent = push_app
    with TestClient(app) as client:
        client.post("/demo/reset", headers=bearer("demo-projector"), json={"scenario": "seeded"})
        joined = client.post("/sessions", json={"nickname": "Ivy", "area": "demo-venue"}).json()
        register(client, joined["token"], "ivy-device")
        publish_two_servings(client)
        app.state.backend.tick()
        mine = client.get("/students/me/invites", headers=bearer(joined["token"])).json()
        invite_id = mine["invites"][0]["id"]
        assert len(sent) == 1
        assert sent[0]["data"]["notification_mode"] == "seeded_waves"
        assert sent[0]["data"]["invite_id"] == invite_id
        assert sent[0]["data"]["url"] == f"/student?invite={invite_id}"
