import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function compileTs(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadOperationsHelpers() {
  const compiled = compileTs("../lib/operations-helpers.ts");
  const exportsObj = {};
  runInNewContext(compiled, {
    exports: exportsObj,
    require: () => ({}),
  });
  return exportsObj;
}

function makeBuilding(overrides = {}) {
  return {
    id: "ksu-marietta-joe-mack-wilson-student-center",
    name: "Joe Mack Wilson Student Center",
    building_code: "A",
    building_number: "840",
    category: "student_life",
    latitude: 33.937718,
    longitude: -84.520025,
    verification_status: "verified",
    sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
    ...overrides,
  };
}

function makeTypedOperationsResponse(overrides = {}) {
  return {
    schema_version: 1,
    dataset: {
      kind: "current",
      label: "Current app data",
      is_simulated: false,
      seed_version: null,
      anchor_time: null,
    },
    recording_available: true,
    period: "7d",
    timezone: "America/New_York",
    window_start: "2026-11-14T05:00:00Z",
    server_time: "2026-11-20T17:00:00Z",
    summary: {
      published_listings: 1,
      active_listings: 1,
      total_servings_offered: 3,
      available_servings: 0,
      student_reserved_servings: 0,
      student_pickups: 2,
      pantry_reserved_servings: 0,
      pantry_transfers: 1,
      expired_unclaimed_servings: 0,
      pending_pickup_reviews: 0,
      pending_pantry_requests: 0,
      buildings_served: 1,
      joined_sessions: 2,
      student_pickup_rate_percent: 66.6666666667,
      combined_recovery_rate_percent: 100,
      average_reservation_seconds: 185,
      participating_hosts: 1,
      participating_students: 2,
    },
    outcomes: {
      available: 0,
      student_reserved: 0,
      student_pickups: 2,
      pantry_reserved: 0,
      pantry_transfers: 1,
      expired_unclaimed: 0,
    },
    series: [
      {
        date: "2026-11-20",
        published_listings: 1,
        servings_offered: 3,
        student_pickups: 2,
        pantry_transfers: 1,
        expired_unclaimed: 0,
      },
    ],
    buildings: [
      {
        building: makeBuilding(),
        published_listings: 1,
        active_listings: 1,
        available_servings: 0,
        student_reserved_servings: 0,
        student_pickups: 2,
        pantry_reserved_servings: 0,
        pantry_transfers: 1,
        total_servings_offered: 3,
        expired_unclaimed_servings: 0,
      },
    ],
    activity: [
      {
        kind: "pantry_handoff",
        occurred_at: "2026-11-20T16:45:00Z",
        drop_id: "drop-1",
        food: "Cheese Pizza",
        building_name: "Joe Mack Wilson Student Center",
        servings: 1,
        is_simulated: true,
      },
    ],
    categories: [
      {
        category: "Pizza",
        published_listings: 1,
        total_servings_offered: 3,
        student_pickups: 2,
        pantry_transfers: 1,
      },
    ],
    active_listings: [
      {
        drop_id: "drop-1",
        food: "Cheese Pizza",
        category: "Pizza",
        building: makeBuilding(),
        room: "214",
        published_at: "2026-11-20T16:00:00Z",
        expires_at: "2026-11-20T17:30:00Z",
        status: "claimed_out",
        has_photo: true,
        photo_url: "/drops/drop-1/photo",
        total_servings: 3,
        available: 0,
        held: 0,
        picked_up: 2,
        pantry_held: 0,
        pantry_transferred: 1,
      },
    ],
    estimates: {
      currency: "USD",
      meal_value_per_serving: 5,
      food_kg_per_serving: 0.35,
      recovered_servings: 3,
      equivalent_meal_value: 15,
      recovered_food_kg: 1.05,
      assumptions: [
        "Illustrative $5.00 meal-equivalent value per recovered serving.",
        "Illustrative 0.35 kg food weight per recovered serving.",
      ],
    },
    notes: ["Student pickups are recorded app confirmations."],
    ...overrides,
  };
}

test("acceptance recovery math: 3 servings, 2 student pickups, 1 simulated transfer => 66.7% student / 100% combined", () => {
  const helpers = loadOperationsHelpers();
  const rates = helpers.computeRecoveryRates({
    totalOffered: 3,
    studentPickups: 2,
    pantryTransfers: 1,
  });

  assert.equal(helpers.formatPercent(rates.studentRecoveryPercent), "66.7%");
  assert.equal(
    helpers.formatPercent(rates.combinedDemoRecoveryPercent),
    "100%",
  );

  // Zero denominator remains safely 0% (never NaN or Infinity)
  const emptyRates = helpers.computeRecoveryRates({
    totalOffered: 0,
    studentPickups: 0,
    pantryTransfers: 0,
  });
  assert.equal(emptyRates.studentRecoveryPercent, 0);
  assert.equal(emptyRates.combinedDemoRecoveryPercent, 0);
  assert.equal(helpers.formatPercent(emptyRates.studentRecoveryPercent), "0%");
  assert.equal(helpers.formatPercent(Number.NaN), "0%");
  assert.equal(helpers.formatPercent(-0.01), "0%");
});

test("formatting helpers handle counts, USD, kg, durations, and America/New_York calendar dates without day shift", () => {
  const helpers = loadOperationsHelpers();

  assert.equal(helpers.formatCount(1234), "1,234");
  assert.equal(helpers.formatCount(-5), "0");
  assert.equal(helpers.formatCount(null), "0");

  assert.equal(helpers.formatUsd(15), "$15.00");
  assert.equal(helpers.formatUsd(0), "$0.00");
  assert.equal(helpers.formatKg(1.05), "1.05 kg");
  assert.equal(helpers.formatKg(0), "0 kg");

  // Average reservation delay null safety
  assert.equal(helpers.formatDurationSeconds(null), "—");
  assert.equal(helpers.formatDurationSeconds(undefined), "—");
  assert.equal(helpers.formatDurationSeconds(0), "0s");
  assert.equal(helpers.formatDurationSeconds(42), "42s");
  assert.equal(helpers.formatDurationSeconds(120), "2m");
  assert.equal(helpers.formatDurationSeconds(185), "3m 5s");
  assert.equal(helpers.formatDurationSeconds(3660), "1h 1m");
  assert.equal(helpers.formatDurationSeconds(7200), "2h");

  // Calendar YYYY-MM-DD formatting must preserve exact NY day across EST and EDT
  assert.equal(
    helpers.formatEasternCalendarDate("2026-11-20", "short"),
    "Nov 20",
  );
  assert.equal(
    helpers.formatEasternCalendarDate("2026-07-04", "full"),
    "Jul 4, 2026",
  );

  // ISO timestamps convert to EST / EDT cleanly
  assert.match(
    helpers.formatEasternDateTime("2026-11-20T17:00:00Z"),
    /Nov 20.*12:00 PM EST/,
  );
  assert.match(
    helpers.formatEasternDateTime("2026-07-04T16:00:00Z"),
    /Jul 4.*12:00 PM EDT/,
  );
  assert.equal(helpers.formatEasternDateTime("not-a-date"), "—");

  // Countdown relative to server_time
  const urgent = helpers.formatDeadlineCountdown(
    "2026-11-20T17:08:00Z",
    "2026-11-20T17:00:00Z",
  );
  assert.equal(urgent.label, "8m left");
  assert.equal(urgent.isUrgent, true);
  assert.equal(urgent.isExpired, false);

  const expired = helpers.formatDeadlineCountdown(
    "2026-11-20T16:59:00Z",
    "2026-11-20T17:00:00Z",
  );
  assert.equal(expired.label, "Expired");
  assert.equal(expired.isExpired, true);
});

test("formatSafeBuildingName never displays raw internal building IDs as visible labels", () => {
  const helpers = loadOperationsHelpers();
  assert.equal(
    helpers.formatSafeBuildingName(makeBuilding()),
    "Joe Mack Wilson Student Center",
  );
  assert.equal(
    helpers.formatSafeBuildingName("ksu-marietta-academic-building"),
    "Verified campus building",
  );
  assert.equal(
    helpers.formatSafeBuildingName({
      name: "ksu-marietta-library",
      building_code: "C",
    }),
    "Verified campus building",
  );
  assert.equal(
    helpers.formatBuildingWithRoom(makeBuilding(), "214"),
    "Joe Mack Wilson Student Center · 214",
  );
});

test("resolveIllustrativeEstimates preserves server defaults and recalculates bounded custom assumptions", () => {
  const helpers = loadOperationsHelpers();
  const sample = makeTypedOperationsResponse();

  const defaults = helpers.resolveIllustrativeEstimates(
    sample.estimates,
    sample.summary,
  );
  assert.equal(defaults.isCustomized, false);
  assert.equal(defaults.usdPerServing, 5);
  assert.equal(defaults.kgPerServing, 0.35);
  assert.equal(defaults.equivalentMealValue, 15);
  assert.equal(defaults.recoveredFoodKg, 1.05);
  assert.equal(defaults.studentPickups, 2);
  assert.equal(defaults.simulatedPantryTransfers, 1);

  const custom = helpers.resolveIllustrativeEstimates(
    sample.estimates,
    sample.summary,
    { usdPerServing: 8, kgPerServing: 0.5 },
  );
  assert.equal(custom.isCustomized, true);
  assert.equal(custom.equivalentMealValue, 24);
  assert.equal(custom.recoveredFoodKg, 1.5);

  // Clamps out-of-range assumptions safely
  const clamped = helpers.resolveIllustrativeEstimates(
    sample.estimates,
    sample.summary,
    { usdPerServing: 500, kgPerServing: -3 },
  );
  assert.equal(clamped.usdPerServing, helpers.MAX_ASSUMPTION_USD);
  assert.equal(clamped.kgPerServing, 0);
});

test("buildOutcomesBreakdown reconciles all six buckets, avoids NaN on empty, and marks simulated data", () => {
  const helpers = loadOperationsHelpers();
  const sample = makeTypedOperationsResponse();

  const full = helpers.buildOutcomesBreakdown(
    sample.outcomes,
    sample.summary.total_servings_offered,
    false,
  );
  assert.equal(full.isEmpty, false);
  assert.equal(full.isReconciled, true);
  assert.equal(full.bucketSum, 3);
  assert.equal(full.buckets.length, 6);

  const fractionSum = full.buckets.reduce((acc, b) => acc + b.fraction, 0);
  assert.ok(Math.abs(fractionSum - 1) < 1e-9);

  const studentBucket = full.buckets.find((b) => b.key === "student_pickups");
  const pantryBucket = full.buckets.find((b) => b.key === "pantry_transfers");
  assert.equal(helpers.formatPercent(studentBucket.percent), "66.7%");
  assert.equal(pantryBucket.isSimulated, true);
  assert.equal(studentBucket.isSimulated, false);

  const empty = helpers.buildOutcomesBreakdown(
    {
      available: 0,
      student_reserved: 0,
      student_pickups: 0,
      pantry_reserved: 0,
      pantry_transfers: 0,
      expired_unclaimed: 0,
    },
    0,
    true,
  );
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.isReconciled, true);
  assert.match(empty.accessibleSummary, /Simulated recording dataset/);
  for (const b of empty.buckets) {
    assert.equal(Number.isFinite(b.fraction), true);
    assert.equal(b.fraction, 0);
  }
});

