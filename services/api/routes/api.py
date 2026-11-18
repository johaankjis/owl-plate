"""Expose frozen HTTP shapes while leaving transitions in the application service."""

from collections.abc import Callable
from datetime import datetime
from typing import Annotated, ParamSpec, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy.exc import SQLAlchemyError

from services.api.application import Actor, Backend, DomainError
from services.api.schemas.api import (
    ClaimResponse,
    DemoActiveDropResponse,
    DemoResetResponse,
    DemoTick,
    DispatchResponse,
    DropEdit,
    DropResponse,
    InviteResponse,
    InvitesResponse,
    Preferences,
    PresenceRequest,
    PushTokenRequest,
)

P = ParamSpec("P")
R = TypeVar("R")


def build_router(
    backend: Backend, register_push_token: Callable[[str, str], None] | None = None
) -> APIRouter:
    """Bind manager-owned adapters without relying on global app state."""
    router = APIRouter()

    def invoke(method: Callable[P, R], *args: P.args, **kwargs: P.kwargs) -> R:
        """Translate only intentional domain failures to the frozen error envelope."""
        try:
            return method(*args, **kwargs)
        except DomainError as exc:
            raise HTTPException(
                exc.status, detail={"code": exc.code, "message": exc.message}
            ) from exc

    def current_actor(authorization: Annotated[str | None, Header()] = None) -> Actor:
        """Authenticate each request before an identity can reach service methods."""
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                401, detail={"code": "unauthorized", "message": "Sign in required."}
            )
        return invoke(backend.actor, authorization.removeprefix("Bearer "))

    Identity = Annotated[Actor, Depends(current_actor)]

    @router.post("/drops", response_model=DropResponse)
    def create_drop(
        actor: Identity,
        photo: Annotated[UploadFile, File()],
        host_note: Annotated[str, Form(max_length=1000)] = "",
    ) -> DropResponse:
        """Keep uploads bounded before passing bytes to the injected validator."""
        invoke(backend.require, actor, "host")
        if photo.content_type not in {"image/jpeg", "image/png"}:
            raise HTTPException(
                422, detail={"code": "invalid_photo", "message": "Use JPEG or PNG."}
            )
        content = photo.file.read(10 * 1024 * 1024 + 1)
        return invoke(backend.create_drop, actor, content, host_note)

    @router.patch("/drops/{drop_id}", response_model=DropResponse)
    def edit_drop(drop_id: UUID, edit: DropEdit, actor: Identity) -> DropResponse:
        """Delegate complete host review to the transactional service."""
        return invoke(backend.edit_drop, actor, str(drop_id), edit)

    @router.post("/drops/{drop_id}/publish", response_model=DropResponse)
    def publish(drop_id: UUID, actor: Identity) -> DropResponse:
        """Return only after the first wave has committed."""
        return invoke(backend.publish, actor, str(drop_id))

    @router.get("/drops/{drop_id}", response_model=DropResponse)
    def get_drop(drop_id: UUID, actor: Identity) -> DropResponse:
        """Scope food details through the service's ownership check."""
        return invoke(backend.get_drop, actor, str(drop_id))

    @router.get("/drops/{drop_id}/dispatch", response_model=DispatchResponse)
    def dispatch(drop_id: UUID, actor: Identity) -> DispatchResponse:
        """Restrict synthetic map output to the demo projector."""
        return invoke(backend.dispatch, actor, str(drop_id))

    @router.get("/students/me/invites", response_model=InvitesResponse)
    def invites(actor: Identity) -> InvitesResponse:
        """Resolve identity before querying invitations."""
        return invoke(backend.invites, actor)

    @router.post("/invites/{invite_id}/claim", response_model=ClaimResponse)
    def claim(invite_id: UUID, actor: Identity) -> ClaimResponse:
        """Preserve the service's atomic, idempotent claim boundary."""
        return invoke(backend.claim, actor, str(invite_id))

    @router.post("/invites/{invite_id}/decline", response_model=InviteResponse)
    def decline(invite_id: UUID, actor: Identity) -> InviteResponse:
        """Decline through the same mutation boundary used by ticks."""
        return invoke(backend.decline, actor, str(invite_id))

    @router.post("/claims/{claim_id}/release", response_model=ClaimResponse)
    def release(claim_id: UUID, actor: Identity) -> ClaimResponse:
        """Return the final hold state so retries are harmless."""
        return invoke(backend.update_claim, actor, str(claim_id))

    @router.post("/claims/{claim_id}/pickup", response_model=ClaimResponse)
    def pickup(claim_id: UUID, actor: Identity) -> ClaimResponse:
        """Keep unverified pickup strictly inside explicit demo mode."""
        return invoke(backend.update_claim, actor, str(claim_id), pickup=True)

    @router.put("/students/me/preferences", response_model=Preferences)
    def preferences(preferences: Preferences, actor: Identity) -> Preferences:
        """Accept only the frozen student-editable preference fields."""
        return invoke(backend.preferences, actor, preferences)

    @router.post("/students/me/presence", response_model=dict[str, datetime])
    def presence(presence: PresenceRequest, actor: Identity) -> dict[str, datetime]:
        """Return the lifetime without exposing anyone else's presence."""
        return {"valid_until": invoke(backend.presence, actor, presence.building_code)}

    @router.post("/students/me/push-token", response_model=dict[str, bool])
    def push_token(token: PushTokenRequest, actor: Identity) -> dict[str, bool]:
        """Register only the authenticated student's device through encrypted storage."""
        invoke(backend.require, actor, "student")
        if register_push_token is not None:
            try:
                register_push_token(actor.id, token.token)
            except (RuntimeError, ValueError, SQLAlchemyError):
                raise HTTPException(
                    503,
                    detail={
                        "code": "provider_unavailable",
                        "message": "Encrypted push registration unavailable.",
                    },
                ) from None
            return {"registered": True}
        raise HTTPException(
            503,
            detail={
                "code": "provider_unavailable",
                "message": "Encrypted push registration unavailable.",
            },
        )

    @router.get("/demo/active-drop", response_model=DemoActiveDropResponse)
    def active_drop(actor: Identity) -> DemoActiveDropResponse:
        """Allow a separate synthetic projector to discover the current host flow."""
        return invoke(backend.active_drop, actor)

    @router.post("/demo/reset", response_model=DemoResetResponse)
    def reset(actor: Identity) -> DemoResetResponse:
        """Make reset a single host-authorized demo transaction."""
        return invoke(backend.reset, actor)

    @router.post("/demo/tick", response_model=dict[str, datetime])
    def tick(tick: DemoTick, actor: Identity) -> dict[str, datetime]:
        """Advance only the demo clock while reusing production scheduling logic."""
        invoke(backend.require, actor, "host", demo=True)
        return {"server_time": invoke(backend.tick, tick.advance_seconds)}

    return router
