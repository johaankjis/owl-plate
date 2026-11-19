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

function loadStudentHelpersAndFixtures() {
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
    studentHelpers: studentHelpersExports,
    fixtures: fixturesExports,
    buildings: buildingsExports,
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

test("seeded rehearsal lifecycle in fixtures drives waiting -> invite -> pickup -> picked_up transitions", () => {
  const { studentHelpers, fixtures } = loadStudentHelpersAndFixtures();

  fixtures.fixtureDemoReset({ scenario: "seeded" });
  const joinRes = fixtures.fixtureJoinSession({
    nickname: "MariettaOwl",
    area: "demo-venue",
    allergens: [],
    diets: [],
  });
  assert.equal(joinRes.student.area, "demo-venue");

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

test("campus feed lifecycle in fixtures supports location-free join, multi-drop feed, dietary precedence, direct reserve, hold release/expiry/pickup, and aggregate distribution", () => {
  const { studentHelpers, fixtures } = loadStudentHelpersAndFixtures();

  fixtures.fixtureDemoReset({ scenario: "visitors" });

  // Empty overview works before any drops exist
  const emptyDist = fixtures.fixtureGetDistribution();
  assert.equal(emptyDist.distribution_mode, "campus_feed");
  assert.equal(emptyDist.active_drops, 0);
  assert.equal(emptyDist.joined_students, 0);
  assert.deepEqual(
    { ...emptyDist.counts },
    {
      total: 0,
      available: 0,
      held: 0,
      picked_up: 0,
    },
  );
  assert.equal(emptyDist.buildings.length, 0);

  // Student A joins location-free (no area)
  const studentA = fixtures.fixtureJoinSession({
    nickname: "OwlA",
    allergens: [],
    diets: [],
  });
  assert.equal(studentA.student.area, null);

  // Presence check-ins are rejected in campus_feed mode with 409 invalid_state
  assert.throws(
    () =>
      fixtures.fixtureUpdatePresence(studentA.token, {
        building_code: "DEMO-ORIGIN",
      }),
    (err) => err.status === 409 && err.code === "invalid_state",
  );

  // Host publishes Drop 1 (pizza: dairy, gluten; 1 serving)
  const draft1 = fixtures.fixtureCreateDrop("pizza");
  fixtures.fixtureUpdateDrop(draft1.id, {
    servings_final: 1,
    allergens_final: ["dairy", "gluten"],
    diet_tags_final: [],
    building_code: "BLDG-A",
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
  const pub1 = fixtures.fixturePublishDrop(draft1.id);
  assert.equal(pub1.distribution_mode, "campus_feed");

  // Campus feed publish never creates seeded-wave invites or visitor rows in dispatch
  assert.equal(fixtures.fixtureGetMyInvites(studentA.token).invites.length, 0);
  const dispatch1 = fixtures.fixtureGetDispatch(pub1.id);
  assert.equal(dispatch1.distribution_mode, "campus_feed");
  assert.equal(dispatch1.waves.length, 0);
  assert.equal(dispatch1.visitors.length, 0);
  assert.equal(dispatch1.personas.length, 0);
  assert.equal(dispatch1.next_wave_at, null);

  // Advance clock 10s and publish Drop 2 (veggie/vegan: no allergens; 2 servings)
  fixtures.fixtureDemoTick({ advance_seconds: 10 });
  const draft2 = fixtures.fixtureCreateDrop("salad");
  fixtures.fixtureUpdateDrop(draft2.id, {
    servings_final: 2,
    allergens_final: [],
    diet_tags_final: ["vegetarian", "vegan", "gluten_free"],
    building_code: "BLDG-B",
    room: "202",
    pickup_instructions: "2nd floor lounge",
    expires_in_minutes: 45,
    safety_review: {
      covered_and_temperature_safe: true,
      served_within_two_hours: true,
      untouched: true,
      ingredient_information_checked: true,
      religious_diets_confirmed: false,
    },
  });
  const pub2 = fixtures.fixturePublishDrop(draft2.id);

  // Student B joins AFTER both drops were published, with dairy allergy and vegan diet
  const studentB = fixtures.fixtureJoinSession({
    nickname: "OwlB",
    allergens: ["dairy"],
    diets: ["vegan"],
  });
  assert.equal(studentB.student.area, null);

  // Student B sees both drops newest-first; Drop 2 is reservable, Drop 1 is disabled with allergen_conflict
  const feedB1 = fixtures.fixtureGetMyFeed(studentB.token);
  assert.equal(feedB1.drops.length, 2);
  assert.equal(feedB1.drops[0].drop.id, pub2.id);
  assert.equal(feedB1.drops[0].can_reserve, true);
  assert.equal(feedB1.drops[0].unavailable_reason, null);
  assert.equal(feedB1.drops[1].drop.id, pub1.id);
  assert.equal(feedB1.drops[1].can_reserve, false);
  assert.equal(feedB1.drops[1].unavailable_reason, "allergen_conflict");

  // Student A reserves the single serving on Drop 1 -> Drop 1 becomes claimed_out (0 available)
  const claimA1 = fixtures.fixtureReserveDrop(pub1.id, studentA.token);
  assert.equal(claimA1.status, "held");
  // Idempotent retry returns the same claim ID
  const claimA1Retry = fixtures.fixtureReserveDrop(pub1.id, studentA.token);
  assert.equal(claimA1Retry.id, claimA1.id);

  // Even after Student A changes preferences to conflict with Drop 1, idempotent retry still returns same held claim
  fixtures.fixtureUpdatePreferences(studentA.token, {
    allergens: ["dairy"],
    diets: [],
    alerts_paused: true,
  });
  const claimA1RetryAfterPrefChange = fixtures.fixtureReserveDrop(
    pub1.id,
    studentA.token,
  );
  assert.equal(claimA1RetryAfterPrefChange.id, claimA1.id);
  // Restore Student A's preferences (keep alerts_paused: true to verify paused alerts don't block reserve)
  fixtures.fixtureUpdatePreferences(studentA.token, {
    allergens: [],
    diets: [],
    alerts_paused: true,
  });

  // For Student B, Drop 1 is at 0 available, but dietary conflict still takes precedence over capacity
  const feedB2 = fixtures.fixtureGetMyFeed(studentB.token);
  const drop1ForB = feedB2.drops.find((d) => d.drop.id === pub1.id);
  assert.equal(drop1ForB.drop.status, "claimed_out");
  assert.equal(drop1ForB.unavailable_reason, "allergen_conflict");

  // For Student A, Drop 1 has unavailable_reason = "already_reserved" (with own held claim) and Drop 2 has "active_claim"
  const feedA1 = fixtures.fixtureGetMyFeed(studentA.token);
  const drop1ForA = feedA1.drops.find((d) => d.drop.id === pub1.id);
  const drop2ForA = feedA1.drops.find((d) => d.drop.id === pub2.id);
  assert.equal(drop1ForA.can_reserve, false);
  assert.equal(drop1ForA.unavailable_reason, "already_reserved");
  assert.equal(drop1ForA.claim?.id, claimA1.id);
  assert.equal(drop2ForA.can_reserve, false);
  assert.equal(drop2ForA.unavailable_reason, "active_claim");

  // Student A cannot reserve Drop 2 while holding Drop 1 (409 active_claim)
  assert.throws(
    () => fixtures.fixtureReserveDrop(pub2.id, studentA.token),
    (err) => err.status === 409 && err.code === "active_claim",
  );

  // Student A releases hold on Drop 1 -> capacity restores, Drop 1 returns to live, but Student A cannot re-reserve Drop 1
  fixtures.fixtureReleaseClaim(claimA1.id, studentA.token);
  assert.throws(
    () => fixtures.fixtureReserveDrop(pub1.id, studentA.token),
    (err) => err.status === 409 && err.code === "invalid_state",
  );
  const feedA2 = fixtures.fixtureGetMyFeed(studentA.token);
  const drop1AfterRelease = feedA2.drops.find((d) => d.drop.id === pub1.id);
  assert.equal(drop1AfterRelease.drop.status, "live");
  assert.equal(drop1AfterRelease.drop.counts.available, 1);
  assert.equal(drop1AfterRelease.unavailable_reason, "already_reserved");
  assert.equal(
    studentHelpers.formatUnavailableReason(
      drop1AfterRelease.unavailable_reason,
      drop1AfterRelease.claim,
    ),
    "You released your hold on this drop (one reservation per drop).",
  );

  // Now Student A (with alerts_paused = true) can reserve Drop 2 and confirm pickup via photo-assisted verification
  const claimA2 = fixtures.fixtureReserveDrop(pub2.id, studentA.token);
  assert.equal(claimA2.status, "held");
  // Direct campus-feed pickup without verification_id is rejected with 409 pickup_verification_required
  assert.throws(
    () => fixtures.fixturePickupClaim(claimA2.id, studentA.token),
    (err) => err.status === 409 && err.code === "pickup_verification_required",
  );
  // Submit consistent pickup photo and then complete pickup with verification_id
  const verifyA2 = fixtures.fixtureSubmitPickupPhoto(
    claimA2.id,
    "11111111-1111-4111-8111-111111111111",
    studentA.token,
    {
      mimeType: "image/jpeg",
      byteSize: 2048,
    },
  );
  assert.equal(verifyA2.can_confirm, true);
  assert.equal(verifyA2.match_status, "consistent");
  const pickedA2 = fixtures.fixturePickupClaim(claimA2.id, studentA.token, {
    verification_id: verifyA2.id,
  });
  assert.equal(pickedA2.status, "picked_up");
  // Idempotent retry of pickup returns the same picked_up claim
  const pickedA2Retry = fixtures.fixturePickupClaim(
    claimA2.id,
    studentA.token,
    { verification_id: verifyA2.id },
  );
  assert.equal(pickedA2Retry.id, pickedA2.id);
  assert.equal(pickedA2Retry.status, "picked_up");

  // Current dietary preferences are enforced at reserve time if Student B updates preferences
  fixtures.fixtureUpdatePreferences(studentB.token, {
    allergens: [],
    diets: ["halal"],
    alerts_paused: false,
  });
  assert.throws(
    () => fixtures.fixtureReserveDrop(pub2.id, studentB.token),
    (err) => err.status === 409 && err.code === "diet_mismatch",
  );

  // Student B clears halal diet, reserves Drop 2, and lets hold expire after 601s
  fixtures.fixtureUpdatePreferences(studentB.token, {
    allergens: [],
    diets: ["vegan"],
    alerts_paused: false,
  });
  const claimB2 = fixtures.fixtureReserveDrop(pub2.id, studentB.token);
  assert.equal(claimB2.status, "held");

  // Check projector aggregate distribution while B2 is held and A2 is picked_up
  const distMid = fixtures.fixtureGetDistribution();
  assert.equal(distMid.active_drops, 2);
  assert.equal(distMid.joined_students, 2);
  assert.deepEqual(
    { ...distMid.counts },
    {
      total: 3,
      available: 1,
      held: 1,
      picked_up: 1,
    },
  );
  assert.equal(distMid.buildings.length, 2);

  // Advance clock 601s so Student B's 10-minute hold expires (drops have 45m expiry so drops remain live)
  fixtures.fixtureDemoTick({ advance_seconds: 601 });
  const distAfterHoldExpiry = fixtures.fixtureGetDistribution();
  assert.deepEqual(
    { ...distAfterHoldExpiry.counts },
    {
      total: 3,
      available: 2,
      held: 0,
      picked_up: 1,
    },
  );

  // Student B cannot re-reserve Drop 2 after hold expiry (one reservation per student/drop lifecycle)
  assert.throws(
    () => fixtures.fixtureReserveDrop(pub2.id, studentB.token),
    (err) => err.status === 409 && err.code === "invalid_state",
  );

  // resolveStudentFeedView focuses ?drop=<id> and flags missing/expired drop IDs
  const feedBFinal = fixtures.fixtureGetMyFeed(studentB.token);
  const focusedView = studentHelpers.resolveStudentFeedView(
    feedBFinal.drops,
    pub1.id,
  );
  assert.equal(focusedView.focusedDropMissing, false);
  assert.equal(focusedView.orderedDrops[0].drop.id, pub1.id);

  const missingView = studentHelpers.resolveStudentFeedView(
    feedBFinal.drops,
    "non-existent-drop-uuid",
  );
  assert.equal(missingView.focusedDropMissing, true);
});

test("student helpers format real building name, room, pickup instructions, and exact walking directions URL without origin or GPS", () => {
  const { studentHelpers } = loadStudentHelpersAndFixtures();

  const verifiedBuilding = {
    id: "ksu-marietta-joe-mack-wilson-student-center",
    name: "Joe Mack Wilson Student Center",
    building_code: "A",
    building_number: "840",
    category: "student_life",
    latitude: 33.9389,
    longitude: -84.5197,
    verification_status: "verified",
    sources: [{ url: "https://www.kennesaw.edu/maps", title: "KSU Maps" }],
  };

  const dropWithVerifiedBuilding = {
    building_code: "ksu-marietta-joe-mack-wilson-student-center",
    room: "214",
    pickup_instructions: "  2nd floor lobby table by the east stairs  ",
    building: verifiedBuilding,
  };

  assert.equal(
    studentHelpers.formatDropResponseLocation(dropWithVerifiedBuilding),
    "Joe Mack Wilson Student Center, Room 214",
  );
  assert.equal(
    studentHelpers.getDropPickupInstructions(dropWithVerifiedBuilding),
    "2nd floor lobby table by the east stairs",
  );

  const directionsUrl = studentHelpers.getDropWalkingDirectionsUrl(
    dropWithVerifiedBuilding,
  );
  assert.equal(
    directionsUrl,
    "https://www.google.com/maps/dir/?api=1&destination=33.9389,-84.5197&travelmode=walking",
  );
  assert.equal(directionsUrl.includes("origin="), false);
  assert.equal(directionsUrl.includes("key="), false);

  // Rehearsal drop (building: null) never gets a directions URL
  const rehearsalDrop = {
    building_code: "DEMO-ORIGIN",
    room: "214",
    pickup_instructions: "",
    building: null,
  };
  assert.equal(
    studentHelpers.formatDropResponseLocation(rehearsalDrop),
    "DEMO-ORIGIN, Room 214",
  );
  assert.equal(studentHelpers.getDropPickupInstructions(rehearsalDrop), null);
  assert.equal(studentHelpers.getDropWalkingDirectionsUrl(rehearsalDrop), null);

  // Unverified or synthetic (0, 0) building never gets a directions URL
  assert.equal(
    studentHelpers.getDropWalkingDirectionsUrl({
      building: { ...verifiedBuilding, verification_status: "unverified" },
    }),
    null,
  );
  assert.equal(
    studentHelpers.getDropWalkingDirectionsUrl({
      building: { ...verifiedBuilding, latitude: 0, longitude: 0 },
    }),
    null,
  );

  // Student area label prefers directory building name over raw canonical id, and null maps to Campus-wide feed
  assert.equal(
    studentHelpers.formatStudentAreaLabel(null, [verifiedBuilding]),
    "Campus-wide feed",
  );
  assert.equal(
    studentHelpers.formatStudentAreaLabel(
      "ksu-marietta-joe-mack-wilson-student-center",
      [verifiedBuilding],
    ),
    "Joe Mack Wilson Student Center",
  );
  assert.equal(
    studentHelpers.formatStudentAreaLabel("demo-venue", [verifiedBuilding]),
    "Event venue (demo)",
  );
});

test("Milestone 2 photo-assisted pickup verification state machine enforces 0.8 threshold, idempotency, concurrency/timeout guards, and local preview URL revocation", () => {
  const { studentHelpers, fixtures } = loadStudentHelpersAndFixtures();

  // 1. Pure helpers: request_id UUID generation, file validation, object URL revocation
  const reqId1 = studentHelpers.generatePickupRequestId();
  const reqId2 = studentHelpers.generatePickupRequestId();
  assert.match(
    reqId1,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.notEqual(reqId1, reqId2);

  assert.equal(
    studentHelpers.validatePickupPhotoFile({
      name: "food.jpg",
      size: 1024,
      type: "image/jpeg",
    }).valid,
    true,
  );
  assert.equal(
    studentHelpers.validatePickupPhotoFile({
      name: "empty.png",
      size: 0,
      type: "image/png",
    }).valid,
    false,
  );
  assert.equal(
    studentHelpers.validatePickupPhotoFile({
      name: "huge.png",
      size: 11 * 1024 * 1024,
      type: "image/png",
    }).valid,
    false,
  );
  assert.equal(
    studentHelpers.validatePickupPhotoFile({
      name: "doc.pdf",
      size: 512,
      type: "application/pdf",
    }).valid,
    false,
  );

  const revokedUrls = [];
  studentHelpers.revokePreviewObjectUrl(
    "blob:https://owlplate.edu/temp-123",
    (u) => revokedUrls.push(u),
  );
  assert.deepEqual(revokedUrls, ["blob:https://owlplate.edu/temp-123"]);

  // 2. Fixture verification lifecycle
  fixtures.fixtureDemoReset({ scenario: "visitors" });
  const student = fixtures.fixtureJoinSession({
    nickname: "VerifyOwl",
    allergens: [],
    diets: [],
  });
  const draft = fixtures.fixtureCreateDrop("pizza");
  fixtures.fixtureUpdateDrop(draft.id, {
    servings_final: 2,
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
  const pub = fixtures.fixturePublishDrop(draft.id);
  const claim = fixtures.fixtureReserveDrop(pub.id, student.token);

  // Before any photo attempt, GET /claims/{id}/pickup-verification returns { verification: null }
  const initialVer = fixtures.fixtureGetPickupVerification(
    claim.id,
    student.token,
  );
  assert.equal(initialVer.verification, null);
  const idleActions = studentHelpers.resolvePickupVerificationActions(
    initialVer.verification,
    true,
  );
  assert.equal(idleActions.canCompletePickup, false);
  assert.equal(
    idleActions.notice,
    "Photo-assisted confirmation. A photo cannot independently establish physical pickup or food safety.",
  );

  // Low confidence (< 0.8) with raw "consistent" is normalized to "uncertain" and can_confirm: false
  const lowConf = fixtures.fixtureSubmitPickupPhoto(
    claim.id,
    studentHelpers.generatePickupRequestId(),
    student.token,
    {
      matchStatus: "consistent",
      confidence: 0.79,
    },
  );
  assert.equal(lowConf.match_status, "uncertain");
  assert.equal(lowConf.can_confirm, false);
  const lowConfActions = studentHelpers.resolvePickupVerificationActions(
    lowConf,
    true,
  );
  assert.equal(lowConfActions.canCompletePickup, false);
  assert.equal(lowConfActions.canRequestHostReview, true);

  // Cannot complete pickup with an uncertain verification
  assert.throws(
    () =>
      fixtures.fixturePickupClaim(claim.id, student.token, {
        verification_id: lowConf.id,
      }),
    (err) => err.status === 409 && err.code === "invalid_state",
  );

  // Student requests host review on uncertain verification -> review_status becomes "pending"
  const pendingRev = fixtures.fixtureRequestPickupReview(
    claim.id,
    lowConf.id,
    student.token,
  );
  assert.equal(pendingRev.review_status, "pending");
  // Idempotent retry of review request returns same pending state
  const pendingRevRetry = fixtures.fixtureRequestPickupReview(
    claim.id,
    lowConf.id,
    student.token,
  );
  assert.equal(pendingRevRetry.id, lowConf.id);
  assert.equal(pendingRevRetry.review_status, "pending");

  // While review is pending, student can submit a newer photo; prior pending review becomes superseded
  const inProgressReqId = studentHelpers.generatePickupRequestId();
  const procRes = fixtures.fixtureSubmitPickupPhoto(
    claim.id,
    inProgressReqId,
    student.token,
    {
      keepProcessing: true,
    },
  );
  assert.equal(procRes.status, "processing");
  assert.equal(procRes.can_confirm, false);

  // Same request_id while processing is idempotent
  const procIdem = fixtures.fixtureSubmitPickupPhoto(
    claim.id,
    inProgressReqId,
    student.token,
    {
      keepProcessing: true,
    },
  );
  assert.equal(procIdem.id, procRes.id);

  // Different request_id while processing (< 120s) returns 409 verification_in_progress
  assert.throws(
    () =>
      fixtures.fixtureSubmitPickupPhoto(
        claim.id,
        studentHelpers.generatePickupRequestId(),
        student.token,
      ),
    (err) => err.status === 409 && err.code === "verification_in_progress",
  );

  // Advance clock 121s -> stale processing attempt times out to failed and allows a fresh photo
  fixtures.fixtureDemoTick({ advance_seconds: 121 });
  const timedOut = fixtures.fixtureGetPickupVerification(
    claim.id,
    student.token,
  );
  assert.equal(timedOut.verification.status, "failed");
  assert.equal(timedOut.verification.can_confirm, false);

  // Fresh consistent photo (>= 0.8) succeeds; late completion of older processing attempt cannot overwrite it
  const consistentReqId = studentHelpers.generatePickupRequestId();
  const readyConsistent = fixtures.fixtureSubmitPickupPhoto(
    claim.id,
    consistentReqId,
    student.token,
    {
      matchStatus: "consistent",
      confidence: 0.92,
    },
  );
  assert.equal(readyConsistent.can_confirm, true);
  assert.equal(readyConsistent.match_status, "consistent");

  // Attempting to late-complete the older timed-out attempt does not overwrite the newer ready verification
  fixtures.fixtureCompleteProcessingVerification(procRes.id, {
    matchStatus: "inconsistent",
    confidence: 0.2,
  });
  const latestAfterLate = fixtures.fixtureGetPickupVerification(
    claim.id,
    student.token,
  );
  assert.equal(latestAfterLate.verification.id, readyConsistent.id);
  assert.equal(latestAfterLate.verification.can_confirm, true);

  // Consistent verification cannot request host review (409 invalid_state)
  assert.throws(
    () =>
      fixtures.fixtureRequestPickupReview(
        claim.id,
        readyConsistent.id,
        student.token,
      ),
    (err) => err.status === 409 && err.code === "invalid_state",
  );

  const readyActions = studentHelpers.resolvePickupVerificationActions(
    latestAfterLate.verification,
    true,
  );
  assert.equal(readyActions.canCompletePickup, true);
  assert.equal(readyActions.canRequestHostReview, false);
  assert.equal(readyActions.verificationId, readyConsistent.id);
});
