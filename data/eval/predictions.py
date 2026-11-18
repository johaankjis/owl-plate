"""Predictions-file loading and validation for the eval harness.

Predictions arrive as a JSON document so a live Gemini run can be captured once
(--save-predictions) and re-scored offline, and so the API's vision module can
hand us estimates without any code coupling. The source metadata is preserved
and printed in every report: a fixture run must never be presented as live
model output (docs/API_CONTRACT.md, "never silently label fixture output live
Gemini").
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from estimate import ShapeError, validate_vision_estimate

PREDICTION_SOURCES: tuple[str, ...] = ("fixture", "gemini", "external")

_FILE_KEYS = ("source", "model", "synthetic", "generated_at", "predictions")
_ENTRY_KEYS = ("sample_id", "vision", "low_confidence_inflated")


class PredictionsError(ValueError):
    """Raised when a predictions file does not match the documented format."""


@dataclass(frozen=True)
class Prediction:
    """One VisionEstimate prediction, tied to a gold sample_id."""

    sample_id: str
    vision: dict[str, Any]
    low_confidence_inflated: bool = False


@dataclass(frozen=True)
class PredictionsFile:
    """Predictions plus the provenance labels every report must display."""

    source: str
    model: str | None
    synthetic: bool | None
    generated_at: str | None
    entries: tuple[Prediction, ...]


def load_predictions(path: str | Path) -> PredictionsFile:
    """Load and validate a predictions file from disk."""
    file = Path(path)
    try:
        doc = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PredictionsError(f"cannot read predictions file {file}: {exc}") from exc
    return parse_predictions(doc, str(file))


def parse_predictions(doc: object, where: str = "predictions") -> PredictionsFile:
    """Validate a predictions document and return entries with their labels."""
    if not isinstance(doc, dict):
        raise PredictionsError(f"{where}: expected a JSON object")
    _check_keys(doc, _FILE_KEYS, where, required=("predictions",))
    source = doc.get("source", "external")
    if source not in PREDICTION_SOURCES:
        raise PredictionsError(
            f"{where}.source: expected one of {', '.join(PREDICTION_SOURCES)}, got {source!r}"
        )
    model = doc.get("model")
    if model is not None and (not isinstance(model, str) or not model.strip()):
        raise PredictionsError(f"{where}.model: expected a non-empty string when present")
    synthetic = doc.get("synthetic")
    if synthetic is not None and not isinstance(synthetic, bool):
        raise PredictionsError(f"{where}.synthetic: expected true or false when present")
    generated_at = doc.get("generated_at")
    if generated_at is not None and (not isinstance(generated_at, str) or not generated_at.strip()):
        raise PredictionsError(f"{where}.generated_at: expected a non-empty string when present")
    raw_entries = doc["predictions"]
    if not isinstance(raw_entries, list):
        raise PredictionsError(f"{where}.predictions: expected a list")
    entries = [
        _parse_entry(raw, f"{where}.predictions[{index}]") for index, raw in enumerate(raw_entries)
    ]
    ids = [entry.sample_id for entry in entries]
    duplicates = sorted({sample_id for sample_id in ids if ids.count(sample_id) > 1})
    if duplicates:
        raise PredictionsError(
            f"{where}: duplicate prediction sample_id(s): {', '.join(duplicates)}"
        )
    return PredictionsFile(
        source=source,
        model=model,
        synthetic=synthetic,
        generated_at=generated_at,
        entries=tuple(entries),
    )


def _parse_entry(raw: object, where: str) -> Prediction:
    if not isinstance(raw, dict):
        raise PredictionsError(f"{where}: expected an object")
    _check_keys(raw, _ENTRY_KEYS, where, required=("sample_id", "vision"))
    sample_id = raw["sample_id"]
    if not isinstance(sample_id, str) or not sample_id.strip():
        raise PredictionsError(f"{where}.sample_id: expected a non-empty string")
    try:
        vision = validate_vision_estimate(raw["vision"], f"{where}.vision")
    except ShapeError as exc:
        raise PredictionsError(str(exc)) from exc
    inflated = raw.get("low_confidence_inflated", False)
    if not isinstance(inflated, bool):
        raise PredictionsError(f"{where}.low_confidence_inflated: expected true or false")
    return Prediction(sample_id=sample_id, vision=vision, low_confidence_inflated=inflated)


def _check_keys(
    obj: dict[str, Any],
    allowed: tuple[str, ...],
    where: str,
    required: tuple[str, ...] = (),
) -> None:
    actual = set(obj)
    unknown = sorted(actual - set(allowed))
    if unknown:
        raise PredictionsError(f"{where}: unknown key(s): {', '.join(unknown)}")
    missing = sorted(set(required) - actual)
    if missing:
        raise PredictionsError(f"{where}: missing required key(s): {', '.join(missing)}")
