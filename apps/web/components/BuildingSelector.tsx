"use client";

import React, { useMemo, useState } from "react";
import { Check, MapPin, Search } from "lucide-react";
import type { Building } from "../lib/types/api";
import { groupVerifiedBuildings } from "../lib/buildings";

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
  /**
   * Explicit synthetic rehearsal options, kept apart from verified buildings. Pass these
   * only on presenter rehearsal screens; consumer screens never see them.
   */
  rehearsalOptions?: ReadonlyArray<RehearsalOption>;
  /** Optional custom testid generator for rehearsal options (defaults to `${testIdPrefix}-rehearsal-option-${id}`) */
  getRehearsalOptionTestId?: (id: string) => string;
  /** Label shown above the selector */
  label?: string;
  /** Helper copy shown under the label */
  helperText?: string;
}

/**
 * Pick a pickup building by its verified display name. Codes, IDs and coordinates stay
 * out of the UI; the value passed to `onChange` is still the canonical building ID.
 */
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
  label,
  helperText,
}: BuildingSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const groups = useMemo(
    () => groupVerifiedBuildings(buildings, searchQuery),
    [buildings, searchQuery],
  );
  const allBuildings = useMemo(
    () => groupVerifiedBuildings(buildings, "").flatMap((g) => g.buildings),
    [buildings],
  );
  const selectedBuilding = allBuildings.find((b) => b.id === value) ?? null;
  const selectedRehearsal =
    rehearsalOptions.find((opt) => opt.id === value) ?? null;
  const searchId = `${testIdPrefix}-building-search`;

  return (
    <div
      data-testid={`${testIdPrefix}-building-selector`}
      className="space-y-3"
    >
      {label && (
        <div className="space-y-0.5">
          <span className="text-sm font-bold text-ink">{label}</span>
          {helperText && <p className="text-xs text-ink-muted">{helperText}</p>}
        </div>
      )}

      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search campus buildings
        </label>
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          id={searchId}
          data-testid={searchId}
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search buildings"
          className="consumer-input w-full pl-10"
        />
      </div>

      {loading && (
        <div
          role="status"
          data-testid={`${testIdPrefix}-buildings-loading`}
          className="h-24 animate-pulse rounded-2xl bg-surface-subtle"
        >
          <span className="sr-only">Loading campus buildings</span>
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          data-testid={`${testIdPrefix}-buildings-error`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger"
        >
          <span>We couldn&apos;t load campus buildings.</span>
          {onRetry && (
            <button
              type="button"
              data-testid={`${testIdPrefix}-buildings-retry`}
              onClick={onRetry}
              className="consumer-button-secondary min-h-11 px-4 text-xs"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {!loading && allBuildings.length > 0 && (
        <div
          data-testid={`${testIdPrefix}-campus-building-groups`}
          className="max-h-72 space-y-4 overflow-y-auto rounded-2xl border border-line bg-surface-subtle p-3"
        >
          {groups.length === 0 ? (
            <p
              data-testid={`${testIdPrefix}-buildings-no-match`}
              className="py-3 text-center text-sm text-ink-muted"
            >
              No buildings match &ldquo;{searchQuery}&rdquo;.
            </p>
          ) : (
            groups.map((group) => (
              <div
                key={group.category}
                data-testid={`${testIdPrefix}-building-group-${group.category}`}
                className="space-y-1.5"
              >
                <div className="px-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {group.label}
                </div>
                <div className="grid gap-1.5">
                  {group.buildings.map((b) => {
                    const selected = value === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        data-testid={`${testIdPrefix}-building-option-${b.id}`}
                        aria-pressed={selected}
                        onClick={() => onChange(b.id)}
                        className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition ${
                          selected
                            ? "border-owl-gold bg-owl-goldTint text-ink"
                            : "border-line bg-surface text-ink hover:border-owl-gold/60"
                        }`}
                      >
                        <span>{b.name}</span>
                        {selected && (
                          <Check
                            size={18}
                            aria-hidden="true"
                            className="shrink-0 text-owl-goldText"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && !error && allBuildings.length === 0 && (
        <div
          data-testid={`${testIdPrefix}-buildings-empty`}
          className="rounded-2xl border border-line bg-surface-subtle px-4 py-3 text-sm text-ink-muted"
        >
          Campus buildings aren&apos;t available right now.
        </div>
      )}

      <div
        data-testid={`${testIdPrefix}-selected-location-summary`}
        className="flex items-center gap-2 rounded-xl bg-surface-subtle px-3.5 py-2.5 text-sm"
      >
        <MapPin
          size={16}
          aria-hidden="true"
          className="shrink-0 text-owl-goldText"
        />
        <span className="text-ink-muted">Pickup at</span>
        <span className="font-bold text-ink">
          {selectedBuilding?.name ??
            selectedRehearsal?.label ??
            "Choose a building"}
        </span>
      </div>

      {rehearsalOptions.length > 0 && (
        <div
          data-testid={`${testIdPrefix}-rehearsal-section`}
          className="space-y-2 rounded-2xl border border-warning/30 bg-warning-tint p-3"
        >
          <p className="text-xs font-bold text-warning">
            Rehearsal location (simulated, no walking directions)
          </p>
          <div className="grid gap-2">
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
                  className={`flex min-h-12 w-full flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
                    selected
                      ? "border-warning bg-surface text-ink"
                      : "border-line bg-surface text-ink-muted hover:border-warning/60"
                  }`}
                >
                  <span className="font-bold text-ink">{opt.label}</span>
                  {opt.description && (
                    <span className="mt-0.5 text-xs text-ink-muted">
                      {opt.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
