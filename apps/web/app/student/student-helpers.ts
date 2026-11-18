import type {
  ClaimResponse,
  DemoAreaId,
  InviteResponse,
  SeededPersonaLabel,
} from "../../lib/types/api";
import { FIXTURE_DEMO_AREAS } from "../../lib/fixtures/demo-fixtures";

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

export const DEMO_AREA_LABELS: Record<DemoAreaId, string> =
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
 * Formats a drop's building and optional room into a readable campus location string.
 */
export function formatDropLocation(
  buildingCode: string,
  room?: string | null,
): string {
  const cleanBuilding = buildingCode.trim() || "Campus venue";
  const cleanRoom = room?.trim();
  return cleanRoom ? `${cleanBuilding}, Room ${cleanRoom}` : cleanBuilding;
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
