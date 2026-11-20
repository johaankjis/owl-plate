"""Persist private state separately from the frozen public response models."""

from sqlalchemy import JSON, Column, LargeBinary, UniqueConstraint
from sqlmodel import Field, SQLModel


class DemoSettings(SQLModel, table=True):
    """Keep the presenter-selected scenario without altering existing table shapes."""

    id: int = Field(default=1, primary_key=True)
    scenario: str = "seeded"


class Coordinator(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)
    clock_offset: int = 0


class Student(SQLModel, table=True):
    id: str = Field(primary_key=True)
    label: str
    is_simulated: bool = True
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))


class Drop(SQLModel, table=True):
    id: str = Field(primary_key=True)
    host_id: str = Field(index=True)
    status: str = "draft"
    data: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))


class Wave(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("drop_id", "number"),)
    id: str = Field(primary_key=True)
    drop_id: str = Field(foreign_key="drop.id", index=True)
    number: int
    ring_k: int
    planned_at: str
    decisions: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))


class Invite(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("drop_id", "student_id"),)
    id: str = Field(primary_key=True)
    drop_id: str = Field(foreign_key="drop.id", index=True)
    wave_id: str = Field(foreign_key="wave.id")
    student_id: str = Field(foreign_key="student.id", index=True)
    status: str = "sent"
    sent_at: str
    expires_at: str
    notification_sent: bool = False


class Claim(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("invite_id"),)
    id: str = Field(primary_key=True)
    invite_id: str = Field(foreign_key="invite.id")
    drop_id: str = Field(foreign_key="drop.id", index=True)
    student_id: str = Field(foreign_key="student.id", index=True)
    status: str = "held"
    created_at: str
    held_until: str


class FeedNotification(SQLModel, table=True):
    """Durable once-per-student/drop announcement outbox for campus-feed drops.

    The unique pair makes duplicate or concurrent publishes and ticks unable to enqueue
    a second announcement; nothing about the student's location is recorded.
    """

    __table_args__ = (UniqueConstraint("drop_id", "student_id"),)
    id: str = Field(primary_key=True)
    drop_id: str = Field(foreign_key="drop.id", index=True)
    student_id: str = Field(foreign_key="student.id", index=True)
    created_at: str
    sent: bool = False


class VisitorSession(SQLModel, table=True):
    """Track live visitor joins; only the token digest is ever stored.

    ``area`` is an empty string for location-free campus-feed joins; the column keeps its
    original non-null shape so existing local databases need no migration.
    """

    __table_args__ = (UniqueConstraint("token_hash"), UniqueConstraint("nickname_key"))
    sequence: int | None = Field(default=None, primary_key=True)
    student_id: str = Field(foreign_key="student.id", unique=True, index=True)
    token_hash: str = Field(index=True)
    nickname: str
    nickname_key: str
    area: str
    joined_at: str


class PickupAttempt(SQLModel, table=True):
    """One photo-assisted pickup check; structured assessment state only, never the photo.

    ``ordinal`` is an explicit per-claim monotonic order so "latest" never depends on UUID
    sorting or equal clocks; ``(claim_id, request_id)`` makes network retries idempotent.
    """

    __table_args__ = (
        UniqueConstraint("claim_id", "request_id"),
        UniqueConstraint("claim_id", "ordinal"),
    )
    id: str = Field(primary_key=True)
    claim_id: str = Field(foreign_key="claim.id", index=True)
    drop_id: str = Field(foreign_key="drop.id", index=True)
    request_id: str
    ordinal: int
    status: str = "processing"
    match_status: str | None = None
    confidence: float | None = None
    explanation: str = ""
    source: str
    created_at: str
    review_status: str = "not_requested"
    review_requested_at: str | None = None
    reviewed_at: str | None = None
    # "student_consistent" or "host_approval": who completed pickup with this attempt.
    completed_by: str | None = None


class HostPickupNotification(SQLModel, table=True):
    """Durable once-per-claim pickup update for the publishing host only.

    The unique claim makes repeated completions, approvals and ticks unable to enqueue a
    second event. Only the food name and the count captured at the committed pickup are
    kept; nothing identifies the student or claim to the host.
    """

    __table_args__ = (UniqueConstraint("claim_id"),)
    id: str = Field(primary_key=True)
    claim_id: str = Field(foreign_key="claim.id")
    drop_id: str = Field(foreign_key="drop.id", index=True)
    host_id: str = Field(index=True)
    food: str
    available: int
    created_at: str
    sent: bool = False


class PantryReferral(SQLModel, table=True):
    """One simulated pantry referral per drop; never a real request or transfer.

    The unique drop makes suggestions, requests and retries unable to create a second
    referral. Only ``accepted`` allocates stock (``accepted_servings``) and only
    ``handoff_confirmed`` counts as transferred; every other state allocates nothing.
    The deadline is always the drop's original ``expires_at`` and is never stored here.
    """

    __table_args__ = (UniqueConstraint("drop_id"),)
    id: str = Field(primary_key=True)
    drop_id: str = Field(foreign_key="drop.id", index=True)
    status: str = "suggested"
    requested_servings: int = 0
    accepted_servings: int = 0
    transferred_servings: int = 0
    created_at: str
    updated_at: str


class DropPhoto(SQLModel, table=True):
    """The sanitized host listing photo for one drop, kept only until its deadline.

    ``content`` is the metadata-free JPEG re-encoded from the host's upload; raw uploads
    and private pickup photos are never stored. ``expires_at`` is the purge deadline, never
    later than the drop's creation plus 24 hours.
    """

    drop_id: str = Field(primary_key=True, foreign_key="drop.id")
    content: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    created_at: str
    expires_at: str


class DatasetMarker(SQLModel, table=True):
    """Provenance of the current demo app data; present only for the recording dataset.

    It survives restarts so analytics keep labeling seeded rows as simulated, and an
    ordinary demo reset deletes it in the same transaction that clears the rows.
    """

    id: int = Field(default=1, primary_key=True)
    kind: str = "recording"
    seed_version: str
    anchor_time: str
