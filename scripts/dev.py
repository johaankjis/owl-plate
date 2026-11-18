"""Keep both local application processes tied to the terminal lifecycle."""

import subprocess


def run() -> None:
    """Stop sibling processes when either app exits or rehearsal is interrupted."""
    commands = [
        [
            ".venv/bin/python",
            "-m",
            "uvicorn",
            "services.api.main:create_app",
            "--factory",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ],
        ["npm", "--prefix", "apps/web", "run", "dev", "--", "--hostname", "0.0.0.0"],
    ]
    children = []
    try:
        for command in commands:
            children.append(subprocess.Popen(command))
        children[0].wait()
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            child.terminate()
        for child in children:
            child.wait()


if __name__ == "__main__":
    run()
