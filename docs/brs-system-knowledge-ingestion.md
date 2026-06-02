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
