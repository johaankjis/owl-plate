"""Photo-assisted pickup: ownership before the model, idempotency, races, expiry and privacy."""

import logging
import threading
from uuid import uuid4

import pytest
from sqlmodel import Session, select

from services.api.application import DomainError
from services.api.db.models import HostPickupNotification, PickupAttempt
from services.api.pickup.contract import PickupAssessment
from services.api.schemas.api import PICKUP_NOTICE, JoinRequest
from services.api.tests.conftest import publish_drop

PHOTO = b"SYNTHETIC-PHOTO-BYTES-must-never-be-stored"


class ScriptedVerifier:
    """Offline fake: counts calls, optionally blocks, returns a scripted assessment."""

    source = "fixture"

    def __init__(self, status="consistent", confidence=0.95, error=None):
        self.status, self.confidence, self.error = status, confidence, error
        self.calls: list[tuple[bytes, list]] = []
        self.entered = threading.Event()
        self.release = threading.Event()
        self.release.set()

    def assess(self, photo, listing):
        self.calls.append((photo, list(listing)))
        self.entered.set()
        assert self.release.wait(5)
        if self.error:
            raise self.error
        return PickupAssessment(
            match_status=self.status, confidence=self.confidence, explanation="Pizza slices."
        )


@pytest.fixture
def feed(backend):
    backend.reset(backend.actor("demo-host"), "visitors")
    backend.verify_pickup = ScriptedVerifier()
    backend.host_sent = []
    backend.notify = lambda *args, **kwargs: None
    backend.notify_host = lambda *args: backend.host_sent.append(args)
    return backend


def visitor(backend, nickname):
    return backend.actor(backend.join(JoinRequest(nickname=nickname)).token)


def held(backend, nickname="Riley", servings=2, minutes=45):
    actor = visitor(backend, nickname)
    drop = publish_drop(backend, servings=servings, minutes=minutes)
    return actor, drop, backend.reserve(actor, str(drop.id))


def code(call) -> str:
    with pytest.raises(DomainError) as failure:
        call()
    return failure.value.code


def check(backend, actor, claim, request_id=None):
    return backend.submit_pickup_photo(actor, str(claim.id), PHOTO, request_id or uuid4())


def test_consistent_result_permits_only_explicit_pickup_and_one_host_event(feed):
    actor, drop, claim = held(feed)
    result = check(feed, actor, claim)
    assert result.status == "ready" and result.match_status == "consistent"
    assert result.can_confirm and result.notice == PICKUP_NOTICE
    assert result.review_status == "not_requested" and result.source == "fixture"
    _, listing = feed.verify_pickup.calls[0]
    assert [item.name for item in listing] == ["Simulated tray"]
    host = feed.actor("demo-host")
    assert feed.get_drop(host, str(drop.id)).counts.held == 1, "a result never auto-consumes"
    assert feed.host_sent == []

    assert code(lambda: feed.update_claim(actor, str(claim.id), pickup=True)) == (
        "pickup_verification_required"
    )
    picked = feed.update_claim(actor, str(claim.id), pickup=True, verification_id=result.id)
    assert picked.status == "picked_up"
    again = feed.update_claim(actor, str(claim.id), pickup=True, verification_id=result.id)
    assert again == picked
    assert feed.update_claim(actor, str(claim.id), pickup=True) == picked
    counts = feed.get_drop(host, str(drop.id)).counts
    assert (counts.available, counts.held, counts.picked_up) == (1, 0, 1)
    assert len(feed.host_sent) == 1
    _, host_id, drop_id, body = feed.host_sent[0]
    assert (host_id, drop_id) == ("demo-host", str(drop.id))
    assert body == "A serving of Simulated tray was marked collected. 1 serving available."
    feed.deliver_notifications()
    feed.tick(30)
    assert len(feed.host_sent) == 1
    after = feed.pickup_verification(actor, str(claim.id)).verification
    assert after.can_confirm is False


