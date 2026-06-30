# BRS system knowledge ingestion

This project can learn from three support knowledge sources:

- BRS Help Center articles from `help.brsgolf.com`.
- Manual approved guidance in `knowledge/manual`.
- BRS system UI knowledge extracted from an approved test club account.

The system crawler is designed for product knowledge, not club data. It should record how BRS works: navigation, settings, help text, report purpose, page structure, workflows, and cross-area relationships. It should not record the test club's live rates, bookings, members, visitors, staff, payments, or custom policy values.

## Safe setup

Create a dedicated test user with the lowest useful permissions. Store credentials as environment variables only:

```text
BRS_BASE_URL=https://www.brsgolf.com/amysgolfclub
BRS_CLUB_ID=amysgolfclub
BRS_USERNAME=...
BRS_PASSWORD=...
BRS_CRAWL_MAX_PAGES=80
BRS_CRAWL_ALLOW_MUTATIONS=false
BRS_CRAWL_EMBEDDED_APP_HOSTS=embedded-memberships.brsgolf.com
BRS_CRAWL_HELP_MODE=attributes
BRS_CRAWL_BROWSER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Never commit real BRS credentials. If credentials have appeared in chat, rotate them before production use.

Use a club-specific `BRS_BASE_URL` or set `BRS_CLUB_ID`. A bare `https://brsgolf.com` URL is the public site; the crawler and live lookup need the authenticated club path.

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

`draft` mode opens and fills safe demo booking surfaces for evidence without submitting. `commit` mode can submit a test booking only on the dedicated demo club. Controlled write exploration is allowed only when it creates temporary test data, records the exact rollback action, restores or deletes the test data, and verifies cleanup before marking the workflow safe. The explorer blocks setup/settings mutations such as System Configuration, Configure Timesheet, Green Fee setup, reservation types, payment methods, user permissions, and other admin setup areas unless a setting-specific restore helper exists.

Demo workflow output is written to `knowledge/workflows/demo` with `confidence: needs-review` and `safeForChatbot: false`. A human must review the route evidence before it becomes approved answer material.

## Automatic workflow exploration queue

When the live chatbot cannot answer a workflow question from approved evidence, it queues the question for automatic workflow exploration. The task is stored in Postgres when `DATABASE_URL` is configured, otherwise local development writes to `data/workflow-exploration-queue.jsonl`.

Each queued task carries a safety tier:

- `read-only`: navigate and collect page evidence only.
- `safe-test-record-with-rollback`: create or edit only temporary test records on the dedicated test system, then revert and verify the original state.
- `read-and-draft-only`: inspect settings and fill draft forms, but do not submit settings changes.
- `auto-restricted`: payments, messaging, permissions, integrations, and other sensitive actions. These are not automatically mutated.

Automatic write exploration should only promote evidence to approved workflow knowledge when rollback is verified. For settings, create a setting-specific helper that reads the original state, applies a limited test change, restores the original value, and verifies the restore before marking the workflow safe for chatbot reuse.

To create the starter workflow-family base from already approved local guidance, run:

```text
npm run seed:workflow-families
```

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

After login, the crawler also checks for approved embedded BRS application iframes. This matters for Memberships because the top-level BRS navigation opens Memberships inside `embedded-memberships.brsgolf.com`; crawling only the parent page sees the iframe but misses the Memberships sub-navigation, forms, modals, table columns, and settings tabs. Keep `BRS_CRAWL_EMBEDDED_APP_HOSTS` narrowly allowlisted and add hosts only after confirming they are BRS product surfaces for the approved test club.

Use `BRS_CRAWL_HELP_MODE=attributes` for broad crawls. It captures reusable title/aria/help attributes without clicking every tooltip or modal trigger, which keeps full-area crawls practical. Use `full` only for a narrow page or workflow where tooltip/modal detail matters.

When crawl output is generated from a live demo club, run `node scripts/sanitize-crawl-output.js <json files>` before building the knowledge index. The sanitizer removes common live-data shapes such as member-like option labels, emails, monetary values, dates, and long identifiers. Still review the diff before committing generated crawl output.

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

The support bot should answer from the reviewed knowledge index first. Live lookup is a safety net for workflow evidence gaps: it should verify the answer from the configured test system, answer only from verified evidence, and persist the observed workflow/context back into the knowledge base so future matching questions do not need live browsing.

## Vercel live lookup browser runtime

Live lookup uses Playwright. On Vercel, the most reliable production setup is to use a managed browser service and set `BRS_LIVE_BROWSER_WS_ENDPOINT` to its WebSocket endpoint. This avoids native library failures such as missing `libnss3.so` in Vercel's serverless runtime.

Required Vercel environment variables for live lookup:

```text
BRS_LIVE_LOOKUP_ENABLED=true
BRS_BASE_URL=https://www.brsgolf.com/amysgolfclub
BRS_CLUB_ID=amysgolfclub
BRS_USERNAME=...
BRS_PASSWORD=...
BRS_LIVE_LOOKUP_TIMEOUT_MS=45000
BRS_LIVE_BROWSER_WS_ENDPOINT=wss://...
```

The app still contains a local direct Chromium fallback for development. Set `BRS_LIVE_LOOKUP_ALLOW_DIRECT=true` and `BRS_LIVE_BROWSER_EXECUTABLE_PATH` locally when you need to verify the browser path. On Vercel, configure `BRS_LIVE_WORKER_URL` or `BRS_LIVE_BROWSER_WS_ENDPOINT`; do not rely on direct browser launch in serverless runtime.
