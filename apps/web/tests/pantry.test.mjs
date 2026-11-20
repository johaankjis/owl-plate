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
const pantryHelpersCompiled = compileTs("../lib/pantry-helpers.ts");
const hostHelpersCompiled = compileTs("../app/host/host-helpers.ts");
const campusMapCompiled = compileTs("../lib/campus-map.ts");
const fixturesCompiled = compileTs("../lib/fixtures/demo-fixtures.ts");
const pantryApiCompiled = compileTs("../lib/pantry-api.ts");
const apiClientCompiled = compileTs("../lib/api-client.ts");

function loadCoreModules() {
  const types = {};
  runInNewContext(typesCompiled, {
    exports: types,
    require: () => ({}),
  });

  const buildings = {};
  runInNewContext(buildingsCompiled, {
    exports: buildings,
    require: (id) => {
      if (id === "./types/api") return types;
      return {};
    },
  });

  const pantryHelpers = {};
  runInNewContext(pantryHelpersCompiled, {
    exports: pantryHelpers,
    URL,
    require: (id) => {
      if (id === "./buildings") return buildings;
      if (id === "./types/api") return types;
      return {};
    },
  });

  const hostHelpers = {};
  runInNewContext(hostHelpersCompiled, {
    exports: hostHelpers,
    process: { env: {} },
    require: (id) => {
      if (id === "../../lib/types/api") return types;
      if (id === "../../lib/buildings") return buildings;
      if (id === "../../lib/pantry-helpers") return pantryHelpers;
      return {};
    },
  });

  const campusMap = {};
  runInNewContext(campusMapCompiled, {
    exports: campusMap,
    require: (id) => {
      if (id === "h3-js") return h3;
      if (id === "./buildings") return buildings;
      if (id === "./types/api") return types;
      return {};
    },
  });

  const store = new Map();
  const mockLocalStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  const fixtures = {};
  runInNewContext(fixturesCompiled, {
    exports: fixtures,
    window: { localStorage: mockLocalStorage },
    require: (id) => {
      if (id === "h3-js") return h3;
      if (id === "../types/api") return types;
      return {};
    },
  });

  return { types, buildings, pantryHelpers, hostHelpers, campusMap, fixtures };
}

function loadPantryApi({ fixtureMode = false, fetchImpl }) {
  const types = {};
  runInNewContext(typesCompiled, {
    exports: types,
    require: () => ({}),
  });

  let fixtureCalls = 0;
  const exports = {};
  runInNewContext(pantryApiCompiled, {
    exports,
    process: {
      env: {
        NEXT_PUBLIC_API_URL: "http://example.test",
        NEXT_PUBLIC_UI_FIXTURE_MODE: String(fixtureMode),
      },
    },
    fetch: fetchImpl,
    Headers,
    AbortController,
    setTimeout,
    clearTimeout,
    require: (id) => {
      if (id === "./types/api") return types;
      if (id === "./fixtures/demo-fixtures") {
        return new Proxy(
          {},
          {
            get: () => () => {
              fixtureCalls += 1;
              return {};
            },
          },
        );
      }
      return {};
    },
  });

  return { pantryApi: exports, getFixtureCalls: () => fixtureCalls };
}

function loadApiClient({ fixtureMode = false, fetchImpl }) {
  const types = {};
  runInNewContext(typesCompiled, {
    exports: types,
    require: () => ({}),
  });

  let fixtureCalls = 0;
  const exports = {};
  runInNewContext(apiClientCompiled, {
    exports,
    process: {
      env: {
        NEXT_PUBLIC_API_URL: "http://example.test",
        NEXT_PUBLIC_UI_FIXTURE_MODE: String(fixtureMode),
      },
    },
    fetch: fetchImpl,
    Headers,
    AbortController,
    setTimeout,
    clearTimeout,
    FormData,
    require: (id) => {
      if (id === "./types/api") return types;
      if (id === "./fixtures/demo-fixtures") {
        return new Proxy(
          {},
          {
            get: () => () => {
              fixtureCalls += 1;
              return {};
            },
          },
        );
      }
      return {};
    },
  });

  return { apiClient: exports, getFixtureCalls: () => fixtureCalls };
}

