"use client";

import React, { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { cellToLatLng, gridDisk } from "h3-js";
import type { PersonaDecision } from "../lib/types/api";

interface DispatchMapProps {
  originCell: string;
  ringK: number;
  personas: PersonaDecision[];
}

interface HexCellDatum {
  hex: string;
  isOrigin: boolean;
}

interface PersonaMapPoint {
  label: string;
  isSimulated: true;
  status: string;
  reasonCodes: string[];
  ringDistance: number | null;
  position: [number, number]; // [lng, lat]
}

function statusToRgba(status: string): [number, number, number, number] {
  switch (status) {
    case "claimed":
    case "picked_up":
      return [16, 185, 129, 240]; // emerald
    case "sent":
      return [253, 187, 48, 245]; // owl gold
    case "excluded":
    case "declined":
    case "expired":
      return [244, 63, 94, 220]; // rose
    default:
      return [148, 163, 184, 210]; // slate
  }
}

export function DispatchMap({ originCell, ringK, personas }: DispatchMapProps) {
  const [webglError, setWebglError] = useState<string | null>(null);

  const originLatLng = useMemo<[number, number]>(() => {
    try {
      const [lat, lng] = cellToLatLng(originCell);
      return [lat, lng];
    } catch {
      return [0.0, 0.0];
    }
  }, [originCell]);

  const hexData = useMemo<HexCellDatum[]>(() => {
    try {
      const k = Math.min(12, Math.max(1, ringK));
      const cells = gridDisk(originCell, k);
      return cells.map((hex) => ({
        hex,
        isOrigin: hex === originCell,
      }));
    } catch {
      return [{ hex: originCell, isOrigin: true }];
    }
  }, [originCell, ringK]);

  const personaPoints = useMemo<PersonaMapPoint[]>(() => {
    return personas.map((p, idx) => {
      let lat = originLatLng[0];
      let lng = originLatLng[1];
      if (p.h3_cell) {
        try {
          const coords = cellToLatLng(p.h3_cell);
          lat = coords[0];
          lng = coords[1];
        } catch {
          // fallback offset
        }
      }
      // Small deterministic visual jitter when two simulated personas share a cell
      const angle = (idx * 2 * Math.PI) / Math.max(1, personas.length);
      const offset = 0.00012 * (idx + 1);
      return {
        label: `${p.label} [SIM]`,
        isSimulated: true,
        status: p.status,
        reasonCodes: p.reason_codes,
        ringDistance: p.ring_distance,
        position: [lng + Math.cos(angle) * offset, lat + Math.sin(angle) * offset],
      };
    });
  }, [personas, originLatLng]);

  const initialViewState = useMemo(
    () => ({
      longitude: originLatLng[1],
      latitude: originLatLng[0],
      zoom: 16.2,
      pitch: 30,
      bearing: 0,
    }),
    [originLatLng]
  );

  const layers = useMemo(() => {
    const h3Layer = new H3HexagonLayer<HexCellDatum>({
      id: "h3-wave-ring-layer",
      data: hexData,
      pickable: true,
      wireframe: true,
      filled: true,
      extruded: false,
      getHexagon: (d) => d.hex,
      getFillColor: (d) =>
        d.isOrigin ? [253, 187, 48, 120] : [56, 189, 248, 45],
      getLineColor: (d) =>
        d.isOrigin ? [253, 187, 48, 255] : [148, 163, 184, 150],
      lineWidthMinPixels: 1.5,
    });

    const scatterLayer = new ScatterplotLayer<PersonaMapPoint>({
      id: "simulated-personas-scatter",
      data: personaPoints,
      pickable: true,
      stroked: true,
      filled: true,
      radiusMinPixels: 11,
      radiusMaxPixels: 18,
      lineWidthMinPixels: 2,
      getPosition: (d) => d.position,
      getFillColor: (d) => statusToRgba(d.status),
      getLineColor: [255, 255, 255, 230],
    });

    const labelLayer = new TextLayer<PersonaMapPoint>({
      id: "simulated-personas-labels",
      data: personaPoints,
      pickable: false,
      getPosition: (d) => d.position,
      getText: (d) => d.label,
      getSize: 12,
      getColor: [255, 255, 255, 255],
      getPixelOffset: [0, -20],
      background: true,
      getBackgroundColor: [18, 18, 20, 210],
      backgroundPadding: [4, 2],
    });

    return [h3Layer, scatterLayer, labelLayer];
  }, [hexData, personaPoints]);

  return (
    <div
      data-testid="dispatch-h3-map-container"
      className="relative h-[420px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
    >
      {/* Top Overlay: Explicit Arbitrary Coordinates & H3 Layer Legend */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
        <div
          data-testid="arbitrary-coordinates-banner"
          className="rounded-lg border border-amber-500/40 bg-owl-black/90 px-3 py-1.5 text-xs text-amber-200 shadow"
        >
          <strong>Simulated Venue (Unverified Placeholder Coordinates):</strong>{" "}
          Origin cell <code className="text-owl-gold">{originCell}</code> (lat{" "}
          {originLatLng[0].toFixed(4)}, lng {originLatLng[1].toFixed(4)}) — H3 res 11{" "}
          <code>grid_disk(origin, k={ringK})</code> ({hexData.length} cells)
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-owl-black/90 px-3 py-1.5 text-[11px] text-zinc-200">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-owl-gold" /> Sent Invite
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Claimed / Held
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Excluded / Expired
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Outside Ring / Standby
          </span>
        </div>
      </div>

      {/* DeckGL H3HexagonLayer Canvas */}
      {!webglError ? (
        <DeckGL
          initialViewState={initialViewState}
          controller={true}
          layers={layers}
          onError={(err: Error) => setWebglError(err.message)}
          style={{ position: "relative", width: "100%", height: "100%" }}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center text-xs text-zinc-400">
          Deck.gl WebGL fallback view active ({webglError}). H3 origin{" "}
          {originCell}, ring k={ringK} ({hexData.length} H3 cells).
        </div>
      )}

      {/* Bottom Overlay: Distinct Simulated Marker Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-owl-black/90 px-3 py-2 text-[11px] text-zinc-300">
        <span>
          <strong>Deck.gl H3HexagonLayer + Simulated Persona Markers:</strong>{" "}
          Every marker represents a synthetic persona (<code>is_simulated = true</code>) labeled with{" "}
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-owl-gold">
            [SIM]
          </span>
          .
        </span>
        <span className="text-zinc-400">
          Priority tiers are never exposed on the projector.
        </span>
      </div>
    </div>
  );
}
