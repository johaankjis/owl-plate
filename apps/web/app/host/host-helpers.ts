import type {
  Building,
  Counts,
  DropResponse,
  HostPickupReview,
  PickupMatchStatus,
  PickupVerificationSource,
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
 * Returns true when the host page should actively poll GET /drops/{id}/pickup-reviews
 * for the host's own published drop.
 */
export function shouldPollHostPickupReviews(
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
 * Returns true when the host page should actively poll GET /drops/{id}/pantry-referral
 * for the host's own published campus-feed drop (pantry workflow supports campus_feed only).
 */
export function shouldPollHostPantryReferral(
  drop: Pick<DropResponse, "status" | "distribution_mode"> | null,
  step: HostViewStep = resolveHostStep(drop as DropResponse | null),
): boolean {
  if (!drop) return false;
  const mode = drop.distribution_mode ?? "seeded_waves";
  return (
    step === "counts" &&
    mode === "campus_feed" &&
    (drop.status === "live" || drop.status === "claimed_out")
  );
}

/**
 * Formats each count value as a number-only string for the host count elements,
 * distinguishing student holds/pickups from pantry reserved/transfers.
 */
export function formatHostCounts(counts: Counts): {
  available: string;
  held: string;
  pickedUp: string;
  pantryHeld: string;
  pantryTransferred: string;
  total: string;
} {
  return {
    available: String(counts.available),
    held: String(counts.held),
    pickedUp: String(counts.picked_up),
    pantryHeld: String(counts.pantry_held ?? 0),
    pantryTransferred: String(counts.pantry_transferred ?? 0),
    total: String(counts.total),
  };
}

/**
 * Restores the current host drop state on page load or `/host?drop=<UUID>` deep link:
 * - If `linkedDropId` is provided, loads THAT specific drop via `fetchDrop(linkedDropId)`.
 *   If backend returns 404/403 (foreign, unauthorized, or missing drop), sets `linkedDropError`
 *   and falls back to the host's own active drop (or upload step) without rendering foreign data.
 * - Otherwise queries `GET /demo/active-drop` followed by `GET /drops/{id}`.
 */
export async function restoreHostDropState<TSource>(
  fetchActiveDrop: () => Promise<{
    data: { drop_id: string | null };
    source: TSource;
  }>,
  fetchDrop: (
    dropId: string,
  ) => Promise<{ data: DropResponse; source: TSource }>,
  linkedDropId?: string | null,
): Promise<{
  drop: DropResponse | null;
  step: HostViewStep;
  source: TSource;
  linkedDropError?: string | null;
}> {
  const cleanLinkedId = linkedDropId?.trim() || null;
  if (cleanLinkedId) {
    try {
      const linkedRes = await fetchDrop(cleanLinkedId);
      const step = resolveHostStep(linkedRes.data);
      return {
        drop: step === "upload" ? null : linkedRes.data,
        step,
        source: linkedRes.source,
        linkedDropError:
          linkedRes.data.status === "expired" ? "That drop has expired." : null,
      };
    } catch (err) {
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? (err as { status?: unknown }).status
          : undefined;
      const errMsg =
        status === 404 || status === 403
          ? "That drop is unavailable or belongs to another host."
          : err instanceof Error
            ? err.message
            : "Could not load linked drop.";
      try {
        const activeRes = await fetchActiveDrop();
        const activeDropId = activeRes.data.drop_id;
        if (!activeDropId || activeDropId === cleanLinkedId) {
          return {
            drop: null,
            step: "upload",
            source: activeRes.source,
            linkedDropError: errMsg,
          };
        }
        const dropRes = await fetchDrop(activeDropId);
        const step = resolveHostStep(dropRes.data);
        return {
          drop: step === "upload" ? null : dropRes.data,
          step,
          source: dropRes.source,
          linkedDropError: errMsg,
        };
      } catch {
        throw err;
      }
    }
  }

  const activeRes = await fetchActiveDrop();
  const activeDropId = activeRes.data.drop_id;
  if (!activeDropId) {
    return {
      drop: null,
      step: "upload",
      source: activeRes.source,
      linkedDropError: null,
    };
  }
  const dropRes = await fetchDrop(activeDropId);
  const step = resolveHostStep(dropRes.data);
  return {
    drop: step === "upload" ? null : dropRes.data,
    step,
    source: dropRes.source,
    linkedDropError: null,
  };
}

/**
 * Formats a host pickup review's provider source into an honest UI badge label.
 */
export function formatHostReviewSourceLabel(
  source: PickupVerificationSource,
): string {
  if (source === "openrouter") {
    return "Live Gemini via OpenRouter";
  }
  return "Simulated demo assessment";
}

/**
 * Formats a host pickup review's match_status into a concise badge label.
 */
export function formatHostReviewMatchLabel(
  matchStatus: PickupMatchStatus,
): string {
  if (matchStatus === "consistent") {
    return "Consistent";
  }
  if (matchStatus === "uncertain") {
    return "Uncertain";
  }
  return "Inconsistent";
}

/**
 * Formats a host pickup review confidence value (0..1) into a percentage string.
 */
export function formatHostReviewConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) return "0%";
  const clamped = Math.max(0, Math.min(1, confidence));
  return `${Math.round(clamped * 100)}%`;
}

export interface HostReviewActionGuard {
  canAct: boolean;
  staleReason: string | null;
}

/**
 * Determines whether a host can approve or reject a queued review item,
 * showing stale/expiry guards if the hold expired or the review is no longer pending.
 */
export function resolveHostReviewActionGuard(
  review: Pick<HostPickupReview, "review_status" | "held_until">,
  nowIso: string,
): HostReviewActionGuard {
  if (review.review_status === "approved") {
    return {
      canAct: false,
      staleReason: "Approved (human override recorded).",
    };
  }
  if (review.review_status === "rejected") {
    return {
      canAct: false,
      staleReason: "Rejected (student hold remains active until expiry).",
    };
  }
  if (review.review_status === "superseded") {
    return {
      canAct: false,
      staleReason: "Superseded by a newer student photo attempt.",
    };
  }
  if (review.review_status === "expired") {
    return {
      canAct: false,
      staleReason: "Hold expired before review completion.",
    };
  }
  const nowMs = new Date(nowIso).getTime();
  const heldUntilMs = new Date(review.held_until).getTime();
  if (
    Number.isFinite(nowMs) &&
    Number.isFinite(heldUntilMs) &&
    nowMs >= heldUntilMs
  ) {
    return {
      canAct: false,
      staleReason: "Hold expired — approval is disabled.",
    };
  }
  return {
    canAct: true,
    staleReason: null,
  };
}
