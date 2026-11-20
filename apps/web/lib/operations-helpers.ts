import type { Building } from "./types/api";
import type {
  OperationsActivity,
  OperationsBuilding,
  OperationsCategory,
  OperationsDataset,
  OperationsEstimates,
  OperationsListing,
  OperationsOutcomes,
  OperationsPeriod,
  OperationsResponse,
  OperationsSeriesPoint,
} from "./types/operations";

/** Header date filters shown in the Food Rescue Analytics UI. */
export const OPERATIONS_UI_PERIODS: ReadonlyArray<{
  id: Exclude<OperationsPeriod, "30d">;
  label: string;
  shortLabel: string;
}> = [
  { id: "today", label: "Today", shortLabel: "Today" },
  { id: "7d", label: "Last 7 days", shortLabel: "7d" },
  { id: "all", label: "All time", shortLabel: "All" },
];

export const PERIOD_LABELS: Record<OperationsPeriod, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

export type OutcomeBucketKey = keyof OperationsOutcomes;

export interface OutcomeBucketItem {
  key: OutcomeBucketKey;
  label: string;
  shortLabel: string;
  count: number;
  percent: number;
  isSimulated: boolean;
  /** Semantic SVG stroke/fill color calibrated for WCAG readability in light & dark themes. */
  color: string;
  /** Tailwind swatch class for legends and indicators. */
  swatchClass: string;
  /** Circumference fraction [0..1] for SVG donut segments. */
  fraction: number;
  /** Cumulative start fraction [0..1] along the donut circumference. */
  startFraction: number;
}

export interface OutcomesBreakdownModel {
  buckets: OutcomeBucketItem[];
  bucketSum: number;
  totalOffered: number;
  isReconciled: boolean;
  isEmpty: boolean;
  accessibleSummary: string;
}

export interface TrendChartPoint {
  date: string;
  shortDate: string;
  fullDate: string;
  publishedListings: number;
  servingsOffered: number;
  studentPickups: number;
  pantryTransfers: number;
  expiredUnclaimed: number;
}

export interface TrendChartModel {
  points: TrendChartPoint[];
  maxY: number;
  yTicks: number[];
  hasData: boolean;
  totals: {
    publishedListings: number;
    servingsOffered: number;
    studentPickups: number;
    pantryTransfers: number;
    expiredUnclaimed: number;
  };
  accessibleSummary: string;
}

export interface BuildingBarItem {
  id: string;
  name: string;
  shortCode: string | null;
  publishedListings: number;
  activeListings: number;
  totalOffered: number;
  studentPickups: number;
  pantryTransfers: number;
  availableServings: number;
  studentReservedServings: number;
  pantryReservedServings: number;
  expiredUnclaimedServings: number;
  /** Bar width percentage [0..100] scaled against the top building's offered servings. */
  barWidthPercent: number;
  studentPickupSharePercent: number;
  pantryTransferSharePercent: number;
  availableSharePercent: number;
}

export interface BuildingsChartModel {
  items: BuildingBarItem[];
  maxOffered: number;
  hasData: boolean;
  accessibleSummary: string;
}

export interface CategoryBarItem {
  key: string;
  label: string;
  publishedListings: number;
  totalOffered: number;
  studentPickups: number;
  pantryTransfers: number;
  barWidthPercent: number;
  recoveryPercent: number;
}

export interface CategoriesChartModel {
  items: CategoryBarItem[];
  totalOffered: number;
  hasData: boolean;
  accessibleSummary: string;
}

export interface IllustrativeEstimateResult {
  currency: "USD";
  recoveredServings: number;
  studentPickups: number;
  simulatedPantryTransfers: number;
  usdPerServing: number;
  kgPerServing: number;
  equivalentMealValue: number;
  recoveredFoodKg: number;
  isCustomized: boolean;
  assumptions: string[];
}

export interface ActivityMeta {
  label: string;
  tone: "gold" | "success" | "warning" | "danger" | "neutral";
  isPantryEvent: boolean;
}

export const MAX_ASSUMPTION_USD = 100;
export const MAX_ASSUMPTION_KG = 10;

const INTERNAL_BUILDING_ID_PATTERN = /^ksu-[a-z0-9-]+$/i;

/** Formats integer counts consistently with grouping commas. */
export function formatCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value)));
}

