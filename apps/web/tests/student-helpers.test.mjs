import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as h3 from "h3-js";

const studentHelpersSource = readFileSync(
  new URL("../app/student/student-helpers.ts", import.meta.url),
  "utf8",
);
const studentHelpersCompiled = ts.transpileModule(studentHelpersSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

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

function loadStudentHelpersAndFixtures() {
  const typesExports = {};
  runInNewContext(typesCompiled, {
    exports: typesExports,
    require: () => ({}),
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
      return {};
    },
  });

  return {
    studentHelpers: studentHelpersExports,
    fixtures: fixturesExports,
  };
}

function makeSyntheticInvite({
  id = "inv-1",
  status = "sent",
  claim = null,
  buildingCode = "STUDENT-CTR",
  room = "214",
} = {}) {
  return {
    id,
    status,
    expires_at: "2026-11-18T17:01:00Z",
    claim,
    drop: {
      id: "drop-1",
      status: "live",
      building_code: buildingCode,
      room,
      vision: {
        items: [
          {
            name: "Cheese Pizza",
            portion_unit: "slice",
            count_estimate: 6,
          },
          {
            name: "Veggie Wraps",
            portion_unit: "wrap",
            count_estimate: 4,
          },
        ],
        servings_estimate: 4,
        servings_low: 3,
        servings_high: 5,
        allergens_likely: ["dairy", "gluten"],
        diet_tags: ["vegetarian"],
        confidence: 0.88,
        notes: "Club leftovers",
      },
      vision_source: "fixture",
      servings_final: 4,
      allergens_final: ["dairy", "gluten"],
      diet_tags_final: ["vegetarian"],
      safety_review: {
        covered_and_temperature_safe: true,
        served_within_two_hours: true,
        untouched: true,
        ingredient_information_checked: false,
        religious_diets_confirmed: false,
      },
      counts: { total: 4, available: 4, held: 0, picked_up: 0 },
      created_at: "2026-11-18T17:00:00Z",
      expires_at: "2026-11-18T17:45:00Z",
      allergen_notice: "may contain, confirm with host",
      is_demo: true,
    },
  };
}

test("resolveStudentCardState returns waiting when there are no active invites", () => {
  const { studentHelpers } = loadStudentHelpersAndFixtures();
  const state = studentHelpers.resolveStudentCardState([]);
  assert.equal(state.kind, "waiting");
  assert.equal(state.activeInvite, null);
  assert.equal(state.activeClaim, null);
  assert.equal(state.collapsedLines.length, 0);
});

test("resolveStudentCardState returns invite when a sent invite is present", () => {
  const { studentHelpers } = loadStudentHelpersAndFixtures();
  const sent = makeSyntheticInvite({ id: "inv-sent-1", status: "sent" });
  const state = studentHelpers.resolveStudentCardState([sent]);
  assert.equal(state.kind, "invite");
  assert.equal(state.activeInvite?.id, "inv-sent-1");
  assert.equal(state.activeClaim, null);
  assert.equal(state.collapsedLines.length, 0);
});

test("resolveStudentCardState replaces invite card with pickup card when a held claim exists", () => {
  const { studentHelpers } = loadStudentHelpersAndFixtures();
  const claimed = makeSyntheticInvite({
    id: "inv-claimed-1",
    status: "claimed",
    claim: {
      id: "claim-1",
      invite_id: "inv-claimed-1",
      drop_id: "drop-1",
      status: "held",
      held_until: "2026-11-18T17:10:00Z",
    },
  });
  const state = studentHelpers.resolveStudentCardState([claimed]);
  assert.equal(state.kind, "pickup");
  assert.equal(state.activeInvite?.id, "inv-claimed-1");
  assert.equal(state.activeClaim?.id, "claim-1");
  assert.equal(state.activeClaim?.status, "held");
});

