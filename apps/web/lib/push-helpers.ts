/** Pure push opt-in helpers, kept import-free so they are unit-testable. */

const PUSH_FLAG_PREFIX = "owl-plate.push.";

export type PushRole = "student" | "host";

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

/**
 * Per-role and per-session flag so a fresh join never inherits an older session's opt-in
 * and student/host flags never collide on the same browser.
 */
export function pushFlagKey(
  sessionKey: string,
  role: PushRole = "student",
): string {
  const suffix = sessionKey.slice(-16);
  if (role === "host") {
    return `${PUSH_FLAG_PREFIX}host.${suffix}`;
  }
  return `${PUSH_FLAG_PREFIX}${suffix}`;
}

export interface PushPayloadData {
  notification_mode?: string | null;
  drop_id?: string | null;
  invite_id?: string | null;
  notification_id?: string | null;
  tag?: string | null;
  title?: string | null;
  body?: string | null;
  url?: string | null;
}

export interface PushNotificationTarget {
  mode: "campus_feed" | "seeded_waves" | "host_pickup";
  title: string;
  body: string;
  tag: string;
  url: string;
}

const SAFE_HOST_BODY_MAX_LENGTH = 180;

/**
 * Scrubs any accidental student/claim identifiers or credentials from host notification body text.
 * Host explicitly opts into food name + aggregate count ("A serving of roasted chicken was marked collected. 4 servings available."),
 * but student nicknames, emails, claim IDs, or tokens are never displayed.
 */
function sanitizeHostNotificationBody(
  rawBody: string | null | undefined,
): string {
  const fallback =
    "A serving was marked collected. Tap to view updated pickup counts.";
  if (typeof rawBody !== "string") return fallback;
  const trimmed = rawBody.trim();
  if (!trimmed) return fallback;
  // Reject if body contains suspicious student/claim/session/token/email patterns
  if (
    /demo-session-|demo-student-|Bearer\s+|@|\bstudent\b|\bnickname\b|\bclaim_id\b|\bclaim-[a-z0-9-]+|\btoken\b/i.test(
      trimmed,
    )
  ) {
    return fallback;
  }
  return trimmed.slice(0, SAFE_HOST_BODY_MAX_LENGTH);
}

/**
 * Resolves the notification and deep-link target for an FCM push payload.
 *
 * Rules (docs/CAMPUS_FEED_CONTRACT.md, docs/PICKUP_CONFIRMATION_CONTRACT.md & docs/PRIVACY_SAFETY.md):
 * - When `notification_mode === "host_pickup"`, routes to `/host?drop=<drop_id>` (or `/host`),
 *   uses title `"Owl Plate: Pickup update"`, allows generic food/count body text without student data,
 *   and enforces a stable tag bounded to 32 characters.
 * - Prefers `drop_id` when `notification_mode === "campus_feed"` (or when only `drop_id` is present),
 *   routing to `/student?drop=<drop_id>` with stable tag `owl-drop-<drop_id>`.
 * - Preserves legacy invite fallback (`/student?invite=<invite_id>`, tag `owl-<invite_id>`)
 *   for `notification_mode === "seeded_waves"` or legacy payloads without `notification_mode`.
 * - Never includes credentials, student identities, dietary prefs, or priority tiers.
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
      mode: "host_pickup",
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
