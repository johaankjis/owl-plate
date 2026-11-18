"""Start a clean, self-contained presentation demo with one command and one browser port."""

import argparse
import hashlib
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"
STAMP = WEB / ".next" / "owl-present-stamp"
# Confirmed 2026-11-18 on ai.google.dev/gemini-api/docs/models: stable, multimodal
# (Text, Image, Audio, Video, PDF) generateContent model.
DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
# Confirmed 2026-11-18 on openrouter.ai/api/v1/models: Gemini 3.8 Flash listing reports
# architecture.input_modalities ["text", "image", "video", "file", "audio"] and
# supported_parameters including "structured_outputs" and "response_format"; the same
# model as our direct-Gemini mode, reached through OpenRouter at a low prompt price.
DEFAULT_OPENROUTER_MODEL = "google/gemini-3.8-flash"
DEMO_ENV = {
    "AUTH_MODE": "demo",
    "DEMO_MODE": "true",
    "NOTIFICATION_PROVIDER": "log",
    "SURVEY_ENABLED": "false",
    "OWL_ORIGIN_PROXY_REQUIRED": "false",
    "NEXT_PUBLIC_API_URL": "/backend",
    "NEXT_PUBLIC_UI_FIXTURE_MODE": "false",
}


def resolve_gemini_credentials() -> tuple[str, str]:
    """Read live-vision credentials from the shell or the gitignored .env, never printing them."""
    load_dotenv(ROOT / ".env")
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        sys.exit(
            "GEMINI_API_KEY is required for --vision gemini.\n"
            f"Put GEMINI_API_KEY=... in {ROOT / '.env'} (that file is gitignored),\n"
            "or run: export GEMINI_API_KEY=... in this shell.\n"
            "Create a key at https://aistudio.google.com/apikey and never commit or share it."
        )
    model = os.getenv("GEMINI_MODEL", "").strip() or DEFAULT_GEMINI_MODEL
    return api_key, model


def resolve_openrouter_credentials() -> tuple[str, str]:
    """Read OpenRouter credentials from the shell or the gitignored .env, never printing them."""
    load_dotenv(ROOT / ".env")
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        sys.exit(
            "OPENROUTER_API_KEY is required for --vision openrouter.\n"
            f"Put OPENROUTER_API_KEY=... in {ROOT / '.env'} (that file is gitignored),\n"
            "or run: export OPENROUTER_API_KEY=... in this shell.\n"
            "Create a key at https://openrouter.ai/settings/keys and never commit or share it."
        )
    model = os.getenv("OPENROUTER_VISION_MODEL", "").strip() or DEFAULT_OPENROUTER_MODEL
    return api_key, model


def vision_environment(mode: str) -> dict[str, str]:
    """Turn the selected vision mode into API-process environment overrides."""
    if mode == "fixture":
        return {"VISION_PROVIDER": "fixture"}
    if mode == "openrouter":
        api_key, model = resolve_openrouter_credentials()
        return {
            "VISION_PROVIDER": "openrouter",
            "OPENROUTER_API_KEY": api_key,
            "OPENROUTER_VISION_MODEL": model,
        }
    api_key, model = resolve_gemini_credentials()
    return {"VISION_PROVIDER": "gemini", "GEMINI_API_KEY": api_key, "GEMINI_MODEL": model}


def vision_banner(mode: str, vision_env: dict[str, str]) -> str:
    """Name the exact estimate source so operators never present the wrong mode."""
    if mode == "gemini":
        return "LIVE GEMINI VISION (analyzes the uploaded photo)"
    if mode == "openrouter":
        return f"LIVE GEMINI VIA OPENROUTER (model {vision_env['OPENROUTER_VISION_MODEL']})"
    return "SAVED DEMO ESTIMATE (fixture)"


def build_fingerprint() -> str:
    """Rebuild only when web sources change, so a laptop restart takes seconds, not minutes."""
    digest = hashlib.sha256(DEMO_ENV["NEXT_PUBLIC_API_URL"].encode())
    for folder in ("app", "components", "lib", "public"):
        for path in sorted((WEB / folder).rglob("*")):
            if path.is_file():
                digest.update(str(path.relative_to(WEB)).encode())
                digest.update(path.read_bytes())
    for name in ("package-lock.json", "next.config.ts", "middleware.ts"):
        if (WEB / name).exists():
            digest.update((WEB / name).read_bytes())
    return digest.hexdigest()


