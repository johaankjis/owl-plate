"""Uniform notification boundaries; logs contain aggregate delivery evidence only."""

import logging
from typing import Protocol

logger = logging.getLogger(__name__)


class NotificationProvider(Protocol):
    """Hide transport and contact details from dispatch decisions."""

    def notify(self, invite_id: str, student_id: str, drop_id: str) -> None:
        """Deliver one uniform alert using private recipient resolution."""
        ...


class SimulatedNotifications:
    """Record a simulated send without logging recipient identity or private tokens."""

    def notify(self, invite_id: str, student_id: str, drop_id: str) -> None:
        """Make offline delivery visible while never implying physical phone receipt."""
        logger.info("Simulated notification queued; physical device receipt unverified")
