import { buildWalkingDirectionsUrl } from "./buildings";
import {
  PANTRY_CARE_SOURCE_URL,
  PANTRY_CATERING_POLICY_URL,
  PANTRY_DEMO_NOTICE_FALLBACK,
  type Counts,
  type DropResponse,
  type PantryDestination,
  type PantryReferral,
  type PantryStatus,
  type SafetyReview,
} from "./types/api";

/**
 * Pure Milestone 4 CARE Pantry Fallback helpers (simulation only).
 *
 * Contract guarantees (`docs/PANTRY_FALLBACK_CONTRACT.md`):
 * - Uses server policy notice verbatim when loaded, falling back to the
 *   required static simulation/policy notice only when unloaded.
 * - Counts never combine pantry_held or pantry_transferred into student
 *   `held` or `picked_up`.
 * - Walking directions links use destination coordinates only (no origin,
 *   no GPS, no API key).
 * - Coordinator accept quantity defaults to `min(requested, eligible)` and
 *   never silently overbooks.
 */

export const PANTRY_POLL_INTERVAL_MS = 2000;
export const PANTRY_MAX_SERVINGS = 500;

export interface NormalizedCounts {
  total: number;
  available: number;
  held: number;
  picked_up: number;
  pantry_held: number;
  pantry_transferred: number;
}

function toSafeNonNegInt(value: number | undefined | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/**
 * Normalizes a `Counts` object (including legacy 4-field payloads without
 * pantry fields) so `pantry_held` and `pantry_transferred` default to 0.
 */
export function normalizeCounts(counts?: Counts | null): NormalizedCounts {
  return {
    total: toSafeNonNegInt(counts?.total),
    available: toSafeNonNegInt(counts?.available),
    held: toSafeNonNegInt(counts?.held),
    picked_up: toSafeNonNegInt(counts?.picked_up),
    pantry_held: toSafeNonNegInt(counts?.pantry_held),
    pantry_transferred: toSafeNonNegInt(counts?.pantry_transferred),
  };
}

/**
 * Returns the backend policy notice verbatim when present, falling back to
 * the required static simulation notice only when unloaded.
 */
export function resolvePantryNotice(serverNotice?: string | null): string {
  if (typeof serverNotice === "string" && serverNotice.trim().length > 0) {
    return serverNotice;
  }
  return PANTRY_DEMO_NOTICE_FALLBACK;
}

/**
 * Formats the verified pantry destination building and room without duplicating
 * a leading "Room" prefix.
 */
export function formatPantryDestinationLocation(
  destination: Pick<PantryDestination, "building" | "room">,
): string {
  const buildingName =
    destination.building?.name?.trim() || "Joe Mack Wilson Student Center";
  const rawRoom = destination.room?.trim() || "";
  if (!rawRoom) return buildingName;
  if (/^room\b/i.test(rawRoom)) {
    return `${buildingName}, ${rawRoom}`;
  }
  return `${buildingName}, Room ${rawRoom}`;
}

/**
 * Resolves a safe Google Maps walking directions URL (destination coordinates
 * only, never origin or API key) from a `PantryDestination`.
 */
export function resolvePantryDirectionsUrl(
  destination?: PantryDestination | null,
): string | null {
  const raw = destination?.directions_url?.trim();
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (
        parsed.protocol === "https:" &&
        parsed.hostname === "www.google.com" &&
        parsed.pathname === "/maps/dir/" &&
        !parsed.searchParams.has("origin") &&
        !parsed.searchParams.has("key") &&
        parsed.searchParams.has("destination")
      ) {
        return raw;
      }
    } catch {
      // Fall through to building coordinate builder
    }
  }
  return buildWalkingDirectionsUrl(destination?.building);
}

/**
 * Resolves official CARE and catering policy links from a loaded destination,
 * falling back to verified static URLs when unloaded.
 */
