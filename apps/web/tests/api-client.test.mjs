import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the actual client in a sandbox; no browser, server, token or network is used.
const source = readFileSync(
  new URL("../lib/api-client.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function loadClient({ fixtureMode = false, fetch, fixtureResult = {} }) {
  const exports = {};
  const calls = { fixtures: 0, deadlines: [] };
  runInNewContext(compiled, {
    exports,
    process: { env: { NEXT_PUBLIC_UI_FIXTURE_MODE: String(fixtureMode) } },
    require: () =>
      new Proxy(
        {},
        {
          get: () => () => {
            calls.fixtures++;
            return fixtureResult;
          },
        },
      ),
    Headers,
    FormData,
    AbortController,
    fetch,
    setTimeout: (_, milliseconds) => {
      calls.deadlines.push(milliseconds);
      return 1;
    },
    clearTimeout: () => {},
  });
  return { api: exports, calls };
}

test("API is default and failed mutations never become fixture successes", async () => {
  const { api, calls } = loadClient({
    fetch: async () => {
      throw new TypeError("offline");
    },
  });
  assert.equal(api.UI_FIXTURE_MODE, false);
  await assert.rejects(
    api.resetDemoState(),
    (error) => error.code === "network_error",
  );
  assert.equal(calls.fixtures, 0);
});

test("HTTP errors keep the backend code and message", async () => {
  const { api, calls } = loadClient({
    fetch: async () =>
      Response.json(
        { detail: { code: "capacity", message: "No servings left." } },
        { status: 409 },
      ),
  });
  await assert.rejects(
    api.claimInvite("synthetic-invite", "demo-student-A"),
    (error) => error.status === 409 && error.code === "capacity",
  );
  assert.equal(calls.fixtures, 0);
});

test("photo upload allows at least 60 seconds and uses the selected file", async () => {
  const { api, calls } = loadClient({
    fetch: async (url, options) => {
      assert.equal(new URL(url).pathname, "/drops");
      assert.equal(options.body.get("photo").name, "food.png");
      return Response.json({ id: "synthetic-drop" });
    },
  });
  await api.createDrop(
    new File([new Uint8Array([137, 80, 78, 71])], "food.png", {
      type: "image/png",
    }),
  );
  assert.ok(calls.deadlines[0] >= 60000);
  assert.equal(calls.fixtures, 0);
});

test("projector discovery comes from API without host browser storage", async () => {
  const { api } = loadClient({
    fetch: async (url, options) => {
      assert.equal(new URL(url).pathname, "/demo/active-drop");
      assert.equal(new URL(url).port, "8017");
      assert.equal(
        options.headers.get("Authorization"),
        "Bearer demo-projector",
      );
      return Response.json({ drop_id: null });
    },
  });
  assert.equal((await api.getActiveDrop()).data.drop_id, null);
});

test("standalone fixtures require explicit opt-in and make no API calls", async () => {
  const { api, calls } = loadClient({
    fixtureMode: true,
    fixtureResult: { status: "reset", students: 30 },
    fetch: async () => {
      throw new Error("Fixture mode must not fetch");
    },
  });
  const result = await api.resetDemoState();
  assert.equal(result.source, "offline_fixture");
  assert.equal(result.data.students, 30);
  assert.equal(calls.fixtures, 1);
});
