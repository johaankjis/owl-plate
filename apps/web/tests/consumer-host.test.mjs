import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function compile(relativePath) {
  return ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadModules() {
  const types = {};
  runInNewContext(compile("../lib/types/api.ts"), {
    exports: types,
    require: () => ({}),
  });
  const buildings = {};
  runInNewContext(compile("../lib/buildings.ts"), {
    exports: buildings,
    require: (id) => (id === "./types/api" ? types : {}),
  });
  const host = {};
  runInNewContext(compile("../app/host/host-helpers.ts"), {
    exports: host,
    process: { env: {} },
    URL,
    require: (id) => {
      if (id === "../../lib/types/api") return types;
      if (id === "../../lib/buildings") return buildings;
      return {};
    },
  });
  const pantry = {};
  runInNewContext(compile("../lib/pantry-helpers.ts"), {
    exports: pantry,
    URL,
    require: (id) => {
      if (id === "./buildings") return buildings;
      if (id === "./types/api") return types;
      return {};
    },
  });
  return { host, pantry };
}

const HOST_SOURCES = [
  "../app/host/page.tsx",
  "../components/host/HostStepIndicator.tsx",
  "../components/host/HostPhotoStep.tsx",
  "../components/host/HostReviewStep.tsx",
  "../components/host/HostListingDashboard.tsx",
  "../components/host/HostPickupReviewQueue.tsx",
  "../components/host/HostListingsView.tsx",
  "../components/BuildingSelector.tsx",
  "../components/HostPantryCard.tsx",
];
const PANTRY_SOURCES = ["../app/pantry/page.tsx"];

const SAFE = {
  covered_and_temperature_safe: true,
  served_within_two_hours: true,
  untouched: true,
  ingredient_information_checked: false,
  religious_diets_confirmed: false,
};

const verifiedBuilding = {
  id: "ksu-marietta-atrium-building",
  name: "Atrium Building",
  building_code: "J",
  building_number: "860",
  category: "academic",
  latitude: 33.9378,
  longitude: -84.5205,
  verification_status: "verified",
  sources: [{ url: "https://example.test", title: "source" }],
};

test("host wizard helpers clamp servings, map steps, and keep an ended listing on its dashboard", () => {
  const { host } = loadModules();
  assert.equal(host.clampHostServings(0), 1);
  assert.equal(host.clampHostServings(-4), 1);
  assert.equal(host.clampHostServings(501), 500);
  assert.equal(host.clampHostServings(12.9), 12);
  assert.equal(host.clampHostServings(Number.NaN), 1);

  assert.equal(host.hostWizardStepNumber("upload"), 1);
  assert.equal(host.hostWizardStepNumber("review"), 2);
  assert.equal(host.hostWizardStepNumber("counts"), 3);
  assert.deepEqual(
    [...host.HOST_WIZARD_STEPS.map((s) => s.label)],
    ["Photo", "Review", "Publish"],
  );

  assert.equal(
    host.resolveHostStepAfterRefresh("counts", { status: "expired" }),
    "counts",
  );
  assert.equal(
    host.resolveHostStepAfterRefresh("review", { status: "expired" }),
    "upload",
  );
  assert.equal(
    host.resolveHostStepAfterRefresh("counts", { status: "live" }),
    "counts",
  );
  assert.equal(host.resolveHostStepAfterRefresh("upload", null), "upload");
});

test("rehearsal origin is opt-in through ?rehearsal=1 only", () => {
  const { host } = loadModules();
  assert.equal(host.isHostRehearsalView("1"), true);
  assert.equal(host.isHostRehearsalView("true"), true);
  assert.equal(host.isHostRehearsalView(null), false);
  assert.equal(host.isHostRehearsalView(""), false);
  assert.equal(host.isHostRehearsalView("0"), false);

  const page = read("../app/host/page.tsx");
  assert.match(page, /searchParams\.get\("rehearsal"\)/);
  assert.match(
    page,
    /const rehearsalOptions = rehearsal \? HOST_REHEARSAL_OPTIONS : \[\];/,
  );
  assert.equal(page.includes('"DEMO-ORIGIN"'), false);
  const selector = read("../components/BuildingSelector.tsx");
  assert.match(selector, /rehearsalOptions\.length > 0 &&/);
  assert.equal(selector.includes("allowCustomRehearsalCode"), false);
});

test("listing helpers summarize, partition, and pick the newest open listing", () => {
  const { host } = loadModules();
  assert.equal(
    host.summarizeHostListing({
      vision: { items: [{ name: "Pizza" }, { name: "Salad" }] },
    }),
    "Pizza & Salad",
  );
  assert.equal(
    host.summarizeHostListing({
      vision: {
        items: [{ name: "Pizza" }, { name: "Salad" }, { name: "Cookies" }],
      },
    }),
    "Pizza, Salad +1 more",
  );
  assert.equal(
    host.summarizeHostListing({ vision: { items: [] } }),
    "Shared food",
  );

  const drops = [
    { id: "d1", status: "expired" },
    { id: "d2", status: "draft" },
    { id: "d3", status: "live" },
    { id: "d4", status: "claimed_out" },
  ];
  const { active, past } = host.partitionHostDrops(drops);
  assert.deepEqual([...active.map((d) => d.id)], ["d2", "d3", "d4"]);
  assert.deepEqual([...past.map((d) => d.id)], ["d1"]);
  assert.equal(host.pickActiveHostDropId(drops), "d2");
  assert.equal(
    host.pickActiveHostDropId([{ id: "x", status: "expired" }]),
    null,
  );
  assert.equal(host.pickActiveHostDropId([]), null);

  assert.equal(host.resolveHostListingAction({ status: "draft" }), "resume");
  assert.equal(host.resolveHostListingAction({ status: "live" }), "manage");
  assert.equal(
    host.resolveHostListingAction({ status: "claimed_out" }),
    "manage",
  );
  assert.equal(host.resolveHostListingAction({ status: "expired" }), null);

  assert.equal(host.formatHostStatusLabel("claimed_out"), "All reserved");
  assert.equal(host.formatHostStatusLabel("expired"), "Ended");
  assert.equal(host.hostStatusTone("live"), "success");
});

test("safety review needs the three checks and only sends conditional confirmations while required", () => {
  const { host } = loadModules();
  const estimated = ["dairy", "gluten"];
  const unchecked = { ...SAFE, untouched: false };
  assert.equal(
    host.canPublishHostReview(unchecked, estimated, estimated, []),
    false,
  );
  assert.equal(host.canPublishHostReview(SAFE, estimated, estimated, []), true);

  // Removing an AI-flagged allergen requires the ingredient confirmation.
  assert.equal(
    host.canPublishHostReview(SAFE, estimated, ["dairy"], []),
    false,
  );
  assert.equal(
    host.canPublishHostReview(
      { ...SAFE, ingredient_information_checked: true },
      estimated,
      ["dairy"],
      [],
    ),
    true,
  );

  // Religious tags require the religious diet confirmation.
  for (const diet of ["halal", "kosher", "pork_free"]) {
    assert.equal(
      host.canPublishHostReview(SAFE, estimated, estimated, [diet]),
      false,
      diet,
    );
    assert.equal(
      host.canPublishHostReview(
        { ...SAFE, religious_diets_confirmed: true },
        estimated,
        estimated,
        [diet],
      ),
      true,
      diet,
    );
  }
  assert.equal(
    host.canPublishHostReview(SAFE, estimated, estimated, ["vegetarian"]),
    true,
  );

  // A stale confirmation is dropped once it is no longer required.
  const built = host.buildHostSafetyReview(
    {
      ...SAFE,
      ingredient_information_checked: true,
      religious_diets_confirmed: true,
    },
    estimated,
    estimated,
    ["vegan"],
  );
  assert.equal(built.ingredient_information_checked, false);
  assert.equal(built.religious_diets_confirmed, false);
  assert.deepEqual(
    [...host.removedEstimatedAllergens(estimated, ["gluten", "soy"])],
    ["dairy"],
  );
  assert.deepEqual(
    [...host.selectedReligiousDiets(["vegan", "kosher"])],
    ["kosher"],
  );
  assert.deepEqual([...host.toggleTag(["a"], "b")], ["a", "b"]);
  assert.deepEqual([...host.toggleTag(["a", "b"], "a")], ["b"]);
});

test("review form seeds from a draft and moves off the rehearsal placeholder when campus buildings exist", () => {
  const { host } = loadModules();
  const draft = {
    servings_final: 900,
    allergens_final: ["dairy"],
    diet_tags_final: ["vegan"],
    building_code: "DEMO-ORIGIN",
    room: "",
    pickup_instructions: "",
    safety_review: null,
  };
  const form = host.initialHostReviewForm(draft, [verifiedBuilding]);
  assert.equal(form.servings, 500);
  assert.equal(form.buildingId, verifiedBuilding.id);
  assert.equal(form.expiresInMinutes, host.HOST_DEFAULT_EXPIRY_MINUTES);
  assert.equal(form.safety.covered_and_temperature_safe, false);
  assert.deepEqual([...form.allergens], ["dairy"]);
  form.allergens.push("egg");
  assert.deepEqual(draft.allergens_final, ["dairy"]);
  assert.equal(
    host.initialHostReviewForm(draft, [], 999).expiresInMinutes,
    host.HOST_DEFAULT_EXPIRY_MINUTES,
  );
  for (const minutes of host.HOST_EXPIRY_OPTIONS) {
    assert.ok(minutes >= 1 && minutes <= 120);
  }
});

test("host review queue labels avoid provider names and pickup photos are never rendered for hosts", () => {
  const { host } = loadModules();
  assert.equal(
    host.formatHostReviewSourceLabel("openrouter"),
    "Photo assessment",
  );
  assert.equal(
    host.formatHostReviewSourceLabel("fixture"),
    "Sample assessment",
  );
  const queue = read("../components/host/HostPickupReviewQueue.tsx");
  assert.match(queue, /Approve pickup/);
  assert.match(queue, /Ask to retake/);
  assert.equal(
    /<img|DropPhoto|nickname|student_id|claim_id/.test(queue),
    false,
  );
});

test("photo step previews locally, revokes object URLs, and shows the privacy cue at capture", () => {
  const { host } = loadModules();
  assert.equal(
    host.HOST_PHOTO_PRIVACY_NOTICE,
    "Snap food trays only — avoid capturing faces or people. Photos are automatically deleted when the drop expires (max 24 hours).",
  );
  const hook = read("../components/host/useObjectUrl.ts");
  assert.match(hook, /URL\.createObjectURL\(file\)/);
  assert.match(hook, /return \(\) => URL\.revokeObjectURL\(next\);/);
  assert.match(hook, /\}, \[file\]\);/);
  const step = read("../components/host/HostPhotoStep.tsx");
  assert.match(step, /accept="image\/jpeg,image\/png"/);
  assert.match(step, /useObjectUrl\(selectedFile\)/);
  assert.match(step, /HOST_PHOTO_PRIVACY_NOTICE/);
});

