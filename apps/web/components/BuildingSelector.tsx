"use client";

import React, { useMemo, useState } from "react";
import type { Building } from "../lib/types/api";
import {
  formatBuildingMetaBadge,
  groupVerifiedBuildings,
} from "../lib/buildings";

export interface RehearsalOption {
  id: string;
  label: string;
  description?: string;
}

export interface BuildingSelectorProps {
  /** Verified buildings returned by GET /buildings */
  buildings: ReadonlyArray<Building>;
  /** Currently selected building ID or rehearsal option ID */
  value: string;
  /** Callback invoked with the canonical building `id` (or rehearsal ID) */
  onChange: (nextId: string) => void;
  /** True while GET /buildings is in flight */
  loading?: boolean;
  /** Error message if GET /buildings failed */
  error?: string | null;
  /** Retry callback when GET /buildings failed */
  onRetry?: () => void;
  /** Prefix for generated testids (e.g. "host" or "join") */
  testIdPrefix: "host" | "join";
  /** Explicit synthetic rehearsal options kept separate from verified campus buildings */
  rehearsalOptions?: ReadonlyArray<RehearsalOption>;
  /** Optional custom testid generator for rehearsal options (defaults to `${testIdPrefix}-area-${id}`) */
  getRehearsalOptionTestId?: (id: string) => string;
  /** Whether to allow typing a custom rehearsal code when rehearsal section is expanded (for host legacy input) */
  allowCustomRehearsalCode?: boolean;
  /** Input id for custom rehearsal code input (e.g. "building-code-input") */
  customRehearsalInputId?: string;
  /** Label shown above the selector */
  label?: string;
  /** Helper copy shown under the label */
  helperText?: string;
}

