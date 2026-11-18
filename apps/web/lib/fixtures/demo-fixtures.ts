/**
 * Deterministic offline API fixture state for Owl Plate web when UI_FIXTURE_MODE=true.
 *
 * Privacy & Contract Rules:
 * - Never includes data/seed/demo.json or any priority tier / score fields.
 * - Explicitly marks vision_source = "fixture" and is_demo = true.
 * - Uses H3 resolution 11 cells computed dynamically from arbitrary placeholder origin (0.0, 0.0).
 * - Persona and visitor reason codes use generic safe codes only.
 * - Visitor sessions isolate invites and claims per token and throw 401 when unknown/revoked.
 */

import { latLngToCell, gridDisk } from "h3-js";
import type {
  Allergen,
  AuthToken,
  ClaimResponse,
  Counts,
  DemoArea,
  DemoAreaId,
  DemoAreasResponse,
  DemoCredential,
  DemoResetRequest,
  DemoResetResponse,
  DemoScenario,
  DemoStatusResponse,
  DemoTick,
  DemoTickResponse,
  DispatchResponse,
  DropEdit,
  DropResponse,
  InviteResponse,
  InvitesResponse,
  JoinRequest,
  JoinResponse,
  PersonaDecision,
  Preferences,
  PresenceRequest,
  PresenceResponse,
  PushTokenRequest,
  PushTokenResponse,
  SessionLeftResponse,
  SessionStudent,
  VisionEstimate,
  VisitorDecision,
  WaveResponse,
} from "../types/api";
import {
  ALLERGENS,
  ALLERGEN_WARNING_TEXT,
  RELIGIOUS_DIETS,
} from "../types/api";

const STORAGE_KEY = "owl_plate_offline_fixture_state_v3";
const H3_RESOLUTION = 11;

// Arbitrary placeholder coordinates (0.0, 0.0) per API_CONTRACT.md
const ORIGIN_CELL = latLngToCell(0.0, 0.0, H3_RESOLUTION);

export const FIXTURE_DEMO_AREAS: ReadonlyArray<DemoArea> = [
  {
    id: "demo-venue",
    label: "Event venue (demo)",
    description:
      "Simulated location at the event venue (ring 0 — first reached in Wave 1).",
    ring_distance: 0,
  },
  {
    id: "demo-next-door",
    label: "Next building over (demo)",
    description:
      "Simulated location one building over (ring 1 — first reached in Wave 1).",
    ring_distance: 1,
  },
  {
    id: "demo-across-quad",
    label: "Across the quad (demo)",
    description:
      "Simulated location across the campus quad (ring 4 — first reached in Wave 2).",
    ring_distance: 4,
  },
  {
    id: "demo-far-side",
    label: "Far side of campus (demo)",
    description:
      "Simulated location on the far side of campus (ring 8 — first reached in Wave 4).",
    ring_distance: 8,
  },
];

export class FixtureContractError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "FixtureContractError";
    this.status = status;
    this.code = code;
  }
}

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

interface InternalVisitorSession {
  token: string;
  student: SessionStudent;
  ringDistance: number;
  h3Cell: string;
  alertsPaused: boolean;
  joinedAtIso: string;
}

interface InternalInvite {
  id: string;
  dropId: string;
  recipientKey: string; // "persona:A" | "visitor:<token>"
  personaLabel: "A" | "B" | "C" | "D" | "E" | null;
  visitorToken: string | null;
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
  recipientKey: string;
  personaLabel: "A" | "B" | "C" | "D" | "E" | null;
  visitorToken: string | null;
  status: "held" | "picked_up" | "released" | "expired";
  heldUntil: string;
}

interface OfflineFixtureStore {
  serverTimeIso: string;
  clockOffsetSeconds: number;
  scenario: DemoScenario;
  activeDropId: string;
  drops: Record<string, DropResponse>;
  wavesByDrop: Record<string, WaveResponse[]>;
  invites: Record<string, InternalInvite>;
  claims: Record<string, InternalClaim>;
  personas: Record<"A" | "B" | "C" | "D" | "E", InternalPersonaConfig>;
  visitorsByToken: Record<string, InternalVisitorSession>;
  presenceUntilByToken: Record<string, string>;
  pushRegisteredByToken: Record<string, boolean>;
}