test("trend, buildings, and categories chart models compute integer scales, totals, and clean empty states", () => {
  const helpers = loadOperationsHelpers();
  const sample = makeTypedOperationsResponse();

  const trend = helpers.buildTrendChartModel(sample.series, true);
  assert.equal(trend.hasData, true);
  assert.equal(trend.totals.servingsOffered, 3);
  assert.equal(trend.totals.studentPickups, 2);
  assert.equal(trend.totals.pantryTransfers, 1);
  assert.ok(trend.yTicks.every((t) => Number.isInteger(t)));
  assert.match(trend.accessibleSummary, /Simulated recording dataset/);

  const emptyTrend = helpers.buildTrendChartModel([], false);
  assert.equal(emptyTrend.hasData, false);

  const zeroTrend = helpers.buildTrendChartModel(
    [
      {
        date: "2026-11-20",
        published_listings: 0,
        servings_offered: 0,
        student_pickups: 0,
        pantry_transfers: 0,
        expired_unclaimed: 0,
      },
    ],
    false,
  );
  assert.equal(zeroTrend.hasData, false);

  const buildings = helpers.buildBuildingsChartModel(
    sample.buildings,
    8,
    false,
  );
  assert.equal(buildings.hasData, true);
  assert.equal(buildings.items[0].name, "Joe Mack Wilson Student Center");
  assert.equal(buildings.items[0].barWidthPercent, 100);
  assert.equal(helpers.buildBuildingsChartModel([], 8, false).hasData, false);

  const categories = helpers.buildCategoriesChartModel(
    sample.categories,
    false,
  );
  assert.equal(categories.hasData, true);
  assert.equal(categories.items[0].key, "pizza");
  assert.equal(
    helpers.formatPercent(categories.items[0].recoveryPercent),
    "66.7%",
  );
  assert.equal(helpers.buildCategoriesChartModel([], false).hasData, false);

  assert.equal(helpers.isSnapshotEmpty(sample), false);
  assert.equal(helpers.isRecordingDataset(sample.dataset), false);
  assert.equal(
    helpers.isRecordingDataset({
      kind: "recording",
      label: "Recording dataset",
      is_simulated: true,
      seed_version: "v1",
      anchor_time: "2026-11-20T17:00:00Z",
    }),
    true,
  );
  assert.equal(
    helpers.describeActivityKind("pantry_handoff").isPantryEvent,
    true,
  );
  assert.equal(
    helpers.describeListingStatus(sample.active_listings[0]).label,
    "Claimed out",
  );
});

