"""Pickup photo, verification, review and host queue over HTTP with existing error envelopes."""

from uuid import uuid4

from services.api.tests.routes.test_campus_feed import HOST, NEAR, join, keys, publish

PROJECTOR = {"Authorization": "Bearer demo-projector"}
PNG = ("food.png", b"synthetic-photo", "image/png")


def held(client, nickname="Riley"):
    headers, _ = join(client, nickname)
    drop_id = publish(client, NEAR, 2)
    claim = client.post(f"/drops/{drop_id}/reserve", headers=headers).json()
    return headers, drop_id, claim["id"]


def photo(client, headers, claim_id, request_id=None, file=PNG):
    return client.post(
        f"/claims/{claim_id}/pickup-photo",
        headers=headers,
        files={"photo": file},
        data={"request_id": str(request_id or uuid4())},
    )


def test_photo_check_then_explicit_pickup_over_http(feed_client):
    headers, drop_id, claim_id = held(feed_client)
    assert feed_client.get(f"/claims/{claim_id}/pickup-verification", headers=headers).json() == {
        "verification": None
    }
    blocked = feed_client.post(f"/claims/{claim_id}/pickup", headers=headers)
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "pickup_verification_required"

    request_id = uuid4()
    first = photo(feed_client, headers, claim_id, request_id)
    assert first.status_code == 200, first.text
    body = first.json()
    assert set(body) == {
        "id",
        "claim_id",
        "status",
        "match_status",
        "confidence",
        "explanation",
        "source",
        "created_at",
        "review_status",
        "can_confirm",
        "notice",
    }
    assert body["source"] == "fixture" and "SIMULATED" in body["explanation"]
    assert body["can_confirm"] is True and body["claim_id"] == claim_id
    assert photo(feed_client, headers, claim_id, request_id).json() == body
    latest = feed_client.get(f"/claims/{claim_id}/pickup-verification", headers=headers).json()
    assert latest["verification"] == body

    picked = feed_client.post(
        f"/claims/{claim_id}/pickup", headers=headers, json={"verification_id": body["id"]}
    )
    assert picked.status_code == 200 and picked.json()["status"] == "picked_up"
    drop = feed_client.get(f"/drops/{drop_id}", headers=HOST).json()
    assert drop["counts"] == {"total": 2, "available": 1, "held": 0, "picked_up": 1}


def test_photo_errors_and_authorization(feed_client):
    headers, _, claim_id = held(feed_client)
    other, _ = join(feed_client, "Other")
    text = photo(feed_client, headers, claim_id, file=("x.txt", b"x", "text/plain"))
    assert text.status_code == 422 and text.json()["detail"]["code"] == "invalid_photo"
    big = photo(
        feed_client, headers, claim_id, file=("b.png", b"x" * (10 * 1024 * 1024 + 1), "image/png")
    )
    assert big.status_code == 413 and big.json()["detail"]["code"] == "photo_too_large"
    assert photo(feed_client, other, claim_id).status_code == 404
    assert photo(feed_client, HOST, claim_id).status_code == 403
    assert photo(feed_client, {}, claim_id).status_code == 401
    missing = feed_client.post(
        f"/claims/{claim_id}/pickup-photo", headers=headers, files={"photo": PNG}
    )
    assert missing.status_code == 422
    assert (
        feed_client.get(f"/claims/{claim_id}/pickup-verification", headers=other).status_code == 404
    )


def test_review_request_and_host_queue_over_http(feed_client):
    headers, drop_id, claim_id = held(feed_client)
    result = photo(feed_client, headers, claim_id).json()
    asked = feed_client.post(
        f"/claims/{claim_id}/pickup-review", headers=headers, json={"verification_id": result["id"]}
    )
    assert asked.status_code == 200 and asked.json()["review_status"] == "pending"

    queue = feed_client.get(f"/drops/{drop_id}/pickup-reviews", headers=HOST)
    assert queue.status_code == 200
    reviews = queue.json()["reviews"]
    assert len(reviews) == 1 and set(queue.json()) == {"reviews", "server_time"}
    assert not keys(queue.json()) & {"claim_id", "student_id", "nickname", "token", "photo"}
    assert claim_id not in queue.text and "Riley" not in queue.text
    assert feed_client.get(f"/drops/{drop_id}/pickup-reviews", headers=headers).status_code == 403
    assert feed_client.get(f"/drops/{drop_id}/pickup-reviews", headers=PROJECTOR).status_code == 403

    path = f"/drops/{drop_id}/pickup-reviews/{reviews[0]['id']}"
    bad = feed_client.post(path, headers=HOST, json={"decision": "maybe"})
    assert bad.status_code == 422
    approved = feed_client.post(path, headers=HOST, json={"decision": "approve"})
    assert approved.status_code == 200 and approved.json()["review_status"] == "approved"
    assert feed_client.post(path, headers=HOST, json={"decision": "approve"}).json() == (
        approved.json()
    )
    contradictory = feed_client.post(path, headers=HOST, json={"decision": "reject"})
    assert contradictory.status_code == 409
    assert contradictory.json()["detail"]["code"] == "invalid_state"


def test_host_push_endpoints_without_fcm_are_honest(feed_client):
    student, _ = join(feed_client, "Riley")
    assert feed_client.get("/hosts/me/push-token", headers=HOST).json() == {"registered": False}
    unavailable = feed_client.post("/hosts/me/push-token", headers=HOST, json={"token": "dev"})
    assert unavailable.status_code == 503
    assert unavailable.json()["detail"]["code"] == "provider_unavailable"
    assert feed_client.delete("/hosts/me/push-token", headers=HOST).json() == {"registered": False}
    for denied in (student, PROJECTOR):
        assert feed_client.get("/hosts/me/push-token", headers=denied).status_code == 403
        assert (
            feed_client.post(
                "/hosts/me/push-token", headers=denied, json={"token": "d"}
            ).status_code
            == 403
        )
    assert feed_client.get("/hosts/me/push-token").status_code == 401
