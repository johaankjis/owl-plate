"""Gemini REST adapter with strict output validation and no credential logging."""

import base64
import re

import httpx

from services.api.schemas.api import VisionEstimate
from services.api.vision.contract import PROMPT, RESPONSE_SCHEMA
from services.api.vision.errors import VisionUnavailable


class GeminiVision:
    """Use an explicit configured model so demos never silently change providers."""

    def __init__(
        self, api_key: str, model: str, transport: httpx.BaseTransport | None = None
    ) -> None:
        """Bind credentials once; the optional transport lets tests mock HTTP without network."""
        if not api_key or not re.fullmatch(r"[A-Za-z0-9._-]+", model or ""):
            raise ValueError("Gemini key and explicit valid model are required")
        self._api_key = api_key
        self._model = model
        self._transport = transport

    def analyze(self, photo: bytes, host_note: str = "") -> tuple[VisionEstimate, str]:
        """Ask for an estimate; validation errors never become published food claims."""
        prompt = PROMPT.format(note=host_note[:1000])
        try:
            with httpx.Client(timeout=45, transport=self._transport) as client:
                response = client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent",
                    headers={"x-goog-api-key": self._api_key},
                    json={
                        "contents": [
                            {
                                "parts": [
                                    {"text": prompt},
                                    {
                                        "inline_data": {
                                            "mime_type": "image/jpeg",
                                            "data": base64.b64encode(photo).decode(),
                                        }
                                    },
                                ]
                            }
                        ],
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "responseSchema": RESPONSE_SCHEMA,
                            "temperature": 0,
                        },
                    },
                )
                response.raise_for_status()
                parts = response.json()["candidates"][0]["content"]["parts"]
                estimate = VisionEstimate.model_validate_json(
                    "".join(p.get("text", "") for p in parts)
                )
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            # Do not propagate httpx URLs, response bodies, image bytes or provider credentials.
            raise VisionUnavailable(
                "Live Gemini could not analyze this photo. No estimate was made; "
                "try again, or check the server's Gemini key and model."
            ) from None
        return estimate, "gemini"
