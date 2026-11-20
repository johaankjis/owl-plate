import { cellToBoundary, latLngToCell } from "h3-js";
import { isVerifiedBuilding } from "./buildings";
import type {
  Building,
  BuildingDistribution,
  CampusDistributionResponse,
  Counts,
  DropResponse,
  FeedDrop,
} from "./types/api";

/**
 * Shared pure campus map geometry, student availability grouping, and
 * projector aggregate helpers for Owl Plate Milestone 3.
 *
 * Contract guarantees (`docs/CAMPUS_MAP_CONTRACT.md`):
 * - All plotted coordinates come strictly from verified building snapshots
 *   (`isVerifiedBuilding`) with zero synthetic jitter or invented footprints.
 * - Student map reuses `GET /students/me/feed` exclusively (no GPS/area/new API).
 * - Projector map uses verified host pickup buildings and H3 res-11 aggregates
 *   only (no student points, identifiers, rings, or jitter).
 */

export const CAMPUS_H3_RESOLUTION = 11;
export const MERCATOR_TILE_SIZE = 512;
export const MIN_CAMPUS_MAP_ZOOM = 13.5;
export const MAX_CAMPUS_MAP_ZOOM = 18.5;
export const DEFAULT_CAMPUS_ZOOM = 15.2;

/**
 * Geographic midpoint of the verified KSU Marietta 43-building dataset.
 * Used strictly as an empty-canvas viewport center when no verified building
 * records have loaded yet; never rendered as a fake building or drop point.
 */
export const MARIETTA_FALLBACK_CENTER = {
  latitude: 33.937752,
  longitude: -84.5209,
} as const;

