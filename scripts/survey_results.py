"""Count/export actual anonymous submissions locally, never through a public API."""

import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlmodel import Session, select

from services.api.db.session import create_database
from services.api.survey.service import SurveyResponse

ROOT = Path(__file__).resolve().parents[1]


def results(destination: Path | None = None) -> None:
    """Keep free text private while giving the operator an actual response count."""
    load_dotenv(ROOT / ".env")
    if destination and not destination.resolve().is_relative_to(ROOT / "data/survey"):
        raise ValueError("Raw survey exports must stay under gitignored data/survey/")
    engine = create_database(os.getenv("DATABASE_URL", "sqlite:///./owl_plate.db"))
    try:
        with Session(engine) as session:
            rows = session.exec(select(SurveyResponse)).all()
            if destination:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(
                    json.dumps(
                        {"n": len(rows), "responses": [row.model_dump() for row in rows]}, indent=2
                    )
                    + "\n"
                )
            print(f"Actual survey submissions n={len(rows)} (not verified unique students).")
    finally:
        engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export", type=Path)
    args = parser.parse_args()
    results(args.export)
