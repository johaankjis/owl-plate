#!/usr/bin/env python3
"""Read-only Owl Plate data integration and action CLI for the It command center.

Every state payload follows the "Command center page (sponsor showcase,
manager-owned)" section of prototypes/itcan/STATE_CONTRACT.md. All HTTP calls
to Owl Plate are read-only GETs; synthetic demo bearers stay inside this module
and are never printed or placed in page state. On any fetch, parse or counts
invariant failure, only page_id, freshness, ok=false and a plain error are
patched so the page preserves its last good campus, selection and agent panel.
Standard-library only so this helper runs on the paired Mac with built-in python3.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

PROJECTOR_TOKEN = "demo-projector"  # Synthetic demo credential; demo mode only.
HOST_TOKEN = "demo-host"  # Synthetic demo credential; demo mode only.
DEFAULT_BASE = "http://localhost:3017"
DEFAULT_PAGE_ID = "owl-rescue-command-center"
IT_BIN = Path.home() / ".it" / "bin" / "it"
DISPLAY_TZ = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")

FOOD_NAME_MAX = 80
DESCRIPTION_MAX = 160
ACTIVITY_LIMIT = 12
ACTIVITY_EXPIRED_PROBE_LIMIT = 5
RESPOND_MAX = 600
RECOMMEND_MIN = 1
RECOMMEND_MAX = 6
RECOMMEND_TITLE_MAX = 80
RECOMMEND_DETAIL_MAX = 280

VALID_STATUSES = frozenset({"live", "claimed_out", "expired", "draft"})
BUILDING_COUNT_KEYS = (
    "total_servings",
    "available_servings",
    "held_servings",
    "picked_up",
    "pantry_held",
    "pantry_transferred_simulated",
)

# Mirrors services/api/analytics/operations.py so inspected drops share categories.
CATEGORY_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Pizza", re.compile(r"\b(pizza|flatbread|calzone|stromboli|slices?)\b", re.IGNORECASE)),
    (
        "Sandwiches & wraps",
        re.compile(
            r"\b(sandwich(?:es)?|wraps?|subs?|paninis?|burgers?|sliders?|hoagies?|"
            r"quesadillas?|tacos?|burritos?|pitas?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "Salads & bowls",
        re.compile(
            r"\b(salads?|bowls?|greens|grains?|poke|pasta|rice|soups?|chili)\b", re.IGNORECASE
        ),
    ),
    (
        "Snacks & sides",
        re.compile(
            r"\b(snacks?|chips?|cookies?|brownies?|muffins?|pastr(?:y|ies)|fruit|veggie\s*tray|"
            r"pretzels?|popcorn|donuts?|cupcakes?|bagels?|breadsticks?|wings?|sides?|dips?|"
            r"hummus|desserts?|cakes?|bars?)\b",
            re.IGNORECASE,
        ),
    ),
)
OTHER_CATEGORY = "Other"

UNREACHABLE = "Couldn't reach Owl Plate. Try again in a moment."
NOT_FOUND = "Owl Plate couldn't find that listing."
BUILDING_NOT_FOUND = "Owl Plate couldn't find that verified building."
SERVER_ERROR = "Owl Plate couldn't answer right now. Try again in a moment."
BAD_DATA = "Owl Plate's data didn't add up, so the page wasn't updated."


class DataError(ValueError):
    """Raised when an Owl Plate response violates the command-center contract."""


def canonical_drop_id(value: str) -> str:
    """Normalize a UUID so untrusted input cannot steer the helper to another path."""
    return str(uuid.UUID(value))


def _get(base: str, path: str, token: str | None = None) -> object:
    """Perform one read-only GET against Owl Plate's /backend proxy."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    request = urllib.request.Request(
        f"{base.rstrip('/')}/backend{path}",
        headers=headers,
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def _get_drop(base: str, drop_id: str) -> dict:
    """Read one drop using demo-host, falling back to demo-projector on 404.

    Recording-dataset drops can belong to secondary synthetic hosts; trying the
    host token first preserves standard host-path semantics while still allowing
    campus-wide inspection of every published listing in demo mode.
    """
    try:
        data = _get(base, f"/drops/{drop_id}", HOST_TOKEN)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        try:
            data = _get(base, f"/drops/{drop_id}", PROJECTOR_TOKEN)
        except urllib.error.HTTPError:
            raise exc from None
    if not isinstance(data, dict):
        raise DataError("drop response is not an object")
    return data


def _format_display_time(moment: datetime) -> str:
    """Format a timezone-aware instant as America/New_York clock time."""
    local = moment.astimezone(DISPLAY_TZ)
    hour = local.strftime("%I").lstrip("0") or "12"
    return f"{hour}:{local.strftime('%M:%S %p')}"


