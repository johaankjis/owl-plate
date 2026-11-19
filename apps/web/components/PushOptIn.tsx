"use client";

import React from "react";
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
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200"
      >
        <span>
          {isHost
            ? "Pickup update notifications on for this device (food name and available counts only; no student data)."
            : "Notifications on for this phone. You can lock it; we'll buzz you when food is nearby."}
        </span>
        {isHost && onDisable && (
          <button
            type="button"
            data-testid="disable-host-notifications-button"
            onClick={onDisable}
            className="min-h-[36px] shrink-0 rounded-lg border border-emerald-400/40 bg-owl-black/60 px-3 py-1.5 text-xs font-bold text-emerald-200 transition hover:bg-owl-black"
          >
            Turn off
          </button>
        )}
      </div>
    );
  }

  if (state.kind === "not_configured") {
    return (
      <p className="rounded-xl border border-zinc-700 px-4 py-3 text-xs text-zinc-400">
        {isHost
          ? "Real push is not configured in this build. Pickup counts and reviews update automatically here."
          : "Real push is not configured in this build. Invites still appear here."}
      </p>
    );
  }

  if (state.kind === "needs_home_screen") {
    return (
      <div
        data-testid="push-home-screen-hint"
        className="space-y-1 rounded-xl border border-owl-gold/30 bg-owl-gold/5 px-4 py-3 text-sm text-zinc-200"
      >
        <p className="font-semibold text-owl-gold">
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
        className="min-h-[48px] w-full rounded-xl border border-owl-gold/60 bg-owl-black px-4 py-3 text-sm font-bold text-owl-gold transition hover:bg-owl-gold/10 disabled:opacity-60"
      >
        {state.kind === "working"
          ? "Turning on…"
          : isHost
            ? "Enable host pickup notifications"
            : "Enable notifications"}
      </button>
      {state.kind === "error" && (
        <p
          role="alert"
          data-testid="push-error"
          className="text-xs text-rose-300"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