let memoryStore: OfflineFixtureStore | null = null;

function createInitialPersonas(
  scenario: DemoScenario = "seeded",
): Record<"A" | "B" | "C" | "D" | "E", InternalPersonaConfig> {
  const paused = scenario === "visitors";
  return {
    A: {
      token: "demo-student-A",
      label: "A",
      ringDistance: 0,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 0, 0),
      preferences: { allergens: [], diets: [], alerts_paused: paused },
    },
    B: {
      token: "demo-student-B",
      label: "B",
      ringDistance: 0,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 0, 1),
      preferences: { allergens: ["dairy"], diets: [], alerts_paused: paused },
    },
    C: {
      token: "demo-student-C",
      label: "C",
      ringDistance: 1,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 1, 1),
      preferences: { allergens: [], diets: [], alerts_paused: paused },
    },
    D: {
      token: "demo-student-D",
      label: "D",
      ringDistance: 4,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 4, 2),
      preferences: { allergens: [], diets: [], alerts_paused: paused },
    },
    E: {
      token: "demo-student-E",
      label: "E",
      ringDistance: 0,
      h3Cell: getCellAtDistance(ORIGIN_CELL, 0, 2),
      preferences: {
        allergens: [],
        diets: ["vegetarian"],
        alerts_paused: paused,
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
      ? `Offline saved demo estimate (Host note: "${note}")`
      : "Offline saved demo estimate: two trays from club meeting.",
  };
}

function createInitialStore(
  scenario: DemoScenario = "seeded",
): OfflineFixtureStore {
  const now = new Date("2026-11-18T17:00:00Z");
  return {
    serverTimeIso: now.toISOString(),
    clockOffsetSeconds: 0,
    scenario,
    activeDropId: "",
    drops: {},
    wavesByDrop: {},
    invites: {},
    claims: {},
    personas: createInitialPersonas(scenario),
    visitorsByToken: {},
    presenceUntilByToken: {},
    pushRegisteredByToken: {},
  };
}

