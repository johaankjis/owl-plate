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


def publish_listing(
    client: TestClient, *, servings: int, building_code: str, room: str
) -> tuple[str, str]:
    """Publish one host-reviewed listing; return its ID and the food name the host saw."""
    pixels = io.BytesIO()
    Image.new("RGB", (40, 40), "orange").save(pixels, "PNG")
    drop = client.post(
        "/drops",
        headers=bearer("demo-host"),
        files={"photo": ("p.png", pixels.getvalue(), "image/png")},
    ).json()
    review = {
        "servings_final": servings,
        "allergens_final": ["dairy", "gluten"],
        "diet_tags_final": [],
        "building_code": building_code,
        "room": room,
        "expires_in_minutes": 45,
        "safety_review": {
            "covered_and_temperature_safe": True,
            "served_within_two_hours": True,
            "untouched": True,
        },
    }
    client.patch(
        f"/drops/{drop['id']}", headers=bearer("demo-host"), json=review
    ).raise_for_status()
    client.post(f"/drops/{drop['id']}/publish", headers=bearer("demo-host")).raise_for_status()
    shown = client.get(f"/drops/{drop['id']}", headers=bearer("demo-host")).json()
    return drop["id"], shown["vision"]["items"][0]["name"]


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
        assert sent[0]["data"]["body"].startswith("2 servings at DEMO-ORIGIN.")
        assert sent[0]["data"]["title"].startswith("🍕 Free ")
        assert sent[0]["data"]["url"] == f"/student?invite={invite_id}"


def start_feed(client: TestClient, nickname: str = "Ivy") -> dict:
    client.post("/demo/reset", headers=bearer("demo-projector"), json={"scenario": "visitors"})
    joined = client.post("/sessions", json={"nickname": nickname}).json()
    register(client, joined["token"], f"{nickname.lower()}-device")
    return joined


def test_push_names_the_real_listing_building_and_room(push_app) -> None:
    app, sent = push_app
    with TestClient(app) as client:
        start_feed(client)
        drop_id, food = publish_listing(
            client, servings=5, building_code="ksu-marietta-academic-building", room="120"
        )
        assert len(sent) == 1
        data = sent[0]["data"]
        assert data["title"] == f"🍕 Free {food} on campus!"
        assert data["body"] == (
            "5 servings at Academic Building, Room 120. Reserve yours before it's gone!"
        )
        assert data["url"] == f"/student?drop={drop_id}"
        assert "notification" not in sent[0], "text is delivered in data for the service worker"


def test_push_without_a_room_does_not_invent_one(push_app) -> None:
    app, sent = push_app
    with TestClient(app) as client:
        start_feed(client)
        publish_listing(client, servings=3, building_code="ksu-marietta-academic-building", room="")
        assert sent[0]["data"]["body"] == (
            "3 servings at Academic Building. Reserve yours before it's gone!"
        )


def test_push_never_carries_student_or_dietary_detail(push_app) -> None:
    app, sent = push_app
    with TestClient(app) as client:
        client.post("/demo/reset", headers=bearer("demo-projector"), json={"scenario": "visitors"})
        joined = client.post("/sessions", json={"nickname": "Ivy", "allergens": ["peanut"]}).json()
        register(client, joined["token"], "ivy-device")
        publish_listing(client, servings=2, building_code="DEMO-ORIGIN", room="")
        assert len(sent) == 1, "a student whose allergen the listing lacks is still notified"
        # Everything the phone receives except the FCM delivery address itself.
        text = json.dumps({k: v for k, v in sent[0].items() if k != "token"}).lower()
        for private in ("ivy", "peanut", "allerg", "nickname", joined["token"].lower()):
            assert private not in text


def test_student_with_a_conflicting_allergen_gets_no_push(push_app) -> None:
    app, sent = push_app
    with TestClient(app) as client:
        client.post("/demo/reset", headers=bearer("demo-projector"), json={"scenario": "visitors"})
        joined = client.post("/sessions", json={"nickname": "Dana", "allergens": ["dairy"]}).json()
        register(client, joined["token"], "dana-device")
        publish_listing(client, servings=2, building_code="DEMO-ORIGIN", room="")
        assert sent == [], "dietary matching still skips the student before any text is built"


def test_exhausted_listing_is_not_announced_after_a_deferred_send(push_app) -> None:
    app, sent = push_app
    backend = app.state.backend
    with TestClient(app) as client:
        start_feed(client)
        taker = client.post("/sessions", json={"nickname": "Taker"}).json()
        real_notify = backend.notify

        def deferred(*args, **options):
            raise RuntimeError("provider unavailable")

        backend.notify = deferred
        drop_id, _ = publish_listing(client, servings=1, building_code="DEMO-ORIGIN", room="")
        client.post(f"/drops/{drop_id}/reserve", headers=bearer(taker["token"])).raise_for_status()
        backend.notify = real_notify
        backend.deliver_notifications()
        assert sent == [], "no push for food that is already fully reserved"


def test_multiple_food_items_use_every_actual_name(push_app) -> None:
    from sqlmodel import Session

    from services.api.db.models import Drop

    app, _ = push_app
    backend = app.state.backend
    with TestClient(app) as client:
        start_feed(client)
        drop_id, _ = publish_listing(client, servings=4, building_code="DEMO-ORIGIN", room="9")
        with Session(backend.engine) as session:
            drop = session.get(Drop, drop_id)
            data = dict(drop.data)
            data["vision"] = {
                **data["vision"],
                "items": [
                    {"name": "Cheese pizza", "portion_unit": "slice", "count_estimate": 8},
                    {"name": "Caesar salad", "portion_unit": "bowl", "count_estimate": 4},
                    {"name": "Brownies", "portion_unit": "piece", "count_estimate": 12},
                ],
            }
            drop.data = data
            session.add(drop)
            session.commit()
            content = backend._alert_content(session, drop)
        assert content.title == "🍕 Free Cheese pizza, Caesar salad and 1 more on campus!"
        assert content.body == "4 servings at DEMO-ORIGIN, Room 9. Reserve yours before it's gone!"
