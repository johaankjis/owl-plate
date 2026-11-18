"""Expose anonymous submission only; responses have no public listing/export route."""

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import SQLAlchemyError

from services.api.schemas.survey import SurveyReceipt, SurveyRequest, SurveyStatus
from services.api.survey.service import SurveyService


def build_survey_router(service: SurveyService) -> APIRouter:
    """Keep survey collection separate from demo credentials and host/student flows."""
    router = APIRouter(prefix="/survey", tags=["survey"])

    @router.get("/status", response_model=SurveyStatus)
    def status() -> SurveyStatus:
        """Show the collection gate without publishing actual response counts."""
        return SurveyStatus(accepting=service.accepting)

    @router.post("/responses", response_model=SurveyReceipt)
    def submit(request: SurveyRequest) -> SurveyReceipt:
        """Pass validated voluntary answers to the isolated research service."""
        try:
            return service.submit(request)
        except SQLAlchemyError:
            raise HTTPException(503, "Response was not saved. Please try again.") from None

    return router
