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
  // The coordinator strip keeps the same split under explicit group headings.
  assert.match(pageSource, /pantry_held: "Reserved now"/);
  assert.match(pageSource, /accepted: "Accepted \(total\)"/);
  assert.match(pageSource, /title: "Students"/);
  assert.match(pageSource, /title: "Pantry \(simulated\)"/);
});

test("pantry transfers carry exactly one simulation qualifier and never merge with student counts", () => {
  assert.equal(
    (hostCardSource.match(/Pantry transfers \(simulated\)/g) ?? []).length,
    1,
  );
  assert.equal(
    /Simulated[\s\S]{0,40}\(simulated\)/.test(hostCardSource),
    false,
  );
  // No expression adds student and pantry counts together on either screen.
  for (const src of [pageSource, hostCardSource]) {
    assert.equal(
      /(picked_up|held)\s*\+\s*[\w.?]*pantry_|pantry_\w+\s*\+\s*[\w.?]*(picked_up|held)\b/.test(
        src,
      ),
      false,
    );
  }
});

test("host card drops the header simulation badge and demo wording outside the confirmation dialogs", () => {
  assert.equal(hostCardSource.includes("host-pantry-demo-badge"), false);
  assert.equal(hostCardSource.includes("(demo destination)"), false);
  assert.equal(hostCardSource.includes("Open demo pantry coordinator"), false);
  assert.match(
    hostCardSource,
    /data-testid="open-demo-pantry-coordinator"[\s\S]{0,200}View pantry/,
  );
  // Everything before the first dialog trigger is free of the removed badge copy.
  const beforeDialogs = hostCardSource.slice(
    hostCardSource.indexOf("<section"),
    hostCardSource.indexOf("<ConfirmDialog"),
  );
  assert.equal(/Simulation only/.test(beforeDialogs), false);
});

