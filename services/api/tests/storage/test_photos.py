"""Sanitized host listing photos: storage, retention, purge and per-role scope over HTTP."""

import io
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session, select

from services.api.application import Actor, Backend, DomainError, fixture_vision
from services.api.campus import load_registry
from services.api.db.models import DropPhoto
from services.api.db.session import create_database
from services.api.pickup.verifiers import FixturePickupVerifier
from services.api.routes.api import build_router
from services.api.storage.photos import draft_deadline, published_deadline
from services.api.vision.service import validate_photo

HOST = {"Authorization": "Bearer demo-host"}
OTHER_HOST = {"Authorization": "Bearer other-host"}
PROJECTOR = {"Authorization": "Bearer demo-projector"}
COORDINATOR = {"Authorization": "Bearer demo-pantry-coordinator"}
SAFE = {"covered_and_temperature_safe": True, "served_within_two_hours": True, "untouched": True}
PICKUP = "ksu-marietta-joe-mack-wilson-student-center"
START = datetime(2026, 11, 18, 12, tzinfo=UTC)


def png(color: str = "orange", size: tuple[int, int] = (64, 48)) -> bytes:
    """Synthetic pixels only; never a real food photo or person."""
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, "PNG")
    return buffer.getvalue()


def other_host(token: str) -> Actor:
    """A second synthetic host, only to prove cross-host isolation."""
    if token != "other-host":
        raise DomainError("unauthorized", "Sign in required.", 401)
    return Actor("host", "other-host")


class Clock:
    """A settable clock so retention deadlines can be crossed exactly."""

    def __init__(self) -> None:
        self.now = START

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


@pytest.fixture
def clock() -> Clock:
    return Clock()


def make_backend(tmp_path, clock: Clock, scenario: str) -> Backend:
    engine = create_database(f"sqlite:///{tmp_path}/photos-{scenario}.db")
    service = Backend(
        engine,
        analyze=fixture_vision,
        validate_photo=validate_photo,
        verify_pickup=FixturePickupVerifier(),
        demo_mode=True,
        auth_mode="demo",
        clock=clock,
        campus=load_registry(),
        authenticate=other_host,
    )
    service.reset(service.actor("demo-host"), scenario)
    service.notify = lambda *args, **kwargs: None
    service.notify_host = lambda *args: None
    return service


@pytest.fixture
def backend(tmp_path, clock):
    service = make_backend(tmp_path, clock, "visitors")
    yield service
    service.engine.dispose()


@pytest.fixture
def client(backend):
    app = FastAPI()
    app.include_router(build_router(backend))
    with TestClient(app) as test_client:
        yield test_client


def join(client, nickname: str) -> dict[str, str]:
    response = client.post("/sessions", json={"nickname": nickname})
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def create(client, photo: bytes | None = None, headers=HOST) -> dict:
    response = client.post(
        "/drops", headers=headers, files={"photo": ("food.png", photo or png(), "image/png")}
    )
    assert response.status_code == 200, response.text
    return response.json()


def publish(
    client, drop_id: str, servings: int = 3, minutes: int = 45, building: str = PICKUP
) -> dict:
    edited = client.patch(
        f"/drops/{drop_id}",
        headers=HOST,
        json={
            "servings_final": servings,
            "allergens_final": ["dairy", "gluten"],
            "diet_tags_final": [],
            "building_code": building,
            "room": "214",
            "expires_in_minutes": minutes,
            "safety_review": SAFE,
        },
    )
    assert edited.status_code == 200, edited.text
    published = client.post(f"/drops/{drop_id}/publish", headers=HOST)
    assert published.status_code == 200, published.text
    return published.json()


def photo(client, drop_id: str, headers=HOST):
    return client.get(f"/drops/{drop_id}/photo", headers=headers)


def stored(backend) -> list[DropPhoto]:
    with Session(backend.engine) as session:
        return list(session.exec(select(DropPhoto)).all())


# Sanitization


