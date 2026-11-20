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
const campusMapCompiled = compileTs("../lib/campus-map.ts");
const fixturesCompiled = compileTs("../lib/fixtures/demo-fixtures.ts");

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

  const campusMapExports = {};
  runInNewContext(campusMapCompiled, {
    exports: campusMapExports,
    require: (id) => {
      if (id === "h3-js") return h3;
      if (id === "./buildings") return buildingsExports;
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

  return {
    campusMap: campusMapExports,
    buildings: buildingsExports,
    fixtures: fixturesExports,
  };
}

const VERIFIED_ACADEMIC = {
  id: "ksu-marietta-academic-building",
  name: "Academic Building",
  building_code: "H",
  building_number: "830",
  category: "academic",
  latitude: 33.938224,
  longitude: -84.520565,
  verification_status: "verified",
  sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
};

const VERIFIED_LIBRARY = {
  id: "ksu-marietta-lawrence-v-johnson-library",
  name: "Lawrence V. Johnson Library",
  building_code: "C",
  building_number: "845",
  category: "academic",
  latitude: 33.939051,
  longitude: -84.519412,
  verification_status: "verified",
  sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
};

const VERIFIED_STUDENT_CENTER = {
  id: "ksu-marietta-joe-mack-wilson-student-center",
  name: "Joe Mack Wilson Student Center",
  building_code: "A",
  building_number: "840",
  category: "student_life",
  latitude: 33.937718,
  longitude: -84.520025,
  verification_status: "verified",
  sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
};

function makeFeedDrop({
  id = "drop-1",
  building = VERIFIED_ACADEMIC,
  buildingCode = building?.id ?? "DEMO-ORIGIN",
  room = "214",
  available = 3,
  held = 0,
  pickedUp = 0,
  total = available + held + pickedUp,
  status = available > 0 ? "live" : "claimed_out",
  distributionMode = "campus_feed",
  expiresAt = "2026-11-20T02:00:00Z",
  canReserve = available > 0,
  unavailableReason = null,
  claim = null,
} = {}) {
  return {
    drop: {
      id,
      status,
      distribution_mode: distributionMode,
      building_code: buildingCode,
      building,
      room,
      pickup_instructions: "Table inside east lobby",
      vision: {
        items: [
          { name: "Cheese Pizza", portion_unit: "slice", count_estimate: 6 },
        ],
        servings_estimate: total,
        servings_low: total,
        servings_high: total,
        allergens_likely: ["dairy", "gluten"],
        diet_tags: ["vegetarian"],
        confidence: 0.88,
        notes: "Fixture",
      },
      vision_source: "fixture",
      servings_final: total,
      allergens_final: ["dairy", "gluten"],
      diet_tags_final: ["vegetarian"],
      safety_review: {
        covered_and_temperature_safe: true,
        served_within_two_hours: true,
        untouched: true,
        ingredient_information_checked: false,
        religious_diets_confirmed: false,
      },
      counts: { total, available, held, picked_up: pickedUp },
      created_at: "2026-11-20T01:00:00Z",
      expires_at: expiresAt,
      allergen_notice: "may contain, confirm with host",
      is_demo: true,
    },
    can_reserve: canReserve,
    unavailable_reason: unavailableReason,
    claim,
  };
}

test("Web Mercator projection, pan/zoom, and fitPointsToViewState fit verified Marietta buildings north-up", () => {
  const { campusMap } = loadModules();

  const view = campusMap.fitPointsToViewState(
    [VERIFIED_ACADEMIC, VERIFIED_LIBRARY, VERIFIED_STUDENT_CENTER],
    390,
    360,
    { paddingPx: 48 },
  );
  assert.equal(view.pitch, 0);
  assert.equal(view.bearing, 0);
  assert.ok(view.zoom >= campusMap.MIN_CAMPUS_MAP_ZOOM);
  assert.ok(view.zoom <= 16.6);

  // Every verified building must project strictly inside the padded viewport
  for (const b of [
    VERIFIED_ACADEMIC,
    VERIFIED_LIBRARY,
    VERIFIED_STUDENT_CENTER,
  ]) {
    const pt = campusMap.projectLatLngToViewport(
      b.latitude,
      b.longitude,
      view,
      390,
      360,
    );
    assert.ok(
      pt.x >= 44 && pt.x <= 346,
      `x=${pt.x} out of bounds for ${b.name}`,
    );
    assert.ok(
      pt.y >= 44 && pt.y <= 316,
      `y=${pt.y} out of bounds for ${b.name}`,
    );
  }

  // Library is farther north than Student Center, so its projected Y must be smaller (north up)
  const libPt = campusMap.projectLatLngToViewport(
    VERIFIED_LIBRARY.latitude,
    VERIFIED_LIBRARY.longitude,
    view,
    390,
    360,
  );
  const scPt = campusMap.projectLatLngToViewport(
    VERIFIED_STUDENT_CENTER.latitude,
    VERIFIED_STUDENT_CENTER.longitude,
    view,
    390,
    360,
  );
  assert.ok(
    libPt.y < scPt.y,
    "North must remain up on Web Mercator projection",
  );

  // Dragging map right by +40px shifts a fixed geographic point right by +40px
  const panned = campusMap.panViewStateByPixels(view, 40, -25);
  const libAfterPan = campusMap.projectLatLngToViewport(
    VERIFIED_LIBRARY.latitude,
    VERIFIED_LIBRARY.longitude,
    panned,
    390,
    360,
  );
  assert.ok(Math.abs(libAfterPan.x - (libPt.x + 40)) < 0.05);
  assert.ok(Math.abs(libAfterPan.y - (libPt.y - 25)) < 0.05);

  // Zoom respects min/max clamps
  const zoomedIn = campusMap.zoomViewState(view, 50);
  assert.equal(zoomedIn.zoom, campusMap.MAX_CAMPUS_MAP_ZOOM);
  const zoomedOut = campusMap.zoomViewState(view, -50);
  assert.equal(zoomedOut.zoom, campusMap.MIN_CAMPUS_MAP_ZOOM);
});

test("buildStudentCampusMapModel groups same-building drops with exact verified coordinates (zero jitter), keeps incompatible visible, and separates unplottable/exhausted/expired drops", () => {
  const { campusMap } = loadModules();
  const nowMs = Date.parse("2026-11-20T01:15:00Z");

  const drops = [
    // Two drops at Academic Building: one reservable (2 left), one incompatible vegan mismatch (3 left)
    makeFeedDrop({
      id: "drop-acad-1",
      building: VERIFIED_ACADEMIC,
      room: "101",
      available: 2,
      canReserve: true,
    }),
    makeFeedDrop({
      id: "drop-acad-2",
      building: VERIFIED_ACADEMIC,
      room: "214",
      available: 3,
      canReserve: false,
      unavailableReason: "diet_mismatch",
    }),
    // One drop at Library (1 left, allergen conflict)
    makeFeedDrop({
      id: "drop-lib-1",
      building: VERIFIED_LIBRARY,
      available: 1,
      canReserve: false,
      unavailableReason: "allergen_conflict",
    }),
    // Exhausted drop at Student Center (0 left) -> must NOT become an available marker
    makeFeedDrop({
      id: "drop-sc-exhausted",
      building: VERIFIED_STUDENT_CENTER,
      available: 0,
      held: 2,
      total: 2,
      canReserve: false,
      unavailableReason: "capacity",
    }),
    // Expired drop -> must be excluded
    makeFeedDrop({
      id: "drop-expired",
      building: VERIFIED_STUDENT_CENTER,
      available: 4,
      expiresAt: "2026-11-20T01:10:00Z",
    }),
    // Seeded wave drop -> must be excluded from campus-feed map
    makeFeedDrop({
      id: "drop-seeded",
      building: VERIFIED_STUDENT_CENTER,
      available: 4,
      distributionMode: "seeded_waves",
    }),
    // Unverified rehearsal drop -> must NEVER plot on real campus; separated into unplottableAvailableDrops
    makeFeedDrop({
      id: "drop-rehearsal",
      building: null,
      buildingCode: "DEMO-ORIGIN",
      available: 2,
      canReserve: true,
    }),
  ];

  const model = campusMap.buildStudentCampusMapModel(drops, nowMs);

  assert.equal(model.markers.length, 2);
  assert.equal(model.totalAvailableDrops, 3);
  assert.equal(model.totalAvailableServings, 6);
  assert.equal(model.unplottableAvailableDrops.length, 1);
  assert.equal(model.unplottableAvailableDrops[0].drop.id, "drop-rehearsal");
  assert.equal(model.exhaustedDrops.length, 1);
  assert.equal(model.exhaustedDrops[0].drop.id, "drop-sc-exhausted");

  // Academic Building grouped marker has exact snapshot coords (no jitter) and summed badge count 2+3=5
  const acadMarker = model.markers.find(
    (m) => m.building.id === VERIFIED_ACADEMIC.id,
  );
  assert.ok(acadMarker);
  assert.equal(acadMarker.latitude, VERIFIED_ACADEMIC.latitude);
  assert.equal(acadMarker.longitude, VERIFIED_ACADEMIC.longitude);
  assert.equal(
    acadMarker.h3Cell,
    h3.latLngToCell(
      VERIFIED_ACADEMIC.latitude,
      VERIFIED_ACADEMIC.longitude,
      11,
    ),
  );
  assert.equal(acadMarker.availableServings, 5);
  assert.equal(acadMarker.drops.length, 2);
  assert.equal(acadMarker.hasReservableDrop, true);
  assert.deepEqual(
    Array.from(acadMarker.drops, (d) => d.drop.id),
    ["drop-acad-1", "drop-acad-2"],
  );

  // Library marker visible with incompatible drop preserved as non-reservable
  const libMarker = model.markers.find(
    (m) => m.building.id === VERIFIED_LIBRARY.id,
  );
  assert.ok(libMarker);
  assert.equal(libMarker.availableServings, 1);
  assert.equal(libMarker.hasReservableDrop, false);
  assert.equal(libMarker.drops[0].can_reserve, false);
  assert.equal(libMarker.drops[0].unavailable_reason, "allergen_conflict");
});

test("resolveSelectedMapBuilding prevents stale reserve actions across exhaust, release reappearance, coordinate loss, and expiry", () => {
  const { campusMap } = loadModules();
  const nowMs = Date.parse("2026-11-20T01:15:00Z");

  // 1. Active selection
  const activeFeed = [
    makeFeedDrop({ id: "d1", building: VERIFIED_ACADEMIC, available: 1 }),
  ];
  const activeModel = campusMap.buildStudentCampusMapModel(activeFeed, nowMs);
  const sActive = campusMap.resolveSelectedMapBuilding(
    VERIFIED_ACADEMIC.id,
    VERIFIED_ACADEMIC.name,
    activeModel,
    activeFeed,
    nowMs,
  );
  assert.equal(sActive.status, "active");
  assert.equal(sActive.marker.availableServings, 1);

  // 2. Last serving taken (marker disappears, own hold remains in feedDrops, no stale reserve in map panel)
  const exhaustedFeed = [
    makeFeedDrop({
      id: "d1",
      building: VERIFIED_ACADEMIC,
      available: 0,
      held: 1,
      total: 1,
      canReserve: false,
      unavailableReason: "already_reserved",
      claim: {
        id: "claim-1",
        invite_id: null,
        drop_id: "d1",
        status: "held",
        held_until: "2026-11-20T01:25:00Z",
      },
    }),
  ];
  const exhaustedModel = campusMap.buildStudentCampusMapModel(
    exhaustedFeed,
    nowMs,
  );
  assert.equal(exhaustedModel.markers.length, 0);
  const sExhausted = campusMap.resolveSelectedMapBuilding(
    VERIFIED_ACADEMIC.id,
    VERIFIED_ACADEMIC.name,
    exhaustedModel,
    exhaustedFeed,
    nowMs,
  );
  assert.equal(sExhausted.status, "exhausted");
  assert.match(sExhausted.message, /Academic Building/);

  // 3. Hold released -> marker reappears automatically and selection returns to active
  const restoredFeed = [
    makeFeedDrop({ id: "d1", building: VERIFIED_ACADEMIC, available: 1 }),
  ];
  const restoredModel = campusMap.buildStudentCampusMapModel(
    restoredFeed,
    nowMs,
  );
  const sRestored = campusMap.resolveSelectedMapBuilding(
    VERIFIED_ACADEMIC.id,
    VERIFIED_ACADEMIC.name,
    restoredModel,
    restoredFeed,
    nowMs,
  );
  assert.equal(sRestored.status, "active");

  // 4. Listing loses verified coordinates -> status becomes unplottable
  const unplottableFeed = [
    makeFeedDrop({
      id: "d1",
      building: null,
      buildingCode: VERIFIED_ACADEMIC.id,
      available: 1,
    }),
  ];
  const unplottableModel = campusMap.buildStudentCampusMapModel(
    unplottableFeed,
    nowMs,
  );
  const sUnplottable = campusMap.resolveSelectedMapBuilding(
    VERIFIED_ACADEMIC.id,
    VERIFIED_ACADEMIC.name,
    unplottableModel,
    unplottableFeed,
    nowMs,
  );
  assert.equal(sUnplottable.status, "unplottable");

  // 5. Listing expires -> status becomes expired_or_gone
  const expiredFeed = [
    makeFeedDrop({
      id: "d1",
      building: VERIFIED_ACADEMIC,
      available: 1,
      expiresAt: "2026-11-20T01:05:00Z",
    }),
  ];
  const expiredModel = campusMap.buildStudentCampusMapModel(expiredFeed, nowMs);
  const sExpired = campusMap.resolveSelectedMapBuilding(
    VERIFIED_ACADEMIC.id,
    VERIFIED_ACADEMIC.name,
    expiredModel,
    expiredFeed,
    nowMs,
  );
  assert.equal(sExpired.status, "expired_or_gone");
});

test("resolveDeepLinkMapSelection selects plotted building or explains exhausted/unplottable links", () => {
  const { campusMap } = loadModules();
  const nowMs = Date.parse("2026-11-20T01:15:00Z");

  const drops = [
    makeFeedDrop({
      id: "drop-plotted",
      building: VERIFIED_LIBRARY,
      available: 2,
    }),
    makeFeedDrop({
      id: "drop-zero",
      building: VERIFIED_ACADEMIC,
      available: 0,
      held: 2,
      total: 2,
    }),
    makeFeedDrop({
      id: "drop-rehearsal",
      building: null,
      buildingCode: "DEMO-ORIGIN",
      available: 2,
    }),
  ];
  const model = campusMap.buildStudentCampusMapModel(drops, nowMs);

  const plotted = campusMap.resolveDeepLinkMapSelection(
    "drop-plotted",
    model,
    drops,
    nowMs,
  );
  assert.equal(plotted.status, "plotted");
  assert.equal(plotted.buildingId, VERIFIED_LIBRARY.id);

  const exhausted = campusMap.resolveDeepLinkMapSelection(
    "drop-zero",
    model,
    drops,
    nowMs,
  );
  assert.equal(exhausted.status, "exhausted");
  assert.equal(exhausted.buildingId, null);
  assert.ok(exhausted.notice);

  const unplottable = campusMap.resolveDeepLinkMapSelection(
    "drop-rehearsal",
    model,
    drops,
    nowMs,
  );
  assert.equal(unplottable.status, "unplottable");
  assert.ok(unplottable.notice);
});

test("buildProjectorCampusMapModel plots verified pickup buildings at exact res-11 H3 cells with available/reserved/collected aggregates and zero student data", () => {
  const { campusMap } = loadModules();

  const buildingDistributions = [
    {
      building_code: VERIFIED_ACADEMIC.id,
      building: VERIFIED_ACADEMIC,
      active_drops: 2,
      available_drops: 1,
      counts: { total: 5, available: 2, held: 2, picked_up: 1 },
    },
    {
      building_code: VERIFIED_LIBRARY.id,
      building: VERIFIED_LIBRARY,
      active_drops: 1,
      available_drops: 0,
      counts: { total: 2, available: 0, held: 1, picked_up: 1 },
    },
    {
      building_code: "DEMO-ORIGIN",
      building: null,
      active_drops: 1,
      available_drops: 1,
      counts: { total: 2, available: 2, held: 0, picked_up: 0 },
    },
  ];

  const model = campusMap.buildProjectorCampusMapModel(buildingDistributions);

  assert.equal(model.verifiedNodes.length, 2);
  assert.equal(model.unverifiedBuildings.length, 1);
  assert.equal(model.totalAvailable, 4);
  assert.equal(model.totalReserved, 3);
  assert.equal(model.totalCollected, 2);
  assert.equal(model.totalAvailableDrops, 2);
  assert.equal(model.totalActiveDrops, 4);

  const acad = model.verifiedNodes.find(
    (n) => n.buildingCode === VERIFIED_ACADEMIC.id,
  );
  assert.ok(acad);
  assert.equal(acad.latitude, VERIFIED_ACADEMIC.latitude);
  assert.equal(acad.longitude, VERIFIED_ACADEMIC.longitude);
  assert.equal(
    acad.h3Cell,
    h3.latLngToCell(
      VERIFIED_ACADEMIC.latitude,
      VERIFIED_ACADEMIC.longitude,
      11,
    ),
  );
  assert.equal(acad.hasAvailable, true);
  assert.equal(acad.availableDrops, 1);
  assert.equal(acad.activeDrops, 2);

  const lib = model.verifiedNodes.find(
    (n) => n.buildingCode === VERIFIED_LIBRARY.id,
  );
  assert.ok(lib);
  assert.equal(lib.hasAvailable, false);
  assert.equal(lib.availableDrops, 0);
  assert.equal(lib.counts.held, 1);
  assert.equal(lib.counts.picked_up, 1);

  assert.match(model.accessibleSummary, /4 available, 3 reserved, 2 collected/);
  assert.match(model.accessibleSummary, /2 available of 4 active drops/);
  assert.doesNotMatch(
    JSON.stringify(model),
    /nickname|priority|allergen|student_id/i,
  );

  // Additive field resolvers work with exact server values and narrow fallbacks
  assert.equal(
    campusMap.resolveCampusAvailableDrops({
      available_drops: 1,
      buildings: buildingDistributions,
    }),
    1,
  );
  assert.equal(
    campusMap.resolveCampusAvailableDrops({
      buildings: buildingDistributions,
    }),
    2,
  );
});

test("selectNonOverlappingReferenceBuildings excludes active markers and avoids overlapping labels", () => {
  const { campusMap } = loadModules();
  const view = campusMap.fitPointsToViewState(
    [VERIFIED_ACADEMIC, VERIFIED_LIBRARY, VERIFIED_STUDENT_CENTER],
    640,
    420,
  );
  const excluded = new Set([VERIFIED_ACADEMIC.id]);
  const selected = campusMap.selectNonOverlappingReferenceBuildings(
    [VERIFIED_ACADEMIC, VERIFIED_LIBRARY, VERIFIED_STUDENT_CENTER],
    excluded,
    view,
    640,
    420,
    40,
  );
  assert.equal(
    selected.some((item) => item.building.id === VERIFIED_ACADEMIC.id),
    false,
  );
  assert.ok(selected.length >= 1);
});

test("offline fixtureGetDistribution tracks overall and per-building available_drops through reserve, release, pickup, and drop expiry", () => {
  const { fixtures } = loadModules();

  fixtures.fixtureDemoReset({ scenario: "visitors" });
  const studentA = fixtures.fixtureJoinSession({
    nickname: "MapStudentA",
    allergens: [],
    diets: [],
  });
  const studentB = fixtures.fixtureJoinSession({
    nickname: "MapStudentB",
    allergens: [],
    diets: [],
  });

  const makePublishedDrop = (buildingCode, servings) => {
    const draft = fixtures.fixtureCreateDrop("pizza");
    fixtures.fixtureUpdateDrop(draft.id, {
      servings_final: servings,
      allergens_final: ["dairy", "gluten"],
      diet_tags_final: [],
      building_code: buildingCode,
      room: "101",
      pickup_instructions: "Front desk",
      expires_in_minutes: 45,
      safety_review: {
        covered_and_temperature_safe: true,
        served_within_two_hours: true,
        untouched: true,
        ingredient_information_checked: false,
        religious_diets_confirmed: false,
      },
    });
    return fixtures.fixturePublishDrop(draft.id);
  };

  const drop1 = makePublishedDrop("BLDG-ALPHA", 1);
  const drop2 = makePublishedDrop("BLDG-ALPHA", 2);
  const drop3 = makePublishedDrop("BLDG-BETA", 1);

  let dist = fixtures.fixtureGetDistribution();
  assert.equal(dist.active_drops, 3);
  assert.equal(dist.available_drops, 3);
  assert.equal(dist.buildings.length, 2);
  const alphaInit = dist.buildings.find(
    (b) => b.building_code === "BLDG-ALPHA",
  );
  const betaInit = dist.buildings.find((b) => b.building_code === "BLDG-BETA");
  assert.equal(alphaInit.active_drops, 2);
  assert.equal(alphaInit.available_drops, 2);
  assert.equal(betaInit.active_drops, 1);
  assert.equal(betaInit.available_drops, 1);

  // Reserve the only serving of drop3 (BLDG-BETA): available_drops drops to 0 on BLDG-BETA while active_drops & held persist
  const claimBeta = fixtures.fixtureReserveDrop(drop3.id, studentA.token);
  dist = fixtures.fixtureGetDistribution();
  assert.equal(dist.active_drops, 3);
  assert.equal(dist.available_drops, 2);
  const betaClaimed = dist.buildings.find(
    (b) => b.building_code === "BLDG-BETA",
  );
  assert.equal(betaClaimed.active_drops, 1);
  assert.equal(betaClaimed.available_drops, 0);
  assert.equal(betaClaimed.counts.available, 0);
  assert.equal(betaClaimed.counts.held, 1);

  // Reserve the only serving of drop1 (BLDG-ALPHA): BLDG-ALPHA still has drop2 available -> available_drops=1 of active_drops=2
  const claimAlpha = fixtures.fixtureReserveDrop(drop1.id, studentB.token);
  dist = fixtures.fixtureGetDistribution();
  assert.equal(dist.active_drops, 3);
  assert.equal(dist.available_drops, 1);
  const alphaAfter = dist.buildings.find(
    (b) => b.building_code === "BLDG-ALPHA",
  );
  assert.equal(alphaAfter.active_drops, 2);
  assert.equal(alphaAfter.available_drops, 1);
  assert.equal(alphaAfter.counts.available, 2);
  assert.equal(alphaAfter.counts.held, 1);

  // Release BLDG-BETA claim -> restores BLDG-BETA available_drops back to 1
  fixtures.fixtureReleaseClaim(claimBeta.id, studentA.token);
  dist = fixtures.fixtureGetDistribution();
  assert.equal(dist.available_drops, 2);
  assert.equal(
    dist.buildings.find((b) => b.building_code === "BLDG-BETA").available_drops,
    1,
  );

  // Complete photo-assisted pickup on drop1 -> held moves to picked_up, drop1 remains counted in active_drops with available_drops=0
  const verif = fixtures.fixtureSubmitPickupPhoto(
    claimAlpha.id,
    "11111111-1111-4111-8111-111111111111",
    studentB.token,
    { mimeType: "image/png", byteSize: 512 },
  );
  fixtures.fixturePickupClaim(claimAlpha.id, studentB.token, {
    verification_id: verif.id,
  });
  dist = fixtures.fixtureGetDistribution();
  const alphaPicked = dist.buildings.find(
    (b) => b.building_code === "BLDG-ALPHA",
  );
  assert.equal(alphaPicked.active_drops, 2);
  assert.equal(alphaPicked.available_drops, 1);
  assert.equal(alphaPicked.counts.held, 0);
  assert.equal(alphaPicked.counts.picked_up, 1);

  // Drop expiry removes all contributions from active_drops and available_drops
  assert.ok(drop2.id);
  fixtures.fixtureDemoTick({ advance_seconds: 2800 });
  dist = fixtures.fixtureGetDistribution();
  assert.equal(dist.active_drops, 0);
  assert.equal(dist.available_drops, 0);
  assert.deepEqual(
    { ...dist.counts },
    {
      total: 0,
      available: 0,
      held: 0,
      picked_up: 0,
    },
  );
  assert.equal(dist.buildings.length, 0);
});
