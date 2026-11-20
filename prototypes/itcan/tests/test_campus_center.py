"""Stand-in contract tests for the Owl Plate Campus Rescue Command Center helpers.

These use a local read-only stub of Owl Plate and a fake `it` binary; no
network calls and no real It page. They enforce the frozen "Command center page
(sponsor showcase, manager-owned)" section of prototypes/itcan/STATE_CONTRACT.md.
"""

from __future__ import annotations

import json
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import campus_center

PAGE_ID = "owl-rescue-command-center"
OTHER_PAGE_ID = "owl-whats-left-123e4567-e89b-42d3-a456-426614174000"
DROP_A = "123e4567-e89b-42d3-a456-426614174000"
DROP_B = "223e4567-e89b-42d3-a456-426614174000"
DROP_EXPIRED_OLD = "323e4567-e89b-42d3-a456-426614174000"
DROP_EXPIRED_NEW = "423e4567-e89b-42d3-a456-426614174000"
DROP_RECORDING_HOST_B = "523e4567-e89b-42d3-a456-426614174000"

UTC = ZoneInfo("UTC")
FIXED_NOW = datetime(2026, 11, 20, 20, 42, 7, tzinfo=UTC)  # 3:42:07 PM EST

REFRESH_KEYS = {
    "page_id",
    "total_published_servings",
    "available_servings",
    "student_reserved_servings",
    "completed_pickups",
    "pantry_reserved_servings",
    "pantry_transferred_simulated",
    "student_recovery_percent",
    "active_buildings_count",
    "campus_buildings",
    "active_listings",
    "trend_points",
    "activity_events",
    "dataset_label",
    "dataset_is_simulated",
    "checked_at",
    "checked_at_iso",
    "ok",
    "error",
}
SELECTION_KEYS = {
    "selected_building_id",
    "selected_drop_id",
    "selected_listing",
    "selected_answer",
}
AGENT_KEYS = {
    "agent_status",
    "agent_response",
    "agent_error",
    "agent_updated_at",
    "agent_updated_at_iso",
    "agent_recommendations",
}
INITIAL_KEYS = REFRESH_KEYS | SELECTION_KEYS | AGENT_KEYS
ERROR_KEYS = {"page_id", "checked_at", "checked_at_iso", "ok", "error"}
SELECT_BUILDING_KEYS = ERROR_KEYS | {"selected_building_id"}
INSPECT_KEYS = ERROR_KEYS | SELECTION_KEYS
BUILDING_ENTRY_KEYS = {
    "id",
    "name",
    "category",
    "latitude",
    "longitude",
    "active_listings",
    "total_servings",
    "available_servings",
    "held_servings",
    "picked_up",
    "pantry_held",
    "pantry_transferred_simulated",
}
LISTING_ENTRY_KEYS = {
    "drop_id",
    "food",
    "description",
    "category",
    "building_id",
    "building_name",
    "room",
    "status",
    "total_servings",
    "available_servings",
    "held_servings",
    "picked_up",
    "pantry_held",
    "pantry_transferred_simulated",
    "expires_at",
    "expires_at_iso",
    "updated_at",
    "updated_at_iso",
    "answer",
}
TREND_KEYS = {
    "date",
    "servings_offered",
    "student_pickups",
    "pantry_transfers",
    "expired_unclaimed",
}
ACTIVITY_KEYS = {
    "kind",
    "occurred_at",
    "occurred_at_iso",
    "food",
    "building_name",
    "servings",
    "is_simulated",
}
BRIEF_KEYS = {
    "generated_at",
    "expiring",
    "unclaimed_servings_total",
    "recent_completed_pickups",
    "buildings_with_food",
    "pantry_opportunities",
}
FORBIDDEN = (
    "nickname",
    "token",
    "photo",
    "priority",
    "demo-host",
    "demo-projector",
    "authorization",
    "bearer",
)

ATRIUM = {
    "id": "ksu-marietta-atrium-building",
    "name": "Atrium Building",
    "building_code": "J",
    "building_number": "680",
    "category": "academic",
    "latitude": 33.937145123456,
    "longitude": -84.51987654321,
    "verification_status": "verified",
    "sources": [{"url": "https://maps.kennesaw.edu/", "title": "Campus Map"}],
}
STUDENT_CENTER = {
    "id": "ksu-marietta-joe-mack-wilson-student-center",
    "name": "Joe Mack Wilson Student Center",
    "building_code": "A",
    "building_number": "685",
    "category": "student_life",
    "latitude": 33.937801,
    "longitude": -84.520412,
    "verification_status": "verified",
    "sources": [{"url": "https://maps.kennesaw.edu/", "title": "Campus Map"}],
}
UNVERIFIED_BUILDING = {
    "id": "ksu-marietta-unverified-annex",
    "name": "Unverified Annex",
    "building_code": "Z",
    "category": "other",
    "latitude": 33.939,
    "longitude": -84.521,
    "verification_status": "pending",
    "sources": [],
}
NO_COORDS_BUILDING = {
    "id": "ksu-marietta-missing-coords",
    "name": "Missing Coords Hall",
    "building_code": "Q",
    "category": "other",
    "latitude": None,
    "longitude": None,
    "verification_status": "verified",
    "sources": [],
}


def balanced_counts(
    available: int = 3,
    held: int = 1,
    picked_up: int = 2,
    pantry_held: int = 0,
    pantry_transferred: int = 0,
) -> dict[str, int]:
    """Build a balanced per-drop counts dict matching Owl Plate's ledger."""
    total = available + held + picked_up + pantry_held + pantry_transferred
    return {
        "total": total,
        "available": available,
        "held": held,
        "picked_up": picked_up,
        "pantry_held": pantry_held,
        "pantry_transferred": pantry_transferred,
    }


