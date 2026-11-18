"""Prove OpenRouter live vision stays honest end to end: real estimates, fail-closed 503s."""

import base64
import io
import json
from datetime import UTC, datetime

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session, select

from services.api.application import Backend
from services.api.db.models import Drop
from services.api.db.session import create_database
from services.api.providers.openrouter import OpenRouterVision
from services.api.routes.api import build_router
from services.api.vision.service import SafeVision, validate_photo

API_KEY = "test-key-123"
MODEL = "google/gemini-3.8-flash"


def png_bytes(color: str) -> bytes:
    """Supply synthetic pixels; the mocked model decides what they 'show'."""
    buffer = io.BytesIO()
    Image.new("RGB", (40, 40), color).save(buffer, "PNG")
    return buffer.getvalue()


def estimate_payload(name: str, servings: int) -> dict:
    """One valid estimate the mocked OpenRouter model returns for an analyzed photo."""
    return {
        "items": [{"name": name, "portion_unit": "slice", "count_estimate": servings}],
        "servings_estimate": servings,
        "servings_low": max(1, servings - 2),
        "servings_high": servings + 2,
        "allergens_likely": ["dairy", "gluten"],
        "diet_tags": [],
        "confidence": 0.9,
        "notes": f"{name} on a tray",
    }


def envelope(payload: dict) -> dict:
    return {"choices": [{"message": {"content": json.dumps(payload)}, "finish_reason": "stop"}]}


def live_client(tmp_path, transport: httpx.BaseTransport) -> tuple[TestClient, Backend]:
    """Build the real route stack around an OpenRouter provider whose HTTP layer is mocked."""
    engine = create_database(f"sqlite:///{tmp_path}/live.db")
    backend = Backend(
        engine,
        analyze=SafeVision(OpenRouterVision(API_KEY, MODEL, transport=transport)).analyze,
        validate_photo=validate_photo,
        demo_mode=True,
        auth_mode="demo",
        clock=lambda: datetime(2026, 11, 18, 12, tzinfo=UTC),
    )
    app = FastAPI()
    app.include_router(build_router(backend))
    return TestClient(app), backend


def drop_count(backend: Backend) -> int:
    with Session(backend.engine) as session:
        return len(session.exec(select(Drop)).all())


def upload(client: TestClient, photo: bytes) -> httpx.Response:
    return client.post(
        "/drops",
        files={"photo": ("tray.png", photo, "image/png")},
        data={"host_note": "leftover from the mixer"},
        headers={"Authorization": "Bearer demo-host"},
    )


def test_live_success_creates_openrouter_drop_with_reencoded_photo(tmp_path) -> None:
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json=envelope(estimate_payload("cheese pizza slices", 8)))

    client, backend = live_client(tmp_path, httpx.MockTransport(handler))
    photo = png_bytes("orange")
    response = upload(client, photo)

    assert response.status_code == 200
    body = response.json()
    assert body["vision_source"] == "openrouter"
    assert body["vision"]["items"][0]["name"] == "cheese pizza slices"
    assert drop_count(backend) == 1
    # The API must send the validated re-encode of the actual upload as a base64 data URL.
    sent = json.loads(captured[0].content)["messages"][0]["content"][1]["image_url"]["url"]
    expected = base64.b64encode(validate_photo(validate_photo(photo))).decode()
    assert sent == f"data:image/jpeg;base64,{expected}"


@pytest.mark.parametrize(
    "reply",
    [
        httpx.Response(503, json={"error": {"message": "model overloaded http://internal"}}),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": None}}]}),
        httpx.Response(
            200,
            json=envelope({**estimate_payload("cheese pizza slices", 8), "servings_low": 99}),
        ),
    ],
)
def test_live_failures_return_vision_unavailable_without_a_drop(tmp_path, reply) -> None:
    client, backend = live_client(tmp_path, httpx.MockTransport(lambda request: reply))
    response = upload(client, png_bytes("orange"))

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "vision_unavailable"
    message = detail["message"]
    assert "OpenRouter" in message
    assert API_KEY not in message
    assert "http://" not in message
    assert "internal" not in message
    # Live mode never substitutes the fixture: no drop exists to mislabel.
    assert drop_count(backend) == 0


def test_live_timeout_returns_vision_unavailable_without_a_drop(tmp_path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("read timed out")

    client, backend = live_client(tmp_path, httpx.MockTransport(handler))
    response = upload(client, png_bytes("orange"))

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "vision_unavailable"
    assert "OpenRouter" in detail["message"]
    assert drop_count(backend) == 0
