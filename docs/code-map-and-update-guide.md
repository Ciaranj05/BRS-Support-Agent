# BRS Support Agent Code Map

This guide explains where each part of the bot is handled and where to make future changes.

## Current Flow

```text
public/index.html
  small page shell for the chat screen

public/styles.css
  visual design and responsive layout

public/app.js
  browser-side chat behaviour and UI rendering

/api/chat
  chat endpoint called by the UI

server-with-feedback.js
  main request coordinator

lib/security/authContext.js
  resolves authenticated BRS user, club context, roles, and permissions

lib/actionRouter.js
  decides whether the message is an executable action

Knowledge path:
  lib/objectFirstRouting.js
  lib/knowledgeAnswer.js
  data/knowledge/*
  data/decision-trees/*
  knowledge/knowledge-index.json

Action path:
  lib/timesheetPlanner.js
  lib/timesheetExecutor.js
  lib/integrations/brs/timesheetTools.js
  lib/integrations/brs/playwrightTimesheetAdapter.js
  lib/timesheetAutomation.js
```

Future MCP/API work should replace the BRS integration adapter, not the whole chatbot.

---

## What To Change Where

### Bot Screen, Layout, Styling, And Visual Design

Change:

```text
public/index.html
public/styles.css
public/app.js
```

Current split:

- `public/index.html`: page shell, header, chat container, input controls
- `public/styles.css`: layout, colours, chat bubbles, welcome card, success card, feedback cards, mobile styling
- `public/app.js`: renders messages, buttons, typing state, success confirmation, feedback prompts

Important functions:

```text
addWelcome()
  opening card and first prompt

addMessage()
  normal message rendering

addMessageTyped()
  simulated typing effect for bot answers

showTyping()
  working indicator while API call is running

addTimesheetSuccess()
  customer-facing success card after a timesheet action

resetChat()
  clears the chat and starts a new issue
```

Prototype note: the UI has now been split into shell, styling, and browser behaviour. If it grows further, split `public/app.js` into smaller modules such as `chat-ui.js`, `feedback-ui.js`, and `timesheet-ui.js`, or move to a frontend framework.

---

### Bot Typing And Interaction Behaviour

Change:

```text
public/app.js
```

Main areas:

```text
showTyping()
  shows the spinner and "Working..." message

addMessageTyped()
  controls the character-by-character typing effect

pendingTimesheetRequest
  remembers an unfinished timesheet action while the bot asks for missing details

pendingFollowUpHint
  helps follow-up answers stay attached to the previous question
```

Current missing-detail loop:

```text
Bot asks for missing details
-> public/app.js stores pendingTimesheetRequest
-> user replies
-> frontend combines original request + new details
-> sends combined request back to /api/chat
```

Production note: pending action state should eventually move server-side so it survives refreshes, multiple tabs, and longer conversations.

---

### Main Chat Routing

Change:

```text
server-with-feedback.js
```

This is the main coordinator. It should stay as thin as possible.

Current order:

```text
1. resolveAuthContext(req)
2. assertBotAccess(authContext)
3. routeActionRequest(message)
4. answerFromObjectFirstRouting(message)
5. answerFromKnowledge(message)
6. fallback to server.js legacy handler
```

Important functions:

```text
enhancedChatHandler()
  main /api/chat flow

runActionRequest()
  dispatches executable actions

runTimesheetActionRequest()
  coordinates timesheet planning, missing details, and execution

rewriteReplyInOwnWords()
  rewrites supported answers into clearer customer-facing wording
```

Architecture note: avoid adding new domain logic directly here. Add new action domains in their own planner/executor files and call them from this coordinator.

---

### Authentication, Club Context, And Permissions

Change:

```text
lib/security/authContext.js
```

This is the production entry point for BRS access control.

It currently resolves a placeholder auth context from headers, request body, query values, or local environment variables. Local prototype mode is permissive unless this is set:

```text
BRS_BOT_REQUIRE_AUTH=true
```

In production, this layer should validate the real BRS session or JWT and provide:

```text
clubId
userId
roles
permissions
isAuthenticated
```

The bot should not be public. Every request should be tied to an authenticated BRS user and a single BRS club/system.

Action permissions are checked with:

```text
canRunBotAction(authContext, actionType)
```

For example, `timesheet.configure` should require a real timesheet/admin permission before it can run in production.

---

### Action Detection

Change:

```text
lib/actionRouter.js
```

This decides whether a message is asking the bot to do something.

Current supported action route:

```text
timesheet.configure
```

Examples:

```text
"How do I configure the timesheet?"
  -> knowledge question, not action

"Configure the timesheet for 2027 from 8am to 6pm"
  -> timesheet.configure action
```

Rule: keep this conservative. If the bot is not sure, let the knowledge system answer rather than running an action.

---

### Timesheet Action Planning

Change:

```text
lib/timesheetPlanner.js
```

This turns natural language into structured timesheet actions.

It handles:

- year extraction
- date defaults
- time range extraction
- weekdays/weekends/every day
- single intervals
- alternate intervals
- multiple planned actions from one request
- missing detail checks
- customer-facing confirmation text

Important exports:

```text
TIMESHEET_ACTIONS
planTimesheetRequest()
formatTimesheetConfirmation()
```

Current implemented action:

```text
configure_timesheet
```

Future timesheet actions can be added here, for example:

```text
delete_tee_times
copy_timesheet
block_tee_times
update_timesheet_intervals
```

---

### Timesheet Action Execution

Change:

```text
lib/timesheetExecutor.js
```

This dispatches planned timesheet actions to the current BRS integration.

Current role:

```text
planner says what should happen
executor decides which integration function runs it
adapter performs the actual BRS work
```

If a new timesheet action is added in the planner, add the matching dispatch case here.

