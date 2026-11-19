"""Pickup model boundary: OpenRouter wire shape, strict parsing, fixture gates, threshold."""

import base64
import json

import httpx
import pytest

from services.api.pickup.contract import ListingItem, PickupAssessment, normalize
from services.api.pickup.verifiers import FixturePickupVerifier, build_pickup_verifier
from services.api.providers.openrouter import OpenRouterPickupVerifier
from services.api.vision.errors import VisionUnavailable

LISTING = [ListingItem(name="Cheese pizza slices", portion_unit="slice")]
PHOTO = b"\xff\xd8synthetic-jpeg"


def reply(content) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        reply.requests.append(request)
        text = content if isinstance(content, str) else json.dumps(content)
        return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})

    reply.requests = []
    return httpx.MockTransport(handler)


def test_openrouter_pickup_request_shape_and_listing_only_prompt():
    transport = reply({"match_status": "consistent", "confidence": 0.91, "explanation": "Pizza."})
    verifier = OpenRouterPickupVerifier("key", "google/gemini-3.8-flash", transport=transport)
    assert verifier.source == "openrouter"
    result = verifier.assess(PHOTO, LISTING)
    assert result.match_status == "consistent" and result.confidence == 0.91
    (request,) = reply.requests
    assert request.url.host == "openrouter.ai" and request.headers["Authorization"] == "Bearer key"
    body = json.loads(request.content)
    assert body["model"] == "google/gemini-3.8-flash" and body["temperature"] == 0
    prompt, image = body["messages"][0]["content"]
    assert "untrusted" in prompt["text"] and "Cheese pizza slices" in prompt["text"]
    assert "food safety" in prompt["text"] and "physically" in prompt["text"]
    assert image["image_url"]["url"] == f"data:image/jpeg;base64,{base64.b64encode(PHOTO).decode()}"
    schema = body["response_format"]["json_schema"]
    assert schema["name"] == "pickup_check" and schema["strict"] is True
    assert schema["schema"]["additionalProperties"] is False
    assert schema["schema"]["required"] == ["match_status", "confidence", "explanation"]


@pytest.mark.parametrize(
    "content",
    [
        "not json",
        {"match_status": "consistent", "confidence": 1.5, "explanation": "x"},
        {"match_status": "match", "confidence": 0.9, "explanation": "x"},
        {"match_status": "consistent", "confidence": 0.9, "explanation": "x" * 501},
        {"match_status": "consistent", "confidence": 0.9, "explanation": "x", "safe": True},
        '{"match_status": "consistent", "confidence": NaN, "explanation": "x"}',
    ],
)
def test_openrouter_pickup_malformed_output_fails_closed(content):
    verifier = OpenRouterPickupVerifier("key", "m", transport=reply(content))
    with pytest.raises(VisionUnavailable) as failure:
        verifier.assess(PHOTO, LISTING)
    assert "key" not in str(failure.value) and "openrouter.ai" not in str(failure.value)


def test_openrouter_pickup_http_error_fails_closed_without_body():
    transport = httpx.MockTransport(lambda r: httpx.Response(500, text="secret upstream body"))
    with pytest.raises(VisionUnavailable) as failure:
        OpenRouterPickupVerifier("key", "m", transport=transport).assess(PHOTO, LISTING)
    assert "secret" not in str(failure.value)


def test_threshold_is_conservative_at_the_boundary():
    def assessed(status, confidence):
        return normalize(
            PickupAssessment(match_status=status, confidence=confidence, explanation="x")
        ).match_status

    assert assessed("consistent", 0.8) == "consistent"
    assert assessed("consistent", 0.7999) == "uncertain"
    assert assessed("inconsistent", 0.1) == "inconsistent"


def test_fixture_is_labeled_and_status_controlled():
    result = FixturePickupVerifier("inconsistent").assess(PHOTO, LISTING)
    assert result.match_status == "inconsistent" and "SIMULATED" in result.explanation
    with pytest.raises(ValueError):
        FixturePickupVerifier("maybe")


@pytest.fixture
def env(monkeypatch):
    for key in ("OPENROUTER_API_KEY", "OPENROUTER_VISION_MODEL", "PICKUP_FIXTURE_STATUS"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("AUTH_MODE", "demo")
    return monkeypatch


def test_builder_gates_fixture_and_never_lets_fixture_status_touch_openrouter(env):
    env.setenv("VISION_PROVIDER", "fixture")
    env.setenv("PICKUP_FIXTURE_STATUS", "uncertain")
    assert build_pickup_verifier().assess(PHOTO, LISTING).match_status == "uncertain"
    env.setenv("PICKUP_FIXTURE_STATUS", "bogus")
    with pytest.raises(ValueError):
        build_pickup_verifier()
    env.setenv("AUTH_MODE", "entra")
    with pytest.raises(ValueError, match="demo"):
        build_pickup_verifier()

    env.setenv("VISION_PROVIDER", "openrouter")
    assert build_pickup_verifier() is None, "no key: unavailable, never a fixture fallback"
    env.setenv("OPENROUTER_API_KEY", "synthetic")
    verifier = build_pickup_verifier()
    assert isinstance(verifier, OpenRouterPickupVerifier)
    assert verifier._model == "google/gemini-3.8-flash"
    env.setenv("OPENROUTER_VISION_MODEL", "google/other-model")
    assert build_pickup_verifier()._model == "google/other-model"
