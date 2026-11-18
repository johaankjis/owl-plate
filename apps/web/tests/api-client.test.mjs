import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the actual client and session helpers in a sandbox; no browser, server, token or network is used.
const apiClientSource = readFileSync(
  new URL("../lib/api-client.ts", import.meta.url),
  "utf8",
);
const apiClientCompiled = ts.transpileModule(apiClientSource, {
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

const sessionSource = readFileSync(
  new URL("../lib/session.ts", import.meta.url),
  "utf8",
);
const sessionCompiled = ts.transpileModule(sessionSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function loadClient({
  fixtureMode = false,
  fetch,
  fixtureResult = {},
  fixtureError = null,
}) {
  const exports = {};
  const calls = { fixtures: 0, deadlines: [] };
  runInNewContext(apiClientCompiled, {
    exports,
    process: { env: { NEXT_PUBLIC_UI_FIXTURE_MODE: String(fixtureMode) } },
    require: () =>
      new Proxy(
        {},
        {
          get: () => () => {
            calls.fixtures++;
            if (fixtureError) {
              throw fixtureError;
            }
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

function loadSessionModule() {
  const typesExports = {};
  runInNewContext(typesCompiled, {
    exports: typesExports,
    require: () => ({}),
  });

  const sessionExports = {};
  const store = new Map();
  const mockLocalStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  runInNewContext(sessionCompiled, {
    exports: sessionExports,
    window: { localStorage: mockLocalStorage },
    require: (id) => {
      if (id === "./types/api") return typesExports;
      return {};
    },
  });

  return { session: sessionExports, store, mockLocalStorage };
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

test("createDrop surfaces 503 vision_unavailable server message without falling back to fixture", async () => {
  const { api, calls } = loadClient({
    fetch: async () =>
      Response.json(
        {
          detail: {
            code: "vision_unavailable",
            message:
              "Live vision via OpenRouter is temporarily unavailable. Please try again.",
          },
        },
        { status: 503 },
      ),
  });
  await assert.rejects(
    api.createDrop(
      new File([new Uint8Array([137, 80, 78, 71])], "food.png", {
        type: "image/png",
      }),
    ),
    (error) =>
      error.status === 503 &&
      error.code === "vision_unavailable" &&
      error.message ===
        "Live vision via OpenRouter is temporarily unavailable. Please try again.",
  );
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

test("api-client session routes call GET /demo/areas, POST /sessions, GET /sessions/me, and DELETE /sessions/me", async () => {
  const requests = [];
  const { api } = loadClient({
    fetch: async (url, options) => {
      const parsedUrl = new URL(url);
      requests.push({
        method: options.method,
        pathname: parsedUrl.pathname,
        auth: options.headers.get("Authorization"),
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (parsedUrl.pathname === "/demo/areas") {
        return Response.json({ areas: [{ id: "demo-venue" }] });
      }
      if (parsedUrl.pathname === "/sessions") {
        return Response.json(
          {
            token: "demo-session-abc123",
            student: {
              id: "00000000-0000-4000-9000-000000000001",
              nickname: "Scrappy",
              area: "demo-venue",
              allergens: ["peanut"],
              diets: ["vegetarian"],
              kind: "visitor",
              valid_until: "2026-11-18T19:00:00Z",
            },
          },
          { status: 201 },
        );
      }
      if (parsedUrl.pathname === "/sessions/me" && options.method === "GET") {
        return Response.json({
          id: "00000000-0000-4000-9000-000000000001",
          nickname: "Scrappy",
          area: "demo-venue",
          allergens: ["peanut"],
          diets: ["vegetarian"],
          kind: "visitor",
          valid_until: "2026-11-18T19:00:00Z",
        });
      }
      if (
        parsedUrl.pathname === "/sessions/me" &&
        options.method === "DELETE"
      ) {
        return Response.json({ status: "left" });
      }
      throw new Error(`Unexpected path: ${parsedUrl.pathname}`);
    },
  });

  const areasRes = await api.getDemoAreas();
  assert.equal(areasRes.data.areas[0].id, "demo-venue");

  const joinRes = await api.joinDemoSession({
    nickname: "Scrappy",
    area: "demo-venue",
    allergens: ["peanut"],
    diets: ["vegetarian"],
  });
  assert.equal(joinRes.data.token, "demo-session-abc123");

  const meRes = await api.getMySession("demo-session-abc123");
  assert.equal(meRes.data.nickname, "Scrappy");

  const leaveRes = await api.leaveDemoSession("demo-session-abc123");
  assert.equal(leaveRes.data.status, "left");

  assert.deepEqual(
    requests.map((r) => ({
      method: r.method,
      pathname: r.pathname,
      auth: r.auth,
    })),
    [
      { method: "GET", pathname: "/demo/areas", auth: null },
      { method: "POST", pathname: "/sessions", auth: null },
      {
        method: "GET",
        pathname: "/sessions/me",
        auth: "Bearer demo-session-abc123",
      },
      {
        method: "DELETE",
        pathname: "/sessions/me",
        auth: "Bearer demo-session-abc123",
      },
    ],
  );
  assert.equal(requests[1].body.nickname, "Scrappy");
  assert.equal(requests[1].body.area, "demo-venue");
});

test("joinDemoSession surfaces 409 nickname_taken error code and message", async () => {
  const { api } = loadClient({
    fetch: async () =>
      Response.json(
        {
          detail: {
            code: "nickname_taken",
            message: "Nickname is already taken.",
          },
        },
        { status: 409 },
      ),
  });

  await assert.rejects(
    api.joinDemoSession({ nickname: "Scrappy", area: "demo-venue" }),
    (error) =>
      error.status === 409 &&
      error.code === "nickname_taken" &&
      error.message === "Nickname is already taken.",
  );
});

test("session storage persists under owl-plate.session and clears on 401 unauthorized", () => {
  const { session, store } = loadSessionModule();

  assert.equal(session.SESSION_STORAGE_KEY, "owl-plate.session");
  assert.equal(session.getSessionToken(), null);
  assert.equal(session.hasSessionToken(), false);

  session.setSessionToken("  demo-session-xyz987  ");
  assert.equal(store.get("owl-plate.session"), "demo-session-xyz987");
  assert.equal(session.getSessionToken(), "demo-session-xyz987");
  assert.equal(session.hasSessionToken(), true);

  // Non-401 error preserves the session token
  const nonAuth = session.handleUnauthorizedError({
    status: 409,
    code: "capacity",
    message: "No servings left",
  });
  assert.equal(nonAuth.isUnauthorized, false);
  assert.equal(session.getSessionToken(), "demo-session-xyz987");

  // 401 error clears owl-plate.session and redirects to /join with "Session ended. Join again."
  const authErr = session.handleUnauthorizedError({
    status: 401,
    code: "unauthorized",
    message: "Session ended. Join again.",
  });
  assert.equal(authErr.isUnauthorized, true);
  assert.equal(authErr.message, "Session ended. Join again.");
  assert.equal(authErr.redirectTo, "/join?reason=session_ended");
  assert.equal(session.getSessionToken(), null);
  assert.equal(store.has("owl-plate.session"), false);
});

test("parseSeededPersonaParam resolves rehearsal query parameter ?persona=A..E", () => {
  const { session } = loadSessionModule();

  const resA = session.parseSeededPersonaParam("A");
  assert.equal(resA?.label, "A");
  assert.equal(resA?.token, "demo-student-A");

  const resE = session.parseSeededPersonaParam("e");
  assert.equal(resE?.label, "E");
  assert.equal(resE?.token, "demo-student-E");

  assert.equal(session.parseSeededPersonaParam("F"), null);
  assert.equal(session.parseSeededPersonaParam(""), null);
  assert.equal(session.parseSeededPersonaParam(null), null);
});
