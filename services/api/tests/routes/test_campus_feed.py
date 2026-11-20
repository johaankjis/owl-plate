"""Campus-wide feed over HTTP across real fixture buildings, with no student location."""

HOST = {"Authorization": "Bearer demo-host"}
PROJECTOR = {"Authorization": "Bearer demo-projector"}
NEAR = "ksu-marietta-fixture-near"
FAR = "ksu-marietta-fixture-far"
SAFE = {"covered_and_temperature_safe": True, "served_within_two_hours": True, "untouched": True}
STUDENT_KEYS = {"nickname", "area", "h3_cell", "ring_distance", "allergens", "diets", "token"}


def join(client, nickname, **extra):
    response = client.post("/sessions", json={"nickname": nickname, **extra})
    assert response.status_code == 201, response.text
    body = response.json()
    return {"Authorization": f"Bearer {body['token']}"}, body["student"]


def publish(client, building_code, servings, **extra):
    created = client.post(
        "/drops", headers=HOST, files={"photo": ("food.png", b"photo", "image/png")}
    ).json()
    assert created["distribution_mode"] == "campus_feed"
    edited = client.patch(
        f"/drops/{created['id']}",
        headers=HOST,
        json={
            "servings_final": servings,
            "allergens_final": ["dairy", "gluten"],
            "diet_tags_final": [],
            "building_code": building_code,
            "safety_review": SAFE,
            **extra,
        },
    )
    assert edited.status_code == 200, edited.text
    assert client.post(f"/drops/{created['id']}/publish", headers=HOST).status_code == 200
    return created["id"]


def keys(value) -> set[str]:
    """Every key anywhere in a JSON document, to prove absent private fields."""
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in keys(v)}
    return set()


def test_feed_spans_buildings_and_ignores_any_location_input(feed_client):
    headers, student = join(feed_client, "Riley", area="ksu-marietta-made-up")
    assert student["area"] is None
    near = publish(feed_client, NEAR, 2, room="214", pickup_instructions="East door table")
    feed_client.post("/demo/tick", headers=HOST, json={"advance_seconds": 5})
    far = publish(feed_client, FAR, 1)
    checkin = feed_client.post(
        "/students/me/presence", headers=headers, json={"building_code": NEAR}
    )
    assert checkin.status_code == 409 and checkin.json()["detail"]["code"] == "invalid_state"
    assert feed_client.get("/sessions/me", headers=headers).json()["area"] is None

    body = feed_client.get("/students/me/feed", headers=headers).json()
    assert set(body) == {"drops", "server_time", "is_demo"}
    assert [item["drop"]["id"] for item in body["drops"]] == [far, near]
    near_tile = body["drops"][1]
    assert near_tile["drop"]["building"]["id"] == NEAR and near_tile["drop"]["room"] == "214"
    assert near_tile["drop"]["pickup_instructions"] == "East door table"
    assert near_tile["drop"]["allergen_notice"] == "may contain, confirm with host"
    assert set(near_tile) == {"drop", "can_reserve", "unavailable_reason", "claim"}
    assert feed_client.get(f"/drops/{far}", headers=headers).status_code == 200

    claim = feed_client.post(f"/drops/{far}/reserve", headers=headers)
    assert claim.status_code == 200 and claim.json()["status"] == "held"
    other = feed_client.post(f"/drops/{near}/reserve", headers=headers)
    assert other.status_code == 409 and other.json()["detail"]["code"] == "active_claim"
    assert feed_client.post(f"/drops/{near}/reserve", headers=HOST).status_code == 403
    assert feed_client.post(f"/drops/{near}/reserve").status_code == 401
    missing = feed_client.post(
        "/drops/00000000-0000-0000-0000-000000000000/reserve", headers=headers
    )
    assert missing.status_code == 404

    host_view = feed_client.get(f"/drops/{far}", headers=HOST).json()
    assert host_view["counts"] == {"total": 1, "available": 0, "held": 1, "picked_up": 0}
    assert host_view["status"] == "claimed_out"
    dispatch = feed_client.get(f"/drops/{near}/dispatch", headers=PROJECTOR).json()
    assert dispatch["visitors"] == [] and dispatch["next_wave_at"] is None


def test_projector_distribution_groups_host_buildings_only(feed_client):
    empty = feed_client.get("/distribution", headers=PROJECTOR)
    assert empty.status_code == 200
    assert empty.json()["active_drops"] == 0 and empty.json()["buildings"] == []
    assert empty.json()["available_drops"] == 0
    headers, _ = join(feed_client, "Riley")
    join(feed_client, "Casey")
    first = publish(feed_client, NEAR, 2)
    publish(feed_client, NEAR, 3)
    publish(feed_client, FAR, 1)
    feed_client.post(f"/drops/{first}/reserve", headers=headers)

    body = feed_client.get("/distribution", headers=PROJECTOR).json()
    assert body["distribution_mode"] == "campus_feed"
    assert body["active_drops"] == 3 and body["joined_students"] == 2
    assert body["counts"] == {"total": 6, "available": 5, "held": 1, "picked_up": 0}
    rows = {row["building_code"]: row for row in body["buildings"]}
    assert rows[NEAR]["active_drops"] == 2 and rows[NEAR]["counts"]["held"] == 1
    assert rows[FAR]["building"]["id"] == FAR and rows[FAR]["counts"]["available"] == 1
    assert body["available_drops"] == 3
    assert (rows[NEAR]["available_drops"], rows[FAR]["available_drops"]) == (2, 1)
    other, _ = join(feed_client, "Avery")
    far_drop = next(
        d["drop"]["id"]
        for d in feed_client.get("/students/me/feed", headers=other).json()["drops"]
        if d["drop"]["building_code"] == FAR
    )
    assert feed_client.post(f"/drops/{far_drop}/reserve", headers=other).status_code == 200
    after = feed_client.get("/distribution", headers=PROJECTOR).json()
    assert (after["active_drops"], after["available_drops"]) == (3, 2)
    far_row = next(row for row in after["buildings"] if row["building_code"] == FAR)
    assert (far_row["active_drops"], far_row["available_drops"]) == (1, 0)
    assert far_row["counts"] == {"total": 1, "available": 0, "held": 1, "picked_up": 0}
    assert not keys(body) & STUDENT_KEYS
    assert "Riley" not in str(body) and "Casey" not in str(body)
    for denied in (HOST, headers):
        assert feed_client.get("/distribution", headers=denied).status_code == 403
