"""Keep sanitized host listing photos briefly, behind one small purge-first boundary.

Only the metadata-free JPEG re-encoded from a host's ``POST /drops`` upload is stored.
Draft photos live at most two hours; publishing moves the deadline to the drop's own
expiry, and no photo ever outlives its drop's creation by more than 24 hours. Callers
purge before every read so expired food never reappears.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlmodel import Session, select

from services.api.db.models import Drop, DropPhoto

MAX_RETENTION = timedelta(hours=24)
DRAFT_RETENTION = timedelta(hours=2)
PHOTO_PATH = "/drops/{drop_id}/photo"


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(UTC)


def draft_deadline(created_at: datetime) -> datetime:
    """An unpublished draft keeps its photo for two hours, well inside the 24 hour cap."""
    return min(created_at + MAX_RETENTION, created_at + DRAFT_RETENTION)


def published_deadline(created_at: datetime, expires_at: datetime) -> datetime:
    """A published photo lives until the food expires, never past creation plus 24 hours."""
    return min(created_at + MAX_RETENTION, expires_at)


def store_photo(session: Session, drop_id: str, content: bytes, created_at: datetime) -> None:
    """Persist already-sanitized bytes for a new draft; empty bytes store nothing."""
    if not content:
        return
    session.add(
        DropPhoto(
            drop_id=drop_id,
            content=content,
            created_at=created_at.isoformat(),
            expires_at=draft_deadline(created_at).isoformat(),
        )
    )
    session.flush()


def publish_photo(session: Session, drop_id: str, expires_at: datetime) -> None:
    """Move a still-present draft photo to the published deadline."""
    photo = session.get(DropPhoto, drop_id)
    if photo is None:
        return
    photo.expires_at = published_deadline(_at(photo.created_at), expires_at).isoformat()
    session.add(photo)
    session.flush()


def purge_expired_photos(session: Session, now: datetime) -> None:
    """Delete photos past their deadline or whose drop has expired; history stays."""
    rows = session.exec(
        select(DropPhoto.drop_id, DropPhoto.expires_at, Drop.status).join(
            Drop, Drop.id == DropPhoto.drop_id
        )
    ).all()
    stale = [
        drop_id
        for drop_id, expires_at, status in rows
        if status == "expired" or now >= _at(expires_at)
    ]
    if stale:
        session.execute(delete(DropPhoto).where(DropPhoto.drop_id.in_(stale)))
        session.flush()


def purge_all_photos(session: Session) -> None:
    """Remove every stored photo, used by demo reset before drops are deleted."""
    session.execute(delete(DropPhoto))


def has_stored_photo(session: Session, drop_id: str) -> bool:
    """Whether a drop still has a stored photo, without loading any bytes."""
    return (
        session.exec(select(DropPhoto.drop_id).where(DropPhoto.drop_id == drop_id)).first()
        is not None
    )


def photo_bytes(session: Session, drop_id: str, now: datetime) -> bytes | None:
    """The stored JPEG only while it is inside its deadline."""
    photo = session.get(DropPhoto, drop_id)
    if photo is None or now >= _at(photo.expires_at):
        return None
    return photo.content


def photo_path(drop_id: str) -> str:
    """Relative API path only; never a data URL, token or embedded bytes."""
    return PHOTO_PATH.format(drop_id=drop_id)