/**
 * Formats a percentage to at most one decimal place so acceptance values like
 * 66.666... render as "66.7%" while exact integers like 0 or 100 render cleanly
 * as "0%" or "100%".
 */
export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  const clamped = Math.max(0, value);
  const rounded = Math.round(clamped * 10) / 10;
  const normalized = Math.abs(rounded) < 0.05 ? 0 : rounded;
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(normalized)}%`;
}

/** Formats USD currency for illustrative meal-equivalent estimates. */
export function formatUsd(value: number | null | undefined): string {
  const safe =
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, value)
      : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

/** Formats recovered food weight in kilograms with up to two decimal places. */
export function formatKg(value: number | null | undefined): string {
  const safe =
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, value)
      : 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: safe > 0 && safe < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safe);
  return `${formatted} kg`;
}

/**
 * Formats average reservation delay in seconds; returns an em-dash when null so
 * zero-claim windows never display a misleading "0s".
 */
export function formatDurationSeconds(
  seconds: number | null | undefined,
): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remSeconds = rounded % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
}

/** Parses YYYY-MM-DD at UTC noon so America/New_York formatting never shifts a calendar day. */
function parseCalendarDayNoonUtc(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Formats a YYYY-MM-DD date string for chart axes in America/New_York. */
export function formatEasternCalendarDate(
  ymd: string,
  style: "short" | "full" = "short",
): string {
  const date = parseCalendarDayNoonUtc(ymd);
  if (!date) return ymd;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    ...(style === "full" ? { year: "numeric" } : {}),
  }).format(date);
}

/** Formats a UTC ISO timestamp in America/New_York with date and time. */
export function formatEasternDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

/** Formats a UTC ISO timestamp as a compact America/New_York time with zone. */
export function formatEasternClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

/** Computes a human countdown for active listing deadlines using server time to prevent clock skew. */
export function formatDeadlineCountdown(
  expiresAtIso: string | null | undefined,
  serverTimeIso?: string | null,
): { label: string; isUrgent: boolean; isExpired: boolean } {
  if (!expiresAtIso) {
    return { label: "—", isUrgent: false, isExpired: false };
  }
  const expiresMs = Date.parse(expiresAtIso);
  const nowMs = serverTimeIso ? Date.parse(serverTimeIso) : Date.now();
  if (!Number.isFinite(expiresMs) || !Number.isFinite(nowMs)) {
    return { label: "—", isUrgent: false, isExpired: false };
  }
  const diffSec = Math.floor((expiresMs - nowMs) / 1000);
  if (diffSec <= 0) {
    return { label: "Expired", isUrgent: false, isExpired: true };
  }
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  if (hours > 0) {
    return {
      label: mins > 0 ? `${hours}h ${mins}m left` : `${hours}h left`,
      isUrgent: false,
      isExpired: false,
    };
  }
  if (mins > 0) {
    return {
      label: `${mins}m left`,
      isUrgent: mins < 10,
      isExpired: false,
    };
  }
  return {
    label: `${diffSec}s left`,
    isUrgent: true,
    isExpired: false,
  };
}

/**
 * Ensures internal registry slugs (e.g. "ksu-marietta-academic-building") never
 * leak into visible UI labels.
 */
export function formatSafeBuildingName(
  buildingOrName:
    Pick<Building, "name" | "building_code"> | string | null | undefined,
): string {
  const rawName =
    typeof buildingOrName === "string"
      ? buildingOrName
      : (buildingOrName?.name ?? "");
  const trimmed = rawName.trim();
  if (!trimmed || INTERNAL_BUILDING_ID_PATTERN.test(trimmed)) {
    return "Verified campus building";
  }
  return trimmed;
}

/** Formats a verified building and optional room cleanly for listing rows. */
export function formatBuildingWithRoom(
  building: Pick<Building, "name" | "building_code"> | null | undefined,
  room: string | null | undefined,
): string {
  const name = formatSafeBuildingName(building);
  const cleanRoom = room?.trim();
  return cleanRoom ? `${name} · ${cleanRoom}` : name;
}

/** Returns true whenever the active analytics payload represents simulated recording data. */
export function isRecordingDataset(
  dataset: OperationsDataset | null | undefined,
): boolean {
  if (!dataset) return false;
  return dataset.kind === "recording" || dataset.is_simulated === true;
}

/** Creates a stable slug for category testids without relying on arbitrary whitespace/casing. */
export function slugifyCategory(category: string): string {
  const slug = category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "other";
}

/** Computes student-only and combined demonstration recovery percentages safely. */
export function computeRecoveryRates(params: {
  totalOffered: number;
  studentPickups: number;
  pantryTransfers: number;
}): {
  studentRecoveryPercent: number;
  combinedDemoRecoveryPercent: number;
} {
  const total = Math.max(0, params.totalOffered);
  if (total === 0) {
    return { studentRecoveryPercent: 0, combinedDemoRecoveryPercent: 0 };
  }
  const student = Math.max(0, params.studentPickups);
  const pantry = Math.max(0, params.pantryTransfers);
  return {
    studentRecoveryPercent: (student / total) * 100,
    combinedDemoRecoveryPercent: ((student + pantry) / total) * 100,
  };
}

/**
 * Resolves illustrative USD and kg impact estimates. Uses exact server-supplied
 * values by default, and allows transparent local assumption overrides with
 * bounded nonnegative inputs.
 */
export function resolveIllustrativeEstimates(
  estimates: OperationsEstimates,
  summary: { student_pickups: number; pantry_transfers: number },
  overrides?: {
    usdPerServing?: number | null;
    kgPerServing?: number | null;
  },
): IllustrativeEstimateResult {
  const baseUsd = Math.max(0, estimates.meal_value_per_serving);
  const baseKg = Math.max(0, estimates.food_kg_per_serving);
  const hasUsdOverride =
    typeof overrides?.usdPerServing === "number" &&
    Number.isFinite(overrides.usdPerServing) &&
    Math.abs(overrides.usdPerServing - baseUsd) > 1e-9;
  const hasKgOverride =
    typeof overrides?.kgPerServing === "number" &&
    Number.isFinite(overrides.kgPerServing) &&
    Math.abs(overrides.kgPerServing - baseKg) > 1e-9;

  const usdPerServing = hasUsdOverride
    ? Math.min(MAX_ASSUMPTION_USD, Math.max(0, overrides!.usdPerServing!))
    : baseUsd;
  const kgPerServing = hasKgOverride
    ? Math.min(MAX_ASSUMPTION_KG, Math.max(0, overrides!.kgPerServing!))
    : baseKg;

  const isCustomized = hasUsdOverride || hasKgOverride;
  const recoveredServings = Math.max(0, estimates.recovered_servings);
  const equivalentMealValue = isCustomized
    ? Number((recoveredServings * usdPerServing).toFixed(2))
    : Math.max(0, estimates.equivalent_meal_value);
  const recoveredFoodKg = isCustomized
    ? Number((recoveredServings * kgPerServing).toFixed(2))
    : Math.max(0, estimates.recovered_food_kg);

  return {
    currency: estimates.currency,
    recoveredServings,
    studentPickups: Math.max(0, summary.student_pickups),
    simulatedPantryTransfers: Math.max(0, summary.pantry_transfers),
    usdPerServing,
    kgPerServing,
    equivalentMealValue,
    recoveredFoodKg,
    isCustomized,
    assumptions: estimates.assumptions,
  };
}

const OUTCOME_SPECS: ReadonlyArray<{
  key: OutcomeBucketKey;
  label: string;
  shortLabel: string;
  isSimulated: boolean;
  color: string;
  swatchClass: string;
}> = [
  {
    key: "student_pickups",
    label: "Student pickups",
    shortLabel: "Collected",
    isSimulated: false,
    color: "#15803d",
    swatchClass: "bg-[#15803d] dark:bg-[#4ade80]",
  },
  {
    key: "available",
    label: "Available now",
    shortLabel: "Available",
    isSimulated: false,
    color: "#2563eb",
    swatchClass: "bg-[#2563eb] dark:bg-[#60a5fa]",
  },
  {
    key: "student_reserved",
    label: "Student reserved",
    shortLabel: "Reserved",
    isSimulated: false,
    color: "#fdbb30",
    swatchClass: "bg-owl-gold",
  },
  {
    key: "pantry_transfers",
    label: "Pantry transfers (simulated)",
    shortLabel: "Pantry transfers",
    isSimulated: true,
    color: "#9333ea",
    swatchClass: "bg-[#9333ea] dark:bg-[#c084fc]",
  },
  {
    key: "pantry_reserved",
    label: "Pantry reserved (simulated)",
    shortLabel: "Pantry reserved",
    isSimulated: true,
    color: "#c026d3",
    swatchClass: "bg-[#c026d3] dark:bg-[#e879f9]",
  },
  {
    key: "expired_unclaimed",
    label: "Expired unclaimed",
    shortLabel: "Expired",
    isSimulated: false,
    color: "#64748b",
    swatchClass: "bg-[#64748b] dark:bg-[#94a3b8]",
  },
];

/**
 * Reconciles the six mutually exclusive serving outcomes against total servings
 * offered and computes normalized SVG donut arc geometry.
 */
export function buildOutcomesBreakdown(
  outcomes: OperationsOutcomes,
  totalOffered: number,
  simulatedDataset = false,
): OutcomesBreakdownModel {
  const safeTotal = Math.max(0, Math.round(totalOffered));
  const rawCounts = OUTCOME_SPECS.map((spec) => ({
    spec,
    count: Math.max(0, Math.round(outcomes[spec.key] ?? 0)),
  }));
  const bucketSum = rawCounts.reduce((acc, item) => acc + item.count, 0);
  const denominator = bucketSum > 0 ? bucketSum : safeTotal;
  let runningFraction = 0;

  const buckets: OutcomeBucketItem[] = rawCounts.map(({ spec, count }) => {
    const fraction = denominator > 0 ? count / denominator : 0;
    const startFraction = runningFraction;
    runningFraction += fraction;
    return {
      key: spec.key,
      label: spec.label,
      shortLabel: spec.shortLabel,
      count,
      percent: denominator > 0 ? (count / denominator) * 100 : 0,
      isSimulated: spec.isSimulated || simulatedDataset,
      color: spec.color,
      swatchClass: spec.swatchClass,
      fraction,
      startFraction,
    };
  });

  const isEmpty = bucketSum === 0;
  const isReconciled = bucketSum === safeTotal;
  const prefix = simulatedDataset ? "Simulated recording dataset: " : "";
  const accessibleSummary = isEmpty
    ? `${prefix}No servings recorded for the selected period.`
    : `${prefix}${formatCount(bucketSum)} total servings reconciled across six outcomes: ${buckets
        .map(
          (b) =>
            `${b.label} ${formatCount(b.count)} (${formatPercent(b.percent)})`,
        )
        .join(", ")}.`;

  return {
    buckets,
    bucketSum,
    totalOffered: safeTotal,
    isReconciled,
    isEmpty,
    accessibleSummary,
  };
}

/** Computes clean integer Y-axis ticks so serving counts never render fractional labels. */
export function computeIntegerYTicks(maxValue: number): {
  maxY: number;
  ticks: number[];
} {
  const safeMax = Math.max(0, Math.ceil(maxValue));
  if (safeMax <= 4) {
    const top = Math.max(4, safeMax);
    return { maxY: top, ticks: [0, Math.ceil(top / 2), top] };
  }
  const roughStep = safeMax / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  let niceStep = magnitude;
  if (normalized > 5) niceStep = 10 * magnitude;
  else if (normalized > 2) niceStep = 5 * magnitude;
  else if (normalized > 1) niceStep = 2 * magnitude;

  const maxY = Math.ceil(safeMax / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = 0; v <= maxY; v += niceStep) {
    ticks.push(v);
  }
  if (ticks[ticks.length - 1] !== maxY) {
    ticks.push(maxY);
  }
  return { maxY, ticks };
}

/**
 * Prepares the actual-date publication & collection trend chart model without
 * inventing intermediate dates or drawing lines across empty data.
 */
export function buildTrendChartModel(
  series: ReadonlyArray<OperationsSeriesPoint>,
  simulatedDataset = false,
): TrendChartModel {
  const points: TrendChartPoint[] = series.map((pt) => ({
    date: pt.date,
    shortDate: formatEasternCalendarDate(pt.date, "short"),
    fullDate: formatEasternCalendarDate(pt.date, "full"),
    publishedListings: Math.max(0, Math.round(pt.published_listings)),
    servingsOffered: Math.max(0, Math.round(pt.servings_offered)),
    studentPickups: Math.max(0, Math.round(pt.student_pickups)),
    pantryTransfers: Math.max(0, Math.round(pt.pantry_transfers)),
    expiredUnclaimed: Math.max(0, Math.round(pt.expired_unclaimed)),
  }));

  const totals = points.reduce(
    (acc, pt) => ({
      publishedListings: acc.publishedListings + pt.publishedListings,
      servingsOffered: acc.servingsOffered + pt.servingsOffered,
      studentPickups: acc.studentPickups + pt.studentPickups,
      pantryTransfers: acc.pantryTransfers + pt.pantryTransfers,
      expiredUnclaimed: acc.expiredUnclaimed + pt.expiredUnclaimed,
    }),
    {
      publishedListings: 0,
      servingsOffered: 0,
      studentPickups: 0,
      pantryTransfers: 0,
      expiredUnclaimed: 0,
    },
  );

  const peak = points.reduce(
    (max, pt) =>
      Math.max(max, pt.servingsOffered, pt.studentPickups, pt.pantryTransfers),
    0,
  );
  const hasData = points.length > 0 && peak > 0;
  const { maxY, ticks } = computeIntegerYTicks(peak);
  const prefix = simulatedDataset ? "Simulated recording dataset: " : "";
  const accessibleSummary = !hasData
    ? `${prefix}No dated publishing or collection events in this period.`
    : `${prefix}Actual-date activity across ${points.length} ${points.length === 1 ? "day" : "days"}: ${formatCount(totals.servingsOffered)} servings shared, ${formatCount(totals.studentPickups)} student pickups, ${formatCount(totals.pantryTransfers)} simulated pantry transfers.`;

  return {
    points,
    maxY,
    yTicks: ticks,
    hasData,
    totals,
    accessibleSummary,
  };
}

/** Prepares horizontal building breakdown bars using verified building names only. */
export function buildBuildingsChartModel(
  buildings: ReadonlyArray<OperationsBuilding>,
  maxRows = 8,
  simulatedDataset = false,
): BuildingsChartModel {
  const sliced = buildings.slice(0, maxRows);
  const maxOffered = sliced.reduce(
    (max, row) => Math.max(max, Math.max(0, row.total_servings_offered)),
    0,
  );

  const items: BuildingBarItem[] = sliced.map((row) => {
    const offered = Math.max(0, Math.round(row.total_servings_offered));
    const pickups = Math.max(0, Math.round(row.student_pickups));
    const pantryTransfers = Math.max(0, Math.round(row.pantry_transfers));
    const available = Math.max(0, Math.round(row.available_servings));
    const barWidthPercent = maxOffered > 0 ? (offered / maxOffered) * 100 : 0;
    return {
      id: row.building.id,
      name: formatSafeBuildingName(row.building),
      shortCode: row.building.building_code?.trim() || null,
      publishedListings: Math.max(0, Math.round(row.published_listings)),
      activeListings: Math.max(0, Math.round(row.active_listings)),
      totalOffered: offered,
      studentPickups: pickups,
      pantryTransfers,
      availableServings: available,
      studentReservedServings: Math.max(
        0,
        Math.round(row.student_reserved_servings),
      ),
      pantryReservedServings: Math.max(
        0,
        Math.round(row.pantry_reserved_servings),
      ),
      expiredUnclaimedServings: Math.max(
        0,
        Math.round(row.expired_unclaimed_servings),
      ),
      barWidthPercent,
      studentPickupSharePercent: offered > 0 ? (pickups / offered) * 100 : 0,
      pantryTransferSharePercent:
        offered > 0 ? (pantryTransfers / offered) * 100 : 0,
      availableSharePercent: offered > 0 ? (available / offered) * 100 : 0,
    };
  });

  const hasData = items.length > 0 && maxOffered > 0;
  const prefix = simulatedDataset ? "Simulated recording dataset: " : "";
  const accessibleSummary = !hasData
    ? `${prefix}No verified campus buildings recorded for this period.`
    : `${prefix}Top ${items.length} verified campus ${items.length === 1 ? "building" : "buildings"} led by ${items[0]!.name} (${formatCount(items[0]!.studentPickups)} student pickups of ${formatCount(items[0]!.totalOffered)} servings shared).`;

  return {
    items,
    maxOffered,
    hasData,
    accessibleSummary,
  };
}

export interface CampusMapMarker extends BuildingBarItem {
  /** One-based rank matching the server's building order. */
  rank: number;
  /** Marker centre in SVG viewBox units. */
  x: number;
  y: number;
  /** Marker radius scaled by servings shared at this building. */
  radius: number;
}

export interface CampusMapModel {
  markers: CampusMapMarker[];
  width: number;
  height: number;
  hasData: boolean;
  accessibleSummary: string;
}

const CAMPUS_MARKER_MIN_RADIUS = 15;
const CAMPUS_MARKER_MAX_RADIUS = 30;
const CAMPUS_MARKER_GAP = 5;
const CAMPUS_RELAXATION_PASSES = 80;

/**
 * Lays verified buildings out by their registry coordinates so the campus
 * panel reads as a schematic map. Markers are scaled by servings shared and
 * nudged apart deterministically so close neighbours never overlap. Positions
 * are relative only; this is not a navigational map.
 */
export function buildCampusMapModel(
  buildings: ReadonlyArray<OperationsBuilding>,
  maxRows = 8,
  simulatedDataset = false,
  viewport: { width: number; height: number } = { width: 360, height: 230 },
): CampusMapModel {
  const chart = buildBuildingsChartModel(buildings, maxRows, simulatedDataset);
  const { width, height } = viewport;
  const rows = buildings.slice(0, maxRows);

  const radii = chart.items.map((item) =>
    chart.maxOffered > 0
      ? CAMPUS_MARKER_MIN_RADIUS +
        (CAMPUS_MARKER_MAX_RADIUS - CAMPUS_MARKER_MIN_RADIUS) *
          Math.sqrt(item.totalOffered / chart.maxOffered)
      : CAMPUS_MARKER_MIN_RADIUS,
  );

  const located = rows.map((row) => {
    const lat = row.building.latitude;
    const lng = row.building.longitude;
    return typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
      ? { lat, lng }
      : null;
  });
  const known = located.filter(
    (point): point is { lat: number; lng: number } => point !== null,
  );
  const minLat = Math.min(...known.map((p) => p.lat));
  const maxLat = Math.max(...known.map((p) => p.lat));
  const minLng = Math.min(...known.map((p) => p.lng));
  const maxLng = Math.max(...known.map((p) => p.lng));
  const midLat = known.length > 0 ? (minLat + maxLat) / 2 : 0;
  // Longitude degrees shrink with latitude; correct so the layout is not stretched.
  const lngScale = Math.cos((midLat * Math.PI) / 180);
  const spanX = known.length > 0 ? (maxLng - minLng) * lngScale : 0;
  const spanY = known.length > 0 ? maxLat - minLat : 0;
  const pad = CAMPUS_MARKER_MAX_RADIUS + 6;
  const innerWidth = Math.max(1, width - pad * 2);
  const innerHeight = Math.max(1, height - pad * 2);
  const scale = Math.min(
    spanX > 0 ? innerWidth / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? innerHeight / spanY : Number.POSITIVE_INFINITY,
  );
  const usedWidth = Number.isFinite(scale) ? spanX * scale : 0;
  const usedHeight = Number.isFinite(scale) ? spanY * scale : 0;
  const originX = (width - usedWidth) / 2;
  const originY = (height - usedHeight) / 2;

  const positions = located.map((point) =>
    point && Number.isFinite(scale)
      ? {
          x: originX + (point.lng - minLng) * lngScale * scale,
          y: originY + (maxLat - point.lat) * scale,
        }
      : { x: width / 2, y: height / 2 },
  );

  const clamp = (value: number, low: number, high: number) =>
    Math.min(Math.max(value, low), Math.max(low, high));

  for (let pass = 0; pass < CAMPUS_RELAXATION_PASSES; pass += 1) {
    let moved = false;
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i]!;
        const b = positions[j]!;
        const minDistance = radii[i]! + radii[j]! + CAMPUS_MARKER_GAP;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minDistance) continue;
        if (distance < 1e-6) {
          // Identical coordinates: separate along a fixed per-pair angle.
          const angle = ((i * 7 + j * 13) % 12) * (Math.PI / 6);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const push = (minDistance - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        moved = true;
      }
    }
    positions.forEach((point, index) => {
      const r = radii[index]!;
      point.x = clamp(point.x, r + 2, width - r - 2);
      point.y = clamp(point.y, r + 2, height - r - 2);
    });
    if (!moved) break;
  }

  const markers: CampusMapMarker[] = chart.items.map((item, index) => ({
    ...item,
    rank: index + 1,
    x: Number(positions[index]!.x.toFixed(2)),
    y: Number(positions[index]!.y.toFixed(2)),
    radius: Number(radii[index]!.toFixed(2)),
  }));

  return {
    markers,
    width,
    height,
    hasData: chart.hasData,
    accessibleSummary: chart.accessibleSummary,
  };
}

/** Prepares horizontal food-category bars from backend-classified cohort totals. */
export function buildCategoriesChartModel(
  categories: ReadonlyArray<OperationsCategory>,
  simulatedDataset = false,
): CategoriesChartModel {
  const sorted = [...categories].sort(
    (a, b) =>
      b.total_servings_offered - a.total_servings_offered ||
      b.student_pickups - a.student_pickups ||
      a.category.localeCompare(b.category),
  );
  const maxOffered = sorted.reduce(
    (max, c) => Math.max(max, Math.max(0, c.total_servings_offered)),
    0,
  );
  const totalOffered = sorted.reduce(
    (sum, c) => sum + Math.max(0, Math.round(c.total_servings_offered)),
    0,
  );

  const items: CategoryBarItem[] = sorted.map((cat) => {
    const offered = Math.max(0, Math.round(cat.total_servings_offered));
    const pickups = Math.max(0, Math.round(cat.student_pickups));
    const pantry = Math.max(0, Math.round(cat.pantry_transfers));
    return {
      key: slugifyCategory(cat.category),
      label: cat.category.trim() || "Other",
      publishedListings: Math.max(0, Math.round(cat.published_listings)),
      totalOffered: offered,
      studentPickups: pickups,
      pantryTransfers: pantry,
      barWidthPercent: maxOffered > 0 ? (offered / maxOffered) * 100 : 0,
      recoveryPercent: offered > 0 ? (pickups / offered) * 100 : 0,
    };
  });

  const hasData = items.length > 0 && totalOffered > 0;
  const prefix = simulatedDataset ? "Simulated recording dataset: " : "";
  const accessibleSummary = !hasData
    ? `${prefix}No food categories recorded in this period.`
    : `${prefix}${items.length} food ${items.length === 1 ? "category" : "categories"} totaling ${formatCount(totalOffered)} servings offered.`;

  return {
    items,
    totalOffered,
    hasData,
    accessibleSummary,
  };
}

/** Maps persisted activity kinds to honest, plain-English labels and badge tones. */
export function describeActivityKind(
  kind: OperationsActivity["kind"],
): ActivityMeta {
  switch (kind) {
    case "listing_published":
      return {
        label: "Listing published",
        tone: "gold",
        isPantryEvent: false,
      };
    case "reservation_opened":
      return {
        label: "Student reserved",
        tone: "neutral",
        isPantryEvent: false,
      };
    case "student_pickup":
      return {
        label: "Student pickup",
        tone: "success",
        isPantryEvent: false,
      };
    case "pantry_requested":
      return {
        label: "Pantry referral requested",
        tone: "warning",
        isPantryEvent: true,
      };
    case "pantry_accepted":
      return {
        label: "Pantry referral accepted",
        tone: "warning",
        isPantryEvent: true,
      };
    case "pantry_rejected":
      return {
        label: "Pantry referral declined",
        tone: "danger",
        isPantryEvent: true,
      };
    case "pantry_handoff":
      return {
        label: "Pantry handoff (simulated)",
        tone: "success",
        isPantryEvent: true,
      };
    case "pantry_expired":
      return {
        label: "Pantry referral expired",
        tone: "neutral",
        isPantryEvent: true,
      };
  }
}

/** Maps listing status strings to accessible labels and tones. */
export function describeListingStatus(
  listing: Pick<OperationsListing, "status" | "available">,
): {
  label: string;
  tone: "success" | "warning" | "neutral";
} {
  if (listing.status === "claimed_out" || listing.available <= 0) {
    return { label: "Claimed out", tone: "warning" };
  }
  if (listing.status === "live") {
    return { label: "Live", tone: "success" };
  }
  return { label: listing.status, tone: "neutral" };
}

/** Returns true when a loaded analytics snapshot contains zero published listings and zero activity. */
export function isSnapshotEmpty(data: OperationsResponse): boolean {
  return (
    data.summary.published_listings === 0 &&
    data.summary.total_servings_offered === 0 &&
    data.active_listings.length === 0 &&
    data.activity.length === 0
  );
}
