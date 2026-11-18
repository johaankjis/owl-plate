"use client";

import React, { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { cellToLatLng, gridDisk } from "h3-js";
import { TONE_RGBA, describeStatus, type Tone } from "./presenter/labels";

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

const LEGEND: Array<[string, string]> = [
  ["bg-owl-gold", "Invited"],
  ["bg-emerald-500", "Claimed"],
  ["bg-rose-500", "Skipped"],
  ["bg-zinc-500", "Expired / declined"],
  ["bg-slate-400", "Not invited yet"],
];

export function DispatchMap({
  originCell,
  ringK,
  participants,
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

  const points = useMemo<ParticipantPoint[]>(
    () =>
      participants.map((p, idx) => {
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
      }),
    [participants, originLatLng],
  );

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

  return (
    <div
      data-testid="dispatch-h3-map-container"
      className="relative h-[560px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
    >
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
        <div
          data-testid="arbitrary-coordinates-banner"
          className="rounded-lg border border-amber-500/40 bg-owl-black/90 px-3 py-1.5 text-sm text-amber-200"
        >
          Simulated venue, unverified placeholder coordinates · search ring k ={" "}
          {ringK}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-700 bg-owl-black/90 px-3 py-1.5 text-sm text-zinc-200">
          {LEGEND.map(([color, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${color}`} /> {label}
            </span>
          ))}
        </div>
      </div>

      {webglError ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-base text-zinc-400">
          Map unavailable in this browser ({webglError}). Ring k = {ringK}.
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
        Visitor markers show nicknames at simulated demo areas. Seeded markers
        are simulated students labeled{" "}
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-owl-gold">
          [SIM]
        </span>
        .
      </div>
    </div>
  );
}
