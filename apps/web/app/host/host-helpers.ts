import type {
  Building,
  Counts,
  DropResponse,
  VisionSource,
} from "../../lib/types/api";
import { filterVerifiedBuildings } from "../../lib/buildings";

export type HostViewStep = "upload" | "review" | "counts";

export const HOST_POLL_INTERVAL_MS = 2000;

export const HOST_REHEARSAL_CODE = "DEMO-ORIGIN";

const DROP_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolves the default building selection for the host review form:
 * - If the drop already specifies a canonical verified building ID (or non-default code), preserve it.
 * - Otherwise, if verified campus buildings are loaded and the drop is still on the placeholder "DEMO-ORIGIN",
 *   select the first verified campus building by default so campus mode is the default choice.
 */
export function resolveDefaultHostBuildingId(
  currentCode: string,
  buildings: ReadonlyArray<Building>,
): string {
  const verified = filterVerifiedBuildings(buildings);
  const trimmed = currentCode.trim();
  if (trimmed && trimmed !== HOST_REHEARSAL_CODE) {
    return trimmed;
  }
  if (verified.length > 0) {
    return verified[0]!.id;
  }
  return trimmed || HOST_REHEARSAL_CODE;
}

/**
 * Formats the location header shown on the host counts panel, preferring the verified
 * building name when present on DropResponse or matched in the directory.
 */
export function formatHostDropLocation(
  drop: Pick<DropResponse, "building_code" | "room" | "building">,
  buildings: ReadonlyArray<Building> = [],
): string {
  const matched =
    drop.building?.name?.trim() ||
    buildings.find((b) => b.id === drop.building_code)?.name?.trim() ||
    drop.building_code.trim() ||
    HOST_REHEARSAL_CODE;
  const room = drop.room?.trim();
  return room ? `${matched}, Room ${room}` : matched;
}

/**
 * Builds the paired It page URL for one published drop. Only the drop UUID is
 * carried; the companion receives no host credential or student data.
 */
export function buildPickupCompanionUrl(
  dropId: string,
  siteBaseUrl = process.env.NEXT_PUBLIC_IT_COMPANION_BASE_URL ?? "",
): string | null {
  const base = siteBaseUrl.trim();
  if (!base || !DROP_ID_PATTERN.test(dropId)) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    url.pathname = `/p/owl-whats-left-${dropId.toLowerCase()}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Maps DropResponse.vision_source ("openrouter" | "gemini" | "fixture") to the exact Contract v2.2 UI badge label.
 */
export function getVisionSourceLabel(visionSource: VisionSource): string {
  if (visionSource === "openrouter") {
    return "Live Gemini via OpenRouter";
  }
  if (visionSource === "gemini") {
    return "Live Gemini";
  }
  return "Saved demo estimate";
}

/**
 * Returns true when the drop estimate came from a live vision provider ("gemini" or "openrouter")
 * rather than the offline/demo fixture.
 */
export function isLiveVisionSource(visionSource: VisionSource): boolean {
  return visionSource === "gemini" || visionSource === "openrouter";
}

/**
 * Determines which step the host page should display for a loaded or restored drop.
 * - null or expired drop -> "upload"
 * - draft -> "review"
 * - live or claimed_out -> "counts"
 */
export function resolveHostStep(drop: DropResponse | null): HostViewStep {
  if (!drop || drop.status === "expired") {
    return "upload";
  }
  if (drop.status === "draft") {
    return "review";
  }
  return "counts";
}

/**
 * Returns true when the host page should actively poll GET /drops/{id} every 2 s
 * to keep counts fresh while the page is open.
 */
export function shouldPollHostCounts(
  drop: DropResponse | null,
  step: HostViewStep = resolveHostStep(drop),
): boolean {
  if (!drop) return false;
  return (
    step === "counts" &&
    (drop.status === "live" || drop.status === "claimed_out")
  );
}

/**
 * Formats each count value as a number-only string for the host count elements.
 */
export function formatHostCounts(counts: Counts): {
  available: string;
  held: string;
  pickedUp: string;
  total: string;
} {
  return {
    available: String(counts.available),
    held: String(counts.held),
    pickedUp: String(counts.picked_up),
    total: String(counts.total),
  };
}

/**
 * Restores the current host drop state on page reload via GET /demo/active-drop
 * followed by GET /drops/{id}.
 */
export async function restoreHostDropState<TSource>(
  fetchActiveDrop: () => Promise<{
    data: { drop_id: string | null };
    source: TSource;
  }>,
  fetchDrop: (
    dropId: string,
  ) => Promise<{ data: DropResponse; source: TSource }>,
): Promise<{
  drop: DropResponse | null;
  step: HostViewStep;
  source: TSource;
}> {
  const activeRes = await fetchActiveDrop();
  const activeDropId = activeRes.data.drop_id;
  if (!activeDropId) {
    return {
      drop: null,
      step: "upload",
      source: activeRes.source,
    };
  }
  const dropRes = await fetchDrop(activeDropId);
  const step = resolveHostStep(dropRes.data);
  return {
    drop: step === "upload" ? null : dropRes.data,
    step,
    source: dropRes.source,
  };
}
