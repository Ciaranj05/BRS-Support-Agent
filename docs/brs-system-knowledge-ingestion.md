# BRS system knowledge ingestion

This project can learn from three support knowledge sources:

- BRS Help Center articles from `help.brsgolf.com`.
- Manual approved guidance in `knowledge/manual`.
- BRS system UI knowledge extracted from an approved test club account.

The system crawler is designed for product knowledge, not club data. It should record how BRS works: navigation, settings, help text, report purpose, page structure, workflows, and cross-area relationships. It should not record the test club's live rates, bookings, members, visitors, staff, payments, or custom policy values.

## Safe setup

Create a dedicated test user with the lowest useful permissions. Store credentials as environment variables only:

```text
BRS_BASE_URL=https://brsgolf.com
BRS_CLUB_ID=harrysgolfclub
BRS_USERNAME=...
BRS_PASSWORD=...
BRS_CRAWL_MAX_PAGES=80
BRS_CRAWL_ALLOW_MUTATIONS=false
```

Never commit real BRS credentials. If credentials have appeared in chat, rotate them before production use.

## Running ingestion

Install dependencies, then run:

```text
npm run crawl:brs-system
npm run build:knowledge
```

The crawler writes raw extracted system entries into `knowledge/system`. The builder combines system entries, Help Center entries, and manual notes into `knowledge/knowledge-index.json`, then writes unapproved entries into `knowledge/review-queue.json`.

## Demo workflow exploration

Some BRS tasks have more than one valid route. For example, a customer-facing booking path can create a request that appears on the timesheet, while an admin path may still be needed to add services or charges. Use the demo workflow explorer to capture those parallel routes from a dedicated demo club.

```text
BRS_DEMO_WORKFLOW_EXPLORATION_ENABLED=true
BRS_DEMO_ALLOW_BOOKING_CREATION=true
BRS_DEMO_CLUB_ID=...
BRS_DEMO_USERNAME=...
BRS_DEMO_PASSWORD=...
BRS_DEMO_BOOKING_CREATION_MODE=draft
```

Then run:

```text
npm run explore:demo-workflows -- "how do I add a buggy booking"
npm run build:knowledge
```

`draft` mode opens and fills safe demo booking surfaces for evidence without submitting. `commit` mode can submit a test booking only on the dedicated demo club. The explorer blocks setup/settings mutations such as System Configuration, Configure Timesheet, Green Fee setup, reservation types, payment methods, user permissions, and other admin setup areas.

Demo workflow output is written to `knowledge/workflows/demo` with `confidence: needs-review` and `safeForChatbot: false`. A human must review the route evidence before it becomes approved answer material.

## What the crawler records

For approved pages it records:

- area and page title
- navigation path or breadcrumb when available
- source URL
- reusable field labels
- reusable action labels, excluding mutation actions unless explicitly allowed
- question mark, title, aria-label, and tooltip-style help text
- report names and filters when visible
- last observed date

The crawler should focus especially on areas like:

- Tools > System Configuration
- Tools > Configure Timesheet
- Tee Sheet and Booking Details
- Payments
- Members and Memberships
- Competitions
- Reports
- Users and Permissions
- Emails and Templates
- GDPR, devices, printers, and other admin tools

## Redaction and review

`lib/knowledgeRedaction.js` removes common sensitive values such as emails, phone numbers, money values, long numeric identifiers, dates, and obvious named-person patterns. Redaction is a guardrail, not a substitute for review.

New BRS system entries default to `confidence: needs-review`. They should be checked before being treated as approved answer material.

## Future multi-club support

The crawler already accepts `BRS_CLUB_IDS` as a comma-separated list. Keep each club on an explicit allowlist and continue tagging entries with `clubScope: template` unless the knowledge is intentionally club-specific.

The support bot should normally answer from the reviewed knowledge index rather than logging into BRS during a live support conversation. This keeps answers fast, auditable, and safer for customer data.

## Vercel live lookup browser runtime

Live lookup uses Playwright. On Vercel, the most reliable production setup is to use a managed browser service and set `BRS_LIVE_BROWSER_WS_ENDPOINT` to its WebSocket endpoint. This avoids native library failures such as missing `libnss3.so` in Vercel's serverless runtime.

Required Vercel environment variables for live lookup:

```text
BRS_LIVE_LOOKUP_ENABLED=true
BRS_BASE_URL=https://brsgolf.com
BRS_CLUB_ID=amysgolfclub
BRS_USERNAME=...
BRS_PASSWORD=...
BRS_LIVE_LOOKUP_TIMEOUT_MS=45000
BRS_LIVE_BROWSER_WS_ENDPOINT=wss://...
```

The app still contains a local/serverless Chromium fallback, but if debug output mentions missing native libraries, configure `BRS_LIVE_BROWSER_WS_ENDPOINT` rather than trying to store browser binaries in the repo.