@pytest.mark.parametrize(
    "status,confidence,expected",
    [
        ("uncertain", 0.9, "uncertain"),
        ("inconsistent", 0.9, "inconsistent"),
        ("consistent", 0.79, "uncertain"),
    ],
)
def test_uncertain_inconsistent_and_low_confidence_cannot_confirm(
    feed, status, confidence, expected
):
    feed.verify_pickup = ScriptedVerifier(status, confidence)
    actor, _, claim = held(feed)
    result = check(feed, actor, claim)
    assert result.match_status == expected and not result.can_confirm
    assert (
        code(
            lambda: feed.update_claim(actor, str(claim.id), pickup=True, verification_id=result.id)
        )
        == "invalid_state"
    )
    assert feed.pickup_verification(actor, str(claim.id)).verification.status == "ready"


@pytest.mark.parametrize(
    "bad",
    [
        RuntimeError("provider down with secret body"),
        PickupAssessment.model_construct(
            match_status="consistent", confidence=float("nan"), explanation="x"
        ),
        PickupAssessment.model_construct(match_status="match", confidence=0.9, explanation="x"),
        PickupAssessment.model_construct(
            match_status="consistent", confidence=0.99, explanation="x" * 501
        ),
    ],
)
def test_provider_errors_and_malformed_results_fail_closed_without_fallback(feed, bad, caplog):
    verifier = ScriptedVerifier()
    if isinstance(bad, Exception):
        verifier.error = bad
    else:
        verifier.assess = lambda photo, listing: bad
    feed.verify_pickup = verifier
    actor, _, claim = held(feed)
    with caplog.at_level(logging.DEBUG):
        result = check(feed, actor, claim)
    assert result.status == "failed" and result.match_status is None
    assert result.confidence is None and not result.can_confirm
    assert "secret" not in caplog.text and "SYNTHETIC-PHOTO" not in caplog.text
    assert (
        code(
            lambda: feed.update_claim(actor, str(claim.id), pickup=True, verification_id=result.id)
        )
        == "invalid_state"
    )
    # A failed check can be retried with a new photo request.
    feed.verify_pickup = ScriptedVerifier()
    assert check(feed, actor, claim).can_confirm


def test_foreign_expired_released_and_seeded_claims_rejected_before_model_call(feed):
    verifier = feed.verify_pickup
    actor, _, claim = held(feed)
    stranger = visitor(feed, "Stranger")
    assert code(lambda: check(feed, stranger, claim)) == "not_found"
    assert code(lambda: check(feed, feed.actor("demo-host"), claim)) == "forbidden"
    assert code(lambda: feed.pickup_verification(stranger, str(claim.id))) == "not_found"
    assert code(lambda: feed.submit_pickup_photo(actor, str(claim.id), b"", uuid4())) == (
        "invalid_photo"
    )
    big = b"x" * (10 * 1024 * 1024 + 1)
    assert code(lambda: feed.submit_pickup_photo(actor, str(claim.id), big, uuid4())) == (
        "photo_too_large"
    )

    def reject(photo):
        raise ValueError("not an image")

    feed.validate_photo = reject
    assert code(lambda: check(feed, actor, claim)) == "invalid_photo"
    feed.validate_photo = lambda b: b
    feed.tick(601)
    assert code(lambda: check(feed, actor, claim)) == "invalid_state"

    other, _, second = held(feed, "Other")
    feed.update_claim(other, str(second.id))
    assert code(lambda: check(feed, other, second)) == "invalid_state"
    assert verifier.calls == []

    feed.verify_pickup = None
    third_actor, _, third = held(feed, "Third")
    assert code(lambda: check(feed, third_actor, third)) == "pickup_verification_unavailable"


