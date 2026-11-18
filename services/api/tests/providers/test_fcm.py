"""Verify encrypted persistence and allowlist gates without sending any real push."""

import pytest
from cryptography.fernet import Fernet
from sqlmodel import Session

from services.api.db.session import create_database
from services.api.providers.fcm import FcmNotifications, PushRegistration, TokenVault


def test_tokens_are_encrypted_and_overwrite_is_safe(tmp_path) -> None:
    engine = create_database(f"sqlite:///{tmp_path / 'vault.db'}")
    vault = TokenVault(engine, Fernet.generate_key().decode())
    vault.register("synthetic-student", "private-device-token")
    with Session(engine) as session:
        stored = session.get(PushRegistration, "synthetic-student")
        assert stored and "private-device-token" not in stored.ciphertext
    assert vault.resolve("synthetic-student") == "private-device-token"
    vault.register("synthetic-student", "rotated-private-token")
    assert vault.resolve("synthetic-student") == "rotated-private-token"


def test_unapproved_recipient_never_resolves_or_sends() -> None:
    class NeverResolve:
        def resolve(self, student_id: str) -> str:
            raise AssertionError("Unauthorized recipients must not reach token resolution")

    adapter = FcmNotifications(
        NeverResolve(), "demo-project", frozenset({"approved"}), lambda: "unused"
    )
    with pytest.raises(RuntimeError, match="not authorized"):
        adapter.notify("invite", "unapproved", "drop")


def test_uniform_payload_and_sanitized_transport_error(monkeypatch) -> None:
    import httpx

    class Vault:
        def resolve(self, student_id: str) -> str:
            return "private-device-token"

    captured = []

    def transport(request: httpx.Request) -> httpx.Response:
        import json

        captured.append(json.loads(request.content))
        return httpx.Response(403, text="private provider details", request=request)

    original = httpx.Client
    monkeypatch.setattr(
        httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(transport))
    )
    adapter = FcmNotifications(
        Vault(), "demo-project", frozenset({"approved"}), lambda: "private-oauth-token"
    )
    with pytest.raises(RuntimeError) as error:
        adapter.notify("invite-id", "approved", "drop-id")
    assert "private" not in str(error.value)
    message = captured[0]["message"]
    assert message["data"] == {"drop_id": "drop-id"}
    assert "student" not in str(message) and "priority" not in str(message)
    assert message["notification"]["body"] == "Open Owl Plate to view your invitation."
