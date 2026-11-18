import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as h3 from "h3-js";

const hostHelpersSource = readFileSync(
  new URL("../app/host/host-helpers.ts", import.meta.url),
  "utf8",
);
const hostHelpersCompiled = ts.transpileModule(hostHelpersSource, {
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

function loadHostHelpers() {
  const exports = {};
  runInNewContext(hostHelpersCompiled, {
    exports,
    require: () => ({}),
    URL,
  });
  return exports;
}

function loadFixturesModule() {
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

  return { fixtures: fixturesExports, store };
}

test("getVisionSourceLabel maps openrouter to 'Live Gemini via OpenRouter', gemini to 'Live Gemini', and fixture to 'Saved demo estimate'", () => {
  const helpers = loadHostHelpers();
  assert.equal(
    helpers.getVisionSourceLabel("openrouter"),
    "Live Gemini via OpenRouter",
  );
  assert.equal(helpers.getVisionSourceLabel("gemini"), "Live Gemini");
  assert.equal(helpers.getVisionSourceLabel("fixture"), "Saved demo estimate");
  assert.equal(helpers.isLiveVisionSource("openrouter"), true);
  assert.equal(helpers.isLiveVisionSource("gemini"), true);
  assert.equal(helpers.isLiveVisionSource("fixture"), false);
});

test("buildPickupCompanionUrl binds one UUID to its own It page without credentials", () => {
  const helpers = loadHostHelpers();
  const dropId = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(
    helpers.buildPickupCompanionUrl(
      dropId,
      "https://paired-mac.example.test/old/path?token=remove-me",
    ),
    `https://paired-mac.example.test/p/owl-whats-left-${dropId}`,
  );
  assert.equal(
    helpers.buildPickupCompanionUrl(dropId, "http://127.0.0.1:43120"),
    `http://127.0.0.1:43120/p/owl-whats-left-${dropId}`,
  );
  assert.equal(
    helpers.buildPickupCompanionUrl("not-a-uuid", "https://it.test"),
    null,
  );
  assert.equal(
    helpers.buildPickupCompanionUrl(dropId, "javascript:alert(1)"),
    null,
  );
  assert.equal(
    helpers.buildPickupCompanionUrl(dropId, "https://user:secret@it.test"),
    null,
  );
});

test("resolveHostStep maps null/expired to upload, draft to review, and live/claimed_out to counts", () => {
  const helpers = loadHostHelpers();
  assert.equal(helpers.resolveHostStep(null), "upload");
  assert.equal(helpers.resolveHostStep({ status: "expired" }), "upload");
  assert.equal(helpers.resolveHostStep({ status: "draft" }), "review");
  assert.equal(helpers.resolveHostStep({ status: "live" }), "counts");
  assert.equal(helpers.resolveHostStep({ status: "claimed_out" }), "counts");
});

test("shouldPollHostCounts enables 2s polling only when step is counts and drop is live or claimed_out", () => {
  const helpers = loadHostHelpers();
  assert.equal(helpers.HOST_POLL_INTERVAL_MS, 2000);
  assert.equal(helpers.shouldPollHostCounts(null, "upload"), false);
  assert.equal(
    helpers.shouldPollHostCounts({ status: "draft" }, "review"),
    false,
  );
  assert.equal(
    helpers.shouldPollHostCounts({ status: "live" }, "counts"),
    true,
  );
  assert.equal(
    helpers.shouldPollHostCounts({ status: "claimed_out" }, "counts"),
    true,
  );
  assert.equal(
    helpers.shouldPollHostCounts({ status: "live" }, "upload"),
    false,
  );
});

test("formatHostCounts returns number-only strings for each count element", () => {
  const helpers = loadHostHelpers();
  const formatted = helpers.formatHostCounts({
    total: 4,
    available: 2,
    held: 1,
    picked_up: 1,
  });
  assert.equal(formatted.available, "2");
  assert.equal(formatted.held, "1");
  assert.equal(formatted.pickedUp, "1");
  assert.equal(formatted.total, "4");
  for (const val of Object.values(formatted)) {
    assert.match(val, /^\d+$/);
  }
});

test("restoreHostDropState restores upload for null active drop, review for draft, and counts for live/claimed_out", async () => {
  const helpers = loadHostHelpers();

  // 1. Null active drop -> starts at upload without calling fetchDrop
  let fetchDropCalls = 0;
  const nullState = await helpers.restoreHostDropState(
    async () => ({ data: { drop_id: null }, source: "live_api" }),
    async () => {
      fetchDropCalls++;
      throw new Error("Should not fetch drop when drop_id is null");
    },
  );
  assert.equal(nullState.step, "upload");
  assert.equal(nullState.drop, null);
  assert.equal(fetchDropCalls, 0);

  // 2. Draft drop -> restores review step with saved estimate
  const draftDrop = {
    id: "drop-draft-1",
    status: "draft",
    vision_source: "openrouter",
    servings_final: 5,
    counts: { total: 5, available: 5, held: 0, picked_up: 0 },
  };
  const draftState = await helpers.restoreHostDropState(
    async () => ({ data: { drop_id: "drop-draft-1" }, source: "live_api" }),
    async (id) => {
      assert.equal(id, "drop-draft-1");
      return { data: draftDrop, source: "live_api" };
    },
  );
  assert.equal(draftState.step, "review");
  assert.equal(draftState.drop?.id, "drop-draft-1");
  assert.equal(draftState.drop?.servings_final, 5);

  // 3. Live drop -> restores counts panel
  const liveDrop = {
    id: "drop-live-1",
    status: "live",
    vision_source: "fixture",
    servings_final: 3,
    counts: { total: 3, available: 2, held: 1, picked_up: 0 },
  };
  const liveState = await helpers.restoreHostDropState(
    async () => ({ data: { drop_id: "drop-live-1" }, source: "live_api" }),
    async () => ({ data: liveDrop, source: "live_api" }),
  );
  assert.equal(liveState.step, "counts");
  assert.equal(liveState.drop?.id, "drop-live-1");

  // 4. Claimed_out drop -> restores counts panel
  const claimedOutDrop = {
    id: "drop-claimed-1",
    status: "claimed_out",
    vision_source: "gemini",
    servings_final: 2,
    counts: { total: 2, available: 0, held: 0, picked_up: 2 },
  };
  const claimedOutState = await helpers.restoreHostDropState(
    async () => ({ data: { drop_id: "drop-claimed-1" }, source: "live_api" }),
    async () => ({ data: claimedOutDrop, source: "live_api" }),
  );
  assert.equal(claimedOutState.step, "counts");
  assert.equal(claimedOutState.drop?.id, "drop-claimed-1");
});

test("fixture mode exercises restore and live counts transitions (available -> held -> picked_up -> claimed_out)", async () => {
  const helpers = loadHostHelpers();
  const { fixtures } = loadFixturesModule();

  fixtures.fixtureDemoReset({ scenario: "seeded" });
  assert.equal(fixtures.getActiveFixtureDropId(), "");

  // Create draft drop and verify restore lands on review
  const draft = fixtures.fixtureCreateDrop("club meeting pizza");
  assert.equal(draft.status, "draft");
  assert.equal(draft.vision_source, "fixture");
  assert.equal(fixtures.getActiveFixtureDropId(), draft.id);

  const restoredDraft = await helpers.restoreHostDropState(
    async () => ({
      data: { drop_id: fixtures.getActiveFixtureDropId() || null },
      source: "offline_fixture",
    }),
    async (id) => ({
      data: fixtures.fixtureGetDrop(id),
      source: "offline_fixture",
    }),
  );
  assert.equal(restoredDraft.step, "review");
  assert.equal(restoredDraft.drop?.id, draft.id);

  // Update safety review and publish -> status becomes live
  fixtures.fixtureUpdateDrop(draft.id, {
    servings_final: 2,
    allergens_final: [...draft.allergens_final],
    diet_tags_final: [...draft.diet_tags_final],
    building_code: "DEMO-ORIGIN",
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
  const published = fixtures.fixturePublishDrop(draft.id);
  assert.equal(published.status, "live");
  assert.deepEqual(
    { ...published.counts },
    {
      total: 2,
      available: 2,
      held: 0,
      picked_up: 0,
    },
  );

  // Restore now lands on counts panel
  const restoredLive = await helpers.restoreHostDropState(
    async () => ({
      data: { drop_id: fixtures.getActiveFixtureDropId() || null },
      source: "offline_fixture",
    }),
    async (id) => ({
      data: fixtures.fixtureGetDrop(id),
      source: "offline_fixture",
    }),
  );
  assert.equal(restoredLive.step, "counts");

  // Student A claims -> 1 available moves to held
  const invitesA = fixtures.fixtureGetMyInvites("demo-student-A").invites;
  assert.ok(invitesA.length > 0);
  const claimA = fixtures.fixtureClaimInvite(invitesA[0].id, "demo-student-A");
  const afterClaimA = fixtures.fixtureGetDrop(draft.id);
  assert.deepEqual(
    { ...afterClaimA.counts },
    {
      total: 2,
      available: 1,
      held: 1,
      picked_up: 0,
    },
  );

  // Student A confirms pickup -> 1 held moves to picked_up
  fixtures.fixturePickupClaim(claimA.id, "demo-student-A");
  const afterPickupA = fixtures.fixtureGetDrop(draft.id);
  assert.deepEqual(
    { ...afterPickupA.counts },
    {
      total: 2,
      available: 1,
      held: 0,
      picked_up: 1,
    },
  );

  // Student C claims and picks up -> drop transitions to claimed_out
  const invitesC = fixtures.fixtureGetMyInvites("demo-student-C").invites;
  assert.ok(invitesC.length > 0);
  const claimC = fixtures.fixtureClaimInvite(invitesC[0].id, "demo-student-C");
  fixtures.fixturePickupClaim(claimC.id, "demo-student-C");
  const afterPickupC = fixtures.fixtureGetDrop(draft.id);
  assert.equal(afterPickupC.status, "claimed_out");
  assert.deepEqual(
    { ...afterPickupC.counts },
    {
      total: 2,
      available: 0,
      held: 0,
      picked_up: 2,
    },
  );

  // Ensure host DropResponse never exposes student names, nicknames, or per-student status
  assert.equal("personas" in afterPickupC, false);
  assert.equal("visitors" in afterPickupC, false);
  assert.equal("invites" in afterPickupC, false);
  assert.equal("claims" in afterPickupC, false);
});
