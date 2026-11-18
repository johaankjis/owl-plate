"use client";

import React from "react";
import type { PushState } from "../lib/push";

interface PushOptInProps {
  state: PushState;
  onEnable: () => void;
}

/** One small card in the joined view; hidden entirely in rehearsal (simulated) mode. */
export function PushOptIn({ state, onEnable }: PushOptInProps) {
  if (state.kind === "simulated") return null;

  if (state.kind === "on") {
    return (
      <p
        data-testid="notifications-on"
        className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200"
      >
        Notifications on for this phone. You can lock it; we&apos;ll buzz you
        when food is nearby.
      </p>
    );
  }

  if (state.kind === "not_configured") {
    return (
      <p className="rounded-xl border border-zinc-700 px-4 py-3 text-xs text-zinc-400">
        Real push is not configured in this build. Invites still appear here.
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
          Want a buzz when food is nearby?
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
        data-testid="enable-notifications-button"
        disabled={state.kind === "working"}
        onClick={onEnable}
        className="min-h-[48px] w-full rounded-xl border border-owl-gold/60 bg-owl-black px-4 py-3 text-sm font-bold text-owl-gold transition hover:bg-owl-gold/10 disabled:opacity-60"
      >
        {state.kind === "working" ? "Turning on…" : "Enable notifications"}
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
