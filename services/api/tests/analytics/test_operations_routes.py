"""GET /analytics/operations over real persisted rows: totals, dates, privacy and auth."""

import json
import threading
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import func
from sqlmodel import Session, SQLModel, select

from services.api.analytics.operations import window_start
from services.api.db.models import DatasetMarker, Drop, Student
from services.api.tests.analytics.conftest import (
    ACK,
    COORDINATOR,
    HOST,
    LIBRARY,
    PROJECTOR,
    join,
    operations,
    outcome_sum,
    pick_up,
    publish,
    reserve,
)

PRIVATE_KEYS = {
    "host_id",
    "student_id",
    "claim",
    "claim_id",
    "invite_id",
    "nickname",
    "token",
    "priority",
    "priority_tier",
    "allergens",
    "diets",
    "cell",
    "h3_cell",
}
SUMMARY_KEYS = {
    "published_listings",
    "active_listings",
    "total_servings_offered",
    "available_servings",
    "student_reserved_servings",
    "student_pickups",
    "pantry_reserved_servings",
    "pantry_transfers",
    "expired_unclaimed_servings",
    "pending_pickup_reviews",
    "pending_pantry_requests",
    "buildings_served",
    "joined_sessions",
    "student_pickup_rate_percent",
    "combined_recovery_rate_percent",
    "average_reservation_seconds",
    "participating_hosts",
    "participating_students",
}


def keys(value) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in keys(v)}
    return set()


def row_counts(backend) -> dict[str, int]:
    with Session(backend.engine) as session:
        return {
            name: session.exec(select(func.count()).select_from(table)).one()
            for name, table in SQLModel.metadata.tables.items()
            if name not in {"coordinator", "surveyresponse"}
        }


def test_empty_database_is_truthfully_zero(client):
    body = operations(client)
    assert set(body["summary"]) == SUMMARY_KEYS
    assert set(body) == {
        "schema_version",
        "dataset",
        "recording_available",
        "period",
        "timezone",
        "window_start",
        "server_time",
        "summary",
        "outcomes",
        "series",
        "buildings",
        "activity",
        "categories",
        "active_listings",
        "estimates",
        "notes",
    }
    assert body["schema_version"] == 1 and body["timezone"] == "America/New_York"
    assert body["dataset"] == {
        "kind": "current",
        "label": "Current app data",
        "is_simulated": False,
        "seed_version": None,
        "anchor_time": None,
    }
    summary = body["summary"]
    assert summary["average_reservation_seconds"] is None
    assert all(v == 0 for k, v in summary.items() if k != "average_reservation_seconds")
    assert outcome_sum(body) == 0
    assert [p["date"] for p in body["series"]] == [f"2026-11-{d}" for d in range(12, 19)]
    assert all(v == 0 for p in body["series"] for k, v in p.items() if k != "date")
    assert body["buildings"] == body["activity"] == body["categories"] == []
    assert body["active_listings"] == []
    assert body["estimates"]["recovered_servings"] == 0
    assert body["estimates"]["equivalent_meal_value"] == 0
    assert operations(client, "all")["series"] == []
    assert len(operations(client, "today")["series"]) == 1


