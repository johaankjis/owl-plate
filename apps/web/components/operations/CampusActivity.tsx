"use client";

import React, { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import {
  buildCampusMapModel,
  formatCount,
  type CampusMapMarker,
} from "../../lib/operations-helpers";
import type { OperationsBuilding } from "../../lib/types/operations";
import { OpsEmptyState } from "./OpsEmptyState";
import { OPS_CARD, OPS_HEADING, OPS_SWATCH } from "./styles";

interface CampusActivityProps {
  buildings: ReadonlyArray<OperationsBuilding>;
  isSimulated: boolean;
}

const MAP_WIDTH = 360;
const MAP_HEIGHT = 230;
const RING_WIDTH = 5;

function describeMarker(marker: CampusMapMarker): string {
  return [
    `${formatCount(marker.totalOffered)} shared`,
    `${formatCount(marker.studentPickups)} student pickups`,
    `${formatCount(marker.availableServings)} available`,
    `${formatCount(marker.studentReservedServings)} held`,
    `${formatCount(marker.expiredUnclaimedServings)} expired`,
    `${formatCount(marker.pantryTransfers)} pantry transfers and ${formatCount(marker.pantryReservedServings)} pantry reserved (simulated)`,
    `${formatCount(marker.publishedListings)} ${marker.publishedListings === 1 ? "listing" : "listings"}, ${formatCount(marker.activeListings)} active`,
  ].join(" · ");
}

/**
 * Schematic campus view: each verified building is a ring placed by its
 * registry coordinates, sized by servings shared and filled by the share that
 * students picked up. The ranked list below carries the same buildings by name.
 */
export function CampusActivity({
  buildings,
  isSimulated,
}: CampusActivityProps) {
  const model = useMemo(
    () =>
      buildCampusMapModel(buildings, 8, isSimulated, {
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
      }),
    [buildings, isSimulated],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    model.markers.find((marker) => marker.id === selectedId) ??
    model.markers[0] ??
    null;

  return (
    <section
      aria-labelledby="operations-buildings-heading"
      data-testid="operations-buildings-chart"
      className={`${OPS_CARD} flex h-full flex-col gap-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="operations-buildings-heading" className={OPS_HEADING}>
          Across campus
        </h2>
        <span className="flex items-center gap-3 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${OPS_SWATCH.shared}`}
            />
            Shared
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${OPS_SWATCH.pickups}`}
            />
            Student pickups
          </span>
        </span>
      </div>

      {!model.hasData ? (
        <OpsEmptyState
          testId="operations-buildings-empty"
          minHeightClass="min-h-[280px] flex-1"
          icon={<Building2 size={28} strokeWidth={1.5} aria-hidden="true" />}
          title="No building activity in this period"
        />
      ) : (
        <>
          <figure className="overflow-hidden rounded-2xl bg-surface-subtle/60">
            <svg
              role="img"
              aria-label={`Schematic campus layout. ${model.accessibleSummary}`}
              data-testid="operations-campus-map"
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              className="h-auto w-full"
            >
              <defs>
                <pattern
                  id="operations-campus-grid"
                  width="18"
                  height="18"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1.5" cy="1.5" r="1" fill="var(--owl-border)" />
                </pattern>
              </defs>
              <rect
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                fill="url(#operations-campus-grid)"
              />
              {model.markers.map((marker) => {
                const ringRadius = marker.radius - RING_WIDTH / 2;
                const circumference = 2 * Math.PI * ringRadius;
                const share = Math.min(
                  1,
                  Math.max(0, marker.studentPickupSharePercent / 100),
                );
                const isSelected = selected?.id === marker.id;
                return (
                  <g
                    key={marker.id}
                    data-testid={`operations-campus-marker-${marker.id}`}
                    onMouseEnter={() => setSelectedId(marker.id)}
                    onClick={() => setSelectedId(marker.id)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={marker.x}
                      cy={marker.y}
                      r={marker.radius}
                      fill="var(--owl-surface)"
                      stroke={isSelected ? "var(--owl-ink)" : "transparent"}
                      strokeWidth={1.5}
                    />
                    <circle
                      cx={marker.x}
                      cy={marker.y}
                      r={ringRadius}
                      fill="none"
                      stroke="var(--owl-gold)"
                      strokeOpacity={0.55}
                      strokeWidth={RING_WIDTH}
                    />
                    {share > 0 && (
                      <circle
                        cx={marker.x}
                        cy={marker.y}
                        r={ringRadius}
                        fill="none"
                        stroke="var(--owl-success)"
                        strokeWidth={RING_WIDTH}
                        strokeLinecap={share < 1 ? "round" : "butt"}
                        strokeDasharray={`${share * circumference} ${circumference}`}
                        transform={`rotate(-90 ${marker.x} ${marker.y})`}
                      />
                    )}
                    <text
                      x={marker.x}
                      y={marker.y + 4}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="800"
                      fill="var(--owl-ink)"
                    >
                      {marker.rank}
                    </text>
                    {marker.activeListings > 0 && (
                      <circle
                        cx={marker.x + marker.radius * 0.72}
                        cy={marker.y - marker.radius * 0.72}
                        r={4.5}
                        fill="var(--owl-gold)"
                        stroke="var(--owl-surface)"
                        strokeWidth={2}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
            <figcaption className="sr-only">
              {model.accessibleSummary}
            </figcaption>
          </figure>

          {selected && (
            <p
              data-testid="operations-campus-detail"
              aria-live="polite"
              className="text-xs leading-relaxed text-ink-muted"
            >
              <strong className="font-bold text-ink">{selected.name}</strong>
              {isSimulated ? " · Simulated data" : ""}
              <br />
              {describeMarker(selected)}
            </p>
          )}

          <ol className="-mx-2 grid gap-x-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {model.markers.map((marker) => {
              const isSelected = selected?.id === marker.id;
              return (
                <li key={marker.id}>
                  <button
                    type="button"
                    data-testid={`operations-building-row-${marker.id}`}
                    aria-pressed={isSelected}
                    aria-label={`${marker.rank}. ${marker.name}: ${describeMarker(marker)}`}
                    onMouseEnter={() => setSelectedId(marker.id)}
                    onFocus={() => setSelectedId(marker.id)}
                    onClick={() => setSelectedId(marker.id)}
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left text-sm transition ${
                      isSelected ? "bg-surface-subtle" : ""
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-owl-goldTint text-[11px] font-extrabold text-owl-goldText tabular-nums">
                      {marker.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {marker.name}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                      <strong className="font-bold text-success">
                        {formatCount(marker.studentPickups)}
                      </strong>{" "}
                      / {formatCount(marker.totalOffered)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