def _format_iso_utc(moment: datetime) -> str:
    """Format a timezone-aware instant as second-precision UTC ISO-8601."""
    return moment.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _parse_iso(value: object) -> datetime:
    """Parse an ISO-8601 timestamp strictly and normalize it to UTC."""
    if not isinstance(value, str) or not value.strip():
        raise DataError("timestamp must be a non-empty string")
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise DataError("timestamp must include timezone information")
    return parsed.astimezone(UTC)


def _freshness(now: datetime) -> dict[str, str]:
    """Stamp a moment for people (Eastern) and machines (UTC)."""
    return {
        "checked_at": _format_display_time(now),
        "checked_at_iso": _format_iso_utc(now),
    }


def _nonneg_int(value: object, name: str) -> int:
    """Require an integer >= 0; reject booleans, floats and strings."""
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise DataError(f"invalid count {name}")
    return value


def _bounded_percent(value: object, name: str) -> float:
    """Require a finite 0..100 percentage rounded to one decimal place."""
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise DataError(f"invalid percent {name}")
    numeric = float(value)
    if not math.isfinite(numeric) or not 0.0 <= numeric <= 100.0:
        raise DataError(f"out-of-range percent {name}")
    return round(numeric, 1)


def _trim_text(value: str, limit: int) -> str:
    """Collapse surrounding whitespace and cap display copy with an ellipsis."""
    text = value.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _validate_counts_dict(counts: dict[str, int]) -> dict[str, int]:
    """Enforce total = available + held + picked_up + pantry_held + pantry_transferred."""
    checked = {key: _nonneg_int(counts[key], key) for key in BUILDING_COUNT_KEYS}
    parts_sum = sum(checked[key] for key in BUILDING_COUNT_KEYS[1:])
    if checked["total_servings"] != parts_sum:
        raise DataError("serving counts do not add up to total")
    return checked


def _listing_answer(status: str, counts: dict[str, int]) -> str:
    """Express remaining availability in one plain sentence matching the companion."""
    if status == "draft":
        return "Not published yet"
    if status == "expired":
        return "Listing ended"
    if status == "claimed_out" or counts["available_servings"] == 0:
        return "All servings taken"
    noun = "serving" if counts["total_servings"] == 1 else "servings"
    return f"{counts['available_servings']} of {counts['total_servings']} {noun} left"


def _classify_items(items: list[dict]) -> str:
    """Derive a stable food category from vision item names."""
    for item in items:
        name = str(item.get("name", ""))
        for label, pattern in CATEGORY_RULES:
            if pattern.search(name):
                return label
    return OTHER_CATEGORY


def _food_from_drop(drop: dict) -> str:
    """Join vision item names into one bounded display string."""
    vision = drop["vision"]
    items = vision["items"]
    if not isinstance(items, list) or not items:
        raise DataError("drop has no vision items")
    names = [str(item["name"]).strip() for item in items]
    text = ", ".join(name for name in names if name)
    if not text:
        raise DataError("drop has no food names")
    return _trim_text(text, FOOD_NAME_MAX)


def _description_from_drop(drop: dict) -> str:
    """Extract the listing's vision note, trimmed to 160 characters."""
    vision = drop.get("vision") or {}
    if not isinstance(vision, dict):
        return ""
    notes = vision.get("notes")
    if notes is None:
        return ""
    if not isinstance(notes, str):
        raise DataError("vision notes must be text")
    return _trim_text(notes, DESCRIPTION_MAX)


def _drop_counts(drop: dict) -> dict[str, int]:
    """Read and balance counts from a GET /drops/{id} response."""
    raw = drop["counts"]
    if not isinstance(raw, dict):
        raise DataError("drop counts must be an object")
    return _validate_counts_dict(
        {
            "total_servings": raw["total"],
            "available_servings": raw["available"],
            "held_servings": raw["held"],
            "picked_up": raw["picked_up"],
            "pantry_held": raw.get("pantry_held", 0),
            "pantry_transferred_simulated": raw.get("pantry_transferred", 0),
        }
    )


def _analytics_listing_counts(row: dict) -> dict[str, int]:
    """Read and balance counts from an analytics active_listings entry."""
    return _validate_counts_dict(
        {
            "total_servings": row["total_servings"],
            "available_servings": row["available"],
            "held_servings": row["held"],
            "picked_up": row["picked_up"],
            "pantry_held": row.get("pantry_held", 0),
            "pantry_transferred_simulated": row.get("pantry_transferred", 0),
        }
    )