test("published listing dashboard keeps student and pantry counts apart and uses the authenticated listing photo", () => {
  const dashboard = read("../components/host/HostListingDashboard.tsx");
  for (const id of [
    "host-count-available",
    "host-count-held",
    "host-count-picked-up",
    "host-count-pantry-held",
    "host-count-pantry-transferred",
    "host-count-total",
    "host-drop-status",
    "host-drop-location",
    "host-countdown",
    "share-another-drop-button",
    "open-pickup-companion",
  ]) {
    assert.ok(dashboard.includes(`"${id}"`), id);
  }
  assert.match(dashboard, /<DropPhoto/);
  assert.match(dashboard, /<PushOptIn/);
  assert.match(dashboard, /<HostPantryCard/);
  assert.match(dashboard, /Pantry \(simulated\)/);
  assert.equal(/nickname|student_id|claim_id/.test(dashboard), false);
});

test("host and pantry screens carry no developer jargon, raw IDs, coordinates or emoji", () => {
  const banned = [
    /OpenRouter/i,
    /Gemini/i,
    /live_api/,
    /offline_fixture/,
    /DemoHeader/,
    /sourceMode/,
    /\bH3\b/,
    /h3_cell/,
    /\.latitude|\.longitude/,
    /font-mono/,
    /building_number/,
    /formatBuildingMetaBadge/,
    /demo-projector/,
    /\/dispatch/,
  ];
  for (const path of [...HOST_SOURCES, ...PANTRY_SOURCES]) {
    const src = read(path);
    for (const pattern of banned) {
      assert.equal(pattern.test(src), false, `${path} matches ${pattern}`);
    }
    assert.equal(
      /\p{Extended_Pictographic}/u.test(src),
      false,
      `${path} contains an emoji`,
    );
  }
  const page = read("../app/host/page.tsx");
  assert.match(page, /<AppShell variant="host"/);
  assert.match(page, /getHostDrops\(HOST_CREDENTIAL\)/);
  assert.equal(page.includes("getActiveDrop"), false);
});

