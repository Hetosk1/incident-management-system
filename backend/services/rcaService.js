const REQUIRED_RCA_FIELDS = [
  "incident_start",
  "incident_end",
  "rca_category",
  "fix_applied",
  "prevention_steps"
];

function isBlank(value) {
  return typeof value !== "string" || value.trim().length === 0;
}

function validateRcaPayload(payload = {}) {
  const errors = [];

  for (const field of REQUIRED_RCA_FIELDS) {
    if (isBlank(payload[field])) {
      errors.push(`${field} is required`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const incidentStart = new Date(payload.incident_start);
  const incidentEnd = new Date(payload.incident_end);

  if (Number.isNaN(incidentStart.getTime())) {
    errors.push("incident_start must be a valid date");
  }

  if (Number.isNaN(incidentEnd.getTime())) {
    errors.push("incident_end must be a valid date");
  }

  if (errors.length === 0 && incidentEnd < incidentStart) {
    errors.push("incident_end must be after incident_start");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function calculateMttr(incidentStart, incidentEnd) {
  return new Date(incidentEnd).getTime() - new Date(incidentStart).getTime();
}

function hasCompleteRca(item = {}) {
  return Boolean(
    item.rca_category &&
    item.fix_applied &&
    item.prevention_steps
  );
}

module.exports = {
  calculateMttr,
  hasCompleteRca,
  validateRcaPayload
};