def build_listing_from_drop(drop: dict, drop_id: str, now: datetime) -> dict:
    """Convert one GET /drops/{id} response into the contract's listing shape."""
    if canonical_drop_id(str(drop.get("id", drop_id))) != drop_id:
        raise DataError("response is for a different listing")
    status = drop["status"]
    if status not in VALID_STATUSES:
        raise DataError("unknown listing status")
    counts = _drop_counts(drop)
    building = drop.get("building") or {}
    if not isinstance(building, dict):
        raise DataError("building field must be an object")
    building_code = str(drop.get("building_code") or "").strip()
    building_id = str(building.get("id") or building_code).strip()
    building_name = str(building.get("name") or building_id).strip()
    if not building_id or not building_name:
        raise DataError("listing has no building")
    room = str(drop.get("room") or "").strip()

    raw_category = drop.get("category")
    if isinstance(raw_category, str) and raw_category.strip():
        category = raw_category.strip()
    else:
        category = _classify_items(drop["vision"]["items"])

    raw_expires = drop.get("expires_at")
    if raw_expires is None:
        expires_at = ""
        expires_at_iso = ""
    else:
        expires_dt = _parse_iso(raw_expires)
        expires_at = _format_display_time(expires_dt)
        expires_at_iso = _format_iso_utc(expires_dt)

    raw_updated = drop.get("updated_at") or drop.get("published_at") or drop.get("created_at")
    updated_dt = _parse_iso(raw_updated) if raw_updated is not None else now.astimezone(UTC)

    return {
        "drop_id": drop_id,
        "food": _food_from_drop(drop),
        "description": _description_from_drop(drop),
        "category": category,
        "building_id": building_id,
        "building_name": building_name,
        "room": room,
        "status": status,
        **counts,
        "expires_at": expires_at,
        "expires_at_iso": expires_at_iso,
        "updated_at": _format_display_time(updated_dt),
        "updated_at_iso": _format_iso_utc(updated_dt),
        "answer": _listing_answer(status, counts),
    }


def _build_listing_from_analytics(
    row: dict,
    fallback_updated: datetime,
    description_override: str | None = None,
) -> dict:
    """Convert one analytics active_listings entry into the contract's listing shape."""
    if not isinstance(row, dict):
        raise DataError("listing entry must be an object")
    drop_id = canonical_drop_id(str(row["drop_id"]))
    status = row["status"]
    if status not in VALID_STATUSES:
        raise DataError("unknown listing status")
    counts = _analytics_listing_counts(row)
    food = _trim_text(str(row["food"]), FOOD_NAME_MAX)
    if not food:
        raise DataError("listing has no food name")

    raw_desc = description_override
    if raw_desc is None:
        if isinstance(row.get("description"), str):
            raw_desc = row["description"]
        elif isinstance(row.get("vision"), dict) and isinstance(row["vision"].get("notes"), str):
            raw_desc = row["vision"]["notes"]
        else:
            raw_desc = ""
    description = _trim_text(raw_desc, DESCRIPTION_MAX)

    category = str(row.get("category") or OTHER_CATEGORY).strip() or OTHER_CATEGORY
    building = row.get("building") or {}
    if not isinstance(building, dict):
        raise DataError("listing building must be an object")
    building_id = str(building.get("id") or row.get("building_id") or "").strip()
    building_name = str(building.get("name") or row.get("building_name") or building_id).strip()
    if not building_id or not building_name:
        raise DataError("listing has no building")
    room = str(row.get("room") or "").strip()

    raw_expires = row.get("expires_at")
    if raw_expires is None:
        expires_at = ""
        expires_at_iso = ""
    else:
        expires_dt = _parse_iso(raw_expires)
        expires_at = _format_display_time(expires_dt)
        expires_at_iso = _format_iso_utc(expires_dt)

    raw_updated = row.get("updated_at") or row.get("published_at")
    updated_dt = _parse_iso(raw_updated) if raw_updated is not None else fallback_updated

    return {
        "drop_id": drop_id,
        "food": food,
        "description": description,
        "category": category,
        "building_id": building_id,
        "building_name": building_name,
        "room": room,
        "status": status,
        **counts,
        "expires_at": expires_at,
        "expires_at_iso": expires_at_iso,
        "updated_at": _format_display_time(updated_dt),
        "updated_at_iso": _format_iso_utc(updated_dt),
        "answer": _listing_answer(status, counts),
    }


def _verified_buildings(buildings_payload: object) -> list[dict]:
    """Keep only verified buildings with valid coordinates, passed through verbatim."""
    if not isinstance(buildings_payload, dict):
        raise DataError("buildings response is not an object")
    raw_buildings = buildings_payload.get("buildings")
    if not isinstance(raw_buildings, list):
        raise DataError("buildings list is missing")
    verified: list[dict] = []
    seen: set[str] = set()
    for item in raw_buildings:
        if not isinstance(item, dict):
            continue
        if item.get("verification_status") != "verified":
            continue
        lat = item.get("latitude")
        lon = item.get("longitude")
        if (
            not isinstance(lat, (int, float))
            or isinstance(lat, bool)
            or not isinstance(lon, (int, float))
            or isinstance(lon, bool)
            or not math.isfinite(lat)
            or not math.isfinite(lon)
            or not (-90 <= lat <= 90)
            or not (-180 <= lon <= 180)
        ):
            continue
        building_id = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        category = str(item.get("category") or "other").strip() or "other"
        if not building_id or not name or building_id in seen:
            continue
        seen.add(building_id)
        verified.append(
            {
                "id": building_id,
                "name": name,
                "category": category,
                "latitude": lat,
                "longitude": lon,
            }
        )
    return verified