test("pantry coordinator keeps every policy disclosure and unchecked acknowledgment at the point of action", () => {
  const page = read("../app/pantry/page.tsx");
  assert.match(page, /<AppShell variant="pantry"/);
  assert.match(page, /resolvePantryNotice\(referral\.notice\)/);
  assert.equal(page.includes("pantry-demo-banner"), false);
  assert.match(page, /pantry-policy-ack-/);
  assert.match(page, /useState<boolean>\(false\)/);
  assert.match(page, /demo simulation only/);
  assert.match(page, /does not waive KSU catering policy/);
  assert.match(page, /referral\.destination\.care_source_url/);
  assert.equal(
    page.match(/referral\.destination\.catering_policy_url/g)?.length,
    1,
    "exactly one catering policy link per card",
  );
  assert.match(page, /authToken=\{PANTRY_COORDINATOR_CREDENTIAL\}/);
  assert.match(page, /buildWalkingDirectionsUrl\(referral\.drop\.building\)/);
  assert.match(page, /Accepted servings|buildPantryInventoryTiles/);

  const card = read("../components/HostPantryCard.tsx");
  assert.match(card, /host-pantry-policy-checkbox/);
  assert.match(card, /host-pantry-handoff-checkbox/);
  assert.match(card, /useState<boolean>\(false\)/);
  assert.match(card, /simulation only/);
  assert.match(card, /not an independently verified physical transfer/);
  assert.match(card, /officialLinks\.careSourceUrl/);
  assert.equal(card.match(/officialLinks\.cateringPolicyUrl/g)?.length, 1);
  assert.match(card, /Open demo pantry coordinator/);
});