def exif_photo() -> bytes:
    """A wide JPEG tagged 'rotate 90' with GPS, a camera model and a comment."""
    image = Image.new("RGB", (80, 40), "red")
    image.paste(Image.new("RGB", (40, 40), "blue"), (0, 0))
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: display rotated 90 degrees clockwise.
    exif[0x0110] = "SecretCam 9000"
    gps = exif.get_ifd(0x8825)
    gps[1] = "N"
    gps[2] = (33.0, 56.0, 21.0)
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif, comment=b"owner-note")
    return buffer.getvalue()


def test_sanitizer_orients_and_strips_every_metadata_block():
    raw = exif_photo()
    assert b"SecretCam" in raw and b"owner-note" in raw
    clean = validate_photo(raw)
    assert b"SecretCam" not in clean and b"owner-note" not in clean and b"Exif" not in clean
    with Image.open(io.BytesIO(clean)) as image:
        assert image.format == "JPEG" and image.mode == "RGB"
        assert image.size == (40, 80)  # Upright: EXIF rotation applied before stripping.
        assert len(image.getexif()) == 0
        assert "exif" not in image.info and "icc_profile" not in image.info
        assert "comment" not in image.info


def test_sanitizer_bounds_size_and_rejects_oversized_inputs():
    clean = validate_photo(png(size=(3000, 1500)))
    with Image.open(io.BytesIO(clean)) as image:
        assert max(image.size) <= 1024
    with pytest.raises(ValueError):
        validate_photo(b"x" * (10 * 1024 * 1024 + 1))
    with pytest.raises(ValueError):
        validate_photo(png(size=(5000, 4001)))  # Over 20 megapixels.
    with pytest.raises(ValueError):
        validate_photo(b"")


def test_retention_rules_never_exceed_creation_plus_24_hours():
    assert draft_deadline(START) == START + timedelta(hours=2)
    assert published_deadline(START, START + timedelta(minutes=45)) == START + timedelta(minutes=45)
    assert published_deadline(START, START + timedelta(hours=30)) == START + timedelta(hours=24)


# Storage and response fields


def test_create_stores_sanitized_bytes_and_serves_them_privately(client, backend):
    raw = exif_photo()
    created = client.post(
        "/drops", headers=HOST, files={"photo": ("food.jpg", raw, "image/jpeg")}
    ).json()
    assert created["has_photo"] is True
    assert created["photo_url"] == f"/drops/{created['id']}/photo"
    assert "data:" not in str(created) and "base64" not in str(created)

    response = photo(client, created["id"])
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"] == 'inline; filename="drop-photo.jpg"'
    assert response.content == validate_photo(raw)
    assert b"SecretCam" not in response.content

    [row] = stored(backend)
    assert row.content == response.content and b"SecretCam" not in row.content


def test_photo_requires_bearer_header_never_query_tokens(client):
    drop_id = create(client)["id"]
    assert photo(client, drop_id, {}).status_code == 401
    assert photo(client, drop_id, {"Authorization": "Bearer nope"}).status_code == 401
    assert photo(client, drop_id, {"Authorization": "demo-host"}).status_code == 401
    assert client.get(f"/drops/{drop_id}/photo?token=demo-host").status_code == 401
    assert client.get(f"/drops/{drop_id}/photo?access_token=demo-host").status_code == 401
    assert photo(client, str(uuid4())).status_code == 404


# Scope


def test_draft_photo_is_visible_only_to_its_host(client):
    drop_id = create(client)["id"]
    student = join(client, "Riley")
    assert photo(client, drop_id).status_code == 200
    for headers in (OTHER_HOST, student, PROJECTOR, COORDINATOR):
        response = photo(client, drop_id, headers)
        assert response.status_code == 404, headers
        assert response.json()["detail"]["code"] == "not_found"


