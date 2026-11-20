/** Real-route, isolated campus-feed regression. No route/dataset mocks or real providers.
 * OWL_WEB_URL must be http://127.0.0.1:3027 (or localhost:3027).
 * See docs/FEED_HANDOFF.md for browser prerequisites and explicit seeded rehearsal.
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
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(
  target.port,
  "3027",
  "Candidate port 3027 only; never reset live services",
);
const out = process.env.OWL_FEED_ARTIFACTS || "test-results/campus-feed";
const photo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6UlEQVR4nO3QQQ3AIADAQMC/DXSChfVFltwpaDrPHny0Xgf8iVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWcEFVewCbMCCAcAAAAAASUVORK5CYII=",
  "base64",
);
async function request(path, token, method = "GET", body, expected = 200) {
  const response = await fetch(`${web}/backend${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return data;
}
function privateSafe(value) {
  assert.doesNotMatch(
    JSON.stringify(value),
    /priority_tier|care_priority|care_status|is_care|token_enc|ksu_email_hash/i,
  );
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const evidence = {
    recorded_at: new Date().toISOString(),
    application_sha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    mode: "SIMULATED people/image; fixture vision; log notifications; real routes and reviewed campus dataset",
    physical_push_verified: false,
    live_vision_verified: false,
    paired_it_verified: false,
    expiry_method: "explicit demo clock advance, not real elapsed hold expiry",
    events: [],
  };
  const mark = (event, details = {}) =>
    evidence.events.push({ event, ...details });
  const pages = [],
    errors = [],
    joinBodies = [];
  let browser;
  try {
    const health = await request("/health");
    assert.equal(health.is_demo, true);
    assert.equal(health.vision, "fixture");
    assert.equal(health.notifications, "simulated");
    const buildings = (await request("/buildings")).buildings;
    assert.ok(buildings.length >= 2, "Reviewed campus dataset required");
    for (const building of buildings) {
      assert.equal(building.verification_status, "verified");
      assert.ok(building.sources.length);
    }
    const destinations = [
      "ksu-marietta-academic-building",
      "ksu-marietta-lawrence-v-johnson-library",
    ].map((id) => buildings.find((b) => b.id === id));
    assert.ok(
      destinations.every(Boolean),
      "Use actual reviewed Academic and Library buildings",
    );
    await request("/demo/reset", "demo-projector", "POST", {
      scenario: "visitors",
    });
    const empty = await request("/distribution", "demo-projector");
    assert.equal(empty.distribution_mode, "campus_feed");
    assert.equal(empty.active_drops, 0);
    browser = await chromium.launch({
      executablePath: process.env.OWL_BROWSER_EXECUTABLE,
      headless: true,
      args: ["--no-sandbox"],
    });
    async function open(name, desktop = false) {
      const context = await browser.newContext({
        viewport: desktop
          ? { width: 1440, height: 1000 }
          : { width: 390, height: 844 },
        isMobile: !desktop,
        hasTouch: !desktop,
      });
      context.setDefaultTimeout(20000);
      await context.addInitScript(() => {
        window.owlGpsAttempts = 0;
        for (const method of ["getCurrentPosition", "watchPosition"])
          Object.defineProperty(navigator.geolocation, method, {
            value: () => {
              window.owlGpsAttempts++;
              throw new Error("GPS forbidden");
            },
          });
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
      page.on("request", (req) => {
        if (
          req.method() === "POST" &&
          new URL(req.url()).pathname === "/backend/sessions"
        )
          joinBodies.push(req.postDataJSON());
      });
      pages.push(page);
      return page;
    }
    async function noStudentLocation(page) {
      assert.equal(
        await page
          .locator(
            '[data-testid*="building-selector"], [data-testid*="building-search"], [data-testid*="checkin"], [data-testid="student-current-area"]',
          )
          .count(),
        0,
      );
      assert.equal(await page.evaluate(() => window.owlGpsAttempts), 0);
    }
    async function join(name, diet) {
      const page = await open(name);
      await page.goto(`${web}/join`);
      await noStudentLocation(page);
      await page.getByTestId("join-nickname-input").fill(name);
      if (diet) await page.getByTestId(`join-diet-${diet}`).click();
      await page.getByTestId("join-submit").click();
      await page.waitForURL(/\/student/);
      await page.getByTestId("student-nickname").waitFor();
      await page
        .getByTestId("student-vision-mode-label")
        .filter({ hasText: "Saved demo estimates" })
        .waitFor();
      await noStudentLocation(page);
      await page.getByTestId("student-menu-button").click();
      await noStudentLocation(page);
      await page.getByTestId("student-menu-button").click();
      const token = await page.evaluate(() =>
        localStorage.getItem("owl-plate.session"),
      );
      assert.ok(token);
      const me = await request("/sessions/me", token);
      assert.equal(me.area, null);
      privateSafe(me);
      return { page, token };
    }
    const student = await join("Synthetic Feed One");
    const mismatch = await join("Synthetic Vegan", "vegan");
    const projector = await open("projector", true);
    await projector.goto(`${web}/admin/projector`);
    await projector.getByTestId("label-fixture-vision").waitFor();
    await projector.getByTestId("label-simulated-notifications").waitFor();
    await projector.getByTestId("distribution-empty-state").waitFor();
    const hosts = [];
    async function publish(building) {
      const page = await open(`host-${building.id}`);
      await page.goto(`${web}/host`);
      if (hosts.length) {
        await page.getByTestId("host-count-available").waitFor();
        await page.getByTestId("share-another-drop-button").click();
      }
      await page.getByTestId("food-photo-input").setInputFiles({
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: photo,
      });
      await page.getByTestId("analyze-photo-button").click();
      await page.getByTestId("servings-input").fill("2");
      await page.getByTestId("host-building-search").fill(building.name);
      await page.getByTestId(`host-building-option-${building.id}`).click();
      await page.getByTestId("room-input").fill("Synthetic test room");
      await page
        .getByTestId("pickup-instructions-input")
        .fill("Synthetic test: meet the host");
      assert.equal(
        await page.getByTestId("publish-drop-button").isDisabled(),
        true,
      );
      for (const check of ["covered", "two-hours", "untouched"])
        await page.getByTestId(`safety-check-${check}`).check();
      const published = page.waitForResponse(
        (r) =>
          /\/drops\/[^/]+\/publish$/.test(new URL(r.url()).pathname) &&
          r.request().method() === "POST",
      );
      await page.getByTestId("publish-drop-button").click();
      const response = await published;
      assert.equal(response.status(), 200);
      const drop = await response.json();
      assert.equal(drop.distribution_mode, "campus_feed");
      assert.equal(drop.building.id, building.id);
      assert.equal(drop.vision_source, "fixture");
      privateSafe(drop);
      await page
        .getByTestId("host-count-available")
        .filter({ hasText: /^2$/ })
        .waitFor();
      const href = await page
        .getByTestId("open-pickup-companion")
        .getAttribute("href");
      assert.ok(
        href,
        "Configure NEXT_PUBLIC_IT_COMPANION_BASE_URL for exact-drop href verification",
      );
      assert.equal(new URL(href).pathname, `/p/owl-whats-left-${drop.id}`);
      hosts.push({ page, drop });
      return drop;
    }
    const first = await publish(destinations[0]);
    const second = await publish(destinations[1]);
    for (const building of destinations)
      await projector
        .getByTestId(`distribution-building-${building.id}`)
        .waitFor();
    const late = await join("Synthetic Late Join");
    assert.equal(
      (await request("/students/me/invites", late.token)).invites.length,
      0,
    );
    const feed = async (who) => request("/students/me/feed", who.token);
    for (const who of [student, late, mismatch]) {
      const response = await feed(who);
      assert.equal(response.drops.length, 2);
      assert.deepEqual(
        new Set(response.drops.map((d) => d.drop.id)),
        new Set([first.id, second.id]),
      );
      privateSafe(response);
    }
    const incompatible = (await feed(mismatch)).drops;
    assert.ok(
      incompatible.every(
        (d) => !d.can_reserve && d.unavailable_reason === "diet_mismatch",
      ),
    );
    const tile = (who, id) => who.page.getByTestId(`feed-drop-card-${id}`);
    for (const who of [student, late, mismatch]) {
      await tile(who, first.id).waitFor();
      await tile(who, second.id).waitFor();
      await who.page
        .getByText("may contain, confirm with host", { exact: false })
        .first()
        .waitFor();
    }
    assert.equal(
      await tile(mismatch, first.id)
        .getByRole("button", { name: /reserve/i })
        .isDisabled(),
      true,
    );
    mark("location_free_multi_building_feed_late_join_and_disabled_diet_tile");
    const href = await tile(late, first.id)
      .getByTestId(`get-directions-link-${first.id}`)
      .getAttribute("href");
    const directions = new URL(href);
    assert.equal(directions.origin, "https://www.google.com");
    assert.equal(directions.pathname, "/maps/dir/");
    assert.equal(directions.searchParams.get("api"), "1");
    assert.equal(
      directions.searchParams.get("destination"),
      `${destinations[0].latitude},${destinations[0].longitude}`,
    );
    assert.equal(directions.searchParams.get("travelmode"), "walking");
    assert.equal(directions.searchParams.has("origin"), false);
    mark("exact_walking_directions_without_origin", { href });
    await request("/students/me/preferences", late.token, "PUT", {
      allergens: [],
      diets: [],
      alerts_paused: true,
    });
    assert.ok((await feed(late)).drops.every((item) => item.can_reserve));
    await tile(late, first.id)
      .getByRole("button", { name: /reserve/i })
      .click();
    await late.page.getByTestId("active-claim-banner").waitFor();
    const held = (await feed(late)).drops.find(
      (d) => d.drop.id === first.id,
    ).claim;
    assert.equal(held.status, "held");
    const retry = await request(
      `/drops/${first.id}/reserve`,
      late.token,
      "POST",
    );
    assert.equal(retry.id, held.id);
    const blocked = await request(
      `/drops/${second.id}/reserve`,
      late.token,
      "POST",
      undefined,
      409,
    );
    assert.equal(blocked.detail.code, "active_claim");
    await hosts[0].page
      .getByTestId("host-count-held")
      .filter({ hasText: /^1$/ })
      .waitFor();
    await late.page.getByTestId("pickup-release-button").click();
    await hosts[0].page
      .getByTestId("host-count-available")
      .filter({ hasText: /^2$/ })
      .waitFor();
    assert.equal(
      (await feed(late)).drops.find((d) => d.drop.id === first.id).claim.status,
      "released",
    );
    const releasedTile = (await feed(late)).drops.find(
      (item) => item.drop.id === first.id,
    );
    assert.equal(releasedTile.can_reserve, false);
    assert.equal(releasedTile.unavailable_reason, "already_reserved");
    const denied = await request(
      `/drops/${first.id}/reserve`,
      mismatch.token,
      "POST",
      undefined,
      409,
    );
    assert.equal(denied.detail.code, "diet_mismatch");
    mark("invite_free_reserve_idempotent_global_hold_and_release_restore");
    await tile(student, second.id)
      .getByRole("button", { name: /reserve/i })
      .click();
    await student.page.getByTestId("active-claim-banner").waitFor();
    const pickupClaim = (await feed(student)).drops.find(
      (d) => d.drop.id === second.id,
    ).claim;
    const bypass = await request(
      `/claims/${pickupClaim.id}/pickup`,
      student.token,
      "POST",
      undefined,
      409,
    );
    assert.equal(bypass.detail.code, "pickup_verification_required");
    const pickupPhoto = student.page.locator(
      'input[type="file"][capture="environment"]',
    );
    const assessmentResponse = student.page.waitForResponse(
      (r) =>
        /\/claims\/[^/]+\/pickup-photo$/.test(new URL(r.url()).pathname) &&
        r.request().method() === "POST",
    );
    await pickupPhoto.setInputFiles({
      name: "synthetic-pickup.png",
      mimeType: "image/png",
      buffer: photo,
    });
    const assessment = await (await assessmentResponse).json();
    assert.equal(assessment.source, "fixture");
    assert.equal(assessment.match_status, "consistent");
    assert.equal(assessment.can_confirm, true);
    assert.equal(
      (await request(`/drops/${second.id}`, "demo-host")).counts.picked_up,
      0,
    );
    await student.page
      .getByText(
        "Photo-assisted confirmation. A photo cannot independently establish physical pickup or food safety.",
        { exact: false },
      )
      .first()
      .waitFor();
    await student.page.screenshot({
      path: `${out}/pickup-consistent-before-completion.png`,
      fullPage: true,
    });
    await student.page.getByTestId("pickup-confirm-button").click();
    await student.page.getByTestId("picked-up-card").waitFor();
    await hosts[1].page
      .getByTestId("host-count-picked-up")
      .filter({ hasText: /^1$/ })
      .waitFor();
    const completedRetry = await request(
      `/claims/${pickupClaim.id}/pickup`,
      student.token,
      "POST",
      { verification_id: assessment.id },
    );
    assert.equal(completedRetry.status, "picked_up");
    assert.equal(
      (await request(`/drops/${second.id}`, "demo-host")).counts.picked_up,
      1,
    );
    mark(
      "photo_assessment_does_not_pick_up_explicit_completion_counts_and_idempotence",
    );
    const racers = await Promise.all([
      join("Synthetic Race One"),
      join("Synthetic Race Two"),
    ]);
    const race = await Promise.all(
      racers.map(async (who) => {
        const response = await fetch(
          `${web}/backend/drops/${second.id}/reserve`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${who.token}` },
          },
        );
        return { status: response.status, body: await response.json(), who };
      }),
    );
    assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
    const winner = race.find((result) => result.status === 200);
    assert.equal(
      race.find((result) => result.status === 409).body.detail.code,
      "capacity",
    );
    assert.deepEqual(
      (await request(`/drops/${second.id}`, "demo-host")).counts,
      {
        total: 2,
        available: 0,
        held: 1,
        picked_up: 1,
        pantry_held: 0,
        pantry_transferred: 0,
      },
    );
    await request(
      `/claims/${winner.body.id}/release`,
      winner.who.token,
      "POST",
    );
    mark("concurrent_last_serving_serialized_and_release_restores");
    const expiring = await join("Synthetic Expiry");
    const expiringClaim = await request(
      `/drops/${first.id}/reserve`,
      expiring.token,
      "POST",
    );
    await request("/demo/tick", "demo-projector", "POST", {
      advance_seconds: 601,
    });
    const expired = (await feed(expiring)).drops.find(
      (d) => d.drop.id === first.id,
    );
    assert.equal(expired.claim.id, expiringClaim.id);
    assert.equal(expired.claim.status, "expired");
    assert.equal(expired.drop.counts.available, 2);
    mark("hold_expiry_restores_capacity", { demo_advance_seconds: 601 });
    const distribution = await request("/distribution", "demo-projector");
    assert.equal(distribution.active_drops, 2);
    assert.equal(distribution.buildings.length, 2);
    assert.deepEqual(distribution.counts, {
      total: 4,
      available: 3,
      held: 0,
      picked_up: 1,
      pantry_held: 0,
      pantry_transferred: 0,
    });
    privateSafe(distribution);
    assert.doesNotMatch(
      JSON.stringify(distribution),
      /nickname|h3_cell|ring_distance|allergens|priority/i,
    );
    for (const drop of [first, second]) {
      const dispatch = await request(
        `/drops/${drop.id}/dispatch`,
        "demo-projector",
      );
      assert.equal(dispatch.next_wave_at, null);
      assert.deepEqual(dispatch.visitors, []);
      assert.deepEqual(dispatch.personas, []);
    }
    assert.equal(
      await projector
        .locator('[data-testid^="visitor-row-"], [data-testid^="persona-row-"]')
        .count(),
      0,
    );
    await projector
      .getByTestId("visitor-count")
      .filter({ hasText: `${distribution.joined_students} joined` })
      .waitFor();
    await projector
      .getByTestId("distribution-active-drops")
      .filter({ hasText: /^2$/ })
      .waitFor();
    await projector
      .getByTestId("dispatch-count-available")
      .filter({ hasText: /^3$/ })
      .waitFor();
    await projector
      .getByTestId("dispatch-count-held")
      .filter({ hasText: /^0$/ })
      .waitFor();
    await projector
      .getByTestId("dispatch-count-picked-up")
      .filter({ hasText: /^1$/ })
      .waitFor();
    assert.equal(
      await projector
        .locator('li[data-testid^="distribution-building-"]')
        .count(),
      2,
    );
    mark(
      "projector_two_building_aggregate_without_student_geography",
      distribution,
    );
    await late.page.goto(`${web}/student?drop=${second.id}`);
    await tile(late, second.id).waitFor();
    // Highlight the authenticated feed tile targeted by a notification tap.
    assert.ok(
      await tile(late, second.id).evaluate(
        (el) =>
          el.matches(":focus") ||
          el.contains(document.activeElement) ||
          el.getAttribute("data-focused") === "true",
      ),
    );
    mark("notification_drop_deeplink_focus");
    assert.ok(joinBodies.length >= 4);
    for (const body of joinBodies) {
      assert.equal(Object.hasOwn(body, "area"), false);
      assert.doesNotMatch(JSON.stringify(body), /latitude|longitude|h3_cell/);
    }
    for (const [index, page] of pages.entries()) {
      assert.equal(await page.evaluate(() => window.owlGpsAttempts), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        "No horizontal overflow",
      );
      await page.screenshot({
        path: `${out}/${String(index).padStart(2, "0")}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    mark("no_location_payload_no_gps_no_browser_errors_no_mobile_overflow");
    evidence.status = "PASS";
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = error.stack;
    process.exitCode = 1;
    for (const [index, page] of pages.entries())
      await page
        .screenshot({ path: `${out}/failure-${index}.png`, fullPage: true })
        .catch(() => {});
  } finally {
    if (browser) await browser.close();
    fs.writeFileSync(
      `${out}/evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(JSON.stringify(evidence, null, 2));
  }
})();
