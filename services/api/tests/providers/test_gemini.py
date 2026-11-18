"""Verify the exact Gemini wire shape and fail-closed behavior without any network."""

import base64
import json

import httpx
import pytest

from services.api.providers.gemini import GeminiVision

API_KEY = "test-key-123"
MODEL = "gemini-3.8-flash"


def estimate_payload(name: str, servings: int) -> dict:
    """Build the one valid estimate shape the provider must accept."""
    return {
        "items": [{"name": name, "portion_unit": "slice", "count_estimate": servings}],
        "servings_estimate": servings,
        "servings_low": max(1, servings - 2),
        "servings_high": servings + 2,
        "allergens_likely": ["dairy", "gluten"],
        "diet_tags": ["vegetarian"],
        "confidence": 0.9,
        "notes": f"{name} on a tray",
    }


def envelope(payload: dict) -> dict:
    """Mimic a generateContent JSON reply carrying one text part."""
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]}


def recording_transport(requests: list[httpx.Request], responder) -> httpx.MockTransport:
    """Capture every request so tests can assert on the real wire format."""

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return responder(request)

    return httpx.MockTransport(handler)


def test_request_carries_image_bytes_and_key_header() -> None:
    requests: list[httpx.Request] = []
    transport = recording_transport(
        requests,
        lambda r: httpx.Response(200, json=envelope(estimate_payload("cheese pizza slices", 8))),
    )
    photo = b"\xff\xd8fake-jpeg-bytes"
    estimate, source = GeminiVision(API_KEY, MODEL, transport=transport).analyze(photo, "leftover")

    assert len(requests) == 1
    request = requests[0]
    assert "key=" not in str(request.url)
    assert request.headers["x-goog-api-key"] == API_KEY
    assert request.url.path == f"/v1beta/models/{MODEL}:generateContent"
    body = json.loads(request.content)
    prompt, image = body["contents"][0]["parts"]
    assert image["inline_data"]["mime_type"] == "image/jpeg"
    assert image["inline_data"]["data"] == base64.b64encode(photo).decode()
    assert "untrusted" in prompt["text"]
    assert "leftover" in prompt["text"]
    config = body["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert config["responseSchema"]["required"]
    assert source == "gemini"
    assert estimate.items[0].name == "cheese pizza slices"


def test_two_photos_get_independent_estimates() -> None:
    """The provider must analyze each upload, not replay a cached or fixture result."""

    def responder(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        data = body["contents"][0]["parts"][1]["inline_data"]["data"]
        raw = base64.b64decode(data)
        if raw == b"photo-pizza":
            return httpx.Response(200, json=envelope(estimate_payload("cheese pizza slices", 8)))
        return httpx.Response(200, json=envelope(estimate_payload("vegan rice bowls", 5)))

    transport = httpx.MockTransport(responder)
    vision = GeminiVision(API_KEY, MODEL, transport=transport)
    first, first_source = vision.analyze(b"photo-pizza")
    second, second_source = vision.analyze(b"photo-salad")
    assert first_source == second_source == "gemini"
    assert first.items[0].name == "cheese pizza slices"
    assert second.items[0].name == "vegan rice bowls"
    assert first.servings_estimate == 8
    assert second.servings_estimate == 5


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, json={"error": {"message": "internal http://internal-url secret"}}),
        httpx.Response(200, json={"candidates": []}),
        httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}),
        httpx.Response(200, json={"candidates": [{"content": {"parts": []}}]}),
        httpx.Response(
            200,
            json=envelope({**estimate_payload("cheese pizza slices", 8), "servings_low": 99}),
        ),
        httpx.Response(
            200, json=envelope({**estimate_payload("cheese pizza slices", 8), "confidence": 5})
        ),
    ],
)
def test_bad_replies_raise_sanitized_error(response: httpx.Response) -> None:
    transport = recording_transport([], lambda r: response)
    with pytest.raises(RuntimeError) as exc_info:
        GeminiVision(API_KEY, MODEL, transport=transport).analyze(b"photo")
    message = str(exc_info.value)
    assert API_KEY not in message
    assert "generativelanguage" not in message
    assert "internal-url" not in message
    assert "secret" not in message


def test_timeout_raises_sanitized_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("read timed out against https://internal-url")

    with pytest.raises(RuntimeError) as exc_info:
        GeminiVision(API_KEY, MODEL, transport=httpx.MockTransport(handler)).analyze(b"photo")
    message = str(exc_info.value)
    assert API_KEY not in message
    assert "https://" not in message


@pytest.mark.parametrize("api_key, model", [("", MODEL), (API_KEY, ""), (API_KEY, "../bad model")])
def test_missing_or_invalid_credentials_rejected(api_key: str, model: str) -> None:
    with pytest.raises(ValueError):
        GeminiVision(api_key, model)