def make_drop(
    drop_id: str = DROP_A,
    *,
    status: str = "live",
    building: dict | None = None,
    counts: dict | None = None,
    items: list[dict] | None = None,
    notes: str = "Two boxed trays left from the robotics seminar.",
    expires_at: str | None = "2026-11-20T21:15:00Z",
    created_at: str = "2026-11-20T20:10:00Z",
    **overrides: object,
) -> dict:
    """Build a realistic GET /drops/{id} response with private fields to strip."""
    b = ATRIUM if building is None else building
    body: dict[str, object] = {
        "id": drop_id,
        "status": status,
        "building_code": b["id"] if isinstance(b, dict) else "J",
        "room": "214",
        "pickup_instructions": "Ask Jordan for secret side door",
        "building": b,
        "vision": {
            "items": items
            or [{"name": "Cheese pizza slices", "portion_unit": "slice", "count_estimate": 6}],
            "allergens_likely": ["dairy", "gluten"],
            "diet_tags": ["vegetarian"],
            "notes": notes,
        },
        "allergens_final": ["dairy", "gluten"],
        "diet_tags_final": ["vegetarian"],
        "counts": counts if counts is not None else balanced_counts(),
        "created_at": created_at,
        "expires_at": expires_at,
        "has_photo": True,
        "photo_url": f"/drops/{drop_id}/photo",
    }
    body.update(overrides)
    return body


def make_analytics_listing(
    drop_id: str,
    *,
    food: str = "Cheese pizza slices",
    category: str = "Pizza",
    building: dict | None = None,
    status: str = "live",
    available: int = 3,
    held: int = 1,
    picked_up: int = 2,
    pantry_held: int = 0,
    pantry_transferred: int = 0,
    published_at: str = "2026-11-20T20:10:00Z",
    expires_at: str = "2026-11-20T21:15:00Z",
    **overrides: object,
) -> dict:
    """Build one OperationsListing entry mirroring GET /analytics/operations."""
    total = available + held + picked_up + pantry_held + pantry_transferred
    row: dict[str, object] = {
        "drop_id": drop_id,
        "food": food,
        "category": category,
        "building": building or ATRIUM,
        "room": "214",
        "published_at": published_at,
        "expires_at": expires_at,
        "status": status,
        "has_photo": True,
        "photo_url": f"/drops/{drop_id}/photo",
        "total_servings": total,
        "available": available,
        "held": held,
        "picked_up": picked_up,
        "pantry_held": pantry_held,
        "pantry_transferred": pantry_transferred,
    }
    row.update(overrides)
    return row


def make_analytics(
    *,
    dataset_kind: str = "current",
    dataset_label: str = "Current app data",
    dataset_is_simulated: bool = False,
    listings: list[dict] | None = None,
    activity: list[dict] | None = None,
    series: list[dict] | None = None,
    summary_overrides: dict | None = None,
) -> dict:
    """Build a realistic GET /analytics/operations?period=7d response."""
    summary: dict[str, object] = {
        "published_listings": 4,
        "active_listings": 2,
        "total_servings_offered": 18,
        "available_servings": 7,
        "student_reserved_servings": 2,
        "student_pickups": 6,
        "pantry_reserved_servings": 1,
        "pantry_transfers": 2,
        "expired_unclaimed_servings": 0,
        "pending_pickup_reviews": 0,
        "pending_pantry_requests": 0,
        "buildings_served": 2,
        "joined_sessions": 5,
        "student_pickup_rate_percent": 33.3333,
        "combined_recovery_rate_percent": 44.4,
        "average_reservation_seconds": 180.0,
        "participating_hosts": 2,
        "participating_students": 4,
    }
    if summary_overrides:
        summary.update(summary_overrides)
    default_listings = [
        make_analytics_listing(
            DROP_A,
            food="Cheese pizza slices",
            category="Pizza",
            building=ATRIUM,
            available=3,
            held=1,
            picked_up=2,
            pantry_held=0,
            pantry_transferred=0,
            expires_at="2026-11-20T21:15:00Z",
        ),
        make_analytics_listing(
            DROP_B,
            food="Veggie wraps",
            category="Sandwiches & wraps",
            building=ATRIUM,
            available=4,
            held=1,
            picked_up=1,
            pantry_held=1,
            pantry_transferred=1,
            expires_at="2026-11-20T20:57:00Z",
        ),
    ]
    default_series = [
        {
            "date": "2026-11-20",
            "published_listings": 2,
            "servings_offered": 14,
            "student_pickups": 4,
            "pantry_transfers": 1,
            "expired_unclaimed": 0,
        },
        {
            "date": "2026-11-19",
            "published_listings": 1,
            "servings_offered": 4,
            "student_pickups": 2,
            "pantry_transfers": 1,
            "expired_unclaimed": 0,
        },
    ]
    default_activity = [
        {
            "kind": "listing_published",
            "occurred_at": "2026-11-20T20:10:00Z",
            "drop_id": DROP_A,
            "food": "Cheese pizza slices",
            "building_name": "Atrium Building",
            "servings": 6,
            "is_simulated": False,
        },
        {
            "kind": "student_pickup",
            "occurred_at": "2026-11-20T20:30:00Z",
            "drop_id": DROP_A,
            "food": "Cheese pizza slices",
            "building_name": "Atrium Building",
            "servings": 1,
            "is_simulated": False,
        },
    ]
    return {
        "schema_version": 1,
        "dataset": {
            "kind": dataset_kind,
            "label": dataset_label,
            "is_simulated": dataset_is_simulated,
            "seed_version": "recording-v1" if dataset_kind == "recording" else None,
            "anchor_time": "2026-11-20T20:42:07Z" if dataset_kind == "recording" else None,
        },
        "recording_available": True,
        "period": "7d",
        "timezone": "America/New_York",
        "window_start": "2026-11-14T05:00:00Z",
        "server_time": "2026-11-20T20:42:07Z",
        "summary": summary,
        "outcomes": {
            "available": 7,
            "student_reserved": 2,
            "student_pickups": 6,
            "pantry_reserved": 1,
            "pantry_transfers": 2,
            "expired_unclaimed": 0,
        },
        "series": default_series if series is None else series,
        "buildings": [],
        "activity": default_activity if activity is None else activity,
        "categories": [],
        "active_listings": default_listings if listings is None else listings,
        "estimates": {},
        "notes": [],
    }