---

### BRS Integration Boundary

Change:

```text
lib/integrations/brs/
```

Current files:

```text
timesheetTools.js
  adapter boundary used by the executor

playwrightTimesheetAdapter.js
  current prototype adapter

brsMcpTimesheetAdapter.js
  placeholder for future MCP integration
```

Current flow:

```text
timesheetExecutor.js
-> integrations/brs/timesheetTools.js
-> integrations/brs/playwrightTimesheetAdapter.js
-> timesheetAutomation.js
-> BRS browser automation
```

Future MCP/API flow:

```text
timesheetExecutor.js
-> integrations/brs/timesheetTools.js
-> integrations/brs/brsMcpTimesheetAdapter.js
-> BRS MCP server / BRS APIs
```

This is the main future-proofing point.

---

### Current Playwright Prototype

Change only if maintaining the temporary browser automation:

```text
lib/timesheetAutomation.js
```

This logs into BRS, opens Tools > Configure Timesheet, fills the form, and submits it when enabled.

Environment variables:

```text
BRS_TIMESHEET_AUTOMATION_ENABLED
BRS_TIMESHEET_URL
BRS_TIMESHEET_USERNAME
BRS_TIMESHEET_PASSWORD
BRS_AUTOMATION_HEADLESS
```

Production note: this is not the desired final integration. Replace it with MCP/API once available.

---

### Knowledge Answers

Change:

```text
lib/knowledgeAnswer.js
lib/retrieval.js
lib/knowledgeSources.js
```

Knowledge content comes from:

```text
data/knowledge/*.txt
  approved support guidance

data/decision-trees/*.txt
  routing and support decision trees

knowledge/manual/*.md
  manually approved markdown guidance

knowledge/system/*.json
  crawled BRS system observations

knowledge/knowledge-index.json
  built searchable index
```

After changing knowledge files, rebuild:

```bash
npm run build:knowledge
```

---

### Decision Trees

Change:

```text
data/decision-trees/admin-setup-decision-tree.txt
data/decision-trees/memberships-decision-tree.txt
data/decision-trees/payments-decision-tree.txt
data/decision-trees/teesheet-decision-tree.txt
data/decision-trees/user-management-decision-tree.txt
```

Use these when the bot needs to choose a support route or ask a clarifying question.

Rule: keep route wording explicit. Add common customer/user phrases to the wording map when the bot is missing obvious variants.

---

### Approved Knowledge Text

Change:

```text
data/knowledge/admin-setup.txt
data/knowledge/memberships.txt
data/knowledge/payments.txt
data/knowledge/teesheet.txt
data/knowledge/user-management.txt
data/knowledge/communication-layer.txt
```

Use these for approved answers, exact support wording, and product guidance.

Rule: if the answer should be stable and repeatable, put it in these files rather than hardcoding it in the UI.

---

### Crawling BRS For System Knowledge

Change crawler:

```text
scripts/crawl-brs-system.js
```

Build index:

```text
scripts/build-knowledge-base.js
```

Run:

```bash
npm run crawl:brs-system
npm run build:knowledge
```

Crawled files land in:

```text
knowledge/system/
```

Safety note: crawled system knowledge should be reviewed. The current build writes unapproved entries to:

```text
knowledge/review-queue.json
```

---

### Feedback, Resolution, And Admin Metrics

Frontend:

```text
public/index.html
showRatingPrompt()
submitRating()
showUnresolvedPrompt()
submitUnresolved()
addResolutionPrompt()
```

Backend:

```text
server-with-feedback.js
feedbackStore.js
api/feedback.js
api/resolved-interactions.js
api/admin/survey-metrics.js
```

Admin screen:

```text
public/admin.html
```

---

### Legacy/Fallback Chatbot Logic

Change carefully:

```text
server.js
```

This is still used as a fallback by `server-with-feedback.js`.

Recommendation: avoid adding new behaviour here unless it is genuinely fallback behaviour. Prefer the newer router/knowledge/action structure.

---

### Tests

Current tests:

```text
tests/knowledge-pipeline.test.js
tests/object-first-routing.test.js
```

Run:

```bash
npm test
```

Recommended new tests:

- action router tests
- timesheet planner tests
- missing-detail loop tests
- executor dispatch tests with mocked BRS adapters
- knowledge answer tests for high-volume support questions

Known current issue: one knowledge pipeline test expects crawled knowledge to be `approved`, but the safety logic marks it `needs-review`.

---

## Architecture Cleanup Notes

The architecture is good enough to hand over as a prototype. The main future cleanup items are:

1. Split `public/index.html` into smaller UI modules if the frontend grows.
2. Move pending action state server-side for production.
3. Keep `server-with-feedback.js` thin; avoid adding domain logic there.
4. Replace `timesheetAutomation.js` with MCP/API integration when available.
5. Add permission checks, club context, authenticated user context, and audit logging before live production actions.
6. Clean repo hygiene before committing: do not include `.env`, `.DS_Store`, `node_modules`, or `node_modules/.package-lock.json`.

## Handover Summary

For a teammate joining the bot work:

- Change page shell in `public/index.html`.
- Change visual styling in `public/styles.css`.
- Change browser-side chat interaction in `public/app.js`.
- Change support knowledge in `data/knowledge` and `data/decision-trees`.
- Rebuild searchable knowledge with `npm run build:knowledge`.
- Change auth/club access control in `lib/security/authContext.js`.
- Change action detection in `lib/actionRouter.js`.
- Change timesheet action planning in `lib/timesheetPlanner.js`.
- Change action execution dispatch in `lib/timesheetExecutor.js`.
- Change BRS integration in `lib/integrations/brs`.
- Treat `lib/timesheetAutomation.js` as temporary prototype code.
