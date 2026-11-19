/** Capture a timed, fixture-only rehearsal through the reviewed application routes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { chromium } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);
const api = process.env.OWL_API_URL || "http://localhost:8017";
const web = process.env.OWL_WEB_URL || "http://localhost:3017";
const out = process.env.OWL_REHEARSAL_ARTIFACTS || "test-results/rehearsal";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const started = performance.now();
  const result = {
    recorded_at: new Date().toISOString(),
    application_sha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    evidence:
      "SIMULATED: synthetic image, fixture vision, simulated notifications; no physical push receipt",
    natural_expiry: true,
    events: [],
    scenes: [],
    videos: {},
  };
  const mark = (name, details = {}) =>
    result.events.push({
      name,
      seconds: +((performance.now() - started) / 1000).toFixed(3),
      ...details,
    });
  async function request(path, token = "demo-host", method = "GET") {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200, `${method} ${path}`);
    return res.json();
  }
  const health = await (await fetch(`${api}/health`)).json();
  assert.equal(
    health.notifications,
    "simulated",
    "Never run this capture with live notification transport",
  );
  assert.equal(health.is_demo, true);
  assert.equal(health.vision, "fixture");
  await request("/demo/reset", "demo-host", "POST");
  mark("clean_reset", { students: 30 });
  const photo = `${out}/synthetic-photo.png`;
  fs.writeFileSync(
    photo,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6UlEQVR4nO3QQQ3AIADAQMC/DXSChfVFltwpaDrPHny0Xgf8iVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWcEFVewCbMCCAcAAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const browser = await chromium.launch({
    executablePath: process.env.OWL_BROWSER_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox"],
  });
  const pages = {},
    contexts = {},
    origins = {},
    errors = [];
  try {
    for (const [name, viewport] of Object.entries({
      host: { width: 1280, height: 900 },
      projector: { width: 1920, height: 1080 },
      student: { width: 390, height: 844 },
    })) {
      contexts[name] = await browser.newContext({
        viewport,
        recordVideo: { dir: `${out}/raw`, size: viewport },
      });
      contexts[name].setDefaultTimeout(20000);
      pages[name] = await contexts[name].newPage();
      origins[name] = performance.now();
      pages[name].on("pageerror", (err) => errors.push(err.message));
    }
    async function scene(actor, title, caption) {
      result.scenes.push({
        actor,
        title,
        caption,
        seconds: +((performance.now() - started) / 1000).toFixed(3),
      });
    }
    async function shot(name, page) {
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    }
    async function text(id, value) {
      await pages.projector
        .getByTestId(id)
        .filter({ hasText: value })
        .waitFor({ timeout: 90000 });
    }
    await Promise.all(
      Object.entries(pages).map(([name, page]) =>
        page.goto(
          `${web}/${name === "projector" ? "dispatch" : name === "student" ? "student?persona=A" : name}`,
        ),
      ),
    );
    const { host, projector, student } = pages;
    await scene(
      "host",
      "1. Photograph and review",
      "Synthetic orange image uploaded; the estimate is a cached fixture, not live Gemini.",
    );
    await host.getByTestId("food-photo-input").setInputFiles(photo);
    await pause(2500);
    await host.getByTestId("analyze-photo-button").click();
    await host.getByTestId("servings-input").waitFor();
    assert.equal(
      await host.getByTestId("publish-drop-button").isDisabled(),
      true,
    );
    mark("fixture_estimate_visible");
    await shot("01-host-estimate", host);
    await pause(2500);
    await host.getByTestId("servings-input").fill("2");
    await host.getByTestId("host-rehearsal-option-DEMO-ORIGIN").click();
    for (const name of ["covered", "two-hours", "untouched"])
      await host.getByTestId(`safety-check-${name}`).check();
    await pause(3000);
    await host.getByTestId("publish-drop-button").click();
    await text("persona-status-A", "Invited");
    await text("persona-status-C", "Invited");
    const { drop_id: dropId } = await request("/demo/active-drop");
    const drop = await request(`/drops/${dropId}`);
    assert.equal(drop.vision_source, "fixture");
    mark("wave1_observed", { ring_k: 2 });
    await scene(
      "projector",
      "2. Wave one: A and C invited",
      "B is excluded for dairy. D is outside ring 2. All students and alerts are simulated.",
    );
    assert.match(
      await projector.getByTestId("persona-row-B").innerText(),
      /dietary filter/i,
    );
    assert.match(
      await projector.getByTestId("persona-row-D").innerText(),
      /outside current ring/i,
    );
    await shot("02-wave1", projector);
    await pause(5000);
    await scene(
      "student",
      "3. C sees an invitation",
      "This is C's own browser invite. No physical phone or push receipt is being shown.",
    );
    await student.goto(`${web}/student?persona=C`);
    await student.locator('[data-testid^="invite-card-"]').waitFor();
    await student
      .locator('[data-testid^="invite-card-"]')
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    mark("C_browser_invite_visible");
    await shot("03-C-invite", student);
    await pause(5000);
    await scene(
      "student",
      "4. B has no invitation",
      "The dairy hard filter excludes B before ranking; B receives no simulated invite.",
    );
    await student.goto(`${web}/student?persona=B`);
    await student.getByTestId("no-invites-card").waitFor();
    await student
      .getByTestId("no-invites-card")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    assert.equal(
      (await request("/students/me/invites", "demo-student-B")).invites.length,
      0,
    );
    mark("B_exclusion_verified");
    await shot("04-B-excluded", student);
    await pause(5000);
    await scene(
      "student",
      "5. A holds one serving",
      "The claim uses the real application route. Two available becomes one available plus one held.",
    );
    await student.goto(`${web}/student?persona=A`);
    const claim = student
      .locator('[data-testid^="claim-invite-button-"]')
      .first();
    await claim.waitFor();
    await claim.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await pause(2500);
    await claim.click();
    await student.getByTestId("active-claim-banner").waitFor();
    await student
      .getByTestId("active-claim-banner")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await text("dispatch-count-held", "1");
    await text("dispatch-count-available", "1");
    mark("A_hold_observed");
    await shot("05-A-held", student);
    await pause(5000);
    await scene(
      "projector",
      "6. Wait for C's 60-second invite to expire",
      "Real elapsed waiting: no demo clock advance. Scheduler checks every 10 seconds.",
    );
    await text("dispatch-ring-k", "k = 4");
    await text("persona-status-C", "Invite expired");
    await text("persona-status-D", "Invited");
    mark("wave2_observed", { ring_k: 4 });
    await scene(
      "projector",
      "7. Wave two widens to ring 4",
      "C expired; D is invited. A remains held. Earlier invitees are not contacted again.",
    );
    const snapshot = await request(
      `/drops/${dropId}/dispatch`,
      "demo-projector",
    );
    assert.deepEqual(snapshot.counts, {
      total: 2,
      available: 1,
      held: 1,
      picked_up: 0,
    });
    assert.doesNotMatch(
      JSON.stringify(snapshot).toLowerCase(),
      /priority|care/,
    );
    for (const label of ["A", "C", "D"])
      assert.equal(
        (await request("/students/me/invites", `demo-student-${label}`)).invites
          .length,
        1,
      );
    await shot("06-wave2", projector);
    await pause(6000);
    await scene(
      "student",
      "8. D sees the second-wave invitation",
      "A separate synthetic identity sees only its own invite. Physical push verification remains pending.",
    );
    await student.goto(`${web}/student?persona=D`);
    await student.locator('[data-testid^="invite-card-"]').waitFor();
    await student
      .locator('[data-testid^="invite-card-"]')
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    mark("D_browser_invite_visible");
    await shot("07-D-invite", student);
    await pause(6000);
    await scene(
      "host",
      "9. Reset for the next run",
      "Reset clears drops, invites and holds; 30 synthetic students are seeded again.",
    );
    await projector.getByTestId("presenter-toggle").click();
    await projector.getByTestId("presenter-load-seeded").click();
    await projector.getByTestId("presenter-load-seeded").click();
    await projector
      .getByTestId("presenter-notice")
      .filter({ hasText: "Seeded rehearsal loaded" })
      .waitFor();
    assert.equal((await request("/demo/active-drop")).drop_id, null);
    assert.equal(
      (await request("/students/me/invites", "demo-student-A")).invites.length,
      0,
    );
    mark("final_reset_verified");
    await shot("08-reset", host);
    await pause(4000);
    assert.deepEqual(errors, []);
    result.status = "PASS";
  } catch (err) {
    result.status = "FAIL";
    result.error = err.message;
    throw err;
  } finally {
    result.duration_seconds = +((performance.now() - started) / 1000).toFixed(
      3,
    );
    for (const [name, context] of Object.entries(contexts)) {
      await context.close();
      if (pages[name]) {
        const videoPath = await pages[name].video().path();
        assert.ok(
          fs.statSync(videoPath).size > 0,
          "Recorded video must exist and contain bytes",
        );
        result.videos[name] = {
          path: videoPath,
          origin_seconds: +((origins[name] - started) / 1000).toFixed(3),
        };
      }
    }
    await browser.close();
    fs.writeFileSync(
      `${out}/timing.json`,
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        {
          status: result.status,
          duration_seconds: result.duration_seconds,
          events: result.events,
          evidence: result.evidence,
        },
        null,
        2,
      ),
    );
  }
})().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
