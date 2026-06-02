# BRS Support Agent

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