def _build_campus_buildings(verified: list[dict], live_listings: list[dict]) -> list[dict]:
    """Aggregate live listing counts onto each verified building and check invariants."""
    by_building: dict[str, list[dict]] = {}
    for listing in live_listings:
        if listing["status"] != "live":
            continue
        by_building.setdefault(listing["building_id"], []).append(listing)

    rows: list[dict] = []
    for b in verified:
        listings = by_building.get(b["id"], [])
        sums = {key: sum(item[key] for item in listings) for key in BUILDING_COUNT_KEYS}
        checked = _validate_counts_dict(sums)
        rows.append(
            {
                "id": b["id"],
                "name": b["name"],
                "category": b["category"],
                "latitude": b["latitude"],
                "longitude": b["longitude"],
                "active_listings": len(listings),
                **checked,
            }
        )
    return rows


def _build_trend_points(series_raw: object) -> list[dict]:
    """Map analytics daily series oldest first, never fabricating missing days."""
    if not isinstance(series_raw, list):
        raise DataError("analytics series must be a list")
    points: list[dict] = []
    for row in series_raw:
        if not isinstance(row, dict):
            raise DataError("series entry must be an object")
        day = str(row.get("date") or "").strip()
        if not day:
            raise DataError("series entry missing date")
        points.append(
            {
                "date": day,
                "servings_offered": _nonneg_int(row["servings_offered"], "servings_offered"),
                "student_pickups": _nonneg_int(row["student_pickups"], "student_pickups"),
                "pantry_transfers": _nonneg_int(row["pantry_transfers"], "pantry_transfers"),
                "expired_unclaimed": _nonneg_int(row["expired_unclaimed"], "expired_unclaimed"),
            }
        )
    points.sort(key=lambda item: item["date"])
    return points


def _build_activity_events(
    activity_raw: object, *, limit: int | None = ACTIVITY_LIMIT
) -> list[dict]:
    """Map analytics activity newest first (max 12), dropping drop_id."""
    if not isinstance(activity_raw, list):
        raise DataError("analytics activity must be a list")
    parsed: list[tuple[datetime, int, dict]] = []
    for index, row in enumerate(activity_raw):
        if not isinstance(row, dict):
            raise DataError("activity entry must be an object")
        occurred_dt = _parse_iso(row["occurred_at"])
        kind = str(row.get("kind") or "").strip()
        food = str(row.get("food") or "").strip()
        building_name = str(row.get("building_name") or "").strip()
        servings = _nonneg_int(row["servings"], "servings")
        is_simulated = row.get("is_simulated")
        if not kind or not isinstance(is_simulated, bool):
            raise DataError("activity entry missing required fields")
        parsed.append(
            (
                occurred_dt,
                index,
                {
                    "kind": kind,
                    "occurred_at": _format_display_time(occurred_dt),
                    "occurred_at_iso": _format_iso_utc(occurred_dt),
                    "food": food,
                    "building_name": building_name,
                    "servings": servings,
                    "is_simulated": is_simulated,
                },
            )
        )
    parsed.sort(key=lambda item: (-item[0].timestamp(), item[1]))
    ordered = [entry for _, _, entry in parsed]
    return ordered[:limit] if limit is not None else ordered


def _build_dataset_meta(dataset_raw: object) -> dict[str, object]:
    """Read dataset provenance so simulated recordings are always labeled clearly."""
    if not isinstance(dataset_raw, dict):
        raise DataError("analytics dataset metadata is missing")
    kind = dataset_raw.get("kind")
    if kind not in ("current", "recording"):
        raise DataError("unknown dataset kind")
    raw_sim = dataset_raw.get("is_simulated")
    if raw_sim is not None and not isinstance(raw_sim, bool):
        raise DataError("dataset is_simulated must be boolean")
    is_simulated = True if kind == "recording" else bool(raw_sim)
    default_label = "Recording dataset" if is_simulated else "Current app data"
    label = str(dataset_raw.get("label") or default_label).strip() or default_label
    return {
        "dataset_label": label,
        "dataset_is_simulated": is_simulated,
    }


