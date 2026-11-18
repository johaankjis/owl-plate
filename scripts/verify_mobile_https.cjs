/** Prove mobile browser flows through the real web app over local HTTPS; no physical push. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, devices } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);
const origin = process.env.OWL_HTTPS_ORIGIN || "https://localhost:3443";
const out = process.env.OWL_MOBILE_ARTIFACTS || "test-results/mobile-https";
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const runs = [];
  for (const [engine, phone, type] of [
    ["chromium", "Pixel 7", chromium],
    ["chromium-iphone-layout", "iPhone 13", chromium],
  ]) {
    const browser = await type.launch(
      engine.startsWith("chromium")
        ? {
            executablePath: process.env.OWL_BROWSER_EXECUTABLE,
            headless: true,
            args: ["--no-sandbox"],
          }
        : { headless: true },
    );
    const errors = [],
      requests = [];
    try {
      const hostCtx = await browser.newContext({
        ...devices[phone],
        ignoreHTTPSErrors: true,
      });
      const studentCtx = await browser.newContext({
        ...devices[phone],
        ignoreHTTPSErrors: true,
      });
      async function request(path, method = "GET", token = "demo-host", data) {
        const r = await hostCtx.request.fetch(origin + "/backend" + path, {
          method,
          headers: { Authorization: `Bearer ${token}` },
          data,
        });
        assert.equal(r.status(), 200);
        return r.json();
      }
      await request("/demo/reset", "POST");
      const host = await hostCtx.newPage(),
        student = await studentCtx.newPage();
      for (const p of [host, student]) {
        p.on("pageerror", (e) => errors.push(e.message));
        p.on("request", (r) => {
          if (/^https?:/.test(r.url())) requests.push(r.url());
        });
      }
      await host.goto(origin + "/");
      await host.getByTestId("nav-card-host").click();
      await student.goto(origin + "/student");
      assert.equal(await host.evaluate(() => window.isSecureContext), true);
      await host
        .getByTestId("food-photo-input")
        .setInputFiles("/tmp/owl-browser-run/synthetic-photo.png");
      await host.getByTestId("analyze-photo-button").click();
      await host.getByTestId("servings-input").waitFor();
      assert.equal(
        await host.getByTestId("publish-drop-button").isDisabled(),
        true,
      );
      await host.screenshot({
        path: `${out}/${engine}-host-review.png`,
        fullPage: true,
      });
      await host.getByTestId("servings-input").fill("2");
      for (const name of ["covered", "two-hours", "untouched"])
        await host.getByTestId(`safety-check-${name}`).check();
      await host.getByTestId("publish-drop-button").click();
      let dropId;
      await host.waitForFunction(
        () =>
          !document.querySelector('[data-testid="publish-drop-button"]')
            ?.disabled,
      );
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = await request("/demo/active-drop");
        dropId = x.drop_id;
        if (dropId) {
          const s = await request(
            `/drops/${dropId}/dispatch`,
            "GET",
            "demo-projector",
          );
          if (s.waves.length) break;
        }
        await host.waitForTimeout(200);
      }
      let state = await request(
        `/drops/${dropId}/dispatch`,
        "GET",
        "demo-projector",
      );
      assert.equal(state.ring_k, 2);
      assert.deepEqual(
        state.personas
          .filter((p) => p.status === "sent")
          .map((p) => p.label)
          .sort(),
        ["A", "C"],
      );
      await student.getByTestId("refresh-invites-button").click();
      await student
        .locator('[data-testid^="claim-invite-button-"]')
        .first()
        .waitFor();
      await student.getByTestId("switch-demo-student-C").click();
      await student.locator('[data-testid^="invite-card-"]').waitFor();
      await student.getByTestId("switch-demo-student-B").click();
      await student.getByTestId("no-invites-card").waitFor();
      await student.getByTestId("switch-demo-student-A").click();
      const claim = student
        .locator('[data-testid^="claim-invite-button-"]')
        .first();
      await claim.waitFor();
      await claim.click();
      await student.getByTestId("active-claim-banner").waitFor();
      await student.screenshot({
        path: `${out}/${engine}-student-held.png`,
        fullPage: true,
      });
      state = await request(
        `/drops/${dropId}/dispatch`,
        "GET",
        "demo-projector",
      );
      assert.equal(state.counts.held, 1);
      assert.equal(state.counts.available, 1);
      await host.getByTestId("demo-advance-60s-button").click();
      state = await request(
        `/drops/${dropId}/dispatch`,
        "GET",
        "demo-projector",
      );
      assert.equal(state.ring_k, 4);
      assert.equal(state.personas.find((p) => p.label === "D").status, "sent");
      await student.getByTestId("switch-demo-student-D").click();
      await student.locator('[data-testid^="invite-card-"]').waitFor();
      await request("/demo/reset", "POST");
      const survey = await hostCtx.newPage();
      survey.on("pageerror", (e) => errors.push(e.message));
      await survey.goto(origin + "/survey");
      await survey.getByTestId("survey-preview").waitFor();
      assert.equal(
        await survey
          .getByRole("button", { name: "Preview submission", exact: true })
          .isDisabled(),
        true,
      );
      await survey.screenshot({
        path: `${out}/${engine}-survey.png`,
        fullPage: true,
      });
      await survey.locator('input[name="campus"][value="Marietta"]').check();
      await survey
        .getByRole("button", { name: "Skip / clear answer" })
        .first()
        .click();
      assert.equal(
        await survey.locator('input[name="campus"]:checked').count(),
        0,
      );
      await survey.locator('input[name="campus"][value="Both"]').check();
      await survey.getByRole("checkbox").check();
      await survey
        .getByRole("button", { name: "Preview submission", exact: true })
        .click();
      await survey
        .getByRole("status")
        .filter({ hasText: "No response was saved or counted." })
        .waitFor();
      for (const p of [host, student, survey])
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          "No horizontal overflow on phone",
        );
      assert.deepEqual(errors, []);
      assert.ok(
        requests.every((url) => url.startsWith(origin + "/")),
        "No browser-localhost API or mixed content",
      );
      await request("/demo/reset", "POST");
      runs.push({
        engine,
        phone_emulation: phone,
        status: "PASS",
        secure_context: true,
        flow: "host upload/review/checklist/publish; A+C invites; B skipped; A holds; explicit +60s demo clock; D wave2; survey preview/skip/consent; reset",
        page_errors: errors,
        physical_push: "unverified",
      });
      console.log(`${engine}: mobile HTTPS host/student/survey PASS`);
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    `${out}/results.json`,
    JSON.stringify(
      {
        origin,
        tls: "Local self-signed test certificate explicitly trusted by test browser, not publicly deployed",
        runs,
        evidence:
          "Synthetic image, fixture vision, simulated notifications; browser emulation, not physical devices",
      },
      null,
      2,
    ) + "\n",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
