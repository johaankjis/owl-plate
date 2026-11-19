"""Real-building drops and check-ins over HTTP: verified cells only, distance gates waves."""

import h3

from services.api.tests.conftest import FIXTURE_ORIGIN

HOST = {"Authorization": "Bearer demo-host"}
PROJECTOR = {"Authorization": "Bearer demo-projector"}
NEAR = "ksu-marietta-fixture-near"
FAR = "ksu-marietta-fixture-far"
PENDING = "ksu-marietta-fixture-pending"
UNPROVEN = "ksu-marietta-fixture-unproven"
NEAR_CELL = h3.latlng_to_cell(*FIXTURE_ORIGIN, 11)
SAFE = {"covered_and_temperature_safe": True, "served_within_two_hours": True, "untouched": True}


def join(client, nickname, area):
    """Join over HTTP and return auth headers plus the session student."""
    response = client.post("/sessions", json={"nickname": nickname, "area": area})
    assert response.status_code == 201, response.text
    body = response.json()
    return {"Authorization": f"Bearer {body['token']}"}, body["student"]


def draft(client, building_code, **extra):
    """Upload a photo and submit a complete host review at the given location."""
    created = client.post(
        "/drops", headers=HOST, files={"photo": ("food.png", b"photo", "image/png")}
    ).json()
    return created["id"], client.patch(
        f"/drops/{created['id']}",
        headers=HOST,
        json={
            "servings_final": 1,
            "allergens_final": ["dairy", "gluten"],
            "diet_tags_final": [],
            "building_code": building_code,
            "safety_review": SAFE,
            **extra,
        },
    )


def rows(client, drop_id):
    """Projector visitor rows by nickname."""
    state = client.get(f"/drops/{drop_id}/dispatch", headers=PROJECTOR).json()
    return state, {row["nickname"]: row for row in state["visitors"]}


def test_directory_lists_only_verified_buildings(campus_client):
    response = campus_client.get("/buildings")
    assert response.status_code == 200
    body = response.json()
    assert body["campus"] == "marietta"
    assert [b["id"] for b in body["buildings"]] == [NEAR, FAR]
    near = body["buildings"][0]
    assert near["verification_status"] == "verified"
    assert h3.latlng_to_cell(near["latitude"], near["longitude"], 11) == NEAR_CELL
    assert set(near) == {
        "id",
        "name",
        "building_code",
        "building_number",
        "category",
        "latitude",
        "longitude",
        "verification_status",
        "sources",
    }