export function resolvePantryOfficialLinks(
  destination?: PantryDestination | null,
): {
  careSourceUrl: string;
  cateringPolicyUrl: string;
} {
  return {
    careSourceUrl:
      destination?.care_source_url?.trim() || PANTRY_CARE_SOURCE_URL,
    cateringPolicyUrl:
      destination?.catering_policy_url?.trim() || PANTRY_CATERING_POLICY_URL,
  };
}

/**
 * Formats a wire `PantryStatus` into a concise, truthful simulation label.
 */
export function formatPantryStatusLabel(status: PantryStatus | null): string {
  switch (status) {
    case "suggested":
      return "Suggested";
    case "requested":
      return "Requested";
    case "accepted":
      return "Accepted";
    case "handoff_confirmed":
      return "Handed off (simulated)";
    case "rejected":
      return "Declined";
    case "expired":
      return "Expired";
    default:
      return "Not requested";
  }
}

/**
 * Computes the coordinator's default accept quantity: `min(requested, eligible)`,
 * clamped to `[0, 500]`, never silently overbooking available stock.
 */
export function computeDefaultCoordinatorAcceptServings(
  requestedServings: number,
  eligibleServings: number,
): number {
  const req = toSafeNonNegInt(requestedServings);
  const elig = toSafeNonNegInt(eligibleServings);
  return Math.min(req, elig, PANTRY_MAX_SERVINGS);
}

/**
 * Clamps a user-entered serving count to `[1, min(500, maxAllowed)]` when
 * `maxAllowed >= 1`, or `0` when no servings are available.
 */
export function clampPantryQuantity(value: number, maxAllowed: number): number {
  const cap = Math.min(toSafeNonNegInt(maxAllowed), PANTRY_MAX_SERVINGS);
  if (cap <= 0) return 0;
  const parsed = Number.isFinite(value) ? Math.trunc(value) : 1;
  return Math.max(1, Math.min(cap, parsed));
}

function isIsoExpired(
  expiresAtIso: string | null | undefined,
  nowIso: string,
): boolean {
  if (!expiresAtIso) return false;
  const expMs = Date.parse(expiresAtIso);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(expMs) || !Number.isFinite(nowMs)) return false;
  return nowMs >= expMs;
}

export interface HostPantryActionState {
  isCampusFeed: boolean;
  isExpired: boolean;
  eligibleServings: number;
  status: PantryStatus | null;
  canRequest: boolean;
  canConfirmHandoff: boolean;
  stateNote: string | null;
}

/**
 * Determines which host pantry actions are valid on the published Pickup counts
 * screen, keeping controls disabled when expired, exhausted, seeded, or terminal.
 */