def ensure_build(env: dict[str, str], force: bool) -> None:
    """A production build avoids dev-server compile pauses in front of judges."""
    fingerprint = build_fingerprint()
    if not force and STAMP.exists() and STAMP.read_text() == fingerprint:
        return
    print("Building the web app once (about a minute)...", flush=True)
    subprocess.run(["npm", "run", "build"], cwd=WEB, env=env, check=True)
    STAMP.write_text(fingerprint)


def require_free(port: int) -> None:
    """Refuse to start over another process rather than silently demoing stale code."""
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            sys.exit(f"Port {port} is already in use. Stop the other demo first.")


def wait_healthy(url: str, timeout: float = 60) -> None:
    """Report readiness only after both processes answer real requests."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if httpx.get(url, timeout=2, trust_env=False).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    sys.exit(f"Timed out waiting for {url}")


def reset(api_port: int, scenario: str = "visitors") -> dict:
    """Use the application's own reset so UI, scheduler and database agree."""
    response = httpx.post(
        f"http://127.0.0.1:{api_port}/demo/reset",
        headers={"Authorization": "Bearer demo-projector"},
        json={"scenario": scenario},
        timeout=10,
        trust_env=False,
    )
    response.raise_for_status()
    return response.json()


def stop(signum: int, frame: object) -> None:
    """Treat a terminal close like Ctrl+C so child processes never outlive the demo."""
    raise KeyboardInterrupt


def run(args: argparse.Namespace) -> None:
    """Supervise API and web together so Ctrl+C always leaves the laptop clean."""
    vision_env = vision_environment(args.vision)
    database = ROOT / "build" / "present.db"
    database.parent.mkdir(exist_ok=True)
    env = {**os.environ, **DEMO_ENV, **vision_env}
    env["DATABASE_URL"] = f"sqlite:///{database}"
    env["OWL_API_ORIGIN"] = f"http://127.0.0.1:{args.api_port}"
    env["CORS_ORIGINS"] = f"http://localhost:{args.port}"
    require_free(args.api_port)
    require_free(args.port)
    ensure_build(env, args.rebuild)

    commands = [
        [
            sys.executable,
            "-m",
            "uvicorn",
            "services.api.main:create_app",
            "--factory",
            "--host",
            "127.0.0.1",
            "--port",
            str(args.api_port),
            "--no-access-log",
        ],
        ["npm", "run", "start", "--", "--hostname", args.host, "--port", str(args.port)],
    ]
    children: list[subprocess.Popen] = []
    signal.signal(signal.SIGTERM, stop)
    try:
        children.append(subprocess.Popen(commands[0], cwd=ROOT, env=env, start_new_session=True))
        children.append(subprocess.Popen(commands[1], cwd=WEB, env=env, start_new_session=True))
        wait_healthy(f"http://127.0.0.1:{args.api_port}/health")
        wait_healthy(f"http://127.0.0.1:{args.port}/backend/health")
        reset(args.api_port)
        base = f"http://localhost:{args.port}"
        mode_line = vision_banner(args.vision, vision_env)
        print(
            "\n"
            "  Owl Plate demo ready (clean state, live-visitor scenario)\n"
            f"  Mode: {mode_line} + SIMULATED NOTIFICATIONS (no real push)\n\n"
            f"  Home       {base}/\n"
            f"  Host       {base}/host\n"
            f"  Join       {base}/join\n"
            f"  Dispatch   {base}/dispatch   (presenter controls at the bottom)\n\n"
            "  Reset anytime: Presenter controls on /dispatch, or `make demo-reset`.\n"
            "  Stop: Ctrl+C\n",
            flush=True,
        )
        while all(child.poll() is None for child in children):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        for child in children:
            child.wait(timeout=15)


def main() -> None:
    """Separate starting the demo from resetting an already-running one."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset-only", action="store_true", help="reset a running demo")
    parser.add_argument("--scenario", choices=["visitors", "seeded"], default="visitors")
    parser.add_argument(
        "--vision",
        choices=["fixture", "gemini", "openrouter"],
        default="fixture",
        help="vision provider",
    )
    parser.add_argument("--rebuild", action="store_true", help="force a fresh web build")
    parser.add_argument("--host", default=os.getenv("PRESENT_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("WEB_PORT", "3017")))
    parser.add_argument("--api-port", type=int, default=int(os.getenv("API_PORT", "8017")))
    args = parser.parse_args()
    if args.reset_only:
        reset(args.api_port, args.scenario)
        print(f"Reset complete: {args.scenario} scenario.")
    else:
        run(args)


if __name__ == "__main__":
    main()
