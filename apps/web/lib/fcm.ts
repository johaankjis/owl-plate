/**
 * Opt-in Firebase Cloud Messaging (FCM) client helper.
 *
 * Rules:
 * - Real FCM is disabled if NEXT_PUBLIC_FIREBASE_CONFIG or NEXT_PUBLIC_FIREBASE_VAPID_KEY
 *   is not configured.
 * - Never makes false receipt claims when FCM config is absent or running in simulated log mode.
 * - Registers /firebase-messaging-sw.js only after explicit user tap.
 */

import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

export interface FcmConfigStatus {
  enabled: boolean;
  reason: string;
}

export function getFcmConfigStatus(): FcmConfigStatus {
  if (process.env.NEXT_PUBLIC_UI_FIXTURE_MODE === "true") {
    return {
      enabled: false,
      reason: "Push is disabled in standalone UI fixture mode.",
    };
  }
  const rawConfig = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

  if (!rawConfig || !rawConfig.trim() || !vapidKey || !vapidKey.trim()) {
    return {
      enabled: false,
      reason:
        "Real FCM disabled: NEXT_PUBLIC_FIREBASE_CONFIG and NEXT_PUBLIC_FIREBASE_VAPID_KEY are not configured. Alerts use simulated demo log adapter only (no physical push delivered).",
    };
  }

  try {
    const parsed = JSON.parse(rawConfig) as Record<string, unknown>;
    if (
      !parsed.apiKey ||
      !parsed.projectId ||
      !parsed.messagingSenderId ||
      !parsed.appId
    ) {
      return {
        enabled: false,
        reason:
          "Real FCM disabled: NEXT_PUBLIC_FIREBASE_CONFIG is missing required Firebase project fields.",
      };
    }
    return {
      enabled: true,
      reason: "Firebase Cloud Messaging configured.",
    };
  } catch {
    return {
      enabled: false,
      reason:
        "Real FCM disabled: NEXT_PUBLIC_FIREBASE_CONFIG is not valid JSON.",
    };
  }
}

export async function requestFcmPushToken(): Promise<{
  ok: boolean;
  token: string | null;
  message: string;
}> {
  const status = getFcmConfigStatus();
  if (!status.enabled) {
    return {
      ok: false,
      token: null,
      message: status.reason,
    };
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return {
      ok: false,
      token: null,
      message: "Browser Notification API is not available in this environment.",
    };
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) {
    return {
      ok: false,
      token: null,
      message:
        "Firebase Cloud Messaging web push is not supported in this browser context (requires HTTPS or localhost and Service Worker support).",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      token: null,
      message: `Notification permission was not granted (${permission}).`,
    };
  }

  try {
    const rawConfig = process.env.NEXT_PUBLIC_FIREBASE_CONFIG!;
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!;
    const firebaseConfig = JSON.parse(rawConfig) as Record<string, string>;

    const app =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
    const messaging = getMessaging(app);
    const swRegistration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      return {
        ok: false,
        token: null,
        message: "FCM did not return a registration token.",
      };
    }

    return {
      ok: true,
      token,
      message: "FCM web push token acquired and ready to register.",
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      token: null,
      message: `Failed to acquire FCM token: ${errMsg}`,
    };
  }
}
