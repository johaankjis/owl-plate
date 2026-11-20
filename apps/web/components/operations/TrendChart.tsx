"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  buildTrendChartModel,
  formatCount,
} from "../../lib/operations-helpers";
import type { OperationsSeriesPoint } from "../../lib/types/operations";
import { OpsEmptyState } from "./OpsEmptyState";
import { OPS_CARD, OPS_FILL, OPS_HEADING, OPS_SWATCH } from "./styles";

interface TrendChartProps {
  series: ReadonlyArray<OperationsSeriesPoint>;
  isSimulated: boolean;
}

const DEFAULT_WIDTH = 760;
const PAD_LEFT = 36;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 34;

/**
 * Tracks the rendered chart width so the SVG draws at one unit per pixel and
 * axis text stays the same readable size on phones and projectors.
 */
function useChartWidth(
  mounted: boolean,
): [React.RefObject<HTMLElement | null>, number] {
  const ref = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted]);
  return [ref, width];
}

/**
 * Daily servings shared (by publication date) beside student pickups (by
 * collection date). Simulated pantry transfers are a separate marker and are
 * never stacked onto student pickups.
 */
export function TrendChart({ series, isSimulated }: TrendChartProps) {
  const model = useMemo(
    () => buildTrendChartModel(series, isSimulated),
    [series, isSimulated],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [chartRef, viewWidth] = useChartWidth(model.hasData);
  const viewHeight = viewWidth < 520 ? 230 : 430;
  const plotWidth = Math.max(1, viewWidth - PAD_LEFT - PAD_RIGHT);
  const plotHeight = viewHeight - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + plotHeight;

  const activePoint =
    selectedIndex !== null ? (model.points[selectedIndex] ?? null) : null;

  const yPos = (value: number): number =>
    model.maxY <= 0 ? baseline : baseline - (value / model.maxY) * plotHeight;

  const stepX =
    model.points.length > 0 ? plotWidth / model.points.length : plotWidth;
  const barWidth = Math.max(6, Math.min(30, stepX * 0.26));
  const maxLabels = Math.max(2, Math.floor(plotWidth / 64));
  const labelEvery = Math.max(1, Math.ceil(model.points.length / maxLabels));

  const readout = activePoint
    ? {
        title: activePoint.fullDate,
        shared: activePoint.servingsOffered,
        pickups: activePoint.studentPickups,
        pantry: activePoint.pantryTransfers,
        listings: activePoint.publishedListings,
      }
    : {
        title: `${model.points.length} ${model.points.length === 1 ? "day" : "days"} in view`,
        shared: model.totals.servingsOffered,
        pickups: model.totals.studentPickups,
        pantry: model.totals.pantryTransfers,
        listings: model.totals.publishedListings,
      };

  return (
    <section
      aria-labelledby="operations-trend-heading"
      data-testid="operations-trend-chart"
      className={`${OPS_CARD} flex h-full flex-col gap-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="operations-trend-heading" className={OPS_HEADING}>
          Shared and collected by day
        </h2>
        <span className="text-xs text-ink-muted">
          Event dates, Eastern Time
        </span>
      </div>

      {!model.hasData ? (
        <OpsEmptyState
          testId="operations-trend-empty"
          minHeightClass="min-h-[280px] flex-1"
          icon={<CalendarDays size={28} strokeWidth={1.5} aria-hidden="true" />}
          title="No dated food rescue activity in this period"
        />
      ) : (
        <>
          <div
            data-testid="operations-trend-tooltip"
            aria-live="polite"
            className="flex flex-wrap items-end gap-x-8 gap-y-2"
          >
            <div className="w-full">
              <div
                data-testid="operations-trend-summary"
                className="text-xs font-semibold text-ink-muted"
              >
                {readout.title}
                {isSimulated ? " · Simulated data" : ""}
              </div>
              <div className="mt-0.5 text-xs text-ink-muted tabular-nums">
                {formatCount(readout.listings)}{" "}
                {readout.listings === 1 ? "listing" : "listings"} published
              </div>
            </div>
            {[
              {
                label: "Shared",
                value: readout.shared,
                swatch: `rounded-sm ${OPS_SWATCH.shared}`,
              },
              {
                label: "Student pickups",
                value: readout.pickups,
                swatch: `rounded-sm ${OPS_SWATCH.pickups}`,
              },
              {
                label: "Pantry transfers (simulated)",
                value: readout.pantry,
                swatch: `rounded-full ${OPS_SWATCH.pantry}`,
              },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-2xl font-extrabold text-ink tabular-nums">
                  {formatCount(item.value)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 ${item.swatch}`}
                  />
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          <figure ref={chartRef} className="w-full">
            <svg
              role="img"
              aria-label={model.accessibleSummary}
              data-testid="operations-trend-svg"
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              width={viewWidth}
              height={viewHeight}
              className="block h-auto max-w-full overflow-visible"
            >
              {model.yTicks.map((tick) => {
                const y = yPos(tick);
                return (
                  <g key={tick}>
                    <line
                      x1={PAD_LEFT}
                      x2={viewWidth - PAD_RIGHT}
                      y1={y}
                      y2={y}
                      stroke="var(--owl-border)"
                      strokeOpacity={tick === 0 ? 1 : 0.6}
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_LEFT - 10}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="12"
                      fill="var(--owl-ink-muted)"
                      className="tabular-nums"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}

              {model.points.map((pt, idx) => {
                const center = PAD_LEFT + stepX * idx + stepX / 2;
                const isSelected = selectedIndex === idx;
                const showLabel = idx % labelEvery === 0;

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
                    <rect
                      x={PAD_LEFT + stepX * idx + 2}
                      y={PAD_TOP - 6}
                      width={Math.max(4, stepX - 4)}
                      height={plotHeight + 6}
                      rx={10}
                      fill={
                        isSelected ? "var(--owl-surface-subtle)" : "transparent"
                      }
                    />
                    {pt.servingsOffered > 0 && (
                      <rect
                        x={center - barWidth - 2}
                        y={yPos(pt.servingsOffered)}
                        width={barWidth}
                        height={baseline - yPos(pt.servingsOffered)}
                        rx={Math.min(5, barWidth / 2)}
                        fill="var(--owl-gold)"
                      />
                    )}
                    {pt.studentPickups > 0 && (
                      <rect
                        x={center + 2}
                        y={yPos(pt.studentPickups)}
                        width={barWidth}
                        height={baseline - yPos(pt.studentPickups)}
                        rx={Math.min(5, barWidth / 2)}
                        fill="var(--owl-success)"
                      />
                    )}
                    {pt.pantryTransfers > 0 && (
                      <circle
                        cx={center}
                        cy={yPos(pt.pantryTransfers)}
                        r={5.5}
                        stroke="var(--owl-surface)"
                        strokeWidth={2}
                        className={OPS_FILL.pantry}
                      />
                    )}
                    {showLabel && (
                      <text
                        x={center}
                        y={viewHeight - 10}
                        textAnchor="middle"
                        fontSize="12"
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
        </>
      )}
    </section>
  );
}
