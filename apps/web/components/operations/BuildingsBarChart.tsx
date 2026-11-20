"use client";

import React, { useMemo } from "react";
import { Building2 } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  buildBuildingsChartModel,
  formatCount,
} from "../../lib/operations-helpers";
import type { OperationsBuilding } from "../../lib/types/operations";

interface BuildingsBarChartProps {
  buildings: ReadonlyArray<OperationsBuilding>;
  isSimulated: boolean;
}

/**
 * Horizontal bar breakdown of top verified campus buildings by servings shared
 * and collected, displaying only verified building names (never internal IDs).
 */
export function BuildingsBarChart({
  buildings,
  isSimulated,
}: BuildingsBarChartProps) {
  const model = useMemo(
    () => buildBuildingsChartModel(buildings, 8, isSimulated),
    [buildings, isSimulated],
  );

  return (
    <section
      aria-labelledby="operations-buildings-heading"
      data-testid="operations-buildings-chart"
      className="consumer-card flex flex-col justify-between gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="operations-buildings-heading"
              className="text-base font-extrabold tracking-tight text-ink sm:text-lg"
            >
              Top Campus Buildings
            </h2>
            {isSimulated && (
              <span data-testid="operations-simulated-chip-buildings">
                <StatusBadge tone="warning">Simulated data</StatusBadge>
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            Verified Marietta pickup locations ranked by student pickups, with
            simulated pantry transfers kept distinct.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-medium text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#15803d] dark:bg-[#4ade80]" />
            Pickups
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#9333ea] dark:bg-[#c084fc]" />
            Pantry (sim.)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-owl-gold" />
            Available / other
          </span>
        </div>
      </div>

      {!model.hasData ? (
        <div
          data-testid="operations-buildings-empty"
          className="flex min-h-[190px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-subtle/50 px-4 py-8 text-center"
        >
          <Building2
            size={28}
            strokeWidth={1.5}
            aria-hidden="true"
            className="text-ink-muted"
          />
          <p className="mt-2.5 text-sm font-bold text-ink">
            No building activity yet
          </p>
          <p className="mt-1 max-w-xs text-xs text-ink-muted">
            Verified Marietta Campus buildings appear here once listings are
            published in the selected window.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="sr-only">{model.accessibleSummary}</p>
          <ul className="space-y-3">
            {model.items.map((item) => (
              <li
                key={item.id}
                data-testid={`operations-building-row-${item.id}`}
                className="space-y-1.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <div className="min-w-0 font-bold text-ink">
                    <span className="break-words">{item.name}</span>
                    {item.shortCode && (
                      <span className="ml-1.5 rounded bg-surface-subtle px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
                        Bldg {item.shortCode}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-ink-muted tabular-nums">
                    <strong className="font-bold text-success">
                      {formatCount(item.studentPickups)}
                    </strong>{" "}
                    picked up ·{" "}
                    <strong className="font-bold text-ink">
                      {formatCount(item.totalOffered)}
                    </strong>{" "}
                    shared
                    {item.pantryTransfers > 0 && (
                      <span>
                        {" "}
                        · {formatCount(item.pantryTransfers)} pantry (sim.)
                      </span>
                    )}
                  </div>
                </div>

                {/* Scaled segmented horizontal bar */}
                <div
                  role="img"
                  aria-label={`${item.name}: ${item.studentPickups} student pickups, ${item.pantryTransfers} simulated pantry transfers, ${item.availableServings} available, ${item.totalOffered} total servings offered${isSimulated ? " (Simulated data)" : ""}`}
                  className="h-3 w-full overflow-hidden rounded-full bg-surface-subtle"
                >
                  <div
                    className="flex h-full overflow-hidden rounded-full bg-owl-gold/80 transition-all"
                    style={{ width: `${Math.max(item.barWidthPercent, 4)}%` }}
                  >
                    {item.studentPickups > 0 && (
                      <div
                        className="h-full bg-[#15803d] dark:bg-[#4ade80]"
                        style={{ width: `${item.studentPickupSharePercent}%` }}
                      />
                    )}
                    {item.pantryTransfers > 0 && (
                      <div
                        className="h-full bg-[#9333ea] dark:bg-[#c084fc]"
                        style={{ width: `${item.pantryTransferSharePercent}%` }}
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-muted tabular-nums">
                  <span>
                    {formatCount(item.publishedListings)}{" "}
                    {item.publishedListings === 1 ? "listing" : "listings"}
                  </span>
                  {item.activeListings > 0 && (
                    <span className="font-semibold text-owl-goldText">
                      {formatCount(item.activeListings)} active
                    </span>
                  )}
                  {item.availableServings > 0 && (
                    <span>{formatCount(item.availableServings)} available</span>
                  )}
                  {item.expiredUnclaimedServings > 0 && (
                    <span>
                      {formatCount(item.expiredUnclaimedServings)} expired
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