def test_acceptance_three_servings_two_pickups_one_simulated_transfer(client, backend, clock):
    drop_id = publish(client, 3)
    first, second = join(client, "Riley"), join(client, "Sam")
    clock.advance(seconds=60)
    claim_a = reserve(client, first, drop_id)
    clock.advance(seconds=60)
    claim_b = reserve(client, second, drop_id)
    clock.advance(seconds=30)
    request_a = str(uuid4())
    pick_up(client, first, claim_a["id"], request_a)
    pick_up(client, second, claim_b["id"], str(uuid4()))
    referral = client.post(
        f"/drops/{drop_id}/pantry-referral", headers=HOST, json={"servings": 1, **ACK}
    ).json()
    pending = operations(client)
    assert pending["summary"]["pending_pantry_requests"] == 1
    assert pending["outcomes"]["available"] == 1  # A pending request reserves nothing.
    decision = {"decision": "accept", "servings": 1, **ACK}
    url = f"/pantry/referrals/{referral['id']}/decision"
    assert client.post(url, headers=COORDINATOR, json=decision).status_code == 200
    handoff = {"demo_handoff_confirmed": True}
    handoff_url = f"/drops/{drop_id}/pantry-referral/handoff"
    assert client.post(handoff_url, headers=HOST, json=handoff).status_code == 200

    body = operations(client)
    assert body["outcomes"] == {
        "available": 0,
        "student_reserved": 0,
        "student_pickups": 2,
        "pantry_reserved": 0,
        "pantry_transfers": 1,
        "expired_unclaimed": 0,
    }
    summary = body["summary"]
    assert summary["total_servings_offered"] == 3 == outcome_sum(body)
    assert round(summary["student_pickup_rate_percent"], 1) == 66.7
    assert summary["student_pickup_rate_percent"] == 200 / 3
    assert summary["combined_recovery_rate_percent"] == 100
    assert summary["average_reservation_seconds"] == 90
    assert (summary["participating_hosts"], summary["participating_students"]) == (1, 2)
    assert summary["joined_sessions"] == 2 and summary["buildings_served"] == 1
    assert body["estimates"] == {
        "currency": "USD",
        "meal_value_per_serving": 5.0,
        "food_kg_per_serving": 0.35,
        "recovered_servings": 3,
        "equivalent_meal_value": 15.0,
        "recovered_food_kg": 1.05,
        "assumptions": body["estimates"]["assumptions"],
    }
    assert any("Illustrative" in line for line in body["estimates"]["assumptions"])
    today = body["series"][-1]
    assert today == {
        "date": "2026-11-18",
        "published_listings": 1,
        "servings_offered": 3,
        "student_pickups": 2,
        "pantry_transfers": 1,
        "expired_unclaimed": 0,
    }
    kinds = [event["kind"] for event in body["activity"]]
    assert kinds[0] == "pantry_handoff"
    assert kinds.count("student_pickup") == 2 and kinds.count("reservation_opened") == 2
    assert kinds[-1] == "listing_published"
    assert all(e["is_simulated"] for e in body["activity"] if e["kind"].startswith("pantry"))
    assert not any(e["is_simulated"] for e in body["activity"] if e["kind"] == "student_pickup")
    listing = body["active_listings"][0]
    assert listing["status"] == "claimed_out" and listing["has_photo"] is True
    assert listing["photo_url"] == f"/drops/{drop_id}/photo"
    assert (listing["picked_up"], listing["pantry_transferred"], listing["available"]) == (2, 1, 0)
    assert client.get(listing["photo_url"], headers=PROJECTOR).status_code == 200

    # Idempotent retries of every action leave every metric unchanged.
    assert client.post(f"/drops/{drop_id}/reserve", headers=first).status_code == 200
    assert client.post(url, headers=COORDINATOR, json=decision).status_code == 200
    assert client.post(handoff_url, headers=HOST, json=handoff).status_code == 200
    retry = client.post(
        f"/claims/{claim_a['id']}/pickup", headers=first, json={"verification_id": str(uuid4())}
    )
    assert retry.status_code == 200
    again = operations(client)
    for section in ("summary", "outcomes", "series", "buildings", "categories"):
        assert again[section] == body[section]


