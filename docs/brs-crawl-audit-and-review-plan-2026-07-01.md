# BRS Crawl Audit and Review Plan - 2026-07-01

## Purpose

Audit the current BRS knowledge base after the answer-generation changes, confirm whether approved entries are complete processes, and define the plan for review-queue entries.

The key conclusion is that write access is needed for complete workflow evidence, but it must be controlled by workflow-specific drivers. A broad crawler with full permissions can see more buttons, but it still cannot safely prove a process unless it clicks through the real flow, records the result state, and rolls back any temporary test data.

## What was run

- Ran a broad authenticated crawl against `amysgolfclub` in read-only mode with attribute-level help capture.
- The crawl visited 95 authenticated pages and produced 90 system observations plus 90 workflow-shaped page observations.
- Ran the demo workflow explorer in commit mode for a booking flow with write exploration enabled.
- The write-capable explorer captured two booking-related routes, but did not create a booking because it did not find a safe submit path to verify and roll back.
- The fresh raw crawl artifacts were removed rather than committed because they contained live contact record edit URLs and test-club list data after the basic sanitizer.

## Confirmed-entry audit

The pre-repair checked-in knowledge index reported 685 entries, with 554 approved and 131 needing review. However, "approved" mixed two different evidence types:

- complete or near-complete workflow knowledge, usually reviewed workflow-family entries or controlled demo explorations
- page/field/action evidence snippets, useful for grounding labels but not sufficient as full process instructions

Using stricter process criteria, only a small subset of approved workflow entries are complete enough to be treated as process knowledge. Stronger approved areas include:

- Membership billing and create-bills flows
- Membership type and flexible-membership setup
- Contact create/delete with rollback verified
- Timesheet create/move booking workflow-family guidance
- Facility or room booking workflow-family guidance
- Membership balance reporting
- Some messaging, upload, and user-account relationship maps

Areas with useful confirmed page evidence but incomplete process proof include:

- Contacts list/edit surfaces
- Reports list/filter/export surfaces
- Reservation Types and Booking Statuses
- Green Fee Rates and visitor/tour-operator rates
- Course Restrictions
- Configure Timesheet and System Tools pages
- Timesheet day/month views
- Users and permissions screens
- Email/text/club-message screens

These entries can still help the new answer pipeline as evidence snippets, but they should not be treated as complete workflows unless a route includes exact navigation, fields, actions, result state, and verification.

## Guardrail change made

The incomplete-workflow guard now treats broad-crawl phrases such as "confirmed BRS page evidence", "Use the confirmed fields/filters", "Use the visible action controls", and "Check the result table columns" as incomplete workflow evidence.

That prevents future broad crawl output from being auto-approved as a complete workflow. A regression test was added for this exact crawler shape.

The redaction layer was also tightened to flag:

- record edit links such as `customer_id=...`
- UUID-like identifiers
- already-redacted sensitive markers in reviewed text

The standalone sanitizer now uses the same sensitive-data checks.

## Repair pass result

The stricter builder was run against the full checked-in source corpus after applying the incomplete-workflow guard and review-payload withholding.

Generated state:

- 685 total generated knowledge entries
- 103 approved entries
- 582 needs-review entries
- 582 review entries with `reviewPayloadWithheld: true`
- 413 review entries reason-coded as `incomplete-workflow-evidence`
- 168 review entries reason-coded as `sensitive-or-live-crawl-data`
- 1 review entry reason-coded as `requires-human-review`

The repair changed the status of the historical flagged/incomplete pages rather than pretending they were complete workflows. Entries without complete process evidence are no longer available to the chatbot as answer evidence. Their review payloads are reduced to a title, area, confidence, review reason, and a short stub message.

The generated knowledge outputs were also tightened so they do not retain:

- record edit links or record IDs
- opaque UUID-like identifiers
- live person/contact row values found during the old crawl
- demo club URLs, demo club IDs, or demo club names in answerable generated content
- source-derived live/demo URL fragments in generated system/workflow IDs

