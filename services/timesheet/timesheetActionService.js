import { executeTimesheetPlan } from "../../lib/timesheetExecutor.js";
import { formatTimesheetConfirmation, planTimesheetRequest } from "../../lib/timesheetPlanner.js";
import { canRunBotAction } from "../../lib/security/authContext.js";

function formatTimesheetClarification(missing = []) {
  const labels = {
    year: "the year",
    "start and end time": "the first and last tee time",
    "days of week": "which days to configure",
    "tee time interval": "the tee time interval",
    "both alternative interval values": "both alternative interval values",
    "timesheet configuration details": "the timesheet details",
  };
  const details = missing.map((item) => labels[item] || item);
  return `I can configure that for you. Please send ${details.join(", ")}.`;
}

export async function runTimesheetActionRequest({ client, message, authContext }) {
  if (!canRunBotAction(authContext, "timesheet.configure")) {
    return {
      ok: false,
      action: "timesheet.configure",
      status: "forbidden",
      error: "You do not have permission to configure the timesheet for this BRS club.",
    };
  }

  const plan = await planTimesheetRequest(client, message);
  if (plan.unsupported.length) {
    const intervalIssue = plan.unsupported.find((item) => item.includes("4 to 20"));
    return {
      ok: true,
      action: "timesheet.configure",
      status: "unsupported",
      reply: intervalIssue
        ? "BRS supports tee time intervals from 4 to 20 minutes for this action. Please choose interval values in that range."
        : `I cannot run that safely yet: ${plan.unsupported.join(", ")}.`,
      plan,
    };
  }

  if (plan.missing.length) {
    return {
      ok: true,
      action: "timesheet.configure",
      status: "needs_clarification",
      reply: formatTimesheetClarification(plan.missing),
      plan,
    };
  }

  if (process.env.BRS_TIMESHEET_AUTOMATION_ENABLED !== "true") {
    return {
      ok: false,
      action: "timesheet.configure",
      status: "disabled",
      error: "Timesheet automation is disabled. Set BRS_TIMESHEET_AUTOMATION_ENABLED=true in .env to use it locally.",
    };
  }

  const results = await executeTimesheetPlan(plan);

  return {
    ok: true,
    action: "timesheet.configure",
    status: "completed",
    reply: formatTimesheetConfirmation(plan.actions),
    plan,
    results,
  };
}

export async function runActionRequest({ client, route, message, authContext }) {
  if (route?.type === "timesheet.configure") {
    return runTimesheetActionRequest({ client, message, authContext });
  }
  return null;
}
