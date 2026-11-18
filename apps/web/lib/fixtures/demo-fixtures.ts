/**
 * Deterministic offline API fixture state for Owl Plate web when the FastAPI backend
 * is offline or unreachable during independent frontend development/testing.
 *
 * Privacy & Contract Rules:
 * - Never includes data/seed/demo.json or any priority tier / score fields.
 * - Explicitly marks vision_source = "fixture" and is_demo = true.
 * - Uses H3 resolution 11 cells computed dynamically from arbitrary placeholder origin (0.0, 0.0).
 * - Persona reason codes use generic safe codes only ("nearby", "diet_match", "fair_share", "allergen_conflict", "out_of_range", "diet_mismatch").
 */

import { latLngToCell, gridDisk } from "h3-js";
import type {
  Allergen,
  ClaimResponse,
  Counts,
  DemoCredential,
  DemoResetResponse,
  DemoTick,
  DemoTickResponse,
  DispatchResponse,
  DropEdit,
  DropResponse,
  InviteResponse,
  InvitesResponse,
  PersonaDecision,
  Preferences,
  PresenceRequest,
  PresenceResponse,
  PushTokenRequest,
  PushTokenResponse,
  VisionEstimate,
  WaveResponse,
} from "../types/api";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  RELIGIOUS_DIETS,
} from "../types/api";

const STORAGE_KEY = "owl_plate_offline_fixture_state_v2";
const H3_RESOLUTION = 11;

// Arbitrary placeholder coordinates (0.0, 0.0) per API_CONTRACT.md
const ORIGIN_CELL = latLngToCell(0.0, 0.0, H3_RESOLUTION);

function getCellAtDistance(
  origin: string,
  distance: number,
  indexOffset = 0,
): string {
  if (distance <= 0) return origin;
  const diskCurrent = gridDisk(origin, distance);
  const diskPrev = new Set(gridDisk(origin, distance - 1));
  const ringCells = diskCurrent.filter((c) => !diskPrev.has(c));
  if (ringCells.length === 0) return origin;
  return ringCells[indexOffset % ringCells.length] ?? origin;
}

interface InternalPersonaConfig {
  token: DemoCredential;
  label: "A" | "B" | "C" | "D" | "E";
  ringDistance: number;
  h3Cell: string;
  preferences: Preferences;
}

interface InternalInvite {
  id: string;
  dropId: string;
  personaLabel: "A" | "B" | "C" | "D" | "E";
  waveNumber: number;
  status: "sent" | "claimed" | "declined" | "expired";
  reasonCodes: string[];
  sentAt: string;
  expiresAt: string;
  claimId: string | null;
}

interface InternalClaim {
  id: string;
  inviteId: string;
  dropId: string;
  personaLabel: "A" | "B" | "C" | "D" | "E";
  status: "held" | "picked_up" | "released" | "expired";
  heldUntil: string;
}

interface OfflineFixtureStore {
  serverTimeIso: string;
  activeDropId: string;
  drops: Record<string, DropResponse>;
  wavesByDrop: Record<string, WaveResponse[]>;
  invites: Record<string, InternalInvite>;
  claims: Record<string, InternalClaim>;
  personas: Record<"A" | "B" | "C" | "D" | "E", InternalPersonaConfig>;
  presenceUntilByToken: Record<string, string>;
  pushRegisteredByToken: Record<string, boolean>;
}

function createInitialPersonas(): Record<
  "A" | "B" | "C" | "D" | "E",
  InternalPersonaConfig
> {
  return {
    A: {
      token: "demo-student-A",
      label: "A",
      ringDistance: 0,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 0, 0),
      preferences: { allergens: [], diets: [], alerts_paused: false },
    },
    B: {
      token: "demo-student-B",
      label: "B",
      ringDistance: 0,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 0, 1),
      preferences: { allergens: ["dairy"], diets: [], alerts_paused: false },
    },
    C: {
      token: "demo-student-C",
      label: "C",
      ringDistance: 1,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 1, 1),
      preferences: { allergens: [], diets: [], alerts_paused: false },
    },
    D: {
      token: "demo-student-D",
      label: "D",
      ringDistance: 4,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 4, 2),
      preferences: { allergens: [], diets: [], alerts_paused: false },
    },
    E: {
      token: "demo-student-E",
      label: "E",
      ringDistance: 0,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 0, 2),
      preferences: {
        allergens: [],
        diets: ["vegetarian"],
        alerts_paused: false,
      },
    },
  };
}

