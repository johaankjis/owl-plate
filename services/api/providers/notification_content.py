"""Lock-screen wording for student alerts, built only from the published listing.

Pure and import-light so it can be tested without a database or network. The text
names the host-reviewed food, how many servings are available when the alert is
sent, and the pickup place. It never carries a student, diet, allergen, priority
or credential detail: lock screens are visible to anyone nearby.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass

MAX_ITEM_NAME = 28
MAX_LOCATION = 60
_CONTROL = re.compile(r"[\x00-\x1f\x7f\u200b-\u200f\u2028-\u202e\u2066-\u2069]")
_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)+$")

# First match wins, so more specific foods come before broad ones.
_EMOJI_BY_KEYWORD: tuple[tuple[tuple[str, ...], str], ...] = (
    (("pizza",), "🍕"),
    (("burger",), "🍔"),
    (("taco", "burrito", "quesadilla", "nacho"), "🌮"),
    (("sandwich", "sub", "wrap", "panini", "hoagie"), "🥪"),
    (("chicken", "wing", "drumstick"), "🍗"),
    (("salad",), "🥗"),
    (("pasta", "spaghetti", "noodle", "lasagna", "mac and cheese"), "🍝"),
    (("rice", "biryani", "pilaf", "sushi"), "🍚"),
    (("bagel", "bread", "roll", "pastry", "pastries", "croissant", "muffin"), "🥐"),
    (("cookie", "brownie"), "🍪"),
    (("cake", "cupcake", "dessert", "donut", "doughnut"), "🍰"),
    (("fruit", "apple", "banana", "orange"), "🍎"),
    (("soup", "stew", "chili"), "🍲"),
    (("coffee", "tea"), "☕"),
)
GENERIC_EMOJI = "🍽️"


@dataclass(frozen=True)
class AlertContent:
    """One ready-to-display alert; the title and body are already length-bounded."""

    title: str
    body: str


def clean_text(value: str) -> str:
    """Strip control and bidi characters and collapse whitespace."""
    return re.sub(r"\s+", " ", _CONTROL.sub(" ", value)).strip()


def _shorten(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[: limit - 1].rstrip() + "…"


def food_emoji(item_names: Sequence[str]) -> str:
    """Pick an emoji from the reviewed names; fall back to a plain plate, never a guess."""
    lowered = " ".join(item_names).lower()
    for keywords, emoji in _EMOJI_BY_KEYWORD:
        if any(re.search(rf"\b{re.escape(word)}(?:es|s)?\b", lowered) for word in keywords):
            return emoji
    return GENERIC_EMOJI


def food_phrase(item_names: Sequence[str]) -> str:
    """Name one, two, or several items without a run-on lock-screen title."""
    names = [_shorten(n, MAX_ITEM_NAME) for n in (clean_text(raw) for raw in item_names) if n]
    if not names:
        return "food"
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{names[0]}, {names[1]} and {len(names) - 2} more"


def location_phrase(building_name: str | None, building_code: str, room: str) -> str:
    """Building display name, plus the room only when the host gave one.

    A bare slug (an internal building ID) is never shown; an empty result means the
    alert simply omits the place instead of inventing one.
    """
    name = clean_text(building_name or "")
    if not name:
        code = clean_text(building_code)
        name = "" if _SLUG.match(code) else code
    if not name:
        return ""
    name = _shorten(name, MAX_LOCATION)
    clean_room = _shorten(clean_text(room), 20)
    return f"{name}, Room {clean_room}" if clean_room else name


def build_alert_content(
    *,
    item_names: Sequence[str],
    servings_available: int,
    building_name: str | None,
    building_code: str,
    room: str,
) -> AlertContent:
    """Compose the title and body from one published listing's own data."""
    title = f"{food_emoji(item_names)} Free {food_phrase(item_names)} on campus!"
    servings = max(servings_available, 0)
    count = f"{servings} serving{'' if servings == 1 else 's'}"
    place = location_phrase(building_name, building_code, room)
    first = f"{count} at {place}." if place else f"{count} available."
    return AlertContent(title=title, body=f"{first} Reserve yours before it's gone!")
