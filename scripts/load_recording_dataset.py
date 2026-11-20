"""Load labeled sample records only into the isolated fixture/log recording runtime."""

import argparse
import json
from urllib.parse import urlparse

import httpx


def main() -> None:
    """Require explicit destructive confirmation before calling the server's gated loader."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:8027")
    parser.add_argument(
        "--confirm-replace-demo-data",
        action="store_true",
        help="Explicitly replace this isolated runtime's existing demo application records.",
    )
    args = parser.parse_args()
    target = urlparse(args.api_url)
    if (
        target.scheme != "http"
        or target.hostname not in {"localhost", "127.0.0.1"}
        or target.port != 8027
        or target.path not in {"", "/"}
        or target.username
        or target.password
        or target.query
        or target.fragment
    ):
        parser.error("Use the isolated local recording API on port 8027 only.")
    if not args.confirm_replace_demo_data:
        parser.error("Pass --confirm-replace-demo-data to replace the isolated demo records.")
    with httpx.Client(base_url=args.api_url.rstrip("/"), trust_env=False, timeout=60) as client:
        health = client.get("/health")
        health.raise_for_status()
        state = health.json()
        if not (
            state.get("is_demo") is True
            and state.get("vision") == "fixture"
            and state.get("notifications") == "simulated"
        ):
            parser.error("Recording data requires demo gates, fixture vision and simulated push.")
        response = client.post(
            "/demo/recording-dataset",
            headers={"Authorization": "Bearer demo-projector"},
            json={"confirm_reset": True},
        )
        response.raise_for_status()
        data = response.json()
        print(json.dumps({"dataset": data["dataset"], "summary": data["summary"]}, indent=2))


if __name__ == "__main__":
    main()
