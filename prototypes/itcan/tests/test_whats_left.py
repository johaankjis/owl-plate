"""Focused contract tests for the exact-drop It pickup companion."""

import json
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import whats_left

DROP_ID = "123e4567-e89b-42d3-a456-426614174000"
PAGE_ID = f"owl-whats-left-{DROP_ID}"


class AggregateHandler(BaseHTTPRequestHandler):
    counts: ClassVar[dict[str, int]] = {"total": 2, "available": 2, "held": 0, "picked_up": 0}

    def do_GET(self) -> None:
        if self.path != f"/backend/drops/{DROP_ID}":
            self.send_error(404)
            return
        if self.headers.get("Authorization") != "Bearer demo-host":
            self.send_error(401)
            return
        body = json.dumps({"status": "live", "counts": self.counts}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


class CompanionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), AggregateHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.thread.join(timeout=5)
        cls.server.server_close()

    def test_reads_only_bound_drop_aggregate_counts(self) -> None:
        result = whats_left.whats_left(self.base, DROP_ID)
        self.assertEqual(result["drop_id"], DROP_ID)
        self.assertEqual(result["available"], 2)
        self.assertEqual(result["held"], 0)
        self.assertEqual(result["picked_up"], 0)
        self.assertNotIn("student", json.dumps(result).lower())
        self.assertNotIn("demo-host", json.dumps(result))

    def test_reflects_reserve_and_pickup_without_changing_drop_binding(self) -> None:
        AggregateHandler.counts = {"total": 2, "available": 1, "held": 1, "picked_up": 0}
        reserved = whats_left.whats_left(self.base, DROP_ID)
        self.assertEqual(
            (reserved["available"], reserved["held"], reserved["picked_up"]), (1, 1, 0)
        )
        AggregateHandler.counts = {"total": 2, "available": 1, "held": 0, "picked_up": 1}
        picked_up = whats_left.whats_left(self.base, DROP_ID)
        self.assertEqual(
            (picked_up["available"], picked_up["held"], picked_up["picked_up"]), (1, 0, 1)
        )
        self.assertEqual(picked_up["drop_id"], DROP_ID)

    def test_page_id_must_match_drop(self) -> None:
        self.assertEqual(whats_left.page_id_for_drop(DROP_ID), PAGE_ID)
        with self.assertRaises(ValueError):
            whats_left.canonical_drop_id("../../students")

    def test_create_command_binds_page_state_to_same_drop(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            recorder = Path(folder) / "it"
            output = Path(folder) / "args.json"
            recorder.write_text(
                "#!/usr/bin/env python3\n"
                "import json, pathlib, sys\n"
                f"pathlib.Path({str(output)!r}).write_text(json.dumps(sys.argv[1:]))\n"
            )
            recorder.chmod(0o755)
            completed = subprocess.run(
                [
                    sys.executable,
                    str(HERE / "create_companion.py"),
                    "--drop-id",
                    DROP_ID,
                    "--it-bin",
                    str(recorder),
                    "--open",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            args = json.loads(output.read_text())
            self.assertEqual(args[0], "create")
            self.assertEqual(args[args.index("--id") + 1], PAGE_ID)
            state = json.loads(args[args.index("--state") + 1])
            self.assertEqual(state["drop_id"], DROP_ID)
            self.assertEqual(state["page_id"], PAGE_ID)
            self.assertNotIn("demo-host", json.dumps(state))
            self.assertEqual(args[-1], "--open")

    def test_page_action_sends_only_drop_and_page_binding(self) -> None:
        html = (HERE / "whats-left.html").read_text()
        self.assertIn('It.action("whats_left", binding)', html)
        self.assertIn("pageId === `owl-whats-left-${dropId}`", html)
        self.assertNotIn("demo-host", html)
        self.assertNotIn("Authorization", html)

    def test_patch_invocation_contains_aggregate_state_only(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            recorder = Path(folder) / "it"
            output = Path(folder) / "args.json"
            recorder.write_text(
                "#!/usr/bin/env python3\n"
                "import json, pathlib, sys\n"
                f"pathlib.Path({str(output)!r}).write_text(json.dumps(sys.argv[1:]))\n"
            )
            recorder.chmod(0o755)
            completed = subprocess.run(
                [
                    sys.executable,
                    str(HERE / "whats_left.py"),
                    "--base",
                    self.base,
                    "--drop-id",
                    DROP_ID,
                    "--it-patch",
                    PAGE_ID,
                    "--it-bin",
                    str(recorder),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            args = json.loads(output.read_text())
            self.assertEqual(args[:2], ["patch", PAGE_ID])
            state = json.loads(args[2])
            self.assertEqual(state["drop_id"], DROP_ID)
            self.assertNotIn("credential", json.dumps(state).lower())
            self.assertNotIn("demo-host", json.dumps(state))


if __name__ == "__main__":
    unittest.main()
