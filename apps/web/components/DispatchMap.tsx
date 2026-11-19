"use client";

import React, { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import { TONE_RGBA, describeStatus, type Tone } from "./presenter/labels";
import type { BuildingDistribution } from "../lib/types/api";
import { isVerifiedBuilding } from "../lib/buildings";

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

const H3_RESOLUTION = 11;

const SEEDED_LEGEND: Array<[string, string]> = [
  ["bg-owl-gold", "Invited"],
  ["bg-emerald-500", "Claimed"],
  ["bg-rose-500", "Skipped"],
  ["bg-zinc-500", "Expired / declined"],
  ["bg-slate-400", "Not invited yet"],
];

const CAMPUS_FEED_LEGEND: Array<[string, string]> = [
  ["bg-emerald-500", "Available servings"],
  ["bg-owl-gold", "Held / claimed out"],
];

export function DispatchMap({
  originCell,
  ringK,
  participants,
  campusBuildingName = null,
  distributionMode = "seeded_waves",
  buildingDistributions = [],
}: DispatchMapProps) {
  const [webglError, setWebglError] = useState<string | null>(null);
  const isCampusFeed = distributionMode === "campus_feed";

  const campusHostCells = useMemo<
    Array<{
      hex: string;
      label: string;
      position: [number, number];
      tone: Tone;
      verified: boolean;
    }>
  >(() => {
    if (!isCampusFeed) return [];
    return buildingDistributions.map((b, idx) => {
      const building = b.building;
      let hex = originCell;
      let lat = 0;
      let lng = 0;
      let verified = false;

      if (building && isVerifiedBuilding(building)) {
        verified = true;
        lat = building.latitude;
        lng = building.longitude;
        try {
          hex = latLngToCell(lat, lng, H3_RESOLUTION);
        } catch {
          hex = originCell;
        }
      } else {
        try {
          [lat, lng] = cellToLatLng(originCell);
        } catch {
          lat = 0;
          lng = 0;
        }
        // Deterministic offset for multiple unverified rehearsal locations
        if (idx > 0) {
          const angle =
            (idx * 2 * Math.PI) / Math.max(1, buildingDistributions.length);
          lng += Math.cos(angle) * 0.0002;
          lat += Math.sin(angle) * 0.0002;
        }
      }

      const name = building?.name?.trim() || b.building_code;
      const label = `${name} (${b.counts.available}/${b.counts.total} left)`;
      const tone: Tone = b.counts.available > 0 ? "claimed" : "invited";

      return {
        hex,
        label,
        position: [lng, lat],
        tone,
        verified,
      };
    });
  }, [isCampusFeed, buildingDistributions, originCell]);

  const originLatLng = useMemo<[number, number]>(() => {
    if (isCampusFeed) {
      const firstVerified = campusHostCells.find((c) => c.verified);
      if (firstVerified) {
        return [firstVerified.position[1], firstVerified.position[0]];
      }
    }
    try {
      const [lat, lng] = cellToLatLng(originCell);
      return [lat, lng];
    } catch {
      return [0, 0];
    }
  }, [isCampusFeed, campusHostCells, originCell]);

  const hexData = useMemo<HexCellDatum[]>(() => {
    if (isCampusFeed) {
      if (campusHostCells.length === 0) {
        return [{ hex: originCell, isOrigin: true }];
      }
      const uniqueHexes = Array.from(
        new Set(campusHostCells.map((c) => c.hex)),
      );
      return uniqueHexes.map((hex) => ({
        hex,
        isOrigin: true,
      }));
    }
    try {
      const k = Math.min(12, Math.max(1, ringK));
      return gridDisk(originCell, k).map((hex) => ({
        hex,
        isOrigin: hex === originCell,
      }));
    } catch {
      return [{ hex: originCell, isOrigin: true }];
    }
  }, [isCampusFeed, campusHostCells, originCell, ringK]);

  const points = useMemo<ParticipantPoint[]>(() => {
    if (isCampusFeed) {
      return campusHostCells.map((c) => ({
        label: c.label,
        tone: c.tone,
        position: c.position,
      }));
    }
    return participants.map((p, idx) => {
      let [lat, lng] = originLatLng;
      if (p.h3Cell) {
        try {
          [lat, lng] = cellToLatLng(p.h3Cell);
        } catch {
          // Keep the origin position for an unreadable cell.
        }
      }
      // Deterministic jitter keeps participants who share a cell readable.
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
  }, [isCampusFeed, campusHostCells, participants, originLatLng]);

  const initialViewState = useMemo(
    () => ({
      longitude: originLatLng[1],
      latitude: originLatLng[0],
      zoom: isCampusFeed && campusHostCells.length > 1 ? 15.2 : 16.2,
      pitch: 30,
      bearing: 0,
    }),
    [originLatLng, isCampusFeed, campusHostCells.length],
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

  const hasVerifiedCampusHost =
    Boolean(campusBuildingName) || campusHostCells.some((c) => c.verified);
  const legendItems = isCampusFeed ? CAMPUS_FEED_LEGEND : SEEDED_LEGEND;

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
          {isCampusFeed
            ? hasVerifiedCampusHost
              ? "Verified campus building H3 res-11 pickup points"
              : "Host pickup distribution · unverified placeholder coordinates"
            : `${
                campusBuildingName
                  ? `${campusBuildingName} · verified campus building point`
                  : "Simulated venue, unverified placeholder coordinates"
              } · search ring k = ${ringK}`}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-700 bg-owl-black/90 px-3 py-1.5 text-sm text-zinc-200">
          {legendItems.map(([color, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${color}`} /> {label}
            </span>
          ))}
        </div>
      </div>

      {webglError ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-base text-zinc-400">
          {isCampusFeed
            ? `Map unavailable in this browser (${webglError}). Host pickup distribution active.`
            : `Map unavailable in this browser (${webglError}). Ring k = ${ringK}.`}
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
        {isCampusFeed ? (
          "Cells mark host pickup buildings at H3 resolution 11. No student positions or locations are collected or plotted."
        ) : (
          <>
            Markers show selected buildings or synthetic rehearsal areas, with
            display offsets for readability. Seeded markers are simulated
            students labeled{" "}
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-owl-gold">
              [SIM]
            </span>
            .
          </>
        )}
      </div>
    </div>
  );
}