export function resolveHostPantryActionState(
  drop: Pick<
    DropResponse,
    "status" | "distribution_mode" | "counts" | "expires_at"
  >,
  referral: PantryReferral | null,
  nowIso: string,
): HostPantryActionState {
  const isCampusFeed =
    (drop.distribution_mode ?? "seeded_waves") === "campus_feed";
  const isExpired =
    drop.status === "expired" ||
    referral?.status === "expired" ||
    isIsoExpired(drop.expires_at, nowIso) ||
    isIsoExpired(referral?.expires_at, nowIso);

  const counts = normalizeCounts(drop.counts);
  const eligibleServings = isExpired
    ? 0
    : referral
      ? Math.min(counts.available, toSafeNonNegInt(referral.eligible_servings))
      : counts.available;

  const status: PantryStatus | null = referral?.status ?? null;

  if (!isCampusFeed) {
    return {
      isCampusFeed: false,
      isExpired,
      eligibleServings: 0,
      status,
      canRequest: false,
      canConfirmHandoff: false,
      stateNote:
        "Demo pantry fallback is available for campus-feed drops only. Seeded wave rehearsal remains unchanged.",
    };
  }

  if (status === "handoff_confirmed") {
    return {
      isCampusFeed: true,
      isExpired,
      eligibleServings,
      status,
      canRequest: false,
      canConfirmHandoff: false,
      stateNote: `Simulated handoff recorded for ${referral?.transferred_servings ?? 0} ${
        (referral?.transferred_servings ?? 0) === 1 ? "serving" : "servings"
      }. Student pickups are unchanged, and no repeated referral is created in this demo.`,
    };
  }

  if (status === "rejected") {
    return {
      isCampusFeed: true,
      isExpired,
      eligibleServings,
      status,
      canRequest: false,
      canConfirmHandoff: false,
      stateNote:
        "Demo coordinator rejected this referral. No servings were reserved for the pantry, and no repeated referral is created in this demo.",
    };
  }

  if (isExpired) {
    return {
      isCampusFeed: true,
      isExpired: true,
      eligibleServings: 0,
      status: status ?? "expired",
      canRequest: false,
      canConfirmHandoff: false,
      stateNote:
        "This drop has passed its original deadline. Any untransferred pantry allocation was released on the expired drop and cannot reenter the student feed.",
    };
  }

  if (status === "accepted") {
    const accepted = toSafeNonNegInt(referral?.accepted_servings);
    return {
      isCampusFeed: true,
      isExpired: false,
      eligibleServings,
      status,
      canRequest: false,
      canConfirmHandoff: accepted > 0,
      stateNote: `Demo coordinator reserved ${accepted} ${
        accepted === 1 ? "serving" : "servings"
      } (counted in Pantry reserved). Confirm simulated handoff below before the drop deadline.`,
    };
  }

  if (status === "requested") {
    return {
      isCampusFeed: true,
      isExpired: false,
      eligibleServings,
      status,
      canRequest: false,
      canConfirmHandoff: false,
      stateNote: `Demo referral requested for ${referral?.requested_servings ?? 0} ${
        (referral?.requested_servings ?? 0) === 1 ? "serving" : "servings"
      }. Requesting does not reserve stock — students can still reserve unallocated servings until the demo coordinator accepts.`,
    };
  }

  if (eligibleServings <= 0) {
    return {
      isCampusFeed: true,
      isExpired: false,
      eligibleServings: 0,
      status,
      canRequest: false,
      canConfirmHandoff: false,
      stateNote:
        "No unallocated servings are currently available to refer. Existing student holds and pickups are never overridden.",
    };
  }

  return {
    isCampusFeed: true,
    isExpired: false,
    eligibleServings,
    status,
    canRequest: true,
    canConfirmHandoff: false,
    stateNote:
      status === "suggested"
        ? "Demo threshold reached (within 10 minutes of drop deadline with unallocated servings). Review policy notice and request explicitly if desired."
        : null,
  };
}

export interface CoordinatorActionGuard {
  isActionableStatus: boolean;
  isExpired: boolean;
  maxAcceptable: number;
  canAccept: boolean;
  canReject: boolean;
  staleReason: string | null;
}

/**
 * Evaluates whether the demo coordinator can accept or reject a referral card,
 * preventing stale, expired, unacknowledged, or overbooked submissions.
 */
