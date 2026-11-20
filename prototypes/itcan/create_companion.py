#!/usr/bin/env python3
"""Publish an exact-drop Owl Plate pickup companion to a paired It display."""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
import urllib.error
from pathlib import Path

from whats_left import IT_BIN, _get, canonical_drop_id, page_id_for_drop, whats_left

HERE = Path(__file__).resolve().parent
PAGE = HERE / "whats-left.html"
HANDLER = HERE / "whats_left.py"


def page_url(stdout: str) -> str:
    """Pull the page URL from `it create` JSON, or hand back its output unchanged."""
    try:
        url = json.loads(stdout)["url"]
    except (ValueError, KeyError, TypeError):
        return stdout
    return url if isinstance(url, str) and url else stdout


def handler_command(base: str, drop_id: str, page_id: str, it_bin: str) -> str:
    """Spell out the one command the answering conversation should run per tap.

    The It CLI path is carried through so non-default installs patch the same page.
    """
    return shlex.join(
        [
            "python3",
            str(HANDLER),
            "--base",
            base,
            "--drop-id",
            drop_id,
            "--it-patch",
            page_id,
            "--it-bin",
            it_bin,
        ]
    )


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
    state = whats_left(args.base, drop_id)
    command = [
        args.it_bin,
        "create",
        "Owl Plate – What's left?",
        "--id",
        page_id,
        "--file",
        str(PAGE),
        "--state",
        json.dumps(state, ensure_ascii=False, separators=(",", ":")),
    ]
    if args.open:
        command.append("--open")
    completed = subprocess.run(command, check=False, stdout=subprocess.PIPE, text=True)
    if completed.returncode != 0:
        if completed.stdout:
            print(completed.stdout, end="")
        return completed.returncode
    print(f"Page: {page_url(completed.stdout.strip())}")
    print(f"Action handler: {handler_command(args.base, drop_id, page_id, args.it_bin)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
