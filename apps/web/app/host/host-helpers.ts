import type {
  Allergen,
  Building,
  Counts,
  Diet,
  DropResponse,
  DropStatus,
  HostPickupReview,
  PickupMatchStatus,
  PickupVerificationSource,
  SafetyReview,
  VisionSource,
} from "../../lib/types/api";
import { filterVerifiedBuildings } from "../../lib/buildings";

export type HostViewStep = "upload" | "review" | "counts";

export const HOST_POLL_INTERVAL_MS = 2000;

export const HOST_REHEARSAL_CODE = "DEMO-ORIGIN";

/** Consumer label for the synthetic rehearsal origin; the raw code is never shown. */
export const HOST_REHEARSAL_LOCATION_LABEL = "Rehearsal location";

/** Shown at the point of capture so hosts photograph trays, never people. */
export const HOST_PHOTO_PRIVACY_NOTICE =
  "Photograph food trays only — no people or faces.";

export const HOST_WIZARD_STEPS = [
  { step: 1, label: "Photo" },
  { step: 2, label: "Review" },
  { step: 3, label: "Publish" },
] as const;

/** Pickup windows the host may choose; the API accepts 1–120 minutes. */
export const HOST_EXPIRY_OPTIONS: ReadonlyArray<number> = [30, 45, 60, 90, 120];
export const HOST_DEFAULT_EXPIRY_MINUTES = 45;
export const HOST_MIN_SERVINGS = 1;
export const HOST_MAX_SERVINGS = 500;

const RELIGIOUS_DIET_TAGS: ReadonlyArray<Diet> = [
  "halal",
  "kosher",
  "pork_free",
];

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
    (drop.building_code.trim() === HOST_REHEARSAL_CODE
      ? HOST_REHEARSAL_LOCATION_LABEL
      : "Campus pickup");
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
 * Maps DropResponse.vision_source to consumer copy. Provider and model names stay on
 * technical admin screens; a sample estimate never claims to describe this photo.
 */
export function getVisionSourceLabel(visionSource: VisionSource): string {
  if (visionSource === "openrouter" || visionSource === "gemini") {
    return "AI photo estimate";
  }
  return "Sample estimate (not from your photo)";
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
    return "Photo assessment";
  }
  return "Sample assessment";
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

/** Keep the servings stepper inside the API's 1–500 bound, whatever the input. */
export function clampHostServings(value: number): number {
  if (!Number.isFinite(value)) return HOST_MIN_SERVINGS;
  return Math.min(
    HOST_MAX_SERVINGS,
    Math.max(HOST_MIN_SERVINGS, Math.trunc(value)),
  );
}

/** Maps the internal view step to the 1–3 wizard position shown to hosts. */
export function hostWizardStepNumber(step: HostViewStep): 1 | 2 | 3 {
  if (step === "upload") return 1;
  if (step === "review") return 2;
  return 3;
}

/**
 * After a refresh, keep a host on their listing dashboard when it ends so they see the
 * final counts, instead of silently jumping back to a blank upload form.
 */
export function resolveHostStepAfterRefresh(
  previous: HostViewStep,
  drop: DropResponse | null,
): HostViewStep {
  if (drop?.status === "expired" && previous === "counts") return "counts";
  return resolveHostStep(drop);
}

/** True when the page was opened for presenter rehearsal (`/host?rehearsal=1`). */
export function isHostRehearsalView(param: string | null | undefined): boolean {
  return param === "1" || param === "true";
}

/** Plain-language status for hosts; raw enum values stay out of the UI. */
export function formatHostStatusLabel(status: DropStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "live":
      return "Live";
    case "claimed_out":
      return "All reserved";
    default:
      return "Ended";
  }
}

export function hostStatusTone(
  status: DropStatus,
): "neutral" | "success" | "warning" | "gold" {
  if (status === "live") return "success";
  if (status === "claimed_out") return "gold";
  if (status === "draft") return "warning";
  return "neutral";
}

