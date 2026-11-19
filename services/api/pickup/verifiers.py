"""Pickup-check providers: an offline fixture and the shared OpenRouter boundary."""

import os
from collections.abc import Sequence
from typing import Protocol, get_args

from services.api.pickup.contract import DEFAULT_PICKUP_MODEL, ListingItem, PickupAssessment
from services.api.providers.openrouter import OpenRouterPickupVerifier
from services.api.schemas.api import MatchStatus, PickupSource


class PickupVerifier(Protocol):
    """Swap live and offline checks without touching attempt or claim rules."""

    source: PickupSource

    def assess(self, photo: bytes, listing: Sequence[ListingItem]) -> PickupAssessment:
        """Compare an already validated, re-encoded photo with the published listing."""
        ...


class FixturePickupVerifier:
    """Clearly labeled simulated assessment for offline tests and rehearsal only."""

    source: PickupSource = "fixture"

    def __init__(self, status: MatchStatus = "consistent") -> None:
        if status not in get_args(MatchStatus):
            raise ValueError("PICKUP_FIXTURE_STATUS must be consistent, uncertain or inconsistent")
        self.status = status

    def assess(self, photo: bytes, listing: Sequence[ListingItem]) -> PickupAssessment:
        """Never claim the uploaded photo was analyzed; the verdict is configured, not seen."""
        return PickupAssessment(
            match_status=self.status,
            confidence=0.9 if self.status == "consistent" else 0.5,
            explanation=(
                "SIMULATED fixture assessment for offline rehearsal; this photo was not analyzed."
            ),
        )


def build_pickup_verifier() -> PickupVerifier | None:
    """Choose the pickup check from the same explicit provider settings as host vision.

    Fixture checks need both demo gates; the fixture status variable never reaches live
    OpenRouter. Without an OpenRouter key outside fixture mode, checks stay unavailable.
    """
    mode = os.getenv("VISION_PROVIDER", "fixture")
    if mode == "fixture":
        if os.getenv("DEMO_MODE", "false").lower() != "true" or os.getenv("AUTH_MODE") != "demo":
            raise ValueError("Fixture pickup checks require explicit demo mode and demo auth")
        return FixturePickupVerifier(os.getenv("PICKUP_FIXTURE_STATUS", "consistent").strip())
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.getenv("OPENROUTER_VISION_MODEL", "").strip() or DEFAULT_PICKUP_MODEL
    return OpenRouterPickupVerifier(api_key, model)