def test_published_feed_photo_scope_by_role(client, backend):
    drop_id = create(client)["id"]
    publish(client, drop_id)
    visitor = join(client, "Riley")
    assert photo(client, drop_id).status_code == 200
    assert photo(client, drop_id, visitor).status_code == 200
    assert photo(client, drop_id, PROJECTOR).status_code == 200
    assert photo(client, drop_id, OTHER_HOST).status_code == 404
    seeded = {"Authorization": f"Bearer demo-student-{backend.seed['students'][0]['label']}"}
    assert photo(client, drop_id, seeded).status_code == 404  # No own invite or claim.
    assert photo(client, drop_id, COORDINATOR).status_code == 404  # No referral yet.

    referral = client.post(
        f"/drops/{drop_id}/pantry-referral",
        headers=HOST,
        json={"servings": 1, "demo_policy_acknowledged": True},
    )
    assert referral.status_code == 200, referral.text
    assert photo(client, drop_id, COORDINATOR).status_code == 200

    feed = client.get("/students/me/feed", headers=visitor).json()
    [listing] = [row for row in feed["drops"] if row["drop"]["id"] == drop_id]
    assert listing["drop"]["has_photo"] is True
    assert listing["drop"]["photo_url"] == f"/drops/{drop_id}/photo"


def test_seeded_personas_see_photos_only_through_their_own_invites(tmp_path, clock):
    backend = make_backend(tmp_path, clock, "seeded")
    app = FastAPI()
    app.include_router(build_router(backend))
    with TestClient(app) as client:
        drop_id = create(client)["id"]
        publish(client, drop_id, servings=1, building="DEMO-ORIGIN")
        labels = [row["label"] for row in backend.seed["students"][:5]]
        invited = {
            label
            for label in labels
            if any(
                str(i.drop.id) == drop_id
                for i in backend.invites(backend.actor(f"demo-student-{label}")).invites
            )
        }
        assert invited and set(labels) - invited
        for label in labels:
            response = photo(client, drop_id, {"Authorization": f"Bearer demo-student-{label}"})
            assert response.status_code == (200 if label in invited else 404), label
    backend.engine.dispose()


def test_disabled_demo_gates_hide_photos_from_synthetic_roles(client, backend):
    drop_id = create(client)["id"]
    publish(client, drop_id)
    backend.demo_mode = False
    assert photo(client, drop_id, PROJECTOR).status_code == 401
    assert photo(client, drop_id, COORDINATOR).status_code == 401


# Retention and purge


def test_draft_photo_expires_after_two_hours_but_draft_survives(client, backend, clock):
    drop_id = create(client)["id"]
    clock.advance(hours=1, minutes=59)
    assert photo(client, drop_id).status_code == 200
    clock.advance(minutes=1)
    assert photo(client, drop_id).status_code == 404
    assert stored(backend) == []
    drop = client.get(f"/drops/{drop_id}", headers=HOST).json()
    assert drop["status"] == "draft"
    assert drop["has_photo"] is False and drop["photo_url"] is None


def test_publish_moves_deadline_to_food_expiry(client, backend, clock):
    drop_id = create(client)["id"]
    clock.advance(minutes=10)
    publish(client, drop_id, minutes=45)
    [row] = stored(backend)
    assert row.expires_at == (START + timedelta(minutes=55)).isoformat()
    clock.advance(minutes=44)
    assert photo(client, drop_id).status_code == 200
    clock.advance(minutes=1)
    assert photo(client, drop_id).status_code == 404
    [history] = client.get("/hosts/me/drops", headers=HOST).json()["drops"]
    assert history["id"] == drop_id and history["status"] == "expired"
    assert history["has_photo"] is False and history["photo_url"] is None


def test_publish_can_extend_a_draft_photo_past_two_hours(client, backend, clock):
    drop_id = create(client)["id"]
    clock.advance(hours=1, minutes=50)
    publish(client, drop_id, minutes=120)
    [row] = stored(backend)
    assert row.expires_at == (START + timedelta(hours=3, minutes=50)).isoformat()
    clock.advance(hours=1)
    assert photo(client, drop_id).status_code == 200


def test_tick_purges_expired_photos_without_any_read(client, backend, clock):
    drop_id = create(client)["id"]
    publish(client, drop_id, minutes=5)
    assert len(stored(backend)) == 1
    clock.advance(minutes=6)
    backend.tick()
    assert stored(backend) == []


def test_reset_purges_every_photo(client, backend):
    publish(client, create(client)["id"])
    create(client)
    assert len(stored(backend)) == 2
    assert (
        client.post("/demo/reset", headers=HOST, json={"scenario": "visitors"}).status_code == 200
    )
    assert stored(backend) == []


