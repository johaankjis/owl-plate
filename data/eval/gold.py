"""Gold-label loading and validation for the vision eval set.

A gold label is the truth for one photo: servings counted by hand and allergens
confirmed from the packaging or menu (docs/DATA.md section 4). A bad label
quietly corrupts the accuracy numbers we plan to put on a slide, so every field
is validated eagerly and provenance (source, labeled_by) is mandatory. The
format is specified in data/eval/README.md.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from estimate import ALLERGENS

GOLD_LABEL_SOURCES: tuple[str, ...] = ("human", "synthetic")

_SAMPLE_KEYS = ("sample_id", "photo", "labels")
_DOCUMENT_KEYS = ("samples", "synthetic", "notes")
_LABEL_KEYS = ("source", "servings", "allergens_present", "labeled_by", "items", "labeled_at")
_ITEM_KEYS = ("name", "portion_unit", "count")


class GoldError(ValueError):
    """Raised when a gold-label file does not match the documented format."""


@dataclass(frozen=True)
class GoldSample:
    """One labeled truth sample; the unit every metric counts over."""

    sample_id: str
    servings: int
    allergens: frozenset[str]
    source: str
    labeled_by: str
    photo: str | None = None
    items: tuple[dict[str, Any], ...] = ()
    labeled_at: str | None = None


def load_gold(path: str | Path) -> list[GoldSample]:
    """Load gold labels from a JSON file or a directory of per-sample files."""
    root = Path(path)
    if root.is_dir():
        files = sorted(root.glob("*.json"))
        if not files:
            raise GoldError(f"gold directory contains no .json files: {root}")
        samples: list[GoldSample] = []
        for file in files:
            samples.extend(_load_gold_file(file))
    elif root.is_file():
        samples = _load_gold_file(root)
    else:
        raise GoldError(f"gold path not found: {root}")
    _reject_duplicate_ids(samples)
    return samples


def _load_gold_file(file: Path) -> list[GoldSample]:
    try:
        doc = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise GoldError(f"cannot read gold file {file}: {exc}") from exc
    if not isinstance(doc, dict):
        raise GoldError(f"gold file {file}: expected a JSON object")
    if "samples" in doc:
        _check_keys(doc, _DOCUMENT_KEYS, str(file), required=("samples",))
        entries = doc["samples"]
        if not isinstance(entries, list):
            raise GoldError(f"gold file {file}: 'samples' must be a list")
        return [
            _validate_sample(raw, f"{file} samples[{index}]") for index, raw in enumerate(entries)
        ]
    if "sample_id" in doc:
        return [_validate_sample(doc, str(file))]
    raise GoldError(
        f"gold file {file}: expected a single sample object or a {{'samples': [...]}} document"
    )


def _validate_sample(raw: object, where: str) -> GoldSample:
    if not isinstance(raw, dict):
        raise GoldError(f"{where}: expected an object, got {type(raw).__name__}")
    _check_keys(raw, _SAMPLE_KEYS, where, required=("sample_id", "labels"))
    sample_id = _non_empty_str(raw["sample_id"], f"{where}.sample_id")
    photo = raw.get("photo")
    if photo is not None:
        photo = _non_empty_str(photo, f"{where}.photo")
    labels = raw["labels"]
    if not isinstance(labels, dict):
        raise GoldError(f"{where}.labels: expected an object")
    _check_keys(
        labels,
        _LABEL_KEYS,
        f"{where}.labels",
        required=("source", "servings", "allergens_present", "labeled_by"),
    )
    source = _non_empty_str(labels["source"], f"{where}.labels.source")
    if source not in GOLD_LABEL_SOURCES:
        raise GoldError(
            f"{where}.labels.source: expected one of {', '.join(GOLD_LABEL_SOURCES)}, "
            f"got {source!r}"
        )
    servings = labels["servings"]
    if isinstance(servings, bool) or not isinstance(servings, int):
        raise GoldError(
            f"{where}.labels.servings: expected an integer hand count, "
            f"got {type(servings).__name__}"
        )
    if servings < 0:
        raise GoldError(f"{where}.labels.servings: hand counts cannot be negative, got {servings}")
    allergens = _validated_allergens(
        labels["allergens_present"], f"{where}.labels.allergens_present"
    )
    labeled_by = _non_empty_str(labels["labeled_by"], f"{where}.labels.labeled_by")
    labeled_at = labels.get("labeled_at")
    if labeled_at is not None:
        labeled_at = _validated_timestamp(labeled_at, f"{where}.labels.labeled_at")
    items = labels.get("items")
    if items is not None:
        items = _validated_items(items, f"{where}.labels.items")
    return GoldSample(
        sample_id=sample_id,
        servings=servings,
        allergens=allergens,
        source=source,
        labeled_by=labeled_by,
        photo=photo,
        items=items or (),
        labeled_at=labeled_at,
    )


def _validated_allergens(raw: object, where: str) -> frozenset[str]:
    """Gold allergens must come from the fixed nine, each listed once.

    An invented value or a duplicate would silently distort recall and false
    positive counts, so both are hard errors instead of silent drops.
    """
    if not isinstance(raw, list):
        raise GoldError(f"{where}: expected a list, got {type(raw).__name__}")
    values: list[str] = []
    for index, value in enumerate(raw):
        if not isinstance(value, str) or value not in ALLERGENS:
            raise GoldError(
                f"{where}[{index}]: expected one of {', '.join(ALLERGENS)}, got {value!r}"
            )
        values.append(value)
    if len(set(values)) != len(values):
        raise GoldError(f"{where}: duplicate allergens are a labeling mistake; list each once")
    return frozenset(values)


def _validated_timestamp(raw: object, where: str) -> str:
    text = _non_empty_str(raw, where)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise GoldError(f"{where}: expected ISO 8601, got {text!r}") from exc
    if parsed.tzinfo is None:
        raise GoldError(f"{where}: timestamp must carry a timezone (UTC recommended)")
    return text


def _validated_items(raw: object, where: str) -> tuple[dict[str, Any], ...]:
    """Items are informational only, but structure is checked to catch typos."""
    if not isinstance(raw, list):
        raise GoldError(f"{where}: expected a list, got {type(raw).__name__}")
    items: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        item_where = f"{where}[{index}]"
        if not isinstance(item, dict):
            raise GoldError(f"{item_where}: expected an object")
        _check_keys(item, _ITEM_KEYS, item_where, required=("name",))
        _non_empty_str(item["name"], f"{item_where}.name")
        items.append(item)
    return tuple(items)


def _reject_duplicate_ids(samples: list[GoldSample]) -> None:
    seen: dict[str, int] = {}
    for sample in samples:
        seen[sample.sample_id] = seen.get(sample.sample_id, 0) + 1
    duplicates = sorted(sample_id for sample_id, count in seen.items() if count > 1)
    if duplicates:
        raise GoldError(f"duplicate sample_id(s) in gold labels: {', '.join(duplicates)}")


def _check_keys(
    obj: dict[str, Any],
    allowed: tuple[str, ...],
    where: str,
    required: tuple[str, ...] = (),
) -> None:
    actual = set(obj)
    unknown = sorted(actual - set(allowed))
    if unknown:
        raise GoldError(f"{where}: unknown key(s): {', '.join(unknown)}")
    missing = sorted(set(required) - actual)
    if missing:
        raise GoldError(f"{where}: missing required key(s): {', '.join(missing)}")


def _non_empty_str(raw: object, where: str) -> str:
    if not isinstance(raw, str) or not raw.strip():
        raise GoldError(f"{where}: expected a non-empty string, got {raw!r}")
    return raw
