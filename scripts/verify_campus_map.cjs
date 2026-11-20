/** Candidate-only real-route map rehearsal. Bind UI selectors after completed workers land.
 * No providers, student coordinates, real photos or route mocks.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { chromium } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);
const web = process.env.OWL_WEB_URL;
assert.ok(web, "Set OWL_WEB_URL to the isolated candidate");
const target = new URL(web);
assert.equal(target.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(
  target.port,
  "3027",
  "Candidate 3027 only; never reset protected runtimes",
);
assert.equal(target.pathname, "/");
assert.equal(
  target.username + target.password + target.search + target.hash,
  "",
);
const out = process.env.OWL_MAP_ARTIFACTS || "test-results/campus-map";
const photo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6UlEQVR4nO3QQQ3AIADAQMC/DXSChfVFltwpaDrPHny0Xgf8iVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWcEFVewCbMCCAcAAAAAASUVORK5CYII=",
  "base64",
);
async function request(path, token, method = "GET", body, expected = 200) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${web}/backend${path}`, {
    method,
    signal: AbortSignal.timeout(70000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !multipart
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body === undefined
      ? {}
      : { body: multipart ? body : JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return data;
}
function upload() {
  const body = new FormData();
  body.append(
    "photo",
    new Blob([photo], { type: "image/png" }),
    "synthetic.png",
  );
  return body;
}
async function publish(building, servings, minutes = 45) {
  const draft = await request("/drops", "demo-host", "POST", upload());
  await request(`/drops/${draft.id}`, "demo-host", "PATCH", {
    servings_final: servings,
    allergens_final: ["dairy"],
    diet_tags_final: [],
    building_code: building.id,
    room: "Synthetic map test",
    pickup_instructions: "Synthetic rehearsal only",
    expires_in_minutes: minutes,
    safety_review: {
      covered_and_temperature_safe: true,
      served_within_two_hours: true,
      untouched: true,
      ingredient_information_checked: true,
    },
  });
  return request(`/drops/${draft.id}/publish`, "demo-host", "POST");
}
function privacy(value) {
  assert.doesNotMatch(
    JSON.stringify(value),
    /student_id|claim_id|nickname|priority|token|allergens|preferences|h3_cell|ring_distance/i,
  );
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const evidence = {
    application_sha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    recorded_at: new Date().toISOString(),
    mode: "fixture vision; log notifications; synthetic PNG and people; actual campus snapshots and HTTP",
    physical_push_verified: false,
    physical_pickup_verified: false,
    live_accuracy_measured: false,
    paired_it_verified: false,
    expiry_method: "labeled demo clock advance",
    events: [],
  };
  const mark = (event, details = {}) =>
    evidence.events.push({ event, ...details });
  let browser;
  const pages = [],
    errors = [];
  try {
    const health = await request("/health");
    assert.equal(health.is_demo, true);
    assert.equal(health.vision, "fixture");
    assert.equal(health.notifications, "simulated");
    await request("/demo/reset", "demo-projector", "POST", {
      scenario: "visitors",
    });
    const buildings = (await request("/buildings")).buildings;
    const destinations = [
      "ksu-marietta-academic-building",
      "ksu-marietta-lawrence-v-johnson-library",
    ].map((id) => buildings.find((b) => b.id === id));
    for (const building of destinations) {
      assert.ok(building);
      assert.equal(building.verification_status, "verified");
      assert.ok(building.sources.length);
    }
    assert.notDeepEqual(destinations[0], destinations[1]);
    const drops = [
      await publish(destinations[0], 1),
      await publish(destinations[0], 2),
      await publish(destinations[1], 1),
    ];
    for (const drop of drops) {
      const building = destinations.find((b) => b.id === drop.building.id);
      assert.equal(drop.building.latitude, building.latitude);
      assert.equal(drop.building.longitude, building.longitude);
    }
    let distribution = await request("/distribution", "demo-projector");
    assert.equal(distribution.active_drops, 3);
    assert.equal(distribution.available_drops, 3);
    assert.equal(distribution.buildings.length, 2);
    assert.equal(
      distribution.buildings.find((b) => b.building.id === destinations[0].id)
        .available_drops,
      2,
    );
    privacy(distribution);
    mark("actual_fixture_two_verified_buildings_same_building_two_drops", {
      drops: drops.map((d) => ({
        id: d.id,
        building: d.building,
        counts: d.counts,
      })),
      distribution,
    });
    browser = await chromium.launch({
      executablePath: process.env.OWL_BROWSER_EXECUTABLE,
      headless: true,
      args: ["--no-sandbox"],
    });
    async function open(desktop, noWebGL = false) {
      const context = await browser.newContext({
        viewport: desktop
          ? { width: 1440, height: 1000 }
          : { width: 390, height: 844 },
        isMobile: !desktop,
        hasTouch: !desktop,
      });
      context.setDefaultTimeout(20000);
      await context.addInitScript(
        ({ noWebGL }) => {
          window.owlGpsAttempts = 0;
          for (const name of ["getCurrentPosition", "watchPosition"])
            Object.defineProperty(navigator.geolocation, name, {
              value: () => {
                window.owlGpsAttempts++;
                throw new Error("GPS forbidden");
              },
            });
          if (noWebGL) {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...args) {
              return /webgl/i.test(type)
                ? null
                : original.call(this, type, ...args);
            };
          }
        },
        { noWebGL },
      );
      const page = await context.newPage();
      pages.push(page);
      page.on("pageerror", (error) => errors.push(error.message));
      return page;
    }
    const h3 = require("../apps/web/node_modules/h3-js");
    async function wait(check, message) {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      throw new Error(message);
    }
    async function attr(locator, name, value) {
      await wait(
        async () => (await locator.getAttribute(name)) === String(value),
        `${name} expected ${value}`,
      );
    }
    async function joinUI(page, name, diet) {
      await page.goto(`${web}/join`);
      await page.getByTestId("join-nickname-input").fill(name);
      if (diet) await page.getByTestId(`join-diet-${diet}`).click();
      await page.getByTestId("join-submit").click();
      await page.waitForURL(/\/student/);
      await page.getByTestId("student-nickname").waitFor();
      assert.equal(
        await page.getByTestId("student-campus-map-section").count(),
        0,
        "Feed is default",
      );
      await page.getByTestId("student-view-map-button").click();
      await page.getByTestId("campus-map-viewport").waitFor();
      return page.evaluate(() => localStorage.getItem("owl-plate.session"));
    }
    const projector = await open(true);
    await projector.goto(`${web}/dispatch`);
    async function projectCounts(
      building,
      available,
      reserved,
      collected,
      availableDrops,
      activeDrops,
    ) {
      const node = projector.getByTestId(
        `projector-map-building-${building.id}`,
      );
      for (const [key, value] of Object.entries({
        available,
        reserved,
        collected,
        "available-drops": availableDrops,
        "active-drops": activeDrops,
      }))
        await attr(node, `data-${key}`, value);
      await attr(
        node,
        "data-h3-cell",
        h3.latLngToCell(building.latitude, building.longitude, 11),
      );
    }
    await projectCounts(destinations[0], 3, 0, 0, 2, 2);
    await projectCounts(destinations[1], 1, 0, 0, 1, 1);
    const mobile = await open(false),
      desktop = await open(true),
      fallback = await open(false, true);
    const mobileToken = await joinUI(mobile, "Synthetic Mobile");
    const desktopToken = await joinUI(desktop, "Synthetic Desktop");
    await joinUI(fallback, "Synthetic No WebGL", "vegan");
    const marker = (page, building) =>
      page.getByTestId(`campus-map-marker-${building.id}`);
    const card = (page, drop) => page.getByTestId(`map-drop-card-${drop.id}`);
    async function select(page, building) {
      if (
        (await marker(page, building).getAttribute("data-selected")) !== "true"
      )
        await marker(page, building).click();
      await page.getByTestId("campus-map-detail-panel").waitFor();
    }
    async function directions(page, drop) {
      const href = await page
        .getByTestId(`map-directions-link-${drop.id}`)
        .getAttribute("href");
      const url = new URL(href);
      assert.equal(url.origin, "https://www.google.com");
      assert.equal(url.pathname, "/maps/dir/");
      assert.equal(
        url.searchParams.get("destination"),
        `${drop.building.latitude},${drop.building.longitude}`,
      );
      assert.equal(url.searchParams.get("travelmode"), "walking");
      assert.equal(url.searchParams.has("origin"), false);
    }
    for (const page of [mobile, desktop]) {
      for (const building of destinations) {
        const pin = marker(page, building);
        await pin.waitFor();
        await attr(pin, "data-latitude", building.latitude);
        await attr(pin, "data-longitude", building.longitude);
        await attr(
          pin,
          "data-h3-cell",
          h3.latLngToCell(building.latitude, building.longitude, 11),
        );
        const box = await pin.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
      }
      await attr(marker(page, destinations[0]), "data-available-servings", 3);
      await attr(marker(page, destinations[0]), "data-drop-count", 2);
      assert.deepEqual(
        new Set(
          (
            await marker(page, destinations[0]).getAttribute("data-drop-ids")
          ).split(","),
        ),
        new Set(drops.slice(0, 2).map((d) => d.id)),
      );
      const viewport = page.getByTestId("campus-map-viewport");
      const zoom = Number(await viewport.getAttribute("data-zoom"));
      await page.getByTestId("campus-map-zoom-in").click();
      await wait(
        async () => Number(await viewport.getAttribute("data-zoom")) > zoom,
        "Zoom in",
      );
      await page.getByTestId("campus-map-zoom-out").click();
      const center = await viewport.getAttribute("data-center-lng");
      await viewport.scrollIntoViewIfNeeded();
      const box = await viewport.boundingBox();
      if (page === mobile) {
        const touch = await page.context().newCDPSession(page);
        const y = box.y + box.height * 0.65;
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: box.x + box.width * 0.3, y }],
        });
        for (let i = 1; i <= 8; i++)
          await touch.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: box.x + box.width * (0.3 + (0.2 * i) / 8), y }],
          });
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await touch.detach();
      } else {
        await page.mouse.move(
          box.x + box.width * 0.3,
          box.y + box.height * 0.65,
        );
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width * 0.5,
          box.y + box.height * 0.65,
          { steps: 8 },
        );
        await page.mouse.up();
      }
      await wait(
        async () => (await viewport.getAttribute("data-center-lng")) !== center,
        "Geographic pan",
      );
      await page.getByTestId("campus-map-fit-button").click();
      await select(page, destinations[0]);
      for (const drop of drops.slice(0, 2)) {
        await card(page, drop).waitFor();
        await directions(page, drop);
      }
      await page.getByTestId("campus-map-detail-close").click();
    }
    mark(
      "mobile_desktop_exact_metadata_grouping_feed_default_pan_zoom_details_directions",
    );
    await mobile.screenshot({
      path: `${out}/mobile-grouped.png`,
      fullPage: true,
    });
    await desktop.screenshot({
      path: `${out}/desktop-grouped.png`,
      fullPage: true,
    });
    await attr(
      fallback.getByTestId("campus-map-viewport"),
      "data-renderer",
      "fallback-2d",
    );
    await fallback.getByTestId("campus-map-accessible-list").waitFor();
    await fallback
      .getByTestId(`campus-map-list-button-${destinations[0].id}`)
      .click();
    assert.equal(
      await fallback
        .getByTestId(`map-reserve-drop-button-${drops[0].id}`)
        .isDisabled(),
      true,
    );
    assert.ok(
      (
        await fallback
          .getByTestId(`map-drop-unavailable-${drops[0].id}`)
          .textContent()
      ).trim(),
    );
    await directions(fallback, drops[0]);
    mark("no_webgl_accessible_list_dietary_disabled_reason_and_directions");
    async function reserve(page, drop) {
      await select(page, drop.building);
      await page.getByTestId(`map-reserve-drop-button-${drop.id}`).click();
      await page.getByTestId("active-claim-banner").waitFor();
    }
    async function pickup(page, token, drop) {
      const claim = (await request("/students/me/feed", token)).drops.find(
        (d) => d.drop.id === drop.id,
      ).claim;
      await page
        .locator('input[type="file"][capture="environment"]')
        .setInputFiles({
          name: "synthetic-pickup.png",
          mimeType: "image/png",
          buffer: photo,
        });
      await page.getByTestId("pickup-confirm-button").waitFor();
      await wait(
        async () => await page.getByTestId("pickup-confirm-button").isEnabled(),
        "Consistent fixture permits explicit completion",
      );
      const before = await request(`/drops/${drop.id}`, "demo-host");
      assert.equal(before.counts.picked_up, 0);
      await page.getByTestId("pickup-confirm-button").click();
      await page
        .getByTestId("active-claim-banner")
        .waitFor({ state: "hidden" });
      assert.equal(
        (await request(`/drops/${drop.id}`, "demo-host")).counts.picked_up,
        1,
      );
      return claim;
    }
    // Mobile takes Library's last serving: pin disappears while the hold survives.
    await reserve(mobile, drops[2]);
    await wait(
      async () => (await marker(mobile, destinations[1]).count()) === 0,
      "Exhausted pin removed",
    );
    await mobile.getByTestId("active-claim-banner").waitFor();
    await projectCounts(destinations[1], 0, 1, 0, 0, 1);
    await mobile.screenshot({
      path: `${out}/mobile-held-exhausted.png`,
      fullPage: true,
    });
    await mobile.getByTestId("pickup-release-button").click();
    await marker(mobile, destinations[1]).waitFor();
    await projectCounts(destinations[1], 1, 0, 0, 1, 1);
    mark("mobile_last_serving_marker_removed_hold_retained_release_reappears");
    // A different student reserves released capacity; immutable release is retained.
    await reserve(desktop, drops[2]);
    await pickup(desktop, desktopToken, drops[2]);
    await projectCounts(destinations[1], 0, 0, 1, 0, 1);
    await wait(
      async () => (await marker(desktop, destinations[1]).count()) === 0,
      "Collected pin removed",
    );
    // Mobile independently completes a pickup from the grouped building.
    await reserve(mobile, drops[0]);
    await pickup(mobile, mobileToken, drops[0]);
    await attr(marker(mobile, destinations[0]), "data-available-servings", 2);
    await attr(marker(mobile, destinations[0]), "data-drop-count", 1);
    await projectCounts(destinations[0], 2, 0, 1, 1, 2);
    mark("mobile_and_desktop_map_photo_explicit_pickup_polling_without_reload");
    await projector.screenshot({
      path: `${out}/projector-collected.png`,
      fullPage: true,
    });
    // Fallback remains fully actionable for an unrestricted new student.
    const fallbackAction = await open(false, true);
    const fallbackToken = await joinUI(fallbackAction, "Synthetic Fallback");
    await fallbackAction
      .getByTestId(`campus-map-list-button-${destinations[0].id}`)
      .click();
    await fallbackAction
      .getByTestId(`map-reserve-drop-button-${drops[1].id}`)
      .click();
    await fallbackAction.getByTestId("active-claim-banner").waitFor();
    await fallbackAction.getByTestId("pickup-release-button").click();
    mark("no_webgl_accessible_list_actual_reserve_release");
    const holdExpiry = await open(false);
    const holdExpiryToken = await joinUI(holdExpiry, "Synthetic Hold Expiry");
    await reserve(holdExpiry, drops[1]);
    const expiryClaim = (
      await request("/students/me/feed", holdExpiryToken)
    ).drops.find((d) => d.drop.id === drops[1].id).claim;
    await request("/demo/tick", "demo-projector", "POST", {
      advance_seconds: 601,
    });
    await holdExpiry
      .getByTestId("active-claim-banner")
      .waitFor({ state: "hidden" });
    await attr(
      marker(holdExpiry, destinations[0]),
      "data-available-servings",
      2,
    );
    await projectCounts(destinations[0], 2, 0, 1, 1, 2);
    await request(
      `/claims/${expiryClaim.id}/pickup`,
      holdExpiryToken,
      "POST",
      undefined,
      409,
    );
    mark(
      "map_hold_expiry_removes_hold_restores_capacity_rejects_stale_pickup",
      { advance_seconds: 601 },
    );
    // An open selection expires; no reserve button may survive a poll.
    await select(fallback, destinations[0]);
    await request("/demo/tick", "demo-projector", "POST", {
      advance_seconds: 2701,
    });
    await wait(
      async () =>
        (await fallback
          .locator('[data-testid^="campus-map-marker-ksu-"]')
          .count()) === 0,
      "Expired pins removed",
    );
    await fallback.getByTestId("campus-map-stale-notice").waitFor();
    assert.equal(
      await fallback
        .locator('[data-testid^="map-reserve-drop-button-"]')
        .count(),
      0,
    );
    await request(
      `/drops/${drops[1].id}/reserve`,
      fallbackToken,
      "POST",
      undefined,
      409,
    );
    distribution = await request("/distribution", "demo-projector");
    privacy(distribution);
    assert.equal(distribution.active_drops, 0);
    assert.equal(distribution.available_drops, 0);
    await projector.getByTestId("distribution-empty-state").waitFor();
    assert.equal(
      await projector
        .locator('[data-testid^="visitor-row-"], [data-testid^="persona-row-"]')
        .count(),
      0,
    );
    mark(
      "drop_expiry_removes_selection_actions_and_projector_aggregates_stale_route_rejected",
      { advance_seconds: 2701 },
    );
    for (const page of pages) {
      assert.equal(await page.evaluate(() => window.owlGpsAttempts), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        "No horizontal overflow",
      );
    }
    assert.deepEqual(errors, []);
    evidence.status = "PASS";
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = error.stack;
    process.exitCode = 1;
  } finally {
    for (const [i, page] of pages.entries()) {
      await page
        .screenshot({ path: `${out}/${i}.png`, fullPage: true })
        .catch(() => {});
      mark("browser_observation", {
        page: i,
        gps_attempts: await page
          .evaluate(() => window.owlGpsAttempts)
          .catch(() => null),
      });
    }
    if (browser) await browser.close();
    evidence.browser_errors = errors;
    fs.writeFileSync(
      `${out}/evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(JSON.stringify(evidence, null, 2));
  }
})();
