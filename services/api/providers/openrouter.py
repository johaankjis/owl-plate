"""OpenRouter chat-completions adapters sharing one HTTP, image and strict-schema boundary."""

import base64
import re
from collections.abc import Sequence

import httpx

from services.api.pickup.contract import RESPONSE_SCHEMA as PICKUP_SCHEMA
from services.api.pickup.contract import ListingItem, PickupAssessment, listing_prompt
from services.api.schemas.api import VisionEstimate
from services.api.vision.contract import PROMPT, RESPONSE_SCHEMA
from services.api.vision.errors import VisionUnavailable

_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"


def _strict_schema(schema: dict) -> dict:
    """Adapt the shared schema for OpenRouter strict mode: objects may add no fields."""

    def adapt(node: dict) -> dict:
        adapted = dict(node)
        if adapted.get("type") == "object":
            adapted["additionalProperties"] = False
        if isinstance(adapted.get("properties"), dict):
            adapted["properties"] = {
                key: adapt(value) for key, value in adapted["properties"].items()
            }
        if isinstance(adapted.get("items"), dict):
            adapted["items"] = adapt(adapted["items"])
        return adapted

    return adapt(schema)


class _OpenRouterClient:
    """Own the key, model and wire format so every OpenRouter use shares one boundary."""

    def __init__(
        self, api_key: str, model: str, transport: httpx.BaseTransport | None = None
    ) -> None:
        """Bind credentials once; the optional transport lets tests mock HTTP without network."""
        if not api_key or not re.fullmatch(r"[A-Za-z0-9._:/-]+", model or ""):
            raise ValueError("OpenRouter key and explicit valid model are required")
        self._api_key = api_key
        self._model = model
        self._transport = transport

    def _complete(self, prompt: str, photo: bytes, name: str, schema: dict) -> str:
        """Send one in-memory JPEG with a strict JSON schema and return the raw content.

        The data URL exists only in this request body; it is never logged or stored.
        """
        data_url = f"data:image/jpeg;base64,{base64.b64encode(photo).decode()}"
        with httpx.Client(timeout=45, transport=self._transport) as client:
            response = client.post(
                _COMPLETIONS_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": self._model,
                    "temperature": 0,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {"type": "image_url", "image_url": {"url": data_url}},
                            ],
                        }
                    ],
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": name,
                            "strict": True,
                            "schema": _strict_schema(schema),
                        },
                    },
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]


class OpenRouterVision(_OpenRouterClient):
    """Reach a Gemini model through OpenRouter so one key serves the live demo."""

    def analyze(self, photo: bytes, host_note: str = "") -> tuple[VisionEstimate, str]:
        """Ask for an estimate; validation errors never become published food claims."""
        try:
            content = self._complete(
                PROMPT.format(note=host_note[:1000]), photo, "food_estimate", RESPONSE_SCHEMA
            )
            estimate = VisionEstimate.model_validate_json(content)
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            # Do not propagate httpx URLs, response bodies, image bytes or provider credentials.
            raise VisionUnavailable(
                "Live Gemini via OpenRouter could not analyze this photo. No estimate was made."
            ) from None
        return estimate, "openrouter"


class OpenRouterPickupVerifier(_OpenRouterClient):
    """Compare a student's food photo with the host-reviewed listing via the same key."""

    source = "openrouter"

    def assess(self, photo: bytes, listing: Sequence[ListingItem]) -> PickupAssessment:
        """Return a validated assessment or fail closed; there is never a fallback verdict."""
        try:
            content = self._complete(listing_prompt(listing), photo, "pickup_check", PICKUP_SCHEMA)
            return PickupAssessment.model_validate_json(content)
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            # Same sanitizing rule as estimates: no URLs, bodies, image bytes or credentials.
            raise VisionUnavailable(
                "The photo check is unavailable right now. No result was made."
            ) from None
