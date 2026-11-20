"use client";

import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Compass, Maximize2, Minus, Plus } from "lucide-react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer, TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { isVerifiedBuilding } from "../lib/buildings";
import {
  computeH3BoundaryPoints,
  fitPointsToViewState,
  MAX_CAMPUS_MAP_ZOOM,
  MIN_CAMPUS_MAP_ZOOM,
  panViewStateByPixels,
  projectLatLngToViewport,
  selectNonOverlappingReferenceBuildings,
  zoomViewState,
  type CampusMapViewState,
  type GeoPoint,
  type ProjectedPoint,
} from "../lib/campus-map";
import { useTheme } from "../lib/theme";
import type { Building } from "../lib/types/api";

export interface CampusMapH3Cell {
  hex: string;
  fillRgba: [number, number, number, number];
  lineRgba: [number, number, number, number];
  status: "available" | "exhausted";
}

interface CampusMapCanvasProps {
  testIdPrefix: "campus-map" | "projector-map";
  viewportTestId: string;
  heightClassName?: string;
  fitPoints: ReadonlyArray<GeoPoint>;
  fitKey: string;
  referenceBuildings?: ReadonlyArray<Building>;
  excludedReferenceIds?: ReadonlySet<string>;
  h3Cells?: ReadonlyArray<CampusMapH3Cell>;
  enableOsmTiles?: boolean;
  topLeftOverlay?: React.ReactNode;
  topRightOverlay?: React.ReactNode;
  bottomOverlay?: React.ReactNode;
  emptyOverlay?: React.ReactNode;
  renderProjectedOverlay?: (ctx: {
    viewState: CampusMapViewState;
    width: number;
    height: number;
    project: (latitude: number, longitude: number) => ProjectedPoint;
  }) => React.ReactNode;
}

interface DeckBoundaryProps {
  onFail: (reason: string) => void;
  children: React.ReactNode;
}

interface DeckBoundaryState {
  failed: boolean;
}

/** Catches synchronous WebGL/luma initialization failures so the 2D fallback takes over cleanly. */
class DeckErrorBoundary extends Component<
  DeckBoundaryProps,
  DeckBoundaryState
> {
  constructor(props: DeckBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): DeckBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onFail(error.message || "WebGL initialization failed");
  }

  render(): React.ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function detectWebGLSupport(): { supported: boolean; reason: string | null } {
  if (typeof document === "undefined") {
    return { supported: false, reason: "Server render" };
  }
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false });
    if (!gl) {
      return { supported: false, reason: "WebGL context unavailable" };
    }
    return { supported: true, reason: null };
  } catch {
    return { supported: false, reason: "WebGL blocked or unsupported" };
  }
}

