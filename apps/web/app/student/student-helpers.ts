import type {
  Building,
  ClaimResponse,
  DemoAreaId,
  DropResponse,
  FeedDrop,
  FeedUnavailableReason,
  InviteResponse,
  PickupMatchStatus,
  PickupVerification,
  PickupVerificationSource,
  SeededPersonaLabel,
} from "../../lib/types/api";
import {
  PICKUP_CONFIRMATION_NOTICE,
  PICKUP_CONSISTENT_CONFIDENCE_THRESHOLD,
} from "../../lib/types/api";
import { FIXTURE_DEMO_AREAS } from "../../lib/fixtures/demo-fixtures";
import {
  buildWalkingDirectionsUrl,
  isVerifiedBuilding,
} from "../../lib/buildings";

export type StudentCardKind = "waiting" | "invite" | "pickup" | "picked_up";

export interface CollapsedInviteLine {
  id: string;
  locationLabel: string;
  status: "expired" | "declined" | "released";
  summary: string;
}

export type StudentCardState =
  | {
      kind: "waiting";
      activeInvite: null;
      activeClaim: null;
      collapsedLines: CollapsedInviteLine[];
    }
  | {
      kind: "invite";
      activeInvite: InviteResponse;
      activeClaim: null;
      collapsedLines: CollapsedInviteLine[];
    }
  | {
      kind: "pickup";
      activeInvite: InviteResponse;
      activeClaim: ClaimResponse;
      collapsedLines: CollapsedInviteLine[];
    }
  | {
      kind: "picked_up";
      activeInvite: InviteResponse;
      activeClaim: ClaimResponse;
      collapsedLines: CollapsedInviteLine[];
    };

export const DEMO_AREA_LABELS: Record<string, string> =
  FIXTURE_DEMO_AREAS.reduce(
    (acc, area) => {
      acc[area.id] = area.label;
      return acc;
    },
    {} as Record<DemoAreaId, string>,
  );

export const SEEDED_PERSONA_AREA_LABELS: Record<SeededPersonaLabel, string> = {
  A: "Event venue (demo)",
  B: "Event venue (demo)",
  C: "Next building over (demo)",
  D: "Across the quad (demo)",
  E: "Event venue (demo)",
};

/**
 * Formats a student's joined area ID into a readable label, preferring the verified
 * campus building name when present in the directory, or falling back to rehearsal area labels.
 */
export function formatStudentAreaLabel(
  areaId: string | null | undefined,
  buildings: ReadonlyArray<Building> = [],
): string {
  const clean = areaId?.trim();
  if (!clean) return "Campus-wide feed";
  const matchedBuilding = buildings.find((b) => b.id === clean);
  if (matchedBuilding && matchedBuilding.name.trim()) {
    return matchedBuilding.name.trim();
  }
  return DEMO_AREA_LABELS[clean] ?? clean;
}

/**
 * Formats a drop's building and optional room into a readable campus location string.
 * When `building` is provided (from `drop.building` or directory lookup), displays the
 * real building name (`building.name`) rather than the raw slug or code.
 */
export function formatDropLocation(
  buildingCode: string,
  room?: string | null,
  building?: Pick<Building, "name"> | null,
): string {
  const cleanBuilding =
    building?.name?.trim() || buildingCode.trim() || "Campus venue";
  const cleanRoom = room?.trim();
  return cleanRoom ? `${cleanBuilding}, Room ${cleanRoom}` : cleanBuilding;
}

/**
 * Formats a DropResponse's location using `drop.building.name` when present,
 * or looking up `drop.building_code` in the loaded buildings directory.
 */
export function formatDropResponseLocation(
  drop: Pick<DropResponse, "building_code" | "room" | "building">,
  buildings: ReadonlyArray<Building> = [],
): string {
  const resolvedBuilding =
    drop.building ?? buildings.find((b) => b.id === drop.building_code) ?? null;
  return formatDropLocation(drop.building_code, drop.room, resolvedBuilding);
}

/**
 * Returns the trimmed pickup instructions on a drop, or null if blank/absent.
 */
