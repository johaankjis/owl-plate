"use client";

import React, { useState, type ReactNode } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  MAX_ASSUMPTION_KG,
  MAX_ASSUMPTION_USD,
  formatCount,
  formatDurationSeconds,
  formatKg,
  formatPercent,
  formatUsd,
  resolveIllustrativeEstimates,
} from "../../lib/operations-helpers";
import type {
  OperationsEstimates,
  OperationsSummary,
} from "../../lib/types/operations";
import { OPS_CARD, OPS_EYEBROW, OPS_HEADING } from "./styles";

interface SecondaryMetricsProps {
  summary: OperationsSummary;
  estimates: OperationsEstimates;
}

function MetricRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="min-w-0 text-sm text-ink-muted">
        {label}
        {hint && (
          <span className="block text-xs text-ink-muted/80">{hint}</span>
        )}
      </dt>
      <dd className="shrink-0 text-base font-bold text-ink tabular-nums">
        {children}
      </dd>
    </div>
  );
}

function parseAssumption(raw: string, max: number): number | null | undefined {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.min(max, parsed);
}

/**
 * Everything beyond the four headline figures in one place: participation,
 * recovery with the separately labelled simulated pantry figures, and the
 * illustrative estimates with their assumptions.
 */
export function SecondaryMetrics({
  summary,
  estimates,
}: SecondaryMetricsProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [customUsd, setCustomUsd] = useState<number | null>(null);
  const [customKg, setCustomKg] = useState<number | null>(null);

  const resolved = resolveIllustrativeEstimates(estimates, summary, {
    usdPerServing: customUsd,
    kgPerServing: customKg,
  });

  return (
    <section
      aria-labelledby="operations-secondary-heading"
      data-testid="operations-secondary-metrics"
      className={`${OPS_CARD} space-y-5`}
    >
      <h2 id="operations-secondary-heading" className={OPS_HEADING}>
        More metrics
      </h2>

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-3">
        <div>
          <h3 className={OPS_EYEBROW}>Participation</h3>
          <dl className="mt-1.5">
            <MetricRow
              label="Participating students"
              hint="Sessions with a claim, not unique people"
            >
              <span data-testid="operations-kpi-participating-students">
                {formatCount(summary.participating_students)}
              </span>
            </MetricRow>
            <MetricRow label="Participating hosts">
              <span data-testid="operations-kpi-participating-hosts">
                {formatCount(summary.participating_hosts)}
              </span>
            </MetricRow>
            <MetricRow label="Joined visitor sessions" hint="Not unique people">
              <span data-testid="operations-context-joined-sessions">
                {formatCount(summary.joined_sessions)}
              </span>
            </MetricRow>
            <MetricRow
              label="Avg. reservation delay"
              hint="Publish to claim, incl. released and expired"
            >
              <span data-testid="operations-kpi-avg-reservation-delay">
                {formatDurationSeconds(summary.average_reservation_seconds)}
              </span>
            </MetricRow>
            <MetricRow label="Buildings served">
              <span data-testid="operations-context-buildings">
                {formatCount(summary.buildings_served)}
              </span>
            </MetricRow>
            <MetricRow label="Listings active / published">
              <span data-testid="operations-context-active-listings">
                {formatCount(summary.active_listings)}
              </span>
              {" / "}
              <span data-testid="operations-context-published-listings">
                {formatCount(summary.published_listings)}
              </span>
            </MetricRow>
          </dl>
        </div>

        <div data-testid="operations-context-strip">
          <h3 className={OPS_EYEBROW}>Recovery and pantry</h3>
          <dl className="mt-1.5">
            <MetricRow label="Student recovery">
              <span data-testid="operations-student-recovery-rate">
                {formatPercent(summary.student_pickup_rate_percent)}
              </span>
            </MetricRow>
            <MetricRow label="Expired unclaimed">
              <span data-testid="operations-context-expired">
                {formatCount(summary.expired_unclaimed_servings)}
              </span>
            </MetricRow>
            <MetricRow label="Pantry transfers (simulated)">
              <span data-testid="operations-kpi-pantry-transfers">
                {formatCount(summary.pantry_transfers)}
              </span>
            </MetricRow>
            <MetricRow label="Pantry reserved (simulated)">
              <span data-testid="operations-kpi-pantry-reserved">
                {formatCount(summary.pantry_reserved_servings)}
              </span>
            </MetricRow>
            <MetricRow
              label="Combined demo recovery"
              hint="Reported separately; adds simulated pantry transfers"
            >
              <span data-testid="operations-combined-recovery-rate">
                {formatPercent(summary.combined_recovery_rate_percent)}
              </span>
            </MetricRow>
          </dl>
        </div>

        <div data-testid="operations-estimates-panel">
          <div className="flex items-center justify-between gap-3">
            <h3 className={OPS_EYEBROW}>Illustrative estimates</h3>
            <button
              type="button"
              data-testid="operations-estimate-toggle-editor"
              aria-expanded={showEditor}
              onClick={() => setShowEditor((prev) => !prev)}
              className="-my-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-owl-goldText underline-offset-4 hover:underline"
            >
              <SlidersHorizontal size={13} aria-hidden="true" />
              {showEditor ? "Hide assumptions" : "Adjust"}
            </button>
          </div>
          <dl className="mt-1.5">
            <MetricRow
              label="Est. meal value"
              hint={`${formatUsd(resolved.usdPerServing)} per serving${resolved.isCustomized ? " (custom)" : ""}`}
            >
              <span data-testid="operations-estimate-usd">
                {formatUsd(resolved.equivalentMealValue)}
              </span>
            </MetricRow>
            <MetricRow
              label="Est. food recovered"
              hint={`${resolved.kgPerServing} kg per serving${resolved.isCustomized ? " (custom)" : ""}`}
            >
              <span data-testid="operations-estimate-kg">
                {formatKg(resolved.recoveredFoodKg)}
              </span>
            </MetricRow>
          </dl>

          {showEditor && (
            <div
              data-testid="operations-estimate-editor"
              className="mt-2 grid grid-cols-2 gap-3"
            >
              <label className="block space-y-1 text-xs font-semibold text-ink">
                USD per serving
                <input
                  type="number"
                  min={0}
                  max={MAX_ASSUMPTION_USD}
                  step={0.5}
                  data-testid="operations-estimate-usd-input"
                  value={resolved.usdPerServing}
                  onChange={(e) => {
                    const next = parseAssumption(
                      e.target.value,
                      MAX_ASSUMPTION_USD,
                    );
                    if (next !== undefined) setCustomUsd(next);
                  }}
                  className="consumer-input min-h-11 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-ink">
                kg per serving
                <input
                  type="number"
                  min={0}
                  max={MAX_ASSUMPTION_KG}
                  step={0.05}
                  data-testid="operations-estimate-kg-input"
                  value={resolved.kgPerServing}
                  onChange={(e) => {
                    const next = parseAssumption(
                      e.target.value,
                      MAX_ASSUMPTION_KG,
                    );
                    if (next !== undefined) setCustomKg(next);
                  }}
                  className="consumer-input min-h-11 py-2 text-sm tabular-nums"
                />
              </label>
              {resolved.isCustomized && (
                <button
                  type="button"
                  data-testid="operations-estimate-reset-button"
                  onClick={() => {
                    setCustomUsd(null);
                    setCustomKg(null);
                  }}
                  className="col-span-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-owl-goldText underline-offset-4 hover:underline"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Reset to {formatUsd(
                    estimates.meal_value_per_serving,
                  )} and {estimates.food_kg_per_serving} kg
                </button>
              )}
            </div>
          )}

          <div
            data-testid="operations-estimate-assumptions"
            className="mt-3 space-y-1 text-xs leading-relaxed text-ink-muted"
          >
            <p>
              Illustrative only, not measured. Based on{" "}
              {formatCount(resolved.recoveredServings)} recovered servings:{" "}
              {formatCount(resolved.studentPickups)} student pickups and{" "}
              {formatCount(resolved.simulatedPantryTransfers)} simulated pantry
              transfers.
            </p>
            {resolved.assumptions.map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
