"""Lock safety exclusions, weighted ordering, and bounded wave sizing."""

import json
from dataclasses import asdict, replace
from datetime import UTC, datetime, timedelta
from math import ceil

import pytest

from services.api.dispatch import CandidateView, DropView, plan_wave
from services.api.dispatch.planner import score

NOW = datetime(2026, 11, 18, tzinfo=UTC)
DROP = DropView(
    "drop", "0", 8, frozenset({"dairy"}), frozenset({"vegetarian"}), NOW + timedelta(hours=1)
)
CANDIDATE = CandidateView("student", "0", presence_valid_until=NOW + timedelta(hours=2))


def distance(origin, cell):
    return abs(int(origin) - int(cell)) if cell != "invalid" else None


@pytest.mark.parametrize(
    ("changes", "reason"),
    [
        ({"allergens": frozenset({"dairy"}), "priority": True}, "allergen_conflict"),
        ({"diets": frozenset({"vegan"})}, "diet_mismatch"),
        ({"cell": None}, "no_presence"),
        ({"cell": "3"}, "out_of_range"),
        ({"cell": "invalid"}, "out_of_range"),
        ({"presence_valid_until": NOW}, "expired_presence"),
        ({"presence_valid_from": NOW + timedelta(seconds=1)}, "expired_presence"),
        ({"already_invited": True}, "already_invited"),
        ({"active_claim_elsewhere": True}, "active_claim"),
        ({"alerts_paused": True}, "alerts_paused"),
        ({"quiet_hours": True}, "alerts_paused"),
    ],
)
def test_all_exclusions(changes, reason):
    plan = plan_wave(DROP, [replace(CANDIDATE, **changes)], 2, NOW, distance)
    assert not plan.invites
    assert plan.excluded == [("student", reason)]


def test_expired_drop_excludes_at_exact_deadline():
    assert plan_wave(replace(DROP, expires_at=NOW), [CANDIDATE], 2, NOW, distance).excluded == [
        ("student", "drop_expired")
    ]


@pytest.mark.parametrize("servings", [0, 1, 2, 8, 100])
def test_formula_and_cap(servings):
    candidates = [replace(CANDIDATE, student_id=str(i)) for i in range(30)]
    plan = plan_wave(replace(DROP, servings_remaining=servings), candidates, 2, NOW, distance)
    assert len(plan.invites) == min(ceil(servings / 0.6), 30)


def test_weighted_rank_and_reproducible_jitter():
    ordinary = replace(CANDIDATE, student_id="ordinary")
    equal_priority = replace(CANDIDATE, student_id="equal", priority=True)
    plan = plan_wave(DROP, [ordinary, equal_priority], 2, NOW, distance)
    assert plan.invites[0][0] == "equal"
    assert abs(score(DROP, equal_priority, 2, 0) - 1.0) < 1e-9
    assert abs(score(DROP, ordinary, 2, 0) - 0.6) < 1e-9
    assert plan_wave(DROP, [equal_priority, ordinary], 2, NOW, distance) == plan
    # Largest single term does not make priority an absolute ordering.
    far = replace(equal_priority, cell="12", claims_last_7d=100, ignored_last_7d=100)
    close = [replace(ordinary, student_id=f"close-{i}") for i in range(5)]
    plan = plan_wave(DROP, [far, *close], 12, NOW, distance)
    assert [sid for sid, _ in plan.invites][:5] == [
        sid
        for sid, _ in sorted(
            [(c.student_id, score(DROP, c, 12, 0)) for c in close], key=lambda row: -row[1]
        )
    ]
    assert plan.invites[-1][0] == "equal"
    output = json.dumps(asdict(plan))
    assert "priority" not in output and "score" not in output
    assert all(reasons == ["nearby", "diet_match", "fair_share"] for _, reasons in plan.invites)


def test_fairness_reliability_and_ring_boundary():
    recent = replace(CANDIDATE, student_id="recent", claims_last_7d=3, ignored_last_7d=2)
    assert score(DROP, CANDIDATE, 2, 0) > score(DROP, recent, 2, 0)
    plan = plan_wave(DROP, [replace(CANDIDATE, cell="2")], 2, NOW, distance)
    assert len(plan.invites) == 1
    assert len(plan_wave(DROP, [CANDIDATE, CANDIDATE], 2, NOW, distance).invites) == 1
