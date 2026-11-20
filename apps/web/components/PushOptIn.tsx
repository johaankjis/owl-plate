"use client";

import React from "react";
import { OWL_MOTION_CLASSES } from "../lib/motion";
import type { PushState } from "../lib/push";
import type { PushRole } from "../lib/push-helpers";

interface PushOptInProps {
  state: PushState;
  onEnable: () => void;
  onDisable?: () => void;
  role?: PushRole;
}

/** One small card in the joined or host view; hidden entirely in rehearsal (simulated) mode unless showSimulatedNotice is desired. */
export function PushOptIn({
  state,
  onEnable,
  onDisable,
  role = "student",
}: PushOptInProps) {
  if (state.kind === "simulated") return null;

  const isHost = role === "host";

  if (state.kind === "on") {
    return (
      <div
        data-testid={isHost ? "host-notifications-on" : "notifications-on"}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-tint px-4 py-3 text-sm font-semibold text-success ${OWL_MOTION_CLASSES.fade}`}
      >
        <span>
          {isHost
            ? "Pickup notifications are on."
            : "Food alerts are on for this phone."}
        </span>
        {isHost && onDisable && (
          <button
            type="button"
            data-testid="disable-host-notifications-button"
            onClick={onDisable}
            className={`min-h-[44px] shrink-0 rounded-lg border border-success/30 bg-surface px-3 py-1.5 text-xs font-bold text-success transition hover:bg-surface-subtle ${OWL_MOTION_CLASSES.press}`}
          >
            Turn off
          </button>
        )}
      </div>
    );
  }

  if (state.kind === "not_configured") {
    return (
      <p className="rounded-xl border border-line px-4 py-3 text-xs text-ink-muted">
        {isHost
          ? "Pickup updates appear here automatically."
          : "New food appears here automatically."}
      </p>
    );
  }

  if (state.kind === "needs_home_screen") {
    return (
      <div
        data-testid="push-home-screen-hint"
        className={`space-y-1 rounded-xl border border-owl-gold/30 bg-owl-gold/5 px-4 py-3 text-sm text-ink ${OWL_MOTION_CLASSES.fade}`}
      >
        <p className="font-semibold text-owl-goldText">
          {isHost
            ? "Want a buzz when a serving is marked collected?"
            : "Want a buzz when food is nearby?"}
        </p>
        <p>
          On iPhone, tap <strong>Share</strong> →{" "}
          <strong>Add to Home Screen</strong>, then open Owl Plate from the icon
          and tap Enable notifications.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        data-testid={
          isHost
            ? "enable-host-notifications-button"
            : "enable-notifications-button"
        }
        disabled={state.kind === "working"}
        onClick={onEnable}
        className={`min-h-[48px] w-full rounded-xl border border-owl-gold/60 bg-surface px-4 py-3 text-sm font-bold text-owl-goldText transition hover:bg-owl-gold/10 disabled:opacity-60 ${OWL_MOTION_CLASSES.press}`}
      >
        {state.kind === "working"
          ? "Turning on…"
          : isHost
            ? "Enable pickup notifications"
            : "Enable notifications"}
      </button>
      {state.kind === "error" && (
        <p
          role="alert"
          data-testid="push-error"
          className="text-xs text-danger"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