test("resolveStudentCardState transitions to picked_up card after pickup confirmation", () => {
  const { studentHelpers } = loadStudentHelpersAndFixtures();
  const pickedUp = makeSyntheticInvite({
    id: "inv-picked-1",
    status: "claimed",
    claim: {
      id: "claim-1",
      invite_id: "inv-picked-1",
      drop_id: "drop-1",
      status: "picked_up",
      held_until: "2026-11-18T17:10:00Z",
    },
  });
  const state = studentHelpers.resolveStudentCardState([pickedUp]);
  assert.equal(state.kind, "picked_up");
  assert.equal(state.activeClaim?.status, "picked_up");
});

test("expired, declined, and released invites collapse to short single lines and return to waiting when no active card remains", () => {
  const { studentHelpers } = loadStudentHelpersAndFixtures();
  const expired = makeSyntheticInvite({ id: "inv-exp", status: "expired" });
  const declined = makeSyntheticInvite({ id: "inv-dec", status: "declined" });
  const released = makeSyntheticInvite({
    id: "inv-rel",
    status: "claimed",
    claim: {
      id: "claim-rel",
      invite_id: "inv-rel",
      drop_id: "drop-1",
      status: "released",
      held_until: "2026-11-18T17:10:00Z",
    },
  });

  const state = studentHelpers.resolveStudentCardState([
    expired,
    declined,
    released,
  ]);
  assert.equal(state.kind, "waiting");
  assert.equal(state.activeInvite, null);
  assert.equal(state.collapsedLines.length, 3);
  assert.equal(state.collapsedLines[0].status, "expired");
  assert.match(state.collapsedLines[0].summary, /^Expired • Cheese Pizza/);
  assert.equal(state.collapsedLines[1].status, "declined");
  assert.match(state.collapsedLines[1].summary, /^Declined • Cheese Pizza/);
  assert.equal(state.collapsedLines[2].status, "released");
  assert.match(state.collapsedLines[2].summary, /^Released • Cheese Pizza/);
});

test("full visitor lifecycle in fixtures drives waiting -> invite -> pickup -> picked_up transitions", () => {
  const { studentHelpers, fixtures } = loadStudentHelpersAndFixtures();

  fixtures.fixtureDemoReset({ scenario: "visitors" });
  const joinRes = fixtures.fixtureJoinSession({
    nickname: "MariettaOwl",
    area: "demo-venue",
    allergens: [],
    diets: [],
  });

  // 1. Before drop is published -> waiting
  let invites = fixtures.fixtureGetMyInvites(joinRes.token).invites;
  let cardState = studentHelpers.resolveStudentCardState(invites);
  assert.equal(cardState.kind, "waiting");

  // 2. Host creates and publishes drop -> student receives invite -> invite state
  const draft = fixtures.fixtureCreateDrop();
  fixtures.fixtureUpdateDrop(draft.id, {
    servings_final: 2,
    allergens_final: ["dairy", "gluten"],
    diet_tags_final: [],
    building_code: "STUDENT-CTR",
    room: "214",
    expires_in_minutes: 45,
    safety_review: {
      covered_and_temperature_safe: true,
      served_within_two_hours: true,
      untouched: true,
      ingredient_information_checked: false,
      religious_diets_confirmed: false,
    },
  });
  fixtures.fixturePublishDrop(draft.id);

  invites = fixtures.fixtureGetMyInvites(joinRes.token).invites;
  cardState = studentHelpers.resolveStudentCardState(invites);
  assert.equal(cardState.kind, "invite");
  assert.ok(cardState.activeInvite);

  // 3. Student reserves (claims) invite -> replaces invite card with pickup card
  const claim = fixtures.fixtureClaimInvite(
    cardState.activeInvite.id,
    joinRes.token,
  );
  invites = fixtures.fixtureGetMyInvites(joinRes.token).invites;
  cardState = studentHelpers.resolveStudentCardState(invites);
  assert.equal(cardState.kind, "pickup");
  assert.equal(cardState.activeClaim?.id, claim.id);

  // 4. Student confirms picked up -> transitions to picked_up done card
  fixtures.fixturePickupClaim(claim.id, joinRes.token);
  invites = fixtures.fixtureGetMyInvites(joinRes.token).invites;
  cardState = studentHelpers.resolveStudentCardState(invites);
  assert.equal(cardState.kind, "picked_up");
});