function createDefaultVision(note?: string): VisionEstimate {
  const isVegNote = note?.toLowerCase().includes("vegetarian") ?? false;
  const lowConfidence = note?.toLowerCase().includes("blurry") ?? false;
  const confidence = lowConfidence ? 0.52 : 0.84;
  const baseAllergens: Allergen[] = ["dairy", "gluten"];
  const allergensLikely: Allergen[] =
    confidence < 0.6 ? [...ALLERGENS] : baseAllergens;

  return {
    items: [
      {
        name: "Cheese & Pepperoni Pizza Trays",
        portion_unit: "slice",
        count_estimate: 6,
      },
      {
        name: "Assorted Club Wraps",
        portion_unit: "half-wrap",
        count_estimate: 4,
      },
    ],
    servings_estimate: 2,
    servings_low: 2,
    servings_high: 4,
    allergens_likely: allergensLikely,
    // Vision never asserts halal, kosher, or pork_free per API_CONTRACT.md
    diet_tags: isVegNote ? ["vegetarian"] : [],
    confidence,
    notes: note
      ? `Offline cached fixture estimate (Host note: "${note}")`
      : "Offline cached fixture estimate: two trays from club meeting.",
  };
}

function createInitialStore(): OfflineFixtureStore {
  const now = new Date("2026-11-18T17:00:00Z");
  return {
    serverTimeIso: now.toISOString(),
    activeDropId: "",
    drops: {},
    wavesByDrop: {},
    invites: {},
    claims: {},
    personas: createInitialPersonas(),
    presenceUntilByToken: {},
    pushRegisteredByToken: {},
  };
}

function loadStore(): OfflineFixtureStore {
  if (typeof window === "undefined") {
    return createInitialStore();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = createInitialStore();
      saveStore(fresh);
      return fresh;
    }
    return JSON.parse(raw) as OfflineFixtureStore;
  } catch {
    return createInitialStore();
  }
}

