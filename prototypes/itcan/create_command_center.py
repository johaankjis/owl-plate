#!/usr/bin/env python3
"""Publish the campus-wide Owl Plate Rescue Command Center to a paired It display."""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from pathlib import Path

from campus_center import DEFAULT_BASE, DEFAULT_PAGE_ID, IT_BIN, initial_state

HERE = Path(__file__).resolve().parent
PAGE = HERE / "command-center.html"
HANDLER = HERE / "campus_center.py"
PAGE_TITLE = "Owl Plate – Campus Rescue Command Center"


def page_url(stdout: str) -> str:
    """Pull the page URL from `it create` JSON, or hand back its output unchanged."""
    try:
        url = json.loads(stdout)["url"]
    except (ValueError, KeyError, TypeError):
        return stdout
    return url if isinstance(url, str) and url else stdout


def _base_handler_argv(base: str, page_id: str, it_bin: str) -> list[str]:
    """Build the shared prefix for every command-center action handler command."""
    return [
        "python3",
        str(HANDLER),
        "--base",
        base,
        "--page-id",
        page_id,
        "--it-patch",
        page_id,
        "--it-bin",
        it_bin,
    ]


def handler_commands(base: str, page_id: str, it_bin: str) -> list[tuple[str, str]]:
    """Spell out every contract action's copy-pasteable handler command.

    The It CLI path and page binding travel with every command so non-default
    installs patch the exact command-center page without ever exposing bearers.
    """
    prefix = shlex.join(_base_handler_argv(base, page_id, it_bin))
    return [
        ("refresh_campus_activity", f"{prefix} --refresh"),
        ("select_building", f"{prefix} --select-building <building_id>"),
        ("inspect_listing", f"{prefix} --inspect <drop_id>"),
        ("whats_left", f"{prefix} --whats-left <drop_id>"),
        ("analyze_remaining_food (brief)", f"{prefix} --brief"),
        ("analyze_remaining_food (respond)", f"{prefix} --respond '<text>'"),
        ("show_recommendations (brief)", f"{prefix} --brief"),
        ("show_recommendations (recommend)", f"{prefix} --recommend '<json>'"),
        ("dismiss_recommendations", f"{prefix} --dismiss-recommendations"),
    ]


def main(argv: list[str] | None = None) -> int:
    """Create the campus-wide command-center page in the paired It session."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=DEFAULT_BASE, help="Owl Plate web URL")
    parser.add_argument("--it-bin", default=str(IT_BIN), help="path to the It CLI")
    parser.add_argument("--open", action="store_true", help="ask the paired Mac display to open it")
    args = parser.parse_args(argv)

    page_id = DEFAULT_PAGE_ID
    state = initial_state(args.base, page_id)
    command = [
        args.it_bin,
        "create",
        PAGE_TITLE,
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
    print("Action handler:")
    for label, cmd in handler_commands(args.base, page_id, args.it_bin):
        print(f"  {label}: {cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
