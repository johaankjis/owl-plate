"""Encrypt recipient tokens and send real pushes only to opted-in, authorized recipients."""

import logging
import re
from collections.abc import Callable
from uuid import UUID

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Engine, delete
from sqlmodel import Field, Session, SQLModel

from services.api.db.session import transaction
from services.api.providers.notifications import NotificationMode

logger = logging.getLogger(__name__)


class PushRegistration(SQLModel, table=True):
    """Store opaque encrypted tokens; never serialize this table to a public response."""

    student_id: str = Field(primary_key=True)
    ciphertext: str


class TokenVault:
    """Keep plaintext tokens inside the transport boundary only."""

    def __init__(self, engine: Engine, encryption_key: str) -> None:
        self.engine = engine
        self.cipher = Fernet(encryption_key.encode())

    def register(self, student_id: str, token: str) -> None:
        """Replace a student's device token without persisting or logging plaintext."""
        encrypted = self.cipher.encrypt(token.encode()).decode()
        with transaction(self.engine) as session:
            session.merge(PushRegistration(student_id=student_id, ciphertext=encrypted))

    def has(self, student_id: str) -> bool:
        """Let the sender fall back to simulation for students who never opted in."""
        with Session(self.engine) as session:
            return session.get(PushRegistration, student_id) is not None

    def forget(self, student_id: str) -> None:
        """Drop a device token when its visitor session ends."""
        with transaction(self.engine) as session:
            session.execute(
                delete(PushRegistration).where(PushRegistration.student_id == student_id)
            )

    def resolve(self, student_id: str) -> str:
        """Decrypt only when the authorized transport needs a recipient."""
        with Session(self.engine) as session:
            registration = session.get(PushRegistration, student_id)
            if registration is None:
                raise RuntimeError("Demo recipient has not registered this device")
            try:
                return self.cipher.decrypt(registration.ciphertext.encode()).decode()
            except InvalidToken:
                raise RuntimeError("Push token decryption unavailable") from None


class FcmNotifications:
    """Push only to recipients the policy allows and who registered a device; simulate the rest."""

    def __init__(
        self,
        vault: TokenVault,
        project_id: str,
        is_allowed: Callable[[str], bool],
        access_token: Callable[[], str],
    ) -> None:
        if not re.fullmatch(r"[a-z][a-z0-9-]{4,62}", project_id):
            raise ValueError("FCM requires a valid Firebase project ID")
        self.vault = vault
        self.project_id = project_id
        self.is_allowed = is_allowed
        self.access_token = access_token

    def notify(
        self,
        invite_id: str,
        student_id: str,
        drop_id: str,
        *,
        mode: NotificationMode = "seeded_waves",
    ) -> None:
        """Send one push per new invite or feed drop; acceptance is not proof of receipt."""
        if not self.is_allowed(student_id) or not self.vault.has(student_id):
            logger.info("Simulated notification (no opted-in device)")
            return
        token = self.vault.resolve(student_id)
        try:
            with httpx.Client(timeout=15) as client:
                response = client.post(
                    f"https://fcm.googleapis.com/v1/projects/{self.project_id}/messages:send",
                    headers={"Authorization": f"Bearer {self.access_token()}"},
                    json={"message": push_message(token, invite_id, drop_id, mode)},
                )
                response.raise_for_status()
        except (httpx.HTTPError, ValueError):
            raise RuntimeError("Push transport unavailable; receipt remains unverified") from None
        logger.info("Real push accepted by FCM")


FEED_TTL_SECONDS = 900


def push_message(
    token: str, invite_id: str, drop_id: str, mode: NotificationMode = "seeded_waves"
) -> dict:
    """Keep lock-screen text generic; the tap opens the drop or this student's own invite.

    Feed alerts carry only the drop ID and a stable per-drop tag and Web Push topic, so a
    retried or duplicated send collapses on the device instead of buzzing twice.
    """
    if mode == "campus_feed":
        drop_key = UUID(drop_id).hex  # 32 URL-safe characters, the Web Push Topic limit.
        return {
            "token": token,
            "data": {
                "title": "Owl Plate: Free food on campus",
                "body": "New food was just posted. Tap to view it.",
                "notification_mode": "campus_feed",
                "drop_id": drop_id,
                "tag": f"owl-drop-{drop_id}",
                "url": f"/student?drop={drop_id}",
            },
            "webpush": {
                "headers": {"TTL": str(FEED_TTL_SECONDS), "Urgency": "high", "Topic": drop_key},
            },
        }
    return {
        "token": token,
        "data": {
            "title": "Owl Plate: Food nearby",
            "body": "You have a new invite. Tap to view it.",
            "notification_mode": "seeded_waves",
            "invite_id": invite_id,
            "drop_id": drop_id,
            "url": f"/student?invite={invite_id}",
        },
        "webpush": {
            "headers": {"TTL": "60", "Urgency": "high", "Topic": f"owl-{invite_id}"[:32]},
        },
    }


def service_account_access_token(info: dict) -> Callable[[], str]:
    """Load private credentials without allowing their content into transport errors."""
    from google.auth.exceptions import GoogleAuthError
    from google.auth.transport.requests import Request
    from google.oauth2.service_account import Credentials

    try:
        credentials = Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/firebase.messaging"]
        )
    except (ValueError, KeyError):
        raise ValueError("Invalid private Firebase service-account configuration") from None

    def token() -> str:
        """Refresh OAuth privately; retain only short-lived credentials in process memory."""
        try:
            if not credentials.valid:
                credentials.refresh(Request())
            if not credentials.token:
                raise RuntimeError("FCM authentication unavailable")
            return credentials.token
        except GoogleAuthError:
            raise RuntimeError("FCM authentication unavailable") from None

    return token