def make_buildings_response(buildings: list[dict] | None = None) -> dict:
    """Build GET /buildings response including unverified entries to test filtering."""
    return {
        "campus": "marietta",
        "buildings": (
            [ATRIUM, STUDENT_CENTER, UNVERIFIED_BUILDING, NO_COORDS_BUILDING]
            if buildings is None
            else buildings
        ),
    }


class StubOwlPlate(BaseHTTPRequestHandler):
    analytics_status: ClassVar[int] = 200
    analytics_body: ClassVar[object] = None
    analytics_raw: ClassVar[bytes | None] = None

    buildings_status: ClassVar[int] = 200
    buildings_body: ClassVar[object] = None
    buildings_raw: ClassVar[bytes | None] = None

    drops: ClassVar[dict[str, tuple[int, object, bytes | None, str]]] = {}
    methods_seen: ClassVar[list[str]] = []

    def _send_json(self, status: int, body: object, raw: bytes | None) -> None:
        if status != 200:
            self.send_error(status)
            return
        payload = raw if raw is not None else json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        self.methods_seen.append("GET")
        if self.path == "/backend/analytics/operations?period=7d":
            if self.headers.get("Authorization") != "Bearer demo-projector":
                self.send_error(401)
                return
            self._send_json(self.analytics_status, self.analytics_body, self.analytics_raw)
            return
        if self.path == "/backend/buildings":
            self._send_json(self.buildings_status, self.buildings_body, self.buildings_raw)
            return
        if self.path.startswith("/backend/drops/"):
            drop_id = self.path.removeprefix("/backend/drops/")
            entry = self.drops.get(drop_id)
            if entry is None:
                self.send_error(404)
                return
            status, body, raw, required_role = entry
            auth = self.headers.get("Authorization")
            if required_role == "host_or_projector":
                if auth not in ("Bearer demo-host", "Bearer demo-projector"):
                    self.send_error(401)
                    return
            elif required_role == "projector_only":
                if auth == "Bearer demo-host":
                    self.send_error(404)
                    return
                if auth != "Bearer demo-projector":
                    self.send_error(401)
                    return
            else:
                if auth != "Bearer demo-host":
                    self.send_error(401)
                    return
            self._send_json(status, body, raw)
            return
        self.send_error(404)

    def do_POST(self) -> None:
        self.methods_seen.append("POST")
        self.send_error(405)

    def log_message(self, _format: str, *_args: object) -> None:
        return


def fake_it(folder: str, stdout: str = "", returncode: int = 0) -> tuple[Path, Path]:
    """Write an `it` stand-in that records argv and exits with the requested code."""
    recorder = Path(folder) / "it"
    output = Path(folder) / "args.json"
    recorder.write_text(
        "#!/usr/bin/env python3\n"
        "import json, pathlib, sys\n"
        f"pathlib.Path({str(output)!r}).write_text(json.dumps(sys.argv[1:]))\n"
        f"sys.stdout.write({stdout!r})\n"
        f"sys.exit({returncode})\n"
    )
    recorder.chmod(0o755)
    return recorder, output


class CommandCenterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), StubOwlPlate)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.thread.join(timeout=5)
        cls.server.server_close()

    def setUp(self) -> None:
        StubOwlPlate.analytics_status = 200
        StubOwlPlate.analytics_body = make_analytics()
        StubOwlPlate.analytics_raw = None
        StubOwlPlate.buildings_status = 200
        StubOwlPlate.buildings_body = make_buildings_response()
        StubOwlPlate.buildings_raw = None
        StubOwlPlate.drops = {
            DROP_A: (200, make_drop(DROP_A), None, "host_or_projector"),
            DROP_B: (
                200,
                make_drop(
                    DROP_B,
                    items=[{"name": "Veggie wraps", "portion_unit": "wrap", "count_estimate": 8}],
                    notes="Fresh spinach and hummus wraps from the student org lunch.",
                    counts=balanced_counts(
                        available=4, held=1, picked_up=1, pantry_held=1, pantry_transferred=1
                    ),
                    expires_at="2026-11-20T20:57:00Z",
                ),
                None,
                "host_or_projector",
            ),
            DROP_RECORDING_HOST_B: (
                200,
                make_drop(
                    DROP_RECORDING_HOST_B,
                    items=[{"name": "Fruit cups", "portion_unit": "cup", "count_estimate": 6}],
                    notes="Chilled melon and berry cups.",
                    building=STUDENT_CENTER,
                ),
                None,
                "projector_only",
            ),
        }
        StubOwlPlate.methods_seen = []

    def run_script(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, *args],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )

    def assert_error_state(self, state: dict, message: str) -> None:
        self.assertEqual(set(state), ERROR_KEYS)
        self.assertEqual(state["page_id"], PAGE_ID)
        self.assertIs(state["ok"], False)
        self.assertEqual(state["error"], message)

    def assert_no_private_leaks(self, text: str) -> None:
        lower = text.lower()
        for forbidden in FORBIDDEN:
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, lower)
        self.assertNotIn("jordan", lower)
        self.assertNotIn("side door", lower)

    # ── --refresh ──────────────────────────────────────────────────────────

    def test_refresh_builds_exact_contract_state_and_sums_per_building(self) -> None:
        state = campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW)
        self.assertEqual(set(state), REFRESH_KEYS)
        self.assertTrue(SELECTION_KEYS.isdisjoint(state))
        self.assertTrue(AGENT_KEYS.isdisjoint(state))
        self.assertIs(state["ok"], True)
        self.assertEqual(state["error"], "")
        self.assertEqual(state["page_id"], PAGE_ID)
        self.assertEqual(state["checked_at"], "3:42:07 PM")
        self.assertEqual(state["checked_at_iso"], "2026-11-20T20:42:07Z")

        # Summary mapping
        self.assertEqual(state["total_published_servings"], 18)
        self.assertEqual(state["available_servings"], 7)
        self.assertEqual(state["student_reserved_servings"], 2)
        self.assertEqual(state["completed_pickups"], 6)
        self.assertEqual(state["pantry_reserved_servings"], 1)
        self.assertEqual(state["pantry_transferred_simulated"], 2)
        self.assertEqual(state["student_recovery_percent"], 33.3)
        self.assertEqual(state["active_buildings_count"], 1)

        # Only verified buildings with valid coordinates survive; coordinates verbatim
        self.assertEqual(len(state["campus_buildings"]), 2)
        by_id = {b["id"]: b for b in state["campus_buildings"]}
        self.assertEqual(set(by_id), {ATRIUM["id"], STUDENT_CENTER["id"]})
        for entry in state["campus_buildings"]:
            self.assertEqual(set(entry), BUILDING_ENTRY_KEYS)

        atrium = by_id[ATRIUM["id"]]
        self.assertEqual(atrium["latitude"], ATRIUM["latitude"])
        self.assertEqual(atrium["longitude"], ATRIUM["longitude"])
        self.assertEqual(atrium["active_listings"], 2)
        self.assertEqual(atrium["total_servings"], 14)
        self.assertEqual(atrium["available_servings"], 7)
        self.assertEqual(atrium["held_servings"], 2)
        self.assertEqual(atrium["picked_up"], 3)
        self.assertEqual(atrium["pantry_held"], 1)
        self.assertEqual(atrium["pantry_transferred_simulated"], 1)

        sc = by_id[STUDENT_CENTER["id"]]
        self.assertEqual(sc["latitude"], STUDENT_CENTER["latitude"])
        self.assertEqual(sc["longitude"], STUDENT_CENTER["longitude"])
        self.assertEqual(sc["active_listings"], 0)
        self.assertEqual(sc["total_servings"], 0)
        self.assertEqual(sc["available_servings"], 0)

        # Listings shape + enriched descriptions
        self.assertEqual(len(state["active_listings"]), 2)
        for listing in state["active_listings"]:
            self.assertEqual(set(listing), LISTING_ENTRY_KEYS)
        by_drop = {item["drop_id"]: item for item in state["active_listings"]}
        self.assertEqual(by_drop[DROP_A]["answer"], "3 of 6 servings left")
        self.assertEqual(
            by_drop[DROP_A]["description"],
            "Two boxed trays left from the robotics seminar.",
        )

        # Trend points oldest first
        self.assertEqual([p["date"] for p in state["trend_points"]], ["2026-11-19", "2026-11-20"])
        for pt in state["trend_points"]:
            self.assertEqual(set(pt), TREND_KEYS)

        # Activity events newest first, drop_id removed
        self.assertEqual(len(state["activity_events"]), 2)
        self.assertEqual(state["activity_events"][0]["kind"], "student_pickup")
        self.assertEqual(state["activity_events"][1]["kind"], "listing_published")
        for ev in state["activity_events"]:
            self.assertEqual(set(ev), ACTIVITY_KEYS)
            self.assertNotIn("drop_id", ev)

        # Dataset label
        self.assertEqual(state["dataset_label"], "Current app data")
        self.assertIs(state["dataset_is_simulated"], False)

        # Read-only guarantee
        self.assertTrue(all(m == "GET" for m in StubOwlPlate.methods_seen))

    def test_refresh_keeps_live_plus_single_most_recent_expired_listing(self) -> None:
        StubOwlPlate.analytics_body = make_analytics(
            listings=[
                make_analytics_listing(DROP_A, building=ATRIUM, status="live"),
                make_analytics_listing(
                    DROP_EXPIRED_OLD,
                    food="Old bagels",
                    building=STUDENT_CENTER,
                    status="expired",
                    available=0,
                    held=0,
                    picked_up=4,
                    expires_at="2026-11-20T16:00:00Z",
                ),
                make_analytics_listing(
                    DROP_EXPIRED_NEW,
                    food="Recent pretzels",
                    building=STUDENT_CENTER,
                    status="expired",
                    available=0,
                    held=0,
                    picked_up=5,
                    expires_at="2026-11-20T19:30:00Z",
                ),
            ]
        )
        state = campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW)
        self.assertIs(state["ok"], True)
        ids = [item["drop_id"] for item in state["active_listings"]]
        self.assertEqual(ids, [DROP_A, DROP_EXPIRED_NEW])
        # Expired listings do NOT count toward active_buildings_count or live building totals
        self.assertEqual(state["active_buildings_count"], 1)
        by_id = {b["id"]: b for b in state["campus_buildings"]}
        self.assertEqual(by_id[STUDENT_CENTER["id"]]["active_listings"], 0)
        self.assertEqual(by_id[STUDENT_CENTER["id"]]["total_servings"], 0)
        expired_entry = state["active_listings"][1]
        self.assertEqual(expired_entry["answer"], "Listing ended")

    def test_refresh_discovers_recent_expired_drop_from_activity_when_none_live(self) -> None:
        StubOwlPlate.drops[DROP_EXPIRED_NEW] = (
            200,
            make_drop(
                DROP_EXPIRED_NEW,
                status="expired",
                building=STUDENT_CENTER,
                counts=balanced_counts(available=0, held=0, picked_up=4),
                items=[{"name": "Soft pretzels", "portion_unit": "piece", "count_estimate": 4}],
                expires_at="2026-11-20T19:00:00Z",
            ),
            None,
            "host_or_projector",
        )
        StubOwlPlate.analytics_body = make_analytics(
            listings=[],
            activity=[
                {
                    "kind": "listing_published",
                    "occurred_at": "2026-11-20T18:00:00Z",
                    "drop_id": DROP_EXPIRED_NEW,
                    "food": "Soft pretzels",
                    "building_name": STUDENT_CENTER["name"],
                    "servings": 4,
                    "is_simulated": False,
                }
            ],
        )
        state = campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW)
        self.assertIs(state["ok"], True)
        self.assertEqual(state["active_buildings_count"], 0)
        self.assertEqual([item["drop_id"] for item in state["active_listings"]], [DROP_EXPIRED_NEW])
        self.assertEqual(state["active_listings"][0]["answer"], "Listing ended")

    def test_refresh_activity_capped_at_12_newest_first_and_dataset_recording(self) -> None:
        events = [
            {
                "kind": "student_pickup",
                "occurred_at": (FIXED_NOW - timedelta(minutes=i)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "drop_id": DROP_A,
                "food": f"Item {i}",
                "building_name": ATRIUM["name"],
                "servings": 1,
                "is_simulated": True,
            }
            for i in range(18)
        ]
        # Scramble order to prove sorting
        scrambled = list(reversed(events))
        StubOwlPlate.analytics_body = make_analytics(
            dataset_kind="recording",
            dataset_label="Recording dataset — simulated data",
            dataset_is_simulated=False,  # kind == "recording" must force True
            activity=scrambled,
            series=[],
        )
        state = campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW)
        self.assertIs(state["ok"], True)
        self.assertEqual(state["dataset_label"], "Recording dataset — simulated data")
        self.assertIs(state["dataset_is_simulated"], True)
        self.assertEqual(state["trend_points"], [])
        self.assertEqual(len(state["activity_events"]), 12)
        self.assertEqual(state["activity_events"][0]["food"], "Item 0")
        self.assertEqual(state["activity_events"][-1]["food"], "Item 11")

    def test_refresh_fails_closed_on_invariant_violation_and_http_errors(self) -> None:
        bad_listing = make_analytics_listing(DROP_A)
        bad_listing["total_servings"] = 999  # breaks invariant
        StubOwlPlate.analytics_body = make_analytics(listings=[bad_listing])
        self.assert_error_state(
            campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW),
            campus_center.BAD_DATA,
        )

        StubOwlPlate.analytics_body = make_analytics()
        for code, msg in ((404, campus_center.NOT_FOUND), (500, campus_center.SERVER_ERROR)):
            with self.subTest(code=code):
                StubOwlPlate.analytics_status = code
                self.assert_error_state(
                    campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW), msg
                )

        StubOwlPlate.analytics_status = 200
        StubOwlPlate.analytics_raw = b"<html>bad json"
        self.assert_error_state(
            campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW),
            campus_center.BAD_DATA,
        )

        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        self.assert_error_state(
            campus_center.refresh_campus(f"http://127.0.0.1:{port}", PAGE_ID, now=FIXED_NOW),
            campus_center.UNREACHABLE,
        )

    # ── --select-building ──────────────────────────────────────────────────

    def test_select_building_valid_and_invalid(self) -> None:
        ok_state = campus_center.select_building(self.base, PAGE_ID, ATRIUM["id"], now=FIXED_NOW)
        self.assertEqual(set(ok_state), SELECT_BUILDING_KEYS)
        self.assertEqual(ok_state["selected_building_id"], ATRIUM["id"])
        self.assertIs(ok_state["ok"], True)
        self.assertEqual(ok_state["error"], "")

        unknown = campus_center.select_building(
            self.base, PAGE_ID, "ksu-marietta-nonexistent", now=FIXED_NOW
        )
        self.assert_error_state(unknown, campus_center.BUILDING_NOT_FOUND)
        self.assertNotIn("selected_building_id", unknown)

        unverified = campus_center.select_building(
            self.base, PAGE_ID, UNVERIFIED_BUILDING["id"], now=FIXED_NOW
        )
        self.assert_error_state(unverified, campus_center.BUILDING_NOT_FOUND)

    # ── --inspect and --whats-left ─────────────────────────────────────────

    def test_inspect_and_whats_left_shapes_and_answers(self) -> None:
        long_note = "Freshly prepared trays " + ("x" * 200)
        StubOwlPlate.drops[DROP_A] = (
            200,
            make_drop(
                DROP_A,
                items=[
                    {
                        "name": "Margherita pizza slices",
                        "portion_unit": "slice",
                        "count_estimate": 4,
                    },
                    {"name": "Garden salad", "portion_unit": "bowl", "count_estimate": 2},
                ],
                notes=long_note,
                counts=balanced_counts(available=3, held=1, picked_up=2),
            ),
            None,
            "host_or_projector",
        )
        inspected = campus_center.inspect_drop(
            self.base, PAGE_ID, DROP_A, include_answer=False, now=FIXED_NOW
        )
        self.assertEqual(set(inspected), INSPECT_KEYS)
        self.assertIs(inspected["ok"], True)
        self.assertEqual(inspected["selected_drop_id"], DROP_A)
        self.assertEqual(inspected["selected_building_id"], ATRIUM["id"])
        self.assertIsNone(inspected["selected_answer"])
        listing = inspected["selected_listing"]
        self.assertEqual(set(listing), LISTING_ENTRY_KEYS)
        self.assertEqual(listing["food"], "Margherita pizza slices, Garden salad")
        self.assertEqual(len(listing["description"]), 160)
        self.assertTrue(listing["description"].endswith("…"))
        self.assertEqual(listing["category"], "Pizza")
        self.assertEqual(listing["answer"], "3 of 6 servings left")

        wl = campus_center.inspect_drop(
            self.base, PAGE_ID, DROP_A, include_answer=True, now=FIXED_NOW
        )
        self.assertEqual(wl["selected_answer"], "3 of 6 servings left")

        cases = [
            ("live", balanced_counts(available=1, held=0, picked_up=0), "1 of 1 serving left"),
            ("live", balanced_counts(available=0, held=0, picked_up=3), "All servings taken"),
            (
                "claimed_out",
                balanced_counts(available=0, held=0, picked_up=3),
                "All servings taken",
            ),
            ("expired", balanced_counts(available=2, held=0, picked_up=1), "Listing ended"),
            ("draft", balanced_counts(available=3, held=0, picked_up=0), "Not published yet"),
        ]
        for status, cnts, expected_answer in cases:
            with self.subTest(status=status, counts=cnts):
                StubOwlPlate.drops[DROP_A] = (
                    200,
                    make_drop(
                        DROP_A,
                        status=status,
                        counts=cnts,
                        expires_at=None if status == "draft" else "2026-11-20T21:15:00Z",
                    ),
                    None,
                    "host_or_projector",
                )
                state = campus_center.inspect_drop(
                    self.base, PAGE_ID, DROP_A, include_answer=True, now=FIXED_NOW
                )
                self.assertIs(state["ok"], True)
                self.assertEqual(state["selected_answer"], expected_answer)
                self.assertEqual(state["selected_listing"]["answer"], expected_answer)

    def test_inspect_falls_back_to_projector_for_secondary_recording_host(self) -> None:
        state = campus_center.inspect_drop(
            self.base, PAGE_ID, DROP_RECORDING_HOST_B, include_answer=True, now=FIXED_NOW
        )
        self.assertIs(state["ok"], True)
        self.assertEqual(state["selected_building_id"], STUDENT_CENTER["id"])
        self.assertEqual(state["selected_listing"]["food"], "Fruit cups")

    def test_inspect_unbalanced_counts_fails_closed(self) -> None:
        StubOwlPlate.drops[DROP_A] = (
            200,
            make_drop(
                DROP_A,
                counts={"total": 5, "available": 3, "held": 1, "picked_up": 0},
            ),
            None,
            "host_or_projector",
        )
        state = campus_center.inspect_drop(
            self.base, PAGE_ID, DROP_A, include_answer=True, now=FIXED_NOW
        )
        self.assert_error_state(state, campus_center.BAD_DATA)

    # ── --respond, --recommend, --dismiss-recommendations ──────────────────

    def test_respond_valid_and_invalid_cli(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            ok = self.run_script(
                str(HERE / "campus_center.py"),
                "--respond",
                "  3 servings left in Atrium Room 214.  ",
                "--it-patch",
                PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(ok.returncode, 0, ok.stderr)
            args = json.loads(output.read_text())
            self.assertEqual(args[:2], ["patch", PAGE_ID])
            patched = json.loads(args[2])
            self.assertEqual(patched["agent_status"], "ready")
            self.assertEqual(patched["agent_response"], "3 servings left in Atrium Room 214.")
            self.assertEqual(patched["agent_error"], "")
            self.assertIs(patched["ok"], True)
            self.assertIn("agent_updated_at", patched)
            self.assertIn("agent_updated_at_iso", patched)

        for bad_text in ("", "   \n\t ", "a" * 601):
            with self.subTest(length=len(bad_text)), tempfile.TemporaryDirectory() as folder:
                recorder, output = fake_it(folder)
                res = self.run_script(
                    str(HERE / "campus_center.py"),
                    "--respond",
                    bad_text,
                    "--it-patch",
                    PAGE_ID,
                    "--it-bin",
                    str(recorder),
                )
                self.assertEqual(res.returncode, 2)
                self.assertFalse(output.exists())

        # Exact boundary 600 chars succeeds
        state_600 = campus_center.respond_state(PAGE_ID, "a" * 600, now=FIXED_NOW)
        self.assertEqual(len(state_600["agent_response"]), 600)

    def test_recommend_valid_and_invalid_cli(self) -> None:
        valid = json.dumps(
            [
                {"title": "Check Atrium Room 214", "detail": "4 veggie wraps expire in 15 min."},
                {
                    "title": "Prepare pantry handoff",
                    "detail": "Review unclaimed trays before 4 PM.",
                },
            ]
        )
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            ok = self.run_script(
                str(HERE / "campus_center.py"),
                "--recommend",
                valid,
                "--it-patch",
                PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(ok.returncode, 0, ok.stderr)
            patched = json.loads(json.loads(output.read_text())[2])
            self.assertEqual(len(patched["agent_recommendations"]), 2)
            self.assertNotIn("agent_response", patched)

        bad_payloads = [
            "not json",
            json.dumps({"title": "obj", "detail": "not a list"}),
            json.dumps([]),
            json.dumps([{"title": f"T{i}", "detail": "D"} for i in range(7)]),
            json.dumps([{"title": "Missing detail"}]),
            json.dumps([{"title": "Extra", "detail": "Ok", "extra": 1}]),
            json.dumps([{"title": "", "detail": "Empty title"}]),
            json.dumps([{"title": "t" * 81, "detail": "Title too long"}]),
            json.dumps([{"title": "Detail too long", "detail": "d" * 281}]),
            json.dumps([{"title": 123, "detail": "Non-string"}]),
        ]
        for raw in bad_payloads:
            with self.subTest(raw=raw[:40]), tempfile.TemporaryDirectory() as folder:
                recorder, output = fake_it(folder)
                res = self.run_script(
                    str(HERE / "campus_center.py"),
                    "--recommend",
                    raw,
                    "--it-patch",
                    PAGE_ID,
                    "--it-bin",
                    str(recorder),
                )
                self.assertEqual(res.returncode, 2)
                self.assertFalse(output.exists())

    def test_dismiss_recommendations_clears_list_only(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            res = self.run_script(
                str(HERE / "campus_center.py"),
                "--dismiss-recommendations",
                "--it-patch",
                PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            patched = json.loads(json.loads(output.read_text())[2])
            self.assertEqual(patched["agent_recommendations"], [])
            self.assertNotIn("agent_response", patched)
            self.assertIs(patched["ok"], True)

    # ── --brief ────────────────────────────────────────────────────────────

    def test_brief_prints_facts_only_and_never_patches(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            res = self.run_script(
                str(HERE / "campus_center.py"),
                "--base",
                self.base,
                "--brief",
                "--it-patch",
                PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertFalse(output.exists())
            brief = json.loads(res.stdout)
            self.assertEqual(set(brief), BRIEF_KEYS)
            self.assertEqual(brief["unclaimed_servings_total"], 7)
            self.assertEqual(len(brief["expiring"]), 2)
            # Soonest expiring first (DROP_B expires before DROP_A)
            self.assertEqual(brief["expiring"][0]["drop_id"], DROP_B)
            self.assertEqual(brief["expiring"][1]["drop_id"], DROP_A)
            for item in brief["expiring"]:
                self.assertEqual(
                    set(item),
                    {"drop_id", "food", "building_name", "minutes_left", "available_servings"},
                )
            self.assertEqual(
                brief["buildings_with_food"],
                [{"building_id": ATRIUM["id"], "name": ATRIUM["name"], "available_servings": 7}],
            )
            self.assertEqual(len(brief["recent_completed_pickups"]), 1)
            self.assertEqual(
                set(brief["recent_completed_pickups"][0]),
                {"food", "building_name", "occurred_at"},
            )
            self.assertEqual(len(brief["pantry_opportunities"]), 2)
            for item in brief["pantry_opportunities"]:
                self.assertEqual(
                    set(item), {"drop_id", "food", "building_name", "unclaimed_servings"}
                )
            # Facts only: no agent prose fields
            for prose_key in ("summary", "insight", "recommendation", "message", "agent_response"):
                self.assertNotIn(prose_key, brief)
            self.assert_no_private_leaks(res.stdout + res.stderr)

    # ── --it-patch guard & privacy ─────────────────────────────────────────

    def test_it_patch_mismatch_exits_2_and_never_calls_it(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            res = self.run_script(
                str(HERE / "campus_center.py"),
                "--base",
                self.base,
                "--refresh",
                "--it-patch",
                OTHER_PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(res.returncode, 2)
            self.assertIn("--it-patch must be", res.stderr)
            self.assertFalse(output.exists())

    def test_privacy_across_all_states_and_brief(self) -> None:
        payloads = [
            campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW),
            campus_center.initial_state(self.base, PAGE_ID, now=FIXED_NOW),
            campus_center.select_building(self.base, PAGE_ID, ATRIUM["id"], now=FIXED_NOW),
            campus_center.inspect_drop(
                self.base, PAGE_ID, DROP_A, include_answer=True, now=FIXED_NOW
            ),
            campus_center.build_brief(self.base, now=FIXED_NOW),
        ]
        StubOwlPlate.analytics_status = 500
        payloads.append(campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW))
        for obj in payloads:
            self.assert_no_private_leaks(json.dumps(obj, ensure_ascii=False))

    # ── create_command_center.py ───────────────────────────────────────────

    def test_create_command_center_passes_full_state_and_prints_all_handlers(self) -> None:
        url = "http://127.0.0.1:4848/p/owl-rescue-command-center"
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder, json.dumps({"id": PAGE_ID, "url": url}))
            res = self.run_script(
                str(HERE / "create_command_center.py"),
                "--base",
                self.base,
                "--it-bin",
                str(recorder),
                "--open",
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            args = json.loads(output.read_text())
            self.assertEqual(args[0], "create")
            self.assertEqual(args[1], "Owl Plate – Campus Rescue Command Center")
            self.assertEqual(args[args.index("--id") + 1], PAGE_ID)
            self.assertTrue(args[args.index("--file") + 1].endswith("command-center.html"))
            self.assertEqual(args[-1], "--open")
            state = json.loads(args[args.index("--state") + 1])
            self.assertEqual(set(state), INITIAL_KEYS)
            self.assertEqual(state["page_id"], PAGE_ID)
            self.assertEqual(state["agent_status"], "idle")
            self.assertEqual(state["agent_response"], "")
            self.assertEqual(state["agent_recommendations"], [])
            self.assertIsNone(state["selected_building_id"])
            self.assertIsNone(state["selected_drop_id"])
            self.assertIsNone(state["selected_listing"])
            self.assertIsNone(state["selected_answer"])

            self.assertIn(f"Page: {url}\n", res.stdout)
            self.assertIn("Action handler:\n", res.stdout)
            expected_flags = (
                "--refresh",
                "--select-building <building_id>",
                "--inspect <drop_id>",
                "--whats-left <drop_id>",
                "--brief",
                "--respond",
                "--recommend",
                "--dismiss-recommendations",
            )
            for flag in expected_flags:
                with self.subTest(flag=flag):
                    self.assertIn(flag, res.stdout)
            for line in res.stdout.splitlines():
                if "campus_center.py" in line:
                    self.assertIn(f"--base {self.base}", line)
                    self.assertIn(f"--page-id {PAGE_ID}", line)
                    self.assertIn(f"--it-patch {PAGE_ID}", line)
                    self.assertIn(f"--it-bin {recorder}", line)
            self.assert_no_private_leaks(res.stdout + res.stderr + json.dumps(args))

    def test_create_command_center_works_without_any_active_drop(self) -> None:
        StubOwlPlate.analytics_body = make_analytics(
            listings=[],
            activity=[],
            series=[],
            summary_overrides={
                "published_listings": 0,
                "active_listings": 0,
                "total_servings_offered": 0,
                "available_servings": 0,
                "student_reserved_servings": 0,
                "student_pickups": 0,
                "pantry_reserved_servings": 0,
                "pantry_transfers": 0,
                "student_pickup_rate_percent": 0.0,
            },
        )
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder, "page created\n")
            res = self.run_script(
                str(HERE / "create_command_center.py"),
                "--base",
                self.base,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            args = json.loads(output.read_text())
            self.assertNotIn("--open", args)
            state = json.loads(args[args.index("--state") + 1])
            self.assertIs(state["ok"], True)
            self.assertEqual(state["active_listings"], [])
            self.assertEqual(state["active_buildings_count"], 0)
            self.assertEqual(len(state["campus_buildings"]), 2)
            self.assertIn("Page: page created\n", res.stdout)

    def test_create_command_center_propagates_it_create_failure(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            recorder, _ = fake_it(folder, "it create failed\n", returncode=1)
            res = self.run_script(
                str(HERE / "create_command_center.py"),
                "--base",
                self.base,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(res.returncode, 1)
            self.assertIn("it create failed", res.stdout)

    def test_create_command_center_falls_back_cleanly_when_owl_plate_is_down(self) -> None:
        StubOwlPlate.analytics_status = 500
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder, "page created\n")
            res = self.run_script(
                str(HERE / "create_command_center.py"),
                "--base",
                self.base,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            args = json.loads(output.read_text())
            state = json.loads(args[args.index("--state") + 1])
            self.assertEqual(set(state), ERROR_KEYS | SELECTION_KEYS | AGENT_KEYS)
            self.assertIs(state["ok"], False)
            self.assertEqual(state["error"], campus_center.SERVER_ERROR)
            self.assertEqual(state["agent_status"], "idle")
            self.assertEqual(state["agent_response"], "")
            self.assertEqual(state["agent_recommendations"], [])

    def test_cli_fail_closed_patches_only_error_keys_and_rejects_bad_uuid(self) -> None:
        StubOwlPlate.analytics_status = 500
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            res = self.run_script(
                str(HERE / "campus_center.py"),
                "--base",
                self.base,
                "--refresh",
                "--it-patch",
                PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(res.returncode, 0, res.stderr)
            patched = json.loads(json.loads(output.read_text())[2])
            self.assertEqual(set(patched), ERROR_KEYS)
            self.assertIs(patched["ok"], False)
            self.assert_no_private_leaks(res.stdout + res.stderr)

        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            bad_uuid = self.run_script(
                str(HERE / "campus_center.py"),
                "--base",
                self.base,
                "--inspect",
                "../../students",
                "--it-patch",
                PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(bad_uuid.returncode, 2)
            self.assertFalse(output.exists())

    def test_brief_exits_nonzero_and_patches_nothing_on_error(self) -> None:
        StubOwlPlate.analytics_status = 500
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            res = self.run_script(
                str(HERE / "campus_center.py"),
                "--base",
                self.base,
                "--brief",
                "--it-patch",
                PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(res.returncode, 1)
            self.assertFalse(output.exists())
            body = json.loads(res.stdout)
            self.assertIs(body["ok"], False)
            self.assert_no_private_leaks(res.stdout + res.stderr)

    def test_claimed_out_listing_stays_inspectable_but_not_counted_as_live(self) -> None:
        StubOwlPlate.analytics_body = make_analytics(
            listings=[
                make_analytics_listing(
                    DROP_A,
                    building=ATRIUM,
                    status="claimed_out",
                    available=0,
                    held=0,
                    picked_up=6,
                )
            ]
        )
        state = campus_center.refresh_campus(self.base, PAGE_ID, now=FIXED_NOW)
        self.assertIs(state["ok"], True)
        self.assertEqual(state["active_buildings_count"], 0)
        self.assertEqual(len(state["active_listings"]), 1)
        self.assertEqual(state["active_listings"][0]["answer"], "All servings taken")
        by_id = {b["id"]: b for b in state["campus_buildings"]}
        self.assertEqual(by_id[ATRIUM["id"]]["active_listings"], 0)
        self.assertEqual(by_id[ATRIUM["id"]]["total_servings"], 0)


if __name__ == "__main__":
    unittest.main()
