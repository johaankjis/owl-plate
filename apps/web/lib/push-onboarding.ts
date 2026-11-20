"use client";

import { registerPushToken } from "./api-client";
import {
  acquireFcmPushToken,
  getFcmConfigStatus,
  primeNotificationPermission,
  type NotificationPermissionOutcome,
} from "./fcm";
import { needsHomeScreen, pushFlagKey } from "./push-helpers";

/**
 * True when the Start-browsing tap should prime the native notification
 * prompt: real FCM configured and a browser context where web push can be
 * granted at all. iPhone Safari tabs stay quiet because web push there needs
 * the installed Home Screen app, which the Profile hint keeps explaining.
 */
export function shouldPrimeJoinNotifications(): boolean {
  if (!getFcmConfigStatus().enabled) {
    return false;
  }
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !needsHomeScreen(navigator.userAgent, standalone);
}

/**
 * Finish the Start-browsing notification onboarding once the student session
 * exists. Best effort only: every early return (denied, dismissed,
 * unsupported, registration failure) stays silent so onboarding can never
 * block or break the join flow. The per-session localStorage flag stays the
 * single source of truth that Profile and /student read.
 */
export async function completeJoinPushOnboarding(
  authToken: string,
  primedPermission: Promise<NotificationPermissionOutcome>,
): Promise<void> {
  try {
    if (!getFcmConfigStatus().enabled) {
      return;
    }
    const outcome = await primedPermission;
    if (outcome !== "granted") {
      return;
    }
    const result = await acquireFcmPushToken();
    if (!result.ok || !result.token) {
      return;
    }
    await registerPushToken({ token: result.token }, authToken);
    window.localStorage.setItem(pushFlagKey(authToken, "student"), "on");
  } catch {
    // Onboarding is optional; /student and Profile still work without push.
  }
}

/**
 * The exact priming call the join submit handler makes on its tap: prompt only
 * when `shouldPrimeJoinNotifications()` allows it, and never let a prompt
 * rejection turn into an unhandled rejection.
 */
export function primeJoinNotifications(): Promise<NotificationPermissionOutcome> {
  if (!shouldPrimeJoinNotifications()) {
    return Promise.resolve("unsupported");
  }
  return primeNotificationPermission().catch(() => "dismissed");
}
