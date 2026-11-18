"""Opt-in live Gemini adapter for the eval harness (standard library only).

--live is the only code path that touches the network. Credentials come from
GEMINI_API_KEY / GEMINI_MODEL in the environment or the repo .env file and are
never printed, logged, or written into saved files; error messages only name
missing variables. Gemini is asked for the frozen VisionEstimate shape with a
strict response schema, and the answer is re-validated locally because the wire
format is not the contract.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import urllib.error
import urllib.request
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import estimate
from estimate import ShapeError, validate_vision_estimate

REPO_ROOT = Path(__file__).resolve().parents[2]
GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
REQUEST_TIMEOUT_SECONDS = 60.0
MAX_PHOTO_BYTES = 10 * 1024 * 1024  # matches the API contract upload cap
MIN_CONFIDENCE_ALL_ALLERGENS = 0.6  # API_CONTRACT.md: confidence < 0.6 adds all nine
PHOTO_MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

PROMPT = """You are the vision step of a campus app that shares leftover event food
with students. Look at the photo of leftover food and estimate:
- items: each distinct food with a short lowercase name, its portion unit
  (slice, wrap, cookie, cup, piece, ...) and how many are visible.
- servings_estimate: how many individual servings students could take from
  this food. One serving is one reasonable portion of one item.
- servings_low and servings_high: an honest range that must contain
  servings_estimate.
- allergens_likely: only values from dairy, egg, gluten, peanut, tree_nut,
  soy, fish, shellfish, sesame. Flag an allergen when the visible food
  typically contains it; when unsure, include it.
- diet_tags: vegetarian or vegan only, and only when clear from the photo.
  Never output halal, kosher or pork_free: a photo cannot prove them.
- confidence: how sure you are, between 0 and 1.
- notes: one short sentence for the host.
Respond with JSON only, matching the response schema exactly."""

# The wire schema mirrors the frozen VisionEstimate, except diet_tags is
# restricted to vegetarian/vegan: docs/API_CONTRACT.md says vision cannot
# assert halal/kosher/pork_free, so the adapter never lets the model say one.
RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "name": {"type": "STRING"},
                    "portion_unit": {"type": "STRING"},
                    "count_estimate": {"type": "INTEGER"},
                },
                "required": ["name", "portion_unit", "count_estimate"],
            },
        },
        "servings_estimate": {"type": "INTEGER"},
        "servings_low": {"type": "INTEGER"},
        "servings_high": {"type": "INTEGER"},
        "allergens_likely": {
            "type": "ARRAY",
            "items": {"type": "STRING", "enum": list(estimate.ALLERGENS)},
        },
        "diet_tags": {
            "type": "ARRAY",
            "items": {"type": "STRING", "enum": ["vegetarian", "vegan"]},
        },
        "confidence": {"type": "NUMBER"},
        "notes": {"type": "STRING"},
    },
    "required": [
        "items",
        "servings_estimate",
        "servings_low",
        "servings_high",
        "allergens_likely",
        "diet_tags",
        "confidence",
        "notes",
    ],
}


class LiveConfigError(RuntimeError):
    """Raised when live mode is requested without usable credentials."""


class GeminiError(RuntimeError):
    """Raised when Gemini does not return a usable estimate."""


@dataclass(frozen=True)
class LiveRequest:
    """One sample to estimate: its gold id and a local photo path."""

    sample_id: str
    photo_path: Path


@dataclass(frozen=True)
class LiveResult:
    """Either a validated estimate or a per-sample failure reason."""

    sample_id: str
    vision: dict[str, Any] | None
    error: str | None
    low_confidence_inflated: bool = False


def load_env_file(
    path: Path = REPO_ROOT / ".env",
    environ: dict[str, str] | None = None,
) -> list[str]:
    """Load KEY=VALUE lines from .env without overriding existing values.

    Real environment variables win, mirroring python-dotenv behavior in the
    API. Returns the loaded key names so callers can log names, never values.
    """
    target = os.environ if environ is None else environ
    if not path.is_file():
        return []
    loaded: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in target:
            target[key] = value
            loaded.append(key)
    return loaded


def require_live_env(
    environ: dict[str, str] | None = None,
    env_file: Path | None = None,
) -> tuple[str, str]:
    """Return (api_key, model) for live mode or raise with a safe message.

    The values only ever travel to the caller; error messages name the missing
    variables and never echo anything that may be set.
    """
    path = REPO_ROOT / ".env" if env_file is None else env_file
    load_env_file(path, environ=environ)
    source = os.environ if environ is None else environ
    api_key = (source.get("GEMINI_API_KEY") or "").strip()
    model = (source.get("GEMINI_MODEL") or "").strip()
    missing = [
        name for name, value in (("GEMINI_API_KEY", api_key), ("GEMINI_MODEL", model)) if not value
    ]
    if missing:
        raise LiveConfigError(
            "live mode needs "
            + " and ".join(missing)
            + f" (export them or put them in {REPO_ROOT / '.env'}; never commit them)"
        )
    return api_key, model


def read_photo(photo_path: Path) -> tuple[bytes, str]:
    """Read a photo within the contract's size cap and return (bytes, mime)."""
    mime = PHOTO_MIME_TYPES.get(photo_path.suffix.lower())
    if mime is None:
        raise GeminiError(f"unsupported photo type {photo_path.suffix!r} (use jpeg, png or webp)")
    size = photo_path.stat().st_size
    if size > MAX_PHOTO_BYTES:
        raise GeminiError(f"photo is {size} bytes, over the {MAX_PHOTO_BYTES} byte cap")
    return photo_path.read_bytes(), mime


