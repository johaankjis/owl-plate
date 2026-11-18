"""Verify the exact OpenRouter wire shape and fail-closed behavior without any network."""

import base64
import json

import httpx
import pytest

from services.api.providers.openrouter import OpenRouterVision

API_KEY = "test-key-123"
MODEL = "google/gemini-3.8-flash"


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
    """Mimic a chat-completions JSON reply carrying one string content part."""
    return {"choices": [{"message": {"content": json.dumps(payload)}, "finish_reason": "stop"}]}


def recording_transport(requests: list[httpx.Request], responder) -> httpx.MockTransport:
    """Capture every request so tests can assert on the real wire format."""

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return responder(request)

    return httpx.MockTransport(handler)


def test_request_carries_data_url_bearer_model_and_strict_schema() -> None:
    requests: list[httpx.Request] = []
    transport = recording_transport(
        requests,
        lambda r: httpx.Response(200, json=envelope(estimate_payload("cheese pizza slices", 8))),
    )
    photo = b"\xff\xd8fake-jpeg-bytes"
    estimate, source = OpenRouterVision(API_KEY, MODEL, transport=transport).analyze(
        photo, "leftover"
    )

    assert len(requests) == 1
    request = requests[0]
    assert "key=" not in str(request.url)
    assert request.url.host == "openrouter.ai"
    assert request.url.path == "/api/v1/chat/completions"
    assert request.headers["Authorization"] == f"Bearer {API_KEY}"
    body = json.loads(request.content)
    assert body["model"] == MODEL
    assert body["temperature"] == 0
    prompt, image = body["messages"][0]["content"]
    assert "untrusted" in prompt["text"]
    assert "leftover" in prompt["text"]
    assert image["type"] == "image_url"
    assert image["image_url"]["url"] == f"data:image/jpeg;base64,{base64.b64encode(photo).decode()}"
    response_format = body["response_format"]
    assert response_format["type"] == "json_schema"
    assert response_format["json_schema"]["name"]
    assert response_format["json_schema"]["strict"] is True
    schema = response_format["json_schema"]["schema"]
    assert schema["additionalProperties"] is False
    assert schema["properties"]["items"]["items"]["additionalProperties"] is False
    assert schema["required"]
    assert source == "openrouter"
    assert estimate.items[0].name == "cheese pizza slices"


def test_two_photos_get_independent_estimates() -> None:
    """The provider must analyze each upload, not replay a cached or fixture result."""

    def responder(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        data_url = body["messages"][0]["content"][1]["image_url"]["url"]
        raw = base64.b64decode(data_url.removeprefix("data:image/jpeg;base64,"))
        if raw == b"photo-pizza":
            return httpx.Response(200, json=envelope(estimate_payload("cheese pizza slices", 8)))
        return httpx.Response(200, json=envelope(estimate_payload("vegan rice bowls", 5)))

    transport = httpx.MockTransport(responder)
    vision = OpenRouterVision(API_KEY, MODEL, transport=transport)
    first, first_source = vision.analyze(b"photo-pizza")
    second, second_source = vision.analyze(b"photo-salad")
    assert first_source == second_source == "openrouter"
    assert first.items[0].name == "cheese pizza slices"
    assert second.items[0].name == "vegan rice bowls"
    assert first.servings_estimate == 8
    assert second.servings_estimate == 5


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, json={"error": {"message": "internal http://internal-url secret"}}),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, json={"choices": [{"message": {"content": None}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]}),
        httpx.Response(
            200,
            json={"choices": [{"message": {"content": "I can not help with that."}}]},
        ),
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
        OpenRouterVision(API_KEY, MODEL, transport=transport).analyze(b"photo")
    message = str(exc_info.value)
    assert API_KEY not in message
    assert "openrouter.ai" not in message
    assert "internal-url" not in message
    assert "secret" not in message
    assert "OpenRouter" in message


def test_timeout_raises_sanitized_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("read timed out against https://internal-url")

    with pytest.raises(RuntimeError) as exc_info:
        OpenRouterVision(API_KEY, MODEL, transport=httpx.MockTransport(handler)).analyze(b"photo")
    message = str(exc_info.value)
    assert API_KEY not in message
    assert "https://" not in message
    assert "OpenRouter" in message


@pytest.mark.parametrize(
    "api_key, model",
    [("", MODEL), (API_KEY, ""), (API_KEY, "../bad model"), (API_KEY, "bad\nmodel")],
)
def test_missing_or_invalid_credentials_rejected(api_key: str, model: str) -> None:
    with pytest.raises(ValueError):
        OpenRouterVision(api_key, model)
