import type { Building } from "./api";

/** Temporary shared contract; replaced by generated aliases after backend integration. */
export type OperationsPeriod = "today" | "7d" | "30d" | "all";
export interface OperationsDataset {
  kind: "current" | "recording";
  label: string;
  is_simulated: boolean;
  seed_version: string | null;
  anchor_time: string | null;
}
export interface OperationsSummary {
  published_listings: number;
  active_listings: number;
  total_servings_offered: number;
  available_servings: number;
  student_reserved_servings: number;
  student_pickups: number;
  pantry_reserved_servings: number;
  pantry_transfers: number;
  expired_unclaimed_servings: number;
  pending_pickup_reviews: number;
  pending_pantry_requests: number;
  buildings_served: number;
  joined_sessions: number;
  student_pickup_rate_percent: number;
}
export interface OperationsOutcomes {
  available: number;
  student_reserved: number;
  student_pickups: number;
  pantry_reserved: number;
  pantry_transfers: number;
  expired_unclaimed: number;
}
export interface OperationsSeriesPoint {
  date: string;
  published_listings: number;
  servings_offered: number;
  student_pickups: number;
  pantry_transfers: number;
  expired_unclaimed: number;
}
export interface OperationsBuilding {
  building: Building;
  published_listings: number;
  active_listings: number;
  available_servings: number;
  student_reserved_servings: number;
  student_pickups: number;
  pantry_reserved_servings: number;
  pantry_transfers: number;
  total_servings_offered: number;
  expired_unclaimed_servings: number;
}
export interface OperationsActivity {
  kind:
    | "listing_published"
    | "reservation_opened"
    | "student_pickup"
    | "pantry_requested"
    | "pantry_accepted"
    | "pantry_rejected"
    | "pantry_handoff"
    | "pantry_expired";
  occurred_at: string;
  drop_id: string;
  food: string;
  building_name: string;
  servings: number;
  is_simulated: boolean;
}
export interface OperationsResponse {
  schema_version: 1;
  dataset: OperationsDataset;
  recording_available: boolean;
  period: OperationsPeriod;
  timezone: "America/New_York";
  window_start: string | null;
  server_time: string;
  summary: OperationsSummary;
  outcomes: OperationsOutcomes;
  series: OperationsSeriesPoint[];
  buildings: OperationsBuilding[];
  activity: OperationsActivity[];
  notes: string[];
}