/** A short human title from the estimated items. */
export function summarizeHostListing(
  drop: Pick<DropResponse, "vision">,
): string {
  const names = drop.vision.items
    .map((item) => item.name.trim())
    .filter(Boolean);
  if (names.length === 0) return "Shared food";
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

/** Split the host's own listings into ones still in progress and ended history. */
export function partitionHostDrops<T extends Pick<DropResponse, "status">>(
  drops: ReadonlyArray<T>,
): { active: T[]; past: T[] } {
  return {
    active: drops.filter((d) => d.status !== "expired"),
    past: drops.filter((d) => d.status === "expired"),
  };
}

/** The newest listing the host can still act on, given a newest-first list. */
export function pickActiveHostDropId(
  drops: ReadonlyArray<Pick<DropResponse, "id" | "status">>,
): string | null {
  return drops.find((d) => d.status !== "expired")?.id ?? null;
}

export type HostListingAction = "resume" | "manage" | null;

/** Drafts resume in Review, published listings open their dashboard, ended ones are history. */
export function resolveHostListingAction(
  drop: Pick<DropResponse, "status">,
): HostListingAction {
  if (drop.status === "draft") return "resume";
  if (drop.status === "live" || drop.status === "claimed_out") return "manage";
  return null;
}

/** AI-flagged allergens the host has removed; removing one needs an ingredient check. */
export function removedEstimatedAllergens(
  estimated: ReadonlyArray<Allergen>,
  selected: ReadonlyArray<Allergen>,
): Allergen[] {
  return estimated.filter((alg) => !selected.includes(alg));
}

export function selectedReligiousDiets(diets: ReadonlyArray<Diet>): Diet[] {
  return diets.filter((d) => RELIGIOUS_DIET_TAGS.includes(d));
}

/**
 * Build the safety review the API receives. Conditional confirmations are only sent
 * while they are required, so a stale checkbox never asserts something the host no
 * longer reviewed.
 */
export function buildHostSafetyReview(
  review: SafetyReview,
  estimated: ReadonlyArray<Allergen>,
  selectedAllergens: ReadonlyArray<Allergen>,
  diets: ReadonlyArray<Diet>,
): SafetyReview {
  const needsIngredients =
    removedEstimatedAllergens(estimated, selectedAllergens).length > 0;
  const needsReligious = selectedReligiousDiets(diets).length > 0;
  return {
    covered_and_temperature_safe: review.covered_and_temperature_safe,
    served_within_two_hours: review.served_within_two_hours,
    untouched: review.untouched,
    ingredient_information_checked:
      needsIngredients && Boolean(review.ingredient_information_checked),
    religious_diets_confirmed:
      needsReligious && Boolean(review.religious_diets_confirmed),
  };
}

/** Publish is allowed only once every required confirmation is checked. */
export function canPublishHostReview(
  review: SafetyReview,
  estimated: ReadonlyArray<Allergen>,
  selectedAllergens: ReadonlyArray<Allergen>,
  diets: ReadonlyArray<Diet>,
): boolean {
  const built = buildHostSafetyReview(
    review,
    estimated,
    selectedAllergens,
    diets,
  );
  const needsIngredients =
    removedEstimatedAllergens(estimated, selectedAllergens).length > 0;
  const needsReligious = selectedReligiousDiets(diets).length > 0;
  return (
    built.covered_and_temperature_safe &&
    built.served_within_two_hours &&
    built.untouched &&
    (!needsIngredients || Boolean(built.ingredient_information_checked)) &&
    (!needsReligious || Boolean(built.religious_diets_confirmed))
  );
}

/** Everything the host edits in Review; sent as one DropEdit on publish. */
export interface HostReviewForm {
  servings: number;
  allergens: Allergen[];
  diets: Diet[];
  buildingId: string;
  room: string;
  pickupInstructions: string;
  expiresInMinutes: number;
  safety: SafetyReview;
}

const EMPTY_SAFETY: SafetyReview = {
  covered_and_temperature_safe: false,
  served_within_two_hours: false,
  untouched: false,
  ingredient_information_checked: false,
  religious_diets_confirmed: false,
};

/** Seed the Review form from a draft (or resumed) drop. */
export function initialHostReviewForm(
  drop: Pick<
    DropResponse,
    | "servings_final"
    | "allergens_final"
    | "diet_tags_final"
    | "building_code"
    | "room"
    | "pickup_instructions"
    | "safety_review"
  >,
  buildings: ReadonlyArray<Building>,
  expiresInMinutes: number = HOST_DEFAULT_EXPIRY_MINUTES,
): HostReviewForm {
  return {
    servings: clampHostServings(drop.servings_final),
    allergens: [...drop.allergens_final],
    diets: [...drop.diet_tags_final],
    buildingId: resolveDefaultHostBuildingId(drop.building_code, buildings),
    room: drop.room ?? "",
    pickupInstructions: drop.pickup_instructions ?? "",
    expiresInMinutes: HOST_EXPIRY_OPTIONS.includes(expiresInMinutes)
      ? expiresInMinutes
      : HOST_DEFAULT_EXPIRY_MINUTES,
    safety: { ...EMPTY_SAFETY, ...(drop.safety_review ?? {}) },
  };
}

/** Toggle one value in a tag list without mutating the original. */
export function toggleTag<T>(list: ReadonlyArray<T>, value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}
