"""Persist approved survey answers without adding identity or public read access."""

from datetime import UTC, datetime

from sqlalchemy import JSON, Column
from sqlalchemy.engine import Engine
from sqlmodel import Field, SQLModel, select

from services.api.db.session import transaction
from services.api.schemas.survey import SurveyReceipt, SurveyRequest


class SurveyResponse(SQLModel, table=True):
    """Keep research rows independent of synthetic students and invitation state."""

    id: str = Field(primary_key=True)
    created_at: str
    answers: dict = Field(sa_column=Column(JSON, nullable=False))


class SurveyService:
    """Require an explicit collection gate and deduplicate anonymous browser retries."""

    def __init__(self, engine: Engine, accepting: bool = False) -> None:
        self.engine = engine
        self.accepting = accepting

    def submit(self, request: SurveyRequest) -> SurveyReceipt:
        """Preview honestly without writing; approved collection persists once per UUID."""
        if request.preview or not self.accepting:
            return SurveyReceipt(accepted=False, preview=True)
        with transaction(self.engine) as session:
            existing = session.get(SurveyResponse, str(request.submission_id))
            if existing is None:
                session.add(
                    SurveyResponse(
                        id=str(request.submission_id),
                        created_at=datetime.now(UTC).isoformat(),
                        answers=request.answers.model_dump(mode="json"),
                    )
                )
        return SurveyReceipt(accepted=True, preview=False)

    def count(self) -> int:
        """Keep response totals available only to a local operator, never a public endpoint."""
        with transaction(self.engine) as session:
            return len(session.exec(select(SurveyResponse.id)).all())
