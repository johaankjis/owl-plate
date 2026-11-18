"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DemoHeader } from "../../components/DemoHeader";
import { DispatchMap } from "../../components/DispatchMap";
import { AllergenListDisplay } from "../../components/AllergenBadge";
import {
  ALLERGEN_WARNING_TEXT,
  type DemoCredential,
  type DispatchResponse,
  type DropResponse,
} from "../../lib/types/api";
import {
  advanceDemoClock,
  getDispatchView,
  getDrop,
  getActiveDrop,
  resetDemoState,
  INITIAL_DATA_SOURCE,
  type DataSourceMode,
} from "../../lib/api-client";
import { formatEasternTime, formatRemainingTime } from "../../lib/time";

const ALLOWED_GENERIC_REASON_CODES: Record<string, string> = {
  nearby: "nearby (within current H3 wave ring)",
  diet_match: "diet_match (matches required diet tags)",
  fair_share: "fair_share (balanced campus distribution)",
  allergen_conflict: "allergen_conflict (hard safety filter exclusion)",
  diet_mismatch: "diet_mismatch (hard diet filter exclusion)",
  out_of_range: "out_of_range (outside current H3 ring k)",
  alerts_paused: "alerts_paused (student paused alerts)",
  active_claim: "active_claim (already holding a serving)",
};

function sanitizeReasonCode(code: string): string {
  // Never expose priority or score on the projector even if an unexpected string arrives
  const normalized = code.toLowerCase();
  if (
    normalized.includes("priority") ||
    normalized.includes("care") ||
    normalized.includes("score")
  ) {
    return "fair_share (balanced campus distribution)";
  }
  return ALLOWED_GENERIC_REASON_CODES[code] ?? "not selected for this wave";
}