def _enrich_listings(
    base: str,
    analytics: dict,
    listings: list[dict],
    verified_ids: set[str],
    now: datetime,
) -> list[dict]:
    """Best-effort drop enrichment for missing descriptions and most recent expired drop.

    The analytics payload omits vision notes and drops expired listings; probing
    individual drops fills those gaps against live Owl Plate without breaking
    minimal read-only stubs that only expose analytics and buildings.
    """
    enriched: list[dict] = []
    seen_ids: set[str] = set()
    has_expired = False

    for entry in listings:
        seen_ids.add(entry["drop_id"])
        if entry["status"] == "expired":
            has_expired = True
        if not entry["description"] and entry["status"] in ("live", "claimed_out"):
            try:
                drop = _get_drop(base, entry["drop_id"])
                note = _description_from_drop(drop)
                if note:
                    entry = {**entry, "description": note}
            except (
                urllib.error.URLError,
                TimeoutError,
                ConnectionError,
                ValueError,
                KeyError,
                TypeError,
            ):
                pass
        enriched.append(entry)

    if not has_expired and isinstance(analytics.get("activity"), list):
        candidates: list[str] = []
        for row in analytics["activity"]:
            if not isinstance(row, dict):
                continue
            raw_id = row.get("drop_id")
            if not raw_id:
                continue
            try:
                cid = canonical_drop_id(str(raw_id))
            except ValueError:
                continue
            if cid not in seen_ids and cid not in candidates:
                candidates.append(cid)
            if len(candidates) >= ACTIVITY_EXPIRED_PROBE_LIMIT:
                break

        for cid in candidates:
            try:
                drop = _get_drop(base, cid)
                candidate_listing = build_listing_from_drop(drop, cid, now)
            except (
                urllib.error.URLError,
                TimeoutError,
                ConnectionError,
                ValueError,
                KeyError,
                TypeError,
            ):
                continue
            if (
                candidate_listing["status"] == "expired"
                and candidate_listing["building_id"] in verified_ids
            ):
                enriched.append(candidate_listing)
                break

    return enriched


def _select_active_listings(all_listings: list[dict]) -> list[dict]:
    """Keep every live (and unexpired claimed_out) listing plus the newest expired one."""
    current: list[dict] = []
    expired: list[dict] = []
    for entry in all_listings:
        status = entry["status"]
        if status in ("live", "claimed_out"):
            current.append(entry)
        elif status == "expired":
            expired.append(entry)
    if expired:
        newest_expired = max(
            expired,
            key=lambda item: (item["expires_at_iso"], item["updated_at_iso"], item["drop_id"]),
        )
        current.append(newest_expired)
    return current


def build_campus_state(
    analytics: dict,
    buildings_payload: object,
    page_id: str,
    now: datetime,
    base: str | None = None,
) -> dict:
    """Turn analytics + buildings responses into the full --refresh patch state."""
    if not isinstance(analytics, dict):
        raise DataError("analytics response is not an object")
    summary = analytics.get("summary")
    if not isinstance(summary, dict):
        raise DataError("analytics summary is missing")

    verified = _verified_buildings(buildings_payload)
    verified_ids = {b["id"] for b in verified}

    server_time_raw = analytics.get("server_time")
    fallback_updated = (
        _parse_iso(server_time_raw) if server_time_raw is not None else now.astimezone(UTC)
    )

    raw_listings = analytics.get("active_listings")
    if not isinstance(raw_listings, list):
        raise DataError("analytics active_listings must be a list")

    parsed_listings = [_build_listing_from_analytics(row, fallback_updated) for row in raw_listings]
    if base is not None:
        parsed_listings = _enrich_listings(base, analytics, parsed_listings, verified_ids, now)

    selected_listings = _select_active_listings(parsed_listings)
    live_listings = [item for item in selected_listings if item["status"] == "live"]
    campus_buildings = _build_campus_buildings(verified, live_listings)
    active_buildings_count = sum(1 for b in campus_buildings if b["active_listings"] > 0)

    trend_points = _build_trend_points(analytics.get("series"))
    activity_events = _build_activity_events(analytics.get("activity"))
    dataset_meta = _build_dataset_meta(analytics.get("dataset"))

    return {
        "page_id": page_id,
        "total_published_servings": _nonneg_int(
            summary["total_servings_offered"], "total_servings_offered"
        ),
        "available_servings": _nonneg_int(summary["available_servings"], "available_servings"),
        "student_reserved_servings": _nonneg_int(
            summary["student_reserved_servings"], "student_reserved_servings"
        ),
        "completed_pickups": _nonneg_int(summary["student_pickups"], "student_pickups"),
        "pantry_reserved_servings": _nonneg_int(
            summary["pantry_reserved_servings"], "pantry_reserved_servings"
        ),
        "pantry_transferred_simulated": _nonneg_int(
            summary["pantry_transfers"], "pantry_transfers"
        ),
        "student_recovery_percent": _bounded_percent(
            summary["student_pickup_rate_percent"], "student_pickup_rate_percent"
        ),
        "active_buildings_count": active_buildings_count,
        "campus_buildings": campus_buildings,
        "active_listings": selected_listings,
        "trend_points": trend_points,
        "activity_events": activity_events,
        **dataset_meta,
        **_freshness(now),
        "ok": True,
        "error": "",
    }


def error_state(page_id: str, message: str, now: datetime) -> dict:
    """Patch only binding, freshness and error so last good state stays intact."""
    return {
        "page_id": page_id,
        **_freshness(now),
        "ok": False,
        "error": message,
    }


