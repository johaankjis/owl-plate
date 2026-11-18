"""End-to-end Join Demo: four visitors from photo through widened wave two, isolated."""

HOST = {"Authorization": "Bearer demo-host"}
PROJECTOR = {"Authorization": "Bearer demo-projector"}


def join(client, nickname, area, allergens=(), diets=()):
    """Join a visitor over HTTP and return auth headers plus the session student."""
    response = client.post(
        "/sessions",
        json={
            "nickname": nickname,
            "area": area,
            "allergens": list(allergens),
            "diets": list(diets),
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["token"].startswith("demo-session-")
    return {"Authorization": f"Bearer {body['token']}"}, body["student"]


def rows_by_nickname(state):
    """Index projector visitor rows for readable assertions."""
    return {row["nickname"]: row for row in state["visitors"]}


def test_join_demo_visitors_scenario_end_to_end(client, backend):
    reset = client.post("/demo/reset", headers=PROJECTOR, json={"scenario": "visitors"})
    assert reset.status_code == 200 and reset.json()["scenario"] == "visitors"

    areas = client.get("/demo/areas").json()["areas"]
    assert [area["ring_distance"] for area in areas] == [0, 1, 4, 8]

    v1, s1 = join(client, "V1", "demo-venue")
    v2, s2 = join(client, "V2", "demo-next-door")
    v3, s3 = join(client, "V3", "demo-venue", allergens=["dairy"])
    v4, s4 = join(client, "V4", "demo-across-quad")
    assert len({student["id"] for student in (s1, s2, s3, s4)}) == 4
    for headers, student in ((v1, s1), (v2, s2), (v3, s3), (v4, s4)):
        me = client.get("/sessions/me", headers=headers).json()
        assert me["id"] == student["id"]
        assert me["nickname"] == student["nickname"] and me["area"] == student["area"]

    collision = client.post("/sessions", json={"nickname": "v1", "area": "demo-venue"})
    assert collision.status_code == 409
    assert collision.json()["detail"]["code"] == "nickname_taken"

    created = client.post(
        "/drops", headers=HOST, files={"photo": ("food.png", b"photo", "image/png")}
    ).json()
    edited = client.patch(
        f"/drops/{created['id']}",
        headers=HOST,
        json={
            "servings_final": 2,
            "allergens_final": ["dairy", "gluten"],
            "diet_tags_final": [],
            "building_code": "DEMO-ORIGIN",
            "safety_review": {
                "covered_and_temperature_safe": True,
                "served_within_two_hours": True,
                "untouched": True,
            },
        },
    )
    assert edited.status_code == 200

    draft = client.get(f"/drops/{created['id']}/dispatch", headers=PROJECTOR).json()
    assert all(
        row["status"] == "waiting" and row["reason_codes"] == ["not_published"]
        for row in draft["visitors"]
    )
    assert client.get(f"/drops/{created['id']}/dispatch", headers=v1).status_code == 403

    published = client.post(f"/drops/{created['id']}/publish", headers=HOST)
    assert published.status_code == 200

    state = client.get(f"/drops/{created['id']}/dispatch", headers=PROJECTOR).json()
    assert state["scenario"] == "visitors" and state["personas"] == []
    assert [row["nickname"] for row in state["visitors"]] == ["V1", "V2", "V3", "V4"]
    wave_one = rows_by_nickname(state)
    assert wave_one["V1"]["status"] == "sent" and wave_one["V1"]["wave_number"] == 1
    assert wave_one["V1"]["reason_codes"] == ["nearby", "diet_match", "fair_share"]
    assert wave_one["V1"]["ring_distance"] == 0
    assert wave_one["V2"]["status"] == "sent" and wave_one["V2"]["ring_distance"] == 1
    assert wave_one["V3"]["status"] == "excluded" and wave_one["V3"]["wave_number"] is None
    assert wave_one["V3"]["reason_codes"] == ["dietary_filter"]
    assert wave_one["V4"]["status"] == "excluded"
    assert wave_one["V4"]["reason_codes"] == ["out_of_range"]
    for row in state["visitors"]:
        assert set(row) == {
            "nickname",
            "area",
            "ring_distance",
            "status",
            "reason_codes",
            "h3_cell",
            "wave_number",
        }

    invites = {
        name: client.get("/students/me/invites", headers=headers).json()["invites"]
        for name, headers in (("V1", v1), ("V2", v2), ("V3", v3), ("V4", v4))
    }
    assert len(invites["V1"]) == 1 and len(invites["V2"]) == 1
    assert invites["V3"] == [] and invites["V4"] == []
    assert invites["V1"][0]["id"] != invites["V2"][0]["id"]
    assert client.post(f"/invites/{invites['V2'][0]['id']}/claim", headers=v1).status_code == 404
    assert client.post(f"/invites/{invites['V1'][0]['id']}/decline", headers=v2).status_code == 404
    claim = client.post(f"/invites/{invites['V1'][0]['id']}/claim", headers=v1).json()
    assert client.post(f"/claims/{claim['id']}/release", headers=v2).status_code == 404

    backend.tick(61)

    state = client.get(f"/drops/{created['id']}/dispatch", headers=PROJECTOR).json()
    assert [wave["ring_k"] for wave in state["waves"]] == [2, 4]
    widened = rows_by_nickname(state)
    assert widened["V2"]["status"] == "expired"
    assert widened["V4"]["status"] == "sent" and widened["V4"]["wave_number"] == 2
    assert widened["V3"]["reason_codes"] == ["dietary_filter"]

    status = client.get("/demo/status", headers=PROJECTOR).json()
    assert status["scenario"] == "visitors" and status["visitors"] == 4
    assert status["active_drop_id"] == created["id"]
    assert status["clock_offset_seconds"] == 61

    fourth = client.get("/students/me/invites", headers=v4).json()["invites"]
    assert len(fourth) == 1
    assert client.post(f"/invites/{fourth[0]['id']}/claim", headers=v4).status_code == 200
    left = client.delete("/sessions/me", headers=v4)
    assert left.status_code == 200 and left.json() == {"status": "left"}
    revoked = client.get("/students/me/invites", headers=v4)
    assert revoked.status_code == 401
    assert revoked.json()["detail"] == {
        "code": "unauthorized",
        "message": "Session ended. Join again.",
    }
    state = client.get(f"/drops/{created['id']}/dispatch", headers=PROJECTOR).json()
    assert "V4" not in rows_by_nickname(state)
    assert state["counts"]["held"] == 1 and state["counts"]["available"] == 1

    reset = client.post("/demo/reset", headers=HOST, json={"scenario": "visitors"})
    assert reset.json()["scenario"] == "visitors"
    for headers in (v1, v2, v3):
        response = client.get("/students/me/invites", headers=headers)
        assert response.status_code == 401
        assert response.json()["detail"]["message"] == "Session ended. Join again."
    assert client.get("/students/me/invites", headers=HOST).status_code == 403
    assert (
        client.get(
            "/students/me/invites", headers={"Authorization": "Bearer demo-student-A"}
        ).status_code
        == 200
    )