export function resolveCoordinatorActionGuard(
  referral: Pick<
    PantryReferral,
    | "status"
    | "requested_servings"
    | "eligible_servings"
    | "expires_at"
    | "drop"
  >,
  chosenServings: number,
  policyAcknowledged: boolean,
  nowIso: string,
): CoordinatorActionGuard {
  const isExpired =
    referral.status === "expired" ||
    referral.drop.status === "expired" ||
    isIsoExpired(referral.expires_at, nowIso) ||
    isIsoExpired(referral.drop.expires_at, nowIso);

  const dropCounts = normalizeCounts(referral.drop.counts);
  const currentAvailable = Math.min(
    toSafeNonNegInt(referral.eligible_servings),
    dropCounts.available,
  );
  const maxAcceptable = Math.min(
    toSafeNonNegInt(referral.requested_servings),
    currentAvailable,
    PANTRY_MAX_SERVINGS,
  );

  if (referral.status !== "requested") {
    return {
      isActionableStatus: false,
      isExpired,
      maxAcceptable: 0,
      canAccept: false,
      canReject: false,
      staleReason: null,
    };
  }

  if (isExpired) {
    return {
      isActionableStatus: true,
      isExpired: true,
      maxAcceptable: 0,
      canAccept: false,
      canReject: false,
      staleReason:
        "Drop deadline has passed. Accept and reject controls are disabled.",
    };
  }

  const parsedChosen = Number.isFinite(chosenServings)
    ? Math.trunc(chosenServings)
    : 0;
  const quantityValid =
    maxAcceptable >= 1 && parsedChosen >= 1 && parsedChosen <= maxAcceptable;

  let staleReason: string | null = null;
  if (maxAcceptable <= 0) {
    staleReason =
      "0 unallocated servings remain right now (students reserved or collected all available servings). You may reject this referral or wait for a student hold release.";
  } else if (parsedChosen > maxAcceptable) {
    staleReason = `Only ${maxAcceptable} ${
      maxAcceptable === 1 ? "serving is" : "servings are"
    } currently eligible to accept (max min(requested, available)).`;
  }

  return {
    isActionableStatus: true,
    isExpired: false,
    maxAcceptable,
    canAccept: policyAcknowledged && quantityValid,
    canReject: policyAcknowledged,
    staleReason,
  };
}

export interface SafetyAssertionItem {
  key: string;
  label: string;
  confirmed: boolean;
}

/**
 * Formats host-reviewed safety checklist flags for the coordinator review card.
 * Always presented as host assertions, never as certified food safety.
 */
export function summarizeReviewedSafetyAssertions(
  safetyReview?: SafetyReview | null,
): SafetyAssertionItem[] {
  if (!safetyReview) {
    return [];
  }
  const items: SafetyAssertionItem[] = [
    {
      key: "covered_and_temperature_safe",
      label: "Covered & temperature safe (host assertion)",
      confirmed: Boolean(safetyReview.covered_and_temperature_safe),
    },
    {
      key: "served_within_two_hours",
      label: "Served within 2 hours (host assertion)",
      confirmed: Boolean(safetyReview.served_within_two_hours),
    },
    {
      key: "untouched",
      label: "Untouched shared trays (host assertion)",
      confirmed: Boolean(safetyReview.untouched),
    },
  ];
  if (safetyReview.ingredient_information_checked) {
    items.push({
      key: "ingredient_information_checked",
      label: "Ingredient information checked (host assertion)",
      confirmed: true,
    });
  }
  if (safetyReview.religious_diets_confirmed) {
    items.push({
      key: "religious_diets_confirmed",
      label: "Religious diet tags confirmed (host assertion)",
      confirmed: true,
    });
  }
  return items;
}

export interface PantryInventoryTile {
  key:
    | "available"
    | "held"
    | "picked_up"
    | "pantry_held"
    | "accepted"
    | "pantry_transferred";
  label: string;
  value: number;
  group: "student" | "pantry";
}

/**
 * The coordinator's inventory view. Student holds and pickups stay apart from pantry
 * allocations; "Accepted servings" is the referral's historical acceptance and is
 * labelled separately from currently reserved pantry stock.
 */
export function buildPantryInventoryTiles(
  counts: Counts | null | undefined,
  acceptedServings: number,
): PantryInventoryTile[] {
  const c = normalizeCounts(counts);
  return [
    {
      key: "available",
      label: "Available",
      value: c.available,
      group: "student",
    },
    { key: "held", label: "Student holds", value: c.held, group: "student" },
    {
      key: "picked_up",
      label: "Student pickups",
      value: c.picked_up,
      group: "student",
    },
    {
      key: "pantry_held",
      label: "Pantry reserved",
      value: c.pantry_held,
      group: "pantry",
    },
    {
      key: "accepted",
      label: "Accepted servings",
      value: toSafeNonNegInt(acceptedServings),
      group: "pantry",
    },
    {
      key: "pantry_transferred",
      label: "Pantry transfers",
      value: c.pantry_transferred,
      group: "pantry",
    },
  ];
}

