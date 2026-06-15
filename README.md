# BRS Support Agent

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
npm run build:knowledge
npm test
```
- Code map and future update guide: `docs/code-map-and-update-guide.md`

## Live BRS workflow lookup

For questions where the stored knowledge is incomplete, the app can try a read-only live BRS lookup before answering. Set this in Vercel:

```text
BRS_LIVE_LOOKUP_ENABLED=true
```

Vercel serverless functions usually cannot launch Chromium directly. The free/low-cost route is to deploy the included browser worker to a service that can run Chrome, then point Vercel at it:

```text
BRS_LIVE_WORKER_URL=https://your-worker-service.onrender.com
BRS_LIVE_WORKER_SECRET=the-same-secret-used-by-the-worker
```

See `browser-worker/README.md` for the worker deployment steps.

## Self-improving workflow knowledge

When a chatbot answer uses successful live BRS evidence and the user marks the query as resolved with a recommendation score of at least 70%, the app stores that observed workflow in Postgres as reusable knowledge.

Required production settings:

```text
DATABASE_URL=postgres://...
BRS_LEARNING_AUTO_APPROVE=true
BRS_LEARNING_MIN_SCORE=70
BRS_LEARNING_STORE_APPROVED_STATIC=true
```

The next matching chatbot query can retrieve that learned workflow directly from Postgres. If the answer used live BRS evidence, the stored row is tagged as live-evidence learned knowledge. If the answer came from existing approved knowledge, it is tagged as static-knowledge learned knowledge. If `DATABASE_URL` is missing, learned workflows fall back to local JSON files, which is useful for development but not permanent on Vercel.
