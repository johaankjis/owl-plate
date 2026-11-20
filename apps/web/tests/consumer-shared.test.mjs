import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/api-client.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function load(fetch) {
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: () => ({}),
    process: { env: { NEXT_PUBLIC_API_URL: "/backend" } },
    Headers,
    FormData,
    AbortController,
    fetch,
    setTimeout,
    clearTimeout,
  });
  return exports;
}
test("listing image uses Bearer header and no-store, with no URL credential", async () => {
  const token = "demo-session-image-test";
  const jpeg = new Blob([new Uint8Array([255, 216, 255, 217])], {
    type: "image/jpeg",
  });
  let request;
  const api = load(async (url, options) => {
    request = { url, options };
    return new Response(jpeg, { headers: { "Content-Type": "image/jpeg" } });
  });
  assert.equal(
    await api.getDropPhotoBlob("food/uuid", token).then((b) => b.size),
    4,
  );
  assert.equal(request.url, "/backend/drops/food%2Fuuid/photo");
  assert.equal(request.options.headers.Authorization, `Bearer ${token}`);
  assert.equal(request.options.cache, "no-store");
  assert.ok(!request.url.includes(token));
});
test("missing photo authorization and invalid image responses fail closed", async () => {
  let calls = 0;
  const api = load(async () => {
    calls++;
    return new Response("<html>error</html>", {
      headers: { "Content-Type": "text/html" },
    });
  });
  await assert.rejects(
    api.getDropPhotoBlob("food", ""),
    (error) => error.status === 401,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    api.getDropPhotoBlob("food", "demo-host"),
    (error) => error.code === "invalid_photo",
  );
  const denied = load(
    async () =>
      new Response(
        JSON.stringify({
          detail: { code: "not_found", message: "Photo not found" },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
  );
  await assert.rejects(
    denied.getDropPhotoBlob("food", "demo-host"),
    (error) => error.status === 404,
  );
});
test("closing a listing cancels its pending image request", async () => {
  let received;
  const api = load(async (_, options) => {
    received = options.signal;
    return new Promise((_, reject) =>
      options.signal.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      ),
    );
  });
  const controller = new AbortController();
  const request = api.getDropPhotoBlob("food", "demo-host", controller.signal);
  controller.abort();
  await assert.rejects(request, /aborted/);
  assert.equal(received.aborted, true);
});

test("shared UI primitives adopt the motion contract and respect prefers-reduced-motion", () => {
  const animatedNumber = readFileSync(
    new URL("../components/ui/AnimatedNumber.tsx", import.meta.url),
    "utf8",
  );
  assert.match(animatedNumber, /OWL_MOTION\.durations\.counter/);
  assert.match(animatedNumber, /prefersReducedMotion\(\)/);
  assert.match(animatedNumber, /tabular-nums/);

  const confirmDialog = readFileSync(
    new URL("../components/ui/ConfirmDialog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(confirmDialog, /role="dialog"/);
  assert.match(confirmDialog, /aria-modal="true"/);
  assert.match(confirmDialog, /OWL_MOTION_CLASSES\.fade/);
  assert.match(confirmDialog, /OWL_MOTION_CLASSES\.entrance/);

  const skeleton = readFileSync(
    new URL("../components/ui/Skeleton.tsx", import.meta.url),
    "utf8",
  );
  assert.match(skeleton, /OWL_MOTION_CLASSES\.shimmer/);
  assert.match(skeleton, /HostEstimateSkeleton/);

  const dropPhoto = readFileSync(
    new URL("../components/ui/DropPhoto.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dropPhoto, /OWL_MOTION_CLASSES\.shimmer/);
  assert.match(dropPhoto, /OWL_MOTION_CLASSES\.fade/);

  const foodCard = readFileSync(
    new URL("../components/ui/FoodCard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(foodCard, /OWL_MOTION_CLASSES\.entrance/);
  assert.match(foodCard, /OWL_MOTION_CLASSES\.press/);
  assert.match(foodCard, /entranceDelayMs/);

  const bottomNav = readFileSync(
    new URL("../components/ui/BottomNav.tsx", import.meta.url),
    "utf8",
  );
  assert.match(bottomNav, /OWL_MOTION_CLASSES\.press/);
  assert.match(bottomNav, /OWL_MOTION_CLASSES\.pop/);
});
