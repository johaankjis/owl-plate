/** Candidate-only database analytics acceptance. All people/photos/actions synthetic. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const h = require("./pantry_harness.cjs");
const evidence = h.evidence(
  "Actual HTTP lifecycle and database-derived analytics; no physical evidence",
);
const analytics = (period = "all") =>
  h.request(`/analytics/operations?period=${period}`, h.projector);
function reconcile(data) {
  h.privateSafe(data);
  const s = data.summary,
    o = data.outcomes;
  assert.equal(
    Object.values(o).reduce((a, b) => a + b, 0),
    s.total_servings_offered,
  );
  for (const field of [
    "total_servings_offered",
    "available_servings",
    "student_reserved_servings",
    "student_pickups",
    "pantry_reserved_servings",
    "pantry_transfers",
    "expired_unclaimed_servings",
    "participating_hosts",
    "participating_students",
  ])
    assert.ok(Number.isInteger(s[field]) && s[field] >= 0, field);
  assert.equal(
    data.buildings.reduce((n, b) => n + b.total_servings_offered, 0),
    s.total_servings_offered,
  );
  assert.equal(
    data.categories.reduce((n, c) => n + c.total_servings_offered, 0),
    s.total_servings_offered,
  );
  assert.equal(
    data.estimates.recovered_servings,
    s.student_pickups + s.pantry_transfers,
  );
  return data;
}
function check(data, expected) {
  reconcile(data);
  for (const [key, value] of Object.entries(expected))
    assert.equal(data.summary[key], value, key);
}
async function pickup(drop, token) {
  const claim = await h.request(`/drops/${drop.id}/reserve`, token, "POST");
  const verification = await h.request(
    `/claims/${claim.id}/pickup-photo`,
    token,
    "POST",
    h.upload(),
  );
  await h.request(`/claims/${claim.id}/pickup`, token, "POST", {
    verification_id: verification.id,
  });
  return claim;
}
(async () => {
  try {
    await h.reset();
    let data = await analytics();
    check(data, {
      total_servings_offered: 0,
      student_pickup_rate_percent: 0,
      combined_recovery_rate_percent: 0,
    });
    assert.equal(data.summary.average_reservation_seconds, null);
    assert.deepEqual(data.active_listings, []);
    await h.request("/analytics/operations", h.host, "GET", undefined, 403);
    const stranger = await h.student();
    await h.request(
      "/analytics/operations",
      stranger.token,
      "GET",
      undefined,
      403,
    );
    await h.request(
      "/analytics/operations?period=invalid",
      h.projector,
      "GET",
      undefined,
      422,
    );
    evidence.events.push(
      "empty_zero_denominators_role_privacy_period_validation",
    );
    const drop = await h.publish(3);
    for (let i = 0; i < 2; i++) await pickup(drop, (await h.student()).token);
    let referral = await h.refer(drop, 1);
    check(await analytics(), {
      total_servings_offered: 3,
      student_pickups: 2,
      available_servings: 1,
      pantry_transfers: 0,
      pantry_reserved_servings: 0,
      pending_pantry_requests: 1,
    });
    await h.decide(referral, "accept", 1);
    check(await analytics(), {
      available_servings: 0,
      pantry_reserved_servings: 1,
      pantry_transfers: 0,
    });
    await h.decide(referral, "accept", 1);
    await h.handoff(drop);
    await h.handoff(drop);
    data = await analytics();
    check(data, {
      total_servings_offered: 3,
      student_pickups: 2,
      pantry_transfers: 1,
      available_servings: 0,
      student_reserved_servings: 0,
      pantry_reserved_servings: 0,
      participating_hosts: 1,
      participating_students: 2,
      combined_recovery_rate_percent: 100,
    });
    assert.equal(data.summary.student_pickup_rate_percent.toFixed(1), "66.7");
    assert.ok(data.summary.average_reservation_seconds >= 0);
    assert.equal(
      data.series.reduce((n, d) => n + d.student_pickups, 0),
      2,
    );
    assert.equal(
      data.series.reduce((n, d) => n + d.pantry_transfers, 0),
      1,
    );
    evidence.acceptance_summary = data.summary;
    evidence.events.push(
      "publish3_two_photo_verified_pickups_one_explicit_simulated_pantry_transfer_duplicate_idempotency_66_7_100",
    );
    for (const period of ["today", "7d", "30d", "all"])
      check(await analytics(period), { total_servings_offered: 3 });
    evidence.events.push("all_date_filter_variants_current_cohort");
    await h.reset();
    const releaseDrop = await h.publish(2),
      a = await h.student();
    let claim = await h.request(
      `/drops/${releaseDrop.id}/reserve`,
      a.token,
      "POST",
    );
    check(await analytics(), {
      available_servings: 1,
      student_reserved_servings: 1,
      student_pickups: 0,
    });
    await h.request(`/claims/${claim.id}/release`, a.token, "POST");
    check(await analytics(), {
      available_servings: 2,
      student_reserved_servings: 0,
      student_pickups: 0,
    });
    const b = await h.student();
    await h.request(`/drops/${releaseDrop.id}/reserve`, b.token, "POST");
    await h.advance(601);
    check(await analytics(), {
      available_servings: 2,
      student_reserved_servings: 0,
      student_pickups: 0,
    });
    referral = await h.refer(releaseDrop, 1);
    await h.decide(referral, "reject");
    check(await analytics(), {
      available_servings: 2,
      pantry_transfers: 0,
      pantry_reserved_servings: 0,
      pending_pantry_requests: 0,
    });
    await h.advance(7200);
    check(await analytics(), {
      available_servings: 0,
      expired_unclaimed_servings: 2,
      student_pickups: 0,
    });
    evidence.events.push(
      "reservation_release_hold_expiry_pantry_rejection_listing_expiry_no_false_recovery",
    );
    for (let round = 0; round < 5; round++) {
      await h.reset();
      const raceDrop = await h.publish(1),
        person = await h.student();
      const item = await h.refer(raceDrop, 1);
      const ops = await Promise.allSettled([
        h.request(`/drops/${raceDrop.id}/reserve`, person.token, "POST"),
        h.decide(item, "accept", 1),
      ]);
      assert.equal(ops.filter((o) => o.status === "fulfilled").length, 1);
      check(await analytics(), {
        total_servings_offered: 1,
        available_servings: 0,
        student_pickups: 0,
        pantry_transfers: 0,
      });
    }
    evidence.events.push(
      "five_concurrent_student_pantry_acceptance_races_inventory_reconciles",
    );
    await h.reset();
    await h.request(
      "/demo/recording-dataset",
      h.projector,
      "POST",
      { confirm_reset: false },
      422,
    );
    data = await h.request("/demo/recording-dataset", h.projector, "POST", {
      confirm_reset: true,
    });
    reconcile(data);
    assert.equal(data.dataset.kind, "recording");
    assert.equal(data.dataset.is_simulated, true);
    assert.ok(data.buildings.length >= 6);
    assert.ok(data.categories.length >= 2);
    assert.ok(
      data.summary.participating_hosts > 1 &&
        data.summary.participating_students > 1,
    );
    assert.ok(
      data.summary.student_pickups > 0 &&
        data.summary.pantry_transfers > 0 &&
        data.summary.expired_unclaimed_servings > 0,
    );
    const today = reconcile(await analytics("today")),
      week = reconcile(await analytics("7d"));
    assert.ok(
      today.summary.total_servings_offered <=
        week.summary.total_servings_offered,
    );
    assert.ok(
      week.summary.total_servings_offered <=
        data.summary.total_servings_offered,
    );
    evidence.recording_summary = data.summary;
    evidence.recording_dataset = data.dataset;
    await h.reset();
    assert.equal((await analytics()).dataset.kind, "current");
    data = await h.request("/demo/recording-dataset", h.projector, "POST", {
      confirm_reset: true,
    });
    reconcile(data);
    assert.equal(
      data.dataset.seed_version,
      evidence.recording_dataset.seed_version,
    );
    assert.equal(
      data.summary.total_servings_offered,
      evidence.recording_summary.total_servings_offered,
    );
    evidence.events.push(
      "explicit_recording_reset_persisted_multibuilding_categories_hosts_students_date_filters_repeatable_totals",
    );
    evidence.result = "PASS";
  } catch (err) {
    evidence.result = "FAIL";
    evidence.error = String(err.stack || err);
    throw err;
  } finally {
    fs.mkdirSync("test-results/operations-routes", { recursive: true });
    fs.writeFileSync(
      "test-results/operations-routes/evidence.json",
      JSON.stringify(evidence, null, 2),
    );
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
