import {
  BUILDING_CATEGORIES,
  type Building,
  type BuildingCategory,
} from "./types/api";

/**
 * Pure campus building directory helpers for Owl Plate Milestone 1.
 *
 * Contract rules:
 * - Only verified buildings (`verification_status === "verified"`) with finite
 *   numeric coordinates may be enabled for campus selection, dispatch, or walking directions.
 * - Category ordering follows the contract: `academic`, `student_life`, `housing`, `other`.
 * - Walking directions link uses `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG&travelmode=walking`
 *   with no origin parameter, no API key, and no student GPS.
 */

export const BUILDING_CATEGORY_LABELS: Record<BuildingCategory, string> = {
  academic: "Academic",
  student_life: "Student Life",
  housing: "Housing",
  other: "Other",
};

export interface BuildingCategoryGroup {
  category: BuildingCategory;
  label: string;
  buildings: Building[];
}

/**
 * Returns true only when a building record is verified and has valid finite numeric coordinates.
 * Rejects null, NaN, or synthetic placeholder (0, 0) coordinates.
 */
export function isVerifiedBuilding(
  building: Building | null | undefined,
): building is Building {
  if (!building) return false;
  if (building.verification_status !== "verified") return false;
  if (
    typeof building.latitude !== "number" ||
    typeof building.longitude !== "number" ||
    !Number.isFinite(building.latitude) ||
    !Number.isFinite(building.longitude)
  ) {
    return false;
  }
  if (building.latitude === 0 && building.longitude === 0) {
    return false;
  }
  if (
    building.latitude < -90 ||
    building.latitude > 90 ||
    building.longitude < -180 ||
    building.longitude > 180
  ) {
    return false;
  }
  return Boolean(building.id && building.id.trim().length > 0);
}

/**
 * Filters an input building list down to verified records with valid coordinates.
 */
export function filterVerifiedBuildings(
  buildings: ReadonlyArray<Building>,
): Building[] {
  return buildings.filter((b) => isVerifiedBuilding(b));
}

/**
 * Formats an optional building code and number badge (e.g. "J • #860" or "J" or "#860"),
 * never inventing values when null.
 */
export function formatBuildingMetaBadge(building: {
  building_code?: string | null;
  building_number?: string | null;
}): string | null {
  const code = building.building_code?.trim() || null;
  const num = building.building_number?.trim() || null;
  if (code && num) {
    return `Bldg ${code} • #${num}`;
  }
  if (code) {
    return `Bldg ${code}`;
  }
  if (num) {
    return `#${num}`;
  }
  return null;
}

/**
 * Matches a building against a user search query (name, id, official code, number, or category label).
 */
export function matchesBuildingSearch(
  building: Building,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const categoryLabel =
    BUILDING_CATEGORY_LABELS[building.category]?.toLowerCase() ?? "";
  const haystack = [
    building.name,
    building.id,
    building.building_code ?? "",
    building.building_number ?? "",
    building.category,
    categoryLabel,
  ]
    .join(" ")
    .toLowerCase();

  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Filters to verified buildings matching `query` and groups them in canonical
 * category order (`academic`, `student_life`, `housing`, `other`).
 */
export function groupVerifiedBuildings(
  buildings: ReadonlyArray<Building>,
  query = "",
): BuildingCategoryGroup[] {
  const verified = filterVerifiedBuildings(buildings).filter((b) =>
    matchesBuildingSearch(b, query),
  );

  const byCategory: Record<BuildingCategory, Building[]> = {
    academic: [],
    student_life: [],
    housing: [],
    other: [],
  };

  for (const b of verified) {
    if (BUILDING_CATEGORIES.includes(b.category)) {
      byCategory[b.category].push(b);
    } else {
      byCategory.other.push(b);
    }
  }

  return BUILDING_CATEGORIES.map((category) => ({
    category,
    label: BUILDING_CATEGORY_LABELS[category],
    buildings: byCategory[category],
  })).filter((group) => group.buildings.length > 0);
}

/**
 * Builds the exact Google Maps walking directions URL for a verified campus building:
 * `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG&travelmode=walking`
 *
 * Returns null for rehearsal locations (`building === null`), unverified entries,
 * or invalid/synthetic coordinates. Never includes `origin` or an API key.
 */
export function buildWalkingDirectionsUrl(
  building: Building | null | undefined,
): string | null {
  if (!isVerifiedBuilding(building)) {
    return null;
  }
  const lat = String(building.latitude);
  const lng = String(building.longitude);
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}
