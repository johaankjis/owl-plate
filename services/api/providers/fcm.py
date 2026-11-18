"""Encrypt recipient tokens and restrict real sends to explicitly authorized demo IDs."""

import re
from collections.abc import Callable

import httpx
from cryptography.fernet import Fernet, InvalidToken
from services.api.db.session import transaction
from sqlalchemy import Engine
from sqlmodel import Field, Session, SQLModel


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
    """Send uniform alerts only to a private allowlist approved for this rehearsal."""

    def __init__(
        self,
        vault: TokenVault,
        project_id: str,
        allowed_student_ids: frozenset[str],
        access_token: Callable[[], str],
    ) -> None:
        if not re.fullmatch(r"[a-z][a-z0-9-]{4,62}", project_id) or not allowed_student_ids:
            raise ValueError("FCM requires a project and explicit authorized demo recipient IDs")
        self.vault = vault
        self.project_id = project_id
        self.allowed_student_ids = allowed_student_ids
        self.access_token = access_token

    def notify(self, invite_id: str, student_id: str, drop_id: str) -> None:
        """Treat transport acceptance as send evidence, never proof of phone receipt."""
        if student_id not in self.allowed_student_ids:
            raise RuntimeError("Recipient is not authorized for real demo notifications")
        token = self.vault.resolve(student_id)
        try:
            with httpx.Client(timeout=15) as client:
                response = client.post(
                    f"https://fcm.googleapis.com/v1/projects/{self.project_id}/messages:send",
                    headers={"Authorization": f"Bearer {self.access_token()}"},
                    json={
                        "message": {
                            "token": token,
                            "notification": {
                                "title": "Food nearby",
                                "body": "Open Owl Plate to view your invitation.",
                            },
                            "data": {"drop_id": drop_id},
                            "webpush": {"headers": {"TTL": "60", "Topic": f"owl-{drop_id}"[:32]}},
                        }
                    },
                )
                response.raise_for_status()
        except (httpx.HTTPError, ValueError):
            raise RuntimeError("Push transport unavailable; receipt remains unverified") from None


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
