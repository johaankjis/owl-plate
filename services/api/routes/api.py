"""Expose frozen HTTP shapes while leaving transitions in the application service."""

from collections.abc import Callable
from typing import Annotated, ParamSpec, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Response, UploadFile
from sqlalchemy.exc import SQLAlchemyError

from services.api.application import Actor, Backend, DomainError
from services.api.schemas.api import (
    BuildingsResponse,
    CampusDistributionResponse,
    ClaimResponse,
    DemoActiveDropResponse,
    DemoAreasResponse,
    DemoResetRequest,
    DemoResetResponse,
    DemoStatusResponse,
    DemoTick,
    DemoTickResponse,
    DispatchResponse,
    DropEdit,
    DropResponse,
    ErrorResponse,
    FeedResponse,
    HostPickupReview,
    HostPickupReviewsResponse,
    HostReviewDecision,
    InviteResponse,
    InvitesResponse,
    JoinRequest,
    JoinResponse,
    PickupRequest,
    PickupReviewRequest,
    PickupVerification,
    PickupVerificationResponse,
    Preferences,
    PresenceRequest,
    PresenceResponse,
    PushTokenRequest,
    PushTokenResponse,
    SessionLeftResponse,
    SessionStudent,
)

P = ParamSpec("P")
R = TypeVar("R")


