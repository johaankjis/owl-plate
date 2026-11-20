/** Real-route pantry lifecycle acceptance; UI coverage is a separate harness. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const h = require("./pantry_harness.cjs");
const out = "test-results/pantry-routes";
(async () => {
  const evidence = h.evidence(
    "HTTP routes only; no browser or physical evidence",
  );
  const mark = (event) => evidence.events.push(event);
  const snapshot = async (drop, expected) =>
    h.counts(await h.request(`/drops/${drop.id}`, h.host), expected);
  try {
    await h.reset();
    let drop = await h.publish(2);
    await h.handoff(drop, 409);
    await h.request(`/drops/${drop.id}`, h.coordinator, "GET", undefined, 404);
    assert.equal((await h.referral(drop)).referral, null);
    const who = await h.student();
    for (const token of [who.token, h.projector]) {
      await h.request(
        `/drops/${drop.id}/pantry-referral`,
        token,
        "GET",
        undefined,
        403,
      );
      await h.request("/pantry/referrals", token, "GET", undefined, 403);
    }
    await h.request(
      `/drops/${drop.id}/pantry-referral`,
      h.host,
      "POST",
      { servings: 1, demo_policy_acknowledged: false },
      422,
    );
    let item = await h.refer(drop, 1);
    await h.handoff(drop, 409);
    assert.equal(item.destination.room, "Room 184");
    assert.equal(item.status, "requested");
    assert.equal((await h.refer(drop, 2)).id, item.id);
    h.privateSafe(item);
    assert.match(item.notice, /prohibits/);
    assert.equal(
      item.destination.catering_policy_url,
      "https://campus.kennesaw.edu/offices-services/catering/policies.php",
    );
    const hold = await h.request(
      `/drops/${drop.id}/reserve`,
      who.token,
      "POST",
    );
    await snapshot(drop, [2, 1, 1, 0, 0, 0]);
    const verification = await h.request(
      `/claims/${hold.id}/pickup-photo`,
      who.token,
      "POST",
      h.upload(),
    );
    assert.equal(verification.match_status, "consistent");
    await snapshot(drop, [2, 1, 1, 0, 0, 0]);
    await h.request(`/claims/${hold.id}/pickup`, who.token, "POST", {
      verification_id: verification.id,
    });
    item = await h.decide(item, "accept", 1);
    await snapshot(drop, [2, 0, 0, 1, 1, 0]);
    assert.equal((await h.decide(item, "accept", 1)).id, item.id);
    await h.decide(item, "accept", 2, 409);
    await h.decide(item, "reject", undefined, 409);
    await h.handoff(drop);
    await h.handoff(drop);
    await snapshot(drop, [2, 0, 0, 1, 0, 1]);
    h.counts(
      (await h.request("/distribution", h.projector)).counts,
      [2, 0, 0, 1, 0, 1],
    );
    mark(
      "manual_before_suggestion_pending_student_pickup_explicit_handoff_duplicates_distinct_counts_acl_policy",
    );

    await h.reset();
    drop = await h.publish(3);
    item = await h.refer(drop, 3);
    const heldBy = await h.student();
    await h.request(`/drops/${drop.id}/reserve`, heldBy.token, "POST");
    await h.decide(item, "accept", 3, 409);
    await h.decide(item, "accept", 1);
    await snapshot(drop, [3, 1, 1, 0, 1, 0]);
    const another = await h.student();
    await h.request(`/drops/${drop.id}/reserve`, another.token, "POST");
    await snapshot(drop, [3, 0, 2, 0, 1, 0]);
    mark(
      "partial_accept_current_available_preserves_existing_hold_remaining_student_reservable",
    );

    await h.reset();
    drop = await h.publish(2);
    item = await h.refer(drop, 2);
    await h.decide(item, "reject");
    await h.decide(item, "reject");
    await snapshot(drop, [2, 2, 0, 0, 0, 0]);
    assert.equal((await h.refer(drop, 1)).status, "rejected");
    mark("rejection_allocates_nothing_terminal_request_retry");

    await h.reset();
    drop = await h.publish(1);
    await h.advance(2040);
    assert.equal((await h.referral(drop)).referral, null);
    await h.advance(61);
    const suggested = (await h.referral(drop)).referral;
    assert.equal(suggested.status, "suggested");
    assert.ok(
      (await h.request("/pantry/referrals", h.coordinator)).referrals.some(
        (row) => row.id === suggested.id,
      ),
    );
    await h.decide(suggested, "accept", 1, 409);
    await snapshot(drop, [1, 1, 0, 0, 0, 0]);
    mark(
      "labeled_demo_clock_suggests_only_within_ten_minutes_without_allocation",
    );

    for (const accepted of [false, true]) {
      await h.reset();
      drop = await h.publish(2);
      item = await h.refer(drop, 1);
      const person = await h.student();
      const claim = await h.request(
        `/drops/${drop.id}/reserve`,
        person.token,
        "POST",
      );
      if (accepted) await h.decide(item, "accept", 1);
      await h.advance(2701);
      await h.handoff(drop, 409);
      await h.decide(item, "accept", 1, 409);
      await h.request(`/claims/${claim.id}/release`, person.token, "POST");
      const expired = await h.request(`/drops/${drop.id}`, h.host);
      assert.equal(expired.status, "expired");
      h.counts(expired);
      assert.equal((await h.referral(drop)).referral.status, "expired");
      assert.ok(
        !(await h.request("/students/me/feed", person.token)).drops.some(
          (x) => x.drop.id === drop.id,
        ),
      );
      assert.equal(
        (await h.request("/distribution", h.projector)).active_drops,
        0,
      );
    }
    mark(
      "requested_and_accepted_expiry_blocks_handoff_accept_and_release_resurrection",
    );

    for (let round = 0; round < 5; round++) {
      await h.reset();
      drop = await h.publish(1);
      item = await h.refer(drop, 1);
      const person = await h.student();
      const outcomes = await Promise.all([
        fetch(`${h.web}/backend/drops/${drop.id}/reserve`, {
          method: "POST",
          headers: { Authorization: `Bearer ${person.token}` },
        }),
        fetch(`${h.web}/backend/pantry/referrals/${item.id}/decision`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${h.coordinator}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decision: "accept",
            servings: 1,
            demo_policy_acknowledged: true,
          }),
        }),
      ]);
      assert.deepEqual(outcomes.map((x) => x.status).sort(), [200, 409]);
      const actual = await snapshot(drop);
      assert.equal(actual.held + actual.pantry_held, 1);
      assert.equal(actual.available, 0);
    }
    mark("five_concurrent_last_serving_student_vs_pantry_races_no_overbooking");
    await h.reset();
    drop = await h.publish(1);
    const requestedCopies = await Promise.all([
      h.refer(drop, 1),
      h.refer(drop, 1),
    ]);
    assert.equal(requestedCopies[0].id, requestedCopies[1].id);
    const acceptedCopies = await Promise.all(
      requestedCopies.map((copy) => h.decide(copy, "accept", 1)),
    );
    assert.equal(acceptedCopies[0].id, acceptedCopies[1].id);
    await snapshot(drop, [1, 0, 0, 0, 1, 0]);
    await Promise.all([h.handoff(drop), h.handoff(drop)]);
    await snapshot(drop, [1, 0, 0, 0, 0, 1]);
    mark(
      "concurrent_duplicate_request_accept_handoff_allocate_and_transfer_once",
    );
    h.privateSafe(await h.request("/pantry/referrals", h.coordinator));
    evidence.status = "PASS";
  } catch (error) {
    evidence.status = "FAIL";
    evidence.error = error.stack;
    process.exitCode = 1;
  } finally {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      `${out}/evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(JSON.stringify(evidence, null, 2));
  }
})();