test("analytics UI source preserves clean Food Rescue Analytics scope, stable operations-* testids, and zero legacy projector or provider jargon", () => {
  const dispatchSrc = readFileSync(
    new URL("../app/dispatch/page.tsx", import.meta.url),
    "utf8",
  );
  const opsDir = new URL("../components/operations/", import.meta.url);
  const opsFiles = readdirSync(opsDir).filter((f) => f.endsWith(".tsx"));
  const combinedOpsSrc = [
    dispatchSrc,
    ...opsFiles.map((f) => readFileSync(new URL(f, opsDir), "utf8")),
  ].join("\n");

  // Exact heading and period filters
  assert.match(combinedOpsSrc, /Food Rescue Analytics/);
  assert.match(combinedOpsSrc, /operations-period-group/);
  assert.match(combinedOpsSrc, /operations-dashboard/);
  assert.match(combinedOpsSrc, /operations-kpi-shared/);
  assert.match(combinedOpsSrc, /operations-kpi-collected/);
  assert.match(combinedOpsSrc, /operations-kpi-available/);
  assert.match(combinedOpsSrc, /operations-kpi-student-recovery/);
  assert.match(combinedOpsSrc, /operations-kpi-participating-students/);
  assert.match(combinedOpsSrc, /operations-kpi-avg-reservation-delay/);
  assert.match(combinedOpsSrc, /operations-kpi-participating-hosts/);
  assert.match(combinedOpsSrc, /operations-kpi-pantry-transfers/);
  assert.match(combinedOpsSrc, /operations-student-recovery-rate/);
  assert.match(combinedOpsSrc, /operations-combined-recovery-rate/);
  assert.match(combinedOpsSrc, /operations-estimate-usd/);
  assert.match(combinedOpsSrc, /operations-estimate-kg/);
  assert.match(combinedOpsSrc, /operations-trend-chart/);
  assert.match(combinedOpsSrc, /operations-outcomes-chart/);
  assert.match(combinedOpsSrc, /operations-buildings-chart/);
  assert.match(combinedOpsSrc, /operations-categories-chart/);
  assert.match(combinedOpsSrc, /operations-active-listings/);
  assert.match(combinedOpsSrc, /operations-recent-activity/);
  assert.match(combinedOpsSrc, /operations-recording-banner/);
  assert.match(combinedOpsSrc, /operations-recording-confirm-checkbox/);
  assert.match(combinedOpsSrc, /operations-recording-confirm-button/);
  assert.match(combinedOpsSrc, /operations-error-banner/);
  assert.match(combinedOpsSrc, /operations-stale-banner/);

  // Scoped DropPhoto with Bearer projector credential, never raw query token
  assert.match(combinedOpsSrc, /<DropPhoto/);
  assert.match(combinedOpsSrc, /demo-projector/);

  // Recording dataset reset returns via /admin link, never presenter resetDemo
  assert.match(combinedOpsSrc, /href="\/admin"/);
  assert.doesNotMatch(combinedOpsSrc, /presenter-api|resetDemo|advanceClock/);

  // Zero legacy H3 projector / rehearsal / persona / QR / provider telemetry chrome
  assert.doesNotMatch(
    combinedOpsSrc,
    /DispatchMap|PresenterControls|CampusMapCanvas|h3-js|label-fixture-vision|label-simulated-notifications|persona-row-|join-url|visionModeLabel/,
  );

  // Zero provider / config jargon in normal analytics copy
  assert.doesNotMatch(
    combinedOpsSrc,
    /OpenRouter|Gemini|VAPID|Firebase|demo gates|vision provider/i,
  );
});
