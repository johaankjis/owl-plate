/** Verify offline playback in real wall time; this never represents a spoken team run. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);
(async () => {
  const out = process.env.OWL_PLAYBACK_ARTIFACTS || "test-results/playback";
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.OWL_BROWSER_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    }),
    errors = [],
    network = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) network.push(r.url());
  });
  try {
    await page.goto(
      pathToFileURL(path.resolve("submission/REHEARSAL.html")).href,
    );
    await page.waitForFunction(() =>
      Number.isFinite(document.querySelector("video").duration),
    );
    const duration = await page.locator("video").evaluate((v) => v.duration);
    assert.ok(Math.abs(duration - 96.6) < 0.1);
    assert.equal(await page.getByLabel("Run type").inputValue(), "technical");
    await page.getByRole("button", { name: "Start 5:00 rehearsal" }).click();
    for (const phase of [
      "problem-open",
      "problem",
      "solution",
      "demo",
      "architecture",
      "next",
    ]) {
      await page.waitForFunction(
        (id) =>
          window.owlRehearsal
            .getLog()
            ?.events.some((e) => e.type === "phase" && e.phase === id),
        phase,
        { timeout: 125000 },
      );
      assert.equal(await page.locator("#slide").isVisible(), phase !== "demo");
      assert.equal(await page.locator("#video").isVisible(), phase === "demo");
      await page.waitForFunction(() => {
        const image = document.querySelector("#slide");
        return image.hidden || (image.complete && image.naturalWidth > 0);
      });
      await page.screenshot({ path: `${out}/${phase}.png` });
    }
    await page.waitForFunction(
      () => Boolean(window.owlRehearsal.getLog()?.completed_at),
      null,
      { timeout: 35000 },
    );
    const log = await page.evaluate(() => window.owlRehearsal.getLog());
    assert.equal(log.run_type, "technical");
    assert.equal(log.human_speakers_present, false);
    assert.ok(log.active_seconds >= 300 && log.active_seconds < 302);
    assert.ok(log.events.some((e) => e.type === "video_ended"));
    assert.ok(
      !log.events.some((e) =>
        ["video_error", "playback_blocked"].includes(e.type),
      ),
    );
    const start = log.events.find(
      (e) => e.type === "video_playing",
    ).elapsed_seconds;
    const end = log.events.find(
      (e) => e.type === "video_ended",
    ).elapsed_seconds;
    assert.ok(Math.abs(end - start - duration) < 1.5);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    fs.writeFileSync(
      `${out}/technical-playback.json`,
      JSON.stringify(
        {
          ...log,
          verification: {
            status: "PASS",
            external_requests: 0,
            page_errors: errors,
          },
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          active_seconds: log.active_seconds,
          video_seconds: duration,
          video_start: start,
          video_end: end,
          evidence:
            "Technical wall-clock playback only; no spoken team rehearsal",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
