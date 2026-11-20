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


def test_unapproved_or_unregistered_recipient_is_simulated_not_sent() -> None:
    class Vault:
        def __init__(self, registered: bool) -> None:
            self.registered = registered

        def has(self, student_id: str) -> bool:
            return self.registered

        def resolve(self, student_id: str) -> str:
            raise AssertionError("Simulated recipients must not reach token resolution")

    def no_token() -> str:
        raise AssertionError("Simulated recipients must not authenticate to FCM")

    FcmNotifications(Vault(True), "demo-project", lambda _: False, no_token).notify(
        "invite", "unapproved", "drop"
    )
    FcmNotifications(Vault(False), "demo-project", lambda _: True, no_token).notify(
        "invite", "approved", "drop"
    )


def test_uniform_payload_and_sanitized_transport_error(monkeypatch) -> None:
    import httpx

    class Vault:
        def has(self, student_id: str) -> bool:
            return True

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
    adapter = FcmNotifications(Vault(), "demo-project", lambda _: True, lambda: "oauth-token")
    with pytest.raises(RuntimeError) as error:
        adapter.notify("invite-id", "approved", "drop-id")
    assert "private" not in str(error.value)
    message = captured[0]["message"]
    assert message["token"] == "private-device-token"
    assert message["data"]["invite_id"] == "invite-id"
    assert message["data"]["url"] == "/student?invite=invite-id"
    assert "student" not in message["data"]["body"].lower()
    assert "priority" not in str(message) and "approved" not in str(message)
    assert message["webpush"]["headers"]["TTL"] == "60"


def test_forget_removes_registration(tmp_path) -> None:
    engine = create_database(f"sqlite:///{tmp_path / 'vault.db'}")
    vault = TokenVault(engine, Fernet.generate_key().decode())
    vault.register("visitor", "device-token")
    assert vault.has("visitor")
    vault.forget("visitor")
    assert not vault.has("visitor")


def test_feed_payload_links_the_drop_with_a_stable_generic_tag() -> None:
    from services.api.providers.fcm import push_message

    drop_id = "8d0f6a52-6c1e-4f5e-9a59-2f3c6f1e9b10"
    first = push_message("device", "outbox-1", drop_id, "campus_feed")
    retry = push_message("device", "outbox-2", drop_id, "campus_feed")
    assert first == retry, "retries of one drop collapse to the same tag and topic"
    data = first["data"]
    assert data["notification_mode"] == "campus_feed" and data["drop_id"] == drop_id
    assert data["url"] == f"/student?drop={drop_id}" and "invite_id" not in data
    assert data["tag"] == f"owl-drop-{drop_id}"
    topic = first["webpush"]["headers"]["Topic"]
    assert len(topic) <= 32 and topic == drop_id.replace("-", "")
    for private in ("dairy", "allergen", "room", "priority", "care", "vegetarian"):
        assert private not in (data["title"] + data["body"]).lower()
    legacy = push_message("device", "invite-id", drop_id)
    assert legacy["data"]["notification_mode"] == "seeded_waves"
    assert legacy["data"]["url"] == "/student?invite=invite-id"
