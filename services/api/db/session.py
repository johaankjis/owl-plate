"""Serialize milestone mutations on both SQLite and PostgreSQL."""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, event
from sqlmodel import Session, SQLModel, create_engine, select

from .models import Coordinator


def create_database(url: str) -> Engine:
    """Initialize a durable store with a shared cross-process coordination row."""
    kwargs = (
        {"connect_args": {"check_same_thread": False, "timeout": 30}}
        if url.startswith("sqlite")
        else {}
    )
    engine = create_engine(url, **kwargs)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def configure_sqlite(connection, record) -> None:
            connection.execute("PRAGMA foreign_keys=ON")

    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Startup may race across workers; inserting the singleton is conflict-safe.
        if engine.dialect.name == "sqlite":
            from sqlalchemy.dialects.sqlite import insert
        else:
            from sqlalchemy.dialects.postgresql import insert
        session.execute(insert(Coordinator).values(id=1, clock_offset=0).on_conflict_do_nothing())
        session.commit()
    return engine


@contextmanager
def transaction(engine: Engine) -> Iterator[Session]:
    """Lock before reading capacity so competing claims cannot both consume it."""
    with Session(engine, expire_on_commit=False) as session:
        try:
            if engine.dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            else:
                session.exec(select(Coordinator).where(Coordinator.id == 1).with_for_update()).one()
            yield session
            session.commit()
        except BaseException:
            session.rollback()
            raise