def test_seeded_rehearsal_keeps_labeled_legacy_no_body_pickup(backend):
    backend.verify_pickup = ScriptedVerifier()
    drop = publish_drop(backend, servings=2)
    student = backend.actor("demo-student-A")
    invite = next(i for i in backend.invites(student).invites if i.drop.id == drop.id)
    claim = backend.claim(student, str(invite.id))
    assert code(lambda: check(backend, student, claim)) == "invalid_state"
    assert backend.update_claim(student, str(claim.id), pickup=True).status == "picked_up"
    assert backend.verify_pickup.calls == []


def test_same_request_retry_is_idempotent_and_concurrent_retry_does_not_call_twice(feed):
    actor, _, claim = held(feed)
    verifier = feed.verify_pickup
    verifier.release.clear()
    request_id = uuid4()
    outcome = {}
    first = threading.Thread(
        target=lambda: outcome.setdefault("first", check(feed, actor, claim, request_id))
    )
    first.start()
    assert verifier.entered.wait(5)
    retry = check(feed, actor, claim, request_id)
    assert retry.status == "processing" and not retry.can_confirm
    assert code(lambda: check(feed, actor, claim)) == "verification_in_progress"
    pending = feed.pickup_verification(actor, str(claim.id)).verification
    assert pending.status == "processing" and pending.id == retry.id
    verifier.release.set()
    first.join(5)
    assert outcome["first"].id == retry.id and outcome["first"].status == "ready"
    assert (
        check(feed, actor, claim, request_id)
        == feed.pickup_verification(actor, str(claim.id)).verification
    )
    assert len(verifier.calls) == 1


