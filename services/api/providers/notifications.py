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

    def notify_host(self, notification_id: str, host_id: str, drop_id: str, body: str) -> None:
        """Record a simulated host pickup update without its text or any identity."""
        logger.info("Simulated host pickup update queued; physical device receipt unverified")


class HostPushRegistry(Protocol):
    """Encrypted host device registrations, separate from student recipient policy."""

    def register(self, owner_id: str, token: str) -> None:
        """Bind a token to the authenticated host only."""
        ...

    def has(self, owner_id: str) -> bool:
        """Report the backend registration so static client flags cannot outlive a reset."""
        ...

    def forget(self, owner_id: str) -> None:
        """Honor an opt-out before any deferred send."""
        ...
