#!/usr/bin/env python3
"""Publish an exact-drop Owl Plate pickup companion to a paired It display."""

import argparse
import json
import subprocess
import sys
import urllib.error
from pathlib import Path

from whats_left import IT_BIN, _get, canonical_drop_id, page_id_for_drop

HERE = Path(__file__).resolve().parent
PAGE = HERE / "whats-left.html"


def main() -> int:
    """Create the drop-specific page in the Claude conversation that will answer it."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--drop-id",
        help="published Owl Plate drop UUID; defaults to the current active drop",
    )
    parser.add_argument("--base", default="http://localhost:3017", help="Owl Plate web URL")
    parser.add_argument("--it-bin", default=str(IT_BIN), help="path to the It CLI")
    parser.add_argument("--open", action="store_true", help="ask the paired Mac display to open it")
    args = parser.parse_args()
    raw_drop_id = args.drop_id
    if not raw_drop_id:
        try:
            raw_drop_id = _get(args.base, "/demo/active-drop").get("drop_id")
        except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as exc:
            parser.error(f"cannot read the active Owl Plate drop: {type(exc).__name__}")
        if not raw_drop_id:
            parser.error("Owl Plate has no active drop; publish the two-serving drop first")
    try:
        drop_id = canonical_drop_id(raw_drop_id)
    except ValueError:
        parser.error("--drop-id must be a UUID")
    page_id = page_id_for_drop(drop_id)
    state = {
        "drop_id": drop_id,
        "page_id": page_id,
        "answer": "Tap “What's left?”",
        "checked_at": "Not checked yet",
    }
    command = [
        args.it_bin,
        "create",
        "Owl Plate – What's left?",
        "--id",
        page_id,
        "--file",
        str(PAGE),
        "--state",
        json.dumps(state, separators=(",", ":")),
    ]
    if args.open:
        command.append("--open")
    completed = subprocess.run(command, check=False)
    if completed.returncode == 0:
        print(
            "Action handler: python3 prototypes/itcan/whats_left.py "
            f"--drop-id {drop_id} --it-patch {page_id}",
            file=sys.stderr,
        )
    return completed.returncode


if __name__ == "__main__":
    sys.exit(main())
