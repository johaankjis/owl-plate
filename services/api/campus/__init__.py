"""Verified campus buildings: the only source of real drop and visitor locations."""

from services.api.campus.registry import (
    DATASET_PATH,
    CampusDatasetError,
    CampusRegistry,
    load_registry,
    parse_registry,
)

__all__ = [
    "DATASET_PATH",
    "CampusDatasetError",
    "CampusRegistry",
    "load_registry",
    "parse_registry",
]
