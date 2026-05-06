// I couldn't complete this work on time Karan sir 🥺
class P0AlertStrategy {
  execute(workItem) {
    console.error(
      `[ALERT][P0] CRITICAL — ${workItem.component_id} | ` +
      `${workItem.error_type} | Page on-call immediately! ` +
      `WorkItem ID: ${workItem.id}`
    );
    // TODO: plug in PagerDuty / Opsgenie SDK call here
  }
}

class P1AlertStrategy {
  execute(workItem) {
    console.warn(
      `[ALERT][P1] HIGH — ${workItem.component_id} | ` +
      `${workItem.error_type} | Notify team channel. ` +
      `WorkItem ID: ${workItem.id}`
    );
    // TODO: plug in Slack webhook call here
  }
}

class P2AlertStrategy {
  execute(workItem) {
    console.warn(
      `[ALERT][P2] MEDIUM — ${workItem.component_id} | ` +
      `${workItem.error_type} | Create a ticket. ` +
      `WorkItem ID: ${workItem.id}`
    );
    // TODO: plug in Jira/Linear ticket creation here
  }
}

class P3AlertStrategy {
  execute(workItem) {
    console.log(
      `[ALERT][P3] LOW — ${workItem.component_id} | ` +
      `${workItem.error_type} | Logged only.`
    );
  }
}

// Factory that selects the right strategy based on severity
function getAlertStrategy(severity) {
  switch (severity) {
    case "P0": return new P0AlertStrategy();
    case "P1": return new P1AlertStrategy();
    case "P2": return new P2AlertStrategy();
    default:   return new P3AlertStrategy();
  }
}

function dispatchAlert(workItem) {
  const strategy = getAlertStrategy(workItem.severity);
  strategy.execute(workItem);
}

module.exports = { dispatchAlert };