def _error_message(exc: Exception, not_found: str = NOT_FOUND) -> str:
    """Translate a failure into one plain sentence without exposing internals."""
    if isinstance(exc, urllib.error.HTTPError):
        return not_found if exc.code == 404 else SERVER_ERROR
    if isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionError)):
        return UNREACHABLE
    return BAD_DATA


def refresh_campus(base: str, page_id: str, now: datetime | None = None) -> dict:
    """Fetch analytics and verified buildings; never raises on a fetch or data error."""
    moment = now or datetime.now(UTC)
    try:
        analytics = _get(base, "/analytics/operations?period=7d", PROJECTOR_TOKEN)
        buildings = _get(base, "/buildings")
        if not isinstance(analytics, dict):
            raise DataError("analytics response is not an object")
        return build_campus_state(analytics, buildings, page_id, moment, base=base)
    except (
        urllib.error.URLError,
        TimeoutError,
        ConnectionError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
    ) as exc:
        print(f"campus_center: {type(exc).__name__}", file=sys.stderr)
        return error_state(page_id, _error_message(exc), moment)


def initial_state(base: str, page_id: str = DEFAULT_PAGE_ID, now: datetime | None = None) -> dict:
    """Build the full initial state for `it create`, including empty selection/agent defaults."""
    campus = refresh_campus(base, page_id, now=now)
    defaults = {
        "selected_building_id": None,
        "selected_drop_id": None,
        "selected_listing": None,
        "selected_answer": None,
        "agent_status": "idle",
        "agent_response": "",
        "agent_error": "",
        "agent_updated_at": "",
        "agent_updated_at_iso": "",
        "agent_recommendations": [],
    }
    if not campus["ok"]:
        return {**defaults, **campus}
    return {**campus, **defaults}


def select_building(base: str, page_id: str, building_id: str, now: datetime | None = None) -> dict:
    """Validate building_id against GET /buildings and patch only the selection."""
    moment = now or datetime.now(UTC)
    target = building_id.strip()
    try:
        buildings = _get(base, "/buildings")
        verified_ids = {b["id"] for b in _verified_buildings(buildings)}
        if not target or target not in verified_ids:
            return error_state(page_id, BUILDING_NOT_FOUND, moment)
        return {
            "page_id": page_id,
            "selected_building_id": target,
            **_freshness(moment),
            "ok": True,
            "error": "",
        }
    except (
        urllib.error.URLError,
        TimeoutError,
        ConnectionError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
    ) as exc:
        print(f"campus_center: {type(exc).__name__}", file=sys.stderr)
        return error_state(page_id, _error_message(exc, BUILDING_NOT_FOUND), moment)


def inspect_drop(
    base: str,
    page_id: str,
    drop_id: str,
    *,
    include_answer: bool = False,
    now: datetime | None = None,
) -> dict:
    """Fetch one drop and patch selected_drop_id, building, listing and optional answer."""
    moment = now or datetime.now(UTC)
    drop_id = canonical_drop_id(drop_id)
    try:
        drop = _get_drop(base, drop_id)
        listing = build_listing_from_drop(drop, drop_id, moment)
        return {
            "page_id": page_id,
            "selected_drop_id": drop_id,
            "selected_building_id": listing["building_id"] or None,
            "selected_listing": listing,
            "selected_answer": listing["answer"] if include_answer else None,
            **_freshness(moment),
            "ok": True,
            "error": "",
        }
    except (
        urllib.error.URLError,
        TimeoutError,
        ConnectionError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
    ) as exc:
        print(f"campus_center: {type(exc).__name__}", file=sys.stderr)
        return error_state(page_id, _error_message(exc, NOT_FOUND), moment)


