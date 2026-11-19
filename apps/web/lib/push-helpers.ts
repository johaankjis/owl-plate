/** Pure push opt-in helpers, kept import-free so they are unit-testable. */

const PUSH_FLAG_PREFIX = "owl-plate.push.";

/** iOS only allows web push from the installed Home Screen app. */
export function needsHomeScreen(
  userAgent: string,
  standalone: boolean,
): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent));
  return ios && !standalone;
}

/** Per-session flag so a fresh join never inherits an older session's opt-in. */
export function pushFlagKey(sessionKey: string): string {
  return `${PUSH_FLAG_PREFIX}${sessionKey.slice(-16)}`;
}

export interface PushPayloadData {
  notification_mode?: string | null;
  drop_id?: string | null;
  invite_id?: string | null;
  tag?: string | null;
  title?: string | null;
  body?: string | null;
  url?: string | null;
}

export interface PushNotificationTarget {
  mode: "campus_feed" | "seeded_waves";
  title: string;
  body: string;
  tag: string;
  url: string;
}

/**
 * Resolves the minimal lock-screen notification and deep-link target for an FCM push payload.
 *
 * Rules (docs/CAMPUS_FEED_CONTRACT.md & docs/PRIVACY_SAFETY.md):
 * - Prefers `drop_id` when `notification_mode === "campus_feed"` (or when only `drop_id` is present),
 *   routing to `/student?drop=<drop_id>` with stable tag `owl-drop-<drop_id>`.
 * - Preserves legacy invite fallback (`/student?invite=<invite_id>`, tag `owl-<invite_id>`)
 *   for `notification_mode === "seeded_waves"` or legacy payloads without `notification_mode`.
 * - Never includes credentials, food names, building details, dietary prefs, or priority tiers.
 */
export function resolvePushNotificationTarget(
  data: PushPayloadData | null | undefined,
): PushNotificationTarget {
  const safe = data ?? {};
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

  const isCampusFeed =
    rawMode === "campus_feed" ||
    (rawMode !== "seeded_waves" && dropId !== null && inviteId === null);

  if (isCampusFeed && dropId) {
    return {
      mode: "campus_feed",
      title: "Owl Plate: Free food on campus",
      body: "New food was just posted. Tap to view it.",
      tag: `owl-drop-${dropId}`,
      url: `/student?drop=${encodeURIComponent(dropId)}`,
    };
  }

  if (inviteId) {
    return {
      mode: "seeded_waves",
      title: "Owl Plate: Food nearby",
      body: "You have a new invite. Tap to view it.",
      tag: `owl-${inviteId}`,
      url: `/student?invite=${encodeURIComponent(inviteId)}`,
    };
  }

  if (dropId) {
    return {
      mode: "campus_feed",
      title: "Owl Plate: Free food on campus",
      body: "New food was just posted. Tap to view it.",
      tag: `owl-drop-${dropId}`,
      url: `/student?drop=${encodeURIComponent(dropId)}`,
    };
  }

  return {
    mode: isCampusFeed ? "campus_feed" : "seeded_waves",
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
