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


def test_only_opted_in_visitor_gets_one_push_for_their_invite(push_app) -> None:
    app, sent = push_app
    with TestClient(app) as client:
        client.post("/demo/reset", headers=bearer("demo-projector"), json={"scenario": "visitors"})
        opted = client.post("/sessions", json={"nickname": "Ivy", "area": "demo-venue"}).json()
        quiet = client.post("/sessions", json={"nickname": "Max", "area": "demo-venue"}).json()
        assert (
            client.post(
                "/students/me/push-token",
                headers=bearer(opted["token"]),
                json={"token": "ivy-device"},
            ).status_code
            == 200
        )
        seeded = client.post(
            "/students/me/push-token",
            headers=bearer("demo-student-A"),
            json={"token": "seeded-device"},
        )
        assert seeded.status_code == 403
        assert sent == []

        publish_two_servings(client)
        app.state.backend.deliver_notifications()
        app.state.backend.tick()

        mine = client.get("/students/me/invites", headers=bearer(opted["token"])).json()
        invite_id = mine["invites"][0]["id"]
        assert len(sent) == 1, "exactly one real push, only for the opted-in visitor"
        assert sent[0]["token"] == "ivy-device"
        assert sent[0]["data"]["invite_id"] == invite_id
        assert sent[0]["data"]["url"] == f"/student?invite={invite_id}"
        assert "Ivy" not in json.dumps(sent[0]) and "Max" not in json.dumps(sent[0])
        assert client.get("/students/me/invites", headers=bearer(quiet["token"])).json()[
            "invites"
        ], "the non-opted visitor is still invited, with a simulated notification"

        client.delete("/sessions/me", headers=bearer(opted["token"])).raise_for_status()
        assert not app.state.backend.is_visitor(opted["student"]["id"])
