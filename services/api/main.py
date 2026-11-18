"""Compose replaceable boundaries; route handlers and planner own behavior elsewhere."""

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

import anyio
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError

from services.api.application import Backend
from services.api.db.session import create_database
from services.api.providers.notifications import SimulatedNotifications
from services.api.routes.api import build_router
from services.api.routes.survey import build_survey_router
from services.api.survey.service import SurveyService
from services.api.vision.service import build_vision_provider, validate_photo

logger = logging.getLogger(__name__)


def create_app(database_url: str | None = None) -> FastAPI:
    """Keep live-service choices explicit and allow isolated route-level demo checks."""
    load_dotenv()
    demo = os.getenv("DEMO_MODE", "false").lower() == "true"
    auth_mode = os.getenv("AUTH_MODE", "")
    notification_mode = os.getenv("NOTIFICATION_PROVIDER", "log")
    if not demo or auth_mode != "demo":
        raise ValueError("Only explicit demo mode and demo auth are supported")
    if notification_mode not in {"log", "fcm"}:
        raise ValueError("Unsupported notification provider")
    provider = build_vision_provider()
    if notification_mode == "fcm":
        # Register PushRegistration metadata before create_all initializes the database.
        from services.api.providers.fcm import (
            FcmNotifications,
            TokenVault,
            service_account_access_token,
        )

        try:
            allowed_ids = frozenset(
                str(UUID(value.strip()))
                for value in os.getenv("FCM_ALLOWED_STUDENT_IDS", "").split(",")
                if value.strip()
            )
            if not allowed_ids:
                raise ValueError("Missing approved demo recipients")
            account = json.loads(os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", ""))
            if not isinstance(account, dict):
                raise TypeError("Invalid service account")
        except (ValueError, TypeError):
            raise ValueError(
                "FCM requires private configuration and approved synthetic IDs"
            ) from None

    engine = create_database(database_url or os.getenv("DATABASE_URL", "sqlite:///./owl_plate.db"))
    backend = Backend(
        engine,
        analyze=provider.analyze,
        validate_photo=validate_photo,
        demo_mode=demo,
        auth_mode=auth_mode,
    )
    register_push_token = None
    if notification_mode == "fcm":
        synthetic_ids = {row["id"] for row in backend.seed["students"] if row["is_simulated"]}
        if not allowed_ids <= synthetic_ids:
            raise ValueError("FCM recipients must be synthetic demo students")
        try:
            vault = TokenVault(engine, os.getenv("PUSH_TOKEN_ENCRYPTION_KEY", ""))
            notifications = FcmNotifications(
                vault,
                os.getenv("FIREBASE_PROJECT_ID", ""),
                allowed_ids,
                service_account_access_token(account),
            )
        except (ValueError, TypeError, KeyError):
            raise ValueError("Invalid private FCM configuration") from None
        register_push_token = vault.register
    else:
        notifications = SimulatedNotifications()
    backend.notify = notifications.notify

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        """Run scheduler ticks through the same transaction boundary as HTTP claims."""

        async def schedule() -> None:
            while True:
                await asyncio.sleep(10)
                try:
                    await anyio.to_thread.run_sync(backend.tick)
                except (RuntimeError, ValueError, SQLAlchemyError):
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
        allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3017").split(","),
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(build_router(backend, register_push_token=register_push_token))
    app.include_router(
        build_survey_router(SurveyService(engine, os.getenv("SURVEY_ENABLED", "false") == "true"))
    )

    vision_mode = os.getenv("VISION_PROVIDER", "fixture")
    if vision_mode not in {"gemini", "openrouter"}:
        vision_mode = "fixture"

    @app.get("/health")
    def health() -> dict[str, str | bool]:
        """Expose honest readiness without internal configuration or recipient information."""
        return {
            "status": "ok",
            "is_demo": demo,
            "notifications": "simulated" if notification_mode == "log" else "fcm",
            "vision": vision_mode,
        }

    return app
