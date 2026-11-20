"""Simulated CARE pantry referral and handoff; demonstration only, no external contact."""

from services.api.pantry.service import (
    PantryError,
    allocation,
    confirm_handoff,
    decide,
    destination,
    expire_with_drop,
    referral_for,
    referral_response,
    request,
    suggest_if_due,
)

__all__ = [
    "PantryError",
    "allocation",
    "confirm_handoff",
    "decide",
    "destination",
    "expire_with_drop",
    "referral_for",
    "referral_response",
    "request",
    "suggest_if_due",
]