test("expired or deleted photos fall back to a labelled illustration, never a blank or fake photo", () => {
  const dropPhoto = read("../components/ui/DropPhoto.tsx");
  const illustration = read("../components/ui/FoodCategoryIllustration.tsx");
  // Optional prop: screens that do not pass it keep the existing placeholder.
  assert.match(dropPhoto, /fallback\?: ReactNode/);
  assert.match(dropPhoto, /\) : fallback \? \(\s+fallback\s+\) : \(/);
  assert.match(dropPhoto, /No photo/);
  // The illustration is always captioned and announced as not a photo.
  assert.match(illustration, />\s*Illustration\s*</);
  assert.match(illustration, /Illustration, not a photo of this food/);
  assert.equal(
    /<img|getDropPhotoBlob|\.jpe?g|\.png|\.webp/.test(illustration),
    false,
  );
  assert.match(
    pageSource,
    /authToken=\{PANTRY_COORDINATOR_CREDENTIAL\}[\s\S]*?fallback=\{\s*<FoodCategoryIllustration/,
  );
  assert.equal(pageSource.includes("No photo"), false);

  const kinds = {};
  runInNewContext(compile("../lib/food-illustration.ts"), {
    exports: kinds,
    require: () => ({}),
  });
  assert.equal(kinds.resolveFoodIllustrationKind("Pizza"), "pizza");
  assert.equal(
    kinds.resolveFoodIllustrationKind("Sandwiches & wraps"),
    "sandwich",
  );
  assert.equal(kinds.resolveFoodIllustrationKind("Salads & bowls"), "salad");
  assert.equal(kinds.resolveFoodIllustrationKind("Snacks & sides"), "snack");
  assert.equal(kinds.resolveFoodIllustrationKind("Other"), "other");
  assert.equal(kinds.resolveFoodIllustrationKind(null, "", "  "), "other");
  assert.equal(
    kinds.resolveFoodIllustrationKind("Other", "veggie wraps"),
    "sandwich",
  );
  assert.equal(kinds.FOOD_ILLUSTRATION_LABELS.other, "Shared food");
});

test("completed referrals render compactly while keeping every disclosure reachable", () => {
  assert.match(
    pageSource,
    /COMPACT_STATUSES[\s\S]{0,120}"handoff_confirmed",\s+"rejected",\s+"expired"/,
  );
  const card = pageSource.slice(
    pageSource.indexOf("function CoordinatorReferralCard"),
    pageSource.indexOf("function CoordinatorSectionList"),
  );
  assert.match(card, /data-layout=\{compact \? "compact" : "full"\}/);
  assert.match(card, /aspect=\{compact \? "square" : "4\/3"\}/);
  // Compact rows fold details away instead of dropping them.
  assert.match(
    card,
    /pantry-referral-details-toggle-\$\{referral\.id\}[\s\S]*?\{locationFacts\}\s+\{disclosures\}/,
  );
  // Only requested referrals can ever reach the action branch.
  assert.equal(
    (card.match(/referral\.status === "requested" \? \(/g) ?? []).length,
    1,
  );
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

test("coordinator card puts policy disclosure in confirmation dialog, keeps allergens concise, and makes safety assertions expandable", () => {
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
  // Policy notice lives inside ConfirmDialog at the point of action, not inline on read-only cards.
  assert.match(
    actionBranch,
    /<ConfirmDialog[\s\S]*?<PolicyNotice referral=\{referral\} \/>/,
  );
  assert.equal(
    (actionBranch.match(/<PolicyNotice referral=\{referral\} \/>/g) ?? [])
      .length,
    1,
  );
  assert.equal(
    (readOnlyBranch.match(/<PolicyNotice referral=\{referral\} \/>/g) ?? [])
      .length,
    0,
  );
  assert.match(card, /useState<boolean>\(false\)/);
  assert.match(card, /disabled=\{busyKey !== null \|\| !guard\.canAccept\}/);
  assert.match(card, /does\s+not waive KSU catering policy/);
  assert.match(card, /simulation only/);
  // Concise listing-specific allergen strip replaces the verbose AllergenCard.
  assert.equal(card.includes("AllergenCard"), false);
  assert.match(card, /allergen-display-box/);
  assert.match(card, /pantry-referral-allergens-\$\{referral\.id\}/);
  assert.match(card, /ALLERGEN_WARNING_TEXT/);
  // Host safety assertions live in a compact expandable details/summary block.
  assert.match(
    card,
    /<details[\s\S]*?<summary[\s\S]*?pantry-referral-safety-toggle-\$\{referral\.id\}/,
  );
  assert.match(card, /Host assertions \(not certified\)/);
  assert.match(card, /pantry-referral-safety-\$\{referral\.id\}/);
  // Real host photo via Bearer-authenticated DropPhoto and shared motion classes.
  assert.match(card, /authToken=\{PANTRY_COORDINATOR_CREDENTIAL\}/);
  assert.match(card, /OWL_MOTION_CLASSES\.entrance/);
  assert.match(card, /entranceDelayMs\(index\)/);
  assert.match(pageSource, /pantry-simulation-badge/);
  assert.match(pageSource, /Simulation only/);
  assert.equal(types.PANTRY_COORDINATOR_CREDENTIAL, "demo-pantry-coordinator");
});

test("existing harness test ids survive the cleanup", () => {
  for (const id of [
    "pantry-coordinator-page",
    "pantry-simulation-badge",
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
    "pantry-referral-safety-toggle-${referral.id}",
    "pantry-referral-safety-${referral.id}",
    "pantry-referral-allergens-${referral.id}",
    "pantry-referral-state-note-${referral.id}",
    "pantry-decision-dialog-${referral.id}",
    "pantry-open-accept-dialog-${referral.id}",
    "pantry-open-reject-dialog-${referral.id}",
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
    "host-pantry-request-dialog",
    "host-pantry-handoff-dialog",
    "host-pantry-open-request-dialog",
    "host-pantry-open-handoff-dialog",
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

test("host card moves policy notice into request and handoff confirmation dialogs", () => {
  assert.equal((hostCardSource.match(/\{policyNotice\}/g) ?? []).length, 2);
  assert.equal(hostCardSource.includes("{!hasAction && policyNotice}"), false);
  assert.match(
    hostCardSource,
    /testId="host-pantry-request-dialog"[\s\S]*?\{policyNotice\}/,
  );
  assert.match(
    hostCardSource,
    /testId="host-pantry-handoff-dialog"[\s\S]*?\{policyNotice\}/,
  );
  assert.match(
    hostCardSource,
    /useState<boolean>\(false\);\s+const \[handoffConfirmed, setHandoffConfirmed\] =\s+useState<boolean>\(false\)/,
  );
  // The mandatory simulation wording stays in both dialogs' acknowledgments.
  assert.match(
    hostCardSource,
    /host-pantry-policy-checkbox[\s\S]*?<strong>simulation only<\/strong>[\s\S]*?does\{" "\}\s+<strong>not<\/strong> waive KSU catering policy/,
  );
  assert.match(
    hostCardSource,
    /disabled=\{\s+busyAction !== null \|\|\s+!policyAcknowledged \|\|/,
  );
  assert.match(
    hostCardSource,
    /disabled=\{busyAction !== null \|\| !handoffConfirmed\}/,
  );
  assert.match(hostCardSource, /Confirm simulated handoff/);
  assert.match(hostCardSource, /not an independently verified physical/);
});
