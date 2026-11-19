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
  BuildingDistribution,
  BuildingsResponse,
  CampusDistributionResponse,
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
  DistributionMode,
  DropEdit,
  DropResponse,
  FeedDrop,
  FeedResponse,
  FeedUnavailableReason,
  HostPickupReview,
  HostPickupReviewDecision,
  HostPickupReviewStatus,
  HostPickupReviewsResponse,
  InviteResponse,
  InvitesResponse,
  JoinRequest,
  JoinResponse,
  PersonaDecision,
  PickupClaimRequest,
  PickupMatchStatus,
  PickupReviewStatus,
  PickupVerification,
  PickupVerificationResponse,
  PickupVerificationStatus,
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
  PICKUP_CONFIRMATION_NOTICE,
  PICKUP_CONSISTENT_CONFIDENCE_THRESHOLD,
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

interface InternalPickupVerification {
  id: string;
  claimId: string;
  dropId: string;
  requestId: string;
  attemptOrder: number;
  status: PickupVerificationStatus;
  matchStatus: PickupMatchStatus | null;
  confidence: number | null;
  explanation: string;
  source: "fixture" | "openrouter";
  createdAt: string;
  reviewStatus: PickupReviewStatus;
}

export interface InternalHostOutboxEvent {
  notification_id: string;
  notification_mode: "host_pickup";
  drop_id: string;
  claim_id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  created_at: string;
  delivered_to_host: boolean;
}

