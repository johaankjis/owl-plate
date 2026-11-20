/** Isolated real-route pickup contract rehearsal. No live vision or sends.
 * Run separately for each PICKUP_FIXTURE_STATUS; see docs/PICKUP_HANDOFF.md.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const web = process.env.OWL_WEB_URL;
assert.ok(web, "Set OWL_WEB_URL to the isolated candidate");
const target = new URL(web);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(target.port, "3027", "Candidate port 3027 only");
const expectedMatch = process.env.PICKUP_FIXTURE_STATUS || "consistent";
assert.ok(["consistent", "uncertain", "inconsistent"].includes(expectedMatch));
const out = `test-results/pickup-routes-${expectedMatch}`;
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
function upload(requestId = randomUUID()) {
  const form = new FormData();
  form.append(
    "photo",
    new Blob([photo], { type: "image/png" }),
    "synthetic.png",
  );
  form.append("request_id", requestId);
  return form;
}
function deidentified(value) {
  if (Array.isArray(value)) return value.forEach(deidentified);
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      assert.doesNotMatch(
        key,
        /student_id|claim_id|nickname|token|photo|priority|allergens|preferences|h3_cell/i,
      );
      deidentified(nested);
    }
  }
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const evidence = {
    application_sha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    recorded_at: new Date().toISOString(),
    mode: "synthetic image/identities; fixture assessments; log notifications; actual HTTP routes",
    expected_match: expectedMatch,
    physical_pickup_proven: false,
    physical_push_verified: false,
    live_accuracy_measured: false,
    events: [],
  };
  const mark = (event) => evidence.events.push(event);
  try {
    const health = await request("/health");
    assert.equal(health.is_demo, true);
    assert.equal(health.vision, "fixture");
    assert.equal(health.notifications, "simulated");
    await request("/demo/reset", "demo-projector", "POST", {
      scenario: "visitors",
    });
    const building = (await request("/buildings")).buildings[0];
    assert.equal(building.verification_status, "verified");
    const draft = await request("/drops", "demo-host", "POST", upload());
    await request(`/drops/${draft.id}`, "demo-host", "PATCH", {
      servings_final: 8,
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
    assert.equal(drop.distribution_mode, "campus_feed");
    let sequence = 0;
    async function held() {
      const session = await request(
        "/sessions",
        null,
        "POST",
        { nickname: `Synthetic Pickup ${++sequence}` },
        201,
      );
      const claim = await request(
        `/drops/${drop.id}/reserve`,
        session.token,
        "POST",
      );
      return { token: session.token, claim };
    }
    async function assessment(who, key = randomUUID()) {
      const result = await request(
        `/claims/${who.claim.id}/pickup-photo`,
        who.token,
        "POST",
        upload(key),
      );
      assert.equal(result.status, "ready");
      assert.equal(result.source, "fixture");
      assert.equal(
        result.match_status,
        expectedMatch,
        "Server fixture status must match this phase",
      );
      assert.equal(result.can_confirm, expectedMatch === "consistent");
      return result;
    }
    const counts = async () =>
      (await request(`/drops/${drop.id}`, "demo-host")).counts;
    assert.deepEqual(await request("/hosts/me/push-token", "demo-host"), {
      registered: false,
    });
    const registration = await request(
      "/hosts/me/push-token",
      "demo-host",
      "POST",
      { token: "synthetic-unused-token" },
      503,
    );
    assert.equal(registration.detail.code, "provider_unavailable");
    assert.deepEqual(
      await request("/hosts/me/push-token", "demo-host", "DELETE"),
      { registered: false },
    );
    mark("log_mode_host_optin_reports_unavailable_without_sending");
    const a = await held();
    await request("/hosts/me/push-token", a.token, "GET", undefined, 403);
    assert.deepEqual(
      await request(`/claims/${a.claim.id}/pickup-verification`, a.token),
      { verification: null },
    );
    const invalid = new FormData();
    invalid.append(
      "photo",
      new Blob(["synthetic"], { type: "text/plain" }),
      "synthetic.txt",
    );
    invalid.append("request_id", randomUUID());
    assert.equal(
      (
        await request(
          `/claims/${a.claim.id}/pickup-photo`,
          a.token,
          "POST",
          invalid,
          422,
        )
      ).detail.code,
      "invalid_photo",
    );
    const oversize = new FormData();
    oversize.append(
      "photo",
      new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)], { type: "image/png" }),
      "synthetic-oversize.png",
    );
    oversize.append("request_id", randomUUID());
    assert.equal(
      (
        await request(
          `/claims/${a.claim.id}/pickup-photo`,
          a.token,
          "POST",
          oversize,
          413,
        )
      ).detail.code,
      "photo_too_large",
    );
    mark("unsupported_and_oversize_uploads_rejected");
    const bypass = await request(
      `/claims/${a.claim.id}/pickup`,
      a.token,
      "POST",
      undefined,
      409,
    );
    assert.equal(bypass.detail.code, "pickup_verification_required");
    const b = await held();
    await request(
      `/claims/${a.claim.id}/pickup-photo`,
      b.token,
      "POST",
      upload(),
      404,
    );
    const key = randomUUID();
    const first = await assessment(a, key);
    assert.equal((await assessment(a, key)).id, first.id);
    assert.equal((await counts()).picked_up, 0);
    if (expectedMatch !== "consistent") {
      await request(
        `/claims/${a.claim.id}/pickup`,
        a.token,
        "POST",
        { verification_id: first.id },
        409,
      );
    }
    mark(
      "own_active_hold_photo_idempotency_no_silent_pickup_direct_bypass_blocked",
    );
    await request(`/claims/${a.claim.id}/pickup-review`, a.token, "POST", {
      verification_id: first.id,
    });
    const queue = await request(
      `/drops/${drop.id}/pickup-reviews`,
      "demo-host",
    );
    deidentified(queue);
    assert.ok(!JSON.stringify(queue).includes(a.claim.id));
    assert.equal(queue.reviews.length, 1);
    assert.equal(queue.reviews[0].id, first.id);
    await request(
      `/drops/${drop.id}/pickup-reviews`,
      b.token,
      "GET",
      undefined,
      403,
    );
    const decide = (id, decision, status = 200) =>
      request(
        `/drops/${drop.id}/pickup-reviews/${id}`,
        "demo-host",
        "POST",
        { decision },
        status,
      );
    assert.equal((await decide(first.id, "reject")).review_status, "rejected");
    assert.equal((await decide(first.id, "reject")).review_status, "rejected");
    assert.equal((await counts()).picked_up, 0);
    await request(
      `/claims/${a.claim.id}/pickup`,
      a.token,
      "POST",
      { verification_id: first.id },
      409,
    );
    const second = await assessment(a);
    await request(`/claims/${a.claim.id}/pickup-review`, a.token, "POST", {
      verification_id: second.id,
    });
    const third = await assessment(a);
    await decide(second.id, "approve", 409);
    await request(`/claims/${a.claim.id}/pickup-review`, a.token, "POST", {
      verification_id: third.id,
    });
    const approved = await decide(third.id, "approve");
    deidentified(approved);
    assert.equal(approved.review_status, "approved");
    await decide(third.id, "approve");
    await decide(third.id, "reject", 409);
    assert.equal((await counts()).picked_up, 1);
    mark(
      "deidentified_host_queue_reject_retry_supersede_explicit_approve_idempotent_counts",
    );
    const pending = await assessment(b);
    await request(`/claims/${b.claim.id}/pickup-review`, b.token, "POST", {
      verification_id: pending.id,
    });
    await request(`/claims/${b.claim.id}/release`, b.token, "POST");
    await decide(pending.id, "approve", 409);
    mark("released_hold_stale_review_cannot_approve");
    const c = await held();
    const expiring = await assessment(c);
    await request(`/claims/${c.claim.id}/pickup-review`, c.token, "POST", {
      verification_id: expiring.id,
    });
    await request("/demo/tick", "demo-projector", "POST", {
      advance_seconds: 601,
    });
    await decide(expiring.id, "approve", 409);
    await request(
      `/claims/${c.claim.id}/pickup`,
      c.token,
      "POST",
      { verification_id: expiring.id },
      409,
    );
    await request(
      `/claims/${c.claim.id}/pickup-photo`,
      c.token,
      "POST",
      upload(),
      409,
    );
    assert.equal((await counts()).held, 0);
    assert.equal((await counts()).picked_up, 1);
    assert.equal((await counts()).available, 7);
    assert.equal(
      (await request(`/drops/${drop.id}/pickup-reviews`, "demo-host")).reviews
        .length,
      0,
    );
    mark(
      "explicit_demo_clock_expired_hold_blocks_photo_completion_and_host_approval_restores_counts",
    );
    const distribution = await request("/distribution", "demo-projector");
    assert.equal(distribution.counts.picked_up, 1);
    assert.doesNotMatch(
      JSON.stringify(distribution),
      /nickname|student_id|h3_cell|allergens|priority/i,
    );
    mark("aggregate_preserved");
    evidence.status = "PASS";
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = error.stack;
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(
      `${out}/evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(JSON.stringify(evidence, null, 2));
  }
})();