function publishCampusDrop(
  fixtures,
  { servings = 2, buildingCode = "BLDG-A" } = {},
) {
  const draft = fixtures.fixtureCreateDrop("catering pasta trays");
  fixtures.fixtureUpdateDrop(draft.id, {
    servings_final: servings,
    allergens_final: ["dairy", "gluten"],
    diet_tags_final: ["vegetarian"],
    building_code: buildingCode,
    room: "214",
    pickup_instructions: "2nd floor lobby table",
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
}

test("pantry helpers preserve legacy 4-field Counts defaults, verbatim notice, and safe JMW destination links", () => {
  const { types, pantryHelpers, hostHelpers } = loadCoreModules();

  // Narrow additive Counts compatibility: omitting pantry_held / pantry_transferred defaults to 0
  const legacyNormalized = pantryHelpers.normalizeCounts({
    total: 4,
    available: 1,
    held: 1,
    picked_up: 2,
  });
  assert.deepEqual(
    { ...legacyNormalized },
    {
      total: 4,
      available: 1,
      held: 1,
      picked_up: 2,
      pantry_held: 0,
      pantry_transferred: 0,
    },
  );

  // Host counts formatting outputs number-only strings and keeps student vs pantry distinct
  assert.deepEqual(
    {
      ...hostHelpers.formatHostCounts({
        total: 5,
        available: 1,
        held: 1,
        picked_up: 1,
        pantry_held: 1,
        pantry_transferred: 1,
      }),
    },
    {
      available: "1",
      held: "1",
      pickedUp: "1",
      pantryHeld: "1",
      pantryTransferred: "1",
      total: "5",
    },
  );
  assert.deepEqual(
    {
      ...hostHelpers.formatHostCounts({
        total: 2,
        available: 2,
        held: 0,
        picked_up: 0,
      }),
    },
    {
      available: "2",
      held: "0",
      pickedUp: "0",
      pantryHeld: "0",
      pantryTransferred: "0",
      total: "2",
    },
  );

  // Verbatim notice resolution with exact fallback when unloaded
  assert.equal(
    pantryHelpers.resolvePantryNotice("Server verbatim notice text."),
    "Server verbatim notice text.",
  );
  assert.equal(
    pantryHelpers.resolvePantryNotice(null),
    types.PANTRY_DEMO_NOTICE_FALLBACK,
  );
  assert.equal(
    pantryHelpers.resolvePantryNotice("   "),
    types.PANTRY_DEMO_NOTICE_FALLBACK,
  );
  assert.match(types.PANTRY_DEMO_NOTICE_FALLBACK, /Demo only/i);
  assert.match(types.PANTRY_DEMO_NOTICE_FALLBACK, /KSU catering policy/i);

  // Destination room formatting avoids duplicating "Room" when backend sends "Room 184"
  const jmwBuilding = {
    id: "ksu-marietta-joe-mack-wilson-student-center",
    name: "Joe Mack Wilson Student Center",
    building_code: "A",
    building_number: "860",
    category: "student_life",
    latitude: 33.940665,
    longitude: -84.520395,
    verification_status: "verified",
    sources: [],
  };
  assert.equal(
    pantryHelpers.formatPantryDestinationLocation({
      building: jmwBuilding,
      room: "Room 184",
    }),
    "Joe Mack Wilson Student Center, Room 184",
  );
  assert.equal(
    pantryHelpers.formatPantryDestinationLocation({
      building: jmwBuilding,
      room: "184",
    }),
    "Joe Mack Wilson Student Center, Room 184",
  );

  // Safe walking URL: allows destination-only URL and strips/falls back if origin or API key appears
  const validUrl =
    "https://www.google.com/maps/dir/?api=1&destination=33.940665,-84.520395&travelmode=walking";
  assert.equal(
    pantryHelpers.resolvePantryDirectionsUrl({
      name: "KSU CARE Pantry",
      building: jmwBuilding,
      room: "Room 184",
      directions_url: validUrl,
      care_source_url: types.PANTRY_CARE_SOURCE_URL,
      catering_policy_url: types.PANTRY_CATERING_POLICY_URL,
    }),
    validUrl,
  );
  const unsafeOriginUrl =
    "https://www.google.com/maps/dir/?api=1&origin=33.9,-84.5&destination=33.940665,-84.520395&travelmode=walking";
  assert.equal(
    pantryHelpers.resolvePantryDirectionsUrl({
      name: "KSU CARE Pantry",
      building: jmwBuilding,
      room: "Room 184",
      directions_url: unsafeOriginUrl,
      care_source_url: types.PANTRY_CARE_SOURCE_URL,
      catering_policy_url: types.PANTRY_CATERING_POLICY_URL,
    }),
    validUrl,
  );

  // Official links fallback
  assert.deepEqual(
    { ...pantryHelpers.resolvePantryOfficialLinks(null) },
    {
      careSourceUrl: types.PANTRY_CARE_SOURCE_URL,
      cateringPolicyUrl: types.PANTRY_CATERING_POLICY_URL,
    },
  );

  // Coordinator default accept quantity is min(requested, eligible)
  assert.equal(pantryHelpers.computeDefaultCoordinatorAcceptServings(4, 2), 2);
  assert.equal(pantryHelpers.computeDefaultCoordinatorAcceptServings(2, 5), 2);
  assert.equal(pantryHelpers.computeDefaultCoordinatorAcceptServings(3, 0), 0);

  // Host polling guard enables polling only for live/claimed_out campus_feed drops on counts screen
  assert.equal(
    hostHelpers.shouldPollHostPantryReferral(
      { status: "live", distribution_mode: "campus_feed" },
      "counts",
    ),
    true,
  );
  assert.equal(
    hostHelpers.shouldPollHostPantryReferral(
      { status: "claimed_out", distribution_mode: "campus_feed" },
      "counts",
    ),
    true,
  );
  assert.equal(
    hostHelpers.shouldPollHostPantryReferral(
      { status: "live", distribution_mode: "seeded_waves" },
      "counts",
    ),
    false,
  );
  assert.equal(
    hostHelpers.shouldPollHostPantryReferral(
      { status: "expired", distribution_mode: "campus_feed" },
      "counts",
    ),
    false,
  );

  // Safety assertions explicitly remain host assertions (never certified food safety)
  const safety = pantryHelpers.summarizeReviewedSafetyAssertions({
    covered_and_temperature_safe: true,
    served_within_two_hours: true,
    untouched: true,
    ingredient_information_checked: true,
    religious_diets_confirmed: false,
  });
  assert.equal(safety.length, 4);
  for (const item of safety) {
    assert.match(item.label, /host assertion/i);
  }
});

test("host and coordinator UI action guards enforce policy acknowledgment, capacity bounds, and expiry", () => {
  const { pantryHelpers } = loadCoreModules();
  const nowIso = "2026-04-19T12:00:00Z";
  const futureIso = "2026-04-19T12:30:00Z";
  const pastIso = "2026-04-19T11:59:00Z";

  // Host guard: seeded drop disables pantry controls
  const seededHost = pantryHelpers.resolveHostPantryActionState(
    {
      status: "live",
      distribution_mode: "seeded_waves",
      counts: { total: 2, available: 2, held: 0, picked_up: 0 },
      expires_at: futureIso,
    },
    null,
    nowIso,
  );
  assert.equal(seededHost.isCampusFeed, false);
  assert.equal(seededHost.canRequest, false);
  assert.equal(seededHost.canConfirmHandoff, false);

  // Host guard: accepted referral enables confirm handoff, disables request
  const acceptedHost = pantryHelpers.resolveHostPantryActionState(
    {
      status: "claimed_out",
      distribution_mode: "campus_feed",
      counts: {
        total: 2,
        available: 0,
        held: 0,
        picked_up: 1,
        pantry_held: 1,
        pantry_transferred: 0,
      },
      expires_at: futureIso,
    },
    {
      status: "accepted",
      requested_servings: 1,
      accepted_servings: 1,
      transferred_servings: 0,
      eligible_servings: 0,
      expires_at: futureIso,
    },
    nowIso,
  );
  assert.equal(acceptedHost.canRequest, false);
  assert.equal(acceptedHost.canConfirmHandoff, true);

  // Coordinator guard: requires explicit policy acknowledgment and bounds accept quantity
  const requestedReferral = {
    status: "requested",
    requested_servings: 3,
    eligible_servings: 2,
    expires_at: futureIso,
    drop: {
      status: "live",
      expires_at: futureIso,
      counts: { total: 3, available: 2, held: 1, picked_up: 0 },
    },
  };
  const noAck = pantryHelpers.resolveCoordinatorActionGuard(
    requestedReferral,
    2,
    false,
    nowIso,
  );
  assert.equal(noAck.canAccept, false);
  assert.equal(noAck.canReject, false);
  assert.equal(noAck.maxAcceptable, 2);

  const overQty = pantryHelpers.resolveCoordinatorActionGuard(
    requestedReferral,
    3,
    true,
    nowIso,
  );
  assert.equal(overQty.canAccept, false);
  assert.equal(overQty.canReject, true);
  assert.ok(overQty.staleReason);

  const validAck = pantryHelpers.resolveCoordinatorActionGuard(
    requestedReferral,
    2,
    true,
    nowIso,
  );
  assert.equal(validAck.canAccept, true);
  assert.equal(validAck.canReject, true);

  // Expired referral disables both accept and reject
  const expiredGuard = pantryHelpers.resolveCoordinatorActionGuard(
    {
      ...requestedReferral,
      expires_at: pastIso,
      drop: { ...requestedReferral.drop, expires_at: pastIso },
    },
    1,
    true,
    nowIso,
  );
  assert.equal(expiredGuard.isExpired, true);
  assert.equal(expiredGuard.canAccept, false);
  assert.equal(expiredGuard.canReject, false);
});

test("dedicated pantry-api client authenticates exclusively with demo-pantry-coordinator and propagates errors without silent fallback", async () => {
  const seen = [];
  const { pantryApi, getFixtureCalls } = loadPantryApi({
    fixtureMode: false,
    fetchImpl: async (url, init) => {
      const headers = new Headers(init.headers);
      seen.push({
        url,
        method: init.method,
        auth: headers.get("Authorization"),
        body: init.body ? JSON.parse(init.body) : null,
      });

      if (url.endsWith("/pantry/referrals")) {
        return new Response(
          JSON.stringify({
            referrals: [],
            server_time: "2026-04-19T12:00:00Z",
            is_demo: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/ref-conflict/decision")) {
        return new Response(
          JSON.stringify({
            detail: { code: "capacity", message: "0 servings left" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ id: "ref-1", status: "accepted" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const listRes = await pantryApi.getPantryReferrals();
  assert.equal(listRes.source, "live_api");
  assert.deepEqual([...listRes.data.referrals], []);

  await pantryApi.decidePantryReferral("ref-1", {
    decision: "accept",
    servings: 2,
    demo_policy_acknowledged: true,
  });

  await pantryApi.decidePantryReferral("ref-1", {
    decision: "reject",
    servings: 99, // must be stripped on reject
    demo_policy_acknowledged: true,
  });

  await assert.rejects(
    () =>
      pantryApi.decidePantryReferral("ref-conflict", {
        decision: "accept",
        servings: 1,
        demo_policy_acknowledged: true,
      }),
    (err) => err.status === 409 && err.code === "capacity",
  );

  assert.equal(getFixtureCalls(), 0);
  assert.equal(seen.length, 4);
  for (const req of seen) {
    assert.equal(req.auth, "Bearer demo-pantry-coordinator");
  }
  assert.deepEqual(seen[1].body, {
    decision: "accept",
    servings: 2,
    demo_policy_acknowledged: true,
  });
  assert.deepEqual(seen[2].body, {
    decision: "reject",
    demo_policy_acknowledged: true,
  });
  assert.equal("servings" in seen[2].body, false);
});

test("host pantry API client methods hit exact frozen routes with Bearer demo-host and exact contract payloads", async () => {
  const seen = [];
  const { apiClient, getFixtureCalls } = loadApiClient({
    fixtureMode: false,
    fetchImpl: async (url, init) => {
      const headers = new Headers(init.headers);
      seen.push({
        url,
        method: init.method,
        auth: headers.get("Authorization"),
        body: init.body ? JSON.parse(init.body) : null,
      });
      if (url.includes("drop-conflict")) {
        return new Response(
          JSON.stringify({
            detail: { code: "invalid_state", message: "Drop already expired" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await apiClient.getHostPantryReferral("drop-123", "demo-host");
  await apiClient.requestHostPantryReferral(
    "drop-123",
    { servings: 2, demo_policy_acknowledged: true },
    "demo-host",
  );
  await apiClient.confirmHostPantryHandoff(
    "drop-123",
    { demo_handoff_confirmed: true },
    "demo-host",
  );

  await assert.rejects(
    () =>
      apiClient.requestHostPantryReferral(
        "drop-conflict",
        { servings: 1, demo_policy_acknowledged: true },
        "demo-host",
      ),
    (err) => err.status === 409 && err.code === "invalid_state",
  );

  assert.equal(getFixtureCalls(), 0);
  assert.equal(
    seen[0].url,
    "http://example.test/drops/drop-123/pantry-referral",
  );
  assert.equal(seen[0].method, "GET");
  assert.equal(seen[0].auth, "Bearer demo-host");

  assert.equal(
    seen[1].url,
    "http://example.test/drops/drop-123/pantry-referral",
  );
  assert.equal(seen[1].method, "POST");
  assert.deepEqual(seen[1].body, {
    servings: 2,
    demo_policy_acknowledged: true,
  });

  assert.equal(
    seen[2].url,
    "http://example.test/drops/drop-123/pantry-referral/handoff",
  );
  assert.equal(seen[2].method, "POST");
  assert.deepEqual(seen[2].body, { demo_handoff_confirmed: true });
});

test("fixture pantry fallback lifecycle preserves student vs pantry count separation, ACLs, idempotency, and outbox isolation", () => {
  const { fixtures, types } = loadCoreModules();
  fixtures.fixtureDemoReset({ scenario: "visitors" });

  // Publish campus-feed drop with 2 servings
  const drop = publishCampusDrop(fixtures, { servings: 2 });

  // Student reserves 1 serving and completes photo-assisted pickup
  const student = fixtures.fixtureJoinSession({
    nickname: "PantryStu1",
    allergens: [],
    diets: [],
  });
  const claim = fixtures.fixtureReserveDrop(drop.id, student.token);
  const verif = fixtures.fixtureSubmitPickupPhoto(
    claim.id,
    "aaaa1111-1111-4111-8111-111111111111",
    student.token,
    { mimeType: "image/jpeg", byteSize: 2048 },
  );
  fixtures.fixturePickupClaim(claim.id, student.token, {
    verification_id: verif.id,
  });
  assert.equal(fixtures.fixtureGetHostOutboxEvents().length, 1);

  // Before request, GET /drops/{id}/pantry-referral returns referral: null with verified JMW Room 184 destination and verbatim notice
  const initialHostView = fixtures.fixtureGetHostPantryReferral(
    drop.id,
    "demo-host",
  );
  assert.equal(initialHostView.referral, null);
  assert.equal(initialHostView.destination.room, "Room 184");
  assert.equal(
    initialHostView.destination.building.id,
    "ksu-marietta-joe-mack-wilson-student-center",
  );
  assert.equal(initialHostView.destination.building.latitude, 33.940665);
  assert.equal(initialHostView.destination.building.longitude, -84.520395);
  assert.equal(initialHostView.notice, types.PANTRY_DEMO_NOTICE_FALLBACK);

  // Request without policy ack -> 422
  assert.throws(
    () =>
      fixtures.fixtureRequestHostPantryReferral(
        drop.id,
        { servings: 1, demo_policy_acknowledged: false },
        "demo-host",
      ),
    (err) => err.status === 422,
  );

  // Host requests 1 remaining serving -> does NOT reserve stock yet
  const requested = fixtures.fixtureRequestHostPantryReferral(
    drop.id,
    { servings: 1, demo_policy_acknowledged: true },
    "demo-host",
  );
  assert.equal(requested.status, "requested");
  assert.equal(requested.requested_servings, 1);
  assert.equal(requested.accepted_servings, 0);
  assert.equal(requested.eligible_servings, 1);
  assert.deepEqual(
    { ...requested.drop.counts },
    {
      total: 2,
      available: 1,
      held: 0,
      picked_up: 1,
      pantry_held: 0,
      pantry_transferred: 0,
    },
  );

  // Coordinator endpoint rejects non-coordinator roles (403)
  assert.throws(
    () => fixtures.fixtureGetPantryReferrals("demo-projector"),
    (err) => err.status === 403,
  );
  assert.throws(
    () => fixtures.fixtureGetPantryReferrals("demo-host"),
    (err) => err.status === 403,
  );
  assert.throws(
    () => fixtures.fixtureGetPantryReferrals(student.token),
    (err) => err.status === 403,
  );

  // Coordinator lists referral and accepts 1 serving -> moves 1 from available to pantry_held, drop becomes claimed_out
  const coordList = fixtures.fixtureGetPantryReferrals(
    "demo-pantry-coordinator",
  );
  assert.equal(coordList.referrals.length, 1);
  assert.equal(coordList.referrals[0].id, requested.id);

  const accepted = fixtures.fixtureDecidePantryReferral(
    requested.id,
    { decision: "accept", servings: 1, demo_policy_acknowledged: true },
    "demo-pantry-coordinator",
  );
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.accepted_servings, 1);
  assert.equal(accepted.drop.status, "claimed_out");
  assert.deepEqual(
    { ...accepted.drop.counts },
    {
      total: 2,
      available: 0,
      held: 0,
      picked_up: 1,
      pantry_held: 1,
      pantry_transferred: 0,
    },
  );

  // Idempotent accept retry succeeds; contradictory reject returns 409
  const acceptedRetry = fixtures.fixtureDecidePantryReferral(
    requested.id,
    { decision: "accept", servings: 1, demo_policy_acknowledged: true },
    "demo-pantry-coordinator",
  );
  assert.equal(acceptedRetry.status, "accepted");
  assert.throws(
    () =>
      fixtures.fixtureDecidePantryReferral(
        requested.id,
        { decision: "reject", demo_policy_acknowledged: true },
        "demo-pantry-coordinator",
      ),
    (err) => err.status === 409,
  );

  // Host confirms simulated handoff -> moves 1 from pantry_held to pantry_transferred; student picked_up stays 1!
  const confirmed = fixtures.fixtureConfirmHostPantryHandoff(
    drop.id,
    { demo_handoff_confirmed: true },
    "demo-host",
  );
  assert.equal(confirmed.status, "handoff_confirmed");
  assert.equal(confirmed.transferred_servings, 1);
  assert.deepEqual(
    { ...confirmed.drop.counts },
    {
      total: 2,
      available: 0,
      held: 0,
      picked_up: 1,
      pantry_held: 0,
      pantry_transferred: 1,
    },
  );

  // Idempotent handoff retry succeeds
  const confirmedRetry = fixtures.fixtureConfirmHostPantryHandoff(
    drop.id,
    { demo_handoff_confirmed: true },
    "demo-host",
  );
  assert.equal(confirmedRetry.status, "handoff_confirmed");

  // Pantry movement NEVER emits host pickup outbox notifications (still only the 1 student pickup)
  assert.equal(fixtures.fixtureGetHostOutboxEvents().length, 1);

  // After drop deadline passes, handoff_confirmed remains terminal
  fixtures.fixtureDemoTick({ advance_seconds: 3000 });
  const afterExpiry = fixtures.fixtureGetHostPantryReferral(
    drop.id,
    "demo-host",
  );
  assert.equal(afterExpiry.referral.status, "handoff_confirmed");
  assert.equal(afterExpiry.referral.transferred_servings, 1);

  // Demo reset clears all pantry referrals
  fixtures.fixtureDemoReset({ scenario: "visitors" });
  assert.equal(
    fixtures.fixtureGetPantryReferrals("demo-pantry-coordinator").referrals
      .length,
    0,
  );
});

test("fixture pantry fallback handles 10-minute suggestion, capacity race 409, expiry without drop resurrection, and seeded/draft guards", () => {
  const { fixtures } = loadCoreModules();
  fixtures.fixtureDemoReset({ scenario: "visitors" });

  // Draft drop: GET returns referral: null, mutations return 409
  const draft = fixtures.fixtureCreateDrop("wraps");
  const draftGet = fixtures.fixtureGetHostPantryReferral(draft.id, "demo-host");
  assert.equal(draftGet.referral, null);
  assert.throws(
    () =>
      fixtures.fixtureRequestHostPantryReferral(
        draft.id,
        { servings: 1, demo_policy_acknowledged: true },
        "demo-host",
      ),
    (err) => err.status === 409,
  );

  // Publish campus-feed drop with 2 servings (45 min deadline)
  const drop = publishCampusDrop(fixtures, { servings: 2 });

  // Advance 36 minutes (9 minutes remaining <= 10 min threshold) -> suggested materialized automatically
  fixtures.fixtureDemoTick({ advance_seconds: 36 * 60 });
  const hostView = fixtures.fixtureGetHostPantryReferral(drop.id, "demo-host");
  assert.equal(hostView.referral.status, "suggested");
  assert.equal(hostView.referral.eligible_servings, 2);

  // Suggested appears in coordinator list, but coordinator cannot decide before host requests (409)
  const coordList = fixtures.fixtureGetPantryReferrals(
    "demo-pantry-coordinator",
  );
  assert.equal(coordList.referrals.length, 1);
  assert.equal(coordList.referrals[0].status, "suggested");
  assert.throws(
    () =>
      fixtures.fixtureDecidePantryReferral(
        coordList.referrals[0].id,
        { decision: "accept", servings: 1, demo_policy_acknowledged: true },
        "demo-pantry-coordinator",
      ),
    (err) => err.status === 409,
  );

  // Host requests 2 servings; then a student reserves 1 serving before coordinator decides
  const req = fixtures.fixtureRequestHostPantryReferral(
    drop.id,
    { servings: 2, demo_policy_acknowledged: true },
    "demo-host",
  );
  assert.equal(req.status, "requested");

  const stu1 = fixtures.fixtureJoinSession({
    nickname: "RaceStu1",
    allergens: [],
    diets: [],
  });
  fixtures.fixtureReserveDrop(drop.id, stu1.token);

  // Coordinator trying to accept stale quantity 2 gets 409 capacity; accepting remaining 1 succeeds
  assert.throws(
    () =>
      fixtures.fixtureDecidePantryReferral(
        req.id,
        { decision: "accept", servings: 2, demo_policy_acknowledged: true },
        "demo-pantry-coordinator",
      ),
    (err) => err.status === 409 && err.code === "capacity",
  );
  const partialAccepted = fixtures.fixtureDecidePantryReferral(
    req.id,
    { decision: "accept", servings: 1, demo_policy_acknowledged: true },
    "demo-pantry-coordinator",
  );
  assert.equal(partialAccepted.status, "accepted");
  assert.equal(partialAccepted.accepted_servings, 1);
  assert.deepEqual(
    { ...partialAccepted.drop.counts },
    {
      total: 2,
      available: 0,
      held: 1,
      picked_up: 0,
      pantry_held: 1,
      pantry_transferred: 0,
    },
  );

  // Drop passes original deadline without host confirming handoff -> referral expires, pantry_held becomes 0, drop stays expired (never resurrected to live)
  fixtures.fixtureDemoTick({ advance_seconds: 10 * 60 });
  const expiredDrop = fixtures.fixtureGetDrop(drop.id, "demo-host");
  assert.equal(expiredDrop.status, "expired");
  assert.equal(expiredDrop.counts.pantry_held, 0);
  assert.equal(expiredDrop.counts.pantry_transferred, 0);

  const expiredHostView = fixtures.fixtureGetHostPantryReferral(
    drop.id,
    "demo-host",
  );
  assert.equal(expiredHostView.referral.status, "expired");
  assert.equal(expiredHostView.referral.eligible_servings, 0);

  // Confirming handoff on expired referral returns 409
  assert.throws(
    () =>
      fixtures.fixtureConfirmHostPantryHandoff(
        drop.id,
        { demo_handoff_confirmed: true },
        "demo-host",
      ),
    (err) => err.status === 409,
  );

  // Seeded rehearsal drop: GET returns referral: null, request mutation returns 409
  fixtures.fixtureDemoReset({ scenario: "seeded" });
  const seededDraft = fixtures.fixtureCreateDrop("seeded pizza");
  fixtures.fixtureUpdateDrop(seededDraft.id, {
    servings_final: 2,
    allergens_final: ["dairy", "gluten"],
    diet_tags_final: [],
    building_code: "DEMO-ORIGIN",
    room: "100",
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
  const seededDrop = fixtures.fixturePublishDrop(seededDraft.id);
  assert.equal(
    fixtures.fixtureGetHostPantryReferral(seededDrop.id, "demo-host").referral,
    null,
  );
  assert.throws(
    () =>
      fixtures.fixtureRequestHostPantryReferral(
        seededDrop.id,
        { servings: 1, demo_policy_acknowledged: true },
        "demo-host",
      ),
    (err) => err.status === 409,
  );
});

test("projector distribution and campus map model aggregate pantry counts without inflating student collected counts", () => {
  const { fixtures, campusMap } = loadCoreModules();
  fixtures.fixtureDemoReset({ scenario: "visitors" });

  const drop = publishCampusDrop(fixtures, {
    servings: 3,
    buildingCode: "BLDG-A",
  });
  const stu = fixtures.fixtureJoinSession({
    nickname: "DistStu",
    allergens: [],
    diets: [],
  });
  const claim = fixtures.fixtureReserveDrop(drop.id, stu.token);
  const verif = fixtures.fixtureSubmitPickupPhoto(
    claim.id,
    "bbbb1111-1111-4111-8111-111111111111",
    stu.token,
    { mimeType: "image/jpeg", byteSize: 2048 },
  );
  fixtures.fixturePickupClaim(claim.id, stu.token, {
    verification_id: verif.id,
  });

  const req = fixtures.fixtureRequestHostPantryReferral(
    drop.id,
    { servings: 2, demo_policy_acknowledged: true },
    "demo-host",
  );
  fixtures.fixtureDecidePantryReferral(
    req.id,
    { decision: "accept", servings: 1, demo_policy_acknowledged: true },
    "demo-pantry-coordinator",
  );

  const distAccepted = fixtures.fixtureGetDistribution();
  assert.deepEqual(
    { ...distAccepted.counts },
    {
      total: 3,
      available: 1,
      held: 0,
      picked_up: 1,
      pantry_held: 1,
      pantry_transferred: 0,
    },
  );

  fixtures.fixtureConfirmHostPantryHandoff(
    drop.id,
    { demo_handoff_confirmed: true },
    "demo-host",
  );
  const distConfirmed = fixtures.fixtureGetDistribution();
  assert.deepEqual(
    { ...distConfirmed.counts },
    {
      total: 3,
      available: 1,
      held: 0,
      picked_up: 1,
      pantry_held: 0,
      pantry_transferred: 1,
    },
  );

  // Projector map model separates student collected from pantry reserved & pantry transfers
  const mapModel = campusMap.buildProjectorCampusMapModel([
    {
      building_code: "ksu-marietta-joe-mack-wilson-student-center",
      building: {
        id: "ksu-marietta-joe-mack-wilson-student-center",
        name: "Joe Mack Wilson Student Center",
        building_code: "A",
        building_number: "860",
        category: "student_life",
        latitude: 33.940665,
        longitude: -84.520395,
        verification_status: "verified",
        sources: [],
      },
      active_drops: 1,
      available_drops: 1,
      counts: {
        total: 6,
        available: 1,
        held: 1,
        picked_up: 1,
        pantry_held: 1,
        pantry_transferred: 2,
      },
    },
  ]);

  assert.equal(mapModel.totalAvailable, 1);
  assert.equal(mapModel.totalReserved, 1);
  assert.equal(mapModel.totalCollected, 1); // NEVER 3 (pantry transfers kept separate)
  assert.equal(mapModel.totalPantryHeld, 1);
  assert.equal(mapModel.totalPantryTransferred, 2);
  assert.match(
    mapModel.accessibleSummary,
    /1 available, 1 reserved, 1 collected, 1 pantry reserved, 2 pantry transfers/,
  );
});

test("student views contain zero administrative/pantry controls and /pantry remains isolated from projector and /drops/{id}", () => {
  const studentPageSrc = readFileSync(
    new URL("../app/student/page.tsx", import.meta.url),
    "utf8",
  );
  const joinPageSrc = readFileSync(
    new URL("../app/join/page.tsx", import.meta.url),
    "utf8",
  );
  const studentMapSrc = readFileSync(
    new URL("../components/StudentCampusMap.tsx", import.meta.url),
    "utf8",
  );
  const pantryPageSrc = readFileSync(
    new URL("../app/pantry/page.tsx", import.meta.url),
    "utf8",
  );

  for (const src of [studentPageSrc, joinPageSrc, studentMapSrc]) {
    assert.equal(src.includes("pantry-referral"), false);
    assert.equal(src.includes("demo-pantry-coordinator"), false);
    assert.equal(src.includes("HostPantryCard"), false);
    assert.equal(src.includes('href="/pantry"'), false);
    assert.equal(src.includes("pantry_held"), false);
    assert.equal(src.includes("pantry_transferred"), false);
  }

  // /pantry must use isolated pantry-api, never presenter-api / demo-projector / getDrop
  assert.equal(pantryPageSrc.includes("lib/pantry-api"), true);
  assert.equal(pantryPageSrc.includes("presenter-api"), false);
  assert.equal(pantryPageSrc.includes("demo-projector"), false);
  assert.equal(pantryPageSrc.includes("getDrop("), false);
});