export default function DispatchProjectorPage() {
  const [credential, setCredential] =
    useState<DemoCredential>("demo-projector");
  const [sourceMode, setSourceMode] =
    useState<DataSourceMode>(INITIAL_DATA_SOURCE);
  const [dispatchData, setDispatchData] = useState<DispatchResponse | null>(
    null,
  );
  const [dropDetails, setDropDetails] = useState<DropResponse | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollDispatch = useCallback(async () => {
    try {
      const active = await getActiveDrop(credential);
      const activeDropId = active.data.drop_id;
      setSourceMode(active.source);
      if (!activeDropId) {
        setDispatchData(null);
        setDropDetails(null);
        setErrorMessage(null);
        return;
      }
      const [dispRes, dropRes] = await Promise.all([
        getDispatchView(activeDropId, credential),
        getDrop(activeDropId, credential),
      ]);
      setDispatchData(dispRes.data);
      setDropDetails(dropRes.data);
      setSourceMode(dispRes.source);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to poll /drops/{id}/dispatch",
      );
    }
  }, [credential]);

  // Poll every 2 seconds per ARCHITECTURE.md & prompt
  useEffect(() => {
    void pollDispatch();
    const interval = setInterval(() => {
      void pollDispatch();
    }, 2000);
    return () => clearInterval(interval);
  }, [pollDispatch]);

  const handleDemoReset = async () => {
    setBusyAction("reset");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await resetDemoState("demo-host");
      setSourceMode(res.source);
      await pollDispatch();
      setStatusMessage(
        "Reset complete: simulated students seeded. No drop or invitations. Waiting for a host photo.",
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusyAction(null);
    }
  };

  const handleAdvance60s = async () => {
    setBusyAction("tick");
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await advanceDemoClock(61, "demo-host");
      setSourceMode(res.source);
      await pollDispatch();
      setStatusMessage(
        `Advanced demo clock (+61s) to ${formatEasternTime(
          res.data.server_time,
        )}. Dispatch checked for expired invites and eligible next waves.`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Clock advance failed",
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-owl-black text-zinc-100">
      <DemoHeader
        credential={credential}
        onCredentialChange={setCredential}
        sourceMode={sourceMode}
        visionSource={dropDetails?.vision_source}
        isDemo={dispatchData?.is_demo ?? true}
        allowedRoles={["projector", "host"]}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {/* Projector Header & Demo Controls */}
        <section className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-800 bg-owl-slate p-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">
                Dispatch Projector — H3 Wave Ring &amp; Synthetic Personas
              </h1>
              <span className="rounded bg-owl-gold/20 px-2.5 py-0.5 text-xs font-bold text-owl-gold">
                Polling every 2s
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-300">
              Simulated personas and dispatch waves. Hosts see serving counts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="dispatch-reset-button"
              disabled={busyAction !== null}
              onClick={() => void handleDemoReset()}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
            >
              {busyAction === "reset" ? "Resetting..." : "Reset Demo State"}
            </button>
            <button
              type="button"
              data-testid="dispatch-advance-60s-button"
              disabled={busyAction !== null}
              onClick={() => void handleAdvance60s()}
              className="rounded-lg bg-owl-gold px-4 py-2 text-xs font-bold text-owl-black hover:bg-owl-goldDark disabled:opacity-50"
            >
              {busyAction === "tick" ? "Advancing..." : "Advance Clock +61s"}
            </button>
          </div>
        </section>

        {statusMessage && (
          <div
            data-testid="dispatch-status-message"
            className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-200"
          >
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div
            data-testid="dispatch-error-message"
            className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-xs text-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {!dispatchData && !errorMessage && (
          <p
            data-testid="dispatch-waiting"
            className="rounded-xl border border-zinc-800 p-6 text-zinc-300"
          >
            Waiting for a host to upload a photo.
          </p>
        )}

        {dispatchData && (
          <>
            {/* Top Metrics Bar */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl border border-zinc-800 bg-owl-slate p-4">
                <div className="text-xs text-zinc-400">Drop Status</div>
                <div
                  data-testid="dispatch-drop-status"
                  className="mt-1 text-xl font-extrabold uppercase text-owl-gold"
                >
                  {dispatchData.status}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-owl-slate p-4">
                <div className="text-xs text-zinc-400">Active H3 Ring</div>
                <div
                  data-testid="dispatch-ring-k"
                  className="mt-1 text-xl font-extrabold text-sky-400"
                >
                  k = {dispatchData.ring_k}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-owl-slate p-4">
                <div className="text-xs text-zinc-400">Total Servings</div>
                <div
                  data-testid="dispatch-count-total"
                  className="mt-1 text-xl font-extrabold text-white"
                >
                  {dispatchData.counts.total}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-owl-slate p-4">
                <div className="text-xs text-zinc-400">Available</div>
                <div
                  data-testid="dispatch-count-available"
                  className="mt-1 text-xl font-extrabold text-emerald-400"
                >
                  {dispatchData.counts.available}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-owl-slate p-4">
                <div className="text-xs text-zinc-400">Held (10m)</div>
                <div
                  data-testid="dispatch-count-held"
                  className="mt-1 text-xl font-extrabold text-amber-400"
                >
                  {dispatchData.counts.held}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-owl-slate p-4">
                <div className="text-xs text-zinc-400">Server Time (ET)</div>
                <div
                  data-testid="dispatch-server-time"
                  className="mt-1 text-sm font-bold text-zinc-200"
                >
                  {formatEasternTime(dispatchData.server_time)}
                </div>
                {dispatchData.next_wave_at && (
                  <div className="text-[11px] text-zinc-400">
                    Next wave check:{" "}
                    {formatRemainingTime(
                      dispatchData.next_wave_at,
                      dispatchData.server_time,
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Main Grid: Deck.gl H3 Map + Persona Decision Table */}
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-7">
                <DispatchMap
                  originCell={dispatchData.origin_cell}
                  ringK={dispatchData.ring_k}
                  personas={dispatchData.personas}
                />

                {/* Allergen Display with mandatory warning on projector view */}
                {dropDetails && (
                  <AllergenListDisplay
                    allergens={dropDetails.allergens_final}
                    notice={
                      dropDetails.allergen_notice || ALLERGEN_WARNING_TEXT
                    }
                    title={`Active Drop (${dropDetails.building_code} ${dropDetails.room}) Allergens`}
                  />
                )}
              </div>

              {/* Right Column: Waves & Synthetic Personas Table */}
              <div className="space-y-5 lg:col-span-5">
                {/* Waves History */}
                <section className="rounded-xl border border-zinc-800 bg-owl-slate p-4">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-owl-gold">
                    Dispatch Waves ({dispatchData.waves.length})
                  </h2>
                  {dispatchData.waves.length === 0 ? (
                    <p className="mt-2 text-xs text-zinc-400">
                      No waves planned yet. Publish the drop on /host to launch
                      Wave 1.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {dispatchData.waves.map((w) => (
                        <div
                          key={w.number}
                          data-testid={`wave-row-${w.number}`}
                          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-owl-black/60 px-3 py-2 text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">
                              Wave {w.number}
                            </span>{" "}
                            <span className="text-sky-400">
                              (ring_k = {w.ring_k})
                            </span>
                          </div>
                          <div className="text-zinc-300">
                            {w.invite_count} invite(s) •{" "}
                            {formatEasternTime(w.planned_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Synthetic Personas Decision Table */}
                <section className="rounded-xl border border-zinc-800 bg-owl-slate p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                      Synthetic Demo Personas (A–E)
                    </h2>
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                      SIMULATED ONLY
                    </span>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {dispatchData.personas.map((p) => (
                      <div
                        key={p.label}
                        data-testid={`persona-row-${p.label}`}
                        className="rounded-lg border border-zinc-800 bg-owl-black/70 p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-owl-gold font-extrabold text-owl-black">
                              {p.label}
                            </span>
                            <span className="font-bold text-white">
                              Persona {p.label}
                            </span>
                            <span
                              data-testid={`simulated-marker-${p.label}`}
                              className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-owl-gold"
                            >
                              SIMULATED (is_simulated=true)
                            </span>
                          </div>

                          <span
                            data-testid={`persona-status-${p.label}`}
                            className={`rounded px-2 py-0.5 font-bold uppercase ${
                              p.status === "claimed" || p.status === "picked_up"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : p.status === "sent"
                                  ? "bg-owl-gold/20 text-owl-gold"
                                  : p.status === "excluded" ||
                                      p.status === "expired"
                                    ? "bg-rose-500/20 text-rose-300"
                                    : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                          <span>
                            H3 Ring Distance:{" "}
                            <strong className="text-zinc-200">
                              {p.ring_distance ?? "—"}
                            </strong>
                          </span>
                          {p.h3_cell && (
                            <span>
                              Cell:{" "}
                              <code className="text-zinc-300">{p.h3_cell}</code>
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p.reason_codes.map((rc) => (
                            <span
                              key={rc}
                              data-testid={`persona-reason-${p.label}-${rc}`}
                              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200"
                            >
                              {sanitizeReasonCode(rc)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
