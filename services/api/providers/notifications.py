"""Uniform notification boundaries; logs contain aggregate delivery evidence only."""

import logging
from typing import Literal, Protocol

NotificationMode = Literal["campus_feed", "seeded_waves"]

logger = logging.getLogger(__name__)


class NotificationProvider(Protocol):
    """Hide transport and contact details from dispatch decisions."""

    def notify(
        self,
        invite_id: str,
        student_id: str,
        drop_id: str,
        *,
        mode: NotificationMode = "seeded_waves",
    ) -> None:
        """Deliver one uniform alert using private recipient resolution.

        Seeded waves pass a legacy invite ID; the campus feed passes its outbox entry ID
        with ``mode="campus_feed"`` and the alert must link to the drop, not an invite.
        """
        ...


class SimulatedNotifications:
    """Record a simulated send without logging recipient identity or private tokens."""

    def notify(
        self,
        invite_id: str,
        student_id: str,
        drop_id: str,
        *,
        mode: NotificationMode = "seeded_waves",
    ) -> None:
        """Make offline delivery visible while never implying physical phone receipt."""
        logger.info("Simulated notification queued; physical device receipt unverified")
