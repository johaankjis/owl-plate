/** Actual mobile UI against the isolated fixture/log composition, no mocked routes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);
const web = process.env.OWL_WEB_URL;
assert.ok(web);
const target = new URL(web);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.port, "3027", "Candidate port 3027 only");
const expectedMatch = process.env.PICKUP_FIXTURE_STATUS;
assert.ok(
  ["uncertain", "inconsistent"].includes(expectedMatch),
  "Bad-result fixture phase required",
);
const out = `test-results/pickup-mobile-${expectedMatch}`;
const photo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6UlEQVR4nO3QQQ3AIADAQMC/DXSChfVFltwpaDrPHny0Xgf8iVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWcEFVewCbMCCAcAAAAAASUVORK5CYII=",
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
    ...(body !== undefined
      ? { body: multipart ? body : JSON.stringify(body) }
      : {}),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return data;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const evidence = {
    recorded_at: new Date().toISOString(),
    application_sha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    expected_match: expectedMatch,
    mode: "synthetic photo/people; fixture/log; actual HTTP routes and mobile UI; latency emulation for progress visibility",
    physical_pickup_proven: false,
    physical_push_verified: false,
    live_accuracy_measured: false,
    events: [],
  };
  const mark = (name, details = {}) =>
    evidence.events.push({ name, ...details });
  const errors = [],
    pages = [];
  let browser;
  try {
    const health = await request("/health");
    assert.equal(health.is_demo, true);
    assert.equal(health.vision, "fixture");
    assert.equal(health.pickup_verification, "fixture");
    assert.equal(health.notifications, "simulated");
    await request("/demo/reset", "demo-projector", "POST", {
      scenario: "visitors",
    });
    const building = (await request("/buildings")).buildings[0];
    const form = new FormData();
    form.append(
      "photo",
      new Blob([photo], { type: "image/png" }),
      "synthetic.png",
    );
    const draft = await request("/drops", "demo-host", "POST", form);
    await request(`/drops/${draft.id}`, "demo-host", "PATCH", {
      servings_final: 4,
      allergens_final: [],
      diet_tags_final: [],
      building_code: building.id,
      room: "Synthetic test",
      safety_review: {
        covered_and_temperature_safe: true,
        served_within_two_hours: true,
        untouched: true,
        ingredient_information_checked: true,
      },
    });
    const drop = await request(
      `/drops/${draft.id}/publish`,
      "demo-host",
      "POST",
    );
    const counts = async () =>
      (await request(`/drops/${drop.id}`, "demo-host")).counts;
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
      page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
      pages.push(page);
      return page;
    }
    async function join(name) {
      const page = await open(name);
      await page.goto(`${web}/join`);
      await page.getByTestId("join-nickname-input").fill(name);
      await page.getByTestId("join-submit").click();
      await page.waitForURL(/\/student/);
      const tile = page.getByTestId(`feed-drop-card-${drop.id}`);
      await tile.getByRole("button", { name: /reserve/i }).click();
      await page.getByTestId("active-claim-banner").waitFor();
      const token = await page.evaluate(() =>
        localStorage.getItem("owl-plate.session"),
      );
      const claim = (await request("/students/me/feed", token)).drops.find(
        (d) => d.drop.id === drop.id,
      ).claim;
      return { page, token, claim };
    }
    const host = await open("host");
    await host.goto(`${web}/host?drop=${drop.id}`);
    await host.getByTestId("host-pickup-reviews-panel").waitFor();
    await host
      .getByTestId("host-count-available")
      .filter({ hasText: /^4$/ })
      .waitFor();
    const a = await join("Synthetic Review");
    assert.equal(
      await a.page.getByTestId("pickup-confirm-button").isDisabled(),
      true,
    );
    const noResult = await request(
      `/claims/${a.claim.id}/pickup`,
      a.token,
      "POST",
      undefined,
      409,
    );
    assert.equal(noResult.detail.code, "pickup_verification_required");
    async function takePhoto(who, label) {
      const cdp = await who.page.context().newCDPSession(who.page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 500,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      const responsePromise = who.page.waitForResponse(
        (r) =>
          /\/pickup-photo$/.test(new URL(r.url()).pathname) &&
          r.request().method() === "POST",
      );
      await who.page.getByTestId("pickup-photo-input").setInputFiles({
        name: `${label}.png`,
        mimeType: "image/png",
        buffer: photo,
      });
      await who.page.getByTestId("pickup-photo-temp-preview").waitFor();
      assert.equal(
        await who.page.getByTestId("pickup-confirm-button").isDisabled(),
        true,
      );
      await who.page.screenshot({
        path: `${out}/${label}-progress.png`,
        fullPage: true,
      });
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      const result = await response.json();
      assert.equal(result.source, "fixture");
      assert.equal(result.match_status, expectedMatch);
      assert.equal(result.can_confirm, false);
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await cdp.detach();
      await who.page
        .getByTestId("pickup-verification-card")
        .filter({
          has: who.page.getByTestId("pickup-verification-status-badge"),
        })
        .waitFor();
      await who.page.waitForFunction(
        (status) =>
          document
            .querySelector('[data-testid="pickup-verification-card"]')
            ?.getAttribute("data-match-status") === status,
        expectedMatch,
      );
      assert.equal(
        await who.page.getByTestId("pickup-confirm-button").isDisabled(),
        true,
      );
      await who.page.getByTestId("pickup-request-review-button").waitFor();
      await who.page.waitForFunction(
        () =>
          !document.querySelector('[data-testid="pickup-photo-temp-preview"]'),
      );
      await who.page.screenshot({
        path: `${out}/${label}-result.png`,
        fullPage: true,
      });
      mark("ui_photo_progress_result_no_silent_pickup", {
        label,
        match: expectedMatch,
      });
      return result;
    }
    const first = await takePhoto(a, "01-initial");
    assert.equal((await counts()).picked_up, 0);
    await request(
      `/claims/${a.claim.id}/pickup`,
      a.token,
      "POST",
      { verification_id: first.id },
      409,
    );
    const retry = await takePhoto(a, "02-retake");
    assert.notEqual(retry.id, first.id);
    const askResponse = a.page.waitForResponse(
      (r) =>
        /\/pickup-review$/.test(new URL(r.url()).pathname) &&
        r.request().method() === "POST",
    );
    await a.page.getByTestId("pickup-request-review-button").click();
    assert.equal((await askResponse).status(), 200);
    await a.page.getByTestId("pickup-review-pending-note").waitFor();
    const reviewCard = host.getByTestId(`host-review-card-${retry.id}`);
    await reviewCard.waitFor();
    assert.doesNotMatch(
      await reviewCard.innerText(),
      /Synthetic Review|student_id|claim_id|nickname|priority/i,
    );
    assert.ok(!(await reviewCard.innerText()).includes(a.claim.id));
    await host.screenshot({
      path: `${out}/03-host-review.png`,
      fullPage: true,
    });
    await host.getByTestId(`host-review-reject-${retry.id}`).click();
    await a.page
      .getByTestId("pickup-verification-status-badge")
      .filter({ hasText: /declined/i })
      .waitFor();
    assert.equal((await counts()).picked_up, 0);
    assert.equal((await counts()).held, 1);
    mark("ui_request_host_review_deidentified_reject_keeps_hold");
    const final = await takePhoto(a, "04-after-rejection");
    await a.page.getByTestId("pickup-request-review-button").click();
    await host.getByTestId(`host-review-card-${final.id}`).waitFor();
    await host.getByTestId(`host-review-approve-${final.id}`).click();
    await a.page.getByTestId("picked-up-card").waitFor();
    await host
      .getByTestId("host-count-picked-up")
      .filter({ hasText: /^1$/ })
      .waitFor();
    assert.equal((await counts()).picked_up, 1);
    await a.page.screenshot({
      path: `${out}/05-human-approved-completion.png`,
      fullPage: true,
    });
    mark("ui_retry_after_rejection_explicit_host_approval_consumes_once");
    const b = await join("Synthetic Expiry");
    const expiring = await takePhoto(b, "06-expiry-request");
    await b.page.getByTestId("pickup-request-review-button").click();
    await host.getByTestId(`host-review-card-${expiring.id}`).waitFor();
    await request("/demo/tick", "demo-projector", "POST", {
      advance_seconds: 601,
    });
    await request(
      `/drops/${drop.id}/pickup-reviews/${expiring.id}`,
      "demo-host",
      "POST",
      { decision: "approve" },
      409,
    );
    await host
      .getByTestId(`host-review-card-${expiring.id}`)
      .waitFor({ state: "detached" });
    await b.page
      .getByTestId("active-claim-banner")
      .waitFor({ state: "detached" });
    assert.equal((await counts()).held, 0);
    assert.equal((await counts()).available, 3);
    mark(
      "route_demo_clock_expiry_ui_queue_and_hold_removed_stale_approval_409",
      { demo_advance_seconds: 601 },
    );
    for (const [index, page] of pages.entries()) {
      assert.equal(await page.evaluate(() => window.owlGpsAttempts), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: `${out}/final-${index}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
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
