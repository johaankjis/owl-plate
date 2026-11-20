import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function compileTsx(relativePath) {
  return ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
}

function loadAdminPickupSection() {
  const statusBadge = {};
  runInNewContext(compileTsx("../components/ui/StatusBadge.tsx"), {
    exports: statusBadge,
    React,
    require: (id) => (id === "react" ? React : {}),
  });

  const lucideStub = new Proxy(
    {},
    {
      get: (_target, prop) => {
        return function IconStub(props) {
          return React.createElement("svg", {
            "data-icon": String(prop),
            ...props,
          });
        };
      },
    },
  );

  const mod = {};
  runInNewContext(
    compileTsx("../components/admin/PickupDisplayStatusSection.tsx"),
    {
      exports: mod,
      React,
      process: { env: {} },
      URL,
      require: (id) => {
        if (id === "react") return React;
        if (id === "lucide-react") return lucideStub;
        if (id === "../ui/StatusBadge") return statusBadge;
        return {};
      },
    },
  );
  return mod;
}

function extractVisibleText(html) {
  const withoutBlocks = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  const ariaLabels = [...withoutBlocks.matchAll(/aria-label="([^"]*)"/gi)].map(
    (m) => m[1],
  );
  const textOnly = withoutBlocks
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${textOnly} ${ariaLabels.join(" ")}`.trim();
}

function extractInlineScript(html) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, "expected one inline <script> block in whats-left.html");
  return match[1];
}

const OFFICIAL_KSU_URLS = [
  "https://campus.kennesaw.edu/current-students/student-affairs/wellbeing/care-services/",
  "https://campus.kennesaw.edu/offices-services/catering/policies.php",
];

test("whats-left.html binds all required STATE_CONTRACT keys and display labels", () => {
  const html = read("../../../prototypes/itcan/whats-left.html");

  for (const key of [
    "food_name",
    "location",
    "status_label",
    "total",
    "available",
    "held",
    "picked_up",
    "pantry_held",
    "pantry_transferred",
    "checked_at",
    "answer",
    "error",
  ]) {
    assert.ok(
      html.includes(`data-it-bind="${key}"`),
      `missing data-it-bind="${key}"`,
    );
  }
  assert.ok(
    html.includes('data-it-show="error"'),
    "missing data-it-show=error",
  );

  const visible = extractVisibleText(html);
  for (const label of [
    "Total servings",
    "Available",
    "Student reservations",
    "Completed pickups",
    "Pantry reserved",
    "Pantry transfers (simulated)",
    "What's left?",
    "Updated",
    "Demo",
    "Demo only · not a KSU CARE or catering approval",
  ]) {
    assert.ok(visible.includes(label), `missing visible label: ${label}`);
  }
  assert.match(html, /aria-live="polite"/);
});

test("whats-left.html omits banned developer wording, allergens, and student data from visible copy", () => {
  const html = read("../../../prototypes/itcan/whats-left.html");
  const visible = extractVisibleText(html);
  const script = extractInlineScript(html);
  const scriptMessages = [
    ...script.matchAll(/textContent\s*=\s*["'`]([^"'`]+)["'`]/g),
    ...script.matchAll(/UNLINKED_COPY\s*=\s*["'`]([^"'`]+)["'`]/g),
  ].map((m) => m[1]);
  const allUserFacingText = `${visible} ${scriptMessages.join(" ")}`;

  const bannedWords = [
    /\buuid\b/i,
    /\bdrops?\b/i,
    /\bbinding\b/i,
    /\bclaude\b/i,
    /\bagents?\b/i,
    /\baggregate\b/i,
    /\bcredentials?\b/i,
    /\bapi\b/i,
    /\bfixtures?\b/i,
    /fixture vision/i,
    /simulated notifications/i,
    /\ballergens?\b/i,
    /demo-host/i,
    /student_id/i,
    /nickname/i,
  ];

  for (const pattern of bannedWords) {
    assert.equal(
      pattern.test(allUserFacingText),
      false,
      `visible text unexpectedly matches ${pattern}`,
    );
  }
  assert.equal(/Authorization|demo-host/.test(html), false);
});

test("whats-left.html is self-contained with only the two official KSU external URLs", () => {
  const html = read("../../../prototypes/itcan/whats-left.html");

  const urls = [
    ...new Set(html.match(/https?:\/\/[^\s"'<>)]+/gi) ?? []),
  ].sort();
  assert.deepEqual(urls, [...OFFICIAL_KSU_URLS].sort());

  assert.equal(/<script\b[^>]*\bsrc=/i.test(html), false);
  assert.equal(/<link\b[^>]*\bhref=/i.test(html), false);
  assert.equal(/@import\b/i.test(html), false);
  assert.equal(
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(html),
    false,
  );
});

test("whats-left.html enforces strict UUID/page_id binding and Checking/Updated/error transitions", async () => {
  const html = read("../../../prototypes/itcan/whats-left.html");
  const script = extractInlineScript(html);

  assert.ok(script.includes("It.onState("));
  assert.ok(script.includes('It.action("whats_left", binding)'));
  assert.ok(script.includes("pageId === `owl-whats-left-${dropId}`"));

  const makeEl = (initialText = "") => {
    const listeners = new Map();
    const attrs = new Map();
    return {
      textContent: initialText,
      disabled: false,
      dataset: {},
      style: { display: "" },
      setAttribute(name, value) {
        attrs.set(name, value);
      },
      getAttribute(name) {
        return attrs.get(name);
      },
      addEventListener(type, fn) {
        listeners.set(type, fn);
      },
      async trigger(type) {
        const fn = listeners.get(type);
        if (fn) await fn();
      },
    };
  };

  const elements = {
    ask: makeEl(),
    "ask-label": makeEl("What's left?"),
    status: makeEl(""),
    "status-badge": makeEl("Loading…"),
    "checked-time": makeEl("—"),
    "error-box": makeEl(),
    "error-text": makeEl(""),
  };
  elements.ask.disabled = true;
  elements["error-box"].style.display = "none";

  let onStateHandler = null;
  const actions = [];
  runInNewContext(script, {
    document: {
      getElementById: (id) => elements[id],
    },
    It: {
      onState: (fn) => {
        onStateHandler = fn;
      },
      action: async (name, payload) => {
        actions.push({ name, payload });
      },
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  });

  assert.equal(typeof onStateHandler, "function");

  // Invalid binding disables the button with consumer copy.
  onStateHandler({
    drop_id: "not-a-uuid",
    page_id: "owl-whats-left-not-a-uuid",
  });
  assert.equal(elements.ask.disabled, true);
  assert.equal(
    elements.status.textContent,
    "This display isn't linked to a listing.",
  );

  // Mismatched page_id also fails closed.
  const dropId = "123e4567-e89b-42d3-a456-426614174000";
  const pageId = `owl-whats-left-${dropId}`;
  onStateHandler({ drop_id: dropId, page_id: "owl-whats-left-other" });
  assert.equal(elements.ask.disabled, true);

  // Valid binding enables the button and updates badge tone + datetime.
  onStateHandler({
    drop_id: dropId,
    page_id: pageId,
    status_label: "Available now",
    checked_at_iso: "2026-11-20T18:00:00Z",
    ok: true,
    error: "",
  });
  assert.equal(elements.ask.disabled, false);
  assert.equal(elements["status-badge"].dataset.tone, "success");
  assert.equal(
    elements["checked-time"].getAttribute("datetime"),
    "2026-11-20T18:00:00Z",
  );
  assert.equal(elements["error-box"].style.display, "none");

  // Tapping the button shows "Checking…" and sends exact binding.
  await elements.ask.trigger("click");
  assert.deepEqual(JSON.parse(JSON.stringify(actions)), [
    { name: "whats_left", payload: { drop_id: dropId, page_id: pageId } },
  ]);
  assert.equal(elements["ask-label"].textContent, "Checking…");
  assert.equal(elements.status.textContent, "Checking…");

  // Receiving fresh ok=true state shows "Updated" and re-enables the button.
  onStateHandler({
    drop_id: dropId,
    page_id: pageId,
    status_label: "All servings taken",
    ok: true,
    error: "",
  });
  assert.equal(elements.ask.disabled, false);
  assert.equal(elements["ask-label"].textContent, "What's left?");
  assert.equal(elements.status.textContent, "Updated");
  assert.equal(elements["status-badge"].dataset.tone, "gold");
  assert.equal(elements["error-box"].style.display, "none");

  // Receiving ok=false shows gentle error banner while keeping button usable.
  onStateHandler({
    drop_id: dropId,
    page_id: pageId,
    ok: false,
    error: "Couldn't reach Owl Plate. Try again in a moment.",
  });
  assert.equal(elements["error-box"].style.display, "");
  assert.equal(elements.ask.disabled, false);
});

test("HostListingDashboard places open-pickup-companion with an icon right under live counts", () => {
  const dashboard = read("../components/host/HostListingDashboard.tsx");

  const totalIndex = dashboard.indexOf('data-testid="host-count-total"');
  const companionIndex = dashboard.indexOf(
    'data-testid="open-pickup-companion"',
  );
  const reviewQueueIndex = dashboard.indexOf("<HostPickupReviewQueue");
  const pushIndex = dashboard.indexOf("<PushOptIn");
  const pantryIndex = dashboard.indexOf("<HostPantryCard");
  const shareAnotherIndex = dashboard.indexOf(
    'data-testid="share-another-drop-button"',
  );

  assert.ok(totalIndex > 0, "expected host-count-total");
  assert.ok(
    companionIndex > totalIndex,
    "companion should appear after counts",
  );
  assert.ok(
    companionIndex < reviewQueueIndex,
    "companion should appear before HostPickupReviewQueue",
  );
  assert.ok(
    companionIndex < pushIndex &&
      companionIndex < pantryIndex &&
      companionIndex < shareAnotherIndex,
    "companion should appear right under counts ahead of secondary cards",
  );

  assert.match(dashboard, /import[\s\S]*\bMonitor\b[\s\S]*from "lucide-react"/);
  assert.match(dashboard, /<Monitor\b/);
  assert.match(dashboard, /Open pickup display/);
  assert.match(dashboard, /disabled/);
  assert.match(dashboard, /The pickup display isn't connected yet\./);
  assert.match(
    dashboard,
    /Shows how many servings are left on a screen at the pickup table\./,
  );
});

test("Admin page mounts PickupDisplayStatusSection and renders origin-only config states safely", () => {
  const adminPage = read("../app/admin/page.tsx");
  assert.match(adminPage, /PickupDisplayStatusSection/);
  assert.match(adminPage, /<PickupDisplayStatusSection\s*\/>/);

  const { PickupDisplayStatusSection, resolveCompanionOriginStatus } =
    loadAdminPickupSection();

  // 1. Unset environment variable
  assert.deepEqual(
    { ...resolveCompanionOriginStatus("") },
    {
      configured: false,
      valid: false,
      origin: null,
      label: "Not set",
    },
  );
  const unsetMarkup = renderToStaticMarkup(
    React.createElement(PickupDisplayStatusSection, { baseUrl: "" }),
  );
  assert.match(unsetMarkup, /data-testid="admin-pickup-display-section"/);
  assert.match(unsetMarkup, /Pickup display \(It\)/);
  assert.match(unsetMarkup, /NEXT_PUBLIC_IT_COMPANION_BASE_URL/);
  assert.match(unsetMarkup, /Not set/);
  assert.match(unsetMarkup, /owl-whats-left-\{listing id\}/);
  assert.match(unsetMarkup, /It running on the Mac/);
  assert.match(unsetMarkup, /Display paired/);
  assert.match(
    unsetMarkup,
    /Claude Code conversation that created the page still open/,
  );
  assert.match(unsetMarkup, /Owl Plate tunnel up/);
  assert.match(unsetMarkup, /prototypes\/itcan\/README\.md/);

  // 2. Configured URL renders origin only and strips paths/codes/queries
  const configuredMarkup = renderToStaticMarkup(
    React.createElement(PickupDisplayStatusSection, {
      baseUrl: "http://127.0.0.1:43120/p/secret-code?pair=9999#frag",
    }),
  );
  assert.match(configuredMarkup, /Configured/);
  assert.match(configuredMarkup, /http:\/\/127\.0\.0\.1:43120/);
  assert.equal(configuredMarkup.includes("secret-code"), false);
  assert.equal(configuredMarkup.includes("9999"), false);
  assert.equal(configuredMarkup.includes("frag"), false);

  // 3. Bare pairing code is rejected and never echoed
  const codeMarkup = renderToStaticMarkup(
    React.createElement(PickupDisplayStatusSection, {
      baseUrl: "PAIR-SECRET-CODE-42",
    }),
  );
  assert.match(codeMarkup, /Invalid URL/);
  assert.equal(codeMarkup.includes("PAIR-SECRET-CODE-42"), false);

  // 4. Credentialed URL is rejected and never echoed
  const credMarkup = renderToStaticMarkup(
    React.createElement(PickupDisplayStatusSection, {
      baseUrl: "https://user:topsecret@127.0.0.1:43120",
    }),
  );
  assert.match(credMarkup, /Invalid URL/);
  assert.equal(credMarkup.includes("topsecret"), false);
});
