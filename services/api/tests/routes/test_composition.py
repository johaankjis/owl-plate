"""Verify transport wiring and failure boundaries without contacting external services."""

import asyncio
import logging

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, select

from services.api import main
from services.api.providers import fcm
from services.api.routes.api import build_router


@pytest.fixture
def demo_environment(monkeypatch):
    """Keep every composition test independent of private machine configuration."""
    monkeypatch.setattr(main, "load_dotenv", lambda: None)
    for key, value in {
        "AUTH_MODE": "demo",
        "DEMO_MODE": "true",
        "VISION_PROVIDER": "fixture",
        "NOTIFICATION_PROVIDER": "log",
        "FCM_ALLOWED_STUDENT_IDS": "",
        "FIREBASE_SERVICE_ACCOUNT_JSON": "",
        "FIREBASE_PROJECT_ID": "",
        "PUSH_TOKEN_ENCRYPTION_KEY": "",
    }.items():
        monkeypatch.setenv(key, value)


def test_log_registration_stays_unavailable(demo_environment, tmp_path):
    app = main.create_app(f"sqlite:///{tmp_path}/log.db")
    with TestClient(app) as client:
        response = client.post(
            "/students/me/push-token",
            headers={"Authorization": "Bearer demo-student-A"},
            json={"token": "synthetic-device-token"},
        )
        assert response.status_code == 503
        assert "synthetic-device-token" not in response.text
        assert client.get("/health").json()["notifications"] == "simulated"


def test_fcm_registers_only_current_student_and_reset_clears_tokens(
    demo_environment, monkeypatch, backend, tmp_path
):
    student_id = backend.actor("demo-student-A").id
    monkeypatch.setenv("NOTIFICATION_PROVIDER", "fcm")
    monkeypatch.setenv("FCM_ALLOWED_STUDENT_IDS", student_id)
    monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT_JSON", "{}")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "synthetic-project")
    monkeypatch.setenv("PUSH_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(fcm, "service_account_access_token", lambda _: lambda: "unused")

    def no_send(*args):
        raise AssertionError("Registration and reset must never send")

    monkeypatch.setattr(fcm.FcmNotifications, "notify", no_send)
    app = main.create_app(f"sqlite:///{tmp_path}/fcm.db")
    with TestClient(app) as client:
        host = {"Authorization": "Bearer demo-host"}
        client.post("/demo/reset", headers=host).raise_for_status()
        for role, status in [(None, 401), ("demo-host", 403), ("demo-projector", 403)]:
            response = client.post(
                "/students/me/push-token",
                headers={"Authorization": f"Bearer {role}"} if role else {},
                json={"token": "synthetic-device-token"},
            )
            assert response.status_code == status
        response = client.post(
            "/students/me/push-token",
            headers={"Authorization": "Bearer demo-student-A"},
            json={"token": "synthetic-device-token"},
        )
        assert response.status_code == 200 and response.json() == {"registered": True}
        with Session(app.state.backend.engine) as session:
            rows = session.exec(select(fcm.PushRegistration)).all()
            assert len(rows) == 1 and rows[0].student_id == student_id
            assert "synthetic-device-token" not in rows[0].ciphertext
        assert client.get("/health").json()["notifications"] == "fcm"
        client.post("/demo/reset", headers=host).raise_for_status()
        with Session(app.state.backend.engine) as session:
            assert not session.exec(select(fcm.PushRegistration)).all()


def test_registration_failures_are_sanitized(backend):
    def unavailable(student_id, token):
        raise SQLAlchemyError("private token and database details")

    app = FastAPI()
    app.include_router(build_router(backend, register_push_token=unavailable))
    with TestClient(app) as composed:
        response = composed.post(
            "/students/me/push-token",
            headers={"Authorization": "Bearer demo-student-A"},
            json={"token": "synthetic-device-token"},
        )
        assert response.status_code == 503
        assert "private" not in response.text and "synthetic-device-token" not in response.text


@pytest.mark.parametrize(
    "auth_mode,demo_mode", [("entra", "true"), ("demo", "false"), ("", "true")]
)
def test_composition_requires_both_demo_gates(
    demo_environment, monkeypatch, tmp_path, auth_mode, demo_mode
):
    monkeypatch.setenv("AUTH_MODE", auth_mode)
    monkeypatch.setenv("DEMO_MODE", demo_mode)
    with pytest.raises(ValueError, match="explicit demo"):
        main.create_app(f"sqlite:///{tmp_path}/forbidden.db")


def test_fcm_missing_allowlist_fails_closed(demo_environment, monkeypatch, tmp_path):
    monkeypatch.setenv("NOTIFICATION_PROVIDER", "fcm")
    with pytest.raises(ValueError, match="approved synthetic IDs"):
        main.create_app(f"sqlite:///{tmp_path}/missing.db")


def test_reset_tolerates_database_without_optional_table(backend):
    fcm.PushRegistration.__table__.drop(backend.engine)
    assert backend.reset(backend.actor("demo-host")).students == 30


def test_scheduler_retries_database_failure_without_private_logs(
    demo_environment, monkeypatch, tmp_path, caplog
):
    app = main.create_app(f"sqlite:///{tmp_path}/scheduler.db")
    calls = []
    original_sleep = asyncio.sleep

    async def exercise():
        retried = asyncio.Event()

        async def short_interval(seconds):
            await original_sleep(0.001)

        async def run_tick(method):
            calls.append(method)
            if len(calls) == 1:
                raise SQLAlchemyError("private SQL parameters and token")
            retried.set()

        monkeypatch.setattr(main.asyncio, "sleep", short_interval)
        monkeypatch.setattr(main.anyio.to_thread, "run_sync", run_tick)
        async with app.router.lifespan_context(app):
            await asyncio.wait_for(retried.wait(), timeout=1)

    with caplog.at_level(logging.ERROR):
        asyncio.run(exercise())
    assert len(calls) >= 2
    assert "Scheduler tick failed" in caplog.text
    assert "private SQL" not in caplog.text and "token" not in caplog.text
