#!/usr/bin/env python3
"""Answer "What's left?" for one drop on an It (itcan.do) host screen.

The drop UUID is mandatory and is checked against the page ID before a patch.
Only Owl Plate's existing aggregate host response is read. Standard-library
only so this helper can run on the paired Mac without the project virtualenv.
"""

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path

HOST_TOKEN = "demo-host"  # Synthetic demo credential; works only in demo mode.
IT_BIN = Path.home() / ".it" / "bin" / "it"
PAGE_PREFIX = "owl-whats-left-"


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


def whats_left(base: str, drop_id: str) -> dict:
    """Return aggregate counts for exactly one drop, and nothing about students."""
    drop_id = canonical_drop_id(drop_id)
    drop = _get(base, f"/drops/{drop_id}")
    counts = drop["counts"]
    available = int(counts["available"])
    held = int(counts["held"])
    picked_up = int(counts["picked_up"])
    pantry_held = int(counts.get("pantry_held", 0))
    pantry_transferred = int(counts.get("pantry_transferred", 0))
    total = int(counts["total"])
    inventory = (available, held, picked_up, pantry_held, pantry_transferred)
    if min(*inventory, total) < 0 or sum(inventory) != total:
        raise ValueError("invalid aggregate counts")
    if drop["status"] == "live":
        answer = f"{available} of {total} left · {held} on hold · {picked_up} picked up"
    else:
        answer = f"Drop {drop['status'].replace('_', ' ')} · {picked_up} picked up"
    answer += f" · {pantry_held} pantry reserved · {pantry_transferred} simulated pantry transfers"
    return {
        "has_drop": True,
        "drop_id": drop_id,
        "status": drop["status"],
        "available": available,
        "held": held,
        "picked_up": picked_up,
        "pantry_held": pantry_held,
        "pantry_transferred": pantry_transferred,
        "total": total,
        "answer": answer,
        "checked_at": datetime.now().strftime("%-I:%M:%S %p"),
    }


def main() -> int:
    """Print the counts as JSON; optionally update the exact-drop It page."""
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
    if args.it_patch and args.it_patch != expected_page_id:
        parser.error(f"--it-patch must be {expected_page_id} for this drop")
    try:
        result = whats_left(args.base, drop_id)
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as exc:
        result = {
            "has_drop": False,
            "drop_id": drop_id,
            "answer": "Owl Plate counts are unavailable. Check the demo tunnel.",
            "checked_at": datetime.now().strftime("%-I:%M:%S %p"),
        }
        print(f"whats_left: {type(exc).__name__}", file=sys.stderr)
    print(json.dumps(result))
    if args.it_patch:
        completed = subprocess.run(
            [args.it_bin, "patch", args.it_patch, json.dumps(result)], check=False
        )
        return completed.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