function saveStore(store: OfflineFixtureStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

function recomputeCounts(store: OfflineFixtureStore, dropId: string): Counts {
  const drop = store.drops[dropId];
  if (!drop) {
    return { total: 0, available: 0, held: 0, picked_up: 0 };
  }
  const claims = Object.values(store.claims).filter((c) => c.dropId === dropId);
  const held = claims.filter((c) => c.status === "held").length;
  const pickedUp = claims.filter((c) => c.status === "picked_up").length;
  const available = Math.max(0, drop.servings_final - held - pickedUp);
  const counts: Counts = {
    total: drop.servings_final,
    available,
    held,
    picked_up: pickedUp,
  };
  drop.counts = counts;
  if (
    drop.status === "live" &&
    available === 0 &&
    held === 0 &&
    pickedUp >= drop.servings_final
  ) {
    drop.status = "claimed_out";
  }
  return counts;
}

function planWaveForDrop(
  store: OfflineFixtureStore,
  drop: DropResponse,
  ringK: number,
): void {
  const waves = store.wavesByDrop[drop.id] ?? [];
  const nextWaveNumber = waves.length + 1;
  const counts = recomputeCounts(store, drop.id);
  if (counts.available <= 0) return;

  const alreadyInvitedLabels = new Set(
    Object.values(store.invites)
      .filter((inv) => inv.dropId === drop.id)
      .map((inv) => inv.personaLabel),
  );

  const eligible: InternalPersonaConfig[] = [];
  for (const label of ["A", "B", "C", "D", "E"] as const) {
    const p = store.personas[label];
    if (alreadyInvitedLabels.has(label)) continue;
    if (p.preferences.alerts_paused) continue;
    // Allergen hard filter
    const hasAllergenConflict = p.preferences.allergens.some((a) =>
      drop.allergens_final.includes(a),
    );
    if (hasAllergenConflict) continue;
    // Diet hard filter
    const missingDiet = p.preferences.diets.some(
      (d) => !drop.diet_tags_final.includes(d),
    );
    if (missingDiet) continue;
    // Ring filter
    if (p.ringDistance > ringK) continue;

    eligible.push(p);
  }

  // Match API smoke behavior: 2 available servings -> wave 1 invites A and C; 1 available -> wave 2 invites D
  const targetCount = Math.min(eligible.length, counts.available);
  const selected = eligible.slice(0, targetCount);
  const nowMs = new Date(store.serverTimeIso).getTime();
  const expiresIso = new Date(nowMs + 60 * 1000).toISOString();

  for (const p of selected) {
    const inviteId = `inv-${drop.id.slice(0, 8)}-w${nextWaveNumber}-${p.label}`;
    const reasonCodes: string[] = ["nearby", "fair_share"];
    if (p.preferences.diets.length > 0) {
      reasonCodes.push("diet_match");
    }
    store.invites[inviteId] = {
      id: inviteId,
      dropId: drop.id,
      personaLabel: p.label,
      waveNumber: nextWaveNumber,
      status: "sent",
      reasonCodes,
      sentAt: store.serverTimeIso,
      expiresAt: expiresIso,
      claimId: null,
    };
  }

  waves.push({
    number: nextWaveNumber,
    ring_k: ringK,
    planned_at: store.serverTimeIso,
    invite_count: selected.length,
  });
  store.wavesByDrop[drop.id] = waves;
}

export function getActiveFixtureDropId(): string {
  const store = loadStore();
  return store.activeDropId;
}

export function fixtureCreateDrop(hostNote?: string): DropResponse {
  const store = loadStore();
  const now = new Date(store.serverTimeIso);
  const id = `drop-${now.getTime().toString(16)}-demo`;
  const vision = createDefaultVision(hostNote);
  const newDrop: DropResponse = {
    id,
    status: "draft",
    building_code: "DEMO-ORIGIN",
    room: "214",
    vision,
    vision_source: "fixture",
    servings_final: vision.servings_estimate,
    allergens_final: [...vision.allergens_likely],
    diet_tags_final: [...vision.diet_tags],
    safety_review: {
      covered_and_temperature_safe: false,
      served_within_two_hours: false,
      untouched: false,
      ingredient_information_checked: false,
      religious_diets_confirmed: false,
    },
    counts: {
      total: vision.servings_estimate,
      available: vision.servings_estimate,
      held: 0,
      picked_up: 0,
    },
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 45 * 60 * 1000).toISOString(),
    allergen_notice: ALLERGEN_WARNING_TEXT,
    is_demo: true,
  };
  store.drops[id] = newDrop;
  store.wavesByDrop[id] = [];
  store.activeDropId = id;
  saveStore(store);
  return newDrop;
}

export function fixtureUpdateDrop(
  dropId: string,
  edit: DropEdit,
): DropResponse {
  const store = loadStore();
  const drop = store.drops[dropId];
  if (!drop) {
    throw new Error("Drop not found in fixture store");
  }

  // Enforce contract safety rules:
  // 1. Removing any estimated allergen requires ingredient_information_checked
  const removedEstimatedAllergen = drop.vision.allergens_likely.some(
    (alg) => !edit.allergens_final.includes(alg),
  );
  if (
    removedEstimatedAllergen &&
    !edit.safety_review.ingredient_information_checked
  ) {
    throw new Error(
      "safety_review_required: Removing an AI-estimated allergen requires checking ingredient information.",
    );
  }

  // 2. Religious tags require religious_diets_confirmed
  const hasReligiousTag = edit.diet_tags_final.some((d) =>
    RELIGIOUS_DIETS.includes(d),
  );
  if (hasReligiousTag && !edit.safety_review.religious_diets_confirmed) {
    throw new Error(
      "safety_review_required: Adding halal, kosher, or pork_free tags requires confirming religious diet compliance.",
    );
  }

  const nowMs = new Date(store.serverTimeIso).getTime();
  drop.servings_final = edit.servings_final;
  drop.allergens_final = [...edit.allergens_final];
  drop.diet_tags_final = [...edit.diet_tags_final];
  drop.building_code = edit.building_code;
  drop.room = edit.room;
  drop.safety_review = { ...edit.safety_review };
  drop.expires_at = new Date(
    nowMs + edit.expires_in_minutes * 60 * 1000,
  ).toISOString();
  recomputeCounts(store, dropId);
  saveStore(store);
  return drop;
}

