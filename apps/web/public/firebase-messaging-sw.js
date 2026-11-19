/**
 * Owl Plate service worker for Firebase Cloud Messaging web push.
 *
 * Privacy (docs/PRIVACY_SAFETY.md, docs/CAMPUS_FEED_CONTRACT.md & docs/PICKUP_CONFIRMATION_CONTRACT.md):
 * - When `notification_mode === "host_pickup"`, routes to `/host?drop=<drop_id>` (or `/host`),
 *   uses title `"Owl Plate: Pickup update"`, allows generic food/count body text without student data,
 *   and enforces a stable tag bounded to 32 characters.
 * - For student alerts, the push carries generic lock-screen text plus `notification_mode`, `drop_id`
 *   (or legacy `invite_id`) only. Never carries credentials, food, building, diet, or tier data.
 * - When `notification_mode === "campus_feed"` (or only `drop_id` is provided),
 *   prefers `drop_id`, routes to `/student?drop=<drop_id>`, and uses stable tag `owl-drop-<drop_id>`.
 * - Legacy `seeded_waves` or payloads without `notification_mode` fall back to `invite_id`
 *   (`/student?invite=<invite_id>`, tag `owl-<invite_id>`).
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

function sanitizeHostNotificationBody(rawBody) {
  const fallback =
    "A serving was marked collected. Tap to view updated pickup counts.";
  if (typeof rawBody !== "string") return fallback;
  const trimmed = rawBody.trim();
  if (!trimmed) return fallback;
  if (
    /demo-session-|demo-student-|Bearer\s+|@|\bstudent\b|\bnickname\b|\bclaim_id\b|\bclaim-[a-z0-9-]+|\btoken\b/i.test(
      trimmed,
    )
  ) {
    return fallback;
  }
  return trimmed.slice(0, 180);
}

function resolveNotificationTarget(data) {
  const safe = data || {};
  const rawMode =
    typeof safe.notification_mode === "string"
      ? safe.notification_mode.trim()
      : "";
  const dropId =
    typeof safe.drop_id === "string" && safe.drop_id.trim().length > 0
      ? safe.drop_id.trim()
      : null;
  const inviteId =
    typeof safe.invite_id === "string" && safe.invite_id.trim().length > 0
      ? safe.invite_id.trim()
      : null;
  const notificationId =
    typeof safe.notification_id === "string" &&
    safe.notification_id.trim().length > 0
      ? safe.notification_id.trim()
      : null;
  const rawTag =
    typeof safe.tag === "string" && safe.tag.trim().length > 0
      ? safe.tag.trim()
      : null;

  if (rawMode === "host_pickup") {
    const rawIdForTag = notificationId || dropId || "update";
    const cleanSuffix = rawIdForTag.replace(/[^a-zA-Z0-9-]/g, "").slice(-24);
    const derivedTag = (rawTag || `owl-hp-${cleanSuffix}`).slice(0, 32);
    return {
      title: "Owl Plate: Pickup update",
      body: sanitizeHostNotificationBody(safe.body),
      tag: derivedTag,
      url: dropId ? `/host?drop=${encodeURIComponent(dropId)}` : "/host",
    };
  }

  const isCampusFeed =
    rawMode === "campus_feed" ||
    (rawMode !== "seeded_waves" && dropId !== null && inviteId === null);

  if (isCampusFeed && dropId) {
    return {
      title: "Owl Plate: Free food on campus",
      body: "New food was just posted. Tap to view it.",
      tag: `owl-drop-${dropId}`,
      url: `/student?drop=${encodeURIComponent(dropId)}`,
    };
  }

  if (inviteId) {
    return {
      title: "Owl Plate: Food nearby",
      body: "You have a new invite. Tap to view it.",
      tag: `owl-${inviteId}`,
      url: `/student?invite=${encodeURIComponent(inviteId)}`,
    };
  }

  if (dropId) {
    return {
      title: "Owl Plate: Free food on campus",
      body: "New food was just posted. Tap to view it.",
      tag: `owl-drop-${dropId}`,
      url: `/student?drop=${encodeURIComponent(dropId)}`,
    };
  }

  return {
    title: isCampusFeed
      ? "Owl Plate: Free food on campus"
      : "Owl Plate: Food nearby",
    body: isCampusFeed
      ? "New food was just posted. Tap to view it."
      : "You have a new invite. Tap to view it.",
    tag: isCampusFeed ? "owl-drop" : "owl-invite",
    url: "/student",
  };
}

self.addEventListener("push", (event) => {
  const data = readPush(event);
  const target = resolveNotificationTarget(data);
  event.waitUntil(
    self.registration.showNotification(target.title, {
      body: target.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: target.tag,
      data: { url: target.url },
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