function rgbaToCss([r, g, b, a]: [number, number, number, number]): string {
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

const OSM_TILE_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function CampusMapCanvas({
  testIdPrefix,
  viewportTestId,
  heightClassName = "h-[380px] sm:h-[440px]",
  fitPoints,
  fitKey,
  referenceBuildings = [],
  excludedReferenceIds,
  h3Cells = [],
  enableOsmTiles = true,
  topLeftOverlay,
  topRightOverlay,
  bottomOverlay,
  emptyOverlay,
  renderProjectedOverlay,
}: CampusMapCanvasProps) {
  const { resolved } = useTheme();
  const isConsumerMap = testIdPrefix === "campus-map";
  const isDark = !isConsumerMap || resolved === "dark";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 400,
  });
  const [rendererMode, setRendererMode] = useState<"webgl" | "fallback-2d">(
    "fallback-2d",
  );
  const [webglReason, setWebglReason] = useState<string | null>(null);
  const [osmStatus, setOsmStatus] = useState<
    "disabled" | "loading" | "loaded" | "fallback"
  >(enableOsmTiles ? "loading" : "disabled");

  const osmFailedRef = useRef<boolean>(!enableOsmTiles);

  useEffect(() => {
    const check = detectWebGLSupport();
    if (check.supported) {
      setRendererMode("webgl");
      setWebglReason(null);
    } else {
      setRendererMode("fallback-2d");
      setWebglReason(check.reason ?? "WebGL unavailable");
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 80 && rect.height >= 80) {
        setSize((prev) =>
          Math.abs(prev.width - rect.width) < 1 &&
          Math.abs(prev.height - rect.height) < 1
            ? prev
            : {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
        );
      }
    };

    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const computedFitView = useMemo(
    () =>
      fitPointsToViewState(fitPoints, size.width, size.height, {
        paddingPx: size.width < 460 ? 48 : 68,
        minZoom: MIN_CAMPUS_MAP_ZOOM,
        maxZoom: 16.4,
        singlePointZoom: 16.0,
      }),
    [fitPoints, size.width, size.height],
  );

  const [viewState, setViewState] =
    useState<CampusMapViewState>(computedFitView);
  const lastFitKeyRef = useRef<string>("");

  // Re-fit automatically only when the set of plotted points or campus directory changes
  useEffect(() => {
    if (fitKey !== lastFitKeyRef.current) {
      lastFitKeyRef.current = fitKey;
      setViewState(computedFitView);
    }
  }, [fitKey, computedFitView]);

  const handleFitReset = useCallback(() => {
    setViewState(computedFitView);
  }, [computedFitView]);

  const handleZoomIn = useCallback(() => {
    setViewState((prev) => zoomViewState(prev, 0.6));
  }, []);

  const handleZoomOut = useCallback(() => {
    setViewState((prev) => zoomViewState(prev, -0.6));
  }, []);

  const handleDeckFail = useCallback((reason: string) => {
    setRendererMode("fallback-2d");
    setWebglReason(reason || "WebGL unavailable");
  }, []);

  const verifiedReferenceBuildings = useMemo(
    () => referenceBuildings.filter((b) => isVerifiedBuilding(b)),
    [referenceBuildings],
  );

  const excludedIds = useMemo(
    () => excludedReferenceIds ?? new Set<string>(),
    [excludedReferenceIds],
  );

  const visibleReferenceLabels = useMemo(
    () =>
      selectNonOverlappingReferenceBuildings(
        verifiedReferenceBuildings,
        excludedIds,
        viewState,
        size.width,
        size.height,
        size.width < 460 ? 84 : 104,
      ),
    [
      verifiedReferenceBuildings,
      excludedIds,
      viewState,
      size.width,
      size.height,
    ],
  );

  const project = useCallback(
    (latitude: number, longitude: number): ProjectedPoint =>
      projectLatLngToViewport(
        latitude,
        longitude,
        viewState,
        size.width,
        size.height,
      ),
    [viewState, size.width, size.height],
  );

  // 2D fallback pointer pan & pinch-zoom state
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const lastPinchDistRef = useRef<number | null>(null);

  const handleFallbackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (rendererMode !== "fallback-2d") return;
      if (
        e.target instanceof Element &&
        e.target.closest("button, a, input, select, textarea")
      ) {
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });
      lastPinchDistRef.current = null;
    },
    [rendererMode],
  );

  const handleFallbackPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (rendererMode !== "fallback-2d") return;
      const pointers = activePointersRef.current;
      const prev = pointers.get(e.pointerId);
      if (!prev) return;

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          setViewState((curr) => panViewStateByPixels(curr, dx, dy));
        }
      } else if (pointers.size >= 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
        if (lastPinchDistRef.current && dist > 10) {
          const ratio = dist / lastPinchDistRef.current;
          const zoomDelta = Math.log2(ratio);
          if (Math.abs(zoomDelta) > 0.005) {
            setViewState((curr) => zoomViewState(curr, zoomDelta));
          }
        }
        lastPinchDistRef.current = dist;
      }
    },
    [rendererMode],
  );

  const handleFallbackPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) {
        lastPinchDistRef.current = null;
      }
    },
    [],
  );

  const handleFallbackWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (rendererMode !== "fallback-2d") return;
      const delta = e.deltaY < 0 ? 0.35 : -0.35;
      setViewState((curr) => zoomViewState(curr, delta));
    },
    [rendererMode],
  );

  const deckLayers = useMemo(() => {
    if (rendererMode !== "webgl") return [];

    const layers: Array<
      | TileLayer<ImageBitmap | null>
      | H3HexagonLayer<CampusMapH3Cell>
      | ScatterplotLayer<Building>
      | TextLayer<{ building: Building; x: number; y: number }>
    > = [];

    if (enableOsmTiles && osmStatus !== "fallback") {
      layers.push(
        new TileLayer<ImageBitmap | null>({
          id: `${testIdPrefix}-osm-tiles`,
          minZoom: 12,
          maxZoom: 19,
          tileSize: 256,
          maxRequests: 4,
          getTileData: async ({ index, signal }) => {
            if (osmFailedRef.current) return null;
            const url = OSM_TILE_TEMPLATE.replace("{z}", String(index.z))
              .replace("{x}", String(index.x))
              .replace("{y}", String(index.y));
            const timeoutController = new AbortController();
            const timer = setTimeout(() => timeoutController.abort(), 3500);
            const onAbort = () => timeoutController.abort();
            signal?.addEventListener("abort", onAbort);
            try {
              const res = await fetch(url, {
                mode: "cors",
                signal: timeoutController.signal,
              });
              if (!res.ok) {
                osmFailedRef.current = true;
                setOsmStatus("fallback");
                return null;
              }
              const blob = await res.blob();
              if (typeof createImageBitmap !== "function") {
                osmFailedRef.current = true;
                setOsmStatus("fallback");
                return null;
              }
              const bitmap = await createImageBitmap(blob);
              setOsmStatus("loaded");
              return bitmap;
            } catch {
              if (!signal?.aborted) {
                osmFailedRef.current = true;
                setOsmStatus("fallback");
              }
              return null;
            } finally {
              clearTimeout(timer);
              signal?.removeEventListener("abort", onAbort);
            }
          },
          onTileError: () => {
            osmFailedRef.current = true;
            setOsmStatus("fallback");
          },
          renderSubLayers: (subProps) => {
            const { data: tileImage, ...restSubProps } = subProps;
            if (!tileImage) return null;
            const bbox = subProps.tile.bbox;
            if (!("west" in bbox)) return null;
            return new BitmapLayer(restSubProps, {
              data: undefined,
              image: tileImage,
              bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
              opacity: isDark ? 0.36 : 0.78,
            });
          },
        }),
      );
    }

    if (h3Cells.length > 0) {
      layers.push(
        new H3HexagonLayer<CampusMapH3Cell>({
          id: `${testIdPrefix}-h3-cells`,
          data: [...h3Cells],
          pickable: false,
          wireframe: true,
          filled: true,
          extruded: false,
          getHexagon: (d) => d.hex,
          getFillColor: (d) => d.fillRgba,
          getLineColor: (d) => d.lineRgba,
          lineWidthMinPixels: 2,
        }),
      );
    }

    if (verifiedReferenceBuildings.length > 0) {
      layers.push(
        new ScatterplotLayer<Building>({
          id: `${testIdPrefix}-reference-dots`,
          data: verifiedReferenceBuildings,
          pickable: false,
          filled: true,
          stroked: true,
          radiusMinPixels: 3,
          radiusMaxPixels: 5,
          lineWidthMinPixels: 1,
          getPosition: (b) => [b.longitude, b.latitude],
          getFillColor: isDark ? [148, 163, 184, 140] : [82, 85, 96, 150],
          getLineColor: isDark ? [226, 232, 240, 110] : [255, 255, 255, 210],
        }),
      );
    }

    if (visibleReferenceLabels.length > 0) {
      layers.push(
        new TextLayer<{ building: Building; x: number; y: number }>({
          id: `${testIdPrefix}-reference-labels`,
          data: visibleReferenceLabels,
          pickable: false,
          getPosition: (d) => [d.building.longitude, d.building.latitude],
          getText: (d) =>
            isConsumerMap
              ? d.building.name
              : d.building.building_code
                ? `${d.building.name} (${d.building.building_code})`
                : d.building.name,
          getSize: 11,
          getColor: isDark ? [203, 213, 225, 210] : [24, 25, 30, 220],
          getPixelOffset: [0, 12],
          background: true,
          getBackgroundColor: isDark ? [15, 23, 42, 185] : [255, 255, 255, 215],
          backgroundPadding: [5, 2],
        }),
      );
    }

    return layers;
  }, [
    rendererMode,
    enableOsmTiles,
    osmStatus,
    testIdPrefix,
    h3Cells,
    verifiedReferenceBuildings,
    visibleReferenceLabels,
    isDark,
    isConsumerMap,
  ]);

  // Projected H3 polygons for the 2D WebGL-free fallback SVG
  const projectedH3Polygons = useMemo(() => {
    if (rendererMode !== "fallback-2d" || h3Cells.length === 0) return [];
    return h3Cells
      .map((cell) => {
        const boundary = computeH3BoundaryPoints(cell.hex);
        if (boundary.length === 0) return null;
        const pointsAttr = boundary
          .map((pt) => {
            const p = project(pt.latitude, pt.longitude);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          })
          .join(" ");
        return { cell, pointsAttr };
      })
      .filter(
        (item): item is { cell: CampusMapH3Cell; pointsAttr: string } =>
          item !== null,
      );
  }, [rendererMode, h3Cells, project]);

  const projectedRefDots = useMemo(() => {
    if (rendererMode !== "fallback-2d") return [];
    return verifiedReferenceBuildings.map((b) => ({
      building: b,
      ...project(b.latitude, b.longitude),
    }));
  }, [rendererMode, verifiedReferenceBuildings, project]);

  const controlSurfaceClass = isConsumerMap
    ? "border-line bg-surface/95 text-ink hover:border-owl-gold hover:text-owl-goldText"
    : "border-zinc-700 bg-owl-black/90 text-zinc-100 hover:border-owl-gold hover:text-owl-gold";

  const pillSurfaceClass = isConsumerMap
    ? "border-line bg-surface/90 text-ink-muted"
    : "border-zinc-700 bg-owl-black/90 text-zinc-300";

  return (
    <div
      ref={containerRef}
      data-testid={viewportTestId}
      data-renderer={rendererMode}
      data-center-lat={viewState.latitude.toFixed(6)}
      data-center-lng={viewState.longitude.toFixed(6)}
      data-zoom={viewState.zoom.toFixed(2)}
      onPointerDown={handleFallbackPointerDown}
      onPointerMove={handleFallbackPointerMove}
      onPointerUp={handleFallbackPointerEnd}
      onPointerCancel={handleFallbackPointerEnd}
      onWheel={handleFallbackWheel}
      className={`relative w-full select-none overflow-hidden rounded-3xl border ${
        isConsumerMap
          ? "border-line bg-surface-subtle shadow-card"
          : "border-zinc-800 bg-zinc-950"
      } ${rendererMode === "fallback-2d" ? "touch-none cursor-grab" : ""} ${heightClassName}`}
    >
      {/* Top overlays */}
      {(topLeftOverlay || topRightOverlay) && (
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex flex-wrap items-start justify-between gap-2">
          <div className="pointer-events-auto max-w-full">{topLeftOverlay}</div>
          <div className="pointer-events-auto max-w-full">
            {topRightOverlay}
          </div>
        </div>
      )}

      {/* WebGL DeckGL Map OR 2D Web Mercator SVG Fallback */}
      {rendererMode === "webgl" ? (
        <DeckErrorBoundary onFail={handleDeckFail}>
          <DeckGL
            viewState={viewState}
            onViewStateChange={({ viewState: next }) => {
              const typed = next as Partial<CampusMapViewState>;
              if (
                typeof typed.latitude === "number" &&
                typeof typed.longitude === "number" &&
                typeof typed.zoom === "number"
              ) {
                setViewState({
                  latitude: Math.max(-85, Math.min(85, typed.latitude)),
                  longitude: Math.max(-180, Math.min(180, typed.longitude)),
                  zoom: Math.max(
                    MIN_CAMPUS_MAP_ZOOM,
                    Math.min(MAX_CAMPUS_MAP_ZOOM, typed.zoom),
                  ),
                  pitch: 0,
                  bearing: 0,
                });
              }
            }}
            controller={{
              dragPan: true,
              scrollZoom: true,
              touchZoom: true,
              doubleClickZoom: true,
              dragRotate: false,
              touchRotate: false,
              keyboard: true,
            }}
            layers={deckLayers}
            onError={(err: Error) => handleDeckFail(err.message)}
            style={{ position: "relative", width: "100%", height: "100%" }}
          />
        </DeckErrorBoundary>
      ) : (
        <div
          aria-hidden="true"
          className={`relative h-full w-full overflow-hidden ${
            isDark
              ? "bg-gradient-to-b from-slate-950 via-zinc-950 to-slate-950"
              : "bg-gradient-to-b from-[#f3f4f8] via-[#eceef4] to-[#e7eaf2]"
          }`}
        >
          <svg
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            className="block h-full w-full"
          >
            {/* Subtle geographic coordinate reference grid */}
            <defs>
              <pattern
                id={`${testIdPrefix}-geo-grid`}
                width="64"
                height="64"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 64 0 L 0 0 0 64"
                  fill="none"
                  stroke={
                    isDark ? "rgba(148,163,184,0.10)" : "rgba(100,116,139,0.14)"
                  }
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect
              width={size.width}
              height={size.height}
              fill={`url(#${testIdPrefix}-geo-grid)`}
            />

            {/* Res-11 H3 pickup cells */}
            {projectedH3Polygons.map(({ cell, pointsAttr }) => (
              <polygon
                key={cell.hex}
                points={pointsAttr}
                fill={rgbaToCss(cell.fillRgba)}
                stroke={rgbaToCss(cell.lineRgba)}
                strokeWidth={2}
              />
            ))}

            {/* Verified Marietta campus reference building dots */}
            {projectedRefDots.map(({ building, x, y }) => {
              if (
                x < -12 ||
                x > size.width + 12 ||
                y < -12 ||
                y > size.height + 12
              ) {
                return null;
              }
              return (
                <circle
                  key={building.id}
                  cx={x}
                  cy={y}
                  r={3.5}
                  fill={
                    isDark ? "rgba(148,163,184,0.55)" : "rgba(82,85,96,0.45)"
                  }
                  stroke={
                    isDark ? "rgba(226,232,240,0.45)" : "rgba(255,255,255,0.85)"
                  }
                  strokeWidth={1}
                />
              );
            })}

            {/* Collision-free verified campus building reference labels */}
            {visibleReferenceLabels.map(({ building, x, y }) => (
              <g key={`ref-label-${building.id}`}>
                <text
                  x={x}
                  y={y + 15}
                  textAnchor="middle"
                  fill={
                    isDark ? "rgba(203,213,225,0.80)" : "rgba(30,32,40,0.78)"
                  }
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {isConsumerMap
                    ? building.name
                    : building.building_code
                      ? `${building.name} (${building.building_code})`
                      : building.name}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {/* Projected accessible DOM marker overlay */}
      {renderProjectedOverlay && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {renderProjectedOverlay({
            viewState,
            width: size.width,
            height: size.height,
            project,
          })}
        </div>
      )}

      {/* Optional centered empty state */}
      {emptyOverlay && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="pointer-events-auto max-w-sm">{emptyOverlay}</div>
        </div>
      )}

      {/* North indicator + Zoom / Fit controls (44px touch targets) */}
      <div className="pointer-events-auto absolute bottom-14 right-3 z-20 flex flex-col items-end gap-1.5">
        <div
          data-testid={`${testIdPrefix}-north-indicator`}
          aria-label="Map oriented north up, KSU Marietta Campus"
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur ${pillSurfaceClass}`}
        >
          <Compass size={13} aria-hidden="true" className="text-owl-goldText" />
          <span>N · Marietta</span>
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            data-testid={`${testIdPrefix}-zoom-in`}
            aria-label="Zoom in campus map"
            onClick={handleZoomIn}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border shadow-sm backdrop-blur transition ${controlSurfaceClass}`}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid={`${testIdPrefix}-zoom-out`}
            aria-label="Zoom out campus map"
            onClick={handleZoomOut}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border shadow-sm backdrop-blur transition ${controlSurfaceClass}`}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid={`${testIdPrefix}-fit-button`}
            aria-label="Fit campus map to active points"
            onClick={handleFitReset}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border shadow-sm backdrop-blur transition ${controlSurfaceClass}`}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Bottom status / attribution bar */}
      <div className="pointer-events-none absolute bottom-2.5 left-3 right-3 z-20 flex flex-wrap items-end justify-between gap-2">
        <div className="pointer-events-auto max-w-full flex-1">
          {bottomOverlay}
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          {rendererMode === "fallback-2d" && (
            <span
              data-testid={`${testIdPrefix}-2d-fallback`}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold backdrop-blur ${pillSurfaceClass}`}
            >
              {isConsumerMap
                ? "2D campus map"
                : `2D map fallback${webglReason ? ` (${webglReason})` : ""}`}
            </span>
          )}
          {rendererMode === "webgl" &&
            enableOsmTiles &&
            osmStatus !== "fallback" && (
              <a
                data-testid={`${testIdPrefix}-osm-attribution`}
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium underline underline-offset-2 backdrop-blur ${pillSurfaceClass}`}
              >
                © OpenStreetMap contributors
              </a>
            )}
          {rendererMode === "webgl" &&
            enableOsmTiles &&
            osmStatus === "fallback" && (
              <span
                data-testid={`${testIdPrefix}-tile-fallback`}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium backdrop-blur ${pillSurfaceClass}`}
              >
                {isConsumerMap
                  ? "Campus map"
                  : "Campus plot (OSM tiles offline)"}
              </span>
            )}
        </div>
      </div>
    </div>
  );
}
