/**
 * Frozen HTTP contract types matching services/api/schemas/api.py.
 * Can be regenerated via manager `make types` when OpenAPI composition is live.
 * Never expose priority tiers, scores, or other students' preferences here.
 */

export const ALLERGENS = [
  "dairy",
  "egg",
  "gluten",
  "peanut",
  "tree_nut",
  "soy",
  "fish",
  "shellfish",
  "sesame",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const DIETS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "pork_free",
] as const;

export type Diet = (typeof DIETS)[number];

export const RELIGIOUS_DIETS: ReadonlyArray<Diet> = [
  "halal",
  "kosher",
  "pork_free",
];

export const ALLERGEN_WARNING_TEXT = "may contain, confirm with host";

export interface FoodItem {
  name: string;
  portion_unit: string;
  count_estimate: number;
}

export interface VisionEstimate {
  items: FoodItem[];
  servings_estimate: number;
  servings_low: number;
  servings_high: number;
  allergens_likely: Allergen[];
  diet_tags: Diet[];
  confidence: number;
  notes: string;
}

export interface SafetyReview {
  covered_and_temperature_safe: boolean;
  served_within_two_hours: boolean;
  untouched: boolean;
  ingredient_information_checked: boolean;
  religious_diets_confirmed: boolean;
}

export interface DropEdit {
  servings_final: number;
  allergens_final: Allergen[];
  diet_tags_final: Diet[];
  building_code: string;
  room: string;
  expires_in_minutes: number;
  safety_review: SafetyReview;
}

export interface Counts {
  total: number;
  available: number;
  held: number;
  picked_up: number;
}

export type DropStatus = "draft" | "live" | "claimed_out" | "expired";
export type VisionSource = "fixture" | "gemini";

export interface DropResponse {
  id: string;
  status: DropStatus;
  building_code: string;
  room: string;
  vision: VisionEstimate;
  vision_source: VisionSource;
  servings_final: number;
  allergens_final: Allergen[];
  diet_tags_final: Diet[];
  safety_review: SafetyReview | null;
  counts: Counts;
  created_at: string;
  expires_at: string | null;
  allergen_notice: string;
  is_demo: boolean;
}

export type ClaimStatus = "held" | "picked_up" | "released" | "expired";

export interface ClaimResponse {
  id: string;
  invite_id: string;
  drop_id: string;
  status: ClaimStatus;
  held_until: string;
}

export type InviteStatus = "sent" | "claimed" | "declined" | "expired";

export interface InviteResponse {
  id: string;
  drop: DropResponse;
  status: InviteStatus;
  expires_at: string;
  claim: ClaimResponse | null;
}

export interface InvitesResponse {
  invites: InviteResponse[];
}

export interface WaveResponse {
  number: number;
  ring_k: number;
  planned_at: string;
  invite_count: number;
}

export interface PersonaDecision {
  label: string;
  is_simulated: true;
  ring_distance: number | null;
  status: string;
  reason_codes: string[];
  h3_cell: string | null;
}

export interface DispatchResponse {
  drop_id: string;
  status: string;
  origin_cell: string;
  ring_k: number;
  counts: Counts;
  waves: WaveResponse[];
  personas: PersonaDecision[];
  next_wave_at: string | null;
  server_time: string;
  is_demo: boolean;
}

export interface DemoTick {
  advance_seconds: number;
}

export interface DemoTickResponse {
  server_time: string;
}

export interface DemoResetResponse {
  status: "reset";
  students: number;
  personas: Record<string, string>;
}

export interface Preferences {
  allergens: Allergen[];
  diets: Diet[];
  alerts_paused: boolean;
}

export interface PresenceRequest {
  building_code: string;
}

export interface PresenceResponse {
  valid_until: string;
}

export interface PushTokenRequest {
  token: string;
}

export interface PushTokenResponse {
  registered: boolean;
}

export interface ErrorDetail {
  code: string;
  message: string;
}

export type DemoCredential =
  | "demo-host"
  | "demo-projector"
  | "demo-student-A"
  | "demo-student-B"
  | "demo-student-C"
  | "demo-student-D"
  | "demo-student-E";

export const DEMO_CREDENTIALS: ReadonlyArray<{
  token: DemoCredential;
  role: "host" | "projector" | "student";
  label: string;
  description: string;
}> = [
  {
    token: "demo-host",
    role: "host",
    label: "Demo Host",
    description: "Event organizer (upload photo, safety check, publish, demo reset/tick)",
  },
  {
    token: "demo-projector",
    role: "projector",
    label: "Demo Projector",
    description: "Big screen dispatch view (synthetic personas A–E, H3 rings, counts)",
  },
  {
    token: "demo-student-A",
    role: "student",
    label: "Persona A (Simulated)",
    description: "Student phone A — view own invites, claim, or decline",
  },
  {
    token: "demo-student-B",
    role: "student",
    label: "Persona B (Simulated)",
    description: "Student phone B — view own invites, claim, or decline",
  },
  {
    token: "demo-student-C",
    role: "student",
    label: "Persona C (Simulated)",
    description: "Student phone C — view own invites, claim, or decline",
  },
  {
    token: "demo-student-D",
    role: "student",
    label: "Persona D (Simulated)",
    description: "Student phone D — view own invites, claim, or decline",
  },
  {
    token: "demo-student-E",
    role: "student",
    label: "Persona E (Simulated)",
    description: "Student phone E — view own invites, claim, or decline",
  },
];
