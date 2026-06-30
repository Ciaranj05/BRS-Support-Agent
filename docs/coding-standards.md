# BRS Support Agent Coding Standards

This repo is a Node/Vercel chatbot, so the Memberships API C# standards are applied by architectural intent rather than by C# syntax rules.

## Structure

- `api/` contains Vercel HTTP entry points only.
- `server-with-feedback.js` wires Express routes and delegates business work.
- `services/` contains orchestration and business workflows, grouped by domain.
- `lib/` contains reusable domain modules, routing, retrieval, BRS integration, and static helpers.
- `scripts/` contains local crawler, ingestion, and maintenance commands.
- `tests/` contains behaviour and regression tests.

## Route Handlers

Route handlers should stay thin:

1. Read HTTP input.
2. Resolve auth/session/debug context.
3. Call a service or domain module.
4. Return the result.
5. Catch unexpected exceptions and return an error response.

Do not add chatbot routing, database writes, workflow learning, or BRS automation logic directly inside a route handler.

## Services

Put orchestration code in `services/{domain}/`.

- Use async functions for I/O.
- Pass dependencies explicitly through function parameters.
- Keep request/response shaping close to the service that owns the workflow.
- Prefer early returns over nested branches.
- Keep service outputs plain JSON objects that route handlers can return directly.

## Utilities and Domain Modules

Use `lib/` for reusable pure/domain functions and integration adapters.

- Static helpers should not depend on Express request/response objects.
- Database, HTTP, browser, or OpenAI calls should be isolated behind a clear module boundary.
- Demo-system evidence remains the primary source for exact BRS labels and workflow steps.

## Data Access

Postgres access uses `pg` with `DATABASE_URL`.

- Keep schema creation and database queries inside the owning store module.
- Provide local file fallbacks only where the app already supports development-mode persistence.
- Use parameterised SQL for values.
- Keep row-to-response mapping in explicit factory/helper functions.

## Answer Safety

- Do not guess BRS UI labels, buttons, fields, report names, or step order.
- Put exact BRS UI labels in double quotes.
- Answer from approved knowledge first. Use live lookup only after the approved knowledge path has a workflow evidence gap and a configured browser runtime is available.
- If live lookup cannot verify the answer, ask for clarification or return an escalation-ready response and queue the missing workflow for demo-system crawler exploration.
- When live lookup does verify an answer, persist the observed workflow/context so future matching questions can be answered from the knowledge base.

## Tests

- Add regression tests for every routing, wording, or workflow fix.
- Keep tests focused on service/domain behaviour rather than UI snapshots.
- Update `npm test` when new service files are added so syntax checks cover them.