def test_parallel_same_key_submissions_make_one_model_call(feed):
    actor, _, claim = held(feed)
    request_id = uuid4()
    barrier = threading.Barrier(5)
    results = []

    def submit():
        barrier.wait()
        results.append(check(feed, actor, claim, request_id))

    threads = [threading.Thread(target=submit) for _ in range(5)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
    assert len(results) == 5 and len({r.id for r in results}) == 1
    assert len(feed.verify_pickup.calls) == 1


def test_stale_processing_fails_after_120_seconds_and_late_result_cannot_overwrite(feed):
    actor, _, claim = held(feed)
    verifier = feed.verify_pickup
    verifier.release.clear()
    outcome = {}
    slow = threading.Thread(target=lambda: outcome.setdefault("late", check(feed, actor, claim)))
    slow.start()
    assert verifier.entered.wait(5)
    feed.tick(119)
    assert feed.pickup_verification(actor, str(claim.id)).verification.status == "processing"
    feed.tick(1)
    stale = feed.pickup_verification(actor, str(claim.id)).verification
    assert stale.status == "failed" and "timed out" in stale.explanation

    replacement = ScriptedVerifier("uncertain", 0.9)
    feed.verify_pickup = replacement
    newer = check(feed, actor, claim)
    assert newer.match_status == "uncertain"
    verifier.release.set()
    slow.join(5)
    assert outcome["late"].status == "failed" and not outcome["late"].can_confirm
    latest = feed.pickup_verification(actor, str(claim.id)).verification
    assert latest.id == newer.id and latest.match_status == "uncertain"
    with Session(feed.engine) as session:
        ordinals = session.exec(
            select(PickupAttempt.ordinal).where(PickupAttempt.claim_id == str(claim.id))
        ).all()
    assert sorted(ordinals) == [1, 2]


def test_hold_expiry_during_model_call_blocks_confirmation(feed):
    actor, drop, claim = held(feed)
    verifier = feed.verify_pickup
    verifier.release.clear()
    outcome = {}
    call = threading.Thread(target=lambda: outcome.setdefault("r", check(feed, actor, claim)))
    call.start()
    assert verifier.entered.wait(5)
    feed.update_claim(actor, str(claim.id))  # Released while the model is still thinking.
    verifier.release.set()
    call.join(5)
    result = outcome["r"]
    assert result.status == "ready" and result.match_status == "consistent"
    assert not result.can_confirm
    assert (
        code(
            lambda: feed.update_claim(actor, str(claim.id), pickup=True, verification_id=result.id)
        )
        == "invalid_state"
    )
    counts = feed.get_drop(feed.actor("demo-host"), str(drop.id)).counts
    assert (counts.available, counts.picked_up) == (2, 0)


def test_expired_hold_cannot_complete_even_with_consistent_result(feed):
    actor, drop, claim = held(feed)
    result = check(feed, actor, claim)
    feed.tick(601)
    assert not feed.pickup_verification(actor, str(claim.id)).verification.can_confirm
    assert (
        code(
            lambda: feed.update_claim(actor, str(claim.id), pickup=True, verification_id=result.id)
        )
        == "invalid_state"
    )
    assert feed.get_drop(feed.actor("demo-host"), str(drop.id)).counts.available == 2
    assert feed.host_sent == []


def test_newer_attempt_supersedes_older_consistent_result(feed):
    actor, _, claim = held(feed)
    first = check(feed, actor, claim)
    feed.verify_pickup = ScriptedVerifier("inconsistent", 0.9)
    second = check(feed, actor, claim)
    assert second.match_status == "inconsistent"
    assert (
        code(lambda: feed.update_claim(actor, str(claim.id), pickup=True, verification_id=first.id))
        == "invalid_state"
    )
    other, _, foreign = held(feed, "Other")
    foreign_check = check(feed, other, foreign)
    assert (
        code(
            lambda: feed.update_claim(
                actor, str(claim.id), pickup=True, verification_id=foreign_check.id
            )
        )
        == "invalid_state"
    )
    with Session(feed.engine) as session:
        assert session.get(PickupAttempt, str(first.id)).review_status == "superseded"


def test_concurrent_confirmations_consume_once_and_enqueue_one_event(feed):
    actor, drop, claim = held(feed, servings=1)
    result = check(feed, actor, claim)
    barrier = threading.Barrier(6)
    outcomes = []

    def confirm():
        barrier.wait()
        outcomes.append(
            feed.update_claim(actor, str(claim.id), pickup=True, verification_id=result.id).status
        )

    threads = [threading.Thread(target=confirm) for _ in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
    assert outcomes == ["picked_up"] * 6
    counts = feed.get_drop(feed.actor("demo-host"), str(drop.id)).counts
    assert (counts.available, counts.picked_up) == (0, 1)
    with Session(feed.engine) as session:
        events = session.exec(select(HostPickupNotification)).all()
    assert len(events) == 1 and events[0].available == 0
    assert len(feed.host_sent) == 1
    assert feed.host_sent[0][3].endswith("0 servings available.")


def test_attempt_storage_holds_no_photo_identity_or_image_data(feed):
    actor, _, claim = held(feed)
    check(feed, actor, claim)
    with Session(feed.engine) as session:
        attempt = session.exec(select(PickupAttempt)).one()
        stored = attempt.model_dump()
    assert set(stored) == {
        "id",
        "claim_id",
        "drop_id",
        "request_id",
        "ordinal",
        "status",
        "match_status",
        "confidence",
        "explanation",
        "source",
        "created_at",
        "review_status",
        "review_requested_at",
        "reviewed_at",
        "completed_by",
    }
    assert "SYNTHETIC-PHOTO" not in str(stored) and "base64" not in str(stored)
    database = feed.engine.url.database
    feed.engine.dispose()
    with open(database, "rb") as raw:
        assert b"SYNTHETIC-PHOTO" not in raw.read()


def test_reset_clears_attempts_and_host_events(feed):
    actor, _, claim = held(feed)
    result = check(feed, actor, claim)
    feed.update_claim(actor, str(claim.id), pickup=True, verification_id=result.id)
    feed.reset(feed.actor("demo-host"), "visitors")
    with Session(feed.engine) as session:
        assert session.exec(select(PickupAttempt)).all() == []
        assert session.exec(select(HostPickupNotification)).all() == []
