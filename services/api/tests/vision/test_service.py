"""Protect safety defaults and honest fixture provenance before route integration."""

import io

import pytest
from PIL import Image

from services.api.vision.service import (
    FixtureVision,
    SafeVision,
    build_vision_provider,
    validate_photo,
)


def image_bytes() -> bytes:
    """Supply synthetic pixels without pretending they are a labeled food photo."""
    buffer = io.BytesIO()
    Image.new("RGB", (20, 20), "orange").save(buffer, "PNG")
    return buffer.getvalue()


def test_fixture_requires_explicit_demo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VISION_PROVIDER", "fixture")
    monkeypatch.setenv("DEMO_MODE", "false")
    with pytest.raises(ValueError):
        build_vision_provider()


def test_invalid_photo_rejected() -> None:
    with pytest.raises(ValueError):
        validate_photo(b"not an image")


def test_low_confidence_is_conservative_and_religious_tags_removed() -> None:
    class Uncertain(FixtureVision):
        def analyze(self, photo: bytes, host_note: str = "") -> tuple:
            estimate, source = super().analyze(photo, host_note)
            return estimate.model_copy(update={"confidence": 0.2, "diet_tags": ["halal"]}), source

    estimate, source = SafeVision(Uncertain()).analyze(image_bytes())
    assert len(estimate.allergens_likely) == 9
    assert estimate.diet_tags == []
    assert source == "fixture"


def test_fixture_source_and_note_are_honest() -> None:
    estimate, source = SafeVision(FixtureVision()).analyze(image_bytes())
    assert source == "fixture"
    assert "not an analysis" in estimate.notes


def test_gemini_mode_requires_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VISION_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.8-flash")
    with pytest.raises(ValueError):
        build_vision_provider()


def test_gemini_mode_builds_safe_gemini_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    from services.api.providers.gemini import GeminiVision

    monkeypatch.setenv("VISION_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.8-flash")
    provider = build_vision_provider()
    assert isinstance(provider, SafeVision)
    assert isinstance(provider.provider, GeminiVision)
