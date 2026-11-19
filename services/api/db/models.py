"""Persist private state separately from the frozen public response models."""

from sqlalchemy import JSON, Column, UniqueConstraint
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
