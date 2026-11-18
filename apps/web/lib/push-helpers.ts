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