def build_router(
    backend: Backend, register_push_token: Callable[[str, str], None] | None = None
) -> APIRouter:
    """Bind manager-owned adapters without relying on global app state."""
    router = APIRouter(
        responses={code: {"model": ErrorResponse} for code in [401, 403, 404, 409, 413, 503]}
    )

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

    @router.get("/students/me/feed", response_model=FeedResponse)
    def feed(actor: Identity) -> FeedResponse:
        """List every active campus drop for the caller; no location is involved."""
        return invoke(backend.feed, actor)

    @router.post("/drops/{drop_id}/reserve", response_model=ClaimResponse)
    def reserve(drop_id: UUID, actor: Identity) -> ClaimResponse:
        """Hold a serving straight from the feed through the atomic service boundary."""
        return invoke(backend.reserve, actor, str(drop_id))

    @router.get("/distribution", response_model=CampusDistributionResponse)
    def distribution(actor: Identity) -> CampusDistributionResponse:
        """Projector aggregate by host building; never student positions."""
        return invoke(backend.distribution, actor)

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
    def pickup(
        claim_id: UUID, actor: Identity, request: PickupRequest | None = None
    ) -> ClaimResponse:
        """Feed pickups need a consistent photo check; seeded rehearsal keeps no-body pickup."""
        return invoke(
            backend.update_claim,
            actor,
            str(claim_id),
            pickup=True,
            verification_id=request.verification_id if request else None,
        )

    @router.post(
        "/claims/{claim_id}/pickup-photo",
        response_model=PickupVerification,
        responses={202: {"model": PickupVerification}, 422: {"model": ErrorResponse}},
    )
    def pickup_photo(
        claim_id: UUID,
        actor: Identity,
        response: Response,
        photo: Annotated[UploadFile, File()],
        request_id: Annotated[UUID, Form()],
    ) -> PickupVerification:
        """Bound the upload, then let the service check it in memory; 202 while processing."""
        invoke(backend.require, actor, "student")
        if photo.content_type not in {"image/jpeg", "image/png"}:
            raise HTTPException(
                422, detail={"code": "invalid_photo", "message": "Use JPEG or PNG."}
            )
        content = photo.file.read(10 * 1024 * 1024 + 1)
        result = invoke(backend.submit_pickup_photo, actor, str(claim_id), content, request_id)
        if result.status == "processing":
            response.status_code = 202
        return result

    @router.get("/claims/{claim_id}/pickup-verification", response_model=PickupVerificationResponse)
    def pickup_verification(claim_id: UUID, actor: Identity) -> PickupVerificationResponse:
        """Latest photo check on the caller's own claim."""
        return invoke(backend.pickup_verification, actor, str(claim_id))

    @router.post("/claims/{claim_id}/pickup-review", response_model=PickupVerification)
    def pickup_review(
        claim_id: UUID, request: PickupReviewRequest, actor: Identity
    ) -> PickupVerification:
        """Explicitly ask the host to review the latest check."""
        return invoke(backend.request_pickup_review, actor, str(claim_id), request.verification_id)

    @router.get("/drops/{drop_id}/pickup-reviews", response_model=HostPickupReviewsResponse)
    def pickup_reviews(drop_id: UUID, actor: Identity) -> HostPickupReviewsResponse:
        """De-identified review queue for the publishing host's own drop."""
        return invoke(backend.pickup_reviews, actor, str(drop_id))

    @router.post(
        "/drops/{drop_id}/pickup-reviews/{verification_id}", response_model=HostPickupReview
    )
    def decide_pickup_review(
        drop_id: UUID, verification_id: UUID, decision: HostReviewDecision, actor: Identity
    ) -> HostPickupReview:
        """Record the host's explicit approve or reject decision."""
        return invoke(
            backend.decide_pickup_review,
            actor,
            str(drop_id),
            str(verification_id),
            decision.decision,
        )

    @router.put("/students/me/preferences", response_model=Preferences)
    def preferences(preferences: Preferences, actor: Identity) -> Preferences:
        """Accept only the frozen student-editable preference fields."""
        return invoke(backend.preferences, actor, preferences)

    @router.post("/students/me/presence", response_model=PresenceResponse)
    def presence(presence: PresenceRequest, actor: Identity) -> PresenceResponse:
        """Return the lifetime without exposing anyone else's presence."""
        return PresenceResponse(valid_until=invoke(backend.presence, actor, presence.building_code))

    @router.post("/students/me/push-token", response_model=PushTokenResponse)
    def push_token(token: PushTokenRequest, actor: Identity) -> PushTokenResponse:
        """Register only the authenticated student's device through encrypted storage."""
        invoke(backend.require, actor, "student")
        if register_push_token is not None:
            try:
                register_push_token(actor.id, token.token)
            except PermissionError:
                raise HTTPException(
                    403,
                    detail={"code": "forbidden", "message": "Join the demo first."},
                ) from None
            except (RuntimeError, ValueError, SQLAlchemyError):
                raise HTTPException(
                    503,
                    detail={
                        "code": "provider_unavailable",
                        "message": "Encrypted push registration unavailable.",
                    },
                ) from None
            return PushTokenResponse(registered=True)
        raise HTTPException(
            503,
            detail={
                "code": "provider_unavailable",
                "message": "Encrypted push registration unavailable.",
            },
        )

    @router.get("/hosts/me/push-token", response_model=PushTokenResponse)
    def host_push_status(actor: Identity) -> PushTokenResponse:
        """Report the authenticated host's current backend registration."""
        return invoke(backend.host_push_status, actor)

    @router.post("/hosts/me/push-token", response_model=PushTokenResponse)
    def host_push_register(token: PushTokenRequest, actor: Identity) -> PushTokenResponse:
        """Opt the authenticated host in to their own pickup updates."""
        return invoke(backend.register_host_push, actor, token.token)

    @router.delete("/hosts/me/push-token", response_model=PushTokenResponse)
    def host_push_forget(actor: Identity) -> PushTokenResponse:
        """Opt the authenticated host out; deferred sends recheck this."""
        return invoke(backend.forget_host_push, actor)

    @router.get("/demo/active-drop", response_model=DemoActiveDropResponse)
    def active_drop(actor: Identity) -> DemoActiveDropResponse:
        """Allow a separate synthetic projector to discover the current host flow."""
        return invoke(backend.active_drop, actor)

    @router.post("/demo/reset", response_model=DemoResetResponse)
    def reset(actor: Identity, request: DemoResetRequest | None = None) -> DemoResetResponse:
        """Make reset a single presenter-authorized demo transaction."""
        return invoke(backend.reset, actor, (request or DemoResetRequest()).scenario)

    @router.post("/demo/tick", response_model=DemoTickResponse)
    def tick(tick: DemoTick, actor: Identity) -> DemoTickResponse:
        """Advance only the demo clock while reusing production scheduling logic."""
        invoke(backend.require_presenter, actor)
        return DemoTickResponse(server_time=invoke(backend.tick, tick.advance_seconds))

    @router.get("/demo/status", response_model=DemoStatusResponse)
    def status(actor: Identity) -> DemoStatusResponse:
        """Give presenter controls a projector-safe overview."""
        return invoke(backend.demo_status, actor)

    @router.get("/buildings", response_model=BuildingsResponse)
    def buildings() -> BuildingsResponse:
        """List verified campus buildings; public map data needing no location permission."""
        return backend.campus_buildings()

    @router.get("/demo/areas", response_model=DemoAreasResponse)
    def areas() -> DemoAreasResponse:
        """List the fixed, unverified demo areas a visitor may join from."""
        return invoke(backend.areas)

    @router.post("/sessions", response_model=JoinResponse, status_code=201)
    def join(request: JoinRequest) -> JoinResponse:
        """Create a distinct visitor session; the token is the only credential."""
        return invoke(backend.join, request)

    @router.get("/sessions/me", response_model=SessionStudent)
    def session_me(actor: Identity) -> SessionStudent:
        """Let a returning browser confirm its session survived resets."""
        return invoke(backend.session_me, actor)

    @router.delete("/sessions/me", response_model=SessionLeftResponse)
    def leave(actor: Identity) -> SessionLeftResponse:
        """Remove the visitor, release holds and revoke the token."""
        return invoke(backend.leave, actor)

    return router
