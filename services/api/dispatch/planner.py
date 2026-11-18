"""Make reproducible, private matching decisions without infrastructure dependencies."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from math import ceil

from .config import (
    DISTANCE_WEIGHT,
    FAIRNESS_WEIGHT,
    PRIORITY_WEIGHT,
    RELIABILITY_WEIGHT,
    SHOW_RATE,
)


@dataclass(frozen=True)
class DropView:
    drop_id: str
    origin_cell: str
    servings_remaining: int
    allergens: frozenset[str]
    diet_tags: frozenset[str]
    expires_at: datetime


@dataclass(frozen=True)
class CandidateView:
    student_id: str
    cell: str | None
    allergens: frozenset[str] = frozenset()
    diets: frozenset[str] = frozenset()
    priority: bool = False
    claims_last_7d: int = 0
    invites_last_7d: int = 0
    ignored_last_7d: int = 0
    already_invited: bool = False
    active_claim_elsewhere: bool = False
    alerts_paused: bool = False
    quiet_hours: bool = False
    presence_valid_from: datetime | None = None
    presence_valid_until: datetime | None = None


@dataclass(frozen=True)
class WavePlan:
    ring_k: int
    invites: list[tuple[str, list[str]]]
    excluded: list[tuple[str, str]]


def exclusion(
    drop: DropView,
    candidate: CandidateView,
    ring_k: int,
    now: datetime,
    distance: Callable[[str, str], int | None],
) -> str | None:
    """Apply safety and consent gates before a score can affect selection."""
    if now >= drop.expires_at:
        return "drop_expired"
    if candidate.allergens & drop.allergens:
        return "allergen_conflict"
    if not candidate.diets <= drop.diet_tags:
        return "diet_mismatch"
    if candidate.already_invited:
        return "already_invited"
    if candidate.active_claim_elsewhere:
        return "active_claim"
    if candidate.alerts_paused or candidate.quiet_hours:
        return "alerts_paused"
    if candidate.cell is None:
        return "no_presence"
    if (candidate.presence_valid_until is not None and now >= candidate.presence_valid_until) or (
        candidate.presence_valid_from is not None and now < candidate.presence_valid_from
    ):
        return "expired_presence"
    steps = distance(drop.origin_cell, candidate.cell)
    if steps is None or steps < 0 or steps > ring_k:
        return "out_of_range"
    return None


def score(drop: DropView, candidate: CandidateView, ring_k: int, steps: int) -> float:
    """Balance need with proximity and fair access using stable tie breaking."""
    jitter = (
        int.from_bytes(
            sha256(f"{drop.drop_id}:{candidate.student_id}".encode()).digest()[:8], "big"
        )
        / 2**64
        * 1e-9
    )
    return (
        PRIORITY_WEIGHT * candidate.priority
        + DISTANCE_WEIGHT * (1 - steps / (ring_k + 1))
        + FAIRNESS_WEIGHT / (1 + max(0, candidate.claims_last_7d))
        + RELIABILITY_WEIGHT / (1 + max(0, candidate.ignored_last_7d))
        + jitter
    )


def plan_wave(
    drop: DropView,
    candidates: Sequence[CandidateView],
    ring_k: int,
    now: datetime,
    distance: Callable[[str, str], int | None],
) -> WavePlan:
    """Invite only enough eligible students; emit no private ranking information."""
    eligible: list[tuple[float, str]] = []
    excluded: list[tuple[str, str]] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate.student_id in seen:
            continue
        seen.add(candidate.student_id)
        reason = exclusion(drop, candidate, ring_k, now, distance)
        if reason:
            excluded.append((candidate.student_id, reason))
        else:
            steps = distance(drop.origin_cell, candidate.cell or "")
            assert steps is not None
            eligible.append((score(drop, candidate, ring_k, steps), candidate.student_id))
    eligible.sort(key=lambda row: (-row[0], row[1]))
    count = max(0, ceil(drop.servings_remaining / SHOW_RATE))
    return WavePlan(
        ring_k,
        [(sid, ["nearby", "diet_match", "fair_share"]) for _, sid in eligible[:count]],
        sorted(excluded),
    )
