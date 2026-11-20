"use client";

import React, { useMemo, useState } from "react";
import { CheckCircle2, PieChart } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  buildOutcomesBreakdown,
  formatCount,
  formatPercent,
  type OutcomeBucketKey,
} from "../../lib/operations-helpers";
import type { OperationsOutcomes } from "../../lib/types/operations";

interface OutcomesDonutChartProps {
  outcomes: OperationsOutcomes;
  totalOffered: number;
  isSimulated: boolean;
}

const RADIUS = 64;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Accessible six-bucket serving outcomes SVG donut chart reconciling all
 * offered servings across available, student reserved, student pickups,
 * simulated pantry reserved, simulated pantry transfers, and expired unclaimed.
 */
export function OutcomesDonutChart({
  outcomes,
  totalOffered,
  isSimulated,
}: OutcomesDonutChartProps) {
  const model = useMemo(
    () => buildOutcomesBreakdown(outcomes, totalOffered, isSimulated),
    [outcomes, totalOffered, isSimulated],
  );
  const [hoveredKey, setHoveredKey] = useState<OutcomeBucketKey | null>(null);

  const activeBucket = hoveredKey
    ? (model.buckets.find((b) => b.key === hoveredKey) ?? null)
    : null;

  return (
    <section
      aria-labelledby="operations-outcomes-heading"
      data-testid="operations-outcomes-chart"
      className="consumer-card flex flex-col justify-between gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="operations-outcomes-heading"
              className="text-base font-extrabold tracking-tight text-ink sm:text-lg"
            >
              Reconciled Serving Outcomes
            </h2>
            {isSimulated && (
              <span data-testid="operations-simulated-chip-outcomes">
                <StatusBadge tone="warning">Simulated data</StatusBadge>
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            Every offered serving maps to exactly one current or terminal state.
          </p>
        </div>

        <span
          data-testid="operations-outcomes-reconciliation"
          className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2.5 py-1 text-[11px] font-semibold text-ink-muted tabular-nums"
        >
          <CheckCircle2
            size={12}
            aria-hidden="true"
            className={model.isReconciled ? "text-success" : "text-warning"}
          />
          {formatCount(model.bucketSum)} / {formatCount(model.totalOffered)}{" "}
          reconciled
        </span>
      </div>

      {model.isEmpty ? (
        <div
          data-testid="operations-outcomes-empty"
          className="flex min-h-[210px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-subtle/50 px-4 py-8 text-center"
        >
          <PieChart
            size={28}
            strokeWidth={1.5}
            aria-hidden="true"
            className="text-ink-muted"
          />
          <p className="mt-2.5 text-sm font-bold text-ink">
            No servings offered in this period
          </p>
          <p className="mt-1 max-w-xs text-xs text-ink-muted">
            Once hosts publish campus food drops, the six-bucket serving
            reconciliation appears here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-12">
          {/* SVG Donut */}
          <figure className="flex flex-col items-center justify-center sm:col-span-5">
            <div className="relative h-44 w-44">
              <svg
                role="img"
                aria-label={model.accessibleSummary}
                data-testid="operations-outcomes-svg"
                viewBox="0 0 160 160"
                className="h-full w-full -rotate-90"
              >
                <circle
                  cx="80"
                  cy="80"
                  r={RADIUS}
                  fill="none"
                  stroke="var(--owl-surface-subtle)"
                  strokeWidth="22"
                />
                {model.buckets
                  .filter((b) => b.count > 0)
                  .map((bucket) => {
                    const segLength = bucket.fraction * CIRCUMFERENCE;
                    const offset = -bucket.startFraction * CIRCUMFERENCE;
                    const dimmed =
                      hoveredKey !== null && hoveredKey !== bucket.key;
                    return (
                      <circle
                        key={bucket.key}
                        cx="80"
                        cy="80"
                        r={RADIUS}
                        fill="none"
                        stroke={bucket.color}
                        strokeWidth={hoveredKey === bucket.key ? "25" : "22"}
                        strokeDasharray={`${segLength} ${CIRCUMFERENCE}`}
                        strokeDashoffset={offset}
                        opacity={dimmed ? 0.35 : 1}
                        className="cursor-pointer transition-all"
                        onMouseEnter={() => setHoveredKey(bucket.key)}
                        onMouseLeave={() => setHoveredKey(null)}
                      />
                    );
                  })}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
                <span
                  data-testid="operations-outcomes-total"
                  className="text-2xl font-extrabold text-ink tabular-nums"
                >
                  {activeBucket
                    ? formatCount(activeBucket.count)
                    : formatCount(model.bucketSum)}
                </span>
                <span className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-tight text-ink-muted">
                  {activeBucket
                    ? `${activeBucket.shortLabel} (${formatPercent(activeBucket.percent)})`
                    : "Total servings"}
                </span>
                {isSimulated && (
                  <span className="mt-0.5 text-[10px] font-bold text-warning">
                    Simulated
                  </span>
                )}
              </div>
            </div>
            <figcaption className="sr-only">
              {model.accessibleSummary}
            </figcaption>
          </figure>

          {/* Accessible 6-bucket textual breakdown */}
          <ul className="space-y-1.5 sm:col-span-7">
            {model.buckets.map((bucket) => {
              const active = hoveredKey === bucket.key;
              return (
                <li key={bucket.key}>
                  <button
                    type="button"
                    data-testid={`operations-outcomes-bucket-${bucket.key}`}
                    onMouseEnter={() => setHoveredKey(bucket.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onFocus={() => setHoveredKey(bucket.key)}
                    onBlur={() => setHoveredKey(null)}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-1.5 text-left text-xs transition ${
                      active
                        ? "bg-surface-subtle text-ink"
                        : "hover:bg-surface-subtle/60"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${bucket.swatchClass}`}
                      />
                      <span className="truncate font-semibold text-ink">
                        {bucket.label}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold text-ink tabular-nums">
                      {formatCount(bucket.count)}{" "}
                      <span className="font-medium text-ink-muted">
                        ({formatPercent(bucket.percent)})
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
