"""Mirror of the frozen VisionEstimate contract for the eval harness.

docs/API_CONTRACT.md freezes ``services/api/schemas/api.py::VisionEstimate``
for eval and adapters. The API validates with Pydantic, but the eval harness
must run on the standard library alone, so this module re-implements the same
constraints. If the schema file ever changes, this mirror must change in the
same commit; ``tests/test_estimate.py`` fails when the two drift apart.
"""

from __future__ import annotations

from typing import Any

ALLERGENS: tuple[str, ...] = (
    "dairy",
    "egg",
    "gluten",
    "peanut",
    "tree_nut",
    "soy",
    "fish",
    "shellfish",
    "sesame",
)
"""The nine allergens Owl Plate tracks, in canonical display order."""

DIETS: tuple[str, ...] = ("vegetarian", "vegan", "halal", "kosher", "pork_free")

_MIN_ITEMS, _MAX_ITEMS = 1, 30
_MIN_SERVINGS, _MAX_SERVINGS = 1, 500
_MAX_COUNT = 1000
_MAX_NAME, _MAX_UNIT, _MAX_NOTES = 100, 40, 1000
_VISION_KEYS = (
    "items",
    "servings_estimate",
    "servings_low",
    "servings_high",
    "allergens_likely",
    "diet_tags",
    "confidence",
    "notes",
)
_FOOD_ITEM_KEYS = ("name", "portion_unit", "count_estimate")


class ShapeError(ValueError):
    """Raised when a prediction does not match the frozen VisionEstimate shape."""


def validate_vision_estimate(data: object, where: str = "vision estimate") -> dict[str, Any]:
    """Validate data against the frozen VisionEstimate contract and return it.

    The harness scores whatever it is given, so a prediction that drifts from
    the frozen shape must fail loudly here instead of producing numbers the
    product could never produce.
    """
    vision = _require_dict(data, where)
    _require_keys(vision, _VISION_KEYS, where)
    items = _require_list(vision["items"], f"{where}.items")
    if not _MIN_ITEMS <= len(items) <= _MAX_ITEMS:
        raise ShapeError(
            f"{where}.items: expected between {_MIN_ITEMS} and {_MAX_ITEMS} items, got {len(items)}"
        )
    for index, item in enumerate(items):
        _validate_food_item(item, f"{where}.items[{index}]")
    estimate = _require_int(
        vision["servings_estimate"], f"{where}.servings_estimate", _MIN_SERVINGS, _MAX_SERVINGS
    )
    low = _require_int(
        vision["servings_low"], f"{where}.servings_low", _MIN_SERVINGS, _MAX_SERVINGS
    )
    high = _require_int(
        vision["servings_high"], f"{where}.servings_high", _MIN_SERVINGS, _MAX_SERVINGS
    )
    if not low <= estimate <= high:
        raise ShapeError(f"{where}: servings_estimate must lie within servings_low..servings_high")
    _require_enum_list(vision["allergens_likely"], ALLERGENS, f"{where}.allergens_likely")
    _require_enum_list(vision["diet_tags"], DIETS, f"{where}.diet_tags")
    _require_number(vision["confidence"], f"{where}.confidence", 0.0, 1.0)
    _require_str(vision["notes"], f"{where}.notes", _MAX_NOTES)
    return vision


def _require_dict(data: object, where: str) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ShapeError(f"{where}: expected an object, got {type(data).__name__}")
    return data


def _require_keys(obj: dict[str, Any], keys: tuple[str, ...], where: str) -> None:
    expected = set(keys)
    actual = set(obj)
    missing = sorted(expected - actual)
    unknown = sorted(actual - expected)
    if missing:
        raise ShapeError(f"{where}: missing required key(s): {', '.join(missing)}")
    if unknown:
        raise ShapeError(
            f"{where}: unknown key(s): {', '.join(unknown)} "
            "(extra fields are forbidden by the frozen contract)"
        )


def _require_list(data: object, where: str) -> list[Any]:
    if not isinstance(data, list):
        raise ShapeError(f"{where}: expected a list, got {type(data).__name__}")
    return data


def _validate_food_item(item: object, where: str) -> None:
    obj = _require_dict(item, where)
    _require_keys(obj, _FOOD_ITEM_KEYS, where)
    _require_str(obj["name"], f"{where}.name", _MAX_NAME, min_len=1)
    _require_str(obj["portion_unit"], f"{where}.portion_unit", _MAX_UNIT, min_len=1)
    _require_int(obj["count_estimate"], f"{where}.count_estimate", 0, _MAX_COUNT)


def _require_str(data: object, where: str, max_len: int, min_len: int = 0) -> str:
    if not isinstance(data, str):
        raise ShapeError(f"{where}: expected a string, got {type(data).__name__}")
    if not min_len <= len(data) <= max_len:
        raise ShapeError(
            f"{where}: length must be between {min_len} and {max_len}, got {len(data)}"
        )
    return data


def _require_int(data: object, where: str, low: int, high: int) -> int:
    if isinstance(data, bool) or not isinstance(data, int):
        raise ShapeError(f"{where}: expected an integer, got {type(data).__name__}")
    if not low <= data <= high:
        raise ShapeError(f"{where}: expected an integer between {low} and {high}, got {data}")
    return data


def _require_number(data: object, where: str, low: float, high: float) -> float:
    if isinstance(data, bool) or not isinstance(data, (int, float)):
        raise ShapeError(f"{where}: expected a number, got {type(data).__name__}")
    value = float(data)
    if not low <= value <= high:
        raise ShapeError(f"{where}: expected a number between {low} and {high}, got {data}")
    return value


def _require_enum_list(data: object, allowed: tuple[str, ...], where: str) -> None:
    values = _require_list(data, where)
    for index, value in enumerate(values):
        if not isinstance(value, str) or value not in allowed:
            raise ShapeError(
                f"{where}[{index}]: expected one of {', '.join(allowed)}, got {value!r}"
            )