def test_release_expiry_pending_review_and_rejection(client, backend, clock):
    drop_id = publish(client, 4, minutes=45)
    first, second = join(client, "Riley"), join(client, "Sam")
    released = reserve(client, first, drop_id)
    assert client.post(f"/claims/{released['id']}/release", headers=first).status_code == 200
    held = reserve(client, second, drop_id)
    check = client.post(
        f"/claims/{held['id']}/pickup-photo",
        headers=second,
        files={"photo": ("food.png", b"synthetic-photo", "image/png")},
        data={"request_id": str(uuid4())},
    ).json()
    backend.verify_pickup.status = "uncertain"
    check = client.post(
        f"/claims/{held['id']}/pickup-photo",
        headers=second,
        files={"photo": ("food.png", b"synthetic-photo", "image/png")},
        data={"request_id": str(uuid4())},
    ).json()
    review = client.post(
        f"/claims/{held['id']}/pickup-review",
        headers=second,
        json={"verification_id": check["id"]},
    )
    assert review.status_code == 200, review.text
    referral = client.post(
        f"/drops/{drop_id}/pantry-referral", headers=HOST, json={"servings": 2, **ACK}
    ).json()
    body = operations(client)
    assert body["summary"]["pending_pickup_reviews"] == 1
    assert body["summary"]["pending_pantry_requests"] == 1
    assert body["outcomes"]["student_reserved"] == 1 and body["outcomes"]["available"] == 3
    assert body["summary"]["participating_students"] == 2  # Released claims still count.
    rejected = client.post(
        f"/pantry/referrals/{referral['id']}/decision",
        headers=COORDINATOR,
        json={"decision": "reject", **ACK},
    )
    assert rejected.status_code == 200
    body = operations(client)
    assert body["summary"]["pending_pantry_requests"] == 0
    assert body["outcomes"]["pantry_reserved"] == 0 and body["outcomes"]["available"] == 3
    assert body["activity"][0]["kind"] == "pantry_rejected"

    clock.advance(minutes=46)
    expired = operations(client)
    assert expired["outcomes"] == {
        "available": 0,
        "student_reserved": 0,
        "student_pickups": 0,
        "pantry_reserved": 0,
        "pantry_transfers": 0,
        "expired_unclaimed": 4,
    }
    assert expired["summary"]["active_listings"] == 0 and expired["active_listings"] == []
    assert expired["summary"]["pending_pickup_reviews"] == 0
    assert expired["series"][-1]["expired_unclaimed"] == 4
    assert expired["buildings"][0]["expired_unclaimed_servings"] == 4


def test_expiry_with_accepted_pantry_allocation_returns_to_unclaimed(client, clock):
    drop_id = publish(client, 3)
    referral = client.post(
        f"/drops/{drop_id}/pantry-referral", headers=HOST, json={"servings": 2, **ACK}
    ).json()
    client.post(
        f"/pantry/referrals/{referral['id']}/decision",
        headers=COORDINATOR,
        json={"decision": "accept", "servings": 2, **ACK},
    )
    assert operations(client)["outcomes"]["pantry_reserved"] == 2
    clock.advance(minutes=46)
    body = operations(client)
    assert body["outcomes"]["expired_unclaimed"] == 3 and body["outcomes"]["pantry_reserved"] == 0
    assert body["activity"][0]["kind"] == "pantry_expired"
    assert body["activity"][0]["servings"] == 2


def test_new_york_cohort_dates_and_period_windows(client, clock):
    clock.now = datetime(2026, 11, 18, 4, 30, tzinfo=UTC)  # 23:30 on Nov 17 in New York.
    late = publish(client, 2, minutes=20)
    clock.now = datetime(2026, 11, 18, 17, tzinfo=UTC)
    today = publish(client, 5, building=LIBRARY)
    body_today = operations(client, "today")
    assert body_today["window_start"] == "2026-11-18T05:00:00Z"
    assert body_today["summary"]["published_listings"] == 1
    assert [p["date"] for p in body_today["series"]] == ["2026-11-18"]
    week = operations(client, "7d")
    assert week["window_start"] == "2026-11-12T05:00:00Z"
    assert week["summary"]["published_listings"] == 2
    by_date = {p["date"]: p for p in week["series"]}
    assert by_date["2026-11-17"]["published_listings"] == 1
    assert by_date["2026-11-17"]["expired_unclaimed"] == 2  # Expired 23:50 New York time.
    assert by_date["2026-11-18"]["servings_offered"] == 5
    everything = operations(client, "all")
    assert everything["window_start"] is None
    assert [p["date"] for p in everything["series"]] == ["2026-11-17", "2026-11-18"]
    assert operations(client, "30d")["summary"]["published_listings"] == 2
    assert {late, today} == {e["drop_id"] for e in week["activity"]}


def test_window_start_follows_daylight_saving():
    after_dst_end = datetime(2026, 11, 3, 15, tzinfo=UTC)
    assert window_start("7d", after_dst_end) == datetime(2026, 10, 28, 4, tzinfo=UTC)
    assert window_start("today", after_dst_end) == datetime(2026, 11, 3, 5, tzinfo=UTC)
    assert window_start("all", after_dst_end) is None


