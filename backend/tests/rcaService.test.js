const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateMttr,
  hasCompleteRca,
  validateRcaPayload
} = require("../services/rcaService");

test("validateRcaPayload rejects missing required fields", () => {
  const result = validateRcaPayload({
    incident_start: "2026-05-05T10:00",
    incident_end: "2026-05-05T10:30",
    rca_category: "DB Issue"
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /fix_applied is required/);
  assert.match(result.errors.join(" "), /prevention_steps is required/);
});

test("validateRcaPayload rejects invalid date order", () => {
  const result = validateRcaPayload({
    incident_start: "2026-05-05T10:30",
    incident_end: "2026-05-05T10:00",
    rca_category: "DB Issue",
    fix_applied: "Restarted failed database node",
    prevention_steps: "Added disk and connection alerts"
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ["incident_end must be after incident_start"]);
});

test("validateRcaPayload accepts a complete RCA", () => {
  const result = validateRcaPayload({
    incident_start: "2026-05-05T10:00",
    incident_end: "2026-05-05T10:30",
    rca_category: "DB Issue",
    fix_applied: "Restarted failed database node",
    prevention_steps: "Added disk and connection alerts"
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("calculateMttr returns duration in milliseconds", () => {
  assert.equal(
    calculateMttr("2026-05-05T10:00:00.000Z", "2026-05-05T10:30:00.000Z"),
    30 * 60 * 1000
  );
});

test("hasCompleteRca detects whether stored RCA fields are filled", () => {
  assert.equal(hasCompleteRca({
    rca_category: "DB Issue",
    fix_applied: "Restarted failed database node",
    prevention_steps: "Added disk and connection alerts"
  }), true);

  assert.equal(hasCompleteRca({
    rca_category: "DB Issue",
    fix_applied: "",
    prevention_steps: "Added disk and connection alerts"
  }), false);
});
