/**
 * Owl Plate service worker for Firebase Cloud Messaging web push.
 *
 * Privacy (docs/PRIVACY_SAFETY.md): the push carries generic text plus the
 * invite ID only. Lock screens never show food, place or student details;
 * the app loads the student's own invite after the tap.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function readPush(event) {
  try {
    const payload = event.data ? event.data.json() : {};
    return payload.data || payload || {};
  } catch {
    return {};
  }
}

self.addEventListener("push", (event) => {
  const data = readPush(event);
  const inviteId = data.invite_id || null;
  const url = inviteId
    ? `/student?invite=${encodeURIComponent(inviteId)}`
    : "/student";
  event.waitUntil(
    self.registration.showNotification(data.title || "Owl Plate: Food nearby", {
      body: data.body || "You have a new invite. Tap to view it.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: inviteId ? `owl-${inviteId}` : "owl-invite",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification?.data?.url || "/student",
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        try {
          const navigated = await client.navigate(target);
          return (navigated || client).focus();
        } catch {
          // Uncontrolled windows cannot be navigated; open a fresh one instead.
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
