"use client";

import React, { useMemo } from "react";
import { Tags } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  buildCategoriesChartModel,
  formatCount,
  formatPercent,
} from "../../lib/operations-helpers";
import type { OperationsCategory } from "../../lib/types/operations";

interface CategoriesChartProps {
  categories: ReadonlyArray<OperationsCategory>;
  isSimulated: boolean;
}

/**
 * Horizontal food-category breakdown powered by deterministic backend
 * classification of published listings in the active period.
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
      className="consumer-card flex flex-col justify-between gap-4"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="operations-categories-heading"
            className="text-base font-extrabold tracking-tight text-ink sm:text-lg"
          >
            Food Categories
          </h2>
          {isSimulated && (
            <span data-testid="operations-simulated-chip-categories">
              <StatusBadge tone="warning">Simulated data</StatusBadge>
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted">
          Deterministic classification of published food items across the
          selected window.
        </p>
      </div>

      {!model.hasData ? (
        <div
          data-testid="operations-categories-empty"
          className="flex min-h-[190px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-subtle/50 px-4 py-8 text-center"
        >
          <Tags
            size={28}
            strokeWidth={1.5}
            aria-hidden="true"
            className="text-ink-muted"
          />
          <p className="mt-2.5 text-sm font-bold text-ink">
            No food categories recorded
          </p>
          <p className="mt-1 max-w-xs text-xs text-ink-muted">
            Category totals appear automatically as hosts publish listings.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="sr-only">{model.accessibleSummary}</p>
          <ul className="space-y-3">
            {model.items.map((cat) => (
              <li
                key={cat.key}
                data-testid={`operations-category-row-${cat.key}`}
                className="space-y-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="font-bold text-ink">{cat.label}</span>
                  <span className="text-ink-muted tabular-nums">
                    <strong className="font-bold text-ink">
                      {formatCount(cat.totalOffered)}
                    </strong>{" "}
                    shared ·{" "}
                    <strong className="font-bold text-success">
                      {formatCount(cat.studentPickups)}
                    </strong>{" "}
                    pickups ({formatPercent(cat.recoveryPercent)})
                  </span>
                </div>

                <div
                  role="img"
                  aria-label={`${cat.label}: ${cat.totalOffered} servings shared, ${cat.studentPickups} student pickups, ${cat.pantryTransfers} simulated pantry transfers across ${cat.publishedListings} listings${isSimulated ? " (Simulated data)" : ""}`}
                  className="h-2.5 w-full overflow-hidden rounded-full bg-surface-subtle"
                >
                  <div
                    className="flex h-full overflow-hidden rounded-full bg-owl-gold transition-all"
                    style={{ width: `${Math.max(cat.barWidthPercent, 4)}%` }}
                  >
                    {cat.studentPickups > 0 && (
                      <div
                        className="h-full bg-[#15803d] dark:bg-[#4ade80]"
                        style={{ width: `${cat.recoveryPercent}%` }}
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-muted tabular-nums">
                  <span>
                    {formatCount(cat.publishedListings)}{" "}
                    {cat.publishedListings === 1 ? "listing" : "listings"}
                  </span>
                  {cat.pantryTransfers > 0 && (
                    <span>
                      {formatCount(cat.pantryTransfers)} pantry transfers (sim.)
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
