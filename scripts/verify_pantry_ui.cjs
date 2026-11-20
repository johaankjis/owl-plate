/** Actual desktop/mobile UI flow against the integrated candidate. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const h = require("./pantry_harness.cjs");
const { chromium } = require(
  process.env.OWL_PLAYWRIGHT_MODULE || "playwright-core",
);
const out = "test-results/pantry-ui";
// Stable selectors from the completed frontend contract.
const pantryCard = (page) => page.getByTestId("host-pantry-card");
const coordinatorCard = (page, id) =>
  page.getByTestId(`pantry-referral-card-${id}`);
async function exactCount(page, id, value) {
  await page
    .getByTestId(id)
    .filter({ hasText: new RegExp(`^${value}$`) })
    .waitFor();
}
async function policy(card) {
  await card
    .getByText(/KSU catering policy prohibits removing leftovers/)
    .waitFor();
  assert.equal(
    await card
      .locator(
        'a[href="https://campus.kennesaw.edu/offices-services/catering/policies.php"]',
      )
      .count(),
    1,
  );
  assert.equal(
    await card
      .locator(
        'a[href="https://campus.kennesaw.edu/current-students/student-affairs/wellbeing/care-services/"]',
      )
      .count(),
    1,
  );
}
(async () => {
  const evidence = h.evidence(
    "Actual mobile and desktop browser UI; route snapshots supplement UI assertions",
  );
  let browser;
  const errors = [];
  const coordinatorAuth = [];
  try {
    await h.reset();
    browser = await chromium.launch({
      executablePath: process.env.OWL_BROWSER_EXECUTABLE,
      headless: true,
      args: ["--no-sandbox"],
    });
    fs.mkdirSync(out, { recursive: true });
    for (const mobile of [true, false]) {
      await h.reset();
      const mode = mobile ? "mobile" : "desktop";
      const contexts = [];
      async function open(path) {
        const context = await browser.newContext({
          viewport: mobile
            ? { width: 390, height: 844 }
            : { width: 1440, height: 1000 },
          isMobile: mobile,
          hasTouch: mobile,
        });
        contexts.push(context);
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
        page.on("pageerror", (error) => errors.push(error.message));
        if (path === "/pantry")
          page.on("request", (req) => {
            if (new URL(req.url()).pathname.startsWith("/backend/pantry/"))
              coordinatorAuth.push(req.headers().authorization);
          });
        await page.goto(`${h.web}${path}`);
        return page;
      }
      async function publishUI() {
        const host = await open("/host");
        const building = (await h.request("/buildings")).buildings[0];
        await host.getByTestId("food-photo-input").setInputFiles({
          name: "synthetic.png",
          mimeType: "image/png",
          buffer: h.photo,
        });
        await host.getByTestId("analyze-photo-button").click();
        await host.getByTestId("servings-input").fill("2");
        await host.getByTestId("host-building-search").fill(building.name);
        await host.getByTestId(`host-building-option-${building.id}`).click();
        await host.getByTestId("room-input").fill("Synthetic pantry rehearsal");
        for (const check of ["covered", "two-hours", "untouched"])
          await host.getByTestId(`safety-check-${check}`).check();
        const published = host.waitForResponse(
          (r) =>
            /\/drops\/[^/]+\/publish$/.test(new URL(r.url()).pathname) &&
            r.request().method() === "POST",
        );
        await host.getByTestId("publish-drop-button").click();
        const drop = await (await published).json();
        await exactCount(host, "host-count-available", 2);
        const companion = await host
          .getByTestId("open-pickup-companion")
          .getAttribute("href");
        assert.equal(
          new URL(companion).pathname,
          `/p/owl-whats-left-${drop.id}`,
        );
        return { host, drop, building };
      }
      const { host, drop, building } = await publishUI();
      const projector = await open("/dispatch");
      const student = await open("/join");
      await student
        .getByTestId("join-nickname-input")
        .fill(`Synthetic Pantry ${mode}`);
      await student.getByTestId("join-submit").click();
      await student.waitForURL(/\/student/);
      await student
        .getByTestId(`feed-drop-card-${drop.id}`)
        .getByRole("button", { name: /reserve/i })
        .click();
      await student.getByTestId("active-claim-banner").waitFor();
      await student
        .locator('input[type="file"][capture="environment"]')
        .setInputFiles({
          name: "synthetic-pickup.png",
          mimeType: "image/png",
          buffer: h.photo,
        });
      await student
        .getByTestId("pickup-confirm-button")
        .waitFor({ state: "visible" });
      h.counts(
        await h.request(`/drops/${drop.id}`, h.host),
        [2, 1, 1, 0, 0, 0],
      );
      await student.getByTestId("pickup-confirm-button").click();
      await student.getByTestId("picked-up-card").waitFor();
      await exactCount(host, "host-count-picked-up", 1);
      await student.getByTestId("student-view-map-button").click();
      await student.getByTestId(`campus-map-marker-${building.id}`).waitFor();
      const card = pantryCard(host);
      await policy(card);
      assert.equal(
        (await h.referral(drop)).referral,
        null,
        "Manual request precedes suggestion",
      );
      await card.getByTestId("host-pantry-policy-checkbox").check();
      const requested = host.waitForResponse(
        (r) =>
          new URL(r.url()).pathname ===
            `/backend/drops/${drop.id}/pantry-referral` &&
          r.request().method() === "POST",
      );
      await card.getByTestId("host-pantry-request-button").click();
      const item = await (await requested).json();
      assert.equal(item.status, "requested");
      const coordinator = await open("/pantry");
      const queued = coordinatorCard(coordinator, item.id);
      await policy(queued);
      await queued.getByTestId(`pantry-policy-ack-${item.id}`).check();
      await queued.getByTestId(`pantry-accept-button-${item.id}`).click();
      await exactCount(host, "host-count-pantry-held", 1);
      await student
        .getByTestId(`campus-map-marker-${building.id}`)
        .waitFor({ state: "hidden" });
      h.counts(
        await h.request(`/drops/${drop.id}`, h.host),
        [2, 0, 0, 1, 1, 0],
      );
      await card.getByTestId("host-pantry-handoff-checkbox").check();
      await card.getByTestId("host-pantry-handoff-button").click();
      await exactCount(host, "host-count-pantry-transferred", 1);
      await exactCount(host, "host-count-pantry-held", 0);
      await exactCount(projector, "dispatch-count-available", 0);
      await exactCount(projector, "dispatch-count-held", 0);
      await exactCount(projector, "dispatch-count-pantry-held", 0);
      await exactCount(projector, "dispatch-count-picked-up", 1);
      const mapBuilding = projector.getByTestId(
        `projector-map-building-${building.id}`,
      );
      for (const [key, value] of Object.entries({
        available: 0,
        reserved: 0,
        collected: 1,
        "pantry-held": 0,
        "pantry-transferred": 1,
      })) {
        await projector.waitForFunction(
          ({ id, key, value }) =>
            document
              .querySelector(`[data-testid="${id}"]`)
              ?.getAttribute(`data-${key}`) === String(value),
          { id: `projector-map-building-${building.id}`, key, value },
        );
      }
      assert.equal(
        await mapBuilding.getAttribute("data-latitude"),
        String(building.latitude),
      );
      await exactCount(projector, "dispatch-count-pantry-transferred", 1);
      h.counts(
        (await h.request("/distribution", h.projector)).counts,
        [2, 0, 0, 1, 0, 1],
      );
      const it = JSON.parse(
        execFileSync(
          "python3",
          [
            "prototypes/itcan/whats_left.py",
            "--base",
            h.web,
            "--drop-id",
            drop.id,
          ],
          { encoding: "utf8" },
        ),
      );
      h.counts(it, [2, 0, 0, 1, 0, 1]);
      assert.equal(it.drop_id, drop.id);
      assert.equal(
        await student.getByRole("link", { name: /coordinator/i }).count(),
        0,
      );
      for (const [name, page] of Object.entries({
        host,
        student,
        coordinator,
        projector,
      })) {
        assert.equal(await page.evaluate(() => window.owlGpsAttempts), 0);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${mode} ${name} overflow`,
        );
        await page.screenshot({
          path: `${out}/${mode}-${name}.png`,
          fullPage: true,
        });
      }
      evidence.events.push({
        mode,
        drop_id: drop.id,
        referral_id: item.id,
        final_counts: [2, 0, 0, 1, 0, 1],
        exact_drop_it_helper:
          "actual helper against route; paired It unverified",
        automatic_polling: true,
      });
      for (const context of contexts) await context.close();
      contexts.length = 0;
      // Both viewports exercise suggestion, rejection, and requested/accepted expiry.
      for (const phase of [
        "suggest-reject",
        "requested-expiry",
        "accepted-expiry",
      ]) {
        await h.reset();
        const { host: phaseHost, drop: phaseDrop } = await publishUI();
        const phaseCard = pantryCard(phaseHost);
        const phaseCoordinator = await open("/pantry");
        await phaseCoordinator.getByTestId("pantry-empty-state").waitFor();
        await phaseCard
          .filter({ has: phaseHost.getByTestId("host-pantry-status") })
          .waitFor();
        if (phase === "suggest-reject") {
          await h.advance(2040);
          assert.equal((await h.referral(phaseDrop)).referral, null);
          await h.advance(61);
          await phaseHost.waitForFunction(
            () =>
              document
                .querySelector('[data-testid="host-pantry-card"]')
                ?.getAttribute("data-status") === "suggested",
          );
          const suggestion = (await h.referral(phaseDrop)).referral;
          await coordinatorCard(phaseCoordinator, suggestion.id).waitFor();
          assert.equal(
            await phaseCoordinator
              .getByTestId(`pantry-accept-button-${suggestion.id}`)
              .count(),
            0,
          );
        }
        await phaseCard.getByTestId("host-pantry-servings-input").fill("1");
        await phaseCard.getByTestId("host-pantry-policy-checkbox").check();
        await phaseCard.getByTestId("host-pantry-request-button").click();
        await phaseHost.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="host-pantry-card"]')
              ?.getAttribute("data-status") === "requested",
        );
        const phaseItem = (await h.referral(phaseDrop)).referral;
        const phaseQueued = coordinatorCard(phaseCoordinator, phaseItem.id);
        await phaseQueued.waitFor();
        await phaseQueued
          .getByTestId(`pantry-policy-ack-${phaseItem.id}`)
          .check();
        if (phase === "suggest-reject") {
          await phaseQueued
            .getByTestId(`pantry-reject-button-${phaseItem.id}`)
            .click();
          await phaseHost.waitForFunction(
            () =>
              document
                .querySelector('[data-testid="host-pantry-card"]')
                ?.getAttribute("data-status") === "rejected",
          );
          await exactCount(phaseHost, "host-count-available", 2);
          h.counts(
            await h.request(`/drops/${phaseDrop.id}`, h.host),
            [2, 2, 0, 0, 0, 0],
          );
        } else {
          if (phase === "accepted-expiry") {
            await phaseQueued
              .getByTestId(`pantry-accept-button-${phaseItem.id}`)
              .click();
            await exactCount(phaseHost, "host-count-pantry-held", 1);
            await phaseCard.getByTestId("host-pantry-handoff-checkbox").check();
          }
          await h.advance(2701);
          // Existing host expiry behavior returns to upload and removes stale actions.
          await phaseCard.waitFor({ state: "hidden" });
          await phaseHost
            .getByTestId("food-photo-input")
            .waitFor({ state: "attached" });
          await phaseCoordinator.waitForFunction(
            (id) =>
              document
                .querySelector(`[data-testid="pantry-referral-card-${id}"]`)
                ?.getAttribute("data-status") === "expired",
            phaseItem.id,
          );
          assert.equal(
            await phaseCard.getByTestId("host-pantry-handoff-button").count(),
            0,
          );
          assert.equal(
            await phaseQueued
              .getByTestId(`pantry-accept-button-${phaseItem.id}`)
              .count(),
            0,
          );
          await h.handoff(phaseDrop, 409);
          await h.decide(phaseItem, "accept", 1, 409);
          assert.equal(
            (await h.request("/distribution", h.projector)).active_drops,
            0,
          );
        }
        await phaseHost.screenshot({
          path: `${out}/${mode}-${phase}-host.png`,
          fullPage: true,
        });
        await phaseCoordinator.screenshot({
          path: `${out}/${mode}-${phase}-coordinator.png`,
          fullPage: true,
        });
        evidence.events.push({
          mode,
          phase,
          drop_id: phaseDrop.id,
          referral_id: phaseItem.id,
          demo_clock_labeled_in_evidence: true,
        });
        for (const context of contexts) await context.close();
        contexts.length = 0;
      }
    }
    assert.ok(coordinatorAuth.length > 0);
    assert.ok(
      coordinatorAuth.every(
        (value) => value === "Bearer demo-pantry-coordinator",
      ),
    );
    evidence.coordinator_role_verified_on_actual_requests = true;
    assert.deepEqual(errors, []);
    evidence.status = "PASS";
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = error.stack;
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      `${out}/evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(JSON.stringify(evidence, null, 2));
  }
})();
