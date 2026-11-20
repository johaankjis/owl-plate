"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "./api-client";

export type VisionMode = "fixture" | "gemini" | "openrouter";

/** Short, honest label for the server's configured vision mode. */
export function visionModeLabel(mode: VisionMode | null): string {
  if (mode === "openrouter") return "Live Gemini via OpenRouter";
  if (mode === "gemini") return "Live Gemini vision";
  if (mode === "fixture") return "Saved demo estimates";
  return "Vision mode loading";
}

/**
 * Read the configured vision mode from GET /health so banners never claim
 * fixture vision while the server is running live Gemini, or the reverse.
 */
export function useVisionMode(): VisionMode | null {
  return useDemoHealth().vision;
}

export type NotificationMode = "simulated" | "fcm";

/** Configured notification transport: real Firebase push or simulated log. */
export function useNotificationMode(): NotificationMode | null {
  return useDemoHealth().notifications;
}

function useDemoHealth(): {
  vision: VisionMode | null;
  notifications: NotificationMode | null;
} {
  const isFixtureMode = process.env.NEXT_PUBLIC_UI_FIXTURE_MODE === "true";
  const [mode, setMode] = useState<VisionMode | null>(
    isFixtureMode ? "fixture" : null,
  );
  const [notifications, setNotifications] = useState<NotificationMode | null>(
    isFixtureMode ? "simulated" : null,
  );
  useEffect(() => {
    if (isFixtureMode) {
      setMode("fixture");
      setNotifications("simulated");
      return;
    }
    let active = true;
    fetch(`${API_BASE_URL}/health`, { cache: "no-store" })
      .then(
        (res) =>
          res.json() as Promise<{
            vision?: VisionMode;
            notifications?: NotificationMode;
          }>,
      )
      .then((body) => {
        if (
          active &&
          (body.notifications === "fcm" || body.notifications === "simulated")
        )
          setNotifications(body.notifications);
        if (
          active &&
          (body.vision === "gemini" ||
            body.vision === "openrouter" ||
            body.vision === "fixture")
        )
          setMode(body.vision);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isFixtureMode]);
  return { vision: mode, notifications };
}