/** A short food title for a referral card, from the host's estimated items. */
export function summarizePantryFood(
  drop: Pick<DropResponse, "vision">,
): string {
  const names = drop.vision.items
    .map((item) => item.name.trim())
    .filter(Boolean);
  if (names.length === 0) return "Shared food";
  return names.length <= 2
    ? names.join(" & ")
    : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

/** Notes that describe how an estimate was produced, not the food; never shown to people. */
const INTERNAL_NOTE_PATTERN =
  /^(fixture|demo|cached|sample|synthetic|test)$|\b(simulated|fixture|cached estimate|rehearsal|placeholder)\b/i;

/**
 * A one-line description for a pantry card: the host-reviewed items with their estimated
 * portions, plus the host's own note when it describes the food. Provider and fixture
 * wording is dropped so the card reads as food, not as a developer screen.
 */
export function describePantryListing(
  drop: Pick<DropResponse, "vision">,
): string {
  const items = drop.vision.items
    .filter((item) => item.name.trim())
    .map((item) => {
      const count = toSafeNonNegInt(item.count_estimate);
      const unit = item.portion_unit.trim();
      if (count <= 0 || !unit) return item.name.trim();
      const plural = count === 1 || unit.endsWith("s") ? unit : `${unit}s`;
      return `${item.name.trim()} (about ${count} ${plural})`;
    });
  const note = drop.vision.notes?.trim() ?? "";
  const parts = items.length > 0 ? [items.join(", ")] : [];
  if (note && !INTERNAL_NOTE_PATTERN.test(note)) parts.push(note);
  return parts.join(". ") || "Shared food";
}

export type CoordinatorSectionKey = "incoming" | "accepted" | "completed";

export interface CoordinatorSection {
  key: CoordinatorSectionKey;
  title: string;
  description: string;
  emptyText: string;
  referrals: PantryReferral[];
}

const SECTION_FOR_STATUS: Record<PantryStatus, CoordinatorSectionKey> = {
  suggested: "incoming",
  requested: "incoming",
  accepted: "accepted",
  handoff_confirmed: "completed",
  rejected: "completed",
  expired: "completed",
};

/**
 * Groups the coordinator queue into Incoming, Accepted and Completed, keeping the server's
 * deterministic order inside each group. Requests needing a decision come first in
 * Incoming; suggestions the host has not sent yet follow them.
 */
export function groupCoordinatorReferrals(
  referrals: ReadonlyArray<PantryReferral>,
): CoordinatorSection[] {
  const sections: CoordinatorSection[] = [
    {
      key: "incoming",
      title: "Incoming",
      description: "Requests waiting for your decision.",
      emptyText: "No incoming requests.",
      referrals: [],
    },
    {
      key: "accepted",
      title: "Accepted",
      description: "Waiting for the host to confirm the simulated handoff.",
      emptyText: "Nothing accepted right now.",
      referrals: [],
    },
    {
      key: "completed",
      title: "Completed",
      description: "Handed off, declined or expired.",
      emptyText: "No completed requests yet.",
      referrals: [],
    },
  ];
  const byKey = new Map(sections.map((section) => [section.key, section]));
  for (const referral of referrals) {
    const key = SECTION_FOR_STATUS[referral.status] ?? "completed";
    byKey.get(key)?.referrals.push(referral);
  }
  const incoming = byKey.get("incoming");
  if (incoming) {
    incoming.referrals = [
      ...incoming.referrals.filter((r) => r.status === "requested"),
      ...incoming.referrals.filter((r) => r.status !== "requested"),
    ];
  }
  return sections;
}
