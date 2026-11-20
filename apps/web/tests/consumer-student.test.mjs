import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as h3 from "h3-js";

function compileTs(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

const typesCompiled = compileTs("../lib/types/api.ts");
const buildingsCompiled = compileTs("../lib/buildings.ts");
const fixturesCompiled = compileTs("../lib/fixtures/demo-fixtures.ts");
const studentHelpersCompiled = compileTs("../app/student/student-helpers.ts");

function loadModules() {
  const typesExports = {};
  runInNewContext(typesCompiled, {
    exports: typesExports,
    require: () => ({}),
  });

  const buildingsExports = {};
  runInNewContext(buildingsCompiled, {
    exports: buildingsExports,
    require: (id) => {
      if (id === "./types/api") return typesExports;
      return {};
    },
  });

  const store = new Map();
  const mockLocalStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  const fixturesExports = {};
  runInNewContext(fixturesCompiled, {
    exports: fixturesExports,
    window: { localStorage: mockLocalStorage },
    require: (id) => {
      if (id === "h3-js") return h3;
      if (id === "../types/api") return typesExports;
      return {};
    },
  });

  const studentHelpersExports = {};
  runInNewContext(studentHelpersCompiled, {
    exports: studentHelpersExports,
    require: (id) => {
      if (id === "../../lib/fixtures/demo-fixtures") return fixturesExports;
      if (id === "../../lib/types/api") return typesExports;
      if (id === "../../lib/buildings") return buildingsExports;
      return {};
    },
  });

  return {
    types: typesExports,
    buildings: buildingsExports,
    fixtures: fixturesExports,
    studentHelpers: studentHelpersExports,
  };
}

function makeFeedDrop({
  id = "drop-1",
  items = [{ name: "Cheese Pizza", portion_unit: "slice", count_estimate: 6 }],
  notes = "Fresh from IEEE club social",
  dietTags = ["vegetarian"],
  allergens = ["dairy", "gluten"],
  buildingName = "Joe Mack Wilson Student Center",
  room = "214",
  pickupInstructions = "East lobby table",
  available = 4,
  total = 6,
  status = "live",
  canReserve = true,
  unavailableReason = null,
  claim = null,
} = {}) {
  return {
    drop: {
      id,
      status,
      distribution_mode: "campus_feed",
      building_code: "ksu-marietta-joe-mack-wilson-student-center",
      building: {
        id: "ksu-marietta-joe-mack-wilson-student-center",
        name: buildingName,
        building_code: "A",
        building_number: "840",
        category: "student_life",
        latitude: 33.937718,
        longitude: -84.520025,
        verification_status: "verified",
        sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
      },
      room,
      pickup_instructions: pickupInstructions,
      vision: {
        items,
        servings_estimate: total,
        servings_low: total,
        servings_high: total,
        allergens_likely: allergens,
        diet_tags: dietTags,
        confidence: 0.9,
        notes,
      },
      vision_source: "fixture",
      servings_final: total,
      allergens_final: allergens,
      diet_tags_final: dietTags,
      safety_review: {
        covered_and_temperature_safe: true,
        served_within_two_hours: true,
        untouched: true,
        ingredient_information_checked: true,
        religious_diets_confirmed: true,
      },
      counts: {
        total,
        available,
        held: 0,
        picked_up: total - available,
      },
      created_at: "2026-11-20T16:00:00Z",
      expires_at: "2026-11-20T17:00:00Z",
      allergen_notice: "may contain, confirm with host",
      is_demo: true,
      has_photo: false,
      photo_url: null,
    },
    can_reserve: canReserve,
    unavailable_reason: unavailableReason,
    claim,
  };
}

test("student category chips and instant search filter campus feed drops accurately", () => {
  const { studentHelpers } = loadModules();

  const pizzaDrop = makeFeedDrop({
    id: "d-pizza",
    items: [
      { name: "Margherita Pizza", portion_unit: "slice", count_estimate: 8 },
    ],
    dietTags: ["vegetarian"],
    buildingName: "Academic Building",
    available: 5,
  });
  const wrapDrop = makeFeedDrop({
    id: "d-wrap",
    items: [{ name: "Falafel Wraps", portion_unit: "wrap", count_estimate: 6 }],
    dietTags: ["vegan", "halal", "vegetarian"],
    buildingName: "Engineering Technology Center",
    available: 3,
  });
  const saladDrop = makeFeedDrop({
    id: "d-salad",
    items: [
      {
        name: "Mediterranean Quinoa Bowl",
        portion_unit: "bowl",
        count_estimate: 4,
      },
    ],
    dietTags: ["vegan", "kosher"],
    buildingName: "Lawrence V. Johnson Library",
    available: 0,
    status: "claimed_out",
    canReserve: false,
    unavailableReason: "capacity",
  });
  const snackDrop = makeFeedDrop({
    id: "d-snack",
    items: [
      {
        name: "Chocolate Chip Cookies",
        portion_unit: "cookie",
        count_estimate: 12,
      },
    ],
    notes: "Fixture",
    dietTags: ["vegetarian"],
    allergens: ["peanut", "dairy", "gluten"],
    buildingName: "Joe Mack Wilson Student Center",
    available: 4,
    canReserve: false,
    unavailableReason: "allergen_conflict",
  });

  const allDrops = [pizzaDrop, wrapDrop, saladDrop, snackDrop];

  assert.equal(studentHelpers.STUDENT_FILTER_CHIPS.length, 11);

  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "all" })
      .map((d) => d.drop.id),
    ["d-pizza", "d-wrap", "d-salad", "d-snack"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "available_now" })
      .map((d) => d.drop.id),
    ["d-pizza", "d-wrap", "d-snack"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "safe_for_me" })
      .map((d) => d.drop.id),
    ["d-pizza", "d-wrap", "d-salad"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "vegan" })
      .map((d) => d.drop.id),
    ["d-wrap", "d-salad"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "halal" })
      .map((d) => d.drop.id),
    ["d-wrap"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "kosher" })
      .map((d) => d.drop.id),
    ["d-salad"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "pizza" })
      .map((d) => d.drop.id),
    ["d-pizza"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "sandwiches_wraps" })
      .map((d) => d.drop.id),
    ["d-wrap"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "salads_bowls" })
      .map((d) => d.drop.id),
    ["d-salad"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { category: "snacks_sides" })
      .map((d) => d.drop.id),
    ["d-snack"],
  );

  // Instant search across food items, building name, diet tags; internal "Fixture" note is excluded
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { query: "engineering falafel" })
      .map((d) => d.drop.id),
    ["d-wrap"],
  );
  assert.deepEqual(
    studentHelpers
      .filterStudentFeedDrops(allDrops, { query: "fixture" })
      .map((d) => d.drop.id),
    [],
  );
});

