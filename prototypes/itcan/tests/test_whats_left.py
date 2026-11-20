"""Stand-in contract tests for the exact-drop It pickup companion helpers.

These use a local stub of Owl Plate and a fake `it` binary; no network and no
real It page. They follow prototypes/itcan/STATE_CONTRACT.md.
"""

from __future__ import annotations

import json
import re
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import whats_left

DROP_ID = "123e4567-e89b-42d3-a456-426614174000"
PAGE_ID = f"owl-whats-left-{DROP_ID}"
OTHER_DROP_ID = "223e4567-e89b-42d3-a456-426614174000"
COUNT_KEYS = {"total", "available", "held", "picked_up", "pantry_held", "pantry_transferred"}
FULL_KEYS = COUNT_KEYS | {
    "drop_id",
    "page_id",
    "food_name",
    "location",
    "status_label",
    "checked_at",
    "checked_at_iso",
    "answer",
    "ok",
    "error",
}
ERROR_KEYS = {"drop_id", "page_id", "checked_at", "checked_at_iso", "ok", "error"}
FORBIDDEN = ("nickname", "token", "photo", "url", "allergen", "priority", "bearer", "demo-host")
UTC = ZoneInfo("UTC")
FIXED_NOW = datetime(2026, 11, 20, 20, 42, 7, tzinfo=UTC)  # 3:42:07 PM EST


def counts(available: int = 3, held: int = 0, picked_up: int = 0, **pantry: int) -> dict:
    """Build balanced counts; total follows the contract invariant."""
    values = {"available": available, "held": held, "picked_up": picked_up, **pantry}
    return {"total": sum(values.values()), **values}


def drop_body(**overrides: object) -> dict:
    """A realistic host drop response, including fields the companion must drop."""
    body = {
        "id": DROP_ID,
        "status": "live",
        "building_code": "J",
        "room": "214",
        "pickup_instructions": "Ask for Sam at the front desk",
        "building": {
            "id": "ksu-marietta-atrium",
            "name": "Atrium Building",
            "building_code": "J",
            "sources": [{"url": "https://example.edu/map", "title": "Map"}],
        },
        "vision": {
            "items": [
                {"name": "Margherita pizza slices", "portion_unit": "slice", "count_estimate": 3}
            ],
            "allergens_likely": ["milk", "wheat"],
            "notes": "",
        },
        "allergens_final": ["milk", "wheat"],
        "allergen_notice": "may contain, confirm with host",
        "counts": counts(),
        "has_photo": True,
        "photo_url": "/drops/photo/abc",
    }
    body.update(overrides)
    return body


class StubOwlPlate(BaseHTTPRequestHandler):
    status: ClassVar[int] = 200
    body: ClassVar[object] = None
    raw: ClassVar[bytes | None] = None

    def do_GET(self) -> None:
        if self.path != f"/backend/drops/{DROP_ID}":
            self.send_error(404)
            return
        if self.headers.get("Authorization") != "Bearer demo-host":
            self.send_error(401)
            return
        if self.status != 200:
            self.send_error(self.status)
            return
        payload = self.raw if self.raw is not None else json.dumps(self.body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, _format: str, *_args: object) -> None:
        return


def fake_it(folder: str, stdout: str = "") -> tuple[Path, Path]:
    """Write an `it` stand-in that records its argv and prints canned stdout."""
    recorder = Path(folder) / "it"
    output = Path(folder) / "args.json"
    recorder.write_text(
        "#!/usr/bin/env python3\n"
        "import json, pathlib, sys\n"
        f"pathlib.Path({str(output)!r}).write_text(json.dumps(sys.argv[1:]))\n"
        f"sys.stdout.write({stdout!r})\n"
    )
    recorder.chmod(0o755)
    return recorder, output


