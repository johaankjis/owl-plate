"""Keep anonymous research responses separate from student and demo identities."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SurveyAnswers(BaseModel):
    """Bound voluntary answers without collecting accounts or device information."""

    model_config = ConfigDict(extra="forbid")
    campus: Literal["Kennesaw", "Marietta", "Both", "Prefer not to say"] | None = None
    skipped_meals: (
        Literal["Never", "Once or twice", "Weekly", "More than weekly", "Prefer not to say"] | None
    ) = None
    seen_waste: Literal["Yes", "No", "Unsure"] | None = None
    heard_too_late: Literal["Yes", "No", "Unsure"] | None = None
    heard_care: Literal["Yes", "No", "Unsure"] | None = None
    wants_alerts: Literal["Yes", "Maybe", "No"] | None = None
    host_leftovers: (
        Literal["Taken home", "Thrown away", "Posted in a group", "Other", "I do not host"] | None
    ) = None
    feedback: str = Field(default="", max_length=500)


class SurveyRequest(BaseModel):
    """Make retries safe without tying a response to a real student identity."""

    model_config = ConfigDict(extra="forbid")
    submission_id: UUID
    consent: Literal[True]
    preview: bool = False
    answers: SurveyAnswers


class SurveyReceipt(BaseModel):
    """Acknowledge completion without revealing answers or aggregate response counts."""

    accepted: bool
    preview: bool


class SurveyStatus(BaseModel):
    """Tell a standalone form whether collection has actually been opened."""

    accepting: bool
