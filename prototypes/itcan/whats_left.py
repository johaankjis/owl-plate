#!/usr/bin/env python3
"""Answer "What's left?" for one drop on an It (itcan.do) pickup companion.

The page state follows prototypes/itcan/STATE_CONTRACT.md exactly. One
`GET /drops/{drop_id}` builds the whole state; on any failure only the binding,
freshness and a plain error are patched so the page keeps its last good counts.
Standard-library only so this helper runs on the paired Mac without the venv.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

HOST_TOKEN = "demo-host"  # Synthetic demo credential; works only in demo mode.
IT_BIN = Path.home() / ".it" / "bin" / "it"
PAGE_PREFIX = "owl-whats-left-"
DISPLAY_TZ = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")
FOOD_NAME_MAX = 80
COUNT_KEYS = ("total", "available", "held", "picked_up", "pantry_held", "pantry_transferred")
LEGACY_OPTIONAL_COUNTS = ("pantry_held", "pantry_transferred")
STATUS_LABELS = {
    "live": "Available now",
    "claimed_out": "All servings taken",
    "expired": "Listing ended",
    "draft": "Not published yet",
}
UNREACHABLE = "Couldn't reach Owl Plate. Try again in a moment."
NOT_FOUND = "Owl Plate couldn't find this listing."
SERVER_ERROR = "Owl Plate couldn't answer right now. Try again in a moment."
BAD_DATA = "Owl Plate's counts didn't add up, so they weren't updated."


class CountsError(ValueError):
    """Raised when a drop response cannot safely become page state."""


def canonical_drop_id(value: str) -> str:
    """Return a canonical UUID so a page cannot redirect the helper to another path."""
    return str(uuid.UUID(value))


def page_id_for_drop(drop_id: str) -> str:
    """Give each published drop its own stable It page and conversation binding."""
    return f"{PAGE_PREFIX}{canonical_drop_id(drop_id)}"


def _get(base: str, path: str) -> dict:
    """Fetch one JSON resource as the synthetic demo host."""
    request = urllib.request.Request(
        f"{base.rstrip('/')}/backend{path}",
        headers={"Authorization": f"Bearer {HOST_TOKEN}"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def _freshness(now: datetime) -> dict:
    """Stamp a moment both for people at the table (Eastern) and for machines (UTC)."""
    local = now.astimezone(DISPLAY_TZ)
    hour = local.strftime("%I").lstrip("0") or "12"
    return {
        "checked_at": f"{hour}:{local.strftime('%M:%S %p')}",
        "checked_at_iso": now.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }


def _food_name(drop: dict) -> str:
    """Summarize the listing's food in one short, display-ready line."""
    names = [str(item["name"]).strip() for item in drop["vision"]["items"]]
    text = ", ".join(name for name in names if name)
    if not text:
        raise CountsError("listing has no food names")
    if len(text) > FOOD_NAME_MAX:
        text = text[: FOOD_NAME_MAX - 1].rstrip() + "…"
    return text


def _location(drop: dict) -> str:
    """Name the pickup place with public building data and the host's room only."""
    building = drop.get("building") or {}
    place = str(building.get("name") or drop["building_code"]).strip()
    if not place:
        raise CountsError("listing has no location")
    room = str(drop.get("room") or "").strip()
    return f"{place} · Room {room}" if room else place


def _counts(drop: dict) -> dict:
    """Read aggregate counts strictly; anything unbalanced fails closed."""
    raw = drop["counts"]
    counts = {}
    for key in COUNT_KEYS:
        value = raw.get(key, 0) if key in LEGACY_OPTIONAL_COUNTS else raw[key]
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise CountsError(f"invalid count {key}")
        counts[key] = value
    if counts["total"] != sum(counts[key] for key in COUNT_KEYS[1:]):
        raise CountsError("counts do not add up to total")
    return counts


def _answer(status: str, counts: dict) -> str:
    """Say in one plain sentence what someone walking up can still get."""
    if status == "draft":
        return "Not published yet"
    if status == "expired":
        return "Listing ended"
    if status == "claimed_out" or counts["available"] == 0:
        return "All servings taken"
    noun = "serving" if counts["total"] == 1 else "servings"
    return f"{counts['available']} of {counts['total']} {noun} left"


def build_state(drop: dict, drop_id: str, now: datetime) -> dict:
    """Turn one host drop response into the contract's full page state."""
    status = drop["status"]
    if status not in STATUS_LABELS:
        raise CountsError("unknown listing status")
    if canonical_drop_id(str(drop.get("id", drop_id))) != drop_id:
        raise CountsError("response is for a different listing")
    counts = _counts(drop)
    return {
        "drop_id": drop_id,
        "page_id": page_id_for_drop(drop_id),
        "food_name": _food_name(drop),
        "location": _location(drop),
        "status_label": STATUS_LABELS[status],
        **counts,
        **_freshness(now),
        "answer": _answer(status, counts),
        "ok": True,
        "error": "",
    }


def error_state(drop_id: str, message: str, now: datetime) -> dict:
    """Patch only binding, freshness and the error so last good counts stay visible."""
    return {
        "drop_id": drop_id,
        "page_id": page_id_for_drop(drop_id),
        **_freshness(now),
        "ok": False,
        "error": message,
    }


def _error_message(exc: Exception) -> str:
    """Translate a failure into words a host can act on, without internals."""
    if isinstance(exc, urllib.error.HTTPError):
        return NOT_FOUND if exc.code == 404 else SERVER_ERROR
    if isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionError)):
        return UNREACHABLE
    return BAD_DATA


def whats_left(base: str, drop_id: str, now: datetime | None = None) -> dict:
    """Return the page state for exactly one drop; never raises on a fetch failure."""
    drop_id = canonical_drop_id(drop_id)
    try:
        drop = _get(base, f"/drops/{drop_id}")
        if not isinstance(drop, dict):
            raise CountsError("response is not an object")
        return build_state(drop, drop_id, now or datetime.now(UTC))
    except (
        urllib.error.URLError,
        TimeoutError,
        ConnectionError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
    ) as exc:
        print(f"whats_left: {type(exc).__name__}", file=sys.stderr)
        return error_state(drop_id, _error_message(exc), now or datetime.now(UTC))


def main() -> int:
    """Print the page state as JSON; optionally patch the exact-drop It page."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--drop-id", required=True, help="published Owl Plate drop UUID")
    parser.add_argument("--base", default="http://localhost:3017", help="Owl Plate web URL")
    parser.add_argument("--it-patch", metavar="PAGE_ID", help="also run `it patch PAGE_ID`")
    parser.add_argument("--it-bin", default=str(IT_BIN), help="path to the It CLI")
    args = parser.parse_args()
    try:
        drop_id = canonical_drop_id(args.drop_id)
    except ValueError:
        parser.error("--drop-id must be a UUID")
    expected_page_id = page_id_for_drop(drop_id)
    if args.it_patch is not None and args.it_patch != expected_page_id:
        parser.error(f"--it-patch must be {expected_page_id} for this drop")
    state = whats_left(args.base, drop_id)
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    print(payload)
    if args.it_patch is not None:
        completed = subprocess.run([args.it_bin, "patch", expected_page_id, payload], check=False)
        return completed.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
