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

function loadPantryHelpers() {
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
  const helpers = {};
  runInNewContext(compile("../lib/pantry-helpers.ts"), {
    exports: helpers,
    URL,
    require: (id) => {
      if (id === "./buildings") return buildings;
      if (id === "./types/api") return types;
      return {};
    },
  });
  return { helpers, types };
}

const { helpers, types } = loadPantryHelpers();
const pageSource = read("../app/pantry/page.tsx");
const hostCardSource = read("../components/HostPantryCard.tsx");

function vision(items, notes = "") {
  return {
    vision: {
      items,
      servings_estimate: 1,
      servings_low: 1,
      servings_high: 1,
      allergens_likely: [],
      diet_tags: [],
      confidence: 0.8,
      notes,
    },
  };
}

function referral(id, status) {
  return { id, status };
}

test("listing descriptions show food and portions, never provider or fixture wording", () => {
  const described = helpers.describePantryListing(
    vision(
      [
        { name: "cheese pizza", portion_unit: "slice", count_estimate: 24 },
        { name: "salad", portion_unit: "bowls", count_estimate: 1 },
      ],
      "One tray is vegetarian",
    ),
  );
  assert.equal(
    described,
    "cheese pizza (about 24 slices), salad (about 1 bowls). One tray is vegetarian",
  );
  for (const note of [
    "SIMULATED cached estimate for rehearsal; not an analysis of this uploaded photo.",
    "Simulated fixture estimate",
    "fixture",
    "demo",
  ]) {
    const text = helpers.describePantryListing(
      vision(
        [{ name: "bagels", portion_unit: "bagel", count_estimate: 1 }],
        note,
      ),
    );
    assert.equal(text, "bagels (about 1 bagel)");
  }
  assert.equal(helpers.describePantryListing(vision([])), "Shared food");
  assert.equal(
    helpers.describePantryListing(
      vision([{ name: "wraps", portion_unit: "", count_estimate: 0 }]),
    ),
    "wraps",
  );
});

test("coordinator queue groups into incoming, accepted and completed", () => {
  const sections = helpers.groupCoordinatorReferrals([
    referral("a", "suggested"),
    referral("b", "requested"),
    referral("c", "accepted"),
    referral("d", "handoff_confirmed"),
    referral("e", "rejected"),
    referral("f", "expired"),
    referral("g", "requested"),
  ]);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        sections.map((s) => [s.key, s.title, s.referrals.map((r) => r.id)]),
      ),
    ),
    [
      ["incoming", "Incoming", ["b", "g", "a"]],
      ["accepted", "Accepted", ["c"]],
      ["completed", "Completed", ["d", "e", "f"]],
    ],
  );
  const empty = helpers.groupCoordinatorReferrals([]);
  assert.equal(empty.length, 3);
  for (const section of empty) {
    assert.equal(section.referrals.length, 0);
    assert.ok(section.emptyText.length > 0);
  }
});

test("status labels are concise and keep the simulated handoff explicit", () => {
  const labels = [
    "suggested",
    "requested",
    "accepted",
    "handoff_confirmed",
    "rejected",
    "expired",
    null,
  ].map((status) => helpers.formatPantryStatusLabel(status));
  assert.deepEqual(labels, [
    "Suggested",
    "Requested",
    "Accepted",
    "Handed off (simulated)",
    "Declined",
    "Expired",
    "Not requested",
  ]);
  for (const label of labels) assert.ok(label.length <= 24, label);
});

test("historical accepted servings stay separate from current pantry stock", () => {
  const tiles = helpers.buildPantryInventoryTiles(
    {
      total: 3,
      available: 0,
      held: 0,
      picked_up: 2,
      pantry_held: 0,
      pantry_transferred: 1,
    },
    1,
  );
  const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
  assert.equal(byKey.accepted.value, 1);
  assert.equal(byKey.accepted.label, "Accepted servings");
  assert.equal(byKey.pantry_held.value, 0);
  assert.equal(byKey.pantry_held.label, "Pantry reserved");
  assert.equal(byKey.picked_up.value, 2);
  assert.equal(byKey.pantry_transferred.value, 1);
  assert.match(hostCardSource, /Accepted \(total\)/);
  assert.match(hostCardSource, /Pantry reserved now/);
  assert.match(hostCardSource, /host-pantry-reserved-servings/);
});

