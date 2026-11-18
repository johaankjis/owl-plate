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
const { needsHomeScreen, pushFlagKey } = sandbox.exports;

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
