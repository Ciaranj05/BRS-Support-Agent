# BRS Answer Coverage Audit - 2026-07-02

## Purpose

Track which BRS answer areas are currently backed by approved same-family evidence, and which areas still depend heavily on static fallback wording while review-driver evidence is incomplete.

This report does not approve review entries. It identifies where crawler/driver work should improve the knowledge base next.

## Result

- Source review run: `data/review-driver-runs/2026-07-02T08-35-44-545Z-review-driver-run.json`
- Coverage report: `data/answer-coverage/2026-07-02T08-35-57-418Z-answer-coverage.json`
- Families analysed: 16
- Review backlog represented: 482 actionable entries
- Retired duplicate placeholder entries: 100
- Same-family approved evidence matches: 43
- Static answer prompts found: 37

## Coverage Summary

| Coverage status | Families |
| --- | ---: |
| mixed-static-heavy | 9 |
| static-only | 4 |
| mixed-static-and-dynamic | 2 |
| evidence-gap | 1 |

| Priority | Families |
| --- | ---: |
| highest | 1 |
| high | 13 |
| normal | 2 |

## Content Fixes Made

- 100 incomplete placeholder review entries were retired from the actionable queue because they are superseded by approved same-family knowledge.
- Sensitive/live-data entries and restricted-family entries remain in review even when titles overlap with approved guidance.
- Golf Events and Competitions are separated in the answer layer, not only in the driver classifier.
- "What is a golf event?" now explains that Golf Events is separate from Competitions.
- "How do I set up a golf event?" routes to Golf Events and does not mention opening Competitions.
- "How do I set up an open competition?" routes to Competitions and does not mention opening Golf Events.
- Generic "organiser booking" wording no longer assumes Golf Events unless the user also gives event, golf-day, or society context.

## Next Evidence Targets

The most useful next crawl/driver work is now visible from the coverage report:

- `golf-events` is static-only with 8 queued review entries.
- `contact-setup` is static-only with 5 queued review entries.
- `online-booking` is static-only with 2 queued review entries.
- Restricted families must remain blocked for automated mutation, even when static answers exist.
- `manual-review` contains 9 placeholder entries with no reliable page identity and should not be promoted automatically.