export interface CampusMapViewState {
  latitude: number;
  longitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface StudentMapBuildingMarker {
  building: Building;
  latitude: number;
  longitude: number;
  h3Cell: string | null;
  availableServings: number;
  drops: FeedDrop[];
  hasReservableDrop: boolean;
}

export interface StudentCampusMapModel {
  markers: StudentMapBuildingMarker[];
  unplottableAvailableDrops: FeedDrop[];
  exhaustedDrops: FeedDrop[];
  totalAvailableServings: number;
  totalAvailableDrops: number;
}

export type SelectedMapBuildingState =
  | { status: "none" }
  | { status: "active"; marker: StudentMapBuildingMarker }
  | {
      status: "exhausted" | "unplottable" | "expired_or_gone";
      buildingId: string;
      buildingName: string;
      message: string;
    };

export interface DeepLinkMapResolution {
  buildingId: string | null;
  status: "none" | "plotted" | "exhausted" | "unplottable" | "missing";
  notice: string | null;
}

export interface ProjectorBuildingMapNode {
  buildingCode: string;
  building: Building;
  buildingName: string;
  latitude: number;
  longitude: number;
  h3Cell: string | null;
  activeDrops: number;
  availableDrops: number;
  counts: Counts;
  hasAvailable: boolean;
}

export interface ProjectorCampusMapModel {
  verifiedNodes: ProjectorBuildingMapNode[];
  unverifiedBuildings: BuildingDistribution[];
  totalAvailable: number;
  totalReserved: number;
  totalCollected: number;
  totalPantryHeld: number;
  totalPantryTransferred: number;
  totalAvailableDrops: number;
  totalActiveDrops: number;
  accessibleSummary: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Converts WGS84 longitude to Web Mercator world X pixel coordinate at `zoom`. */
export function lngToWorldX(lng: number, zoom: number): number {
  const scale = MERCATOR_TILE_SIZE * Math.pow(2, zoom);
  return ((lng + 180) / 360) * scale;
}

/** Converts WGS84 latitude to Web Mercator world Y pixel coordinate at `zoom`. */
export function latToWorldY(lat: number, zoom: number): number {
  const clampedLat = clamp(lat, -85.051129, 85.051129);
  const rad = (clampedLat * Math.PI) / 180;
  const scale = MERCATOR_TILE_SIZE * Math.pow(2, zoom);
  const mercN = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return (0.5 - mercN / (2 * Math.PI)) * scale;
}

/** Inverse Web Mercator world X pixel coordinate to WGS84 longitude. */
export function worldXToLng(worldX: number, zoom: number): number {
  const scale = MERCATOR_TILE_SIZE * Math.pow(2, zoom);
  return (worldX / scale) * 360 - 180;
}

/** Inverse Web Mercator world Y pixel coordinate to WGS84 latitude. */
export function worldYToLat(worldY: number, zoom: number): number {
  const scale = MERCATOR_TILE_SIZE * Math.pow(2, zoom);
  const mercN = (0.5 - worldY / scale) * 2 * Math.PI;
  return (Math.atan(Math.sinh(mercN)) * 180) / Math.PI;
}

/**
 * Projects a WGS84 latitude/longitude into viewport pixel coordinates matching
 * deck.gl MapView when `pitch === 0` and `bearing === 0` (north-up).
 */
export function projectLatLngToViewport(
  latitude: number,
  longitude: number,
  viewState: Pick<CampusMapViewState, "latitude" | "longitude" | "zoom">,
  width: number,
  height: number,
): ProjectedPoint {
  const centerX = lngToWorldX(viewState.longitude, viewState.zoom);
  const centerY = latToWorldY(viewState.latitude, viewState.zoom);
  const pointX = lngToWorldX(longitude, viewState.zoom);
  const pointY = latToWorldY(latitude, viewState.zoom);
  return {
    x: width / 2 + (pointX - centerX),
    y: height / 2 + (pointY - centerY),
  };
}

/** Shifts a north-up viewport by a screen pixel drag delta `(deltaX, deltaY)`. */
export function panViewStateByPixels(
  viewState: CampusMapViewState,
  deltaX: number,
  deltaY: number,
): CampusMapViewState {
  const nextCenterX = lngToWorldX(viewState.longitude, viewState.zoom) - deltaX;
  const nextCenterY = latToWorldY(viewState.latitude, viewState.zoom) - deltaY;
  return {
    ...viewState,
    latitude: clamp(worldYToLat(nextCenterY, viewState.zoom), -85, 85),
    longitude: clamp(worldXToLng(nextCenterX, viewState.zoom), -180, 180),
    pitch: 0,
    bearing: 0,
  };
}

/** Adjusts viewport zoom within safe campus bounds while keeping north straight up. */
export function zoomViewState(
  viewState: CampusMapViewState,
  deltaZoom: number,
  minZoom = MIN_CAMPUS_MAP_ZOOM,
  maxZoom = MAX_CAMPUS_MAP_ZOOM,
): CampusMapViewState {
  return {
    ...viewState,
    zoom: Number(
      clamp(viewState.zoom + deltaZoom, minZoom, maxZoom).toFixed(3),
    ),
    pitch: 0,
    bearing: 0,
  };
}

/**
 * Computes a north-up Web Mercator viewport that fits all supplied valid
 * geographic coordinates inside `(width, height)` with uniform padding.
 */
export function fitPointsToViewState(
  points: ReadonlyArray<GeoPoint>,
  width: number,
  height: number,
  options?: {
    paddingPx?: number;
    minZoom?: number;
    maxZoom?: number;
    singlePointZoom?: number;
  },
): CampusMapViewState {
  const paddingPx = options?.paddingPx ?? 56;
  const minZoom = options?.minZoom ?? MIN_CAMPUS_MAP_ZOOM;
  const maxZoom = options?.maxZoom ?? 16.6;
  const singlePointZoom = clamp(
    options?.singlePointZoom ?? 16.0,
    minZoom,
    maxZoom,
  );

  const valid = points.filter(
    (p) =>
      Number.isFinite(p.latitude) &&
      Number.isFinite(p.longitude) &&
      !(p.latitude === 0 && p.longitude === 0) &&
      p.latitude >= -90 &&
      p.latitude <= 90 &&
      p.longitude >= -180 &&
      p.longitude <= 180,
  );

  if (valid.length === 0) {
    return {
      latitude: MARIETTA_FALLBACK_CENTER.latitude,
      longitude: MARIETTA_FALLBACK_CENTER.longitude,
      zoom: clamp(DEFAULT_CAMPUS_ZOOM, minZoom, maxZoom),
      pitch: 0,
      bearing: 0,
    };
  }

  if (valid.length === 1) {
    return {
      latitude: valid[0]!.latitude,
      longitude: valid[0]!.longitude,
      zoom: singlePointZoom,
      pitch: 0,
      bearing: 0,
    };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const pt of valid) {
    if (pt.latitude < minLat) minLat = pt.latitude;
    if (pt.latitude > maxLat) maxLat = pt.latitude;
    if (pt.longitude < minLng) minLng = pt.longitude;
    if (pt.longitude > maxLng) maxLng = pt.longitude;
  }

  const worldMinX = lngToWorldX(minLng, 0);
  const worldMaxX = lngToWorldX(maxLng, 0);
  const worldTopY = latToWorldY(maxLat, 0);
  const worldBottomY = latToWorldY(minLat, 0);

  const midLng = worldXToLng((worldMinX + worldMaxX) / 2, 0);
  const midLat = worldYToLat((worldTopY + worldBottomY) / 2, 0);

  const spanX = Math.abs(worldMaxX - worldMinX);
  const spanY = Math.abs(worldBottomY - worldTopY);

  if (spanX < 1e-8 && spanY < 1e-8) {
    return {
      latitude: midLat,
      longitude: midLng,
      zoom: singlePointZoom,
      pitch: 0,
      bearing: 0,
    };
  }

  const safeW = Math.max(120, width - paddingPx * 2);
  const safeH = Math.max(120, height - paddingPx * 2);

  const zoomX = spanX > 1e-8 ? Math.log2(safeW / spanX) : maxZoom;
  const zoomY = spanY > 1e-8 ? Math.log2(safeH / spanY) : maxZoom;
  const zoom = Number(
    clamp(Math.min(zoomX, zoomY), minZoom, maxZoom).toFixed(3),
  );

  return {
    latitude: midLat,
    longitude: midLng,
    zoom,
    pitch: 0,
    bearing: 0,
  };
}

/** Derives the resolution-11 H3 index for exact verified coordinates. */
export function computeH3CellForCoords(
  latitude: number,
  longitude: number,
): string | null {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }
  try {
    return latLngToCell(latitude, longitude, CAMPUS_H3_RESOLUTION);
  } catch {
    return null;
  }
}

/** Returns polygon vertices (`{ latitude, longitude }[]`) for an H3 cell for 2D fallback rendering. */
export function computeH3BoundaryPoints(h3Cell: string): GeoPoint[] {
  try {
    const boundary = cellToBoundary(h3Cell);
    return boundary.map(([latitude, longitude]) => ({ latitude, longitude }));
  } catch {
    return [];
  }
}

/**
 * Selects a collision-free subset of verified campus buildings for geographic
 * reference labels so real building names provide orientation without crowding.
 */
export function selectNonOverlappingReferenceBuildings(
  buildings: ReadonlyArray<Building>,
  excludedBuildingIds: ReadonlySet<string>,
  viewState: Pick<CampusMapViewState, "latitude" | "longitude" | "zoom">,
  width: number,
  height: number,
  minSpacingPx = 76,
): Array<{ building: Building; x: number; y: number }> {
  const priorityWeight = (b: Building): number => {
    let score = 0;
    if (b.category === "student_life") score += 4;
    else if (b.category === "academic") score += 3;
    else if (b.category === "housing") score += 2;
    else score += 1;
    if (b.building_code) score += 1;
    return score;
  };

  const candidates = buildings
    .filter((b) => isVerifiedBuilding(b) && !excludedBuildingIds.has(b.id))
    .sort((a, b) => {
      const diff = priorityWeight(b) - priorityWeight(a);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

  const accepted: Array<{ building: Building; x: number; y: number }> = [];
  const margin = 28;
  const spacingY = Math.max(24, Math.round(minSpacingPx * 0.42));

  for (const building of candidates) {
    const { x, y } = projectLatLngToViewport(
      building.latitude,
      building.longitude,
      viewState,
      width,
      height,
    );
    if (x < margin || x > width - margin || y < margin || y > height - margin) {
      continue;
    }

    const overlaps = accepted.some(
      (other) =>
        Math.abs(other.x - x) < minSpacingPx &&
        Math.abs(other.y - y) < spacingY,
    );
    if (!overlaps) {
      accepted.push({ building, x, y });
    }
  }

  return accepted;
}

/**
 * Returns true if a drop is published (not draft/expired) and has not passed
 * `expires_at` relative to `referenceNowMs` (when provided).
 */
export function isDropUnexpired(
  drop: Pick<DropResponse, "status" | "expires_at">,
  referenceNowMs?: number | null,
): boolean {
  if (drop.status === "expired" || drop.status === "draft") {
    return false;
  }
  if (
    drop.expires_at &&
    typeof referenceNowMs === "number" &&
    Number.isFinite(referenceNowMs)
  ) {
    const expiresMs = Date.parse(drop.expires_at);
    if (Number.isFinite(expiresMs) && expiresMs <= referenceNowMs) {
      return false;
    }
  }
  return true;
}

/**
 * Builds the student availability map model strictly from `GET /students/me/feed`.
 *
 * Contract rules:
 * - Only unexpired `campus_feed` drops with `isVerifiedBuilding(drop.building)`
 *   and `counts.available > 0` become map markers.
 * - Drops at the same verified building are grouped into one marker at the exact
 *   snapshot coordinate (zero jitter) with summed `availableServings`.
 * - Incompatible drops with `counts.available > 0` remain visible on the map so
 *   students can see why they cannot reserve them, while never bypassing server rules.
 * - Unverified / synthetic rehearsal drops are separated into `unplottableAvailableDrops`
 *   so no synthetic point is ever plotted on the real campus map.
 */
export function buildStudentCampusMapModel(
  feedDrops: ReadonlyArray<FeedDrop>,
  referenceNowMs?: number | null,
): StudentCampusMapModel {
  const byBuildingId = new Map<string, StudentMapBuildingMarker>();
  const unplottableAvailableDrops: FeedDrop[] = [];
  const exhaustedDrops: FeedDrop[] = [];
  let totalAvailableServings = 0;
  let totalAvailableDrops = 0;

  for (const feedDrop of feedDrops) {
    const { drop } = feedDrop;
    const mode = drop.distribution_mode ?? "campus_feed";
    if (mode !== "campus_feed") {
      continue;
    }
    if (!isDropUnexpired(drop, referenceNowMs)) {
      continue;
    }
    if (drop.counts.available <= 0) {
      exhaustedDrops.push(feedDrop);
      continue;
    }

    if (!isVerifiedBuilding(drop.building)) {
      unplottableAvailableDrops.push(feedDrop);
      continue;
    }

    const building = drop.building;
    totalAvailableServings += drop.counts.available;
    totalAvailableDrops += 1;

    const existing = byBuildingId.get(building.id);
    if (existing) {
      existing.availableServings += drop.counts.available;
      existing.drops.push(feedDrop);
      existing.hasReservableDrop =
        existing.hasReservableDrop || feedDrop.can_reserve;
    } else {
      byBuildingId.set(building.id, {
        building,
        latitude: building.latitude,
        longitude: building.longitude,
        h3Cell: computeH3CellForCoords(building.latitude, building.longitude),
        availableServings: drop.counts.available,
        drops: [feedDrop],
        hasReservableDrop: feedDrop.can_reserve,
      });
    }
  }

  const markers = Array.from(byBuildingId.values()).sort((a, b) =>
    a.building.name.localeCompare(b.building.name),
  );

  return {
    markers,
    unplottableAvailableDrops,
    exhaustedDrops,
    totalAvailableServings,
    totalAvailableDrops,
  };
}

/**
 * Resolves the currently selected building panel against live `feedDrops` so
 * exhausted, expired, disappeared, or unverified drops never leave a stale
 * reserve action on screen.
 */
export function resolveSelectedMapBuilding(
  selectedBuildingId: string | null,
  lastSelectedBuildingName: string | null,
  model: StudentCampusMapModel,
  allFeedDrops: ReadonlyArray<FeedDrop>,
  referenceNowMs?: number | null,
): SelectedMapBuildingState {
  if (!selectedBuildingId) {
    return { status: "none" };
  }

  const activeMarker = model.markers.find(
    (m) => m.building.id === selectedBuildingId,
  );
  if (activeMarker) {
    return { status: "active", marker: activeMarker };
  }

  const label = lastSelectedBuildingName?.trim() || "this building";

  const exhaustedAtBuilding = model.exhaustedDrops.find(
    (fd) =>
      fd.drop.building?.id === selectedBuildingId ||
      fd.drop.building_code === selectedBuildingId,
  );
  if (exhaustedAtBuilding) {
    const name = exhaustedAtBuilding.drop.building?.name?.trim() || label;
    return {
      status: "exhausted",
      buildingId: selectedBuildingId,
      buildingName: name,
      message: `All servings at ${name} are currently reserved or picked up. Any active hold you have remains available above.`,
    };
  }

  const unplottableAtBuilding = model.unplottableAvailableDrops.find(
    (fd) =>
      fd.drop.building_code === selectedBuildingId ||
      fd.drop.building?.id === selectedBuildingId,
  );
  if (unplottableAtBuilding) {
    return {
      status: "unplottable",
      buildingId: selectedBuildingId,
      buildingName: label,
      message: `Listings at ${label} no longer have verified campus coordinates and cannot be plotted on the map. Switch to Feed to view them.`,
    };
  }

  const expiredMatch = allFeedDrops.find(
    (fd) =>
      (fd.drop.building?.id === selectedBuildingId ||
        fd.drop.building_code === selectedBuildingId) &&
      !isDropUnexpired(fd.drop, referenceNowMs),
  );
  const expiredName = expiredMatch?.drop.building?.name?.trim() || label;

  return {
    status: "expired_or_gone",
    buildingId: selectedBuildingId,
    buildingName: expiredName,
    message: `The food listing at ${expiredName} has ended or is no longer available.`,
  };
}

/**
 * Resolves a `?drop=<UUID>` deep link when the student is viewing the Map tab.
 */
export function resolveDeepLinkMapSelection(
  linkedDropId: string | null | undefined,
  model: StudentCampusMapModel,
  allFeedDrops: ReadonlyArray<FeedDrop>,
  referenceNowMs?: number | null,
): DeepLinkMapResolution {
  const cleanId = linkedDropId?.trim() || null;
  if (!cleanId) {
    return { buildingId: null, status: "none", notice: null };
  }

  for (const marker of model.markers) {
    if (marker.drops.some((fd) => fd.drop.id === cleanId)) {
      return {
        buildingId: marker.building.id,
        status: "plotted",
        notice: null,
      };
    }
  }

  if (model.unplottableAvailableDrops.some((fd) => fd.drop.id === cleanId)) {
    return {
      buildingId: null,
      status: "unplottable",
      notice:
        "The linked drop does not have verified campus map coordinates. Switch to Feed to view or reserve it.",
    };
  }

  const exhausted = model.exhaustedDrops.find((fd) => fd.drop.id === cleanId);
  if (exhausted) {
    const location =
      exhausted.drop.building?.name?.trim() || exhausted.drop.building_code;
    return {
      buildingId: null,
      status: "exhausted",
      notice: `The linked drop at ${location} currently has 0 servings available. Check Feed or your active hold above.`,
    };
  }

  const found = allFeedDrops.find((fd) => fd.drop.id === cleanId);
  if (found && !isDropUnexpired(found.drop, referenceNowMs)) {
    return {
      buildingId: null,
      status: "missing",
      notice:
        "The linked drop has expired. Active available buildings appear on the map.",
    };
  }

  return {
    buildingId: null,
    status: "missing",
    notice: null,
  };
}

/**
 * Reads `BuildingDistribution.available_drops` from the additive API field,
 * with a narrow fallback if an older payload omits it.
 */
export function resolveBuildingAvailableDrops(
  building: Pick<
    BuildingDistribution,
    "available_drops" | "active_drops" | "counts"
  >,
): number {
  if (
    typeof building.available_drops === "number" &&
    Number.isFinite(building.available_drops)
  ) {
    return Math.max(0, Math.trunc(building.available_drops));
  }
  if (building.counts.available <= 0) {
    return 0;
  }
  return Math.max(
    1,
    Math.min(building.active_drops, building.counts.available),
  );
}

/**
 * Reads `CampusDistributionResponse.available_drops` from the additive API field,
 * with a narrow fallback summing per-building available drops if omitted.
 */
export function resolveCampusAvailableDrops(
  distribution: Pick<
    CampusDistributionResponse,
    "available_drops" | "buildings"
  > | null,
): number {
  if (!distribution) return 0;
  if (
    typeof distribution.available_drops === "number" &&
    Number.isFinite(distribution.available_drops)
  ) {
    return Math.max(0, Math.trunc(distribution.available_drops));
  }
  return distribution.buildings.reduce(
    (sum, b) => sum + resolveBuildingAvailableDrops(b),
    0,
  );
}

/**
 * Builds the projector campus-feed aggregate map model strictly from verified
 * pickup building coordinates and H3 resolution-11 cells (zero student points,
 * zero rings, zero synthetic jitter).
 */
export function buildProjectorCampusMapModel(
  buildings: ReadonlyArray<BuildingDistribution>,
): ProjectorCampusMapModel {
  const verifiedNodes: ProjectorBuildingMapNode[] = [];
  const unverifiedBuildings: BuildingDistribution[] = [];
  let totalAvailable = 0;
  let totalReserved = 0;
  let totalCollected = 0;
  let totalPantryHeld = 0;
  let totalPantryTransferred = 0;
  let totalAvailableDrops = 0;
  let totalActiveDrops = 0;

  for (const dist of buildings) {
    const availDrops = resolveBuildingAvailableDrops(dist);
    const pantryHeld = dist.counts.pantry_held ?? 0;
    const pantryTransferred = dist.counts.pantry_transferred ?? 0;
    totalAvailable += dist.counts.available;
    totalReserved += dist.counts.held;
    totalCollected += dist.counts.picked_up;
    totalPantryHeld += pantryHeld;
    totalPantryTransferred += pantryTransferred;
    totalAvailableDrops += availDrops;
    totalActiveDrops += dist.active_drops;

    if (!isVerifiedBuilding(dist.building)) {
      unverifiedBuildings.push(dist);
      continue;
    }

    const building = dist.building;
    verifiedNodes.push({
      buildingCode: dist.building_code,
      building,
      buildingName: building.name.trim() || dist.building_code,
      latitude: building.latitude,
      longitude: building.longitude,
      h3Cell: computeH3CellForCoords(building.latitude, building.longitude),
      activeDrops: dist.active_drops,
      availableDrops: availDrops,
      counts: {
        ...dist.counts,
        pantry_held: pantryHeld,
        pantry_transferred: pantryTransferred,
      },
      hasAvailable: dist.counts.available > 0,
    });
  }

  verifiedNodes.sort((a, b) => a.buildingName.localeCompare(b.buildingName));

  const accessibleSummary =
    verifiedNodes.length === 0 && unverifiedBuildings.length === 0
      ? "No active campus pickup buildings right now. 0 available, 0 reserved, 0 collected, 0 pantry reserved, 0 pantry transfers."
      : `${verifiedNodes.length} verified pickup ${
          verifiedNodes.length === 1 ? "building" : "buildings"
        } plotted (${totalAvailableDrops} available of ${totalActiveDrops} active ${
          totalActiveDrops === 1 ? "drop" : "drops"
        }): ${totalAvailable} available, ${totalReserved} reserved, ${totalCollected} collected, ${totalPantryHeld} pantry reserved, ${totalPantryTransferred} pantry transfers.${
          unverifiedBuildings.length > 0
            ? ` ${unverifiedBuildings.length} unverified rehearsal ${
                unverifiedBuildings.length === 1 ? "location" : "locations"
              } omitted from real campus map.`
            : ""
        }`;

  return {
    verifiedNodes,
    unverifiedBuildings,
    totalAvailable,
    totalReserved,
    totalCollected,
    totalPantryHeld,
    totalPantryTransferred,
    totalAvailableDrops,
    totalActiveDrops,
    accessibleSummary,
  };
}
