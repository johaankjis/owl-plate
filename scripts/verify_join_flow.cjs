/**
 * Drive the revamped Join Demo flow in real, separate browser sessions.
 *
 * Four visitors join from their own browser contexts; a host publishes two
 * servings; the projector shows matching. Ava claims, Ben lets the invite
 * expire naturally (no clock advance), Cy is skipped for a dairy allergy and
 * Dee, farther away, gets wave two. Each visitor's own token is then used to
 * prove they see only their own invites and cannot touch anyone else's.
 *
 * Synthetic demo only: resets state. Requires `make present` running.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { chromium } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);

const web = process.env.OWL_WEB_URL || "http://localhost:3017";
const api = `${web}/backend`;
const out = process.env.OWL_JOIN_ARTIFACTS || "test-results/join-flow";
const PHOTO =
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6UlEQVR4nO3QQQ3AIADAQMC/DXSChfVFltwpaDrPHny0Xgf8iVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWcEFVewCbMCCAcAAAAAASUVORK5CYII=";

const VISITORS = [
  { name: "Ava", area: "demo-venue", allergens: [] },
  { name: "Ben", area: "demo-next-door", allergens: [] },
  { name: "Cy", area: "demo-venue", allergens: ["dairy"] },
  { name: "Dee", area: "demo-across-quad", allergens: [] },
];

async function call(path, token, method = "GET") {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const started = Date.now();
  const events = [];
  const evidence = {
    application_sha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    recorded_at: new Date().toISOString(),
    mode: "Four synthetic visitors, fixture vision, simulated notifications; no physical push or live vision evidence",
    events,
  };
  const mark = (name, extra = {}) =>
    events.push({ name, seconds: (Date.now() - started) / 1000, ...extra });
  const errors = [];

  const health = await (await fetch(`${api}/health`)).json();
  assert.equal(health.notifications, "simulated");
  assert.equal(health.vision, "fixture");
  assert.equal(health.is_demo, true);
  const reset = await fetch(`${api}/demo/reset`, {
    method: "POST",
    headers: {
      Authorization: "Bearer demo-projector",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scenario: "visitors" }),
  });
  assert.equal(reset.status, 200);
  mark("reset_visitors");

  fs.writeFileSync(`${out}/photo.png`, Buffer.from(PHOTO, "base64"));
  const browser = await chromium.launch({
    executablePath: process.env.OWL_BROWSER_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox"],
  });
  const open = async (name, viewport) => {
    const context = await browser.newContext({ viewport });
    context.setDefaultTimeout(20000);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${name} console: ${m.text()}`);
    });
    return page;
  };
  const shot = (page, name) =>
    page.screenshot({ path: `${out}/${name}.png`, fullPage: true });

  try {
    const projector = await open("projector", { width: 1920, height: 1080 });
    await projector.goto(`${web}/dispatch`);
    await projector.getByTestId("label-fixture-vision").waitFor();
    await projector.getByTestId("label-simulated-notifications").waitFor();

    const home = await open("home", { width: 390, height: 844 });
    await home.goto(web);
    await home.getByTestId("home-share-food").waitFor();
    await home.getByTestId("home-find-food").click();
    await home.waitForURL(/\/join/);
    await shot(home, "00-home-to-join");
    await home.context().close();

    const pages = {};
    const tokens = {};
    for (const visitor of VISITORS) {
      const page = await open(visitor.name, { width: 390, height: 844 });
      await page.goto(`${web}/join`);
      await page.getByTestId("join-nickname-input").fill(visitor.name);
      await page.getByTestId(`join-area-${visitor.area}`).click();
      for (const allergen of visitor.allergens)
        await page.getByTestId(`join-allergen-${allergen}`).click();
      await page.getByTestId("join-submit").click();
      await page.waitForURL(/\/student/);
      await page
        .getByTestId("student-nickname")
        .filter({ hasText: visitor.name })
        .waitFor();
      const stored = await page.evaluate(() =>
        window.localStorage.getItem("owl-plate.session"),
      );
      assert.ok(stored, `${visitor.name} has a stored session`);
      tokens[visitor.name] = stored.startsWith("{")
        ? JSON.parse(stored).token
        : stored;
      assert.match(tokens[visitor.name], /^demo-session-/);
      pages[visitor.name] = page;
    }
    assert.equal(new Set(Object.values(tokens)).size, 4, "distinct sessions");
    mark("four_visitors_joined");
    await shot(pages.Cy, "01-cy-joined");

    const host = await open("host", { width: 1280, height: 900 });
    await host.goto(`${web}/host`);
    await host
      .getByTestId("food-photo-input")
      .setInputFiles(`${out}/photo.png`);
    await host.getByTestId("analyze-photo-button").click();
    await host.getByTestId("servings-input").waitFor();
    await host.getByTestId("vision-source-label").waitFor();
    await host.getByTestId("servings-input").fill("2");
    await host.getByTestId("host-rehearsal-option-DEMO-ORIGIN").click();
    assert.equal(
      await host.getByTestId("publish-drop-button").isDisabled(),
      true,
    );
    for (const check of ["covered", "two-hours", "untouched"])
      await host.getByTestId(`safety-check-${check}`).check();
    await shot(host, "02-host-review");
    await host.getByTestId("publish-drop-button").click();
    mark("published");

    const status = (name, label) =>
      projector
        .getByTestId(`visitor-status-${name}`)
        .filter({ hasText: label })
        .waitFor({ timeout: 90000 });
    await status("Ava", "Invited");
    await status("Ben", "Invited");
    await status("Cy", "Skipped");
    await status("Dee", "Not invited yet");
    assert.match(
      await projector.getByTestId("visitor-row-Cy").innerText(),
      /dietary filter/i,
    );
    assert.doesNotMatch(
      await projector.getByTestId("visitor-row-Cy").innerText(),
      /dairy/i,
      "projector must not name a visitor's allergen",
    );
    mark("wave1", { invited: ["Ava", "Ben"], skipped: "Cy" });
    await shot(projector, "03-wave1");

    for (const name of ["Ava", "Ben"]) {
      await pages[name].locator('[data-testid^="invite-card-"]').waitFor();
      await pages[name]
        .getByTestId("simulated-notification-label")
        .first()
        .waitFor();
    }
    await pages.Cy.getByTestId("no-invites-card").waitFor();
    await pages.Dee.getByTestId("no-invites-card").waitFor();
    await shot(pages.Ben, "04-ben-invite");

    await pages.Ava.locator('[data-testid^="claim-invite-button-"]')
      .first()
      .click();
    await pages.Ava.getByTestId("active-claim-banner").waitFor();
    await status("Ava", "Claimed");
    mark("ava_claimed");
    await shot(pages.Ava, "05-ava-claimed");

    // Natural expiry: no clock advance anywhere in this script.
    await status("Ben", "Invite expired");
    mark("ben_expired_naturally");
    await status("Dee", "Invited");
    await projector
      .getByTestId("dispatch-ring-k")
      .filter({ hasText: "k = 4" })
      .waitFor({ timeout: 30000 });
    mark("wave2_dee", { ring_k: 4 });
    await shot(projector, "06-wave2");
    await pages.Dee.locator('[data-testid^="invite-card-"]').waitFor();
    await shot(pages.Dee, "07-dee-invite");

    // Isolation using each visitor's own token.
    const mine = {};
    for (const name of Object.keys(tokens)) {
      const res = await call("/students/me/invites", tokens[name]);
      assert.equal(res.status, 200);
      mine[name] = res.body.invites;
    }
    assert.equal(mine.Ava.length, 1);
    assert.equal(mine.Ava[0].claim.status, "held");
    assert.equal(mine.Ben.length, 1);
    assert.equal(mine.Ben[0].status, "expired");
    assert.equal(mine.Cy.length, 0);
    assert.equal(mine.Dee.length, 1);
    assert.equal(mine.Dee[0].status, "sent");
    const ids = new Set(
      Object.values(mine).flatMap((list) => list.map((invite) => invite.id)),
    );
    assert.equal(ids.size, 3, "no invite is shared between visitors");
    const avaInvite = mine.Ava[0].id;
    const avaClaim = mine.Ava[0].claim.id;
    const deeInvite = mine.Dee[0].id;
    for (const [path, token] of [
      [`/invites/${deeInvite}/claim`, tokens.Cy],
      [`/invites/${deeInvite}/decline`, tokens.Ben],
      [`/invites/${avaInvite}/claim`, tokens.Dee],
      [`/claims/${avaClaim}/release`, tokens.Ben],
    ]) {
      const res = await call(path, token, "POST");
      assert.equal(res.status, 404, `${path} must be 404 for another visitor`);
    }
    const dispatch = await call(
      `/drops/${mine.Dee[0].drop.id}/dispatch`,
      tokens.Dee,
    );
    assert.notEqual(
      dispatch.status,
      200,
      "students cannot read the projector view",
    );
    const after = await call("/students/me/invites", tokens.Dee);
    assert.equal(
      after.body.invites[0].status,
      "sent",
      "Dee's invite untouched",
    );
    for (const name of ["Ava", "Ben", "Cy", "Dee"]) {
      const text = await pages[name].locator("body").innerText();
      for (const other of ["Ava", "Ben", "Cy", "Dee"].filter((n) => n !== name))
        assert.ok(!text.includes(other), `${name}'s page never shows ${other}`);
    }
    mark("isolation_verified");

    const leaked = JSON.stringify(
      (await call(`/drops/${mine.Dee[0].drop.id}/dispatch`, "demo-projector"))
        .body,
    ).toLowerCase();
    assert.doesNotMatch(leaked, /priority|demo-session-|"allergens"|"diets"/);
    assert.deepEqual(errors, []);
    evidence.status = "PASS";
    console.log(JSON.stringify(evidence, null, 2));
  } catch (err) {
    evidence.status = "FAIL";
    evidence.error = err.message;
    console.log(
      JSON.stringify(
        { status: "FAIL", error: err.message, events, errors },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
    fs.writeFileSync(
      `${out}/evidence.json`,
      JSON.stringify(evidence, null, 2) + "\n",
    );
  }
})();
