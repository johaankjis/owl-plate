import type { Counts, DropResponse, VisionSource } from "../../lib/types/api";

export type HostViewStep = "upload" | "review" | "counts";

export const HOST_POLL_INTERVAL_MS = 2000;

/**
 * Maps DropResponse.vision_source ("gemini" | "fixture") to the exact Contract v2.1 UI badge label.
 */
export function getVisionSourceLabel(visionSource: VisionSource): string {
  return visionSource === "gemini" ? "Live Gemini" : "Saved demo estimate";
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
