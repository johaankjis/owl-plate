"""Bound image input and apply conservative food-safety defaults at one boundary."""

import io
import os
from typing import Protocol

from PIL import Image, UnidentifiedImageError

from services.api.providers.gemini import GeminiVision
from services.api.schemas.api import VisionEstimate

ALLERGENS = ["dairy", "egg", "gluten", "peanut", "tree_nut", "soy", "fish", "shellfish", "sesame"]


class VisionProvider(Protocol):
    """Let rehearsal use the same route without network access."""

    def analyze(self, photo: bytes, host_note: str = "") -> tuple[VisionEstimate, str]:
        """Return a validated estimate and honest provenance."""
        ...


def validate_photo(photo: bytes) -> bytes:
    """Decode and re-encode food photos to strip metadata without storing uploads."""
    if not photo or len(photo) > 10 * 1024 * 1024:
        raise ValueError("Upload a JPEG or PNG smaller than 10 MiB")
    try:
        with Image.open(io.BytesIO(photo)) as image:
            if image.format not in {"JPEG", "PNG"} or image.width * image.height > 20_000_000:
                raise ValueError("Unsupported image format or dimensions")
            image.thumbnail((1024, 1024))
            output = io.BytesIO()
            image.convert("RGB").save(output, format="JPEG", quality=85)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValueError("Upload a valid JPEG or PNG") from None


class FixtureVision:
    """Return a clearly labeled synthetic tray estimate only in explicit demo mode."""

    def analyze(self, photo: bytes, host_note: str = "") -> tuple[VisionEstimate, str]:
        """Keep rehearsals reproducible; never claim this fixture analyzed the uploaded food."""
        return VisionEstimate(
            items=[{"name": "Demo pizza tray", "portion_unit": "slice", "count_estimate": 8}],
            servings_estimate=8,
            servings_low=6,
            servings_high=10,
            allergens_likely=["dairy", "gluten"],
            diet_tags=[],
            confidence=0.8,
            notes="SIMULATED cached estimate for rehearsal; not an analysis of this uploaded photo.",
        ), "fixture"


class SafeVision:
    """Apply the same conservative policy to every provider."""

    def __init__(self, provider: VisionProvider) -> None:
        self.provider = provider

    def analyze(self, photo: bytes, host_note: str = "") -> tuple[VisionEstimate, str]:
        """Strip religious claims and protect low-confidence estimates before host review."""
        photo = validate_photo(photo)
        estimate, source = self.provider.analyze(photo, host_note)
        data = estimate.model_dump()
        data["diet_tags"] = [tag for tag in estimate.diet_tags if tag in {"vegetarian", "vegan"}]
        if estimate.confidence < 0.6:
            data["allergens_likely"] = ALLERGENS
        return VisionEstimate.model_validate(data), source


def build_vision_provider() -> VisionProvider:
    """Fail closed when a live deployment accidentally selects synthetic vision."""
    mode = os.getenv("VISION_PROVIDER", "fixture")
    if mode == "fixture":
        if os.getenv("DEMO_MODE", "false").lower() != "true" or os.getenv("AUTH_MODE") != "demo":
            raise ValueError("Fixture vision requires explicit demo mode and demo auth")
        return SafeVision(FixtureVision())
    if mode == "gemini":
        return SafeVision(
            GeminiVision(os.getenv("GEMINI_API_KEY", ""), os.getenv("GEMINI_MODEL", ""))
        )
    raise ValueError("Unsupported VISION_PROVIDER")