test("fixtureGetMyReservations enforces ownership, role ACLs, expiry sweep, full status history, and newest-first ordering", () => {
  const { fixtures, studentHelpers } = loadModules();
  fixtures.fixtureDemoReset({ scenario: "visitors" });

  // Non-student credentials rejected with 403 forbidden
  for (const roleToken of [
    "demo-host",
    "demo-projector",
    "demo-pantry-coordinator",
  ]) {
    assert.throws(
      () => fixtures.fixtureGetMyReservations(roleToken),
      (err) => err.status === 403 && err.code === "forbidden",
    );
  }
  // Unknown token rejected with 401 unauthorized
  assert.throws(
    () => fixtures.fixtureGetMyReservations("demo-session-nonexistent"),
    (err) => err.status === 401 && err.code === "unauthorized",
  );

  const studentA = fixtures.fixtureJoinSession({
    nickname: "Maya",
    allergens: [],
    diets: [],
  });
  const studentB = fixtures.fixtureJoinSession({
    nickname: "Devon",
    allergens: [],
    diets: [],
  });

  // Helper to create & publish a verified drop
  const createPublishedDrop = (note) => {
    const draft = fixtures.fixtureCreateDrop(note, "demo-host");
    // Students cannot read draft drops (404)
    assert.throws(
      () => fixtures.fixtureGetDrop(draft.id, studentA.token),
      (err) => err.status === 404,
    );
    fixtures.fixtureUpdateDrop(draft.id, {
      building_code: "ksu-marietta-academic-building",
      room: "101",
      pickup_instructions: "Front hallway table",
      servings_final: 5,
      expires_in_minutes: 45,
      allergens_final: ["dairy"],
      diet_tags_final: ["vegetarian"],
      safety_review: {
        covered_and_temperature_safe: true,
        served_within_two_hours: true,
        untouched: true,
        ingredient_information_checked: true,
        religious_diets_confirmed: false,
      },
    });
    return fixtures.fixturePublishDrop(draft.id);
  };

  // 1. Released claim for Student A
  const drop1 = createPublishedDrop("Club sandwiches");
  const claimReleased = fixtures.fixtureReserveDrop(drop1.id, studentA.token);
  fixtures.fixtureReleaseClaim(claimReleased.id, studentA.token);

  // 2. Advance 30s -> Expired claim for Student A (expiry sweep triggered by getMyReservations!)
  fixtures.fixtureDemoTick({ advance_seconds: 30 });
  const drop2 = createPublishedDrop("Pasta trays");
  const claimWillExpire = fixtures.fixtureReserveDrop(drop2.id, studentA.token);
  // Student B also reserves drop2 (should stay completely isolated from Student A)
  const claimStudentB = fixtures.fixtureReserveDrop(drop2.id, studentB.token);

  fixtures.fixtureDemoTick({ advance_seconds: 601 }); // > 10 min hold
  const afterExpireA = fixtures.fixtureGetMyReservations(studentA.token);
  const expiredEntry = afterExpireA.reservations.find(
    (r) => r.claim.id === claimWillExpire.id,
  );
  assert.equal(expiredEntry?.claim.status, "expired");

  // 3. Advance 30s -> Picked-up claim for Student A
  fixtures.fixtureDemoTick({ advance_seconds: 30 });
  const drop3 = createPublishedDrop("Veggie bowls");
  const claimPickedUp = fixtures.fixtureReserveDrop(drop3.id, studentA.token);
  const ver = fixtures.fixtureSubmitPickupPhoto(
    claimPickedUp.id,
    studentHelpers.generatePickupRequestId(),
    studentA.token,
    { matchStatus: "consistent", confidence: 0.91 },
  );
  fixtures.fixturePickupClaim(claimPickedUp.id, studentA.token, {
    verification_id: ver.id,
  });

  // 4. Advance 30s -> Active held claim for Student A
  fixtures.fixtureDemoTick({ advance_seconds: 30 });
  const drop4 = createPublishedDrop("Fresh pizza");
  const claimHeld = fixtures.fixtureReserveDrop(drop4.id, studentA.token);

  // Student A can view published drop directly and gets photo fields
  const directDrop = fixtures.fixtureGetDrop(drop4.id, studentA.token);
  assert.equal(directDrop.id, drop4.id);
  assert.equal(directDrop.has_photo, false);
  assert.equal(directDrop.photo_url, null);

  // Verify Student A's reservation list: newest created_at first, all 4 statuses, zero Student B leakage
  const resA = fixtures.fixtureGetMyReservations(studentA.token);
  assert.deepEqual(
    Array.from(resA.reservations, (r) => r.claim.id),
    [claimHeld.id, claimPickedUp.id, claimWillExpire.id, claimReleased.id],
  );
  assert.deepEqual(
    Array.from(resA.reservations, (r) => r.claim.status),
    ["held", "picked_up", "expired", "released"],
  );
  assert.equal(
    resA.reservations.some((r) => r.claim.id === claimStudentB.id),
    false,
  );

  // Partition helper splits active hold vs history cleanly
  const partitioned = studentHelpers.partitionReservations(resA.reservations);
  assert.equal(partitioned.active?.claim.id, claimHeld.id);
  assert.deepEqual(
    Array.from(partitioned.history, (r) => r.claim.id),
    [claimPickedUp.id, claimWillExpire.id, claimReleased.id],
  );

  // Verify Student B only sees their own expired reservation
  const resB = fixtures.fixtureGetMyReservations(studentB.token);
  assert.deepEqual(
    Array.from(resB.reservations, (r) => r.claim.id),
    [claimStudentB.id],
  );
  assert.equal(resB.reservations[0]?.claim.status, "expired");
});

