"""Compose the backend in isolation without manager-owned app wiring."""

import json
from datetime import UTC, datetime

import h3
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.api.application import Backend, fixture_vision
from services.api.campus import CampusRegistry, load_registry
from services.api.db.session import create_database
from services.api.routes.api import build_router
from services.api.schemas.api import DropEdit, SafetyReview


@pytest.fixture
def backend(tmp_path):
    engine = create_database(f"sqlite:///{tmp_path}/test.db")
    backend = Backend(
        engine,
        analyze=fixture_vision,
        validate_photo=lambda b: b,
        demo_mode=True,
        auth_mode="demo",
        clock=lambda: datetime(2026, 11, 18, 12, tzinfo=UTC),
        campus=CampusRegistry(),
    )
    backend.reset(backend.actor("demo-host"))
    yield backend
    engine.dispose()


@pytest.fixture
def client(backend):
    app = FastAPI()
    app.include_router(build_router(backend))
    with TestClient(app) as client:
        yield client


def publish_drop(backend, servings=8, minutes=45, vegetarian=False):
    """Create reviewed food through public service hooks for transition tests."""
    host = backend.actor("demo-host")
    drop = backend.create_drop(host, b"validated by test adapter")
    backend.edit_drop(
        host,
        str(drop.id),
        DropEdit(
            servings_final=servings,
            allergens_final=["dairy", "gluten"],
            diet_tags_final=["vegetarian"] if vegetarian else [],
            building_code="DEMO-ORIGIN",
            expires_in_minutes=minutes,
            safety_review=SafetyReview(
                covered_and_temperature_safe=True, served_within_two_hours=True, untouched=True
            ),
        ),
    )
    return backend.publish(host, str(drop.id))


def persona(backend, label):
    """Use the explicitly synthetic actor rather than expose student records."""
    return backend.actor(f"demo-student-{label}")


def invitation(backend, label, drop_id):
    """Locate a student's own invitation for a particular drop."""
    return next(i for i in backend.invites(persona(backend, label)).invites if i.drop.id == drop_id)


FIXTURE_ORIGIN = (10.0, 10.0)  # Arbitrary test geography, deliberately not a campus location.


def fixture_dataset():
    """Build a contract-shaped dataset whose buildings sit at known H3 ring distances."""
    origin = h3.latlng_to_cell(*FIXTURE_ORIGIN, 11)
    far = min(set(h3.grid_disk(origin, 6)) - set(h3.grid_disk(origin, 5)))
    source = [{"url": "https://example.test/fixture", "title": "Test fixture, not KSU data"}]

    def record(slug, name, cell, status="verified", category="academic"):
        lat, lng = h3.cell_to_latlng(cell) if cell else (None, None)
        return {
            "id": f"ksu-marietta-fixture-{slug}",
            "name": name,
            "building_code": None,
            "building_number": None,
            "category": category,
            "latitude": lat,
            "longitude": lng,
            "verification_status": status,
            "sources": source,
        }

    return {
        "schema_version": 1,
        "campus": "marietta",
        "buildings": [
            record("near", "Fixture Near Hall (test)", origin),
            record("far", "Fixture Far Hall (test)", far, category="student_life"),
            record("pending", "Fixture Pending Hall (test)", None, status="unverified"),
            record("unproven", "Fixture Unproven Hall (test)", origin, status="unverified"),
        ],
    }


@pytest.fixture
def campus_path(tmp_path):
    """Write the fixture dataset to a temp file so loading is exercised for real."""
    path = tmp_path / "marietta.json"
    path.write_text(json.dumps(fixture_dataset()))
    return path


def _campus_client(tmp_path, campus_path, scenario):
    """HTTP client over a backend whose campus registry came from the temp dataset."""
    engine = create_database(f"sqlite:///{tmp_path}/campus-{scenario}.db")
    service = Backend(
        engine,
        analyze=fixture_vision,
        validate_photo=lambda b: b,
        demo_mode=True,
        auth_mode="demo",
        clock=lambda: datetime(2026, 11, 18, 12, tzinfo=UTC),
        campus=load_registry(campus_path),
    )
    service.reset(service.actor("demo-host"), scenario)
    app = FastAPI()
    app.include_router(build_router(service))
    with TestClient(app) as client:
        yield client
    engine.dispose()


@pytest.fixture
def campus_client(tmp_path, campus_path):
    """Explicit seeded rehearsal over real buildings: rings, check-ins and waves."""
    yield from _campus_client(tmp_path, campus_path, "seeded")


@pytest.fixture
def feed_client(tmp_path, campus_path):
    """Default visitors scenario: the location-free campus-wide feed."""
    yield from _campus_client(tmp_path, campus_path, "visitors")