interface OfflineFixtureStore {
  serverTimeIso: string;
  clockOffsetSeconds: number;
  scenario: DemoScenario;
  activeDropId: string;
  drops: Record<string, DropResponse>;
  dropOwnerByDropId: Record<string, string>;
  wavesByDrop: Record<string, WaveResponse[]>;
  invites: Record<string, InternalInvite>;
  claims: Record<string, InternalClaim>;
  verifications: Record<string, InternalPickupVerification>;
  attemptCounter: number;
  pickupFixtureStatusOverride: PickupMatchStatus | null;
  personas: Record<"A" | "B" | "C" | "D" | "E", InternalPersonaConfig>;
  visitorsByToken: Record<string, InternalVisitorSession>;
  presenceUntilByToken: Record<string, string>;
  pushRegisteredByToken: Record<string, boolean>;
  hostPushRegisteredByHostId: Record<string, boolean>;
  hostOutboxByClaimId: Record<string, InternalHostOutboxEvent>;
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
    dropOwnerByDropId: {},
    wavesByDrop: {},
    invites: {},
    claims: {},
    verifications: {},
    attemptCounter: 0,
    pickupFixtureStatusOverride: null,
    personas: createInitialPersonas(scenario),
    visitorsByToken: {},
    presenceUntilByToken: {},
    pushRegisteredByToken: {},
    hostPushRegisteredByHostId: {},
    hostOutboxByClaimId: {},
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
    if (!parsed.dropOwnerByDropId) {
      parsed.dropOwnerByDropId = {};
    }
    if (!parsed.verifications) {
      parsed.verifications = {};
    }
    if (typeof parsed.attemptCounter !== "number") {
      parsed.attemptCounter = 0;
    }
    if (parsed.pickupFixtureStatusOverride === undefined) {
      parsed.pickupFixtureStatusOverride = null;
    }
    if (!parsed.hostPushRegisteredByHostId) {
      parsed.hostPushRegisteredByHostId = {};
    }
    if (!parsed.hostOutboxByClaimId) {
      parsed.hostOutboxByClaimId = {};
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
  if (drop.status !== "draft" && drop.status !== "expired") {
    drop.status = available === 0 ? "claimed_out" : "live";
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

function expireDeadlines(store: OfflineFixtureStore): void {
  const nowMs = new Date(store.serverTimeIso).getTime();
  for (const drop of Object.values(store.drops)) {
    if (
      (drop.status === "live" || drop.status === "claimed_out") &&
      drop.expires_at &&
      nowMs >= new Date(drop.expires_at).getTime()
    ) {
      drop.status = "expired";
    }
  }
  for (const inv of Object.values(store.invites)) {
    if (inv.status === "sent" && nowMs >= new Date(inv.expiresAt).getTime()) {
      inv.status = "expired";
    }
  }
  for (const claim of Object.values(store.claims)) {
    if (claim.status === "held") {
      const drop = store.drops[claim.dropId];
      if (
        nowMs >= new Date(claim.heldUntil).getTime() ||
        (drop?.expires_at && nowMs >= new Date(drop.expires_at).getTime())
      ) {
        claim.status = "expired";
      }
    }
    if (claim.status === "expired" || claim.status === "released") {
      for (const v of Object.values(store.verifications)) {
        if (v.claimId === claim.id) {
          if (v.status === "processing") {
            v.status = "failed";
          }
          if (
            v.reviewStatus === "pending" ||
            v.reviewStatus === "not_requested"
          ) {
            v.reviewStatus = "expired";
          }
        }
      }
    }
  }
  for (const v of Object.values(store.verifications)) {
    if (v.status === "processing") {
      const ageMs = nowMs - new Date(v.createdAt).getTime();
      if (ageMs >= 120 * 1000) {
        v.status = "failed";
        v.explanation =
          "Simulated assessment timed out after 120 seconds. Please retry.";
      }
    }
  }
  for (const dropId of Object.keys(store.drops)) {
    recomputeCounts(store, dropId);
  }
}

export function fixtureGetBuildings(): BuildingsResponse {
  // Offline fixture mode is explicitly synthetic and never fabricates verified campus coordinates.
  return {
    campus: "marietta",
    buildings: [],
  };
}

export function fixtureGetDemoAreas(): DemoAreasResponse {
  return {
    areas: FIXTURE_DEMO_AREAS.map((a) => ({ ...a })),
  };
}

export function fixtureJoinSession(req: JoinRequest): JoinResponse {
  const store = loadStore();
  expireDeadlines(store);
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

  let areaId: DemoAreaId | null = null;
  let ringDistance = 0;

  if (store.scenario === "seeded") {
    if (req.area != null && req.area.trim().length > 0) {
      const areaInfo = FIXTURE_DEMO_AREAS.find((a) => a.id === req.area);
      if (!areaInfo) {
        throw new FixtureContractError(
          422,
          "invalid_building",
          `Location "${req.area}" is not available in offline synthetic fixture mode.`,
        );
      }
      areaId = areaInfo.id;
      ringDistance = areaInfo.ring_distance;
    } else {
      areaId = "demo-venue";
      ringDistance = 0;
    }
  } else {
    // Normal campus_feed mode ignores deprecated optional area without storing/deriving a student cell
    areaId = null;
    ringDistance = 0;
  }

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
    ringDistance,
    h3Cell:
      store.scenario === "seeded"
        ? getCellAtDistance(ORIGIN_CELL, ringDistance, visitorIndex + 3)
        : "",
    alertsPaused: false,
    joinedAtIso: new Date().toISOString(),
  };

  store.visitorsByToken[token] = session;

  // In explicit seeded rehearsal mode, create an immediate wave invite if there is an active seeded_waves drop.
  const activeDrop = store.drops[store.activeDropId];
  if (
    store.scenario === "seeded" &&
    activeDrop &&
    activeDrop.status === "live" &&
    (activeDrop.distribution_mode ?? "seeded_waves") === "seeded_waves"
  ) {
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
  expireDeadlines(store);
  saveStore(store);
  return { status: "left" };
}

export function fixtureGetDemoStatus(): DemoStatusResponse {
  const store = loadStore();
  expireDeadlines(store);
  return {
    scenario: store.scenario,
    visitors: Object.keys(store.visitorsByToken).length,
    active_drop_id: store.activeDropId || null,
    server_time: store.serverTimeIso,
    clock_offset_seconds: store.clockOffsetSeconds,
  };
}

export function fixtureCreateDrop(
  hostNote?: string,
  credential: AuthToken = "demo-host",
): DropResponse {
  const store = loadStore();
  const now = new Date(store.serverTimeIso);
  const existingCount = Object.keys(store.drops).length + 1;
  const id = `drop-${now.getTime().toString(16)}-${existingCount}-demo`;
  const vision = createDefaultVision(hostNote);
  const distributionMode: DistributionMode =
    store.scenario === "visitors" ? "campus_feed" : "seeded_waves";
  const newDrop: DropResponse = {
    id,
    status: "draft",
    distribution_mode: distributionMode,
    building_code: "DEMO-ORIGIN",
    building: null,
    room: "214",
    pickup_instructions: "",
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
  store.dropOwnerByDropId[id] = credential;
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
  drop.building = null;
  drop.room = edit.room;
  drop.pickup_instructions = (edit.pickup_instructions ?? "").trim();
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
    const mode: DistributionMode =
      store.scenario === "visitors" ? "campus_feed" : "seeded_waves";
    drop.distribution_mode = mode;
    drop.status = "live";
    if (mode === "seeded_waves") {
      planWaveForDrop(store, drop, 2);
    }
  }
  recomputeCounts(store, dropId);
  store.activeDropId = dropId;
  saveStore(store);
  return drop;
}

export function fixtureGetDrop(
  dropId: string,
  credential?: AuthToken,
): DropResponse {
  const store = loadStore();
  expireDeadlines(store);
  const drop = store.drops[dropId];
  if (!drop) {
    throw new FixtureContractError(404, "not_found", "Drop not found");
  }
  if (credential && credential.startsWith("demo-host")) {
    const owner = store.dropOwnerByDropId[drop.id] ?? "demo-host";
    if (owner !== credential) {
      throw new FixtureContractError(404, "not_found", "Drop not found");
    }
  }
  recomputeCounts(store, drop.id);
  return drop;
}

function getStudentDietaryPrefs(
  resolved: ReturnType<typeof resolveStudentIdentity>,
): {
  allergens: Allergen[];
  diets: ("vegetarian" | "vegan" | "halal" | "kosher" | "pork_free")[];
} {
  if (resolved.kind === "persona") {
    return {
      allergens: resolved.persona.preferences.allergens,
      diets: resolved.persona.preferences.diets,
    };
  }
  return {
    allergens: resolved.visitor.student.allergens,
    diets: resolved.visitor.student.diets,
  };
}

export function fixtureGetMyFeed(credential: AuthToken): FeedResponse {
  const store = loadStore();
  expireDeadlines(store);
  const resolved = resolveStudentIdentity(store, credential);
  const prefs = getStudentDietaryPrefs(resolved);
  const nowMs = new Date(store.serverTimeIso).getTime();

  const myClaims = Object.values(store.claims).filter(
    (c) => c.recipientKey === resolved.recipientKey,
  );
  const hasAnyActiveHold = myClaims.some((c) => c.status === "held");

  const activeCampusDrops = Object.values(store.drops)
    .filter((d) => {
      const mode = d.distribution_mode ?? "seeded_waves";
      if (mode !== "campus_feed") return false;
      if (d.status !== "live" && d.status !== "claimed_out") return false;
      return !d.expires_at || nowMs < new Date(d.expires_at).getTime();
    })
    .sort((a, b) => {
      const timeCmp = b.created_at.localeCompare(a.created_at);
      if (timeCmp !== 0) return timeCmp;
      return b.id.localeCompare(a.id);
    });

  const feedDrops: FeedDrop[] = activeCampusDrops.map((drop) => {
    const counts = recomputeCounts(store, drop.id);
    const ownClaim = myClaims.find((c) => c.dropId === drop.id) ?? null;
    const claimResp: ClaimResponse | null = ownClaim
      ? {
          id: ownClaim.id,
          invite_id: ownClaim.inviteId,
          drop_id: ownClaim.dropId,
          status: ownClaim.status,
          held_until: ownClaim.heldUntil,
        }
      : null;

    const hasAllergenConflict = prefs.allergens.some((a) =>
      drop.allergens_final.includes(a),
    );
    const hasDietMismatch = prefs.diets.some(
      (d) => !drop.diet_tags_final.includes(d),
    );

    let canReserve = true;
    let unavailableReason: FeedUnavailableReason | null = null;

    if (ownClaim) {
      canReserve = false;
      unavailableReason = "already_reserved";
    } else if (hasAllergenConflict) {
      canReserve = false;
      unavailableReason = "allergen_conflict";
    } else if (hasDietMismatch) {
      canReserve = false;
      unavailableReason = "diet_mismatch";
    } else if (hasAnyActiveHold) {
      canReserve = false;
      unavailableReason = "active_claim";
    } else if (counts.available <= 0) {
      canReserve = false;
      unavailableReason = "capacity";
    }

    return {
      drop,
      can_reserve: canReserve,
      unavailable_reason: unavailableReason,
      claim: claimResp,
    };
  });

  saveStore(store);
  return {
    drops: feedDrops,
    server_time: store.serverTimeIso,
    is_demo: true,
  };
}

export function fixtureReserveDrop(
  dropId: string,
  credential: AuthToken,
): ClaimResponse {
  const store = loadStore();
  expireDeadlines(store);
  const resolved = resolveStudentIdentity(store, credential);
  const drop = store.drops[dropId];
  if (!drop || drop.status === "draft") {
    throw new FixtureContractError(404, "not_found", "Drop not found.");
  }

  const mode = drop.distribution_mode ?? "seeded_waves";
  if (mode !== "campus_feed") {
    throw new FixtureContractError(
      404,
      "not_found",
      "Direct feed reservation is only available for campus feed drops.",
    );
  }

  const nowMs = new Date(store.serverTimeIso).getTime();
  if (
    drop.status === "expired" ||
    (drop.expires_at && nowMs >= new Date(drop.expires_at).getTime())
  ) {
    drop.status = "expired";
    saveStore(store);
    throw new FixtureContractError(
      409,
      "drop_expired",
      "This food drop has expired.",
    );
  }

  const myClaims = Object.values(store.claims).filter(
    (c) => c.recipientKey === resolved.recipientKey,
  );
  const existingForDrop = myClaims.find((c) => c.dropId === drop.id);

  // Idempotent retry of own held or picked_up reservation returns same ID, even after preferences change
  if (
    existingForDrop &&
    (existingForDrop.status === "held" ||
      existingForDrop.status === "picked_up")
  ) {
    return {
      id: existingForDrop.id,
      invite_id: existingForDrop.inviteId,
      drop_id: existingForDrop.dropId,
      status: existingForDrop.status,
      held_until: existingForDrop.heldUntil,
    };
  }

  // One reservation per student/drop lifecycle (released/expired cannot be recreated)
  if (existingForDrop) {
    throw new FixtureContractError(
      409,
      "invalid_state",
      "You already had a reservation for this drop.",
    );
  }

  const prefs = getStudentDietaryPrefs(resolved);
  const hasAllergenConflict = prefs.allergens.some((a) =>
    drop.allergens_final.includes(a),
  );
  if (hasAllergenConflict) {
    throw new FixtureContractError(
      409,
      "allergen_conflict",
      "This drop conflicts with your declared allergens.",
    );
  }

  const hasDietMismatch = prefs.diets.some(
    (d) => !drop.diet_tags_final.includes(d),
  );
  if (hasDietMismatch) {
    throw new FixtureContractError(
      409,
      "diet_mismatch",
      "This drop does not match your required dietary tags.",
    );
  }

  const otherActiveHold = myClaims.find((c) => c.status === "held");
  if (otherActiveHold) {
    throw new FixtureContractError(
      409,
      "active_claim",
      "You already have an active hold on another drop.",
    );
  }

  const counts = recomputeCounts(store, drop.id);
  if (counts.available <= 0) {
    throw new FixtureContractError(
      409,
      "capacity",
      "All servings are currently held or claimed.",
    );
  }

  const dropExpiryMs = drop.expires_at
    ? new Date(drop.expires_at).getTime()
    : nowMs + 45 * 60 * 1000;
  const holdExpiryMs = Math.min(nowMs + 10 * 60 * 1000, dropExpiryMs);
  const heldUntil = new Date(holdExpiryMs).toISOString();

  const suffix =
    resolved.kind === "persona"
      ? resolved.persona.label
      : resolved.visitor.token.slice(-8);
  const syntheticInviteId = `feed-inv-${drop.id.slice(0, 8)}-${suffix}`;
  const claimId = `claim-${syntheticInviteId}`;

  const claim: InternalClaim = {
    id: claimId,
    inviteId: syntheticInviteId,
    dropId: drop.id,
    recipientKey: resolved.recipientKey,
    personaLabel: resolved.kind === "persona" ? resolved.persona.label : null,
    visitorToken: resolved.kind === "visitor" ? resolved.visitor.token : null,
    status: "held",
    heldUntil,
  };
  store.claims[claimId] = claim;
  recomputeCounts(store, drop.id);
  saveStore(store);

  return {
    id: claim.id,
    invite_id: claim.inviteId,
    drop_id: claim.dropId,
    status: claim.status,
    held_until: claim.heldUntil,
  };
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
  expireDeadlines(store);
  const resolved = resolveStudentIdentity(store, credential);
  const myInvites = Object.values(store.invites)
    .filter((inv) => {
      if (inv.recipientKey !== resolved.recipientKey) return false;
      const drop = store.drops[inv.dropId];
      if (!drop) return false;
      return (drop.distribution_mode ?? "seeded_waves") === "seeded_waves";
    })
    .map((inv) => buildInviteResponse(store, inv));
  return { invites: myInvites };
}

export function fixtureClaimInvite(
  inviteId: string,
  credential: AuthToken,
): ClaimResponse {
  const store = loadStore();
  expireDeadlines(store);
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
  expireDeadlines(store);
  const resolved = resolveStudentIdentity(store, credential);
  const inv = store.invites[inviteId];
  if (!inv || inv.recipientKey !== resolved.recipientKey) {
    throw new FixtureContractError(404, "not_found", "Invite not found");
  }
  inv.status = "declined";
  if (inv.claimId && store.claims[inv.claimId]) {
    store.claims[inv.claimId]!.status = "released";
  }
  expireDeadlines(store);
  recomputeCounts(store, inv.dropId);
  saveStore(store);
  return buildInviteResponse(store, inv);
}

export function fixtureReleaseClaim(
  claimId: string,
  credential?: AuthToken,
): ClaimResponse {
  const store = loadStore();
  expireDeadlines(store);
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
  expireDeadlines(store);
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

function recordHostPickupOutboxOnce(
  store: OfflineFixtureStore,
  claim: InternalClaim,
  drop: DropResponse,
  countsAtCommit: Counts,
): void {
  if (store.hostOutboxByClaimId[claim.id]) {
    return;
  }
  const ownerHostId = store.dropOwnerByDropId[drop.id] ?? "demo-host";
  const isHostOptedIn = Boolean(store.hostPushRegisteredByHostId[ownerHostId]);
  const firstItemName =
    drop.vision.items[0]?.name?.trim() || "shared event food";
  const availLabel =
    countsAtCommit.available === 1
      ? "1 serving available."
      : `${countsAtCommit.available} servings available.`;
  const shortClaimSuffix = claim.id.replace(/[^a-zA-Z0-9]/g, "").slice(-16);
  const tag = `owl-hp-${shortClaimSuffix}`.slice(0, 32);

  store.hostOutboxByClaimId[claim.id] = {
    notification_id: `notif-hp-${claim.id}`,
    notification_mode: "host_pickup",
    drop_id: drop.id,
    claim_id: claim.id,
    title: "Owl Plate: Pickup update",
    body: `A serving of ${firstItemName} was marked collected. ${availLabel}`,
    url: `/host?drop=${encodeURIComponent(drop.id)}`,
    tag,
    created_at: store.serverTimeIso,
    delivered_to_host: isHostOptedIn,
  };
}

function getLatestAttemptForClaim(
  store: OfflineFixtureStore,
  claimId: string,
): InternalPickupVerification | null {
  const attempts = Object.values(store.verifications)
    .filter((v) => v.claimId === claimId)
    .sort((a, b) => b.attemptOrder - a.attemptOrder);
  return attempts[0] ?? null;
}

function deriveCanConfirm(
  store: OfflineFixtureStore,
  v: InternalPickupVerification,
): boolean {
  const claim = store.claims[v.claimId];
  if (!claim || claim.status !== "held") return false;
  const drop = store.drops[claim.dropId];
  if (!drop || drop.status === "expired") return false;
  const nowMs = new Date(store.serverTimeIso).getTime();
  if (nowMs >= new Date(claim.heldUntil).getTime()) return false;
  if (drop.expires_at && nowMs >= new Date(drop.expires_at).getTime()) {
    return false;
  }
  const latest = getLatestAttemptForClaim(store, v.claimId);
  if (!latest || latest.id !== v.id) return false;
  if (v.status !== "ready" || v.matchStatus !== "consistent") return false;
  if (
    v.confidence === null ||
    !Number.isFinite(v.confidence) ||
    v.confidence < PICKUP_CONSISTENT_CONFIDENCE_THRESHOLD
  ) {
    return false;
  }
  if (
    v.reviewStatus === "rejected" ||
    v.reviewStatus === "superseded" ||
    v.reviewStatus === "expired"
  ) {
    return false;
  }
  return true;
}

function serializePickupVerification(
  store: OfflineFixtureStore,
  v: InternalPickupVerification,
): PickupVerification {
  return {
    id: v.id,
    claim_id: v.claimId,
    status: v.status,
    match_status: v.matchStatus,
    confidence: v.confidence,
    explanation: v.explanation,
    source: v.source,
    created_at: v.createdAt,
    review_status: v.reviewStatus,
    can_confirm: deriveCanConfirm(store, v),
    notice: PICKUP_CONFIRMATION_NOTICE,
  };
}

export function fixturePickupClaim(
  claimId: string,
  credential?: AuthToken,
  req?: PickupClaimRequest,
): ClaimResponse {
  const store = loadStore();
  expireDeadlines(store);
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
  // Idempotent retry if already picked_up
  if (claim.status === "picked_up") {
    return {
      id: claim.id,
      invite_id: claim.inviteId,
      drop_id: claim.dropId,
      status: claim.status,
      held_until: claim.heldUntil,
    };
  }
  if (claim.status !== "held") {
    throw new FixtureContractError(
      409,
      "invalid_state",
      "This pickup hold is no longer active.",
    );
  }
  const drop = store.drops[claim.dropId];
  const nowMs = new Date(store.serverTimeIso).getTime();
  if (
    !drop ||
    drop.status === "expired" ||
    nowMs >= new Date(claim.heldUntil).getTime() ||
    (drop.expires_at && nowMs >= new Date(drop.expires_at).getTime())
  ) {
    claim.status = "expired";
    expireDeadlines(store);
    saveStore(store);
    throw new FixtureContractError(
      409,
      "invalid_state",
      "Your pickup hold has expired.",
    );
  }

  const mode = drop.distribution_mode ?? "seeded_waves";
  const verificationId = req?.verification_id?.trim() || null;

  if (mode === "campus_feed") {
    if (!verificationId) {
      throw new FixtureContractError(
        409,
        "pickup_verification_required",
        "Photo-assisted verification is required before completing a campus feed pickup.",
      );
    }
    const v = store.verifications[verificationId];
    if (!v || v.claimId !== claim.id || !deriveCanConfirm(store, v)) {
      throw new FixtureContractError(
        409,
        "invalid_state",
        "The latest photo assessment is not eligible to confirm pickup.",
      );
    }
  } else if (verificationId) {
    const v = store.verifications[verificationId];
    if (!v || v.claimId !== claim.id || !deriveCanConfirm(store, v)) {
      throw new FixtureContractError(
        409,
        "invalid_state",
        "The specified photo verification is not valid for this claim.",
      );
    }
  }

  claim.status = "picked_up";
  const countsAtCommit = recomputeCounts(store, claim.dropId);
  recordHostPickupOutboxOnce(store, claim, drop, countsAtCommit);
  saveStore(store);
  return {
    id: claim.id,
    invite_id: claim.inviteId,
    drop_id: claim.dropId,
    status: claim.status,
    held_until: claim.heldUntil,
  };
}

export function fixtureGetDistribution(): CampusDistributionResponse {
  const store = loadStore();
  expireDeadlines(store);
  const nowMs = new Date(store.serverTimeIso).getTime();

  const activeCampusDrops = Object.values(store.drops).filter((d) => {
    const mode = d.distribution_mode ?? "seeded_waves";
    if (mode !== "campus_feed") return false;
    if (d.status !== "live" && d.status !== "claimed_out") return false;
    return !d.expires_at || nowMs < new Date(d.expires_at).getTime();
  });

  const totalCounts: Counts = {
    total: 0,
    available: 0,
    held: 0,
    picked_up: 0,
  };

  const byBuilding = new Map<string, BuildingDistribution>();

  for (const drop of activeCampusDrops) {
    const c = recomputeCounts(store, drop.id);
    totalCounts.total += c.total;
    totalCounts.available += c.available;
    totalCounts.held += c.held;
    totalCounts.picked_up += c.picked_up;

    const code = drop.building_code || "DEMO-ORIGIN";
    const existing = byBuilding.get(code);
    if (existing) {
      existing.active_drops += 1;
      existing.counts.total += c.total;
      existing.counts.available += c.available;
      existing.counts.held += c.held;
      existing.counts.picked_up += c.picked_up;
    } else {
      byBuilding.set(code, {
        building_code: code,
        building: drop.building ?? null,
        active_drops: 1,
        counts: { ...c },
      });
    }
  }

  const buildings = Array.from(byBuilding.values()).sort((a, b) =>
    a.building_code.localeCompare(b.building_code),
  );

  return {
    distribution_mode:
      store.scenario === "visitors" ? "campus_feed" : "seeded_waves",
    active_drops: activeCampusDrops.length,
    joined_students: Object.keys(store.visitorsByToken).length,
    counts: totalCounts,
    buildings,
    server_time: store.serverTimeIso,
    is_demo: true,
  };
}

export function fixtureGetDispatch(dropId: string): DispatchResponse {
  const store = loadStore();
  expireDeadlines(store);
  const drop = store.drops[dropId] ?? store.drops[store.activeDropId];
  if (!drop) {
    throw new FixtureContractError(404, "not_found", "Drop not found");
  }
  const mode: DistributionMode = drop.distribution_mode ?? "seeded_waves";
  const waves = store.wavesByDrop[drop.id] ?? [];
  const currentRingK = waves.length > 0 ? waves[waves.length - 1]!.ring_k : 2;
  const counts = recomputeCounts(store, drop.id);

  if (mode === "campus_feed") {
    return {
      drop_id: drop.id,
      status: drop.status,
      distribution_mode: "campus_feed",
      origin_cell: ORIGIN_CELL,
      ring_k: 0,
      counts,
      waves: [],
      personas: [],
      visitors: [],
      scenario: store.scenario,
      next_wave_at: null,
      server_time: store.serverTimeIso,
      is_demo: true,
    };
  }

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
    distribution_mode: "seeded_waves",
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

  expireDeadlines(store);

  for (const drop of Object.values(store.drops)) {
    const mode = drop.distribution_mode ?? "seeded_waves";
    if (drop.status === "live" && mode === "seeded_waves") {
      const counts = recomputeCounts(store, drop.id);
      const activeSent = Object.values(store.invites).filter(
        (inv) => inv.dropId === drop.id && inv.status === "sent",
      );
      const waves = store.wavesByDrop[drop.id] ?? [];
      const currentRingK =
        waves.length > 0 ? waves[waves.length - 1]!.ring_k : 2;

      if (
        activeSent.length === 0 &&
        counts.available > 0 &&
        currentRingK < 12
      ) {
        const nextRingK = Math.min(12, currentRingK + 2);
        planWaveForDrop(store, drop, nextRingK);
      }
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
  if (store.scenario === "visitors") {
    throw new FixtureContractError(
      409,
      "invalid_state",
      "Check-ins are not used for the campus feed.",
    );
  }
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

function assertHostRole(credential: AuthToken): string {
  if (!credential || !credential.startsWith("demo-host")) {
    throw new FixtureContractError(
      403,
      "forbidden",
      "Host role is required for this endpoint.",
    );
  }
  return credential;
}

function assertOwnDropForHost(
  store: OfflineFixtureStore,
  dropId: string,
  credential: AuthToken,
): DropResponse {
  const hostId = assertHostRole(credential);
  const drop = store.drops[dropId];
  if (!drop) {
    throw new FixtureContractError(404, "not_found", "Drop not found.");
  }
  const owner = store.dropOwnerByDropId[drop.id] ?? "demo-host";
  if (owner !== hostId) {
    throw new FixtureContractError(404, "not_found", "Drop not found.");
  }
  return drop;
}

export function fixtureRegisterHostPushToken(
  credential: AuthToken,
  req: PushTokenRequest,
): PushTokenResponse {
  const store = loadStore();
  const hostId = assertHostRole(credential);
  const token = req.token?.trim() ?? "";
  if (!token) {
    throw new FixtureContractError(
      422,
      "validation_error",
      "Push token is required.",
    );
  }
  store.hostPushRegisteredByHostId[hostId] = true;
  saveStore(store);
  return { registered: true };
}

export function fixtureGetHostPushTokenStatus(
  credential: AuthToken,
): PushTokenResponse {
  const store = loadStore();
  const hostId = assertHostRole(credential);
  const registered = Boolean(store.hostPushRegisteredByHostId[hostId]);
  return { registered };
}

export function fixtureDeleteHostPushToken(
  credential: AuthToken,
): PushTokenResponse {
  const store = loadStore();
  const hostId = assertHostRole(credential);
  store.hostPushRegisteredByHostId[hostId] = false;
  saveStore(store);
  return { registered: false };
}

export function fixtureSetPickupFixtureStatus(
  status: PickupMatchStatus | null,
): void {
  const store = loadStore();
  store.pickupFixtureStatusOverride = status;
  saveStore(store);
}

function resolveFixtureMatchResult(
  store: OfflineFixtureStore,
  drop: DropResponse,
  rawStatus?: PickupMatchStatus | null,
  rawConfidence?: number | null,
): {
  matchStatus: PickupMatchStatus;
  confidence: number;
  explanation: string;
} {
  const envStatus =
    typeof process !== "undefined" &&
    process.env?.PICKUP_FIXTURE_STATUS &&
    (process.env.PICKUP_FIXTURE_STATUS === "consistent" ||
      process.env.PICKUP_FIXTURE_STATUS === "uncertain" ||
      process.env.PICKUP_FIXTURE_STATUS === "inconsistent")
      ? (process.env.PICKUP_FIXTURE_STATUS as PickupMatchStatus)
      : null;

  const targetStatus: PickupMatchStatus =
    rawStatus ?? store.pickupFixtureStatusOverride ?? envStatus ?? "consistent";

  const itemSummary =
    drop.vision.items.map((i) => i.name).join(", ") || "shared event trays";

  let defaultConfidence = 0.89;
  if (targetStatus === "uncertain") {
    defaultConfidence = 0.64;
  } else if (targetStatus === "inconsistent") {
    defaultConfidence = 0.22;
  }

  const rawConf =
    typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
      ? Math.max(0, Math.min(1, rawConfidence))
      : defaultConfidence;

  // Threshold 0.8: Consistent confidence below 0.8 becomes uncertain
  const normalizedStatus: PickupMatchStatus =
    targetStatus === "consistent" &&
    rawConf < PICKUP_CONSISTENT_CONFIDENCE_THRESHOLD
      ? "uncertain"
      : targetStatus;

  let explanation = "";
  if (normalizedStatus === "consistent") {
    explanation = `Simulated demo assessment (no image pixels retained or analyzed): matches host listing (${itemSummary}).`;
  } else if (normalizedStatus === "uncertain") {
    explanation = `Simulated demo assessment (no image pixels retained or analyzed): comparison with host listing (${itemSummary}) is uncertain (confidence ${Math.round(rawConf * 100)}% < 80% threshold). You can retry with a clearer photo or request host review.`;
  } else {
    explanation = `Simulated demo assessment (no image pixels retained or analyzed): does not match host listing (${itemSummary}). Retry with a photo of the listed food or request host review.`;
  }

  return {
    matchStatus: normalizedStatus,
    confidence: rawConf,
    explanation: explanation.slice(0, 500),
  };
}

export interface FixturePhotoOptions {
  /** Metadata only; image bytes are never read or retained. */
  mimeType?: string;
  byteSize?: number;
  /** Simulate an in-flight processing state before resolving. */
  keepProcessing?: boolean;
  /** Optional explicit confidence override to test threshold 0.8 normalization. */
  confidence?: number;
  /** Optional explicit match status override for unit tests. */
  matchStatus?: PickupMatchStatus;
}

export function fixtureSubmitPickupPhoto(
  claimId: string,
  requestId: string,
  credential: AuthToken,
  options?: FixturePhotoOptions,
): PickupVerification {
  const store = loadStore();
  expireDeadlines(store);
  const resolved = resolveStudentIdentity(store, credential);

  const cleanReqId = requestId?.trim() ?? "";
  if (!cleanReqId) {
    throw new FixtureContractError(
      422,
      "validation_error",
      "request_id UUID is required.",
    );
  }

  // Validate active/unexpired own held claim and unexpired drop BEFORE any model/assessment call
  const claim = store.claims[claimId];
  if (!claim || claim.recipientKey !== resolved.recipientKey) {
    throw new FixtureContractError(404, "not_found", "Claim not found.");
  }
  if (claim.status !== "held") {
    throw new FixtureContractError(
      409,
      "invalid_state",
      "Pickup photo verification requires an active held spot.",
    );
  }
  const drop = store.drops[claim.dropId];
  const nowMs = new Date(store.serverTimeIso).getTime();
  if (
    !drop ||
    drop.status === "expired" ||
    nowMs >= new Date(claim.heldUntil).getTime() ||
    (drop.expires_at && nowMs >= new Date(drop.expires_at).getTime())
  ) {
    claim.status = "expired";
    expireDeadlines(store);
    saveStore(store);
    throw new FixtureContractError(
      409,
      "invalid_state",
      "Your pickup hold or the drop has expired.",
    );
  }

  // Validate file metadata bounds (JPEG/PNG only, 10 MiB max) without retaining bytes
  if (options?.mimeType) {
    const mime = options.mimeType.toLowerCase();
    if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/jpg") {
      throw new FixtureContractError(
        422,
        "unsupported_image",
        "Only JPEG and PNG food photos are supported.",
      );
    }
  }
  if (
    typeof options?.byteSize === "number" &&
    options.byteSize > 10 * 1024 * 1024
  ) {
    throw new FixtureContractError(
      422,
      "image_too_large",
      "Photo exceeds the 10 MiB limit.",
    );
  }
  if (typeof options?.byteSize === "number" && options.byteSize <= 0) {
    throw new FixtureContractError(
      422,
      "invalid_image",
      "Selected photo file is empty.",
    );
  }

  // Check existing attempts for this claim
  const claimAttempts = Object.values(store.verifications)
    .filter((v) => v.claimId === claim.id)
    .sort((a, b) => b.attemptOrder - a.attemptOrder);

  const sameKeyAttempt = claimAttempts.find((v) => v.requestId === cleanReqId);
  if (sameKeyAttempt) {
    saveStore(store);
    return serializePickupVerification(store, sameKeyAttempt);
  }

  const activeProcessing = claimAttempts.find((v) => v.status === "processing");
  if (activeProcessing) {
    throw new FixtureContractError(
      409,
      "verification_in_progress",
      "A photo verification attempt is already in progress for this hold.",
    );
  }

  // Supersede any older pending review or previous ready attempts
  for (const prev of claimAttempts) {
    if (
      prev.reviewStatus === "pending" ||
      prev.reviewStatus === "not_requested"
    ) {
      prev.reviewStatus = "superseded";
    }
  }

  store.attemptCounter += 1;
  const attemptOrder = store.attemptCounter;
  const verificationId = `ver-${claim.id.slice(0, 12)}-${attemptOrder}`;

  if (options?.keepProcessing) {
    const processingAttempt: InternalPickupVerification = {
      id: verificationId,
      claimId: claim.id,
      dropId: drop.id,
      requestId: cleanReqId,
      attemptOrder,
      status: "processing",
      matchStatus: null,
      confidence: null,
      explanation: "Comparing photo against host listing items...",
      source: "fixture",
      createdAt: store.serverTimeIso,
      reviewStatus: "not_requested",
    };
    store.verifications[verificationId] = processingAttempt;
    saveStore(store);
    return serializePickupVerification(store, processingAttempt);
  }

  const resolvedMatch = resolveFixtureMatchResult(
    store,
    drop,
    options?.matchStatus,
    options?.confidence,
  );

  const readyAttempt: InternalPickupVerification = {
    id: verificationId,
    claimId: claim.id,
    dropId: drop.id,
    requestId: cleanReqId,
    attemptOrder,
    status: "ready",
    matchStatus: resolvedMatch.matchStatus,
    confidence: resolvedMatch.confidence,
    explanation: resolvedMatch.explanation,
    source: "fixture",
    createdAt: store.serverTimeIso,
    reviewStatus: "not_requested",
  };
  store.verifications[verificationId] = readyAttempt;
  saveStore(store);
  return serializePickupVerification(store, readyAttempt);
}

export function fixtureCompleteProcessingVerification(
  verificationId: string,
  options?: {
    matchStatus?: PickupMatchStatus;
    confidence?: number;
    fail?: boolean;
  },
): PickupVerification {
  const store = loadStore();
  expireDeadlines(store);
  const v = store.verifications[verificationId];
  if (!v) {
    throw new FixtureContractError(
      404,
      "not_found",
      "Verification attempt not found.",
    );
  }
  const latest = getLatestAttemptForClaim(store, v.claimId);
  if (!latest || latest.id !== v.id) {
    // Late result cannot overwrite a newer attempt
    return serializePickupVerification(store, v);
  }
  const claim = store.claims[v.claimId];
  const drop = store.drops[v.dropId];
  if (!claim || claim.status !== "held" || !drop || drop.status === "expired") {
    v.status = "failed";
    v.reviewStatus = "expired";
    saveStore(store);
    return serializePickupVerification(store, v);
  }
  if (options?.fail) {
    v.status = "failed";
    v.matchStatus = null;
    v.confidence = null;
    v.explanation =
      "Photo verification could not be completed. Please try again.";
    saveStore(store);
    return serializePickupVerification(store, v);
  }
  const resolvedMatch = resolveFixtureMatchResult(
    store,
    drop,
    options?.matchStatus,
    options?.confidence,
  );
  v.status = "ready";
  v.matchStatus = resolvedMatch.matchStatus;
  v.confidence = resolvedMatch.confidence;
  v.explanation = resolvedMatch.explanation;
  saveStore(store);
  return serializePickupVerification(store, v);
}

export function fixtureGetPickupVerification(
  claimId: string,
  credential: AuthToken,
): PickupVerificationResponse {
  const store = loadStore();
  expireDeadlines(store);
  const resolved = resolveStudentIdentity(store, credential);
  const claim = store.claims[claimId];
  if (!claim || claim.recipientKey !== resolved.recipientKey) {
    throw new FixtureContractError(404, "not_found", "Claim not found.");
  }
  const latest = getLatestAttemptForClaim(store, claim.id);
  saveStore(store);
  return {
    verification: latest ? serializePickupVerification(store, latest) : null,
  };
}

export function fixtureRequestPickupReview(
  claimId: string,
  verificationId: string,
  credential: AuthToken,
): PickupVerification {
  const store = loadStore();
  expireDeadlines(store);
  const resolved = resolveStudentIdentity(store, credential);
  const claim = store.claims[claimId];
  if (!claim || claim.recipientKey !== resolved.recipientKey) {
    throw new FixtureContractError(404, "not_found", "Claim not found.");
  }
  if (claim.status !== "held") {
    throw new FixtureContractError(
      409,
      "invalid_state",
      "Host review requires an active held spot.",
    );
  }
  const latest = getLatestAttemptForClaim(store, claim.id);
  if (!latest || latest.id !== verificationId || latest.status !== "ready") {
    throw new FixtureContractError(
      409,
      "invalid_state",
      "Only the latest ready verification attempt can be sent for host review.",
    );
  }
  if (
    latest.matchStatus !== "uncertain" &&
    latest.matchStatus !== "inconsistent"
  ) {
    throw new FixtureContractError(
      409,
      "invalid_state",
      "Only uncertain or inconsistent photo assessments can request host review.",
    );
  }
  if (
    latest.reviewStatus === "rejected" ||
    latest.reviewStatus === "expired" ||
    latest.reviewStatus === "superseded"
  ) {
    throw new FixtureContractError(
      409,
      "invalid_state",
      "This verification attempt can no longer request host review. Take a new photo first.",
    );
  }
  // Idempotent if already pending or approved
  if (latest.reviewStatus === "not_requested") {
    latest.reviewStatus = "pending";
  }
  saveStore(store);
  return serializePickupVerification(store, latest);
}

function serializeHostPickupReview(
  v: InternalPickupVerification,
  claim: InternalClaim,
): HostPickupReview {
  const status: HostPickupReviewStatus =
    v.reviewStatus === "not_requested" ? "pending" : v.reviewStatus;
  return {
    id: v.id,
    drop_id: v.dropId,
    match_status: v.matchStatus ?? "uncertain",
    confidence: v.confidence ?? 0,
    explanation: v.explanation,
    source: v.source,
    created_at: v.createdAt,
    held_until: claim.heldUntil,
    review_status: status,
    notice: PICKUP_CONFIRMATION_NOTICE,
  };
}

export function fixtureGetHostPickupReviews(
  dropId: string,
  credential: AuthToken = "demo-host",
): HostPickupReviewsResponse {
  const store = loadStore();
  expireDeadlines(store);
  const drop = assertOwnDropForHost(store, dropId, credential);

  const pendingReviews: HostPickupReview[] = [];
  for (const v of Object.values(store.verifications)) {
    if (v.dropId !== drop.id) continue;
    if (v.status !== "ready" || v.reviewStatus !== "pending") continue;
    const latest = getLatestAttemptForClaim(store, v.claimId);
    if (!latest || latest.id !== v.id) continue;
    const claim = store.claims[v.claimId];
    if (!claim || claim.status !== "held") continue;
    pendingReviews.push(serializeHostPickupReview(v, claim));
  }

  pendingReviews.sort((a, b) => a.created_at.localeCompare(b.created_at));
  saveStore(store);
  return {
    reviews: pendingReviews,
    server_time: store.serverTimeIso,
  };
}

export function fixtureDecideHostPickupReview(
  dropId: string,
  verificationId: string,
  decision: HostPickupReviewDecision,
  credential: AuthToken = "demo-host",
): HostPickupReview {
  const store = loadStore();
  expireDeadlines(store);
  const drop = assertOwnDropForHost(store, dropId, credential);

  const v = store.verifications[verificationId];
  if (!v || v.dropId !== drop.id) {
    throw new FixtureContractError(
      404,
      "not_found",
      "Pickup review not found for this drop.",
    );
  }
  const claim = store.claims[v.claimId];
  if (!claim) {
    throw new FixtureContractError(
      404,
      "not_found",
      "Pickup review not found.",
    );
  }

  // Idempotent retry of the same decision
  if (decision === "approve" && v.reviewStatus === "approved") {
    return serializeHostPickupReview(v, claim);
  }
  if (decision === "reject" && v.reviewStatus === "rejected") {
    return serializeHostPickupReview(v, claim);
  }

  // Contradictory decision or stale/expired/superseded review -> 409
  if (v.reviewStatus !== "pending") {
    throw new FixtureContractError(
      409,
      "invalid_state",
      `Review is already ${v.reviewStatus} and cannot be changed.`,
    );
  }

  const latest = getLatestAttemptForClaim(store, v.claimId);
  if (!latest || latest.id !== v.id) {
    v.reviewStatus = "superseded";
    saveStore(store);
    throw new FixtureContractError(
      409,
      "review_superseded",
      "A newer photo verification attempt superseded this review.",
    );
  }

  const nowMs = new Date(store.serverTimeIso).getTime();
  if (
    claim.status !== "held" ||
    drop.status === "expired" ||
    nowMs >= new Date(claim.heldUntil).getTime() ||
    (drop.expires_at && nowMs >= new Date(drop.expires_at).getTime())
  ) {
    v.reviewStatus = "expired";
    expireDeadlines(store);
    saveStore(store);
    throw new FixtureContractError(
      409,
      "hold_expired",
      "The student's hold expired or was released before this review could be completed.",
    );
  }

  if (decision === "approve") {
    // Explicit human override consumes active unexpired hold transactionally, preserving AI match_status
    v.reviewStatus = "approved";
    claim.status = "picked_up";
    const countsAtCommit = recomputeCounts(store, drop.id);
    recordHostPickupOutboxOnce(store, claim, drop, countsAtCommit);
  } else {
    // Rejection leaves hold active until existing expiry and allows a new photo
    v.reviewStatus = "rejected";
  }

  saveStore(store);
  return serializeHostPickupReview(v, claim);
}

export function fixtureGetHostOutboxEvents(): InternalHostOutboxEvent[] {
  const store = loadStore();
  return Object.values(store.hostOutboxByClaimId);
}
