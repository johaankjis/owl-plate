import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../lib/push-helpers.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const sandbox = { exports: {} };
runInNewContext(compiled, sandbox);
const { needsHomeScreen, pushFlagKey, resolvePushNotificationTarget } =
  sandbox.exports;

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

test("iPhone Safari tab must use the Home Screen app for push", () => {
  assert.equal(needsHomeScreen(IPHONE, false), true);
  assert.equal(needsHomeScreen(IPHONE, true), false);
  assert.equal(needsHomeScreen(ANDROID, false), false);
});

test("push opt-in flag is per session token", () => {
  assert.notEqual(
    pushFlagKey("demo-session-aaaaaaaaaaaaaaaaaaaaaaaa1"),
    pushFlagKey("demo-session-aaaaaaaaaaaaaaaaaaaaaaaa2"),
  );
  assert.ok(pushFlagKey("demo-session-x").startsWith("owl-plate.push."));
});

test("resolvePushNotificationTarget prefers drop_id in campus_feed mode with stable drop tag and minimal lock-screen text", () => {
  const dropId = "00000000-0000-4000-8000-000000000101";
  const inviteId = "00000000-0000-4000-8000-000000000999";

  // Campus feed payload with drop_id only (exact backend push_message shape)
  const exactFeed = resolvePushNotificationTarget({
    notification_mode: "campus_feed",
    drop_id: dropId,
    tag: `owl-drop-${dropId}`,
    url: `/student?drop=${dropId}`,
  });
  assert.equal(exactFeed.mode, "campus_feed");
  assert.equal(exactFeed.tag, `owl-drop-${dropId}`);
  assert.equal(exactFeed.url, `/student?drop=${dropId}`);
  assert.equal(exactFeed.title, "Owl Plate: Free food on campus");
  assert.equal(exactFeed.body, "New food was just posted. Tap to view it.");
  assert.equal(exactFeed.url.includes("token"), false);

  // Even if provider includes both drop_id and invite_id, campus_feed mode prefers drop_id
  const bothIdsFeed = resolvePushNotificationTarget({
    notification_mode: "campus_feed",
    drop_id: dropId,
    invite_id: inviteId,
  });
  assert.equal(bothIdsFeed.mode, "campus_feed");
  assert.equal(bothIdsFeed.tag, `owl-drop-${dropId}`);
  assert.equal(bothIdsFeed.url, `/student?drop=${dropId}`);

  // Legacy seeded_waves mode uses invite_id even if drop_id is also present
  const seeded = resolvePushNotificationTarget({
    notification_mode: "seeded_waves",
    invite_id: inviteId,
    drop_id: dropId,
  });
  assert.equal(seeded.mode, "seeded_waves");
  assert.equal(seeded.tag, `owl-${inviteId}`);
  assert.equal(seeded.url, `/student?invite=${inviteId}`);
  assert.equal(seeded.title, "Owl Plate: Food nearby");

  // Legacy payload without notification_mode keeps invite fallback
  const legacyNoMode = resolvePushNotificationTarget({
    invite_id: inviteId,
  });
  assert.equal(legacyNoMode.mode, "seeded_waves");
  assert.equal(legacyNoMode.tag, `owl-${inviteId}`);
  assert.equal(legacyNoMode.url, `/student?invite=${inviteId}`);
});

test("firebase-messaging-sw.js prefers drop_id for campus_feed and preserves invite fallback for seeded_waves", async () => {
  const swSource = readFileSync(
    new URL("../public/firebase-messaging-sw.js", import.meta.url),
    "utf8",
  );
  const listeners = {};
  const shownNotifications = [];
  const openedUrls = [];

  const selfMock = {
    location: { origin: "https://owlplate.example.edu" },
    skipWaiting: () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => [],
      openWindow: async (url) => {
        openedUrls.push(url);
      },
    },
    registration: {
      showNotification: async (title, options) => {
        shownNotifications.push({ title, options });
      },
    },
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
  };

  runInNewContext(swSource, { self: selfMock, URL });

  // 1. Campus feed push with both drop_id and invite_id prefers drop_id
  let pendingPromise = null;
  listeners.push({
    data: {
      json: () => ({
        data: {
          notification_mode: "campus_feed",
          drop_id: "drop-uuid-123",
          invite_id: "inv-uuid-456",
        },
      }),
    },
    waitUntil: (p) => {
      pendingPromise = p;
    },
  });
  await pendingPromise;

  assert.equal(shownNotifications.length, 1);
  assert.equal(shownNotifications[0].title, "Owl Plate: Free food on campus");
  assert.equal(shownNotifications[0].options.tag, "owl-drop-drop-uuid-123");
  assert.equal(
    shownNotifications[0].options.data.url,
    "/student?drop=drop-uuid-123",
  );

  // Clicking the notification navigates to /student?drop=drop-uuid-123 without credentials
  let clickPromise = null;
  listeners.notificationclick({
    notification: {
      data: shownNotifications[0].options.data,
      close: () => {},
    },
    waitUntil: (p) => {
      clickPromise = p;
    },
  });
  await clickPromise;
  assert.equal(
    openedUrls[0],
    "https://owlplate.example.edu/student?drop=drop-uuid-123",
  );

  // 2. Seeded wave push uses invite_id
  listeners.push({
    data: {
      json: () => ({
        data: {
          notification_mode: "seeded_waves",
          invite_id: "inv-uuid-456",
          drop_id: "drop-uuid-123",
        },
      }),
    },
    waitUntil: (p) => {
      pendingPromise = p;
    },
  });
  await pendingPromise;
  assert.equal(shownNotifications.length, 2);
  assert.equal(shownNotifications[1].options.tag, "owl-inv-uuid-456");
  assert.equal(
    shownNotifications[1].options.data.url,
    "/student?invite=inv-uuid-456",
  );
});
