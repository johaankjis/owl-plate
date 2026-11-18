/**
 * Owl Plate Service Worker for Firebase Cloud Messaging web push.
 *
 * Privacy rule (docs/ARCHITECTURE.md & docs/PRIVACY_SAFETY.md):
 * Notification payload contains the drop ID only; lock screens show minimal info,
 * and the app fetches details after opening.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let dropId = null;
  if (event.data) {
    try {
      const payload = event.data.json();
      dropId = payload?.data?.drop_id || payload?.drop_id || null;
    } catch {
      // minimal fallback
    }
  }

  const title = "Owl Plate: Free food nearby";
  const options = {
    body: "A nearby food spot is available. Tap to view details in Owl Plate.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: {
      url: dropId ? `/student?drop_id=${encodeURIComponent(dropId)}` : "/student",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/student";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