export function BuildingSelector({
  buildings,
  value,
  onChange,
  loading = false,
  error = null,
  onRetry,
  testIdPrefix,
  rehearsalOptions = [],
  getRehearsalOptionTestId,
  allowCustomRehearsalCode = false,
  customRehearsalInputId = "building-code-input",
  label,
  helperText,
}: BuildingSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const groups = useMemo(
    () => groupVerifiedBuildings(buildings, searchQuery),
    [buildings, searchQuery],
  );
  const allVerifiedGroups = useMemo(
    () => groupVerifiedBuildings(buildings, ""),
    [buildings],
  );
  const totalVerifiedCount = useMemo(
    () => allVerifiedGroups.reduce((acc, g) => acc + g.buildings.length, 0),
    [allVerifiedGroups],
  );

  const selectedVerifiedBuilding = useMemo(
    () =>
      allVerifiedGroups
        .flatMap((g) => g.buildings)
        .find((b) => b.id === value) ?? null,
    [allVerifiedGroups, value],
  );

  const selectedRehearsalOption = useMemo(
    () => rehearsalOptions.find((opt) => opt.id === value) ?? null,
    [rehearsalOptions, value],
  );

  const isRehearsalSelected =
    !selectedVerifiedBuilding && Boolean(value && value.trim().length > 0);

  return (
    <div
      data-testid={`${testIdPrefix}-building-selector`}
      className="space-y-3"
    >
      {label && (
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-white">{label}</span>
            <span
              data-testid={`${testIdPrefix}-campus-badge`}
              className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300"
            >
              Marietta Campus • Verified directory (no GPS)
            </span>
          </div>
          {helperText && <p className="text-xs text-zinc-400">{helperText}</p>}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <label htmlFor={`${testIdPrefix}-building-search`} className="sr-only">
          Search Marietta campus buildings
        </label>
        <input
          id={`${testIdPrefix}-building-search`}
          data-testid={`${testIdPrefix}-building-search`}
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Marietta buildings by name, code, or category..."
          className="min-h-[44px] w-full rounded-xl border border-zinc-700 bg-owl-black px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-owl-gold focus:outline-none"
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div
          data-testid={`${testIdPrefix}-buildings-loading`}
          className="rounded-xl border border-zinc-800 bg-owl-black/60 px-4 py-3 text-xs text-zinc-400"
        >
          Loading verified Marietta campus buildings...
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          role="alert"
          data-testid={`${testIdPrefix}-buildings-error`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-200"
        >
          <span>{error}</span>
          {onRetry && (
            <button
              type="button"
              data-testid={`${testIdPrefix}-buildings-retry`}
              onClick={onRetry}
              className="min-h-[36px] rounded-lg border border-rose-400/50 bg-rose-900/50 px-3 py-1 font-bold text-white hover:bg-rose-800"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Verified Campus Building Groups */}
      {!loading && totalVerifiedCount > 0 && (
        <div
          data-testid={`${testIdPrefix}-campus-building-groups`}
          className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-zinc-800 bg-owl-black/50 p-3"
        >
          {groups.length === 0 ? (
            <p
              data-testid={`${testIdPrefix}-buildings-no-match`}
              className="py-3 text-center text-xs text-zinc-400"
            >
              No verified campus buildings match &ldquo;{searchQuery}&rdquo;.
            </p>
          ) : (
            groups.map((group) => (
              <div
                key={group.category}
                data-testid={`${testIdPrefix}-building-group-${group.category}`}
                className="space-y-1.5"
              >
                <div className="text-[11px] font-bold uppercase tracking-wider text-owl-gold">
                  {group.label}
                </div>
                <div className="grid gap-1.5">
                  {group.buildings.map((b) => {
                    const selected = value === b.id;
                    const metaBadge = formatBuildingMetaBadge(b);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        data-testid={`${testIdPrefix}-building-option-${b.id}`}
                        aria-pressed={selected}
                        onClick={() => onChange(b.id)}
                        className={`flex min-h-[48px] w-full flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left transition ${
                          selected
                            ? "border-owl-gold bg-owl-gold/15 text-white ring-1 ring-owl-gold/50"
                            : "border-zinc-800 bg-owl-black text-zinc-200 hover:border-zinc-600"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-sm font-bold text-white">
                            {b.name}
                          </span>
                          <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                            {metaBadge ?? "Verified"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && !error && totalVerifiedCount === 0 && (
        <div
          data-testid={`${testIdPrefix}-buildings-empty`}
          className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-200"
        >
          Verified campus directory unavailable in offline synthetic fixture
          mode. Select an explicit rehearsal location below.
        </div>
      )}

      {/* Selected location summary pill */}
      <div
        data-testid={`${testIdPrefix}-selected-location-summary`}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-owl-black/70 px-3.5 py-2 text-xs"
      >
        <span className="text-zinc-400">Selected location:</span>
        {selectedVerifiedBuilding ? (
          <span className="font-bold text-emerald-300">
            {selectedVerifiedBuilding.name} ({selectedVerifiedBuilding.id})
          </span>
        ) : (
          <span className="font-bold text-amber-300">
            {selectedRehearsalOption
              ? `${selectedRehearsalOption.label} (Synthetic rehearsal)`
              : `${value || "None"} (Synthetic rehearsal)`}
          </span>
        )}
      </div>

      {/* Explicit Rehearsal / Synthetic Demo Locations — clearly labeled and separate */}
      {(rehearsalOptions.length > 0 || allowCustomRehearsalCode) && (
        <div
          data-testid={`${testIdPrefix}-rehearsal-section`}
          className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-950/15 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-xs font-bold text-amber-300">
              Rehearsal &amp; synthetic demo locations (unverified coordinates)
            </span>
            <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200">
              Synthetic rehearsal
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            For scripted A–E or 4-visitor ring rehearsal only. Uses synthetic
            placeholder origin (no walking directions).
          </p>

          {rehearsalOptions.length > 0 && (
            <div className="grid gap-2 pt-1">
              {rehearsalOptions.map((opt) => {
                const selected = value === opt.id;
                const testId = getRehearsalOptionTestId
                  ? getRehearsalOptionTestId(opt.id)
                  : `${testIdPrefix}-rehearsal-option-${opt.id}`;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={testId}
                    aria-pressed={selected}
                    onClick={() => onChange(opt.id)}
                    className={`flex min-h-[48px] w-full flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left transition ${
                      selected
                        ? "border-amber-400 bg-amber-500/15 text-white ring-1 ring-amber-400/50"
                        : "border-zinc-800 bg-owl-black text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">
                        {opt.label}
                      </span>
                      <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        Simulated
                      </span>
                    </div>
                    {opt.description && (
                      <span className="mt-0.5 text-[11px] text-zinc-400">
                        {opt.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {allowCustomRehearsalCode && (
            <div className="pt-1">
              <label
                htmlFor={customRehearsalInputId}
                className="block text-[11px] font-semibold text-zinc-300"
              >
                Building ID or legacy rehearsal code
              </label>
              <input
                id={customRehearsalInputId}
                data-testid={customRehearsalInputId}
                type="text"
                maxLength={80}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`mt-1 min-h-[40px] w-full rounded-xl border bg-owl-black px-3 py-1.5 text-xs text-white ${
                  isRehearsalSelected
                    ? "border-amber-500/60"
                    : "border-zinc-700"
                }`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
