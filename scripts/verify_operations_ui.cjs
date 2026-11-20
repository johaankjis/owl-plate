/** Recorded-size acceptance against candidate only; screenshots are not physical evidence. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const h = require("./pantry_harness.cjs");
const { chromium } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);
const out = "test-results/operations-ui";
const evidence = h.evidence(
  "Actual iPhone390/Android412/desktop1440 browser actions and polled analytics; fixture vision, simulated notifications",
);
const errors = [];
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.scroll <= dimensions.width + 1,
    `${page.url()} overflow ${JSON.stringify(dimensions)}`,
  );
}
async function screenshot(page, name) {
  await noOverflow(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
(async () => {
  let browser;
  try {
    fs.mkdirSync(out, { recursive: true });
    await h.reset();
    browser = await chromium.launch({
      executablePath: process.env.OWL_BROWSER_EXECUTABLE,
      headless: true,
      args: ["--no-sandbox"],
    });
    for (const [mode, width, height, mobile] of [
      ["iphone", 390, 844, true],
      ["android", 412, 915, true],
      ["desktop", 1440, 1000, false],
    ]) {
      await h.reset();
      const contexts = [];
      async function open(path) {
        const context = await browser.newContext({
          viewport: { width, height },
          isMobile: mobile,
          hasTouch: mobile,
        });
        contexts.push(context);
        context.setDefaultTimeout(25000);
        await context.addInitScript(() => {
          window.owlGpsAttempts = 0;
          for (const method of ["getCurrentPosition", "watchPosition"])
            Object.defineProperty(navigator.geolocation, method, {
              value: () => {
                window.owlGpsAttempts++;
                throw Error("GPS forbidden");
              },
            });
        });
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`${h.web}${path}`);
        return page;
      }
      const dashboard = await open("/dispatch");
      await dashboard
        .getByRole("heading", { name: "Food Rescue Analytics", exact: true })
        .waitFor();
      await dashboard.getByTestId("operations-kpi-shared").waitFor();
      await screenshot(dashboard, `${mode}-analytics-empty`);
      assert.doesNotMatch(
        await dashboard.locator("body").innerText(),
        /Live Gemini|OpenRouter|H3|Join the campus feed|Advance clock|API connected|seeded persona/i,
      );
      const host = await open("/host");
      await host.getByTestId("food-photo-input").setInputFiles({
        name: "synthetic-food.png",
        mimeType: "image/png",
        buffer: h.photo,
      });
      await host.getByTestId("analyze-photo-button").click();
      await host.getByTestId("servings-input").fill("3");
      const building = (await h.request("/buildings")).buildings[0];
      await host.getByTestId("host-building-search").fill(building.name);
      await host.getByTestId(`host-building-option-${building.id}`).click();
      await host
        .getByTestId("room-input")
        .fill("Synthetic analytics acceptance");
      for (const key of ["covered", "two-hours", "untouched"])
        await host.getByTestId(`safety-check-${key}`).check();
      const published = host.waitForResponse(
        (r) =>
          /\/drops\/[^/]+\/publish$/.test(new URL(r.url()).pathname) &&
          r.request().method() === "POST",
      );
      await host.getByTestId("publish-drop-button").click();
      const drop = await (await published).json();
      await host.getByTestId("host-drop-panel").waitFor();
      await dashboard.bringToFront();
      await dashboard
        .getByTestId(`operations-listing-photo-${drop.id}`)
        .locator("[data-photo-state='loaded']")
        .or(
          dashboard.locator(
            `[data-testid="operations-listing-photo-${drop.id}"][data-photo-state="loaded"]`,
          ),
        )
        .first()
        .waitFor();
      for (let i = 0; i < 2; i++) {
        const student = await open("/join");
        await student
          .getByTestId("join-nickname-input")
          .fill(`Synthetic ${mode} ${i}`);
        await student.getByTestId("join-submit").click();
        await student.waitForURL(/\/student/);
        await student.getByTestId("student-search-input").fill(building.name);
        await student.getByTestId(`view-details-button-${drop.id}`).click();
        await student.waitForURL(new RegExp(`/student/drops/${drop.id}`));
        await student.locator('[data-photo-state="loaded"]').first().waitFor();
        await student.getByTestId("detail-reserve-btn").click();
        await student.getByTestId("active-claim-banner").waitFor();
        const directions = new URL(
          await student.getByTestId("get-directions-link").getAttribute("href"),
        );
        assert.equal(directions.searchParams.has("origin"), false);
        assert.equal(directions.searchParams.get("travelmode"), "walking");
        await student.getByTestId("pickup-photo-input").setInputFiles({
          name: "synthetic-pickup.png",
          mimeType: "image/png",
          buffer: h.photo,
        });
        await student.getByTestId("pickup-confirm-button").waitFor();
        await student.getByTestId("pickup-confirm-button").click();
        await student.getByTestId("detail-picked-up-banner").waitFor();
        await noOverflow(student);
        assert.equal(await student.evaluate(() => window.owlGpsAttempts), 0);
      }
      await host
        .getByTestId("host-count-picked-up")
        .filter({ hasText: /^2$/ })
        .waitFor();
      const card = host.getByTestId("host-pantry-card");
      await card.getByTestId("host-pantry-policy-checkbox").check();
      await card.getByTestId("host-pantry-request-button").click();
      const coordinator = await open("/pantry");
      const item = (await h.referral(drop)).referral;
      const request = coordinator.getByTestId(
        `pantry-referral-card-${item.id}`,
      );
      await request.waitFor();
      await screenshot(coordinator, `${mode}-pantry-incoming`);
      await request.getByTestId(`pantry-policy-ack-${item.id}`).check();
      await request.getByTestId(`pantry-accept-button-${item.id}`).click();
      await host.getByTestId("host-pantry-handoff-checkbox").check();
      await host.getByTestId("host-pantry-handoff-button").click();
      await host
        .getByTestId("host-count-pantry-transferred")
        .filter({ hasText: /^1$/ })
        .waitFor();
      // A new successful poll, plus visible KPI assertions, proves automatic update without navigation.
      await dashboard.bringToFront();
      const response = await dashboard.waitForResponse(async (r) => {
        if (
          !new URL(r.url()).pathname.endsWith("/analytics/operations") ||
          r.status() !== 200
        )
          return false;
        return (await r.json()).summary.pantry_transfers === 1;
      });
      const summary = (await response.json()).summary;
      for (const [key, value] of Object.entries({
        total_servings_offered: 3,
        student_pickups: 2,
        pantry_transfers: 1,
        available_servings: 0,
        student_reserved_servings: 0,
        pantry_reserved_servings: 0,
        combined_recovery_rate_percent: 100,
      }))
        assert.equal(summary[key], value, key);
      assert.equal(summary.student_pickup_rate_percent.toFixed(1), "66.7");
      await dashboard.getByText("66.7%", { exact: true }).first().waitFor();
      await screenshot(dashboard, `${mode}-analytics-acceptance`);
      await screenshot(host, `${mode}-host-handoff`);
      assert.doesNotMatch(
        await coordinator.locator("body").innerText(),
        /Live Gemini|OpenRouter|API connected|Join the campus feed|notification simulation/i,
      );
      evidence.events.push({
        viewport: mode,
        event:
          "host_upload_review_publish_student_browse_search_details_photo_pickup_twice_pantry_accept_explicit_handoff_dashboard_auto_refresh",
        summary,
      });
      await h.request("/demo/recording-dataset", h.projector, "POST", {
        confirm_reset: true,
      });
      await dashboard
        .getByText(/Recording dataset/i)
        .first()
        .waitFor();
      await screenshot(dashboard, `${mode}-analytics-recording`);
      await coordinator.reload();
      await screenshot(coordinator, `${mode}-pantry-recording`);
      const alias = await open("/impact");
      await alias
        .getByRole("heading", { name: "Food Rescue Analytics", exact: true })
        .waitFor();
      await noOverflow(alias);
      for (const context of contexts) await context.close();
    }
    assert.deepEqual(errors, []);
    evidence.browser_errors = errors;
    evidence.result = "PASS";
  } catch (err) {
    evidence.result = "FAIL";
    evidence.error = String(err.stack || err);
    evidence.browser_errors = errors;
    throw err;
  } finally {
    if (browser) await browser.close();
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
