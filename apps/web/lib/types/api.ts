import type { components } from "../api.generated";

/**
 * HTTP types are aliases of the generated composed OpenAPI schema.
 * Only UI constants and synthetic role choices are maintained here.
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
] as const satisfies readonly Allergen[];

export type Allergen =
  components["schemas"]["VisionEstimate"]["allergens_likely"][number];

export const DIETS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "pork_free",
] as const satisfies readonly Diet[];

export type Diet = components["schemas"]["VisionEstimate"]["diet_tags"][number];

export const RELIGIOUS_DIETS: ReadonlyArray<Diet> = [
  "halal",
  "kosher",
  "pork_free",
];

export const ALLERGEN_WARNING_TEXT = "may contain, confirm with host";

export type FoodItem = components["schemas"]["FoodItem"];
export type VisionEstimate = components["schemas"]["VisionEstimate"];
export type SafetyReview = components["schemas"]["SafetyReview"];
export type DropEdit = components["schemas"]["DropEdit"];
export type Counts = components["schemas"]["Counts"];
export type DropResponse = components["schemas"]["DropResponse"];
export type ClaimResponse = components["schemas"]["ClaimResponse"];
export type InviteResponse = components["schemas"]["InviteResponse"];
export type InvitesResponse = components["schemas"]["InvitesResponse"];
export type WaveResponse = components["schemas"]["WaveResponse"];
export type PersonaDecision = components["schemas"]["PersonaDecision"];
export type VisitorDecision = components["schemas"]["VisitorDecision"];
export type DispatchResponse = components["schemas"]["DispatchResponse"];
export type DemoTick = components["schemas"]["DemoTick"];
export type DemoTickResponse = components["schemas"]["DemoTickResponse"];
export type DemoResetRequest = components["schemas"]["DemoResetRequest"];
export type DemoResetResponse = components["schemas"]["DemoResetResponse"];
export type DemoStatusResponse = components["schemas"]["DemoStatusResponse"];
export type DemoActiveDropResponse =
  components["schemas"]["DemoActiveDropResponse"];
export type DemoArea = components["schemas"]["DemoArea"];
export type DemoAreaId = DemoArea["id"];
export type DemoAreasResponse = components["schemas"]["DemoAreasResponse"];
export type JoinRequest = components["schemas"]["JoinRequest"];
export type JoinResponse = components["schemas"]["JoinResponse"];
export type SessionStudent = components["schemas"]["SessionStudent"];
export type SessionLeftResponse = components["schemas"]["SessionLeftResponse"];
export type Preferences = components["schemas"]["Preferences"];
export type PresenceRequest = components["schemas"]["PresenceRequest"];
export type PresenceResponse = components["schemas"]["PresenceResponse"];
export type PushTokenRequest = components["schemas"]["PushTokenRequest"];
export type PushTokenResponse = components["schemas"]["PushTokenResponse"];
export type ErrorDetail = components["schemas"]["ErrorDetail"];
export type DropStatus = DropResponse["status"];
export type VisionSource = DropResponse["vision_source"];
export type ClaimStatus = ClaimResponse["status"];
export type InviteStatus = InviteResponse["status"];
export type DemoScenario = DemoStatusResponse["scenario"];

export type SeededPersonaLabel = "A" | "B" | "C" | "D" | "E";

export type DemoCredential =
  | "demo-host"
  | "demo-projector"
  | "demo-student-A"
  | "demo-student-B"
  | "demo-student-C"
  | "demo-student-D"
  | "demo-student-E";

export type AuthToken = DemoCredential | string;

export const SEEDED_PERSONA_TOKENS: Record<SeededPersonaLabel, DemoCredential> =
  {
    A: "demo-student-A",
    B: "demo-student-B",
    C: "demo-student-C",
    D: "demo-student-D",
    E: "demo-student-E",
  };

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
    description:
      "Event organizer (upload photo, safety check, publish, demo reset/tick)",
  },
  {
    token: "demo-projector",
    role: "projector",
    label: "Demo Projector",
    description:
      "Big screen dispatch view (synthetic personas A–E, H3 rings, counts)",
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
