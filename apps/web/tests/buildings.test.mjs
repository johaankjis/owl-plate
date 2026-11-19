import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as h3 from "h3-js";

const typesSource = readFileSync(
  new URL("../lib/types/api.ts", import.meta.url),
  "utf8",
);
const typesCompiled = ts.transpileModule(typesSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const buildingsSource = readFileSync(
  new URL("../lib/buildings.ts", import.meta.url),
  "utf8",
);
const buildingsCompiled = ts.transpileModule(buildingsSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const fixturesSource = readFileSync(
  new URL("../lib/fixtures/demo-fixtures.ts", import.meta.url),
  "utf8",
);
const fixturesCompiled = ts.transpileModule(fixturesSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

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

  return { buildings: buildingsExports, fixtures: fixturesExports };
}

const SAMPLE_BUILDINGS = [
  {
    id: "ksu-marietta-hornet-village",
    name: "Hornet Village",
    building_code: null,
    building_number: "900",
    category: "housing",
    latitude: 33.9401,
    longitude: -84.5182,
    verification_status: "verified",
    sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
  },
  {
    id: "ksu-marietta-atrium-building",
    name: "Atrium Building",
    building_code: "J",
    building_number: "860",
    category: "academic",
    latitude: 33.9378,
    longitude: -84.5205,
    verification_status: "verified",
    sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
  },
  {
    id: "ksu-marietta-joe-mack-wilson-student-center",
    name: "Joe Mack Wilson Student Center",
    building_code: "A",
    building_number: "840",
    category: "student_life",
    latitude: 33.9389,
    longitude: -84.5197,
    verification_status: "verified",
    sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
  },
  {
    id: "ksu-marietta-recreation-center",
    name: "Marietta Recreation and Wellness Center",
    building_code: null,
    building_number: null,
    category: "other",
    latitude: 33.9365,
    longitude: -84.5179,
    verification_status: "verified",
    sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
  },
  {
    id: "ksu-marietta-unverified-annex",
    name: "Unverified Annex",
    building_code: "Z",
    building_number: null,
    category: "academic",
    latitude: null,
    longitude: null,
    verification_status: "unverified",
    sources: [],
  },
];

test("groupVerifiedBuildings groups verified entries in canonical academic, student_life, housing, other order and excludes unverified entries", () => {
  const { buildings } = loadModules();

  const groups = buildings.groupVerifiedBuildings(SAMPLE_BUILDINGS, "");
  assert.deepEqual(
    Array.from(groups, (g) => g.category),
    ["academic", "student_life", "housing", "other"],
  );
  assert.equal(groups[0].buildings.length, 1);
  assert.equal(groups[0].buildings[0].id, "ksu-marietta-atrium-building");
  assert.equal(
    groups[1].buildings[0].id,
    "ksu-marietta-joe-mack-wilson-student-center",
  );
  assert.equal(groups[2].buildings[0].id, "ksu-marietta-hornet-village");
  assert.equal(groups[3].buildings[0].id, "ksu-marietta-recreation-center");
});

test("groupVerifiedBuildings filters by name, building_code, building_number, or category label", () => {
  const { buildings } = loadModules();

  const byCode = buildings.groupVerifiedBuildings(SAMPLE_BUILDINGS, "J 860");
  assert.equal(byCode.length, 1);
  assert.equal(byCode[0].buildings[0].id, "ksu-marietta-atrium-building");

  const byName = buildings.groupVerifiedBuildings(
    SAMPLE_BUILDINGS,
    "wilson student",
  );
  assert.equal(byName.length, 1);
  assert.equal(
    byName[0].buildings[0].id,
    "ksu-marietta-joe-mack-wilson-student-center",
  );

  const byCategory = buildings.groupVerifiedBuildings(
    SAMPLE_BUILDINGS,
    "housing",
  );
  assert.equal(byCategory.length, 1);
  assert.equal(byCategory[0].buildings[0].id, "ksu-marietta-hornet-village");

  const noMatch = buildings.groupVerifiedBuildings(
    SAMPLE_BUILDINGS,
    "nonexistent-building-xyz",
  );
  assert.equal(noMatch.length, 0);
});

test("formatBuildingMetaBadge never invents building codes or numbers when null", () => {
  const { buildings } = loadModules();

  assert.equal(
    buildings.formatBuildingMetaBadge({
      building_code: "J",
      building_number: "860",
    }),
    "Bldg J • #860",
  );
  assert.equal(
    buildings.formatBuildingMetaBadge({
      building_code: "A",
      building_number: null,
    }),
    "Bldg A",
  );
  assert.equal(
    buildings.formatBuildingMetaBadge({
      building_code: null,
      building_number: "900",
    }),
    "#900",
  );
  assert.equal(
    buildings.formatBuildingMetaBadge({
      building_code: null,
      building_number: null,
    }),
    null,
  );
});

test("buildWalkingDirectionsUrl produces exact Google Maps walking URL for verified coords and null for unverified/synthetic", () => {
  const { buildings } = loadModules();

  const url = buildings.buildWalkingDirectionsUrl(SAMPLE_BUILDINGS[1]);
  assert.equal(
    url,
    "https://www.google.com/maps/dir/?api=1&destination=33.9378,-84.5205&travelmode=walking",
  );
  assert.equal(url.includes("origin"), false);
  assert.equal(url.includes("key"), false);

  assert.equal(buildings.buildWalkingDirectionsUrl(null), null);
  assert.equal(buildings.buildWalkingDirectionsUrl(SAMPLE_BUILDINGS[4]), null);
  assert.equal(
    buildings.buildWalkingDirectionsUrl({
      ...SAMPLE_BUILDINGS[1],
      latitude: 0,
      longitude: 0,
    }),
    null,
  );
});

test("offline fixture mode remains explicitly synthetic and never fabricates verified campus coordinates", () => {
  const { fixtures } = loadModules();

  const dir = fixtures.fixtureGetBuildings();
  assert.equal(dir.campus, "marietta");
  assert.equal(dir.buildings.length, 0);

  fixtures.fixtureDemoReset({ scenario: "visitors" });
  const draft = fixtures.fixtureCreateDrop("pizza");
  assert.equal(draft.building, null);
  assert.equal(draft.pickup_instructions, "");

  const updated = fixtures.fixtureUpdateDrop(draft.id, {
    servings_final: 2,
    allergens_final: ["dairy", "gluten"],
    diet_tags_final: [],
    building_code: "DEMO-ORIGIN",
    room: "214",
    pickup_instructions: "Table inside main doors",
    expires_in_minutes: 45,
    safety_review: {
      covered_and_temperature_safe: true,
      served_within_two_hours: true,
      untouched: true,
      ingredient_information_checked: false,
      religious_diets_confirmed: false,
    },
  });
  assert.equal(updated.building, null);
  assert.equal(updated.pickup_instructions, "Table inside main doors");

  // Joining with an unverified or unknown campus slug in offline fixture mode throws 422 invalid_building
  assert.throws(
    () =>
      fixtures.fixtureJoinSession({
        nickname: "OfflineVisitor",
        area: "ksu-marietta-atrium-building",
        allergens: [],
        diets: [],
      }),
    (err) => err.status === 422 && err.code === "invalid_building",
  );
});