export function fixturePublishDrop(dropId: string): DropResponse {
  const store = loadStore();
  const drop = store.drops[dropId];
  if (!drop) {
    throw new Error("Drop not found in fixture store");
  }
  const sr = drop.safety_review;
  if (
    !sr ||
    !sr.covered_and_temperature_safe ||
    !sr.served_within_two_hours ||
    !sr.untouched
  ) {
    throw new Error(
      "safety_review_required: Host must confirm all three food safety checks before publishing.",
    );
  }

  const removedEstimatedAllergen = drop.vision.allergens_likely.some(
    (alg) => !drop.allergens_final.includes(alg),
  );
  if (removedEstimatedAllergen && !sr.ingredient_information_checked) {
    throw new Error(
      "safety_review_required: Ingredient information check is required when clearing estimated allergens.",
    );
  }

  const hasReligiousTag = drop.diet_tags_final.some((d) =>
    RELIGIOUS_DIETS.includes(d),
  );
  if (hasReligiousTag && !sr.religious_diets_confirmed) {
    throw new Error(
      "safety_review_required: Religious diet compliance confirmation is required for halal/kosher/pork_free.",
    );
  }

  if (drop.status === "draft") {
    drop.status = "live";
    planWaveForDrop(store, drop, 2);
  }
  recomputeCounts(store, dropId);
  store.activeDropId = dropId;
  saveStore(store);
  return drop;
}

export function fixtureGetDrop(dropId: string): DropResponse {
  const store = loadStore();
  const drop = store.drops[dropId] ?? store.drops[store.activeDropId];
  if (!drop) {
    throw new Error("Drop not found");
  }
  recomputeCounts(store, drop.id);
  return drop;
}

function buildInviteResponse(
  store: OfflineFixtureStore,
  inv: InternalInvite,
): InviteResponse {
  const drop = store.drops[inv.dropId]!;
  recomputeCounts(store, drop.id);
  const claim = inv.claimId ? (store.claims[inv.claimId] ?? null) : null;
  const claimResp: ClaimResponse | null = claim
    ? {
        id: claim.id,
        invite_id: claim.inviteId,
        drop_id: claim.dropId,
        status: claim.status,
        held_until: claim.heldUntil,
      }
    : null;
  return {
    id: inv.id,
    drop,
    status: inv.status,
    expires_at: inv.expiresAt,
    claim: claimResp,
  };
}

export function fixtureGetMyInvites(
  credential: DemoCredential,
): InvitesResponse {
  const store = loadStore();
  const personaEntry = Object.values(store.personas).find(
    (p) => p.token === credential,
  );
  if (!personaEntry) {
    return { invites: [] };
  }
  const myInvites = Object.values(store.invites)
    .filter((inv) => inv.personaLabel === personaEntry.label)
    .map((inv) => buildInviteResponse(store, inv));
  return { invites: myInvites };
}

export function fixtureClaimInvite(
  inviteId: string,
  credential: DemoCredential,
): ClaimResponse {
  const store = loadStore();
  const inv = store.invites[inviteId];
  if (!inv) {
    throw new Error("Invite not found");
  }
  const personaEntry = Object.values(store.personas).find(
    (p) => p.token === credential,
  );
  if (personaEntry && personaEntry.label !== inv.personaLabel) {
    throw new Error("403: Invite belongs to another student persona");
  }

  if (inv.claimId && store.claims[inv.claimId]?.status === "held") {
    const existing = store.claims[inv.claimId]!;
    return {
      id: existing.id,
      invite_id: existing.inviteId,
      drop_id: existing.dropId,
      status: existing.status,
      held_until: existing.heldUntil,
    };
  }

  if (inv.status === "expired") {
    throw new Error("invite_expired: This invite has expired.");
  }

  const counts = recomputeCounts(store, inv.dropId);
  if (counts.available <= 0) {
    throw new Error("capacity: All servings are currently held or claimed.");
  }

  const nowMs = new Date(store.serverTimeIso).getTime();
  const heldUntil = new Date(nowMs + 600 * 1000).toISOString();
  const claimId = `claim-${inv.id}`;
  const claim: InternalClaim = {
    id: claimId,
    inviteId: inv.id,
    dropId: inv.dropId,
    personaLabel: inv.personaLabel,
    status: "held",
    heldUntil,
  };
  store.claims[claimId] = claim;
  inv.status = "claimed";
  inv.claimId = claimId;
  recomputeCounts(store, inv.dropId);
  saveStore(store);

  return {
    id: claim.id,
    invite_id: claim.inviteId,
    drop_id: claim.dropId,
    status: claim.status,
    held_until: claim.heldUntil,
  };
}