test("pantry portal drops repeated banners and developer copy", () => {
  for (const removed of [
    "pantry-page-notice",
    "pantry-page-care-link",
    "pantry-page-catering-link",
    "pantry-demo-banner",
    "resolvePantryOfficialLinks",
  ]) {
    assert.ok(!pageSource.includes(removed), removed);
  }
  const visibleText = pageSource
    .replace(/\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  for (const jargon of [
    /\bAPI\b/,
    /\bprovider\b/i,
    /\bfixture\b/i,
    /\bendpoint\b/i,
    /\/join\b/,
    /Join the demo/i,
    /\bdeveloper\b/i,
  ]) {
    assert.ok(!jargon.test(visibleText), String(jargon));
  }
});

test("each coordinator card keeps one policy notice with official links and an unchecked acknowledgment", () => {
  const noticeComponent = pageSource.slice(
    pageSource.indexOf("function PolicyNotice"),
    pageSource.indexOf("function CoordinatorReferralCard"),
  );
  assert.match(noticeComponent, /resolvePantryNotice\(referral\.notice\)/);
  assert.match(noticeComponent, /referral\.destination\.care_source_url/);
  assert.match(noticeComponent, /referral\.destination\.catering_policy_url/);
  assert.match(noticeComponent, /pantry-referral-notice-\$\{referral\.id\}/);
  const card = pageSource.slice(
    pageSource.indexOf("function CoordinatorReferralCard"),
    pageSource.indexOf("function CoordinatorSectionList"),
  );
  const decision = card.slice(
    card.indexOf('{referral.status === "requested" ? ('),
  );
  const [actionBranch, readOnlyBranch] = decision.split("      ) : (");
  assert.equal(
    (actionBranch.match(/<PolicyNotice referral=\{referral\} \/>/g) ?? [])
      .length,
    1,
  );
  assert.equal(
    (readOnlyBranch.match(/<PolicyNotice referral=\{referral\} \/>/g) ?? [])
      .length,
    1,
  );
  assert.match(card, /useState<boolean>\(false\)/);
  assert.match(card, /disabled=\{busyKey !== null \|\| !guard\.canAccept\}/);
  assert.match(card, /does not waive KSU catering policy/);
  assert.match(card, /simulation only/);
  assert.match(card, /AllergenCard/);
  assert.match(card, /Host assertions \(not certified\)/);
  assert.match(card, /authToken=\{PANTRY_COORDINATOR_CREDENTIAL\}/);
  assert.equal(types.PANTRY_COORDINATOR_CREDENTIAL, "demo-pantry-coordinator");
});

test("existing harness test ids survive the cleanup", () => {
  for (const id of [
    "pantry-coordinator-page",
    "pantry-empty-state",
    "pantry-referrals-list",
    "pantry-refresh-button",
    "pantry-status-message",
    "pantry-error",
    "pantry-referral-card-${referral.id}",
    "pantry-referral-status-${referral.id}",
    "pantry-referral-food-${referral.id}",
    "pantry-referral-requested-${referral.id}",
    "pantry-referral-eligible-${referral.id}",
    "pantry-referral-deadline-${referral.id}",
    "pantry-referral-pickup-${referral.id}",
    "pantry-referral-destination-${referral.id}",
    "pantry-referral-counts-${referral.id}",
    "pantry-referral-safety-${referral.id}",
    "pantry-referral-state-note-${referral.id}",
    "pantry-policy-ack-${referral.id}",
    "pantry-accept-button-${referral.id}",
    "pantry-reject-button-${referral.id}",
    "pantry-accept-servings-${referral.id}",
    "pantry-referral-photo-${referral.id}",
  ]) {
    assert.ok(pageSource.includes(id), id);
  }
  for (const id of [
    "host-pantry-card",
    "host-pantry-status",
    "host-pantry-eligible",
    "host-pantry-notice",
    "host-pantry-care-link",
    "host-pantry-catering-link",
    "host-pantry-policy-checkbox",
    "host-pantry-request-button",
    "host-pantry-handoff-checkbox",
    "host-pantry-handoff-button",
    "host-pantry-servings-input",
    "host-pantry-accepted-servings",
    "host-pantry-transferred-servings",
    "open-demo-pantry-coordinator",
  ]) {
    assert.ok(hostCardSource.includes(id), id);
  }
});

test("host card shows exactly one notice beside the next confirmation", () => {
  assert.equal((hostCardSource.match(/\{policyNotice\}/g) ?? []).length, 2);
  assert.match(hostCardSource, /\{!hasAction && policyNotice\}/);
  assert.match(
    hostCardSource,
    /useState<boolean>\(false\);\s+const \[handoffConfirmed, setHandoffConfirmed\] =\s+useState<boolean>\(false\)/,
  );
  assert.match(hostCardSource, /Confirm simulated handoff/);
  assert.match(hostCardSource, /not an independently verified physical/);
});