test("consumer student helpers format jargon-free copy, tabs, dietary summaries, and verification provenance", () => {
  const { studentHelpers } = loadModules();

  assert.equal(studentHelpers.parseStudentTabParam(null), "home");
  assert.equal(studentHelpers.parseStudentTabParam("map"), "map");
  assert.equal(
    studentHelpers.parseStudentTabParam("RESERVATIONS"),
    "reservations",
  );
  assert.equal(studentHelpers.parseStudentTabParam("profile"), "profile");
  assert.equal(studentHelpers.parseStudentTabParam("unknown"), "home");

  // Raw provenance never leaks provider/model names
  assert.equal(
    studentHelpers.formatPickupVerificationSourceLabel("fixture"),
    "Sample assessment",
  );
  assert.equal(
    studentHelpers.formatPickupVerificationSourceLabel("live_gemini"),
    "Photo assessment",
  );
  assert.equal(
    studentHelpers.formatPickupVerificationSourceLabel(null),
    "Photo assessment",
  );

  assert.equal(
    studentHelpers.formatPickupMatchStatusLabel("consistent"),
    "Consistent",
  );
  assert.equal(
    studentHelpers.formatPickupMatchStatusLabel("uncertain"),
    "Needs a closer look",
  );
  assert.equal(
    studentHelpers.formatPickupMatchStatusLabel("inconsistent"),
    "Doesn't look like a match",
  );

  assert.equal(studentHelpers.formatConsumerHostNote("Fixture"), null);
  assert.equal(studentHelpers.formatConsumerHostNote("demo"), null);
  assert.equal(
    studentHelpers.formatConsumerHostNote("Hot pizza near room 214"),
    "Hot pizza near room 214",
  );

  assert.equal(
    studentHelpers.formatConsumerDropLocation({
      building_code: "DEMO-ORIGIN",
      room: "202",
      building: null,
    }),
    "Marietta Campus pickup · Room 202",
  );

  assert.equal(studentHelpers.formatDietarySummary([], []), "All campus food");
  assert.equal(
    studentHelpers.formatDietarySummary(
      ["peanut", "tree_nut", "dairy"],
      ["vegan"],
    ),
    "Avoiding peanut, tree nut +1 · Vegan",
  );

  assert.equal(
    studentHelpers.formatGreeting("Jordan", new Date("2026-11-20T14:00:00Z")),
    "Good morning, Jordan",
  );
  assert.equal(
    studentHelpers.formatGreeting("Jordan", new Date("2026-11-20T19:00:00Z")),
    "Good afternoon, Jordan",
  );
  assert.equal(
    studentHelpers.formatGreeting("Jordan", new Date("2026-11-20T23:30:00Z")),
    "Good evening, Jordan",
  );
});

