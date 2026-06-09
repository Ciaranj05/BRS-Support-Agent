import { configureTimesheet } from "./integrations/brs/timesheetTools.js";
import { TIMESHEET_ACTIONS } from "./timesheetPlanner.js";

// Executes planned timesheet actions. Keep callers dependent on this contract
// while BRS adapters decide whether the work is done by Playwright, API, or MCP.
export async function executeTimesheetPlan(plan = {}) {
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  const results = [];

  for (const action of actions) {
    if (action.action === TIMESHEET_ACTIONS.CONFIGURE) {
      results.push(await configureTimesheet(action));
      continue;
    }

    throw new Error(`Unsupported timesheet action: ${action.action || "unknown"}.`);
  }

  return results;
}
