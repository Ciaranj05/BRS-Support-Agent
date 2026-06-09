# Timesheet Agent Prototype Handover

## Current Status

This prototype supports both support guidance and timesheet action requests from the same chat input.

Users can ask knowledge questions such as:

```text
How do I configure the timesheet?
```

They can also ask the agent to do something:

```text
Configure the timesheet for 2027 from 8am to 6pm, 10 minute intervals Monday to Friday and 9 minute intervals at weekends.
```

The backend decides whether the request is guidance or an executable action.

## Architecture

```text
public/index.html
  sends every user message to /api/chat

server-with-feedback.js
  receives the message

lib/security/authContext.js
  resolves BRS user and club context before routing

lib/actionRouter.js
  decides whether this is an executable action

lib/timesheetPlanner.js
  turns natural language into typed timesheet-domain actions

lib/timesheetExecutor.js
  dispatches planned timesheet actions to the BRS integration boundary

lib/integrations/brs/timesheetTools.js
  current BRS timesheet adapter boundary; delegates to Playwright today and can call MCP/API later

lib/integrations/brs/playwrightTimesheetAdapter.js
  wraps the current Playwright prototype

lib/integrations/brs/brsMcpTimesheetAdapter.js
  placeholder for the future BRS MCP implementation

lib/timesheetAutomation.js
  current Playwright prototype that opens BRS and fills the Configure Timesheet form
```

The only implemented timesheet action today is:

```text
configure_timesheet
```

The planner and executor are structured so future timesheet actions can be added without changing the chat UI:

```text
delete_tee_times
copy_timesheet
block_tee_times
update_timesheet_intervals
```

Future action handlers should be added in `lib/timesheetPlanner.js` and dispatched in `lib/timesheetExecutor.js`.

## Production Authentication And Club Scoping

The bot must not be deployed as a public assistant. In production, every request should be tied to an authenticated BRS user and a single BRS club/system.

The placeholder layer is:

```text
lib/security/authContext.js
```

It currently supports local prototype mode, but it is the place to connect real BRS session/JWT validation later.

Production context should include:

```text
clubId
userId
roles
permissions
isAuthenticated
```

The backend flow should remain:

```text
/api/chat
-> server-with-feedback.js
-> resolveAuthContext(req)
-> assertBotAccess(authContext)
-> actionRouter / knowledgeAnswer / timesheetPlanner
```

Actions should also check action-level permissions before execution. For example, configuring a timesheet should require an admin/timesheet permission for the current club.

## Future API or MCP Integration

The future integration point is:

```text
lib/integrations/brs/timesheetTools.js
```

Today it calls:

```text
lib/integrations/brs/playwrightTimesheetAdapter.js
  -> lib/timesheetAutomation.js
```

Later it can call either:

```text
lib/integrations/brs/timesheetApiAdapter.js
```

or:

```text
lib/integrations/brs/brsMcpTimesheetAdapter.js
  -> BRS MCP tool: configure_timesheet
```

The chat UI, router, planner, and executor should not need to change if the adapter contract stays the same.

## Recommended Future Contract

```js
configureTimesheet({
  clubId,
  requestedByUserId,
  year: 2027,
  blocks: [
    {
      days: ["mon", "tue", "wed", "thu", "fri"],
      startTime: "08:00",
      endTime: "18:00",
      intervalMinutes: 10
    },
    {
      days: ["sat", "sun"],
      startTime: "08:00",
      endTime: "18:00",
      intervalMinutes: 9
    }
  ]
})
```

## Standards Alignment

This prototype now follows the same broad shape as the Memberships API standards:

```text
HTTP entry point -> domain service/planner -> executor -> external adapter
```

For this project that means:

```text
server-with-feedback.js
  thin request/response layer

lib/actionRouter.js
  routes action requests conservatively

lib/timesheetPlanner.js
  owns timesheet-domain planning and missing-detail checks

lib/timesheetExecutor.js
  dispatches planned actions without knowing how BRS is called

lib/integrations/brs/*
  contains BRS-specific external integration code
```

Production work should add authenticated user context, club context, permission checks, and audit logging before replacing the prototype adapter with API or MCP execution.

## Safety Notes

- The router should stay conservative. If it is not clearly an action, let the knowledge base answer.
- The planner must ask for missing details before execution.
- Production execution should use authenticated user and club context, not `.env` credentials.
- Production execution should add permission checks and audit logging.
- The current Playwright automation is a prototype adapter, not the desired production integration.

## Local Setup

Create `.env` from `.env.example` and provide local-only values.

Do not commit `.env`.

Run locally:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Current Known Test Issue

`npm test` currently has one unrelated failing assertion in:

```text
tests/knowledge-pipeline.test.js
```

The failure is:

```text
expected: approved
actual: needs-review
```

The syntax checks for the timesheet router, planner, executor, automation, and UI pass.
