"""Host review: own drop only, de-identified, explicit, atomic and stale-proof."""

import threading
from uuid import uuid4

import pytest
from sqlmodel import Session, select

from services.api.application import Actor, DomainError
from services.api.db.models import HostPickupNotification, PickupAttempt
from services.api.pickup.verifiers import FixturePickupVerifier
from services.api.schemas.api import PICKUP_NOTICE, JoinRequest
from services.api.tests.conftest import publish_drop

PRIVATE = {"claim_id", "student_id", "nickname", "token", "allergens", "diets", "photo"}


@pytest.fixture
def feed(backend):
    backend.reset(backend.actor("demo-host"), "visitors")
    backend.verify_pickup = FixturePickupVerifier("uncertain")
    backend.host_sent = []
    backend.notify = lambda *args, **kwargs: None
    backend.notify_host = lambda *args: backend.host_sent.append(args)
    return backend


def code(call) -> str:
    with pytest.raises(DomainError) as failure:
        call()
    return failure.value.code


def requested(backend, nickname="Riley", servings=2):
    """A held claim whose latest uncertain check the student explicitly sent for review."""
    actor = backend.actor(backend.join(JoinRequest(nickname=nickname)).token)
    drop = publish_drop(backend, servings=servings)
    claim = backend.reserve(actor, str(drop.id))
    result = backend.submit_pickup_photo(actor, str(claim.id), b"photo", uuid4())
    assert result.match_status == "uncertain" and result.review_status == "not_requested"
    review = backend.request_pickup_review(actor, str(claim.id), result.id)
    assert review.review_status == "pending" and not review.can_confirm
    return actor, drop, claim, result


def test_queue_is_own_drop_only_and_deidentified(feed):
    actor, drop, claim, result = requested(feed)
    host = feed.actor("demo-host")
    queue = feed.pickup_reviews(host, str(drop.id))
    assert [r.id for r in queue.reviews] == [result.id]
    review = queue.reviews[0]
    assert review.notice == PICKUP_NOTICE and review.held_until == claim.held_until
    assert review.match_status == "uncertain" and review.source == "fixture"
    dumped = review.model_dump(mode="json")
    assert not set(dumped) & PRIVATE
    assert str(claim.id) not in str(dumped) and actor.id not in str(dumped)
    assert "Riley" not in str(dumped)

    other_host = Actor("host", "other-host")
    assert code(lambda: feed.pickup_reviews(other_host, str(drop.id))) == "not_found"
    for denied in (actor, feed.actor("demo-projector")):
        assert code(lambda denied=denied: feed.pickup_reviews(denied, str(drop.id))) == "forbidden"
        assert (
            code(
                lambda denied=denied: feed.decide_pickup_review(
                    denied, str(drop.id), str(result.id), "approve"
                )
            )
            == "forbidden"
        )
    assert (
        code(lambda: feed.decide_pickup_review(other_host, str(drop.id), str(result.id), "approve"))
        == "not_found"
    )
    other_drop = publish_drop(feed, servings=1)
    assert (
        code(lambda: feed.decide_pickup_review(host, str(other_drop.id), str(result.id), "approve"))
        == "not_found"
    )
    assert feed.request_pickup_review(actor, str(claim.id), result.id).review_status == "pending"
    assert len(feed.pickup_reviews(host, str(drop.id)).reviews) == 1


def test_approval_consumes_once_as_human_override(feed):
    actor, drop, claim, result = requested(feed)
    host = feed.actor("demo-host")
    approved = feed.decide_pickup_review(host, str(drop.id), str(result.id), "approve")
    assert approved.review_status == "approved" and approved.match_status == "uncertain"
    again = feed.decide_pickup_review(host, str(drop.id), str(result.id), "approve")
    assert again == approved
    assert (
        code(lambda: feed.decide_pickup_review(host, str(drop.id), str(result.id), "reject"))
        == "invalid_state"
    )
    counts = feed.get_drop(host, str(drop.id)).counts
    assert (counts.available, counts.held, counts.picked_up) == (1, 0, 1)
    assert feed.pickup_reviews(host, str(drop.id)).reviews == []
    mine = feed.pickup_verification(actor, str(claim.id)).verification
    assert mine.review_status == "approved" and not mine.can_confirm
    with Session(feed.engine) as session:
        assert session.get(PickupAttempt, str(result.id)).completed_by == "host_approval"
    assert len(feed.host_sent) == 1
    assert feed.update_claim(actor, str(claim.id), pickup=True).status == "picked_up"
    assert len(feed.host_sent) == 1