def test_unknown_and_unverified_locations_are_rejected_everywhere(campus_client):
    for area in (PENDING, UNPROVEN, "ksu-marietta-made-up", "DEMO-ORIGIN"):
        response = campus_client.post("/sessions", json={"nickname": "Nope", "area": area})
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_building"
    too_long = campus_client.post("/sessions", json={"nickname": "X", "area": "a" * 81})
    assert too_long.status_code == 422
    assert campus_client.get("/demo/status", headers=HOST).json()["visitors"] == 0

    for code in (PENDING, UNPROVEN, "ksu-marietta-made-up", "demo-venue"):
        _, response = draft(campus_client, code)
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_building"

    headers, _ = join(campus_client, "Riley", NEAR)
    for code in (PENDING, UNPROVEN, "ksu-marietta-made-up"):
        response = campus_client.post(
            "/students/me/presence", headers=headers, json={"building_code": code}
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_building"
    assert campus_client.get("/sessions/me", headers=headers).json()["area"] == NEAR


def test_drop_carries_verified_building_room_and_pickup_instructions(campus_client):
    headers, _ = join(campus_client, "Riley", NEAR)
    drop_id, edited = draft(
        campus_client, NEAR, room="214", pickup_instructions="Table by the east door"
    )
    assert edited.status_code == 200
    body = edited.json()
    assert body["building_code"] == NEAR and body["room"] == "214"
    assert body["pickup_instructions"] == "Table by the east door"
    assert body["building"]["id"] == NEAR and body["building"]["name"]
    assert campus_client.post(f"/drops/{drop_id}/publish", headers=HOST).status_code == 200

    state, _ = rows(campus_client, drop_id)
    assert state["origin_cell"] == NEAR_CELL

    invite = campus_client.get("/students/me/invites", headers=headers).json()["invites"][0]
    assert invite["drop"]["building"]["id"] == NEAR
    assert invite["drop"]["pickup_instructions"] == "Table by the east door"
    assert invite["drop"]["room"] == "214"

    _, too_long = draft(campus_client, NEAR, pickup_instructions="x" * 501)
    assert too_long.status_code == 422

    _, rehearsal = draft(campus_client, "DEMO-ORIGIN")
    assert rehearsal.status_code == 200
    assert rehearsal.json()["building"] is None and rehearsal.json()["pickup_instructions"] == ""


def test_real_joins_use_the_building_cell_without_jitter(campus_client):
    _, first = join(campus_client, "Ana", NEAR)
    _, second = join(campus_client, "Bo", NEAR)
    _, legacy = join(campus_client, "Cy", "demo-venue")
    assert (first["area"], second["area"], legacy["area"]) == (NEAR, NEAR, "demo-venue")
    drop_id, _ = draft(campus_client, NEAR)
    _, by_name = rows(campus_client, drop_id)
    assert by_name["Ana"]["h3_cell"] == by_name["Bo"]["h3_cell"] == NEAR_CELL
    assert by_name["Ana"]["ring_distance"] == 0
    assert by_name["Cy"]["area"] == "demo-venue" and by_name["Cy"]["h3_cell"] != NEAR_CELL


def test_distance_and_check_ins_drive_waves(campus_client):
    near, _ = join(campus_client, "Near", NEAR)
    join(campus_client, "Stays", FAR)
    mover, _ = join(campus_client, "Mover", FAR)
    join(campus_client, "Legacy", "demo-venue")
    drop_id, _ = draft(campus_client, NEAR)
    assert campus_client.post(f"/drops/{drop_id}/publish", headers=HOST).status_code == 200

    state, by_name = rows(campus_client, drop_id)
    assert state["ring_k"] == 2
    assert by_name["Near"]["status"] == "sent" and by_name["Near"]["wave_number"] == 1
    assert by_name["Stays"]["ring_distance"] == 6
    for name in ("Stays", "Mover", "Legacy"):
        assert by_name[name]["status"] == "excluded"
        assert by_name[name]["reason_codes"] == ["out_of_range"]

    checked_in = campus_client.post(
        "/students/me/presence", headers=mover, json={"building_code": NEAR}
    )
    assert checked_in.status_code == 200
    me = campus_client.get("/sessions/me", headers=mover).json()
    assert me["area"] == NEAR

    invite = campus_client.get("/students/me/invites", headers=near).json()["invites"][0]
    campus_client.post(f"/invites/{invite['id']}/decline", headers=near)
    campus_client.post("/demo/tick", headers=HOST, json={"advance_seconds": 10})
    state, by_name = rows(campus_client, drop_id)
    assert state["ring_k"] == 4
    assert by_name["Mover"]["area"] == NEAR and by_name["Mover"]["h3_cell"] == NEAR_CELL
    assert by_name["Mover"]["status"] == "sent" and by_name["Mover"]["wave_number"] == 2
    assert by_name["Stays"]["status"] == "excluded"

    invite = campus_client.get("/students/me/invites", headers=mover).json()["invites"][0]
    campus_client.post(f"/invites/{invite['id']}/decline", headers=mover)
    campus_client.post("/demo/tick", headers=HOST, json={"advance_seconds": 10})
    state, by_name = rows(campus_client, drop_id)
    assert state["ring_k"] == 6
    assert by_name["Stays"]["status"] == "sent" and by_name["Stays"]["wave_number"] == 3
    assert by_name["Legacy"]["status"] == "excluded"


def test_legacy_rehearsal_check_in_keeps_session_area(campus_client):
    headers, _ = join(campus_client, "Riley", "demo-far-side")
    response = campus_client.post(
        "/students/me/presence", headers=headers, json={"building_code": "DEMO-ORIGIN"}
    )
    assert response.status_code == 200
    assert campus_client.get("/sessions/me", headers=headers).json()["area"] == "demo-far-side"
