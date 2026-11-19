"""End-to-end Join Demo in the default visitors scenario: a location-free campus feed."""

HOST = {"Authorization": "Bearer demo-host"}
PROJECTOR = {"Authorization": "Bearer demo-projector"}
SAFE = {"covered_and_temperature_safe": True, "served_within_two_hours": True, "untouched": True}


def join(client, nickname, allergens=(), diets=(), **extra):
    """Join a visitor over HTTP with a nickname only and return auth headers plus student."""
    response = client.post(
        "/sessions",
        json={"nickname": nickname, "allergens": list(allergens), "diets": list(diets), **extra},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["token"].startswith("demo-session-")
    return {"Authorization": f"Bearer {body['token']}"}, body["student"]


def publish(client, servings):
    """Photo, host review at the rehearsal location, publish; returns the drop ID."""
    created = client.post(
        "/drops", headers=HOST, files={"photo": ("food.png", b"photo", "image/png")}
    ).json()
    edited = client.patch(
        f"/drops/{created['id']}",
        headers=HOST,
        json={
            "servings_final": servings,
            "allergens_final": ["dairy", "gluten"],
            "diet_tags_final": [],
            "building_code": "DEMO-ORIGIN",
            "safety_review": SAFE,
        },
    )
    assert edited.status_code == 200
    published = client.post(f"/drops/{created['id']}/publish", headers=HOST)
    assert published.status_code == 200
    assert published.json()["distribution_mode"] == "campus_feed"
    return created["id"]


def listing(client, headers, drop_id):
    """The caller's own feed tile for one drop."""
    body = client.get("/students/me/feed", headers=headers).json()
    return next(item for item in body["drops"] if item["drop"]["id"] == drop_id)


def test_join_demo_campus_feed_end_to_end(client, backend):
    reset = client.post("/demo/reset", headers=PROJECTOR, json={"scenario": "visitors"})
    assert reset.status_code == 200 and reset.json()["scenario"] == "visitors"

    v1, s1 = join(client, "V1")
    v2, s2 = join(client, "V2")
    v3, s3 = join(client, "V3", allergens=["dairy"])
    v4, s4 = join(client, "V4", area="demo-far-side")
    assert len({student["id"] for student in (s1, s2, s3, s4)}) == 4
    for headers, student in ((v1, s1), (v2, s2), (v3, s3), (v4, s4)):
        me = client.get("/sessions/me", headers=headers).json()
        assert me["id"] == student["id"] and me["area"] is None

    collision = client.post("/sessions", json={"nickname": "v1"})
    assert collision.status_code == 409
    assert collision.json()["detail"]["code"] == "nickname_taken"

    drop_id = publish(client, servings=2)
    assert client.get(f"/drops/{drop_id}/dispatch", headers=v1).status_code == 403
    state = client.get(f"/drops/{drop_id}/dispatch", headers=PROJECTOR).json()
    assert state["distribution_mode"] == "campus_feed" and state["next_wave_at"] is None
    assert state["visitors"] == [] and state["personas"] == [] and state["waves"] == []

    for headers in (v1, v2, v4):
        tile = listing(client, headers, drop_id)
        assert tile["can_reserve"] and tile["unavailable_reason"] is None
        assert tile["claim"] is None
    blocked = listing(client, v3, drop_id)
    assert not blocked["can_reserve"] and blocked["unavailable_reason"] == "allergen_conflict"
    assert client.post(f"/drops/{drop_id}/reserve", headers=v3).json()["detail"] == {
        "code": "allergen_conflict",
        "message": "This food conflicts with your allergens.",
    }
    for headers in (v1, v2, v3, v4):
        assert client.get("/students/me/invites", headers=headers).json() == {"invites": []}

    first = client.post(f"/drops/{drop_id}/reserve", headers=v1).json()
    assert first["status"] == "held" and first["drop_id"] == drop_id
    assert client.post(f"/drops/{drop_id}/reserve", headers=v1).json()["id"] == first["id"]
    assert client.post(f"/claims/{first['id']}/release", headers=v2).status_code == 404
    assert client.post(f"/drops/{drop_id}/reserve", headers=v4).status_code == 200
    full = client.post(f"/drops/{drop_id}/reserve", headers=v2)
    assert full.status_code == 409 and full.json()["detail"]["code"] == "capacity"
    assert listing(client, v2, drop_id)["unavailable_reason"] == "capacity"
    assert listing(client, v1, drop_id)["claim"]["id"] == first["id"]

    status = client.get("/demo/status", headers=PROJECTOR).json()
    assert status["scenario"] == "visitors" and status["visitors"] == 4
    assert status["active_drop_id"] == drop_id

    left = client.delete("/sessions/me", headers=v4)
    assert left.status_code == 200 and left.json() == {"status": "left"}
    revoked = client.get("/students/me/feed", headers=v4)
    assert revoked.status_code == 401
    assert revoked.json()["detail"] == {
        "code": "unauthorized",
        "message": "Session ended. Join again.",
    }
    assert client.post(f"/drops/{drop_id}/reserve", headers=v2).status_code == 200

    reset = client.post("/demo/reset", headers=HOST, json={"scenario": "visitors"})
    assert reset.json()["scenario"] == "visitors"
    for headers in (v1, v2, v3):
        response = client.get("/students/me/feed", headers=headers)
        assert response.status_code == 401
        assert response.json()["detail"]["message"] == "Session ended. Join again."
    assert client.get("/students/me/feed", headers=HOST).status_code == 403
    assert client.get("/students/me/feed", headers=PROJECTOR).status_code == 403
    persona = client.get("/students/me/feed", headers={"Authorization": "Bearer demo-student-A"})
    assert persona.status_code == 200 and persona.json()["drops"] == []
