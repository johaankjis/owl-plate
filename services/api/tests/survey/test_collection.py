"""Protect research counts, consent and privacy independently of demo state."""

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from services.api.main import create_app
from services.api.schemas.survey import SurveyRequest
from services.api.survey.service import SurveyService


@pytest.fixture
def app(tmp_path, monkeypatch):
    for key, value in {
        "AUTH_MODE": "demo",
        "DEMO_MODE": "true",
        "VISION_PROVIDER": "fixture",
        "NOTIFICATION_PROVIDER": "log",
        "SURVEY_ENABLED": "true",
    }.items():
        monkeypatch.setenv(key, value)
    return create_app(f"sqlite:///{tmp_path}/survey.db")


def payload():
    return {"submission_id": str(uuid4()), "consent": True, "answers": {"campus": "Both"}}


def test_preview_never_saves_or_counts(app):
    service = SurveyService(app.state.backend.engine, accepting=False)
    assert service.submit(SurveyRequest(**payload())).model_dump() == {
        "accepted": False,
        "preview": True,
    }
    assert service.count() == 0


def test_submission_retry_counts_once_without_public_read(app):
    with TestClient(app) as client:
        body = payload()
        for _ in range(2):
            assert client.post("/survey/responses", json=body).json() == {
                "accepted": True,
                "preview": False,
            }
        assert SurveyService(app.state.backend.engine).count() == 1
        assert client.get("/survey/status").json() == {"accepting": True}
        assert client.get("/survey/responses").status_code == 405
        assert client.get("/survey/count").status_code == 404


def test_consent_and_bounded_answers_required(app):
    with TestClient(app) as client:
        for bad in [
            {**payload(), "consent": False},
            {**payload(), "answers": {"feedback": "x" * 501}},
            {**payload(), "student_id": "real-student"},
            {**payload(), "answers": {"email": "not-accepted@example.com"}},
            {**payload(), "answers": {"campus": "invented"}},
        ]:
            assert client.post("/survey/responses", json=bad).status_code == 422
        assert SurveyService(app.state.backend.engine).count() == 0


def test_skipping_all_questions_is_allowed(app):
    with TestClient(app) as client:
        assert (
            client.post("/survey/responses", json={**payload(), "answers": {}}).status_code == 200
        )
        assert SurveyService(app.state.backend.engine).count() == 1


def test_demo_reset_never_deletes_research_answers(app):
    with TestClient(app) as client:
        client.post("/survey/responses", json=payload())
        assert (
            client.post("/demo/reset", headers={"Authorization": "Bearer demo-host"}).status_code
            == 200
        )
        assert SurveyService(app.state.backend.engine).count() == 1


def test_overlapping_retries_only_count_one_response(app):
    service = SurveyService(app.state.backend.engine, accepting=True)
    body = SurveyRequest(**payload())
    with ThreadPoolExecutor(max_workers=6) as pool:
        assert all(receipt.accepted for receipt in pool.map(service.submit, [body] * 6))
    assert service.count() == 1


def test_database_failure_never_claims_response_saved(app, monkeypatch):
    from sqlalchemy.exc import SQLAlchemyError

    def unavailable(self, request):
        raise SQLAlchemyError("private database details")

    monkeypatch.setattr(SurveyService, "submit", unavailable)
    with TestClient(app) as client:
        response = client.post("/survey/responses", json=payload())
        assert response.status_code == 503
        assert "private" not in response.text
        assert "not saved" in response.text


def test_preview_request_never_saves_even_after_collection_opens(app):
    with TestClient(app) as client:
        receipt = client.post("/survey/responses", json={**payload(), "preview": True})
        assert receipt.json() == {"accepted": False, "preview": True}
        assert SurveyService(app.state.backend.engine).count() == 0
