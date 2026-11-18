"use client";

import { useCallback, useEffect, useState } from "react";
import { registerPushToken } from "./api-client";
import { getFcmConfigStatus, requestFcmPushToken } from "./fcm";
import { useNotificationMode } from "./vision-mode";
import { needsHomeScreen, pushFlagKey } from "./push-helpers";

export type PushState =
  | { kind: "simulated" } // server in rehearsal mode, or seeded persona
  | { kind: "not_configured"; reason: string }
  | { kind: "needs_home_screen" } // iPhone/iPad Safari tab, not the installed app
  | { kind: "ready" }
  | { kind: "working" }
  | { kind: "on" }
  | { kind: "error"; message: string };

/**
 * Opt-in for real push on this device for the current visitor session.
 * The FCM token is registered with the session's own bearer token, so the
 * server binds it to exactly this student.
 */
export function usePushOptIn(authToken: string | null, isSeeded: boolean) {
  const mode = useNotificationMode();
  const [state, setState] = useState<PushState>({ kind: "simulated" });

  useEffect(() => {
    if (mode !== "fcm" || isSeeded || !authToken) {
      setState({ kind: "simulated" });
      return;
    }
    const config = getFcmConfigStatus();
    if (!config.enabled) {
      setState({ kind: "not_configured", reason: config.reason });
      return;
    }
    if (window.localStorage.getItem(pushFlagKey(authToken)) === "on") {
      setState({ kind: "on" });
      return;
    }
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setState(
      needsHomeScreen(navigator.userAgent, standalone)
        ? { kind: "needs_home_screen" }
        : { kind: "ready" },
    );
  }, [mode, authToken, isSeeded]);

  const enable = useCallback(async () => {
    if (!authToken) return;
    setState({ kind: "working" });
    const result = await requestFcmPushToken();
    if (!result.ok || !result.token) {
      setState({ kind: "error", message: result.message });
      return;
    }
    try {
      await registerPushToken({ token: result.token }, authToken);
      window.localStorage.setItem(pushFlagKey(authToken), "on");
      setState({ kind: "on" });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Could not save notifications.",
      });
    }
  }, [authToken]);

  return { state, enable, realPush: state.kind === "on" };
}
