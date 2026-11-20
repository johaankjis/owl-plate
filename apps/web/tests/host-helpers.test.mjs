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

function loadHostHelpers() {
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

  const exports = {};
  runInNewContext(hostHelpersCompiled, {
    exports,
    require: (id) => {
      if (id === "../../lib/buildings") return buildingsExports;
      if (id === "../../lib/types/api") return typesExports;
      return {};
    },
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
      pantry_held: 0,
      pantry_transferred: 0,
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
      pantry_held: 0,
      pantry_transferred: 0,
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
      pantry_held: 0,
      pantry_transferred: 0,
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
      pantry_held: 0,
      pantry_transferred: 0,
    },
  );

  // Ensure host DropResponse never exposes student names, nicknames, or per-student status
  assert.equal("personas" in afterPickupC, false);
  assert.equal("visitors" in afterPickupC, false);
  assert.equal("invites" in afterPickupC, false);
  assert.equal("claims" in afterPickupC, false);
});

test("resolveDefaultHostBuildingId prefers verified campus buildings by default when current code is DEMO-ORIGIN or blank", () => {
  const helpers = loadHostHelpers();
  const sampleBuildings = [
    {
      id: "ksu-marietta-atrium-building",
      name: "Atrium Building",
      building_code: "J",
      building_number: "860",
      category: "academic",
      latitude: 33.9378,
      longitude: -84.5205,
      verification_status: "verified",
      sources: [],
    },
  ];

  assert.equal(
    helpers.resolveDefaultHostBuildingId("DEMO-ORIGIN", sampleBuildings),
    "ksu-marietta-atrium-building",
  );
  assert.equal(
    helpers.resolveDefaultHostBuildingId("", sampleBuildings),
    "ksu-marietta-atrium-building",
  );
  assert.equal(
    helpers.resolveDefaultHostBuildingId(
      "ksu-marietta-student-center",
      sampleBuildings,
    ),
    "ksu-marietta-student-center",
  );
  assert.equal(
    helpers.resolveDefaultHostBuildingId("DEMO-ORIGIN", []),
    "DEMO-ORIGIN",
  );
});

test("formatHostDropLocation uses drop.building.name or directory match, and falls back to building_code for rehearsal", () => {
  const helpers = loadHostHelpers();
  const sampleBuilding = {
    id: "ksu-marietta-atrium-building",
    name: "Atrium Building",
    building_code: "J",
    building_number: "860",
    category: "academic",
    latitude: 33.9378,
    longitude: -84.5205,
    verification_status: "verified",
    sources: [],
  };

  assert.equal(
    helpers.formatHostDropLocation({
      building_code: "ksu-marietta-atrium-building",
      room: "109",
      building: sampleBuilding,
    }),
    "Atrium Building, Room 109",
  );

  assert.equal(
    helpers.formatHostDropLocation(
      {
        building_code: "ksu-marietta-atrium-building",
        room: "214",
        building: null,
      },
      [sampleBuilding],
    ),
    "Atrium Building, Room 214",
  );

  assert.equal(
    helpers.formatHostDropLocation({
      building_code: "DEMO-ORIGIN",
      room: "214",
      building: null,
    }),
    "DEMO-ORIGIN, Room 214",
  );
});

test("restoreHostDropState supports authorized /host?drop=<UUID> deep link and blocks foreign or missing drops without exposing foreign data", async () => {
  const helpers = loadHostHelpers();
  const { fixtures } = loadFixturesModule();

  fixtures.fixtureDemoReset({ scenario: "visitors" });

  // Host creates and publishes own drop
  const ownDraft = fixtures.fixtureCreateDrop("pizza", "demo-host");
  fixtures.fixtureUpdateDrop(ownDraft.id, {
    servings_final: 3,
    allergens_final: ["dairy", "gluten"],
    diet_tags_final: [],
    building_code: "BLDG-A",
    room: "101",
    pickup_instructions: "",
    expires_in_minutes: 45,
    safety_review: {
      covered_and_temperature_safe: true,
      served_within_two_hours: true,
      untouched: true,
      ingredient_information_checked: false,
      religious_diets_confirmed: false,
    },
  });
  const ownLive = fixtures.fixturePublishDrop(ownDraft.id);

  // Another host creates a foreign drop
  const foreignDraft = fixtures.fixtureCreateDrop("salad", "demo-host-foreign");

  // 1. Authorized /host?drop=<ownLive.id> loads own drop directly on counts view without calling fetchActiveDrop
  let activeDropCalled = 0;
  const restoredOwn = await helpers.restoreHostDropState(
    async () => {
      activeDropCalled++;
      return { data: { drop_id: ownLive.id }, source: "offline_fixture" };
    },
    async (id) => ({
      data: fixtures.fixtureGetDrop(id, "demo-host"),
      source: "offline_fixture",
    }),
    ownLive.id,
  );
  assert.equal(activeDropCalled, 0);
  assert.equal(restoredOwn.step, "counts");
  assert.equal(restoredOwn.drop?.id, ownLive.id);
  assert.equal(restoredOwn.linkedDropError, null);

  // 2. Foreign /host?drop=<foreignDraft.id> throws 404 from fixtureGetDrop(id, "demo-host") and never displays foreign drop data
  const restoredForeign = await helpers.restoreHostDropState(
    async () => ({
      data: { drop_id: ownLive.id },
      source: "offline_fixture",
    }),
    async (id) => ({
      data: fixtures.fixtureGetDrop(id, "demo-host"),
      source: "offline_fixture",
    }),
    foreignDraft.id,
  );
  assert.notEqual(restoredForeign.drop?.id, foreignDraft.id);
  assert.equal(restoredForeign.drop?.id, ownLive.id);
  assert.ok(restoredForeign.linkedDropError);
});