export function fixtureDeclineInvite(
  inviteId: string,
  credential: DemoCredential,
): InviteResponse {
  const store = loadStore();
  const inv = store.invites[inviteId];
  if (!inv) {
    throw new Error("Invite not found");
  }
  const personaEntry = Object.values(store.personas).find(
    (p) => p.token === credential,
  );
  if (personaEntry && personaEntry.label !== inv.personaLabel) {
    throw new Error("403: Invite belongs to another student persona");
  }
  inv.status = "declined";
  if (inv.claimId && store.claims[inv.claimId]) {
    store.claims[inv.claimId]!.status = "released";
  }
  recomputeCounts(store, inv.dropId);
  saveStore(store);
  return buildInviteResponse(store, inv);
}

export function fixtureReleaseClaim(claimId: string): ClaimResponse {
  const store = loadStore();
  const claim = store.claims[claimId];
  if (!claim) {
    throw new Error("Claim not found");
  }
  claim.status = "released";
  recomputeCounts(store, claim.dropId);
  saveStore(store);
  return {
    id: claim.id,
    invite_id: claim.inviteId,
    drop_id: claim.dropId,
    status: claim.status,
    held_until: claim.heldUntil,
  };
}

export function fixturePickupClaim(claimId: string): ClaimResponse {
  const store = loadStore();
  const claim = store.claims[claimId];
  if (!claim) {
    throw new Error("Claim not found");
  }
  claim.status = "picked_up";
  recomputeCounts(store, claim.dropId);
  saveStore(store);
  return {
    id: claim.id,
    invite_id: claim.inviteId,
    drop_id: claim.dropId,
    status: claim.status,
    held_until: claim.heldUntil,
  };
}

export function fixtureGetDispatch(dropId: string): DispatchResponse {
  const store = loadStore();
  const drop = store.drops[dropId] ?? store.drops[store.activeDropId];
  if (!drop) {
    throw new Error("Drop not found");
  }
  const waves = store.wavesByDrop[drop.id] ?? [];
  const currentRingK = waves.length > 0 ? waves[waves.length - 1]!.ring_k : 2;
  const counts = recomputeCounts(store, drop.id);

  const personas: PersonaDecision[] = (["A", "B", "C", "D", "E"] as const).map(
    (label) => {
      const p = store.personas[label];
      const invite = Object.values(store.invites).find(
        (inv) => inv.dropId === drop.id && inv.personaLabel === label,
      );
      if (invite) {
        const claim = invite.claimId ? store.claims[invite.claimId] : undefined;
        const effectiveStatus =
          claim?.status === "picked_up"
            ? "picked_up"
            : claim?.status === "held"
              ? "claimed"
              : invite.status;
        return {
          label: p.label,
          is_simulated: true,
          ring_distance: p.ringDistance,
          status: effectiveStatus,
          reason_codes: invite.reasonCodes,
          h3_cell: p.h3Cell,
        };
      }

      // Determine generic exclusion or pending status
      const hasAllergen = p.preferences.allergens.some((a) =>
        drop.allergens_final.includes(a),
      );
      if (hasAllergen) {
        return {
          label: p.label,
          is_simulated: true,
          ring_distance: p.ringDistance,
          status: "excluded",
          reason_codes: ["allergen_conflict"],
          h3_cell: p.h3Cell,
        };
      }

      const missingDiet = p.preferences.diets.some(
        (d) => !drop.diet_tags_final.includes(d),
      );
      if (missingDiet) {
        return {
          label: p.label,
          is_simulated: true,
          ring_distance: p.ringDistance,
          status: "excluded",
          reason_codes: ["diet_mismatch"],
          h3_cell: p.h3Cell,
        };
      }

      if (p.ringDistance > currentRingK) {
        return {
          label: p.label,
          is_simulated: true,
          ring_distance: p.ringDistance,
          status: "outside_ring",
          reason_codes: ["out_of_range"],
          h3_cell: p.h3Cell,
        };
      }

      return {
        label: p.label,
        is_simulated: true,
        ring_distance: p.ringDistance,
        status: drop.status === "draft" ? "standby" : "eligible_queued",
        reason_codes: ["nearby", "fair_share"],
        h3_cell: p.h3Cell,
      };
    },
  );

  const activeSentInvites = Object.values(store.invites).filter(
    (inv) => inv.dropId === drop.id && inv.status === "sent",
  );
  const nextWaveAt =
    activeSentInvites.length > 0 ? activeSentInvites[0]!.expiresAt : null;

  return {
    drop_id: drop.id,
    status: drop.status,
    origin_cell: ORIGIN_CELL,
    ring_k: currentRingK,
    counts,
    waves,
    personas,
    next_wave_at: nextWaveAt,
    server_time: store.serverTimeIso,
    is_demo: true,
  };
}

