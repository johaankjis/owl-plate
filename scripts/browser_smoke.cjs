/** Verify separate browser sessions through real demo routes; no external notifications. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
// Set OWL_PLAYWRIGHT_MODULE to a locally installed playwright-core package.
const { chromium } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);
const apiUrl = process.env.OWL_API_URL || "http://localhost:8017";
const webUrl = process.env.OWL_WEB_URL || "http://localhost:3017";
const artifacts = process.env.OWL_BROWSER_ARTIFACTS || "test-results/browser";

async function waitText(page, testId, expected) {
  await page.getByTestId(testId).waitFor({ state: "visible" });
  await page.waitForFunction(
    ({ testId, expected }) =>
      document
        .querySelector(`[data-testid="${testId}"]`)
        ?.textContent?.trim() === expected,
    { testId, expected },
    { timeout: 15000 },
  );
}

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const photoPath = `${artifacts}/synthetic-photo.png`;
  fs.writeFileSync(
    photoPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6UlEQVR4nO3QQQ3AIADAQMC/DXSChfVFltwpaDrPHny0Xgf8iVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWcEFVewCbMCCAcAAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const browser = await chromium.launch({
    executablePath: process.env.OWL_BROWSER_EXECUTABLE || undefined,
    env: { ...process.env },
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [];
  try {
    const reset = await fetch(`${apiUrl}/demo/reset`, {
      method: "POST",
      headers: { Authorization: "Bearer demo-host" },
    });
    assert.equal(reset.status, 200);
    const hostCtx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const projectorCtx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const studentCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const host = await hostCtx.newPage(),
      projector = await projectorCtx.newPage(),
      student = await studentCtx.newPage();
    for (const page of [host, projector, student])
      page.on("pageerror", (e) => errors.push(e.message));
    await Promise.all([
      host.goto(`${webUrl}/host`),
      projector.goto(`${webUrl}/dispatch`),
      student.goto(`${webUrl}/student`),
    ]);
    await host.getByTestId("food-photo-input").setInputFiles(photoPath);
    await host.getByTestId("analyze-photo-button").click();
    await host
      .getByTestId("servings-input")
      .waitFor({ state: "visible", timeout: 15000 });
    assert.equal(
      await host.getByTestId("publish-drop-button").isDisabled(),
      true,
    );
    await host.getByTestId("servings-input").fill("2");
    for (const name of ["covered", "two-hours", "untouched"])
      await host.getByTestId(`safety-check-${name}`).check();
    await host.getByTestId("publish-drop-button").click();
    await waitText(projector, "dispatch-ring-k", "k = 2");
    await waitText(projector, "dispatch-count-available", "2");
    await waitText(projector, "persona-status-A", "sent");
    await waitText(projector, "persona-status-C", "sent");
    assert.match(
      await projector.getByTestId("persona-row-B").innerText(),
      /allergen_conflict/,
    );
    assert.match(
      await projector.getByTestId("persona-row-D").innerText(),
      /out_of_range/,
    );
    assert.equal(
      await projector.evaluate(() =>
        localStorage.getItem("owl_plate_active_drop_id"),
      ),
      null,
    );
    await student.getByTestId("refresh-invites-button").click();
    await student
      .locator('[data-testid^="claim-invite-button-"]')
      .first()
      .waitFor({ state: "visible" });
    assert.match(
      await student.locator("body").innerText(),
      /may contain, confirm with host/,
    );
    await student
      .locator('[data-testid^="claim-invite-button-"]')
      .first()
      .click();
    await student
      .getByTestId("active-claim-banner")
      .waitFor({ state: "visible" });
    await waitText(projector, "dispatch-count-held", "1");
    await waitText(projector, "dispatch-count-available", "1");
    await student.screenshot({
      path: `${artifacts}/student-held.png`,
      fullPage: true,
    });
    await host.getByTestId("demo-advance-60s-button").click();
    await waitText(projector, "dispatch-ring-k", "k = 4");
    await waitText(projector, "persona-status-D", "sent");
    await waitText(projector, "persona-status-C", "expired");
    assert.equal(
      (await projector.locator("#deckgl-overlay").count()) > 0 ||
        (await projector.locator("canvas").count()) > 0,
      true,
    );
    assert.equal(
      await projector.locator('[data-testid^="persona-row-"]').count(),
      5,
    );
    const eBox = await projector.getByTestId("persona-row-E").boundingBox();
    assert.ok(
      eBox && eBox.y + eBox.height <= 1080,
      "All five persona explanations must fit on a Full HD projector",
    );
    const body = await projector.locator("body").innerText();
    assert.doesNotMatch(body, /CARE|priority tier|priority_tier/);
    await projector.screenshot({
      path: `${artifacts}/dispatch-wave2.png`,
      fullPage: true,
    });
    await student.getByTestId("switch-demo-student-B").click();
    await student.getByTestId("no-invites-card").waitFor({ state: "visible" });
    await student.getByTestId("switch-demo-student-D").click();
    await student
      .locator('[data-testid^="claim-invite-button-"]')
      .first()
      .waitFor({ state: "visible" });
    assert.equal(
      await student.locator('[data-testid^="invite-card-"]').count(),
      1,
    );
    await host.getByTestId("demo-reset-button").click();
    await student.getByTestId("refresh-invites-button").click();
    await student.getByTestId("no-invites-card").waitFor({ state: "visible" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: independent host/projector/mobile student contexts; actual HTTP API; upload + safety review + publish; A/C wave1; B allergen exclusion; A hold; C expiry; D ring4; deck.gl canvas; student ownership; reset; no uncaught browser errors.",
    );
    console.log(
      "Evidence: synthetic image + fixture vision + simulated notifications. This is browser proof, not physical push receipt.",
    );
  } catch (error) {
    console.error(error);
    for (const ctx of browser.contexts())
      for (const page of ctx.pages())
        console.error(
          await page
            .locator("body")
            .innerText()
            .catch(() => page.url()),
        );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