test("Milestone 2 host pickup review queue is de-identified, enforces ACLs, handles approve/reject/idempotency/contradictions, and emits once-only host pickup notifications", () => {
  const helpers = loadHostHelpers();
  const { fixtures } = loadFixturesModule();

  fixtures.fixtureDemoReset({ scenario: "visitors" });

  // Host push registration status starts disabled, can be enabled, and resets on demo reset
  assert.equal(
    fixtures.fixtureGetHostPushTokenStatus("demo-host").registered,
    false,
  );
  assert.equal(
    fixtures.fixtureRegisterHostPushToken("demo-host", {
      token: "fcm-host-token-12345678901234567890",
      platform: "web",
    }).registered,
    true,
  );
  assert.equal(
    fixtures.fixtureGetHostPushTokenStatus("demo-host").registered,
    true,
  );

  // Student tokens are rejected with 403 on host push-token endpoints
  const stuA = fixtures.fixtureJoinSession({
    nickname: "ReviewStuA",
    allergens: [],
    diets: [],
  });
  const stuB = fixtures.fixtureJoinSession({
    nickname: "ReviewStuB",
    allergens: [],
    diets: [],
  });
  assert.throws(
    () => fixtures.fixtureGetHostPushTokenStatus(stuA.token),
    (err) => err.status === 403 && err.code === "forbidden",
  );

  // Host creates and publishes a 2-serving drop
  const draft = fixtures.fixtureCreateDrop("tacos", "demo-host");
  fixtures.fixtureUpdateDrop(draft.id, {
    servings_final: 2,
    allergens_final: draft.allergens_final,
    diet_tags_final: draft.diet_tags_final,
    building_code: "BLDG-A",
    room: "214",
    pickup_instructions: "",
    expires_in_minutes: 45,
    safety_review: {
      covered_and_temperature_safe: true,
      served_within_two_hours: true,
      untouched: true,
      ingredient_information_checked: false,
      religious_diets_confirmed: false,
    },
  });
  const pub = fixtures.fixturePublishDrop(draft.id);

  // Student A reserves and submits an uncertain photo, then requests host review
  const claimA = fixtures.fixtureReserveDrop(pub.id, stuA.token);
  const verA = fixtures.fixtureSubmitPickupPhoto(
    claimA.id,
    "22222222-2222-4222-8222-222222222222",
    stuA.token,
    {
      matchStatus: "uncertain",
      confidence: 0.65,
    },
  );
  fixtures.fixtureRequestPickupReview(claimA.id, verA.id, stuA.token);

  // Wrong role (student token) cannot read host review queue (403)
  assert.throws(
    () => fixtures.fixtureGetHostPickupReviews(pub.id, stuA.token),
    (err) => err.status === 403 && err.code === "forbidden",
  );
  // Foreign host cannot read or decide another host's review queue (404)
  assert.throws(
    () => fixtures.fixtureGetHostPickupReviews(pub.id, "demo-host-other"),
    (err) => err.status === 404 && err.code === "not_found",
  );

  // Own host polls review queue -> receives de-identified review card (no student id/nickname/claim_id/photo)
  const queue1 = fixtures.fixtureGetHostPickupReviews(pub.id, "demo-host");
  assert.equal(queue1.reviews.length, 1);
  const revCard = queue1.reviews[0];
  assert.equal(revCard.id, verA.id);
  assert.equal(revCard.match_status, "uncertain");
  assert.equal(revCard.review_status, "pending");
  assert.equal("claim_id" in revCard, false);
  assert.equal("student_id" in revCard, false);
  assert.equal("nickname" in revCard, false);
  assert.equal("photo" in revCard, false);

  const guardActive = helpers.resolveHostReviewActionGuard(
    revCard,
    queue1.server_time,
  );
  assert.equal(guardActive.canAct, true);
  assert.equal(guardActive.staleReason, null);

  // Host rejects first -> review_status becomes "rejected", claim remains "held" so student can retry
  const rejected = fixtures.fixtureDecideHostPickupReview(
    pub.id,
    verA.id,
    "reject",
    "demo-host",
  );
  assert.equal(rejected.review_status, "rejected");
  // Idempotent retry of same reject decision returns 200 rejected
  const rejectedIdem = fixtures.fixtureDecideHostPickupReview(
    pub.id,
    verA.id,
    "reject",
    "demo-host",
  );
  assert.equal(rejectedIdem.review_status, "rejected");
  // Contradictory approve after reject returns 409 invalid_state
  assert.throws(
    () =>
      fixtures.fixtureDecideHostPickupReview(
        pub.id,
        verA.id,
        "approve",
        "demo-host",
      ),
    (err) => err.status === 409 && err.code === "invalid_state",
  );

  // Student A's hold is still active; Student A submits a second uncertain photo and requests review
  const verA2 = fixtures.fixtureSubmitPickupPhoto(
    claimA.id,
    "33333333-3333-4333-8333-333333333333",
    stuA.token,
    {
      matchStatus: "inconsistent",
      confidence: 0.35,
    },
  );
  fixtures.fixtureRequestPickupReview(claimA.id, verA2.id, stuA.token);

  // Host approves -> human override marks claim picked_up, updates drop counts, and emits once-only host_pickup outbox event
  const approved = fixtures.fixtureDecideHostPickupReview(
    pub.id,
    verA2.id,
    "approve",
    "demo-host",
  );
  assert.equal(approved.review_status, "approved");

  // Idempotent retry of approve returns same approved state and does not duplicate outbox notification
  const approvedIdem = fixtures.fixtureDecideHostPickupReview(
    pub.id,
    verA2.id,
    "approve",
    "demo-host",
  );
  assert.equal(approvedIdem.review_status, "approved");

  const dropAfterApprove = fixtures.fixtureGetDrop(pub.id, "demo-host");
  assert.deepEqual(
    { ...dropAfterApprove.counts },
    {
      total: 2,
      available: 1,
      held: 0,
      picked_up: 1,
      pantry_held: 0,
      pantry_transferred: 0,
    },
  );

  const outboxAfterApprove = fixtures.fixtureGetHostOutboxEvents();
  assert.equal(outboxAfterApprove.length, 1);
  assert.equal(outboxAfterApprove[0].notification_mode, "host_pickup");
  assert.equal(outboxAfterApprove[0].drop_id, pub.id);
  assert.equal(outboxAfterApprove[0].url, `/host?drop=${pub.id}`);
  assert.ok(outboxAfterApprove[0].tag.length <= 32);
  assert.ok(outboxAfterApprove[0].body.includes("1 serving available."));

  // Student B reserves the remaining serving, requests review, then lets the hold expire before host decides
  const claimB = fixtures.fixtureReserveDrop(pub.id, stuB.token);
  const verB = fixtures.fixtureSubmitPickupPhoto(
    claimB.id,
    "44444444-4444-4444-8444-444444444444",
    stuB.token,
    {
      matchStatus: "uncertain",
      confidence: 0.55,
    },
  );
  fixtures.fixtureRequestPickupReview(claimB.id, verB.id, stuB.token);

  // Advance clock 601s so Student B's 10-minute hold expires
  fixtures.fixtureDemoTick({ advance_seconds: 601 });
  assert.throws(
    () =>
      fixtures.fixtureDecideHostPickupReview(
        pub.id,
        verB.id,
        "approve",
        "demo-host",
      ),
    (err) =>
      err.status === 409 &&
      (err.code === "invalid_state" || err.code === "hold_expired"),
  );

  // Demo reset clears host push registrations, verifications, and outbox
  fixtures.fixtureDemoReset({ scenario: "visitors" });
  assert.equal(
    fixtures.fixtureGetHostPushTokenStatus("demo-host").registered,
    false,
  );
  assert.equal(fixtures.fixtureGetHostOutboxEvents().length, 0);
});
