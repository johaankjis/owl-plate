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

export type BuildingCategory = components["schemas"]["Building"]["category"];

export const BUILDING_CATEGORIES: ReadonlyArray<BuildingCategory> = [
  "academic",
  "student_life",
  "housing",
  "other",
];

export type BuildingSource = components["schemas"]["BuildingSource"];
export type Building = components["schemas"]["Building"];
export type BuildingsResponse = components["schemas"]["BuildingsResponse"];

export type FoodItem = components["schemas"]["FoodItem"];
export type VisionEstimate = components["schemas"]["VisionEstimate"];
export type SafetyReview = components["schemas"]["SafetyReview"];
export type DropEdit = components["schemas"]["DropEdit"];
export type Counts = components["schemas"]["Counts"];
export type DistributionMode = NonNullable<
  components["schemas"]["DropResponse"]["distribution_mode"]
>;
export type FeedUnavailableReason = NonNullable<
  components["schemas"]["FeedDrop"]["unavailable_reason"]
>;
// Temporary additive contract until the backend is integrated and types regenerated.
export type DropResponse = components["schemas"]["DropResponse"] & {
  has_photo?: boolean;
  photo_url?: string | null;
};
export interface StudentReservationItem {
  claim: ClaimResponse;
  drop: DropResponse;
  pickup_verification: PickupVerification | null;
}
export interface StudentReservationsResponse {
  reservations: StudentReservationItem[];
  server_time: string;
  is_demo: boolean;
}
export interface HostDropsResponse {
  drops: DropResponse[];
  server_time: string;
  is_demo: boolean;
}
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
export type SessionStudent = components["schemas"]["SessionStudent"];
export type JoinResponse = components["schemas"]["JoinResponse"];
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

export type FeedDrop = components["schemas"]["FeedDrop"];
export type FeedResponse = components["schemas"]["FeedResponse"];
export type BuildingDistribution =
  components["schemas"]["BuildingDistribution"];
export type CampusDistributionResponse =
  components["schemas"]["CampusDistributionResponse"];

export type SeededPersonaLabel = "A" | "B" | "C" | "D" | "E";

export type DemoCredential =
  | "demo-host"
  | "demo-projector"
  | "demo-pantry-coordinator"
  | "demo-student-A"
  | "demo-student-B"
  | "demo-student-C"
  | "demo-student-D"
  | "demo-student-E";

export type AuthToken = DemoCredential | string;

export const PANTRY_COORDINATOR_CREDENTIAL = "demo-pantry-coordinator" as const;

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
  role: "host" | "projector" | "pantry_coordinator" | "student";
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
    token: "demo-pantry-coordinator",
    role: "pantry_coordinator",
    label: "Demo Pantry Coordinator",
    description:
      "Simulated pantry coordinator view (/pantry — review and accept/reject demo referrals)",
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

/** Pickup HTTP models are generated from the composed backend contract. */
export const PICKUP_CONFIRMATION_NOTICE =
  "Photo-assisted confirmation. A photo cannot independently establish physical pickup or food safety.";
export const PICKUP_CONSISTENT_CONFIDENCE_THRESHOLD = 0.8;
export type PickupVerification = components["schemas"]["PickupVerification"];
export type PickupVerificationStatus = PickupVerification["status"];
export type PickupMatchStatus = NonNullable<PickupVerification["match_status"]>;
export type PickupVerificationSource = PickupVerification["source"];
export type PickupReviewStatus = PickupVerification["review_status"];
export type PickupVerificationResponse =
  components["schemas"]["PickupVerificationResponse"];
export type PickupClaimRequest = components["schemas"]["PickupRequest"];
export type PickupReviewRequest = components["schemas"]["PickupReviewRequest"];
export type HostPickupReview = components["schemas"]["HostPickupReview"];
export type HostPickupReviewStatus = HostPickupReview["review_status"];
export type HostPickupReviewsResponse =
  components["schemas"]["HostPickupReviewsResponse"];
export type HostPickupReviewDecisionRequest =
  components["schemas"]["HostReviewDecision"];
export type HostPickupReviewDecision =
  HostPickupReviewDecisionRequest["decision"];

/**
 * Simulated CARE pantry HTTP models alias the composed backend schema.
 */
export const PANTRY_DEMO_NOTICE_FALLBACK =
  "Demo only — no request is sent to KSU CARE. KSU catering policy prohibits removing leftovers from event spaces. This simulation does not authorize redistribution or establish food safety.";

export const PANTRY_CARE_SOURCE_URL =
  "https://campus.kennesaw.edu/current-students/student-affairs/wellbeing/care-services/";

export const PANTRY_CATERING_POLICY_URL =
  "https://campus.kennesaw.edu/offices-services/catering/policies.php";

export type PantryStatus = components["schemas"]["PantryReferral"]["status"];
export type PantryDestination = components["schemas"]["PantryDestination"];
export type PantryReferral = components["schemas"]["PantryReferral"];
export type HostPantryReferralResponse =
  components["schemas"]["HostPantryReferralResponse"];
export type PantryReferralRequest =
  components["schemas"]["PantryReferralRequest"];
export type PantryHandoffConfirmRequest =
  components["schemas"]["PantryHandoffRequest"];
export type PantryReferralsResponse =
  components["schemas"]["PantryReferralsResponse"];
export type PantryDecisionRequest =
  components["schemas"]["PantryDecisionRequest"];
export type PantryDecision = PantryDecisionRequest["decision"];