def test_multibuilding_rows_categories_and_unverified_locations(client, backend):
    hall = publish(client, 4)
    library = publish(client, 6, building=LIBRARY)
    legacy = publish(client, 3, building="DEMO-ORIGIN")
    students = [join(client, name) for name in ("Ana", "Ben", "Cy")]
    for index, student in enumerate(students[:2]):
        claim = reserve(client, student, library)
        pick_up(client, student, claim["id"], str(uuid4()))
    claim = reserve(client, students[2], hall)
    pick_up(client, students[2], claim["id"], str(uuid4()))
    body = operations(client)
    assert [row["building"]["id"] for row in body["buildings"]] == [
        LIBRARY,
        "ksu-marietta-joe-mack-wilson-student-center",
    ]
    assert body["summary"]["total_servings_offered"] == 13 == outcome_sum(body)
    assert sum(r["total_servings_offered"] for r in body["buildings"]) == 10
    assert body["summary"]["buildings_served"] == 2
    assert legacy not in {row["drop_id"] for row in body["active_listings"]}
    assert any("no verified building" in note for note in body["notes"])
    assert body["categories"] == [
        {
            "category": "Other",
            "published_listings": 3,
            "total_servings_offered": 13,
            "student_pickups": 3,
            "pantry_transfers": 0,
        }
    ]


def test_drafts_and_seeded_rehearsal_are_excluded(client, backend):
    client.post("/drops", headers=HOST, files={"photo": ("food.png", b"photo", "image/png")})
    backend.reset(backend.actor("demo-host"), "seeded")
    publish(client, 4, building="DEMO-ORIGIN")
    body = operations(client)
    assert body["summary"]["published_listings"] == 0 and outcome_sum(body) == 0


def test_privacy_no_identities_in_analytics(client, backend):
    drop_id = publish(client, 3)
    student = join(client, "SecretNick")
    reserve(client, student, drop_id)
    body = operations(client)
    text = json.dumps(body)
    assert not keys(body) & PRIVATE_KEYS
    assert "SecretNick" not in text and "demo-host" not in text
    with Session(backend.engine) as session:
        for student_row in session.exec(select(Student)).all():
            assert student_row.id not in text


def test_auth_period_validation_and_demo_gates(client, backend):
    url = "/analytics/operations"
    assert client.get(url).status_code == 401
    for headers in (HOST, COORDINATOR, join(client, "Riley")):
        response = client.get(url, headers=headers)
        assert response.status_code == 403, headers
    assert client.get(f"{url}?period=week", headers=PROJECTOR).status_code == 422
    assert client.get(url, headers=PROJECTOR).json()["period"] == "7d"
    backend.auth_mode = "entra"
    assert client.get(url, headers=PROJECTOR).status_code in {401, 403}


def test_get_only_sweeps_and_never_seeds(client, backend):
    publish(client, 2)
    before = row_counts(backend)
    for period in ("today", "7d", "30d", "all"):
        operations(client, period)
    assert row_counts(backend) == before
    with Session(backend.engine) as session:
        assert session.get(DatasetMarker, 1) is None


def test_concurrent_reservations_keep_inventory_reconciled(client, backend):
    drop_id = publish(client, 2)
    students = [join(client, f"Racer{n}") for n in range(6)]
    results: list[int] = []
    totals: list[int] = []

    def race(student):
        results.append(client.post(f"/drops/{drop_id}/reserve", headers=student).status_code)

    def read():
        body = operations(client)
        totals.append(outcome_sum(body) - body["summary"]["total_servings_offered"])

    threads = [threading.Thread(target=race, args=(s,)) for s in students]
    threads += [threading.Thread(target=read) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert results.count(200) == 2 and set(totals) == {0}
    body = operations(client)
    assert body["outcomes"]["student_reserved"] == 2 and body["outcomes"]["available"] == 0
    with Session(backend.engine) as session:
        assert session.get(Drop, drop_id).status == "claimed_out"