test("pantry inventory tiles separate student counts, current pantry stock and historical acceptance", () => {
  const { pantry } = loadModules();
  const tiles = pantry.buildPantryInventoryTiles(
    {
      total: 10,
      available: 3,
      held: 2,
      picked_up: 1,
      pantry_held: 0,
      pantry_transferred: 4,
    },
    4,
  );
  const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
  assert.equal(byKey.available.value, 3);
  assert.equal(byKey.held.value, 2);
  assert.equal(byKey.picked_up.value, 1);
  assert.equal(byKey.pantry_held.value, 0);
  assert.equal(byKey.accepted.value, 4);
  assert.equal(byKey.accepted.label, "Accepted servings");
  assert.equal(byKey.pantry_transferred.value, 4);
  assert.equal(byKey.picked_up.group, "student");
  assert.equal(byKey.pantry_transferred.group, "pantry");
  // The inventory invariant holds over the current (non-historical) tiles.
  assert.equal(
    byKey.available.value +
      byKey.held.value +
      byKey.picked_up.value +
      byKey.pantry_held.value +
      byKey.pantry_transferred.value,
    10,
  );
  const legacy = pantry.buildPantryInventoryTiles(
    { total: 2, available: 2, held: 0, picked_up: 0 },
    Number.NaN,
  );
  assert.equal(legacy.find((t) => t.key === "pantry_held").value, 0);
  assert.equal(legacy.find((t) => t.key === "accepted").value, 0);
  assert.equal(
    pantry.summarizePantryFood({ vision: { items: [{ name: "Wraps" }] } }),
    "Wraps",
  );
});
