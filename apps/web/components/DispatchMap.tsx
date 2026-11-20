"use client";

import React, { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { cellToLatLng, gridDisk } from "h3-js";
import { CampusMapCanvas, type CampusMapH3Cell } from "./CampusMapCanvas";
import { TONE_RGBA, describeStatus, type Tone } from "./presenter/labels";
import { isVerifiedBuilding } from "../lib/buildings";
import { buildProjectorCampusMapModel, type GeoPoint } from "../lib/campus-map";
import type { Building, BuildingDistribution } from "../lib/types/api";

/** One marker: a seeded simulated persona or a joined demo visitor. */
export interface MapParticipant {
  label: string;
  simulated: boolean;
  status: string;
  reasonCodes: string[];
  h3Cell: string | null;
}

interface DispatchMapProps {
  originCell: string;
  ringK: number;
  participants: MapParticipant[];
  campusBuildingName?: string | null;
  distributionMode?: "campus_feed" | "seeded_waves";
  buildingDistributions?: ReadonlyArray<BuildingDistribution>;
  referenceBuildings?: ReadonlyArray<Building>;
}

interface HexCellDatum {
  hex: string;
  isOrigin: boolean;
}

interface ParticipantPoint {
  label: string;
  tone: Tone;
  position: [number, number]; // [lng, lat]
}

const SEEDED_LEGEND: Array<[string, string]> = [
  ["bg-owl-gold", "Invited"],
  ["bg-emerald-500", "Claimed"],
  ["bg-rose-500", "Skipped"],
  ["bg-zinc-500", "Expired / declined"],
  ["bg-slate-400", "Not invited yet"],
];

const CAMPUS_FEED_LEGEND: Array<[string, string]> = [
  ["bg-emerald-500", "Available servings"],
  ["bg-amber-400", "Exhausted (reserved / collected)"],
];

/**
 * Campus-feed projector branch: plots exact verified pickup buildings and
 * H3 resolution-11 aggregates with zero student points, zero rings, and zero jitter.
 */
function CampusFeedProjectorMap({
  buildingDistributions,
  referenceBuildings,
}: {
  buildingDistributions: ReadonlyArray<BuildingDistribution>;
  referenceBuildings: ReadonlyArray<Building>;
}) {
  const model = useMemo(
    () => buildProjectorCampusMapModel(buildingDistributions),
    [buildingDistributions],
  );

  const h3Cells = useMemo<CampusMapH3Cell[]>(
    () =>
      model.verifiedNodes
        .filter((node): node is typeof node & { h3Cell: string } =>
          Boolean(node.h3Cell),
        )
        .map((node) => ({
          hex: node.h3Cell,
          fillRgba: node.hasAvailable
            ? [16, 185, 129, 130]
            : [245, 158, 11, 90],
          lineRgba: node.hasAvailable
            ? [52, 211, 153, 255]
            : [251, 191, 36, 225],
          status: node.hasAvailable ? "available" : "exhausted",
        })),
    [model.verifiedNodes],
  );

  const verifiedReferencePoints = useMemo<GeoPoint[]>(
    () =>
      referenceBuildings
        .filter((b) => isVerifiedBuilding(b))
        .map((b) => ({ latitude: b.latitude, longitude: b.longitude })),
    [referenceBuildings],
  );

  const fitPoints = useMemo<GeoPoint[]>(() => {
    if (model.verifiedNodes.length > 0) {
      return model.verifiedNodes.map((n) => ({
        latitude: n.latitude,
        longitude: n.longitude,
      }));
    }
    return verifiedReferencePoints;
  }, [model.verifiedNodes, verifiedReferencePoints]);

  const fitKey = useMemo(() => {
    if (model.verifiedNodes.length > 0) {
      return `projector:${model.verifiedNodes.map((n) => n.buildingCode).join("|")}`;
    }
    return `projector-campus:${verifiedReferencePoints.length}`;
  }, [model.verifiedNodes, verifiedReferencePoints.length]);

  const activeBuildingIds = useMemo(
    () => new Set(model.verifiedNodes.map((n) => n.building.id)),
    [model.verifiedNodes],
  );

  const hasVerifiedCampusHost = model.verifiedNodes.length > 0;

  return (
    <div data-testid="dispatch-h3-map-container" className="space-y-2">
      <CampusMapCanvas
        testIdPrefix="projector-map"
        viewportTestId="projector-campus-map-viewport"
        heightClassName="h-[520px]"
        fitPoints={fitPoints}
        fitKey={fitKey}
        referenceBuildings={referenceBuildings}
        excludedReferenceIds={activeBuildingIds}
        h3Cells={h3Cells}
        enableOsmTiles={true}
        topLeftOverlay={
          <div
            data-testid={
              hasVerifiedCampusHost
                ? "campus-coordinates-banner"
                : "arbitrary-coordinates-banner"
            }
            className="rounded-lg border border-amber-500/40 bg-owl-black/90 px-3 py-1.5 text-sm text-amber-200 shadow"
          >
            {hasVerifiedCampusHost
              ? "Verified Marietta pickup buildings · H3 res-11 aggregates"
              : model.unverifiedBuildings.length > 0
                ? "Unverified rehearsal drops active · not plotted on real campus"
                : "Marietta campus H3 res-11 pickup map · waiting for active drops"}
          </div>
        }
        topRightOverlay={
          <div
            data-testid="projector-map-legend"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-700 bg-owl-black/90 px-3 py-1.5 text-xs font-semibold text-zinc-200 shadow"
          >
            {CAMPUS_FEED_LEGEND.map(([color, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} /> {label}
              </span>
            ))}
          </div>
        }
        bottomOverlay={
          <div className="inline-block rounded-lg border border-zinc-800 bg-owl-black/90 px-3 py-1.5 text-xs text-zinc-300">
            H3 res-11 cells mark verified host pickup buildings only. No student
            positions, GPS, or rings. Real campus points do not imply live push
            or real people.
          </div>
        }
        emptyOverlay={
          model.verifiedNodes.length === 0 ? (
            <div
              data-testid="projector-map-empty-state"
              className="rounded-xl border border-zinc-700 bg-owl-black/95 px-5 py-4 text-center shadow-xl"
            >
              <div className="text-base font-extrabold text-white">
                {model.unverifiedBuildings.length > 0
                  ? "Unverified rehearsal drops are not plotted on Marietta campus"
                  : "No active pickup buildings plotted"}
              </div>
              <p className="mt-1 text-xs text-zinc-300">
                {model.unverifiedBuildings.length > 0
                  ? "See the building aggregate list alongside this map for rehearsal counts."
                  : "Verified host pickup buildings appear automatically every 2 seconds."}
              </p>
            </div>
          ) : undefined
        }
        renderProjectedOverlay={({ project, width, height }) => (
          <>
            {model.verifiedNodes.map((node) => {
              const { x, y } = project(node.latitude, node.longitude);
              if (x < -80 || x > width + 80 || y < -60 || y > height + 60) {
                return null;
              }
              const pantryHeld = node.counts.pantry_held ?? 0;
              const pantryTransferred = node.counts.pantry_transferred ?? 0;
              return (
                <div
                  key={node.buildingCode}
                  data-testid={`projector-map-building-${node.buildingCode}`}
                  data-building-id={node.buildingCode}
                  data-building-name={node.buildingName}
                  data-latitude={String(node.latitude)}
                  data-longitude={String(node.longitude)}
                  data-h3-cell={node.h3Cell ?? ""}
                  data-available={String(node.counts.available)}
                  data-reserved={String(node.counts.held)}
                  data-collected={String(node.counts.picked_up)}
                  data-pantry-held={String(pantryHeld)}
                  data-pantry-transferred={String(pantryTransferred)}
                  data-available-drops={String(node.availableDrops)}
                  data-active-drops={String(node.activeDrops)}
                  data-availability-status={
                    node.hasAvailable ? "available" : "exhausted"
                  }
                  style={{
                    left: `${x.toFixed(1)}px`,
                    top: `${y.toFixed(1)}px`,
                    transform: "translate(-50%, -100%)",
                  }}
                  className="pointer-events-none absolute z-20 flex flex-col items-center"
                >
                  <div
                    className={`rounded-xl border px-2.5 py-1.5 text-center shadow-lg ${
                      node.hasAvailable
                        ? "border-emerald-400/80 bg-owl-black/95 text-white"
                        : "border-amber-400/70 bg-owl-black/95 text-amber-100"
                    }`}
                  >
                    <div className="max-w-[180px] truncate text-xs font-extrabold">
                      {node.buildingName}
                    </div>
                    <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] font-bold">
                      <span
                        className={
                          node.hasAvailable
                            ? "text-emerald-400"
                            : "text-amber-300"
                        }
                      >
                        {node.counts.available} avail
                      </span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-owl-gold">
                        {node.counts.held} res
                      </span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-200">
                        {node.counts.picked_up} col
                      </span>
                    </div>
                    {(pantryHeld > 0 || pantryTransferred > 0) && (
                      <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] font-bold">
                        <span className="text-purple-300">
                          {pantryHeld} pantry res
                        </span>
                        <span className="text-zinc-500">·</span>
                        <span className="text-fuchsia-300">
                          {pantryTransferred} pantry xfer
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    aria-hidden="true"
                    className={`mt-1 h-3.5 w-3.5 rounded-full border-2 border-white shadow ${
                      node.hasAvailable ? "bg-emerald-500" : "bg-amber-400"
                    }`}
                  />
                </div>
              );
            })}
          </>
        )}
      />

      {/* Aggregate accessible text summary for screen readers & non-visual inspection */}
      <p
        data-testid="projector-map-accessible-summary"
        aria-live="polite"
        className="rounded-lg border border-zinc-800 bg-owl-slate px-4 py-2 text-xs text-zinc-300"
      >
        {model.accessibleSummary}
      </p>
    </div>
  );
}

export function DispatchMap({
  originCell,
  ringK,
  participants,
  campusBuildingName = null,
  distributionMode = "seeded_waves",
  buildingDistributions = [],
  referenceBuildings = [],
}: DispatchMapProps) {
  const [webglError, setWebglError] = useState<string | null>(null);

  const originLatLng = useMemo<[number, number]>(() => {
    try {
      const [lat, lng] = cellToLatLng(originCell);
      return [lat, lng];
    } catch {
      return [0, 0];
    }
  }, [originCell]);

  const hexData = useMemo<HexCellDatum[]>(() => {
    try {
      const k = Math.min(12, Math.max(1, ringK));
      return gridDisk(originCell, k).map((hex) => ({
        hex,
        isOrigin: hex === originCell,
      }));
    } catch {
      return [{ hex: originCell, isOrigin: true }];
    }
  }, [originCell, ringK]);

  const points = useMemo<ParticipantPoint[]>(() => {
    return participants.map((p, idx) => {
      let [lat, lng] = originLatLng;
      if (p.h3Cell) {
        try {
          [lat, lng] = cellToLatLng(p.h3Cell);
        } catch {
          // Keep the origin position for an unreadable cell.
        }
      }
      // Deterministic jitter keeps seeded rehearsal participants who share a cell readable.
      const angle = (idx * 2 * Math.PI) / Math.max(1, participants.length);
      const offset = 0.00012 * ((idx % 6) + 1);
      return {
        label: p.simulated ? `${p.label} [SIM]` : p.label,
        tone: describeStatus(p.status, p.reasonCodes).tone,
        position: [
          lng + Math.cos(angle) * offset,
          lat + Math.sin(angle) * offset,
        ],
      };
    });
  }, [participants, originLatLng]);

  const initialViewState = useMemo(
    () => ({
      longitude: originLatLng[1],
      latitude: originLatLng[0],
      zoom: 16.2,
      pitch: 30,
      bearing: 0,
    }),
    [originLatLng],
  );

  const layers = useMemo(
    () => [
      new H3HexagonLayer<HexCellDatum>({
        id: "h3-wave-ring-layer",
        data: hexData,
        pickable: false,
        wireframe: true,
        filled: true,
        extruded: false,
        getHexagon: (d) => d.hex,
        getFillColor: (d) =>
          d.isOrigin ? [253, 187, 48, 120] : [56, 189, 248, 45],
        getLineColor: (d) =>
          d.isOrigin ? [253, 187, 48, 255] : [148, 163, 184, 150],
        lineWidthMinPixels: 1.5,
      }),
      new ScatterplotLayer<ParticipantPoint>({
        id: "participants-scatter",
        data: points,
        stroked: true,
        filled: true,
        radiusMinPixels: 12,
        radiusMaxPixels: 20,
        lineWidthMinPixels: 2,
        getPosition: (d) => d.position,
        getFillColor: (d) => TONE_RGBA[d.tone],
        getLineColor: [255, 255, 255, 230],
      }),
      new TextLayer<ParticipantPoint>({
        id: "participants-labels",
        data: points,
        getPosition: (d) => d.position,
        getText: (d) => d.label,
        getSize: 16,
        getColor: [255, 255, 255, 255],
        getPixelOffset: [0, -24],
        background: true,
        getBackgroundColor: [18, 18, 20, 220],
        backgroundPadding: [5, 3],
      }),
    ],
    [hexData, points],
  );

  if (distributionMode === "campus_feed") {
    return (
      <CampusFeedProjectorMap
        buildingDistributions={buildingDistributions}
        referenceBuildings={referenceBuildings}
      />
    );
  }

  const hasVerifiedCampusHost = Boolean(campusBuildingName);

  return (
    <div
      data-testid="dispatch-h3-map-container"
      className="relative h-[560px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
    >
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
        <div
          data-testid={
            hasVerifiedCampusHost
              ? "campus-coordinates-banner"
              : "arbitrary-coordinates-banner"
          }
          className="rounded-lg border border-amber-500/40 bg-owl-black/90 px-3 py-1.5 text-sm text-amber-200"
        >
          {`${
            campusBuildingName
              ? `${campusBuildingName} · verified campus building point`
              : "Simulated venue, unverified placeholder coordinates"
          } · search ring k = ${ringK}`}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-700 bg-owl-black/90 px-3 py-1.5 text-sm text-zinc-200">
          {SEEDED_LEGEND.map(([color, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${color}`} /> {label}
            </span>
          ))}
        </div>
      </div>

      {webglError ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-base text-zinc-400">
          {`Map unavailable in this browser (${webglError}). Ring k = ${ringK}.`}
        </div>
      ) : (
        <DeckGL
          initialViewState={initialViewState}
          controller={true}
          layers={layers}
          onError={(err: Error) => setWebglError(err.message)}
          style={{ position: "relative", width: "100%", height: "100%" }}
        />
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-zinc-800 bg-owl-black/90 px-3 py-2 text-sm text-zinc-300">
        Markers show selected buildings or synthetic rehearsal areas, with
        display offsets for readability. Seeded markers are simulated students
        labeled{" "}
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-owl-gold">
          [SIM]
        </span>
        .
      </div>
    </div>
  );
}
