"""OpenRouter chat-completions adapter reusing the shared vision estimate contract."""

import base64
import re

import httpx

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


class OpenRouterVision:
    """Reach a Gemini model through OpenRouter so one key serves the live demo."""

    def __init__(
        self, api_key: str, model: str, transport: httpx.BaseTransport | None = None
    ) -> None:
        """Bind credentials once; the optional transport lets tests mock HTTP without network."""
        if not api_key or not re.fullmatch(r"[A-Za-z0-9._:/-]+", model or ""):
            raise ValueError("OpenRouter key and explicit valid model are required")
        self._api_key = api_key
        self._model = model
        self._transport = transport

    def analyze(self, photo: bytes, host_note: str = "") -> tuple[VisionEstimate, str]:
        """Ask for an estimate; validation errors never become published food claims."""
        prompt = PROMPT.format(note=host_note[:1000])
        data_url = f"data:image/jpeg;base64,{base64.b64encode(photo).decode()}"
        try:
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
                                "name": "food_estimate",
                                "strict": True,
                                "schema": _strict_schema(RESPONSE_SCHEMA),
                            },
                        },
                    },
                )
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
                estimate = VisionEstimate.model_validate_json(content)
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            # Do not propagate httpx URLs, response bodies, image bytes or provider credentials.
            raise VisionUnavailable(
                "Live Gemini via OpenRouter could not analyze this photo. No estimate was made."
            ) from None
        return estimate, "openrouter"