def build_request_body(prompt: str, image_bytes: bytes, mime_type: str) -> dict[str, Any]:
    """Build a generateContent body asking for the frozen estimate shape."""
    return {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(image_bytes).decode("ascii"),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "response_mime_type": "application/json",
            "response_schema": RESPONSE_SCHEMA,
        },
    }


def call_gemini(
    api_key: str,
    model: str,
    body: dict[str, Any],
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """POST one generateContent request; the key goes in a header, never the URL."""
    url = GEMINI_URL_TEMPLATE.format(model=model)
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise GeminiError(f"Gemini API returned HTTP {exc.code}: {_error_detail(exc)}") from exc
    except urllib.error.URLError as exc:
        raise GeminiError(f"could not reach the Gemini API: {exc.reason}") from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise GeminiError("Gemini API returned a response that is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise GeminiError("Gemini API returned an unexpected response shape")
    return payload


def parse_generate_content_response(payload: dict[str, Any]) -> dict[str, Any]:
    """Pull the model's JSON object out of a generateContent response."""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        feedback = payload.get("promptFeedback")
        blocked = feedback.get("blockReason") if isinstance(feedback, dict) else None
        reason = f" (blockReason: {blocked})" if blocked else ""
        raise GeminiError(f"Gemini returned no candidates{reason}")
    first = candidates[0]
    content = first.get("content")
    parts = content.get("parts", []) if isinstance(content, dict) else []
    text = "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
    if not text:
        finish = first.get("finishReason")
        raise GeminiError(f"Gemini returned no text (finishReason: {finish})")
    try:
        vision = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GeminiError("Gemini returned text that is not valid JSON") from exc
    if not isinstance(vision, dict):
        raise GeminiError("Gemini returned JSON that is not an object")
    return vision


def apply_low_confidence_safety(vision: dict[str, Any]) -> bool:
    """Apply the contract safety rule: low confidence flags all nine allergens.

    docs/API_CONTRACT.md: "Confidence < 0.6 adds all nine common allergens."
    Scoring the same estimate a host would see keeps live numbers honest about
    product behavior. Returns True when the rule fired; vision is modified in
    place.
    """
    confidence = vision.get("confidence")
    if (
        isinstance(confidence, (int, float))
        and not isinstance(confidence, bool)
        and float(confidence) < MIN_CONFIDENCE_ALL_ALLERGENS
    ):
        vision["allergens_likely"] = list(estimate.ALLERGENS)
        return True
    return False


def live_estimates(
    requests: Sequence[LiveRequest],
    api_key: str,
    model: str,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
    log: logging.Logger | None = None,
) -> list[LiveResult]:
    """Estimate every requested sample, isolating failures per sample.

    One unreachable photo or malformed answer must not sink the whole run:
    each sample gets its own result and failures become report lines instead
    of a lost eval.
    """
    log = log or logging.getLogger(__name__)
    results: list[LiveResult] = []
    for request in requests:
        log.info("live Gemini: estimating %s (%s)", request.sample_id, request.photo_path.name)
        try:
            image_bytes, mime_type = read_photo(request.photo_path)
            body = build_request_body(PROMPT, image_bytes, mime_type)
            payload = call_gemini(api_key, model, body, timeout=timeout)
            vision = validate_vision_estimate(
                parse_generate_content_response(payload),
                f"live estimate for {request.sample_id}",
            )
            inflated = apply_low_confidence_safety(vision)
            results.append(LiveResult(request.sample_id, vision, None, inflated))
        except (GeminiError, ShapeError, OSError) as exc:
            results.append(LiveResult(request.sample_id, None, str(exc), False))
    return results


def _error_detail(exc: urllib.error.HTTPError) -> str:
    """Extract a short, useful message from an error body (contains no secrets)."""
    try:
        doc = json.loads(exc.read().decode("utf-8"))
        message = doc["error"]["message"]
    except (OSError, ValueError, KeyError, TypeError):
        return "no detail available"
    return str(message)[:300]
