import type {
  Building,
  ClaimResponse,
  DemoAreaId,
  DropResponse,
  InviteResponse,
  SeededPersonaLabel,
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
  if (!clean) return "Campus area (demo)";
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
 * Summarizes the food items on a drop into a concise single-line title.
 */
export function summarizeDropFood(invite: InviteResponse): string {
  const items = invite.drop.vision.items;
  if (!items || items.length === 0) {
    return "Event leftovers";
  }
  return items.map((item) => item.name).join(" + ");
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
 * Pure helper that decides the single primary student card state:
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
