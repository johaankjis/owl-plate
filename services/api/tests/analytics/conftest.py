"""Analytics fixtures: a movable demo clock and the real verified campus registry."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.api.application import Backend, fixture_vision
from services.api.campus import load_registry
from services.api.db.session import create_database
from services.api.pickup.verifiers import FixturePickupVerifier
from services.api.routes.api import build_router

HOST = {"Authorization": "Bearer demo-host"}
PROJECTOR = {"Authorization": "Bearer demo-projector"}
COORDINATOR = {"Authorization": "Bearer demo-pantry-coordinator"}
SAFE = {"covered_and_temperature_safe": True, "served_within_two_hours": True, "untouched": True}
ACK = {"demo_policy_acknowledged": True}
STUDENT_CENTER = "ksu-marietta-joe-mack-wilson-student-center"
LIBRARY = "ksu-marietta-lawrence-v-johnson-library"
START = datetime(2026, 11, 18, 17, tzinfo=UTC)  # Noon in New York (EST).


class Clock:
    """A test clock the scenarios can move; the backend reads it on every transaction."""

    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


@pytest.fixture
def clock():
    return Clock(START)


@pytest.fixture
def backend(tmp_path, clock):
    engine = create_database(f"sqlite:///{tmp_path}/analytics.db")
    service = Backend(
        engine,
        analyze=fixture_vision,
        validate_photo=lambda b: b,
        verify_pickup=FixturePickupVerifier(),
        demo_mode=True,
        auth_mode="demo",
        clock=clock,
        campus=load_registry(),
        recording_available=True,
    )
    service.reset(service.actor("demo-host"), "visitors")
    service.sent = []
    service.notify = lambda *args, **kwargs: service.sent.append(("student", args))
    service.notify_host = lambda *args: service.sent.append(("host", args))
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


def publish(client, servings, *, building=STUDENT_CENTER, minutes=45, food=None):
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
            "building_code": building,
            "room": "214",
            "expires_in_minutes": minutes,
            "safety_review": SAFE,
        },
    )
    assert edited.status_code == 200, edited.text
    published = client.post(f"/drops/{created['id']}/publish", headers=HOST)
    assert published.status_code == 200, published.text
    return created["id"]


def reserve(client, student, drop_id):
    response = client.post(f"/drops/{drop_id}/reserve", headers=student)
    assert response.status_code == 200, response.text
    return response.json()


def pick_up(client, student, claim_id, request_id):
    check = client.post(
        f"/claims/{claim_id}/pickup-photo",
        headers=student,
        files={"photo": ("food.png", b"synthetic-photo", "image/png")},
        data={"request_id": request_id},
    ).json()
    picked = client.post(
        f"/claims/{claim_id}/pickup", headers=student, json={"verification_id": check["id"]}
    )
    assert picked.status_code == 200 and picked.json()["status"] == "picked_up", picked.text
    return check["id"]


def operations(client, period="7d"):
    response = client.get(f"/analytics/operations?period={period}", headers=PROJECTOR)
    assert response.status_code == 200, response.text
    return response.json()


def outcome_sum(body) -> int:
    return sum(body["outcomes"].values())