export function getDropPickupInstructions(
  drop: Pick<DropResponse, "pickup_instructions">,
): string | null {
  const trimmed = drop.pickup_instructions?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves the Google Maps walking directions URL for a drop:
 * `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG&travelmode=walking`
 *
 * Only verified real building coordinates (`drop.building`) receive a directions link.
 * Rehearsal drops (`drop.building === null` or unverified) return null.
 */
export function getDropWalkingDirectionsUrl(
  drop: Pick<DropResponse, "building">,
): string | null {
  if (!drop.building || !isVerifiedBuilding(drop.building)) {
    return null;
  }
  return buildWalkingDirectionsUrl(drop.building);
}

/**
 * Summarizes the food items on a drop or invite into a concise single-line title.
 */
export function summarizeDropItems(drop: Pick<DropResponse, "vision">): string {
  const items = drop.vision?.items;
  if (!items || items.length === 0) {
    return "Event leftovers";
  }
  return items.map((item) => item.name).join(" + ");
}

/**
 * Summarizes the food items on an invite into a concise single-line title.
 */
export function summarizeDropFood(invite: InviteResponse): string {
  return summarizeDropItems(invite.drop);
}

/**
 * Plain-language explanation for why a campus feed tile cannot be reserved by this student.
 */
export function formatUnavailableReason(
  reason: FeedUnavailableReason | null | undefined,
  claim?: ClaimResponse | null,
): string | null {
  if (!reason) return null;
  switch (reason) {
    case "allergen_conflict":
      return "Contains an allergen you avoid.";
    case "diet_mismatch":
      return "Does not match your dietary requirements.";
    case "active_claim":
      return claim?.status === "held"
        ? "You currently hold a spot for this drop."
        : "You already have an active hold on another drop.";
    case "capacity":
      return "All servings are currently held or claimed.";
    case "already_reserved":
      if (claim?.status === "held") {
        return "You currently hold a spot for this drop.";
      }
      if (claim?.status === "picked_up") {
        return "You already picked up from this drop.";
      }
      if (claim?.status === "released") {
        return "You released your hold on this drop (one reservation per drop).";
      }
      if (claim?.status === "expired") {
        return "Your hold on this drop expired (one reservation per drop).";
      }
      return "You already used your reservation for this drop.";
    default:
      return "Unavailable to reserve.";
  }
}

export interface StudentFeedView {
  activeHold: { feedDrop: FeedDrop; claim: ClaimResponse } | null;
  focusedDropMissing: boolean;
  orderedDrops: FeedDrop[];
}

/**
 * Organizes campus feed drops for the student screen:
 * - Identifies the student's active held claim if any.
 * - If `focusedDropId` (`?drop=UUID`) matches an active feed drop, places it first and marks it focused;
 *   if `focusedDropId` is provided but absent from the feed, sets `focusedDropMissing = true`.
 */
export function resolveStudentFeedView(
  drops: ReadonlyArray<FeedDrop>,
  focusedDropId?: string | null,
): StudentFeedView {
  const cleanFocus = focusedDropId?.trim() || null;
  let activeHold: { feedDrop: FeedDrop; claim: ClaimResponse } | null = null;

  for (const fd of drops) {
    if (fd.claim?.status === "held") {
      activeHold = { feedDrop: fd, claim: fd.claim };
      break;
    }
  }

  if (!cleanFocus) {
    return {
      activeHold,
      focusedDropMissing: false,
      orderedDrops: [...drops],
    };
  }

  const focusedIndex = drops.findIndex((fd) => fd.drop.id === cleanFocus);
  if (focusedIndex === -1) {
    return {
      activeHold,
      focusedDropMissing: true,
      orderedDrops: [...drops],
    };
  }

  const focusedItem = drops[focusedIndex]!;
  const rest = drops.filter((_, idx) => idx !== focusedIndex);
  return {
    activeHold,
    focusedDropMissing: false,
    orderedDrops: [focusedItem, ...rest],
  };
}

/**
 * Collapses non-active (expired, declined, or released-claim) invites into short single-line summaries
 * so stale cards never clutter the student screen.
 */
export function buildCollapsedInviteLines(
  invites: ReadonlyArray<InviteResponse>,
  excludeInviteId?: string | null,
): CollapsedInviteLine[] {
  const lines: CollapsedInviteLine[] = [];

  for (const inv of invites) {
    if (excludeInviteId && inv.id === excludeInviteId) {
      continue;
    }

    const locationLabel = formatDropLocation(
      inv.drop.building_code,
      inv.drop.room,
      inv.drop.building,
    );
    const foodTitle = summarizeDropFood(inv);

    if (inv.status === "declined") {
      lines.push({
        id: inv.id,
        locationLabel,
        status: "declined",
        summary: `Declined • ${foodTitle} (${locationLabel})`,
      });
    } else if (inv.status === "expired" || inv.claim?.status === "expired") {
      lines.push({
        id: inv.id,
        locationLabel,
        status: "expired",
        summary: `Expired • ${foodTitle} (${locationLabel})`,
      });
    } else if (inv.claim?.status === "released") {
      lines.push({
        id: inv.id,
        locationLabel,
        status: "released",
        summary: `Released • ${foodTitle} (${locationLabel})`,
      });
    }
  }

  return lines;
}

/**
 * Pure helper that decides the single primary student card state for seeded rehearsal mode:
 * - "pickup": student has an active held claim (replaces the invite card completely)
 * - "invite": student has an active sent invite ready to reserve or decline
 * - "picked_up": student confirmed pickup on their claim
 * - "waiting": no active claim or sent invite; shows one calm waiting card
 */
export function resolveStudentCardState(
  invites: ReadonlyArray<InviteResponse>,
): StudentCardState {
  // 1. Active held claim -> single pickup card (never show invite card and claim together)
  const heldInvite = invites.find((inv) => inv.claim?.status === "held");
  if (heldInvite && heldInvite.claim) {
    return {
      kind: "pickup",
      activeInvite: heldInvite,
      activeClaim: heldInvite.claim,
      collapsedLines: buildCollapsedInviteLines(invites, heldInvite.id),
    };
  }

  // 2. Active sent invite -> single invite card
  const sentInvite = invites.find((inv) => inv.status === "sent");
  if (sentInvite) {
    return {
      kind: "invite",
      activeInvite: sentInvite,
      activeClaim: null,
      collapsedLines: buildCollapsedInviteLines(invites, sentInvite.id),
    };
  }

  // 3. Picked-up claim -> simple done card
  const pickedUpInvite = invites.find(
    (inv) => inv.claim?.status === "picked_up",
  );
  if (pickedUpInvite && pickedUpInvite.claim) {
    return {
      kind: "picked_up",
      activeInvite: pickedUpInvite,
      activeClaim: pickedUpInvite.claim,
      collapsedLines: buildCollapsedInviteLines(invites, pickedUpInvite.id),
    };
  }

  // 4. Waiting state -> one calm card
  return {
    kind: "waiting",
    activeInvite: null,
    activeClaim: null,
    collapsedLines: buildCollapsedInviteLines(invites, null),
  };
}

/**
 * Generates a RFC 4122 v4 UUID for `request_id` per selected pickup photo.
 * Uses `crypto.randomUUID()` when available, with a deterministic-format fallback.
 */
export function generatePickupRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface PickupPhotoValidationResult {
  valid: boolean;
  error: string | null;
}

export const MAX_PICKUP_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MiB

/**
 * Validates a selected pickup photo client-side before upload (JPEG/PNG only, 10 MiB max).
 */
export function validatePickupPhotoFile(
  file: Pick<File, "type" | "size" | "name"> | null | undefined,
): PickupPhotoValidationResult {
  if (!file) {
    return {
      valid: false,
      error: "Choose or take a JPEG or PNG photo of the food first.",
    };
  }
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const isJpegOrPng =
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/jpg" ||
    (!mime &&
      (name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".png")));

  if (!isJpegOrPng) {
    return {
      valid: false,
      error: "Only JPEG and PNG food photos are supported.",
    };
  }
  if (typeof file.size === "number" && file.size <= 0) {
    return {
      valid: false,
      error: "Selected photo file is empty.",
    };
  }
  if (typeof file.size === "number" && file.size > MAX_PICKUP_PHOTO_BYTES) {
    return {
      valid: false,
      error: "Photo exceeds the 10 MiB size limit. Choose a smaller image.",
    };
  }
  return { valid: true, error: null };
}

