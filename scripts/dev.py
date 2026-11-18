"""Keep both local application processes tied to the terminal lifecycle."""

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from dotenv import load_dotenv


def run() -> None:
    """Stop sibling processes when either app exits or rehearsal is interrupted."""
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    commands = [
        [
            sys.executable,
            "-m",
            "uvicorn",
            "services.api.main:create_app",
            "--factory",
            "--host",
            "0.0.0.0",
            "--port",
            os.getenv("API_PORT", "8017"),
        ],
        [
            "npm",
            "--prefix",
            "apps/web",
            "run",
            "dev",
            "--",
            "--hostname",
            "0.0.0.0",
            "--port",
            os.getenv("WEB_PORT", "3017"),
        ],
    ]
    children = []
    try:
        for command in commands:
            children.append(subprocess.Popen(command, start_new_session=True))
        while all(child.poll() is None for child in children):
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        for child in children:
            child.wait()


if __name__ == "__main__":
    run()
