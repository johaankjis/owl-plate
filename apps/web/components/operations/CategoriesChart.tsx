"use client";

import React, { useMemo } from "react";
import { Tags } from "lucide-react";
import {
  buildCategoriesChartModel,
  formatCount,
  formatPercent,
} from "../../lib/operations-helpers";
import type { OperationsCategory } from "../../lib/types/operations";
import { OpsEmptyState } from "./OpsEmptyState";
import { OPS_CARD, OPS_HEADING } from "./styles";

interface CategoriesChartProps {
  categories: ReadonlyArray<OperationsCategory>;
  isSimulated: boolean;
}

/**
 * Food categories by servings shared, with the student pickup share drawn
 * inside each bar. Categories come from the backend classification.
 */
export function CategoriesChart({
  categories,
  isSimulated,
}: CategoriesChartProps) {
  const model = useMemo(
    () => buildCategoriesChartModel(categories, isSimulated),
    [categories, isSimulated],
  );

  return (
    <section
      aria-labelledby="operations-categories-heading"
      data-testid="operations-categories-chart"
      className={`${OPS_CARD} flex h-full flex-col gap-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="operations-categories-heading" className={OPS_HEADING}>
          Food categories
        </h2>
        <span className="text-xs text-ink-muted">Student pickups / shared</span>
      </div>

      {!model.hasData ? (
        <OpsEmptyState
          testId="operations-categories-empty"
          minHeightClass="min-h-[140px] flex-1"
          icon={<Tags size={28} strokeWidth={1.5} aria-hidden="true" />}
          title="No food categories recorded"
        />
      ) : (
        <ul className="space-y-3.5">
          <li className="sr-only">{model.accessibleSummary}</li>
          {model.items.map((cat) => (
            <li
              key={cat.key}
              data-testid={`operations-category-row-${cat.key}`}
              className="space-y-1.5"
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold text-ink">
                  {cat.label}
                </span>
                <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                  <strong className="font-bold text-success">
                    {formatCount(cat.studentPickups)}
                  </strong>{" "}
                  / {formatCount(cat.totalOffered)}
                  <span className="ml-1.5">
                    {formatPercent(cat.recoveryPercent)}
                  </span>
                </span>
              </div>
              <div
                role="img"
                aria-label={`${cat.label}: ${cat.totalOffered} servings shared, ${cat.studentPickups} student pickups, ${cat.pantryTransfers} simulated pantry transfers across ${cat.publishedListings} ${cat.publishedListings === 1 ? "listing" : "listings"}${isSimulated ? " (Simulated data)" : ""}`}
                className="h-2 w-full overflow-hidden rounded-full bg-surface-subtle"
              >
                <div
                  className="h-full overflow-hidden rounded-full bg-owl-gold/70 transition-[width] duration-500"
                  style={{ width: `${Math.max(cat.barWidthPercent, 3)}%` }}
                >
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${cat.recoveryPercent}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