def test_private_pickup_photos_are_never_stored_or_served(client, backend, tmp_path):
    drop_id = create(client, png("orange"))["id"]
    publish(client, drop_id)
    student = join(client, "Riley")
    claim = client.post(f"/drops/{drop_id}/reserve", headers=student).json()
    pickup_raw = png("purple", (90, 70))
    check = client.post(
        f"/claims/{claim['id']}/pickup-photo",
        headers=student,
        files={"photo": ("pickup.png", pickup_raw, "image/png")},
        data={"request_id": str(uuid4())},
    )
    assert check.status_code == 200, check.text
    assert "photo_url" not in check.json()

    [row] = stored(backend)
    assert row.drop_id == drop_id and row.content == validate_photo(png("orange"))
    database = (tmp_path / "photos-visitors.db").read_bytes()
    assert validate_photo(pickup_raw) not in database
    assert pickup_raw not in database
    assert client.get(f"/claims/{claim['id']}/photo", headers=student).status_code in {404, 405}
    assert photo(client, claim["id"], student).status_code == 404


# Reservation history


def test_reservations_list_own_claims_newest_first(client, backend, clock):
    first = create(client)["id"]
    publish(client, first)
    second = create(client)["id"]
    publish(client, second)
    riley, sam = join(client, "Riley"), join(client, "Sam")
    old = client.post(f"/drops/{first}/reserve", headers=riley).json()
    client.post(f"/claims/{old['id']}/release", headers=riley)
    clock.advance(minutes=1)
    new = client.post(f"/drops/{second}/reserve", headers=riley).json()
    client.post(f"/drops/{first}/reserve", headers=sam)
    check = client.post(
        f"/claims/{new['id']}/pickup-photo",
        headers=riley,
        files={"photo": ("pickup.png", png("green"), "image/png")},
        data={"request_id": str(uuid4())},
    ).json()

    body = client.get("/students/me/reservations", headers=riley).json()
    assert set(body) == {"reservations", "server_time", "is_demo"}
    rows = body["reservations"]
    assert [row["claim"]["id"] for row in rows] == [new["id"], old["id"]]
    assert [row["claim"]["status"] for row in rows] == ["held", "released"]
    assert rows[0]["drop"]["id"] == second and rows[0]["drop"]["has_photo"] is True
    assert rows[0]["pickup_verification"]["id"] == check["id"]
    assert rows[1]["pickup_verification"] is None
    assert "priority" not in str(body) and "student_id" not in str(body)

    clock.advance(hours=1)
    expired = client.get("/students/me/reservations", headers=riley).json()["reservations"]
    assert expired[0]["claim"]["status"] == "expired"
    assert expired[0]["drop"]["status"] == "expired" and expired[0]["drop"]["has_photo"] is False


def test_reservations_are_student_only(client):
    assert client.get("/students/me/reservations").status_code == 401
    assert client.get("/students/me/reservations", headers=HOST).status_code == 403
    assert client.get("/students/me/reservations", headers=PROJECTOR).status_code == 403
    fresh = client.get("/students/me/reservations", headers=join(client, "Riley")).json()
    assert fresh["reservations"] == [] and fresh["is_demo"] is True


# Host dashboard


def test_host_drops_list_own_listings_in_every_status_newest_first(client, clock):
    expired = create(client)["id"]
    publish(client, expired, minutes=5)
    clock.advance(minutes=6)
    live = create(client)["id"]
    publish(client, live)
    clock.advance(minutes=1)
    draft = create(client)["id"]

    body = client.get("/hosts/me/drops", headers=HOST).json()
    assert set(body) == {"drops", "server_time", "is_demo"}
    assert [(d["id"], d["status"]) for d in body["drops"]] == [
        (draft, "draft"),
        (live, "live"),
        (expired, "expired"),
    ]
    assert [d["has_photo"] for d in body["drops"]] == [True, True, False]
    assert client.get("/hosts/me/drops", headers=OTHER_HOST).json()["drops"] == []


def test_host_drops_are_host_only(client):
    assert client.get("/hosts/me/drops").status_code == 401
    assert client.get("/hosts/me/drops", headers=PROJECTOR).status_code == 403
    assert client.get("/hosts/me/drops", headers=join(client, "Riley")).status_code == 403
