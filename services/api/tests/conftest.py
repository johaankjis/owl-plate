"""Compose the backend in isolation without manager-owned app wiring."""

from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.api.application import Backend, fixture_vision
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
