"use client";

import React, { useEffect, useState } from "react";
import {
  advanceClock,
  resetDemo,
  type DemoStatusResponse,
  type Scenario,
} from "../../lib/presenter-api";

const PERSONAS = ["A", "B", "C", "D", "E"] as const;
const OPEN_KEY = "owl-plate.presenter-open";

interface PresenterControlsProps {
  status: DemoStatusResponse | null;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}

/**
 * Reset, clock and seeded-scenario controls. Collapsed by default so the
 * audience sees the dispatch view; destructive resets need a second click.
 */
export function PresenterControls({
  status,
  onChanged,
  onError,
}: PresenterControlsProps) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<Scenario | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOpen(window.localStorage.getItem(OPEN_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  const toggle = () => {
    window.localStorage.setItem(OPEN_KEY, String(!open));
    setOpen(!open);
  };

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      onChanged(await action());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Presenter action failed");
    } finally {
      setBusy(false);
      setArmed(null);
    }
  };

  const reset = (scenario: Scenario) => {
    if (armed !== scenario) {
      setArmed(scenario);
      return;
    }
    void run(async () => {
      await resetDemo(scenario);
      return scenario === "visitors"
        ? "Reset for live visitors. Everyone must join again."
        : "Seeded rehearsal loaded: simulated students A–E are active.";
    });
  };

  const scenario = status?.scenario;

  return (
    <section className="rounded-xl border border-zinc-800 bg-owl-slate">
      <button
        type="button"
        data-testid="presenter-toggle"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-base font-semibold text-zinc-200"
      >
        <span>Presenter controls</span>
        <span className="text-sm text-zinc-400">
          {scenario === "seeded" ? "Seeded rehearsal" : "Live visitors"} ·{" "}
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-zinc-800 p-5 lg:grid-cols-3">
          <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
              Reset
            </h3>
            <button
              type="button"
              data-testid="presenter-reset-visitors"
              disabled={busy}
              onClick={() => reset("visitors")}
              className="w-full rounded-lg bg-owl-gold px-4 py-3 text-base font-bold text-owl-black disabled:opacity-50"
            >
              {armed === "visitors"
                ? "Click again to clear everything"
                : "Reset for live visitors"}
            </button>
            <button
              type="button"
              data-testid="presenter-load-seeded"
              disabled={busy}
              onClick={() => reset("seeded")}
              className="w-full rounded-lg border border-zinc-600 px-4 py-3 text-base font-semibold text-zinc-100 disabled:opacity-50"
            >
              {armed === "seeded"
                ? "Click again to load seeded A–E"
                : "Load seeded rehearsal (A–E)"}
            </button>
            <p className="text-sm text-zinc-400">
              Both resets remove drops, invites, claims and joined visitors.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
              Clock
            </h3>
            <button
              type="button"
              data-testid="presenter-advance-60s"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await advanceClock(61);
                  return "Demo clock advanced 61 seconds.";
                })
              }
              className="w-full rounded-lg border border-zinc-600 px-4 py-3 text-base font-semibold text-zinc-100 disabled:opacity-50"
            >
              Advance clock +61 s
            </button>
            <p className="text-sm text-zinc-400">
              Skips the natural 60-second invite wait. Clock offset:{" "}
              {status?.clock_offset_seconds ?? 0} s.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-400">
              Seeded personas (simulated)
            </h3>
            {scenario === "seeded" ? (
              <div className="flex flex-wrap gap-2">
                {PERSONAS.map((label) => (
                  <a
                    key={label}
                    data-testid={`presenter-open-persona-${label}`}
                    href={`/student?persona=${label}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-zinc-600 px-4 py-2 text-base font-semibold text-zinc-100 hover:border-owl-gold"
                  >
                    Open {label}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">
                Load the seeded rehearsal to open personas A–E.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
