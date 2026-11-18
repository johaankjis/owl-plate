"""Generate client types from the actual composed routes, without contacting services."""

import json
import os
from pathlib import Path

os.environ.update(
    DEMO_MODE="true", AUTH_MODE="demo", VISION_PROVIDER="fixture", NOTIFICATION_PROVIDER="log"
)


def export() -> None:
    """Make drift reviewable in the frontend's generated OpenAPI artifact."""
    from services.api.main import create_app

    destination = Path("apps/web/openapi.json")
    destination.write_text(json.dumps(create_app("sqlite://").openapi(), indent=2) + "\n")


if __name__ == "__main__":
    export()
