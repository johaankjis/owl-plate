"""Compose replaceable boundaries; route handlers and planner own behavior elsewhere."""

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import anyio
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services.api.application import Backend
from services.api.db.session import create_database
from services.api.providers.notifications import SimulatedNotifications
from services.api.routes.api import build_router
from services.api.vision.service import build_vision_provider, validate_photo

logger = logging.getLogger(__name__)


def create_app(database_url: str | None = None) -> FastAPI:
    """Keep live-service choices explicit and allow isolated route-level demo checks."""
    load_dotenv()
    demo = os.getenv("DEMO_MODE", "false").lower() == "true"
    auth_mode = os.getenv("AUTH_MODE", "demo")
    notification_mode = os.getenv("NOTIFICATION_PROVIDER", "log")
    if notification_mode != "log" or not demo:
        raise ValueError("Live notification/auth composition pending; use explicit local demo mode")
    provider = build_vision_provider()
    notifications = SimulatedNotifications()
    backend = Backend(
        create_database(database_url or os.getenv("DATABASE_URL", "sqlite:///./owl_plate.db")),
        analyze=provider.analyze,
        validate_photo=validate_photo,
        notify=notifications.notify,
        demo_mode=demo,
        auth_mode=auth_mode,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        """Run scheduler ticks through the same transaction boundary as HTTP claims."""

        async def schedule() -> None:
            while True:
                await asyncio.sleep(10)
                try:
                    await anyio.to_thread.run_sync(backend.tick)
                except (RuntimeError, ValueError):
                    logger.error("Scheduler tick failed; will retry without logging private state")

        task = asyncio.create_task(schedule())
        try:
            yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    app = FastAPI(title="Owl Plate", version="0.1.0", lifespan=lifespan)
    app.state.backend = backend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
        allow_methods=["GET", "POST", "PATCH", "PUT"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(build_router(backend))

    @app.get("/health")
    def health() -> dict[str, str | bool]:
        """Expose honest readiness without internal configuration or recipient information."""
        return {"status": "ok", "is_demo": demo, "notifications": "simulated"}

    return app
