# BRS Caddie

## Timesheet action prototype

The timesheet action prototype uses a backend router, planner, executor, and current Playwright adapter. For handover notes and the future BRS API/MCP integration point, see `docs/timesheet-agent-handover.md`.

## Survey feedback storage

The app records resolved-query survey scores through `POST /api/feedback` and shows results at `/admin.html`.

For production, set a Postgres connection string in Vercel:

```text
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE
```

You can use any hosted Postgres provider, including Vercel Postgres, Supabase, Neon, or Railway. Once `DATABASE_URL` is present, the app automatically creates these tables on first use:

- `resolved_interactions`
- `survey_responses`

If `DATABASE_URL` is not set, the app falls back to `data/feedback-store.json`. That fallback is useful locally, but it should not be treated as permanent storage on Vercel.

After adding or changing `DATABASE_URL`, redeploy the Vercel project. Then visit:

```text
https://brs-support-agent.vercel.app/admin.html
```

The dashboard reads from:

```text
GET /api/admin/survey-metrics
```

## Knowledge ingestion

The support agent can combine knowledge from the BRS Help Center, manually approved support notes, and reusable product knowledge extracted from an approved BRS test club account.

The BRS system crawler is intended to learn how the product works: menu structure, settings, product-authored help text, reports, workflows, and relationships between areas. It is not intended to store club-specific setup, booking data, member data, visitor data, payment values, staff details, or exact audit timestamps.

See `docs/brs-system-knowledge-ingestion.md` for setup, review, redaction, and future multi-club guidance.

Useful commands:

```text
npm run crawl:brs-system
npm run seed:workflow-families
npm run build:knowledge
npm test
```
- Code map and future update guide: `docs/code-map-and-update-guide.md`
- Repo-specific coding standards: `docs/coding-standards.md`

## Workflow-family knowledge

The chatbot now treats operational guidance as workflow families rather than one-off examples. A family can include aliases, variants, multiple routes, preconditions, write-action safety tiers, and rollback policy. This prevents wording such as "move a buggy booking" from becoming a separate answer when the proven BRS workflow is really the broader "move a tee sheet booking" route.

To populate a stronger starting point from approved local guidance, run:

```text
npm run seed:workflow-families
```

This writes `knowledge/workflows/starter-workflow-families.json` and rebuilds `knowledge/knowledge-index.json`.

## Live BRS workflow lookup

For questions where approved stored knowledge is incomplete, the app can use live BRS lookup as a safety net. The chatbot tries the knowledge base first; only workflow evidence gaps are eligible for live lookup. If live evidence verifies the answer, the observed workflow/context is saved back into reusable workflow knowledge. If it cannot verify the answer, the response is escalation-ready and the missing workflow is queued for exploration.

Set this in Vercel:

```text
BRS_LIVE_LOOKUP_ENABLED=true
BRS_BASE_URL=https://www.brsgolf.com/amysgolfclub
BRS_CLUB_ID=amysgolfclub
```

Vercel serverless functions usually cannot launch Chromium directly. The free/low-cost route is to deploy the included browser worker to a service that can run Chrome, then point Vercel at it:

```text
BRS_LIVE_WORKER_URL=https://your-worker-service.onrender.com
BRS_LIVE_WORKER_SECRET=the-same-secret-used-by-the-worker
```

See `browser-worker/README.md` for the worker deployment steps.

For local verification only, you can set `BRS_LIVE_LOOKUP_ALLOW_DIRECT=true` and `BRS_LIVE_BROWSER_EXECUTABLE_PATH` to a local Chrome executable. Production should use the worker URL or a managed browser websocket endpoint.

## Self-improving workflow knowledge

When a chatbot answer uses successful live BRS evidence, the app stores that observed workflow as reusable knowledge. Resolved-query survey feedback can also store high-quality static answers when the user marks the query as resolved with a recommendation score of at least 70%.

Required production settings:

```text
DATABASE_URL=postgres://...
BRS_LEARNING_AUTO_APPROVE=true
BRS_LEARNING_MIN_SCORE=70
BRS_LEARNING_STORE_APPROVED_STATIC=true
```

The next matching chatbot query can retrieve that learned workflow directly from Postgres. If the answer used live BRS evidence, the stored row is tagged as live-evidence learned knowledge. If the answer came from existing approved knowledge, it is tagged as static-knowledge learned knowledge. If `DATABASE_URL` is missing, learned workflows fall back to local JSON files, which is useful for development but not permanent on Vercel.

When a workflow question cannot be answered from approved evidence, the chatbot queues an automatic workflow exploration task instead of exposing browser-worker timeout details to the user. Set:

```text
BRS_AUTO_WORKFLOW_EXPLORATION=true
```

Queued tasks include the test club, route-collection intent, and a safety tier:

- `read-only` for pure navigation/report exploration.
- `safe-test-record-with-rollback` for reversible test records such as temporary test bookings.
- `read-and-draft-only` for settings screens where the bot may inspect and fill drafts but must not submit changes without a setting-specific rollback helper.
- `auto-restricted` for payments, messaging, permissions, integrations, and other sensitive actions.

Production should use `DATABASE_URL` so the queue persists in Postgres. Without it, local development falls back to `data/workflow-exploration-queue.jsonl`.
