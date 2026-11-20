"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteHostPushToken,
  getHostPushTokenStatus,
  registerHostPushToken,
  registerPushToken,
} from "./api-client";
import { getFcmConfigStatus, requestFcmPushToken } from "./fcm";
import { useNotificationMode } from "./vision-mode";
import { needsHomeScreen, pushFlagKey, type PushRole } from "./push-helpers";

export type PushState =
  | { kind: "simulated" } // server in rehearsal mode, or seeded persona
  | { kind: "not_configured"; reason: string }
  | { kind: "needs_home_screen" } // iPhone/iPad Safari tab, not the installed app
  | { kind: "ready" }
  | { kind: "working" }
  | { kind: "on" }
  | { kind: "error"; message: string };

export interface UsePushOptInOptions {
  role?: PushRole;
  isSeeded?: boolean;
}

function resolveBrowserReadyOrHomeScreen(): PushState {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return needsHomeScreen(navigator.userAgent, standalone)
    ? { kind: "needs_home_screen" }
    : { kind: "ready" };
}

/**
 * Reusable opt-in for real push on this device for either a visitor student session
 * or an authenticated host role (`role = "student" | "host"`).
 *
 * - Student role (`POST /students/me/push-token`): preserves per-session opt-in.
 * - Host role (`POST/GET/DELETE /hosts/me/push-token`): checks `GET /hosts/me/push-token`
 *   on mount so a static `demo-host` localStorage flag never survives a backend demo reset,
 *   and supports `disable()` via `DELETE /hosts/me/push-token`.
 */
export function usePushOptIn(
  authToken: string | null,
  isSeededOrOptions: boolean | UsePushOptInOptions = false,
) {
  const role: PushRole =
    typeof isSeededOrOptions === "object" && isSeededOrOptions !== null
      ? (isSeededOrOptions.role ?? "student")
      : "student";
  const isSeeded =
    typeof isSeededOrOptions === "boolean"
      ? isSeededOrOptions
      : Boolean(isSeededOrOptions?.isSeeded);

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

    const flagKey = pushFlagKey(authToken, role);

    if (role === "host") {
      let active = true;
      getHostPushTokenStatus(authToken)
        .then((res) => {
          if (!active) return;
          if (res.data.registered) {
            window.localStorage.setItem(flagKey, "on");
            setState({ kind: "on" });
          } else {
            // Reset stale local flag if backend cleared registrations on demo reset
            window.localStorage.removeItem(flagKey);
            setState(resolveBrowserReadyOrHomeScreen());
          }
        })
        .catch(() => {
          if (!active) return;
          if (window.localStorage.getItem(flagKey) === "on") {
            setState({ kind: "on" });
          } else {
            setState(resolveBrowserReadyOrHomeScreen());
          }
        });
      return () => {
        active = false;
      };
    }

    if (window.localStorage.getItem(flagKey) === "on") {
      setState({ kind: "on" });
      return;
    }
    setState(resolveBrowserReadyOrHomeScreen());
  }, [mode, authToken, isSeeded, role]);

  const enable = useCallback(async () => {
    if (!authToken) return;
    setState({ kind: "working" });
    const result = await requestFcmPushToken();
    if (!result.ok || !result.token) {
      setState({ kind: "error", message: result.message });
      return;
    }
    const flagKey = pushFlagKey(authToken, role);
    try {
      if (role === "host") {
        await registerHostPushToken({ token: result.token }, authToken);
      } else {
        await registerPushToken({ token: result.token }, authToken);
      }
      window.localStorage.setItem(flagKey, "on");
      setState({ kind: "on" });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Could not save notifications.",
      });
    }
  }, [authToken, role]);

  const disable = useCallback(async () => {
    if (!authToken || role !== "host") return;
    setState({ kind: "working" });
    const flagKey = pushFlagKey(authToken, role);
    try {
      await deleteHostPushToken(authToken);
      window.localStorage.removeItem(flagKey);
      setState(resolveBrowserReadyOrHomeScreen());
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not turn off host notifications.",
      });
    }
  }, [authToken, role]);

  return {
    state,
    enable,
    disable,
    realPush: state.kind === "on",
    role,
  };
}