/**
 * Revokes a temporary blob object URL if present so local previews are never retained.
 */
export function revokePreviewObjectUrl(
  previewUrl: string | null | undefined,
  revokeFn?: (url: string) => void,
): void {
  if (!previewUrl) return;
  const revoker =
    revokeFn ??
    (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function"
      ? (u: string) => URL.revokeObjectURL(u)
      : null);
  if (revoker) {
    try {
      revoker(previewUrl);
    } catch {
      // ignore invalid object URL errors
    }
  }
}

/**
 * Formats the verification provider source into an honest UI label.
 */
export function formatPickupVerificationSourceLabel(
  source: PickupVerificationSource,
): string {
  if (source === "openrouter") {
    return "Live Gemini via OpenRouter";
  }
  return "Simulated demo assessment";
}

/**
 * Formats a match_status into a user-facing badge title.
 */
export function formatPickupMatchStatusLabel(
  matchStatus: PickupMatchStatus | null,
): string {
  if (matchStatus === "consistent") {
    return "Consistent with listing";
  }
  if (matchStatus === "uncertain") {
    return "Uncertain match";
  }
  if (matchStatus === "inconsistent") {
    return "Inconsistent with listing";
  }
  return "Assessment pending";
}

/**
 * Formats a 0..1 confidence score as a percentage string (e.g. "89%").
 */
