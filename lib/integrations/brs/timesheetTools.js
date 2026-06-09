import { configureTimesheet as configureTimesheetWithPlaywright } from "./playwrightTimesheetAdapter.js";

// Current adapter boundary for BRS timesheet actions.
// Swap this import/call to brsMcpTimesheetAdapter.js when the BRS MCP server is available.
export async function configureTimesheet(action) {
  return configureTimesheetWithPlaywright(action);
}