class CompanionTests(unittest.TestCase):
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
        StubOwlPlate.status = 200
        StubOwlPlate.body = drop_body()
        StubOwlPlate.raw = None

    def state(self, base: str | None = None) -> dict:
        return whats_left.whats_left(base or self.base, DROP_ID, now=FIXED_NOW)

    def assert_error_state(self, state: dict, message: str) -> None:
        self.assertEqual(set(state), ERROR_KEYS)
        self.assertIs(state["ok"], False)
        self.assertEqual(state["error"], message)
        self.assertEqual((state["drop_id"], state["page_id"]), (DROP_ID, PAGE_ID))
        self.assertTrue(COUNT_KEYS.isdisjoint(state))

    def test_happy_path_builds_full_contract_state(self) -> None:
        state = self.state()
        self.assertEqual(set(state), FULL_KEYS)
        self.assertEqual(state["drop_id"], DROP_ID)
        self.assertEqual(state["page_id"], PAGE_ID)
        self.assertEqual(state["food_name"], "Margherita pizza slices")
        self.assertEqual(state["location"], "Atrium Building · Room 214")
        self.assertEqual(state["status_label"], "Available now")
        expected = {"total": 3, "available": 3, "held": 0, "picked_up": 0}
        self.assertEqual(
            {key: state[key] for key in COUNT_KEYS},
            {**expected, "pantry_held": 0, "pantry_transferred": 0},
        )
        self.assertEqual(state["answer"], "3 of 3 servings left")
        self.assertIs(state["ok"], True)
        self.assertEqual(state["error"], "")

    def test_food_name_joins_items_and_truncates_at_80(self) -> None:
        items = [{"name": "Margherita pizza slices"}, {"name": "Garden salad"}]
        StubOwlPlate.body = drop_body(vision={"items": items})
        self.assertEqual(self.state()["food_name"], "Margherita pizza slices, Garden salad")
        StubOwlPlate.body = drop_body(vision={"items": [{"name": "x" * 100}]})
        name = self.state()["food_name"]
        self.assertEqual(len(name), 80)
        self.assertTrue(name.endswith("…"))

    def test_location_falls_back_to_building_code_and_omits_empty_room(self) -> None:
        StubOwlPlate.body = drop_body(building=None, room="")
        self.assertEqual(self.state()["location"], "J")
        StubOwlPlate.body = drop_body(room="  ")
        self.assertEqual(self.state()["location"], "Atrium Building")

    def test_status_labels_and_answers(self) -> None:
        cases = {
            "claimed_out": ("All servings taken", "All servings taken"),
            "expired": ("Listing ended", "Listing ended"),
            "draft": ("Not published yet", "Not published yet"),
        }
        for status, (label, answer) in cases.items():
            with self.subTest(status=status):
                StubOwlPlate.body = drop_body(status=status)
                state = self.state()
                self.assertEqual((state["status_label"], state["answer"]), (label, answer))
        StubOwlPlate.body = drop_body(counts=counts(available=0, picked_up=3))
        self.assertEqual(self.state()["answer"], "All servings taken")

    def test_known_answers_across_reserve_and_pickup(self) -> None:
        steps = [
            (counts(available=3), (3, 3, 0, 0), "3 of 3 servings left"),
            (counts(available=2, held=1), (3, 2, 1, 0), "2 of 3 servings left"),
            (counts(available=2, picked_up=1), (3, 2, 0, 1), "2 of 3 servings left"),
        ]
        for body_counts, expected, answer in steps:
            with self.subTest(counts=body_counts):
                StubOwlPlate.body = drop_body(counts=body_counts)
                state = self.state()
                got = (state["total"], state["available"], state["held"], state["picked_up"])
                self.assertEqual(got, expected)
                self.assertEqual(state["answer"], answer)
                self.assertEqual(state["page_id"], PAGE_ID)

    def test_legacy_counts_default_pantry_fields_to_zero(self) -> None:
        StubOwlPlate.body = drop_body(
            counts={"total": 2, "available": 1, "held": 0, "picked_up": 1}
        )
        state = self.state()
        self.assertIs(state["ok"], True)
        self.assertEqual((state["pantry_held"], state["pantry_transferred"]), (0, 0))

    def test_pantry_counts_stay_separate_from_student_pickups(self) -> None:
        StubOwlPlate.body = drop_body(
            status="claimed_out", counts=counts(available=0, picked_up=1, pantry_transferred=1)
        )
        state = self.state()
        self.assertEqual((state["picked_up"], state["pantry_transferred"]), (1, 1))

    def test_invariant_violations_fail_closed(self) -> None:
        bad = [
            {"total": 3, "available": 3, "held": 1, "picked_up": 0},
            {
                "total": 2,
                "available": 1,
                "held": 0,
                "picked_up": 1,
                "pantry_held": -1,
                "pantry_transferred": 1,
            },
            {"total": 2, "available": "2", "held": 0, "picked_up": 0},
            {"total": 2, "available": True, "held": 1, "picked_up": 0},
            {"total": 2, "available": 2, "held": 0},
        ]
        for body_counts in bad:
            with self.subTest(counts=body_counts):
                StubOwlPlate.body = drop_body(counts=body_counts)
                self.assert_error_state(self.state(), whats_left.BAD_DATA)

    def test_bad_json_and_wrong_listing_fail_closed(self) -> None:
        StubOwlPlate.raw = b"<html>not json"
        self.assert_error_state(self.state(), whats_left.BAD_DATA)
        StubOwlPlate.raw = None
        StubOwlPlate.body = drop_body(id=OTHER_DROP_ID)
        self.assert_error_state(self.state(), whats_left.BAD_DATA)
        StubOwlPlate.body = drop_body(status="archived")
        self.assert_error_state(self.state(), whats_left.BAD_DATA)

    def test_http_errors_fail_closed(self) -> None:
        for code, message in ((404, whats_left.NOT_FOUND), (500, whats_left.SERVER_ERROR)):
            with self.subTest(code=code):
                StubOwlPlate.status = code
                self.assert_error_state(self.state(), message)

    def test_connection_refused_fails_closed(self) -> None:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        state = self.state(f"http://127.0.0.1:{port}")
        self.assert_error_state(state, whats_left.UNREACHABLE)

    def test_checked_at_is_eastern_display_time_and_utc_iso(self) -> None:
        state = self.state()
        self.assertEqual(state["checked_at"], "3:42:07 PM")
        self.assertEqual(state["checked_at_iso"], "2026-11-20T20:42:07Z")
        summer = datetime(2026, 7, 1, 4, 5, 6, tzinfo=UTC)  # 12:05:06 AM EDT
        stamped = whats_left.whats_left(self.base, DROP_ID, now=summer)
        self.assertEqual(stamped["checked_at"], "12:05:06 AM")
        self.assertEqual(stamped["checked_at_iso"], "2026-07-01T04:05:06Z")
        self.assertRegex(
            whats_left.whats_left(self.base, DROP_ID)["checked_at"],
            r"^(1[0-2]|[1-9]):[0-5]\d:[0-5]\d [AP]M$",
        )

    def test_state_never_contains_private_fields(self) -> None:
        states = [self.state()]
        StubOwlPlate.status = 500
        states.append(self.state())
        for state in states:
            text = json.dumps(state, ensure_ascii=False).lower()
            for word in FORBIDDEN:
                with self.subTest(word=word, ok=state["ok"]):
                    self.assertNotIn(word, text)
            self.assertNotIn("sam", text)

    def test_drop_id_must_be_a_uuid(self) -> None:
        self.assertEqual(whats_left.page_id_for_drop(DROP_ID.upper()), PAGE_ID)
        with self.assertRaises(ValueError):
            whats_left.canonical_drop_id("../../students")

    def run_script(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, *args], check=False, capture_output=True, text=True, timeout=30
        )

    def test_patch_refuses_mismatched_page_id(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            completed = self.run_script(
                str(HERE / "whats_left.py"),
                "--base",
                self.base,
                "--drop-id",
                DROP_ID,
                "--it-patch",
                f"owl-whats-left-{OTHER_DROP_ID}",
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(completed.returncode, 2)
            self.assertIn("--it-patch must be", completed.stderr)
            self.assertFalse(output.exists())

    def test_patch_sends_full_state_to_exact_page(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            completed = self.run_script(
                str(HERE / "whats_left.py"),
                "--base",
                self.base,
                "--drop-id",
                DROP_ID,
                "--it-patch",
                PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            args = json.loads(output.read_text())
            self.assertEqual(args[:2], ["patch", PAGE_ID])
            state = json.loads(args[2])
            self.assertEqual(set(state), FULL_KEYS)
            self.assertEqual(state["answer"], "3 of 3 servings left")
            self.assertEqual(json.loads(completed.stdout), state)

    def test_patch_on_error_omits_counts(self) -> None:
        StubOwlPlate.status = 500
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder)
            completed = self.run_script(
                str(HERE / "whats_left.py"),
                "--base",
                self.base,
                "--drop-id",
                DROP_ID,
                "--it-patch",
                PAGE_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            state = json.loads(json.loads(output.read_text())[2])
            self.assertEqual(set(state), ERROR_KEYS)
            self.assertNotIn("demo-host", completed.stderr + completed.stdout)

    def test_create_passes_initial_snapshot_and_prints_url(self) -> None:
        url = "http://127.0.0.1:4848/p/owl-whats-left-x"
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder, json.dumps({"id": PAGE_ID, "url": url}))
            completed = self.run_script(
                str(HERE / "create_companion.py"),
                "--base",
                self.base,
                "--drop-id",
                DROP_ID,
                "--it-bin",
                str(recorder),
                "--open",
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            args = json.loads(output.read_text())
            self.assertEqual(args[0], "create")
            self.assertEqual(args[args.index("--id") + 1], PAGE_ID)
            self.assertEqual(args[-1], "--open")
            state = json.loads(args[args.index("--state") + 1])
            self.assertEqual(set(state), FULL_KEYS)
            self.assertEqual((state["drop_id"], state["page_id"]), (DROP_ID, PAGE_ID))
            self.assertEqual(state["available"], 3)
            self.assertIn(f"Page: {url}\n", completed.stdout)
            handler = re.search(r"^Action handler: (.+)$", completed.stdout, re.MULTILINE)
            self.assertIsNotNone(handler)
            self.assertIn(f"--drop-id {DROP_ID} --it-patch {PAGE_ID}", handler.group(1))
            self.assertIn(f"--base {self.base}", handler.group(1))
            self.assertNotIn("demo-host", completed.stdout + completed.stderr + json.dumps(args))

    def test_create_falls_back_to_binding_when_owl_plate_is_down(self) -> None:
        StubOwlPlate.status = 500
        with tempfile.TemporaryDirectory() as folder:
            recorder, output = fake_it(folder, "page created\n")
            completed = self.run_script(
                str(HERE / "create_companion.py"),
                "--base",
                self.base,
                "--drop-id",
                DROP_ID,
                "--it-bin",
                str(recorder),
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            args = json.loads(output.read_text())
            state = json.loads(args[args.index("--state") + 1])
            self.assertEqual(set(state), ERROR_KEYS)
            self.assertIs(state["ok"], False)
            self.assertIn("Page: page created\n", completed.stdout)
            self.assertNotIn("--open", args)


if __name__ == "__main__":
    unittest.main()