export function fixtureDemoReset(): DemoResetResponse {
  const fresh = createInitialStore();
  saveStore(fresh);

  return {
    status: "reset",
    students: 30,
    personas: {
      A: "00000000-0000-4000-8000-00000000000a",
      B: "00000000-0000-4000-8000-00000000000b",
      C: "00000000-0000-4000-8000-00000000000c",
      D: "00000000-0000-4000-8000-00000000000d",
      E: "00000000-0000-4000-8000-00000000000e",
    },
  };
}

export function fixtureDemoTick(tick: DemoTick): DemoTickResponse {
  const store = loadStore();
  const advanceMs = (tick.advance_seconds ?? 60) * 1000;
  const nextTimeMs = new Date(store.serverTimeIso).getTime() + advanceMs;
  store.serverTimeIso = new Date(nextTimeMs).toISOString();

  const drop = store.drops[store.activeDropId];
  if (drop && drop.status === "live") {
    // Expire sent invites past deadline
    for (const inv of Object.values(store.invites)) {
      if (inv.dropId === drop.id && inv.status === "sent") {
        if (nextTimeMs >= new Date(inv.expiresAt).getTime()) {
          inv.status = "expired";
        }
      }
    }
    // Release held claims past heldUntil
    for (const claim of Object.values(store.claims)) {
      if (claim.dropId === drop.id && claim.status === "held") {
        if (nextTimeMs >= new Date(claim.heldUntil).getTime()) {
          claim.status = "expired";
        }
      }
    }

    const counts = recomputeCounts(store, drop.id);
    const activeSent = Object.values(store.invites).filter(
      (inv) => inv.dropId === drop.id && inv.status === "sent",
    );
    const waves = store.wavesByDrop[drop.id] ?? [];
    const currentRingK = waves.length > 0 ? waves[waves.length - 1]!.ring_k : 2;

    if (activeSent.length === 0 && counts.available > 0 && currentRingK < 12) {
      const nextRingK = Math.min(12, currentRingK + 2);
      planWaveForDrop(store, drop, nextRingK);
    }
  }

  saveStore(store);
  return { server_time: store.serverTimeIso };
}

export function fixtureUpdatePreferences(
  credential: DemoCredential,
  prefs: Preferences,
): Preferences {
  const store = loadStore();
  const personaEntry = Object.values(store.personas).find(
    (p) => p.token === credential,
  );
  if (personaEntry) {
    personaEntry.preferences = {
      allergens: [...prefs.allergens],
      diets: [...prefs.diets],
      alerts_paused: prefs.alerts_paused,
    };
    saveStore(store);
  }
  return prefs;
}

export function fixtureUpdatePresence(
  credential: DemoCredential,
  req: PresenceRequest,
): PresenceResponse {
  const store = loadStore();
  const validUntil = new Date(
    new Date(store.serverTimeIso).getTime() + 2 * 60 * 60 * 1000,
  ).toISOString();
  store.presenceUntilByToken[`${credential}:${req.building_code}`] = validUntil;
  saveStore(store);
  return { valid_until: validUntil };
}

export function fixtureRegisterPushToken(
  credential: DemoCredential,
  req: PushTokenRequest,
): PushTokenResponse {
  const store = loadStore();
  store.pushRegisteredByToken[credential] = req.token.length > 0;
  saveStore(store);
  return { registered: true };
}