This means the 393 previously flagged approved entries and the 131 pre-existing review entries have been processed through the stricter gate. The remaining 582 review entries should be treated as a safe backlog, not usable answer content. Completing them into approved workflow knowledge requires the targeted workflow drivers described below.

## Review-queue plan

### Phase 0 - Make crawl output safe before promotion

1. Do not commit raw crawl output until it passes a privacy scan for record IDs, edit links, names, emails, phone numbers, balances, UUIDs, dates, and club-specific values.
2. Keep broad crawl output as page evidence only.
3. Add a separate process-completeness field or convention, such as `processCompleteness: evidence-only | draft-observed | complete-verified | rollback-verified`.
4. Rebuild the knowledge index only after unsafe historical crawl entries have been purged or re-sanitized.

### Phase 1 - Build targeted workflow drivers

Full write access should be used through small drivers, not a free-roaming crawler. Each driver should know:

- safe test data to enter, using a label like `BRS Chatbot Test YYYY-MM-DD`
- the exact submit button it is allowed to click
- how to verify the record was created or updated
- how to undo the change
- how to verify rollback

Priority drivers:

1. Timesheet bookings: create booking, add player, add service/buggy, move booking, cancel/delete temporary booking.
2. Contacts: create contact, edit temporary contact, delete temporary contact, export/report read-only checks.
3. Facilities: create draft booking, verify diary/list view, cancel/delete temporary booking.
4. Membership billing: create bill draft/preview, payment scheme setup draft, apply payment scheme to a test bill only with rollback.
5. Membership profiles: create member draft, edit safe fields, status/subscription changes only with a restoration helper.
6. Tools setup: reservation types, booking statuses, services, green fees, course restrictions. Start as read-and-draft-only; allow reversible writes only after a restore helper exists.
7. Reports and Search: read-only complete workflows are enough if filters, run/download actions, and result verification are captured.
8. Messages: draft-only. Do not send emails, texts, or club messages from the crawler.
9. Users/permissions: draft-only unless separately approved. Do not create or change real staff access automatically.
10. BRS Payments/refunds/payouts: restricted. Do not mutate. Capture read-only paths and escalation rules.

### Phase 2 - Triage existing review entries

Group the review queue by workflow family rather than reviewing one JSON entry at a time:

- Deduplicate repeated page captures.
- Promote system/page observations only as evidence snippets.
- Convert complete flows into workflow-family records with aliases, preconditions, steps, verification, related workflows, and write-risk tier.
- Delete or quarantine entries that are mostly live club data, individual record pages, access errors, sign-in pages, or launcher-only WalkMe labels.

Highest review volumes to target first:

- Contacts and contact edit/list captures
- Generic BRS Golf / dashboard / bookings surfaces
- Reports
- Reservation Types and Green Fee Rates
- Timesheet and booking surfaces
- Configure Timesheet, Course Restriction, Booking Statuses, and System Tools
- Memberships embedded app areas

### Phase 3 - Use chatbot telemetry to prioritize

Use the new `answerComposition` metadata to find areas where the chatbot relies heavily on static snippets. Those areas should be crawled first because better process evidence will let the final answer generator synthesize more confidently.

Priority questions for regression checks:

- What is a payment scheme?
- Why would I use a reservation type?
- How do I create a membership bill?
- How do I add a single tee time booking?
- How do I add a buggy or service to a booking?
- How do I export member names and email addresses by membership category?
- How do I find members with outstanding balances?
- How do I refund a booking payment?
- Why is a member not receiving BRS emails?

## Immediate next engineering tasks

1. Add workflow-specific write drivers for Timesheet, Contacts, Facilities, and Membership Billing.
2. Update the broad crawler to avoid following individual record edit URLs by default.
3. Add a post-crawl privacy gate that fails the build if raw or generated knowledge contains record links, UUIDs, credentials, or live person/contact list values.
4. Split approval status from process completeness so evidence snippets can remain usable without being confused for full workflows.
5. Recrawl one workflow family at a time, rebuild, run regression questions, then commit only sanitized and reviewed output.
