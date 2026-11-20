"use client";

import React, { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  buildTrendChartModel,
  formatCount,
} from "../../lib/operations-helpers";
import type { OperationsSeriesPoint } from "../../lib/types/operations";

interface TrendChartProps {
  series: ReadonlyArray<OperationsSeriesPoint>;
  isSimulated: boolean;
}

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 250;
const PAD_LEFT = 42;
const PAD_RIGHT = 18;
const PAD_TOP = 16;
const PAD_BOTTOM = 40;
const PLOT_WIDTH = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;

/**
 * Accessible SVG chart displaying actual-date servings shared (by listing
 * publication date) alongside student pickups (by actual collection date) and
 * explicitly labeled simulated pantry transfers.
 */
export function TrendChart({ series, isSimulated }: TrendChartProps) {
  const model = useMemo(
    () => buildTrendChartModel(series, isSimulated),
    [series, isSimulated],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const activePoint =
    selectedIndex !== null && model.points[selectedIndex]
      ? model.points[selectedIndex]!
      : null;

  const yPos = (value: number): number => {
    if (model.maxY <= 0) return PAD_TOP + PLOT_HEIGHT;
    return PAD_TOP + PLOT_HEIGHT - (value / model.maxY) * PLOT_HEIGHT;
  };

  const stepX =
    model.points.length > 0 ? PLOT_WIDTH / model.points.length : PLOT_WIDTH;
  const barWidth = Math.max(8, Math.min(26, stepX * 0.28));

  return (
    <section
      aria-labelledby="operations-trend-heading"
      data-testid="operations-trend-chart"
      className="consumer-card flex flex-col justify-between gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="operations-trend-heading"
              className="text-base font-extrabold tracking-tight text-ink sm:text-lg"
            >
              Publishing &amp; Collection by Actual Date
            </h2>
            {isSimulated && (
              <span data-testid="operations-simulated-chip-trend">
                <StatusBadge tone="warning">Simulated data</StatusBadge>
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            Grouped by actual event day in America/New_York — publication date
            for shared servings, collection date for student pickups.
          </p>
        </div>

        {/* Chart Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-owl-gold" />
            Shared
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#15803d] dark:bg-[#4ade80]" />
            Student pickups
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#9333ea] dark:bg-[#c084fc]" />
            Pantry (sim.)
          </span>
        </div>
      </div>

      {!model.hasData ? (
        <div
          data-testid="operations-trend-empty"
          className="flex min-h-[210px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-subtle/50 px-4 py-8 text-center"
        >
          <CalendarDays
            size={28}
            strokeWidth={1.5}
            aria-hidden="true"
            className="text-ink-muted"
          />
          <p className="mt-2.5 text-sm font-bold text-ink">
            No dated food rescue activity in this period
          </p>
          <p className="mt-1 max-w-sm text-xs text-ink-muted">
            Published servings and confirmed pickups will plot here on their
            actual America/New_York dates.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <figure className="w-full">
            <svg
              role="img"
              aria-label={model.accessibleSummary}
              data-testid="operations-trend-svg"
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              className="h-auto w-full overflow-visible"
            >
              {/* Horizontal Y gridlines & integer labels */}
              {model.yTicks.map((tick) => {
                const y = yPos(tick);
                return (
                  <g key={tick}>
                    <line
                      x1={PAD_LEFT}
                      x2={VIEW_WIDTH - PAD_RIGHT}
                      y1={y}
                      y2={y}
                      stroke="var(--owl-border)"
                      strokeDasharray={tick === 0 ? undefined : "3 3"}
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_LEFT - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="var(--owl-ink-muted)"
                      className="tabular-nums"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}

              {/* Grouped bars per actual date */}
              {model.points.map((pt, idx) => {
                const groupCenter = PAD_LEFT + stepX * idx + stepX / 2;
                const sharedHeight = Math.max(
                  0,
                  PAD_TOP + PLOT_HEIGHT - yPos(pt.servingsOffered),
                );
                const pickupHeight = Math.max(
                  0,
                  PAD_TOP + PLOT_HEIGHT - yPos(pt.studentPickups),
                );
                const pantryY = yPos(pt.pantryTransfers);
                const isSelected = selectedIndex === idx;
                const showXLabel =
                  model.points.length <= 8 ||
                  idx === 0 ||
                  idx === model.points.length - 1 ||
                  idx % Math.ceil(model.points.length / 7) === 0;

                return (
                  <g
                    key={pt.date}
                    tabIndex={0}
                    role="button"
                    aria-label={`${pt.fullDate}: ${pt.servingsOffered} shared, ${pt.studentPickups} student pickups, ${pt.pantryTransfers} simulated pantry transfers${isSimulated ? " (Simulated data)" : ""}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onMouseLeave={() => setSelectedIndex(null)}
                    onFocus={() => setSelectedIndex(idx)}
                    onBlur={() => setSelectedIndex(null)}
                    onClick={() =>
                      setSelectedIndex((prev) => (prev === idx ? null : idx))
                    }
                    className="cursor-pointer outline-none"
                  >
                    {/* Subtle hover/focus column highlight */}
                    <rect
                      x={PAD_LEFT + stepX * idx + 2}
                      y={PAD_TOP}
                      width={Math.max(4, stepX - 4)}
                      height={PLOT_HEIGHT}
                      rx={8}
                      fill={
                        isSelected ? "var(--owl-surface-subtle)" : "transparent"
                      }
                    />

                    {/* Servings shared bar (KSU Gold) */}
                    {pt.servingsOffered > 0 && (
                      <rect
                        x={groupCenter - barWidth - 1.5}
                        y={yPos(pt.servingsOffered)}
                        width={barWidth}
                        height={sharedHeight}
                        rx={4}
                        fill="var(--owl-gold)"
                      />
                    )}

                    {/* Student pickups bar (Success green) */}
                    {pt.studentPickups > 0 && (
                      <rect
                        x={groupCenter + 1.5}
                        y={yPos(pt.studentPickups)}
                        width={barWidth}
                        height={pickupHeight}
                        rx={4}
                        fill="var(--owl-success)"
                      />
                    )}

                    {/* Simulated pantry transfers dot */}
                    {pt.pantryTransfers > 0 && (
                      <circle
                        cx={groupCenter}
                        cy={pantryY}
                        r={5}
                        fill="#9333ea"
                        stroke="var(--owl-surface)"
                        strokeWidth={2}
                      />
                    )}

                    {/* X-axis date label */}
                    {showXLabel && (
                      <text
                        x={groupCenter}
                        y={VIEW_HEIGHT - 12}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight={isSelected ? "700" : "500"}
                        fill={
                          isSelected ? "var(--owl-ink)" : "var(--owl-ink-muted)"
                        }
                      >
                        {pt.shortDate}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <figcaption className="sr-only">
              {model.accessibleSummary}
            </figcaption>
          </figure>

          {/* Interactive day tooltip / textual totals readout */}
          <div
            data-testid="operations-trend-tooltip"
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface-subtle/60 px-3.5 py-2.5 text-xs text-ink-muted"
          >
            {activePoint ? (
              <>
                <span className="font-bold text-ink">
                  {activePoint.fullDate}
                  {isSimulated ? " · Simulated data" : ""}
                </span>
                <div className="flex flex-wrap items-center gap-3 tabular-nums">
                  <span>
                    Shared:{" "}
                    <strong className="text-ink">
                      {formatCount(activePoint.servingsOffered)}
                    </strong>
                  </span>
                  <span>
                    Student pickups:{" "}
                    <strong className="text-success">
                      {formatCount(activePoint.studentPickups)}
                    </strong>
                  </span>
                  <span>
                    Pantry (sim.):{" "}
                    <strong className="text-ink">
                      {formatCount(activePoint.pantryTransfers)}
                    </strong>
                  </span>
                  <span>
                    Listings:{" "}
                    <strong className="text-ink">
                      {formatCount(activePoint.publishedListings)}
                    </strong>
                  </span>
                </div>
              </>
            ) : (
              <>
                <span
                  data-testid="operations-trend-summary"
                  className="font-semibold text-ink"
                >
                  Window totals ({model.points.length}{" "}
                  {model.points.length === 1 ? "day" : "days"})
                  {isSimulated ? " · Simulated data" : ""}
                </span>
                <div className="flex flex-wrap items-center gap-3 tabular-nums">
                  <span>
                    Shared:{" "}
                    <strong className="text-ink">
                      {formatCount(model.totals.servingsOffered)}
                    </strong>
                  </span>
                  <span>
                    Student pickups:{" "}
                    <strong className="text-success">
                      {formatCount(model.totals.studentPickups)}
                    </strong>
                  </span>
                  <span>
                    Pantry (sim.):{" "}
                    <strong className="text-ink">
                      {formatCount(model.totals.pantryTransfers)}
                    </strong>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