test("consumer student routes contain zero developer jargon, zero GPS, and preserve mandatory notices", () => {
  const consumerFiles = [
    "../app/page.tsx",
    "../app/join/page.tsx",
    "../app/student/page.tsx",
    "../app/student/drops/[id]/page.tsx",
    "../components/student/ActiveHoldCard.tsx",
    "../components/StudentCampusMap.tsx",
  ];

  const bannedSubstrings = [
    "OpenRouter",
    "Gemini",
    "live_gemini",
    "live_api",
    "offline_fixture",
    "Simulated notification",
    "DemoHeader",
    "h3_index",
    "navigator.geolocation",
    "origin=",
    "pantry-referral",
    "demo-pantry-coordinator",
    "HostPantryCard",
    "pantry_held",
    "pantry_transferred",
  ];

  for (const relPath of consumerFiles) {
    const src = readFileSync(new URL(relPath, import.meta.url), "utf8");
    for (const banned of bannedSubstrings) {
      assert.equal(
        src.includes(banned),
        false,
        `${relPath} must not contain banned string "${banned}"`,
      );
    }
  }

  // Verify shared consumer shell & mandatory notices are wired on key screens
  const landingSrc = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(landingSrc.includes("AppShell"));
  assert.ok(landingSrc.includes("ALLERGEN_WARNING_TEXT"));

  const joinSrc = readFileSync(
    new URL("../app/join/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(joinSrc.includes("AppShell"));
  assert.ok(joinSrc.includes("Start browsing food"));

  const studentSrc = readFileSync(
    new URL("../app/student/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(studentSrc.includes("AppShell"));
  assert.ok(studentSrc.includes("BottomNav"));
  assert.ok(studentSrc.includes("FoodCard"));
  assert.ok(studentSrc.includes("AllergenCard"));
  assert.ok(studentSrc.includes("PushOptIn"));

  const detailSrc = readFileSync(
    new URL("../app/student/drops/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(detailSrc.includes("AppShell"));
  assert.ok(detailSrc.includes("BottomNav"));
  assert.ok(detailSrc.includes("DropPhoto"));
  assert.ok(detailSrc.includes("AllergenCard"));
  assert.ok(detailSrc.includes("PICKUP_CONFIRMATION_NOTICE"));
  assert.ok(detailSrc.includes("ActiveHoldCard"));

  const holdCardSrc = readFileSync(
    new URL("../components/student/ActiveHoldCard.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(holdCardSrc.includes("AllergenCard"));
  assert.ok(holdCardSrc.includes("DropPhoto"));
  assert.ok(holdCardSrc.includes("formatPickupVerificationSourceLabel"));
});

test("landing and student flows adopt the shared motion contract and real-data animated metrics", () => {
  const landingSrc = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(landingSrc, /OWL_MOTION_CLASSES\.entrance/);
  assert.match(landingSrc, /OWL_MOTION_CLASSES\.press/);
  assert.match(landingSrc, /entranceDelayMs/);

  const studentSrc = readFileSync(
    new URL("../app/student/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(studentSrc, /OWL_MOTION_CLASSES\.tabPanel/);
  assert.match(studentSrc, /OWL_MOTION_CLASSES\.pop/);
  assert.match(studentSrc, /OWL_MOTION_CLASSES\.press/);
  assert.match(studentSrc, /<AnimatedNumber/);
  assert.match(studentSrc, /student-campus-metrics/);

  const detailSrc = readFileSync(
    new URL("../app/student/drops/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(detailSrc, /OWL_MOTION_CLASSES\.entrance/);
  assert.match(detailSrc, /OWL_MOTION_CLASSES\.press/);
  assert.match(detailSrc, /<AnimatedNumber/);
});