def build_brief(base: str, now: datetime | None = None) -> dict:
    """Gather factual observations from live Owl Plate data for the paired agent."""
    moment = (now or datetime.now(UTC)).astimezone(UTC)
    analytics = _get(base, "/analytics/operations?period=7d", PROJECTOR_TOKEN)
    buildings = _get(base, "/buildings")
    if not isinstance(analytics, dict):
        raise DataError("analytics response is not an object")

    verified = _verified_buildings(buildings)
    verified_by_id = {b["id"]: b for b in verified}
    server_time_raw = analytics.get("server_time")
    fallback_updated = _parse_iso(server_time_raw) if server_time_raw is not None else moment

    raw_listings = analytics.get("active_listings")
    if not isinstance(raw_listings, list):
        raise DataError("analytics active_listings must be a list")

    live_listings: list[dict] = []
    for row in raw_listings:
        listing = _build_listing_from_analytics(row, fallback_updated)
        if listing["status"] != "live":
            continue
        # Refresh per-drop counts when available so the brief reflects the latest holds.
        try:
            drop = _get_drop(base, listing["drop_id"])
            fresh_listing = build_listing_from_drop(drop, listing["drop_id"], moment)
            if fresh_listing["status"] == "live":
                listing = fresh_listing
            else:
                continue
        except (
            urllib.error.URLError,
            TimeoutError,
            ConnectionError,
            ValueError,
            KeyError,
            TypeError,
        ):
            pass
        live_listings.append(listing)

    expiring: list[dict] = []
    pantry_opportunities: list[dict] = []
    available_by_building: dict[str, int] = {}

    for listing in live_listings:
        avail = listing["available_servings"]
        if avail <= 0:
            continue
        if listing["building_id"] in verified_by_id:
            available_by_building[listing["building_id"]] = (
                available_by_building.get(listing["building_id"], 0) + avail
            )
        minutes_left = 0
        if listing["expires_at_iso"]:
            expires_dt = _parse_iso(listing["expires_at_iso"])
            minutes_left = max(0, int((expires_dt - moment).total_seconds() // 60))
        expiring.append(
            {
                "drop_id": listing["drop_id"],
                "food": listing["food"],
                "building_name": listing["building_name"],
                "minutes_left": minutes_left,
                "available_servings": avail,
            }
        )
        pantry_opportunities.append(
            {
                "drop_id": listing["drop_id"],
                "food": listing["food"],
                "building_name": listing["building_name"],
                "unclaimed_servings": avail,
                "_minutes_left": minutes_left,
            }
        )

    expiring.sort(key=lambda item: (item["minutes_left"], item["drop_id"]))
    pantry_opportunities.sort(
        key=lambda item: (item["_minutes_left"], -item["unclaimed_servings"], item["drop_id"])
    )
    cleaned_pantry = [
        {
            "drop_id": item["drop_id"],
            "food": item["food"],
            "building_name": item["building_name"],
            "unclaimed_servings": item["unclaimed_servings"],
        }
        for item in pantry_opportunities
    ]

    buildings_with_food = [
        {
            "building_id": b_id,
            "name": verified_by_id[b_id]["name"],
            "available_servings": avail,
        }
        for b_id, avail in available_by_building.items()
        if avail > 0
    ]
    buildings_with_food.sort(key=lambda item: (-item["available_servings"], item["building_id"]))

    events = _build_activity_events(analytics.get("activity"), limit=None)
    recent_completed_pickups = [
        {
            "food": event["food"],
            "building_name": event["building_name"],
            "occurred_at": event["occurred_at_iso"],
        }
        for event in events
        if event["kind"] == "student_pickup"
    ][:ACTIVITY_LIMIT]

    unclaimed_servings_total = sum(item["available_servings"] for item in live_listings)

    return {
        "generated_at": _format_iso_utc(moment),
        "expiring": expiring,
        "unclaimed_servings_total": unclaimed_servings_total,
        "recent_completed_pickups": recent_completed_pickups,
        "buildings_with_food": buildings_with_food,
        "pantry_opportunities": cleaned_pantry,
    }


def respond_state(page_id: str, text: str, now: datetime | None = None) -> dict:
    """Validate and package the paired agent's own latest message."""
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("--respond text must be non-empty")
    if len(cleaned) > RESPOND_MAX:
        raise ValueError(f"--respond text must be at most {RESPOND_MAX} characters")
    moment = now or datetime.now(UTC)
    display = _format_display_time(moment)
    iso = _format_iso_utc(moment)
    return {
        "page_id": page_id,
        "agent_status": "ready",
        "agent_response": cleaned,
        "agent_updated_at": display,
        "agent_updated_at_iso": iso,
        "agent_error": "",
        "checked_at": display,
        "checked_at_iso": iso,
        "ok": True,
        "error": "",
    }


def parse_recommendations(raw_json: str) -> list[dict[str, str]]:
    """Validate a JSON array of 1..6 {title, detail} recommendations."""
    try:
        parsed = json.loads(raw_json)
    except ValueError as exc:
        raise ValueError("--recommend must be valid JSON") from exc
    if not isinstance(parsed, list):
        raise TypeError("--recommend must be a JSON array")
    if not (RECOMMEND_MIN <= len(parsed) <= RECOMMEND_MAX):
        raise ValueError(
            f"--recommend must contain between {RECOMMEND_MIN} and {RECOMMEND_MAX} entries"
        )
    cleaned: list[dict[str, str]] = []
    for entry in parsed:
        if not isinstance(entry, dict) or set(entry.keys()) != {"title", "detail"}:
            raise ValueError("each recommendation must have exactly title and detail")
        title = entry["title"]
        detail = entry["detail"]
        if not isinstance(title, str) or not isinstance(detail, str):
            raise TypeError("recommendation title and detail must be strings")
        title = title.strip()
        detail = detail.strip()
        if not title or len(title) > RECOMMEND_TITLE_MAX:
            raise ValueError(f"recommendation title must be 1..{RECOMMEND_TITLE_MAX} characters")
        if not detail or len(detail) > RECOMMEND_DETAIL_MAX:
            raise ValueError(f"recommendation detail must be 1..{RECOMMEND_DETAIL_MAX} characters")
        cleaned.append({"title": title, "detail": detail})
    return cleaned


def recommend_state(page_id: str, raw_json: str, now: datetime | None = None) -> dict:
    """Validate and package the paired agent's recommendations."""
    recommendations = parse_recommendations(raw_json)
    moment = now or datetime.now(UTC)
    display = _format_display_time(moment)
    iso = _format_iso_utc(moment)
    return {
        "page_id": page_id,
        "agent_recommendations": recommendations,
        "agent_updated_at": display,
        "agent_updated_at_iso": iso,
        "checked_at": display,
        "checked_at_iso": iso,
        "ok": True,
        "error": "",
    }


def dismiss_recommendations_state(page_id: str, now: datetime | None = None) -> dict:
    """Clear active recommendation cards while preserving the last agent message."""
    moment = now or datetime.now(UTC)
    display = _format_display_time(moment)
    iso = _format_iso_utc(moment)
    return {
        "page_id": page_id,
        "agent_recommendations": [],
        "agent_updated_at": display,
        "agent_updated_at_iso": iso,
        "checked_at": display,
        "checked_at_iso": iso,
        "ok": True,
        "error": "",
    }


def build_parser() -> argparse.ArgumentParser:
    """Construct the command-center CLI parser with mutually exclusive actions."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=DEFAULT_BASE, help="Owl Plate web URL")
    parser.add_argument(
        "--page-id",
        default=DEFAULT_PAGE_ID,
        help="bound It command-center page id",
    )
    parser.add_argument(
        "--it-patch",
        metavar="PAGE_ID",
        help="also run `it patch PAGE_ID` (must equal --page-id)",
    )
    parser.add_argument("--it-bin", default=str(IT_BIN), help="path to the It CLI")

    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument(
        "--refresh",
        action="store_true",
        help="fetch analytics and buildings and patch campus state",
    )
    actions.add_argument(
        "--select-building",
        metavar="BUILDING_ID",
        help="validate a verified building id and patch selection",
    )
    actions.add_argument(
        "--inspect",
        metavar="DROP_ID",
        help="fetch one drop and patch selected_listing with selected_answer=null",
    )
    actions.add_argument(
        "--whats-left",
        metavar="DROP_ID",
        help="fetch one drop and patch selected_listing plus selected_answer",
    )
    actions.add_argument(
        "--brief",
        action="store_true",
        help="print factual campus observations for the paired agent (patches nothing)",
    )
    actions.add_argument(
        "--respond",
        metavar="TEXT",
        help="patch the paired agent's own latest message (1..600 chars)",
    )
    actions.add_argument(
        "--recommend",
        metavar="JSON",
        help="patch a validated JSON array of 1..6 {title, detail} recommendations",
    )
    actions.add_argument(
        "--dismiss-recommendations",
        action="store_true",
        help="clear agent_recommendations while keeping agent_response",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run one command-center action, print JSON, and optionally patch the bound page."""
    parser = build_parser()
    args = parser.parse_args(argv)

    page_id = args.page_id.strip()
    if not page_id:
        parser.error("--page-id must be non-empty")
    if args.it_patch is not None and args.it_patch != page_id:
        parser.error(f"--it-patch must be {page_id} for this page")

    if args.brief:
        try:
            brief = build_brief(args.base)
        except (
            urllib.error.URLError,
            TimeoutError,
            ConnectionError,
            ValueError,
            KeyError,
            TypeError,
            AttributeError,
        ) as exc:
            print(f"campus_center: {type(exc).__name__}", file=sys.stderr)
            print(
                json.dumps(
                    {"ok": False, "error": _error_message(exc)},
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
            )
            return 1
        print(json.dumps(brief, ensure_ascii=False, separators=(",", ":")))
        return 0

    if args.refresh:
        state = refresh_campus(args.base, page_id)
    elif args.select_building is not None:
        state = select_building(args.base, page_id, args.select_building)
    elif args.inspect is not None:
        try:
            drop_id = canonical_drop_id(args.inspect)
        except ValueError:
            parser.error("--inspect must be a UUID")
        state = inspect_drop(args.base, page_id, drop_id, include_answer=False)
    elif args.whats_left is not None:
        try:
            drop_id = canonical_drop_id(args.whats_left)
        except ValueError:
            parser.error("--whats-left must be a UUID")
        state = inspect_drop(args.base, page_id, drop_id, include_answer=True)
    elif args.respond is not None:
        try:
            state = respond_state(page_id, args.respond)
        except ValueError as exc:
            parser.error(str(exc))
    elif args.recommend is not None:
        try:
            state = recommend_state(page_id, args.recommend)
        except (ValueError, TypeError) as exc:
            parser.error(str(exc))
    elif args.dismiss_recommendations:
        state = dismiss_recommendations_state(page_id)
    else:
        parser.error("one action is required")

    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    print(payload)
    if args.it_patch is not None:
        completed = subprocess.run([args.it_bin, "patch", page_id, payload], check=False)
        return completed.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
