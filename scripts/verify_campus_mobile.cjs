/** Verify actual campus routes with fixture vision and log notifications, never live providers.
 * Run against an isolated `scripts.present --port 3027 --api-port 8027` instance.
 * OWL_WEB_URL is mandatory; OWL_PLAYWRIGHT_MODULE / OWL_BROWSER_EXECUTABLE are optional.
 * The registry must contain the reviewed dataset; no route or building response is mocked.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { chromium } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);

const web = process.env.OWL_WEB_URL;
assert.ok(web, "Set OWL_WEB_URL to the isolated test server");
const target = new URL(web);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.ok(
  !["3017", "8017", ""].includes(target.port),
  "Never reset the canonical demo",
);
const out = process.env.OWL_CAMPUS_ARTIFACTS || "test-results/campus-mobile";
const photo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6UlEQVR4nO3QQQ3AIADAQMC/DXSChfVFltwpaDrPHny0Xgf8iVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWcEFVewCbMCCAcAAAAAASUVORK5CYII=",
  "base64",
);

async function request(path, token, method = "GET", body) {
  const response = await fetch(`${web}/backend${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const evidence = {
    recorded_at: new Date().toISOString(),
    application_sha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    mode: "Actual campus registry; synthetic visitors/image; fixture vision; simulated notifications",
    physical_push_verified: false,
    live_vision_verified: false,
    it_tap_verified: false,
    events: [],
  };
  const errors = [];
  const pages = [];
  let browser;
  const mark = (event, details = {}) =>
    evidence.events.push({ event, ...details });
  try {
    const health = await request("/health");
    assert.equal(health.body.vision, "fixture");
    assert.equal(health.body.notifications, "simulated");
    assert.equal(health.body.is_demo, true);
    const directory = await request("/buildings");
    assert.equal(directory.status, 200);
    assert.ok(
      directory.body.buildings.length,
      "Actual campus dataset required; do not fabricate one",
    );
    const buildings = directory.body.buildings;
    for (const building of buildings) {
      assert.equal(building.verification_status, "verified");
      assert.ok(
        Number.isFinite(building.latitude) &&
          Number.isFinite(building.longitude),
      );
      assert.ok(building.sources.length);
    }
    const destination = buildings.find(
      (building) => building.id === "ksu-marietta-academic-building",
    );
    const nearby = buildings.find(
      (building) => building.id === "ksu-marietta-lawrence-v-johnson-library",
    );
    const farther = buildings.find(
      (building) => building.id === "ksu-marietta-administration-building",
    );
    assert.ok(
      destination && nearby && farther,
      "Reviewed Library / Academic / Administration scenario required",
    );
    const initial = buildings.find(
      (building) => building.category === "housing",
    );
    assert.ok(initial, "Housing check-in options required");
    evidence.buildings = buildings.map((building) => building.id);
    evidence.destination = destination;
    assert.equal(
      (
        await request("/demo/reset", "demo-projector", "POST", {
          scenario: "visitors",
        })
      ).status,
      200,
    );
    const unknown = await request("/sessions", null, "POST", {
      nickname: "Unknown",
      area: "ksu-marietta-not-a-building",
    });
    assert.equal(unknown.status, 422);
    assert.equal(unknown.body.detail.code, "invalid_building");
    mark("verified_directory_and_unknown_rejection");

    browser = await chromium.launch({
      executablePath: process.env.OWL_BROWSER_EXECUTABLE,
      headless: true,
      args: ["--no-sandbox"],
    });
    async function open(name) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      context.setDefaultTimeout(20000);
      context.setDefaultNavigationTimeout(30000);
      await context.addInitScript(() => {
        window.owlGpsAttempts = 0;
        for (const method of ["getCurrentPosition", "watchPosition"]) {
          Object.defineProperty(navigator.geolocation, method, {
            value: () => {
              window.owlGpsAttempts += 1;
              throw new Error("GPS forbidden");
            },
          });
        }
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
      pages.push(page);
      return page;
    }
    async function select(page, prefix, building) {
      await page.getByTestId(`${prefix}-building-search`).fill(building.name);
      await page
        .getByTestId(`${prefix}-building-option-${building.id}`)
        .click();
    }
    async function join(name, allergen, checkedIn = nearby) {
      const page = await open(name);
      await page.goto(`${web}/join`);
      await page.getByTestId("join-nickname-input").fill(name);
      await select(page, "join", initial);
      if (allergen) await page.getByTestId(`join-allergen-${allergen}`).click();
      await page.getByTestId("join-submit").click();
      await page.waitForURL(/\/student/);
      await page.getByTestId("student-nickname").waitFor();
      await page.getByTestId("student-menu-button").click();
      await select(page, "join", checkedIn);
      await page.getByTestId("student-checkin-button").click();
      await page.getByTestId("student-checkin-status").waitFor();
      const token = await page.evaluate(() =>
        localStorage.getItem("owl-plate.session"),
      );
      const me = await request("/sessions/me", token);
      assert.equal(me.body.area, checkedIn.id);
      await page.getByTestId("student-menu-button").click();
      return { page, token };
    }
    const student = await join("Campus Visitor", null);
    const expiring = await join("Expiry Visitor", null);
    const excluded = await join("Diet Visitor", "dairy");
    const widening = await join("Wave Visitor", null, farther);
    mark("mobile_join_and_building_checkin", {
      initial: initial.id,
      checked_in: nearby.id,
      farther: farther.id,
    });

    const host = await open("host");
    await host.goto(`${web}/host`);
    await host.getByTestId("food-photo-input").setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: photo,
    });
    await host.getByTestId("analyze-photo-button").click();
    await host.getByTestId("servings-input").fill("2");
    await select(host, "host", destination);
    await host.getByTestId("room-input").fill("Test room");
    await host
      .getByTestId("pickup-instructions-input")
      .fill("Synthetic rehearsal: meet the test host");
    assert.equal(
      await host.getByTestId("publish-drop-button").isDisabled(),
      true,
    );
    for (const check of ["covered", "two-hours", "untouched"])
      await host.getByTestId(`safety-check-${check}`).check();
    await host.getByTestId("publish-drop-button").click();
    await host
      .getByTestId("host-count-available")
      .filter({ hasText: /^2$/ })
      .waitFor();
    const active = await request("/demo/active-drop", "demo-host");
    const dropId = active.body.drop_id;
    const drop = (await request(`/drops/${dropId}`, "demo-host")).body;
    assert.equal(drop.building.id, destination.id);
    assert.equal(drop.vision_source, "fixture");
    assert.equal(drop.room, "Test room");
    assert.equal(
      drop.pickup_instructions,
      "Synthetic rehearsal: meet the test host",
    );
    assert.doesNotMatch(
      JSON.stringify(drop),
      /care_priority|care_status|is_care/i,
    );
    mark("host_publish", { drop_id: dropId, building: drop.building.id });

    await student.page.locator('[data-testid^="invite-card-"]').waitFor();
    await student.page
      .getByTestId("invite-drop-location")
      .filter({ hasText: destination.name })
      .waitFor();
    await student.page.getByTestId("invite-pickup-instructions").waitFor();
    await student.page
      .getByText("may contain, confirm with host", { exact: false })
      .first()
      .waitFor();
    async function directions() {
      const href = await student.page
        .getByTestId("get-directions-link")
        .getAttribute("href");
      const url = new URL(href);
      assert.equal(url.origin, "https://www.google.com");
      assert.equal(url.pathname, "/maps/dir/");
      assert.equal(url.searchParams.get("api"), "1");
      assert.equal(
        url.searchParams.get("destination"),
        `${destination.latitude},${destination.longitude}`,
      );
      assert.equal(url.searchParams.get("travelmode"), "walking");
      assert.equal(url.searchParams.has("origin"), false);
      mark("exact_building_walking_link", { href });
    }
    await directions();
    assert.equal(
      (await request("/students/me/invites", excluded.token)).body.invites
        .length,
      0,
    );
    await excluded.page.getByTestId("no-invites-card").waitFor();
    await widening.page.getByTestId("no-invites-card").waitFor();
    await expiring.page.locator('[data-testid^="invite-card-"]').waitFor();
    const dispatch = (
      await request(`/drops/${dropId}/dispatch`, "demo-projector")
    ).body;
    const byName = Object.fromEntries(
      dispatch.visitors.map((visitor) => [visitor.nickname, visitor]),
    );
    assert.equal(byName["Campus Visitor"].ring_distance, 2);
    assert.equal(byName["Wave Visitor"].ring_distance, 4);
    assert.equal(dispatch.waves[0].ring_k, 2);
    mark("actual_campus_ring_gating", { library: 2, administration: 4 });
    await student.page.screenshot({
      path: `${out}/01-campus-invite.png`,
      fullPage: true,
    });
    await student.page.locator('[data-testid^="claim-invite-button-"]').click();
    await student.page.getByTestId("active-claim-banner").waitFor();
    await host
      .getByTestId("host-count-held")
      .filter({ hasText: /^1$/ })
      .waitFor();
    await host
      .getByTestId("host-count-available")
      .filter({ hasText: /^1$/ })
      .waitFor();
    await directions();
    mark("reserve_updates_host_counts", { available: 1, held: 1 });
    await student.page.getByTestId("pickup-confirm-button").click();
    await student.page.getByTestId("picked-up-card").waitFor();
    await host
      .getByTestId("host-count-picked-up")
      .filter({ hasText: /^1$/ })
      .waitFor();
    await host
      .getByTestId("host-count-held")
      .filter({ hasText: /^0$/ })
      .waitFor();
    const final = (await request(`/drops/${dropId}`, "demo-host")).body;
    assert.deepEqual(final.counts, {
      available: 1,
      held: 0,
      picked_up: 1,
      total: 2,
    });
    mark("pickup_updates_host_counts", final.counts);
    await widening.page
      .locator('[data-testid^="invite-card-"]')
      .waitFor({ timeout: 90000 });
    const second = (
      await request(`/drops/${dropId}/dispatch`, "demo-projector")
    ).body;
    assert.ok(second.waves.some((wave) => wave.ring_k === 4));
    const expired = (await request("/students/me/invites", expiring.token)).body
      .invites;
    assert.equal(expired[0].status, "expired");
    mark("natural_expiry_widens_to_administration", {
      ring_k: 4,
      no_clock_advance: true,
    });
    const companion = host.getByTestId("open-pickup-companion");
    const companionHref = await companion.getAttribute("href");
    if (companionHref) {
      assert.equal(
        new URL(companionHref).pathname,
        `/p/owl-whats-left-${dropId}`,
      );
      mark("companion_exact_drop_link", { href: companionHref, tapped: false });
    } else {
      mark("companion_not_configured", { tapped: false });
    }
    await host.screenshot({
      path: `${out}/02-campus-host-counts.png`,
      fullPage: true,
    });
    for (const page of pages) {
      assert.equal(await page.evaluate(() => window.owlGpsAttempts), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        "No mobile horizontal overflow",
      );
    }
    assert.deepEqual(errors, []);
    mark("no_gps_no_browser_errors_no_horizontal_overflow");
    evidence.status = "PASS";
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = error.message;
    if (browser)
      for (const [index, page] of pages.entries())
        await page
          .screenshot({ path: `${out}/failure-${index}.png`, fullPage: true })
          .catch(() => {});
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    fs.writeFileSync(
      `${out}/evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(JSON.stringify(evidence, null, 2));
  }
})();
