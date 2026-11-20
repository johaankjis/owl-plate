"""POST /demo/recording-dataset: explicit, gated, atomic and repeatable simulated data."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from services.api import application, main
from services.api.analytics import SEED_VERSION, assumptions_from_env
from services.api.analytics.operations import local_date
from services.api.application import Backend, fixture_vision
from services.api.campus import CampusRegistry, load_registry
from services.api.db.models import (
    Claim,
    DatasetMarker,
    Drop,
    DropPhoto,
    FeedNotification,
    HostPickupNotification,
    Invite,
    PantryReferral,
    PickupAttempt,
    VisitorSession,
)
from services.api.pickup.verifiers import FixturePickupVerifier
from services.api.routes.api import build_router
from services.api.tests.analytics.conftest import (
    COORDINATOR,
    HOST,
    PROJECTOR,
    START,
    join,
    operations,
    outcome_sum,
    publish,
)

URL = "/demo/recording-dataset"
CONFIRM = {"confirm_reset": True}


def load(client):
    response = client.post(URL, headers=PROJECTOR, json=CONFIRM)
    assert response.status_code == 200, response.text
    return response.json()


def test_confirmation_role_and_provider_gates(client, backend):
    existing = publish(client, 2)
    assert client.post(URL, headers=PROJECTOR).status_code == 422
    assert client.post(URL, headers=PROJECTOR, json={}).status_code == 422
    assert client.post(URL, headers=PROJECTOR, json={"confirm_reset": False}).status_code == 422
    assert client.post(URL, json=CONFIRM).status_code == 401
    for headers in (HOST, COORDINATOR, join(client, "Riley")):
        assert client.post(URL, headers=headers, json=CONFIRM).status_code == 403
    backend.recording_available = False
    refused = client.post(URL, headers=PROJECTOR, json=CONFIRM)
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "recording_unavailable"
    assert operations(client)["recording_available"] is False
    with Session(backend.engine) as session:
        assert session.get(Drop, existing) is not None  # Nothing was overwritten.
        assert session.get(DatasetMarker, 1) is None
    backend.recording_available = True
    backend.auth_mode = "entra"
    assert client.post(URL, headers=PROJECTOR, json=CONFIRM).status_code in {401, 403}


def test_dataset_shape_and_simulation_labels(client, backend):
    body = load(client)
    assert body["period"] == "all" and body["recording_available"] is True
    assert body["dataset"]["kind"] == "recording" and body["dataset"]["is_simulated"]
    assert body["dataset"]["seed_version"] == SEED_VERSION
    assert body["dataset"]["anchor_time"] == "2026-11-18T17:00:00Z"
    assert "simulated" in body["dataset"]["label"].lower()
    assert any("not measured campus impact" in note for note in body["notes"])
    summary = body["summary"]
    assert summary["total_servings_offered"] == outcome_sum(body) > 0
    assert summary["published_listings"] >= 8 and summary["active_listings"] >= 1
    assert len(body["buildings"]) >= 6 and summary["buildings_served"] >= 6
    assert summary["participating_hosts"] >= 2 and summary["participating_students"] >= 10
    assert summary["pending_pickup_reviews"] >= 1 and summary["pending_pantry_requests"] >= 1
    assert summary["joined_sessions"] == 0  # Simulated students are never visitor sessions.
    for name in ("available", "student_reserved", "student_pickups", "pantry_reserved"):
        assert body["outcomes"][name] > 0, name
    assert body["outcomes"]["pantry_transfers"] > 0 and body["outcomes"]["expired_unclaimed"] > 0
    assert len(body["categories"]) >= 4
    assert all(event["is_simulated"] for event in body["activity"])
    week = operations(client, "7d")
    dated = {p["date"] for p in week["series"] if p["published_listings"]}
    assert len(dated) == 7
    assert (
        operations(client, "all")["summary"]["published_listings"]
        > week["summary"]["published_listings"]
    )
    for listing in body["active_listings"]:
        assert listing["has_photo"] is False and listing["photo_url"] is None


def test_persisted_rows_balance_and_cannot_send_anything(client, backend):
    load(client)
    now = START
    with Session(backend.engine) as session:
        drops = session.exec(select(Drop)).all()
        statuses = {r.status for r in session.exec(select(PantryReferral)).all()}
        assert statuses == {
            "suggested",
            "requested",
            "accepted",
            "handoff_confirmed",
            "rejected",
            "expired",
        }
        for drop in drops:
            counts = backend._counts(session, drop)
            assert min(counts.model_dump().values()) >= 0
            if drop.status != "expired":
                assert datetime.fromisoformat(drop.data["expires_at"]) > now
        for claim in session.exec(select(Claim).where(Claim.status == "held")).all():
            assert datetime.fromisoformat(claim.held_until) > now
        holders = [c.student_id for c in session.exec(select(Claim).where(Claim.status == "held"))]
        assert len(holders) == len(set(holders))
        review = session.exec(select(PickupAttempt)).one()
        assert review.review_status == "pending" and review.source == "fixture"
        assert session.exec(select(FeedNotification)).all() == []
        assert session.exec(select(DropPhoto)).all() == []
        assert session.exec(select(VisitorSession)).all() == []
        assert all(i.notification_sent for i in session.exec(select(Invite)).all())
        assert all(r.sent for r in session.exec(select(HostPickupNotification)).all())
        dates = {local_date(datetime.fromisoformat(d.data["published_at"])) for d in drops}
        assert {local_date(now) - timedelta(days=k) for k in range(7)} <= dates
    backend.deliver_notifications()
    backend.tick()
    assert backend.sent == []


def test_fixed_anchor_is_repeatable_and_anchor_changes_ids(backend):
    projector = backend.actor("demo-projector")
    anchor = datetime(2026, 11, 18, 16, 45, 30, tzinfo=UTC)
    first = backend.load_recording_dataset(projector, anchor).model_dump()
    with Session(backend.engine) as session:
        first_ids = sorted(d.id for d in session.exec(select(Drop)).all())
    second = backend.load_recording_dataset(projector, anchor).model_dump()
    with Session(backend.engine) as session:
        assert sorted(d.id for d in session.exec(select(Drop)).all()) == first_ids
    assert first == second
    backend.load_recording_dataset(projector, anchor - timedelta(minutes=5))
    with Session(backend.engine) as session:
        assert sorted(d.id for d in session.exec(select(Drop)).all()) != first_ids


def test_marker_survives_restart_and_normal_reset_clears_it(client, backend, clock):
    load(client)
    restarted = Backend(
        backend.engine,
        analyze=fixture_vision,
        validate_photo=lambda b: b,
        verify_pickup=FixturePickupVerifier(),
        demo_mode=True,
        auth_mode="demo",
        clock=clock,
        campus=load_registry(),
    )
    app = FastAPI()
    app.include_router(build_router(restarted))
    with TestClient(app) as again:
        body = operations(again)
        assert body["dataset"]["kind"] == "recording"
        assert body["recording_available"] is False  # Composition flag, not stored state.
    assert (
        client.post("/demo/reset", headers=PROJECTOR, json={"scenario": "visitors"}).status_code
        == 200
    )
    body = operations(client, "all")
    assert body["dataset"]["kind"] == "current"
    assert body["summary"]["published_listings"] == 0


def test_seed_failure_rolls_back_to_previous_data(client, backend, monkeypatch):
    existing = publish(client, 2)

    def broken(session, **kwargs):
        session.add(DatasetMarker(id=1, seed_version="partial", anchor_time=START.isoformat()))
        session.flush()
        raise RuntimeError("simulated failure mid-seed")

    monkeypatch.setattr(application, "seed_recording", broken)
    with pytest.raises(RuntimeError):
        backend.load_recording_dataset(backend.actor("demo-projector"))
    with Session(backend.engine) as session:
        assert session.get(Drop, existing) is not None
        assert session.get(DatasetMarker, 1) is None


def test_missing_verified_buildings_refuse_without_inventing(client, backend):
    existing = publish(client, 2)
    backend.campus = CampusRegistry()
    refused = client.post(URL, headers=PROJECTOR, json=CONFIRM)
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "recording_unavailable"
    with Session(backend.engine) as session:
        assert session.get(Drop, existing) is not None


def test_composition_derives_recording_capability_and_estimates(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "load_dotenv", lambda: None)
    for key, value in {
        "AUTH_MODE": "demo",
        "DEMO_MODE": "true",
        "VISION_PROVIDER": "fixture",
        "NOTIFICATION_PROVIDER": "log",
        "OWL_ESTIMATED_MEAL_VALUE_USD": "",
        "OWL_ESTIMATED_FOOD_KG_PER_SERVING": "",
    }.items():
        monkeypatch.setenv(key, value)
    app = main.create_app(f"sqlite:///{tmp_path}/fixture.db")
    assert app.state.backend.recording_available is True
    assert app.state.backend.impact_assumptions.meal_value_usd == 5.0
    monkeypatch.setenv("VISION_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "synthetic-unused-key")
    monkeypatch.setenv("OPENROUTER_VISION_MODEL", "synthetic/model")
    live = main.create_app(f"sqlite:///{tmp_path}/live.db")
    assert live.state.backend.recording_available is False
    monkeypatch.setenv("OWL_ESTIMATED_MEAL_VALUE_USD", "7.5")
    monkeypatch.setenv("OWL_ESTIMATED_FOOD_KG_PER_SERVING", "0.2")
    tuned = main.create_app(f"sqlite:///{tmp_path}/tuned.db")
    assert tuned.state.backend.impact_assumptions.food_kg_per_serving == 0.2
    for bad in ("nan", "inf", "-1", "1000", "abc"):
        monkeypatch.setenv("OWL_ESTIMATED_MEAL_VALUE_USD", bad)
        with pytest.raises(ValueError):
            main.create_app(f"sqlite:///{tmp_path}/bad.db")


@pytest.mark.parametrize(("meal", "kg"), [("", ""), ("0", "0"), ("100", "5"), ("4.25", "0.4")])
def test_estimate_settings_accept_bounded_values(meal, kg):
    assumptions = assumptions_from_env(meal, kg)
    assert 0 <= assumptions.meal_value_usd <= 100 and 0 <= assumptions.food_kg_per_serving <= 5