export function formatPickupConfidencePercent(
  confidence: number | null | undefined,
): string | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return null;
  }
  const clamped = Math.max(0, Math.min(1, confidence));
  return `${Math.round(clamped * 100)}%`;
}

export interface PickupVerificationActionState {
  phase:
    | "idle"
    | "processing"
    | "consistent_ready"
    | "needs_retry_or_review"
    | "review_pending"
    | "review_approved"
    | "review_rejected"
    | "expired_or_superseded"
    | "failed";
  canCompletePickup: boolean;
  canRequestHostReview: boolean;
  canRetryPhoto: boolean;
  verificationId: string | null;
  notice: string;
}

/**
 * Pure state machine that derives what actions are enabled on a student's held campus-feed card
 * from the latest `PickupVerification` and claim/drop expiry state.
 *
 * Rules (docs/PICKUP_CONFIRMATION_CONTRACT.md):
 * - Direct feed pickup without a verified consistent result is NEVER enabled.
 * - `canCompletePickup` requires `verification.status === "ready"`, `match_status === "consistent"`,
 *   `confidence >= 0.8` (if provided), `can_confirm === true`, active held claim, and not rejected/superseded/expired.
 * - `uncertain` or `inconsistent` results never enable direct student completion; they only allow retry
 *   with a new photo or `POST /claims/{id}/pickup-review` (when `review_status === "not_requested"`).
 */
export function resolvePickupVerificationActions(
  verification: PickupVerification | null | undefined,
  claimHeldAndUnexpired = true,
): PickupVerificationActionState {
  const notice = verification?.notice?.trim() || PICKUP_CONFIRMATION_NOTICE;

  if (!claimHeldAndUnexpired) {
    return {
      phase: "expired_or_superseded",
      canCompletePickup: false,
      canRequestHostReview: false,
      canRetryPhoto: false,
      verificationId: verification?.id ?? null,
      notice,
    };
  }

  if (!verification) {
    return {
      phase: "idle",
      canCompletePickup: false,
      canRequestHostReview: false,
      canRetryPhoto: true,
      verificationId: null,
      notice,
    };
  }

  if (verification.status === "processing") {
    return {
      phase: "processing",
      canCompletePickup: false,
      canRequestHostReview: false,
      canRetryPhoto: false,
      verificationId: verification.id,
      notice,
    };
  }

  if (verification.status === "failed") {
    return {
      phase: "failed",
      canCompletePickup: false,
      canRequestHostReview: false,
      canRetryPhoto: true,
      verificationId: verification.id,
      notice,
    };
  }

  if (
    verification.review_status === "expired" ||
    verification.review_status === "superseded"
  ) {
    return {
      phase: "expired_or_superseded",
      canCompletePickup: false,
      canRequestHostReview: false,
      canRetryPhoto: true,
      verificationId: verification.id,
      notice,
    };
  }

  if (verification.review_status === "approved") {
    return {
      phase: "review_approved",
      canCompletePickup: false,
      canRequestHostReview: false,
      canRetryPhoto: false,
      verificationId: verification.id,
      notice,
    };
  }

  if (verification.review_status === "rejected") {
    return {
      phase: "review_rejected",
      canCompletePickup: false,
      canRequestHostReview: false,
      canRetryPhoto: true,
      verificationId: verification.id,
      notice,
    };
  }

  if (verification.review_status === "pending") {
    return {
      phase: "review_pending",
      canCompletePickup: false,
      canRequestHostReview: false,
      canRetryPhoto: true,
      verificationId: verification.id,
      notice,
    };
  }

  const meetsThreshold =
    typeof verification.confidence === "number" &&
    Number.isFinite(verification.confidence) &&
    verification.confidence >= PICKUP_CONSISTENT_CONFIDENCE_THRESHOLD;

  if (
    verification.match_status === "consistent" &&
    meetsThreshold &&
    verification.can_confirm
  ) {
    return {
      phase: "consistent_ready",
      canCompletePickup: true,
      canRequestHostReview: false,
      canRetryPhoto: true,
      verificationId: verification.id,
      notice,
    };
  }

  return {
    phase: "needs_retry_or_review",
    canCompletePickup: false,
    canRequestHostReview: verification.review_status === "not_requested",
    canRetryPhoto: true,
    verificationId: verification.id,
    notice,
  };
}
