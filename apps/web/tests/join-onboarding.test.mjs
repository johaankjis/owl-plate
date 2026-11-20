import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readAppSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("join drops the redundant allergen description and the privacy paragraph", () => {
  const joinSrc = readAppSource("../app/join/page.tsx");

  // Removed: the long allergen explainer and the notification/privacy note.
  assert.equal(joinSrc.includes("ShieldAlert"), false);
  assert.equal(joinSrc.includes("ALLERGEN_WARNING_TEXT"), false);
  assert.equal(joinSrc.includes("join-privacy-notice"), false);
  assert.equal(joinSrc.includes("Turn on food alerts anytime"), false);
  assert.equal(joinSrc.includes("Bell"), false);
  assert.equal(joinSrc.includes("no location tracking"), false);

  // Preserved: the join essentials and the dietary safeguards.
  assert.ok(joinSrc.includes("AppShell"));
  assert.ok(joinSrc.includes("Start browsing food"));
  assert.ok(joinSrc.includes("Allergens to avoid"));
  assert.ok(joinSrc.includes("ALLERGENS"));
  assert.ok(joinSrc.includes("join-allergen-"));
  assert.ok(joinSrc.includes("Dietary preferences"));
  assert.ok(joinSrc.includes("join-diet-"));
  assert.ok(joinSrc.includes("nickname_taken"));
});

test("join primes notification permission on the Start browsing tap", () => {
  const joinSrc = readAppSource("../app/join/page.tsx");

  // The prompt is fired inside the submit handler, before the network call.
  assert.ok(joinSrc.includes("primeJoinNotifications"));
  const submitStart = joinSrc.indexOf("const handleSubmit");
  const primePos = joinSrc.indexOf("primeJoinNotifications()", submitStart);
  const joinPos = joinSrc.indexOf("await joinDemoSession", submitStart);
  assert.ok(submitStart !== -1, "join page keeps its submit handler");
  assert.ok(primePos !== -1, "submit handler primes the notification prompt");
  assert.ok(joinPos !== -1, "submit handler still joins the session");
  assert.ok(
    primePos < joinPos,
    "the prompt is primed before the await that could eat the user gesture",
  );

  // Onboarding finishes after the session exists but never blocks navigation.
  assert.ok(joinSrc.includes("void completeJoinPushOnboarding"));
  const onboardingPos = joinSrc.indexOf(
    "void completeJoinPushOnboarding",
    submitStart,
  );
  const pushPos = joinSrc.indexOf('router.push("/student")', submitStart);
  assert.ok(
    onboardingPos !== -1 && pushPos !== -1 && onboardingPos < pushPos,
    "onboarding is started before navigation and never awaited",
  );
});

test("push onboarding is best effort and keeps the Profile flag authoritative", () => {
  const onboardingSrc = readAppSource("../lib/push-onboarding.ts");

  // Every failure path stays quiet: the whole body is guarded.
  assert.ok(onboardingSrc.includes("try {"));
  assert.ok(onboardingSrc.includes("} catch {"));
  assert.ok(
    onboardingSrc.includes("Onboarding is optional"),
    "the catch documents why it stays silent",
  );

  // iPhone Safari tabs are never prompted; the Profile hint keeps that path.
  assert.ok(onboardingSrc.includes("needsHomeScreen"));
  assert.ok(onboardingSrc.includes("shouldPrimeJoinNotifications"));

  // Success still records the same per-session flag Profile reads.
  assert.ok(onboardingSrc.includes('pushFlagKey(authToken, "student")'));
  assert.ok(onboardingSrc.includes("localStorage.setItem"));
  assert.ok(onboardingSrc.includes("registerPushToken"));
  // Only a granted priming outcome continues; denied/dismissed return early.
  assert.ok(onboardingSrc.includes('outcome !== "granted"'));
});

test("fcm splits priming from acquisition without changing the Profile flow", () => {
  const fcmSrc = readAppSource("../lib/fcm.ts");

  assert.ok(
    fcmSrc.includes("export async function primeNotificationPermission"),
  );
  assert.ok(fcmSrc.includes("export async function acquireFcmPushToken"));
  assert.ok(fcmSrc.includes("export async function requestFcmPushToken"));
  assert.ok(
    fcmSrc.includes("Notification.requestPermission"),
    "the native prompt is still requested only inside explicit opt-in paths",
  );
  // Acquisition never prompts: it only checks the already-granted permission.
  const acquireStart = fcmSrc.indexOf(
    "export async function acquireFcmPushToken",
  );
  const acquireEnd = fcmSrc.indexOf(
    "export async function requestFcmPushToken",
  );
  const acquireBody = fcmSrc.slice(acquireStart, acquireEnd);
  assert.equal(acquireBody.includes("requestPermission"), false);
  assert.ok(acquireBody.includes('Notification.permission !== "granted"'));
});

test("student Profile opt-in flow remains unchanged", () => {
  const pushSrc = readAppSource("../lib/push.ts");
  assert.ok(pushSrc.includes("export function usePushOptIn"));
  assert.ok(pushSrc.includes("requestFcmPushToken"));
  const pushHelpersSrc = readAppSource("../lib/push-helpers.ts");
  assert.ok(pushHelpersSrc.includes("export function needsHomeScreen"));
  assert.ok(pushHelpersSrc.includes("export function pushFlagKey"));
  const swSrc = readAppSource("../public/firebase-messaging-sw.js");
  assert.ok(swSrc.includes("showNotification"));
});
