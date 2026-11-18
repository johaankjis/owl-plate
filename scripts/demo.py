"""Prove the deterministic demo using the composed application's HTTP entrypoints."""

import argparse
import io
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from services.api.main import create_app


def headers(role: str) -> dict[str, str]:
    """Keep explicit synthetic credentials visible in the reproducible rehearsal script."""
    return {"Authorization": f"Bearer demo-{role}"}


def checked(response, expected: int = 200) -> dict:
    """Fail immediately on route errors instead of reporting a partial demo as success."""
    assert response.status_code == expected, (response.status_code, response.text)
    return response.json()


def verify(database_url: str) -> None:
    """Exercise upload, review, first wave, capacity, expiry, widening and reset."""
    with TestClient(create_app(database_url)) as client:
        reset = checked(client.post("/demo/reset", headers=headers("host")))
        assert reset["students"] == 30
        pixels = io.BytesIO()
        Image.new("RGB", (40, 40), "orange").save(pixels, "PNG")
        response = client.post(
            "/drops",
            headers=headers("host"),
            files={"photo": ("synthetic.png", pixels.getvalue(), "image/png")},
        )
        assert response.status_code in {200, 201}, response.text
        drop = response.json()
        assert drop["vision_source"] == "fixture"
        drop_id = drop["id"]
        review = {
            "servings_final": 2,
            "allergens_final": ["dairy", "gluten"],
            "diet_tags_final": [],
            "building_code": "DEMO-ORIGIN",
            "room": "Synthetic rehearsal room",
            "expires_in_minutes": 45,
            "safety_review": {
                "covered_and_temperature_safe": True,
                "served_within_two_hours": True,
                "untouched": True,
            },
        }
        checked(client.patch(f"/drops/{drop_id}", headers=headers("host"), json=review))
        published = checked(client.post(f"/drops/{drop_id}/publish", headers=headers("host")))
        assert published["counts"] == {"total": 2, "available": 2, "held": 0, "picked_up": 0}
        checked(client.post(f"/drops/{drop_id}/publish", headers=headers("host")))
        snapshot = checked(client.get(f"/drops/{drop_id}/dispatch", headers=headers("projector")))
        assert snapshot["ring_k"] == 2 and len(snapshot["waves"]) == 1
        invites = {}
        for label in "ABCDE":
            invites[label] = checked(
                client.get("/students/me/invites", headers=headers(f"student-{label}"))
            )["invites"]
        assert len(invites["A"]) == len(invites["C"]) == 1
        assert not invites["B"] and not invites["D"] and not invites["E"]
        invite_id = invites["A"][0]["id"]
        held = checked(client.post(f"/invites/{invite_id}/claim", headers=headers("student-A")))
        repeated = checked(client.post(f"/invites/{invite_id}/claim", headers=headers("student-A")))
        assert held["id"] == repeated["id"]
        checked(client.post("/demo/tick", headers=headers("host"), json={"advance_seconds": 61}))
        second = checked(client.get(f"/drops/{drop_id}/dispatch", headers=headers("projector")))
        assert second["ring_k"] == 4
        assert second["counts"] == {"total": 2, "available": 1, "held": 1, "picked_up": 0}
        later = checked(client.get("/students/me/invites", headers=headers("student-D")))["invites"]
        assert len(later) == 1
        assert (
            len(
                checked(client.get("/students/me/invites", headers=headers("student-A")))["invites"]
            )
            == 1
        )
        assert "priority" not in str(second).lower() and "care" not in str(second).lower()
        checked(client.post("/demo/reset", headers=headers("host")))
        assert not checked(client.get("/students/me/invites", headers=headers("student-A")))[
            "invites"
        ]
        print(
            "PASS: 30 synthetic students; photo/review/publish; A+C wave 1; B/E excluded; A idempotent hold; C expires; D wave 2; private snapshot; clean reset."
        )
        print(
            "Evidence: synthetic pixels, cached fixture vision, simulated notifications; physical push and measured accuracy NOT verified."
        )


def main() -> None:
    """Separate persistent rehearsal reset from isolated verification."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.reset:
        with TestClient(create_app()) as client:
            result = checked(client.post("/demo/reset", headers=headers("host")))
            print(
                f"Reset complete: {result['students']} synthetic students. Start web/API with make dev."
            )
    else:
        with tempfile.TemporaryDirectory() as folder:
            verify(f"sqlite:///{Path(folder) / 'demo.db'}")


if __name__ == "__main__":
    main()