def test_rejection_keeps_hold_allows_new_photo_and_never_confirms(feed):
    actor, drop, claim, result = requested(feed)
    host = feed.actor("demo-host")
    rejected = feed.decide_pickup_review(host, str(drop.id), str(result.id), "reject")
    assert rejected.review_status == "rejected"
    assert feed.decide_pickup_review(host, str(drop.id), str(result.id), "reject") == rejected
    assert (
        code(lambda: feed.decide_pickup_review(host, str(drop.id), str(result.id), "approve"))
        == "invalid_state"
    )
    assert code(lambda: feed.request_pickup_review(actor, str(claim.id), result.id)) == (
        "invalid_state"
    )
    counts = feed.get_drop(host, str(drop.id)).counts
    assert (counts.held, counts.picked_up) == (1, 0)
    feed.verify_pickup = FixturePickupVerifier("consistent")
    retry = feed.submit_pickup_photo(actor, str(claim.id), b"photo", uuid4())
    assert retry.can_confirm
    assert (
        feed.update_claim(actor, str(claim.id), pickup=True, verification_id=retry.id).status
        == "picked_up"
    )


def test_expired_released_and_superseded_reviews_cannot_be_approved(feed):
    host = feed.actor("demo-host")
    actor, drop, claim, result = requested(feed, "Expiring")
    feed.tick(601)
    assert feed.pickup_reviews(host, str(drop.id)).reviews == []
    assert (
        code(lambda: feed.decide_pickup_review(host, str(drop.id), str(result.id), "approve"))
        == "invalid_state"
    )
    with Session(feed.engine) as session:
        assert session.get(PickupAttempt, str(result.id)).review_status == "expired"
    assert feed.get_drop(host, str(drop.id)).counts.available == 2

    actor, drop, claim, result = requested(feed, "Leaving")
    feed.update_claim(actor, str(claim.id))
    assert (
        code(lambda: feed.decide_pickup_review(host, str(drop.id), str(result.id), "approve"))
        == "invalid_state"
    )

    actor, drop, claim, result = requested(feed, "Retaking")
    newer = feed.submit_pickup_photo(actor, str(claim.id), b"photo", uuid4())
    assert feed.pickup_reviews(host, str(drop.id)).reviews == []
    assert (
        code(lambda: feed.decide_pickup_review(host, str(drop.id), str(result.id), "approve"))
        == "invalid_state"
    )
    assert (
        code(lambda: feed.decide_pickup_review(host, str(drop.id), str(newer.id), "approve"))
        == "invalid_state"
    ), "a review the student never requested cannot be decided"
    assert feed.host_sent == []


def test_review_requires_latest_ready_result_on_active_hold(feed):
    actor = feed.actor(feed.join(JoinRequest(nickname="Riley")).token)
    drop = publish_drop(feed, servings=1)
    claim = feed.reserve(actor, str(drop.id))
    assert code(lambda: feed.request_pickup_review(actor, str(claim.id), uuid4())) == (
        "invalid_state"
    )
    stranger = feed.actor(feed.join(JoinRequest(nickname="Stranger")).token)
    first = feed.submit_pickup_photo(actor, str(claim.id), b"photo", uuid4())
    assert code(lambda: feed.request_pickup_review(stranger, str(claim.id), first.id)) == (
        "not_found"
    )
    feed.submit_pickup_photo(actor, str(claim.id), b"photo", uuid4())
    assert code(lambda: feed.request_pickup_review(actor, str(claim.id), first.id)) == (
        "invalid_state"
    )


def test_concurrent_host_approval_and_student_completion_consume_once(feed):
    actor, drop, claim, _ = requested(feed, servings=1)
    feed.verify_pickup = FixturePickupVerifier("consistent")
    consistent = feed.submit_pickup_photo(actor, str(claim.id), b"photo", uuid4())
    reviewed = feed.request_pickup_review(actor, str(claim.id), consistent.id)
    assert reviewed.review_status == "pending" and reviewed.can_confirm
    host = feed.actor("demo-host")
    barrier = threading.Barrier(2)
    outcomes = []

    def run(call):
        barrier.wait()
        try:
            call()
            outcomes.append("ok")
        except DomainError as exc:
            outcomes.append(exc.code)

    threads = [
        threading.Thread(
            target=run,
            args=(
                lambda: feed.decide_pickup_review(
                    host, str(drop.id), str(consistent.id), "approve"
                ),
            ),
        ),
        threading.Thread(
            target=run,
            args=(
                lambda: feed.update_claim(
                    actor, str(claim.id), pickup=True, verification_id=consistent.id
                ),
            ),
        ),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
    assert "ok" in outcomes and set(outcomes) <= {"ok", "invalid_state"}
    counts = feed.get_drop(host, str(drop.id)).counts
    assert (counts.available, counts.held, counts.picked_up) == (0, 0, 1)
    with Session(feed.engine) as session:
        assert len(session.exec(select(HostPickupNotification)).all()) == 1
    assert len(feed.host_sent) == 1