function loadStore(): OfflineFixtureStore {
  if (typeof window === "undefined" || !window.localStorage) {
    if (!memoryStore) {
      memoryStore = createInitialStore();
    }
    return memoryStore;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = createInitialStore();
      saveStore(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as OfflineFixtureStore;
    if (!parsed.visitorsByToken) {
      parsed.visitorsByToken = {};
    }
    if (!parsed.scenario) {
      parsed.scenario = "seeded";
    }
    if (typeof parsed.clockOffsetSeconds !== "number") {
      parsed.clockOffsetSeconds = 0;
    }
    return parsed;
  } catch {
    return createInitialStore();
  }
}

function saveStore(store: OfflineFixtureStore): void {
  memoryStore = store;
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

function resolveStudentIdentity(
  store: OfflineFixtureStore,
  credential: AuthToken,
):
  | { kind: "persona"; persona: InternalPersonaConfig; recipientKey: string }
  | { kind: "visitor"; visitor: InternalVisitorSession; recipientKey: string } {
  const personaEntry = Object.values(store.personas).find(
    (p) => p.token === credential,
  );
  if (personaEntry) {
    return {
      kind: "persona",
      persona: personaEntry,
      recipientKey: `persona:${personaEntry.label}`,
    };
  }
  const visitorEntry = store.visitorsByToken[credential];
  if (visitorEntry) {
    return {
      kind: "visitor",
      visitor: visitorEntry,
      recipientKey: `visitor:${visitorEntry.token}`,
    };
  }
  throw new FixtureContractError(
    401,
    "unauthorized",
    "Session ended. Join again.",
  );
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

interface CandidateRecipient {
  recipientKey: string;
  personaLabel: "A" | "B" | "C" | "D" | "E" | null;
  visitorToken: string | null;
  ringDistance: number;
  allergens: Allergen[];
  diets: ("vegetarian" | "vegan" | "halal" | "kosher" | "pork_free")[];
  alertsPaused: boolean;
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

  const alreadyInvitedKeys = new Set(
    Object.values(store.invites)
      .filter((inv) => inv.dropId === drop.id)
      .map((inv) => inv.recipientKey),
  );

  const activeClaimKeys = new Set(
    Object.values(store.claims)
      .filter((c) => c.status === "held")
      .map((c) => c.recipientKey),
  );

  const candidates: CandidateRecipient[] = [];

  // Joined visitors first so live interactive testers receive invites seamlessly
  const visitors = Object.values(store.visitorsByToken).sort((a, b) =>
    a.joinedAtIso.localeCompare(b.joinedAtIso),
  );
  for (const v of visitors) {
    candidates.push({
      recipientKey: `visitor:${v.token}`,
      personaLabel: null,
      visitorToken: v.token,
      ringDistance: v.ringDistance,
      allergens: v.student.allergens,
      diets: v.student.diets,
      alertsPaused: v.alertsPaused,
    });
  }

  for (const label of ["A", "B", "C", "D", "E"] as const) {
    const p = store.personas[label];
    candidates.push({
      recipientKey: `persona:${p.label}`,
      personaLabel: p.label,
      visitorToken: null,
      ringDistance: p.ringDistance,
      allergens: p.preferences.allergens,
      diets: p.preferences.diets,
      alertsPaused: p.preferences.alerts_paused,
    });
  }

  const eligible: CandidateRecipient[] = [];
  for (const c of candidates) {
    if (alreadyInvitedKeys.has(c.recipientKey)) continue;
    if (activeClaimKeys.has(c.recipientKey)) continue;
    if (c.alertsPaused) continue;
    const hasAllergenConflict = c.allergens.some((a) =>
      drop.allergens_final.includes(a),
    );
    if (hasAllergenConflict) continue;
    const missingDiet = c.diets.some((d) => !drop.diet_tags_final.includes(d));
    if (missingDiet) continue;
    if (c.ringDistance > ringK) continue;

    eligible.push(c);
  }

  const targetCount = Math.min(
    eligible.length,
    Math.max(counts.available, Math.ceil(counts.available / 0.8)),
  );
  const selected = eligible.slice(0, targetCount);
  const nowMs = new Date(store.serverTimeIso).getTime();
  const expiresIso = new Date(nowMs + 60 * 1000).toISOString();

  for (const c of selected) {
    const suffix = c.personaLabel
      ? c.personaLabel
      : (c.visitorToken?.slice(-6) ?? "vis");
    const inviteId = `inv-${drop.id.slice(0, 8)}-w${nextWaveNumber}-${suffix}`;
    const reasonCodes: string[] = c.visitorToken
      ? ["nearby", "diet_match", "fair_share"]
      : c.diets.length > 0
        ? ["nearby", "fair_share", "diet_match"]
        : ["nearby", "fair_share"];

    store.invites[inviteId] = {
      id: inviteId,
      dropId: drop.id,
      recipientKey: c.recipientKey,
      personaLabel: c.personaLabel,
      visitorToken: c.visitorToken,
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
  if (store.activeDropId) {
    const active = store.drops[store.activeDropId];
    if (active && active.status !== "expired") {
      return active.id;
    }
  }
  const activeCandidates = Object.values(store.drops)
    .filter((d) => d.status !== "expired")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return activeCandidates[0]?.id ?? "";
}

export function fixtureGetDemoAreas(): DemoAreasResponse {
  return {
    areas: FIXTURE_DEMO_AREAS.map((a) => ({ ...a })),
  };
}

export function fixtureJoinSession(req: JoinRequest): JoinResponse {
  const store = loadStore();
  const nickname = req.nickname.trim();
  if (!nickname) {
    throw new FixtureContractError(
      422,
      "validation_error",
      "Nickname is required.",
    );
  }

  const existingVisitors = Object.values(store.visitorsByToken);
  if (existingVisitors.length >= 40) {
    throw new FixtureContractError(
      409,
      "session_limit",
      "The demo has reached the 40-visitor session limit.",
    );
  }

  const taken = existingVisitors.some(
    (v) => v.student.nickname.toLowerCase() === nickname.toLowerCase(),
  );
  if (taken) {
    throw new FixtureContractError(
      409,
      "nickname_taken",
      `Nickname "${nickname}" is already taken in this demo session.`,
    );
  }

  const areaInfo =
    FIXTURE_DEMO_AREAS.find((a) => a.id === req.area) ?? FIXTURE_DEMO_AREAS[0]!;
  const areaId: DemoAreaId = areaInfo.id;

  const visitorIndex = existingVisitors.length + 1;
  const randomPart = Math.random().toString(36).slice(2, 12);
  const token = `demo-session-${Date.now().toString(36)}-${randomPart}`;
  const validUntil = new Date(
    new Date(store.serverTimeIso).getTime() + 2 * 60 * 60 * 1000,
  ).toISOString();

  const student: SessionStudent = {
    id: `00000000-0000-4000-9000-${String(visitorIndex).padStart(12, "0")}`,
    nickname,
    area: areaId,
    allergens: [...(req.allergens ?? [])],
    diets: [...(req.diets ?? [])],
    kind: "visitor",
    valid_until: validUntil,
  };

  const session: InternalVisitorSession = {
    token,
    student,
    ringDistance: areaInfo.ring_distance,
    h3Cell: getCellAtDistance(
      ORIGIN_CELL,
      areaInfo.ring_distance,
      visitorIndex + 3,
    ),
    alertsPaused: false,
    joinedAtIso: new Date().toISOString(),
  };

  store.visitorsByToken[token] = session;

  // If there is already a live drop in fixture mode and this visitor is eligible in current ring,
  // create an immediate wave invite so standalone fixture mode feels responsive right after joining.
  const activeDrop = store.drops[store.activeDropId];
  if (activeDrop && activeDrop.status === "live") {
    const waves = store.wavesByDrop[activeDrop.id] ?? [];
    const currentRingK = waves.length > 0 ? waves[waves.length - 1]!.ring_k : 2;
    const counts = recomputeCounts(store, activeDrop.id);
    const hasAllergen = student.allergens.some((a) =>
      activeDrop.allergens_final.includes(a),
    );
    const missingDiet = student.diets.some(
      (d) => !activeDrop.diet_tags_final.includes(d),
    );
    if (
      counts.available > 0 &&
      !hasAllergen &&
      !missingDiet &&
      session.ringDistance <= currentRingK
    ) {
      const waveNum = waves.length > 0 ? waves[waves.length - 1]!.number : 1;
      const inviteId = `inv-${activeDrop.id.slice(0, 8)}-w${waveNum}-${token.slice(-6)}`;
      const nowMs = new Date(store.serverTimeIso).getTime();
      store.invites[inviteId] = {
        id: inviteId,
        dropId: activeDrop.id,
        recipientKey: `visitor:${token}`,
        personaLabel: null,
        visitorToken: token,
        waveNumber: waveNum,
        status: "sent",
        reasonCodes: ["nearby", "diet_match", "fair_share"],
        sentAt: store.serverTimeIso,
        expiresAt: new Date(nowMs + 60 * 1000).toISOString(),
        claimId: null,
      };
    }
  }

  saveStore(store);
  return { token, student };
}

export function fixtureGetMySession(credential: AuthToken): SessionStudent {
  const store = loadStore();
  const isPersona = Object.values(store.personas).some(
    (p) => p.token === credential,
  );
  if (isPersona) {
    throw new FixtureContractError(
      404,
      "not_a_session",
      "Seeded persona tokens are not visitor sessions.",
    );
  }
  const session = store.visitorsByToken[credential];
  if (!session) {
    throw new FixtureContractError(
      401,
      "unauthorized",
      "Session ended. Join again.",
    );
  }
  return { ...session.student };
}

export function fixtureLeaveSession(
  credential: AuthToken,
): SessionLeftResponse {
  const store = loadStore();
  const session = store.visitorsByToken[credential];
  if (!session) {
    throw new FixtureContractError(
      401,
      "unauthorized",
      "Session ended. Join again.",
    );
  }

  const recipientKey = `visitor:${credential}`;
  for (const inv of Object.values(store.invites)) {
    if (inv.recipientKey === recipientKey && inv.status === "sent") {
      inv.status = "declined";
    }
  }
  for (const claim of Object.values(store.claims)) {
    if (claim.recipientKey === recipientKey && claim.status === "held") {
      claim.status = "released";
      recomputeCounts(store, claim.dropId);
    }
  }

  delete store.visitorsByToken[credential];
  saveStore(store);
  return { status: "left" };
}

export function fixtureGetDemoStatus(): DemoStatusResponse {
  const store = loadStore();
  return {
    scenario: store.scenario,
    visitors: Object.keys(store.visitorsByToken).length,
    active_drop_id: store.activeDropId || null,
    server_time: store.serverTimeIso,
    clock_offset_seconds: store.clockOffsetSeconds,
  };
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
    throw new FixtureContractError(
      404,
      "not_found",
      "Drop not found in fixture store",
    );
  }

  const removedEstimatedAllergen = drop.vision.allergens_likely.some(
    (alg) => !edit.allergens_final.includes(alg),
  );
  if (
    removedEstimatedAllergen &&
    !edit.safety_review.ingredient_information_checked
  ) {
    throw new FixtureContractError(
      409,
      "safety_review_required",
      "Removing an AI-estimated allergen requires checking ingredient information.",
    );
  }

  const hasReligiousTag = edit.diet_tags_final.some((d) =>
    RELIGIOUS_DIETS.includes(d),
  );
  if (hasReligiousTag && !edit.safety_review.religious_diets_confirmed) {
    throw new FixtureContractError(
      409,
      "safety_review_required",
      "Adding halal, kosher, or pork_free tags requires confirming religious diet compliance.",
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
    throw new FixtureContractError(
      404,
      "not_found",
      "Drop not found in fixture store",
    );
  }
  const sr = drop.safety_review;
  if (
    !sr ||
    !sr.covered_and_temperature_safe ||
    !sr.served_within_two_hours ||
    !sr.untouched
  ) {
    throw new FixtureContractError(
      409,
      "safety_review_required",
      "Host must confirm all three food safety checks before publishing.",
    );
  }

  const removedEstimatedAllergen = drop.vision.allergens_likely.some(
    (alg) => !drop.allergens_final.includes(alg),
  );
  if (removedEstimatedAllergen && !sr.ingredient_information_checked) {
    throw new FixtureContractError(
      409,
      "safety_review_required",
      "Ingredient information check is required when clearing estimated allergens.",
    );
  }

  const hasReligiousTag = drop.diet_tags_final.some((d) =>
    RELIGIOUS_DIETS.includes(d),
  );
  if (hasReligiousTag && !sr.religious_diets_confirmed) {
    throw new FixtureContractError(
      409,
      "safety_review_required",
      "Religious diet compliance confirmation is required for halal/kosher/pork_free.",
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
    throw new FixtureContractError(404, "not_found", "Drop not found");
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

export function fixtureGetMyInvites(credential: AuthToken): InvitesResponse {
  const store = loadStore();
  const resolved = resolveStudentIdentity(store, credential);
  const myInvites = Object.values(store.invites)
    .filter((inv) => inv.recipientKey === resolved.recipientKey)
    .map((inv) => buildInviteResponse(store, inv));
  return { invites: myInvites };
}

export function fixtureClaimInvite(
  inviteId: string,
  credential: AuthToken,
): ClaimResponse {
  const store = loadStore();
  const resolved = resolveStudentIdentity(store, credential);
  const inv = store.invites[inviteId];
  if (!inv || inv.recipientKey !== resolved.recipientKey) {
    throw new FixtureContractError(404, "not_found", "Invite not found");
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
    throw new FixtureContractError(
      409,
      "invite_expired",
      "This invite has expired.",
    );
  }

  const counts = recomputeCounts(store, inv.dropId);
  if (counts.available <= 0) {
    throw new FixtureContractError(
      409,
      "capacity",
      "All servings are currently held or claimed.",
    );
  }

  const nowMs = new Date(store.serverTimeIso).getTime();
  const heldUntil = new Date(nowMs + 600 * 1000).toISOString();
  const claimId = `claim-${inv.id}`;
  const claim: InternalClaim = {
    id: claimId,
    inviteId: inv.id,
    dropId: inv.dropId,
    recipientKey: inv.recipientKey,
    personaLabel: inv.personaLabel,
    visitorToken: inv.visitorToken,
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
  credential: AuthToken,
): InviteResponse {
  const store = loadStore();
  const resolved = resolveStudentIdentity(store, credential);
  const inv = store.invites[inviteId];
  if (!inv || inv.recipientKey !== resolved.recipientKey) {
    throw new FixtureContractError(404, "not_found", "Invite not found");
  }
  inv.status = "declined";
  if (inv.claimId && store.claims[inv.claimId]) {
    store.claims[inv.claimId]!.status = "released";
  }
  recomputeCounts(store, inv.dropId);
  saveStore(store);
  return buildInviteResponse(store, inv);
}

export function fixtureReleaseClaim(
  claimId: string,
  credential?: AuthToken,
): ClaimResponse {
  const store = loadStore();
  const claim = store.claims[claimId];
  if (!claim) {
    throw new FixtureContractError(404, "not_found", "Claim not found");
  }
  if (credential) {
    const resolved = resolveStudentIdentity(store, credential);
    if (claim.recipientKey !== resolved.recipientKey) {
      throw new FixtureContractError(404, "not_found", "Claim not found");
    }
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

export function fixturePickupClaim(
  claimId: string,
  credential?: AuthToken,
): ClaimResponse {
  const store = loadStore();
  const claim = store.claims[claimId];
  if (!claim) {
    throw new FixtureContractError(404, "not_found", "Claim not found");
  }
  if (credential) {
    const resolved = resolveStudentIdentity(store, credential);
    if (claim.recipientKey !== resolved.recipientKey) {
      throw new FixtureContractError(404, "not_found", "Claim not found");
    }
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
    throw new FixtureContractError(404, "not_found", "Drop not found");
  }
  const waves = store.wavesByDrop[drop.id] ?? [];
  const currentRingK = waves.length > 0 ? waves[waves.length - 1]!.ring_k : 2;
  const counts = recomputeCounts(store, drop.id);

  const personas: PersonaDecision[] =
    store.scenario === "visitors"
      ? []
      : (["A", "B", "C", "D", "E"] as const).map((label) => {
          const p = store.personas[label];
          const invite = Object.values(store.invites).find(
            (inv) => inv.dropId === drop.id && inv.personaLabel === label,
          );
          if (invite) {
            const claim = invite.claimId
              ? store.claims[invite.claimId]
              : undefined;
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
              wave_number: invite.waveNumber,
            };
          }

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
              wave_number: null,
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
              wave_number: null,
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
              wave_number: null,
            };
          }

          return {
            label: p.label,
            is_simulated: true,
            ring_distance: p.ringDistance,
            status: drop.status === "draft" ? "standby" : "eligible_queued",
            reason_codes: ["nearby", "fair_share"],
            h3_cell: p.h3Cell,
            wave_number: null,
          };
        });

  const visitors: VisitorDecision[] = Object.values(store.visitorsByToken)
    .sort((a, b) => a.joinedAtIso.localeCompare(b.joinedAtIso))
    .map((v) => {
      const invite = Object.values(store.invites).find(
        (inv) => inv.dropId === drop.id && inv.visitorToken === v.token,
      );
      if (invite) {
        const claim = invite.claimId ? store.claims[invite.claimId] : undefined;
        const effectiveStatus =
          claim?.status === "held" || claim?.status === "picked_up"
            ? "claimed"
            : invite.status;
        return {
          nickname: v.student.nickname,
          area: v.student.area,
          ring_distance: v.ringDistance,
          status: effectiveStatus,
          reason_codes: ["nearby", "diet_match", "fair_share"],
          h3_cell: v.h3Cell,
          wave_number: invite.waveNumber,
        };
      }

      if (drop.status === "draft") {
        return {
          nickname: v.student.nickname,
          area: v.student.area,
          ring_distance: v.ringDistance,
          status: "waiting",
          reason_codes: ["not_published"],
          h3_cell: v.h3Cell,
          wave_number: null,
        };
      }

      const hasDietaryConflict =
        v.student.allergens.some((a) => drop.allergens_final.includes(a)) ||
        v.student.diets.some((d) => !drop.diet_tags_final.includes(d));

      if (hasDietaryConflict) {
        return {
          nickname: v.student.nickname,
          area: v.student.area,
          ring_distance: v.ringDistance,
          status: "excluded",
          reason_codes: ["dietary_filter"],
          h3_cell: v.h3Cell,
          wave_number: null,
        };
      }

      if (v.ringDistance > currentRingK) {
        return {
          nickname: v.student.nickname,
          area: v.student.area,
          ring_distance: v.ringDistance,
          status: "excluded",
          reason_codes: ["out_of_range"],
          h3_cell: v.h3Cell,
          wave_number: null,
        };
      }

      return {
        nickname: v.student.nickname,
        area: v.student.area,
        ring_distance: v.ringDistance,
        status: "excluded",
        reason_codes: ["not_selected"],
        h3_cell: v.h3Cell,
        wave_number: null,
      };
    });

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
    visitors,
    scenario: store.scenario,
    next_wave_at: nextWaveAt,
    server_time: store.serverTimeIso,
    is_demo: true,
  };
}

export function fixtureDemoReset(req?: DemoResetRequest): DemoResetResponse {
  const scenario: DemoScenario = req?.scenario ?? "seeded";
  const fresh = createInitialStore(scenario);
  saveStore(fresh);

  return {
    status: "reset",
    scenario,
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
  const advanceSec = tick.advance_seconds ?? 60;
  const advanceMs = advanceSec * 1000;
  const nextTimeMs = new Date(store.serverTimeIso).getTime() + advanceMs;
  store.serverTimeIso = new Date(nextTimeMs).toISOString();
  store.clockOffsetSeconds += advanceSec;

  const drop = store.drops[store.activeDropId];
  if (drop && drop.status === "live") {
    for (const inv of Object.values(store.invites)) {
      if (inv.dropId === drop.id && inv.status === "sent") {
        if (nextTimeMs >= new Date(inv.expiresAt).getTime()) {
          inv.status = "expired";
        }
      }
    }
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
  credential: AuthToken,
  prefs: Preferences,
): Preferences {
  const store = loadStore();
  const resolved = resolveStudentIdentity(store, credential);
  if (resolved.kind === "persona") {
    resolved.persona.preferences = {
      allergens: [...prefs.allergens],
      diets: [...prefs.diets],
      alerts_paused: prefs.alerts_paused,
    };
  } else {
    resolved.visitor.student.allergens = [...prefs.allergens];
    resolved.visitor.student.diets = [...prefs.diets];
    resolved.visitor.alertsPaused = prefs.alerts_paused;
  }
  saveStore(store);
  return prefs;
}

export function fixtureUpdatePresence(
  credential: AuthToken,
  req: PresenceRequest,
): PresenceResponse {
  const store = loadStore();
  resolveStudentIdentity(store, credential);
  const validUntil = new Date(
    new Date(store.serverTimeIso).getTime() + 2 * 60 * 60 * 1000,
  ).toISOString();
  store.presenceUntilByToken[`${credential}:${req.building_code}`] = validUntil;
  saveStore(store);
  return { valid_until: validUntil };
}

export function fixtureRegisterPushToken(
  credential: AuthToken,
  req: PushTokenRequest,
): PushTokenResponse {
  const store = loadStore();
  resolveStudentIdentity(store, credential);
  store.pushRegisteredByToken[credential] = req.token.length > 0;
  saveStore(store);
  return { registered: true };
}
