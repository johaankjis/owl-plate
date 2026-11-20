/** Candidate-only helpers. Synthetic PNGs and real routes; no provider mocks. */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const web = process.env.OWL_WEB_URL;
assert.ok(web, "Set OWL_WEB_URL to the isolated candidate");
const target = new URL(web);
assert.equal(target.protocol, "http:");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
assert.equal(
  target.port,
  "3027",
  "Candidate 3027 only; never reset protected services",
);
assert.equal(target.pathname, "/");
assert.equal(
  target.username + target.password + target.search + target.hash,
  "",
);
const photo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA6UlEQVR4nO3QQQ3AIADAQMC/DXSChfVFltwpaDrPHny0Xgf8iVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWYFZgVmBWcEFVewCbMCCAcAAAAAASUVORK5CYII=",
  "base64",
);
const host = "demo-host",
  coordinator = "demo-pantry-coordinator",
  projector = "demo-projector";
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
function upload() {
  const form = new FormData();
  form.append(
    "photo",
    new Blob([photo], { type: "image/png" }),
    "synthetic.png",
  );
  form.append("request_id", require("node:crypto").randomUUID());
  return form;
}
async function reset() {
  const health = await request("/health");
  assert.equal(health.is_demo, true);
  assert.equal(health.vision, "fixture");
  assert.equal(health.notifications, "simulated");
  await request("/demo/reset", projector, "POST", { scenario: "visitors" });
}
async function publish(servings) {
  const building = (await request("/buildings")).buildings[0];
  assert.equal(building.verification_status, "verified");
  const draft = await request("/drops", host, "POST", upload());
  await request(`/drops/${draft.id}`, host, "PATCH", {
    servings_final: servings,
    allergens_final: [],
    diet_tags_final: [],
    building_code: building.id,
    room: "Synthetic pantry rehearsal",
    safety_review: {
      covered_and_temperature_safe: true,
      served_within_two_hours: true,
      untouched: true,
      ingredient_information_checked: true,
    },
  });
  return request(`/drops/${draft.id}/publish`, host, "POST");
}
async function student() {
  return request(
    "/sessions",
    null,
    "POST",
    {
      nickname: `Synthetic ${require("node:crypto").randomUUID().slice(0, 8)}`,
    },
    201,
  );
}
const referral = (drop) => request(`/drops/${drop.id}/pantry-referral`, host);
const refer = (drop, servings, expected = 200) =>
  request(
    `/drops/${drop.id}/pantry-referral`,
    host,
    "POST",
    { servings, demo_policy_acknowledged: true },
    expected,
  );
const decide = (item, decision, servings, expected = 200) =>
  request(
    `/pantry/referrals/${item.id}/decision`,
    coordinator,
    "POST",
    {
      decision,
      ...(servings === undefined ? {} : { servings }),
      demo_policy_acknowledged: true,
    },
    expected,
  );
const handoff = (drop, expected = 200) =>
  request(
    `/drops/${drop.id}/pantry-referral/handoff`,
    host,
    "POST",
    { demo_handoff_confirmed: true },
    expected,
  );
const advance = (seconds) =>
  request("/demo/tick", projector, "POST", { advance_seconds: seconds });
function counts(value, expected) {
  const actual = value.counts || value;
  const keys = [
    "total",
    "available",
    "held",
    "picked_up",
    "pantry_held",
    "pantry_transferred",
  ];
  for (const key of keys)
    assert.ok(Number.isInteger(actual[key]) && actual[key] >= 0, key);
  assert.equal(
    actual.total,
    keys.slice(1).reduce((n, key) => n + actual[key], 0),
  );
  if (expected)
    assert.deepEqual(
      keys.map((key) => actual[key]),
      expected,
    );
  return actual;
}
function privateSafe(value) {
  assert.doesNotMatch(
    JSON.stringify(value),
    /student_id|claim_id|nickname|priority_tier|care_priority|token_enc|ksu_email_hash|preferences/i,
  );
}
function evidence(coverage) {
  return {
    application_sha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    recorded_at: new Date().toISOString(),
    coverage,
    mode: "synthetic PNG/people; fixture vision; simulated notifications; actual routes",
    expiry_method: "labeled demo clock advance, not natural expiry",
    physical_push_verified: false,
    physical_pickup_verified: false,
    physical_pantry_transfer_verified: false,
    live_accuracy_verified: false,
    paired_it_verified: false,
    events: [],
  };
}
module.exports = {
  web,
  photo,
  host,
  coordinator,
  projector,
  request,
  upload,
  reset,
  publish,
  student,
  referral,
  refer,
  decide,
  handoff,
  advance,
  counts,
  privateSafe,
  evidence,
};
