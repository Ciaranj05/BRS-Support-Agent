# BRS Review Entry Driver Family Audit - 2026-07-01

## Purpose

Classify every current review entry into a workflow-driver family without collapsing separate BRS product areas into convenient but inaccurate buckets.

This pass does not approve incomplete entries. It creates the execution queue and safety tier for targeted drivers.

Updated on 2026-07-02: duplicate placeholder review entries already covered by approved same-family knowledge are now retired from the actionable queue, while remaining recorded in `knowledge/review-queue.json`.

## Result

- 482 actionable review entries processed
- 100 duplicate placeholder review entries retired as superseded by approved same-family knowledge
- 389 queued for a safe driver tier
- 93 blocked from automated execution
- 9 left as manual review because they have no usable title or area

## Family Boundaries

| Driver family | Entries | Tier | Notes |
| --- | ---: | --- | --- |
| timesheet-bookings | 174 | safe-test-record-with-rollback | Tee sheet, booking, calendar/month, squeeze tee time, and booking-route entries only. Setup pages such as Configure Timesheet and Booking Statuses are not included here. |
| contact-records | 13 | safe-test-record-with-rollback | View/Add/Edit Contact record workflows only. Contact Categories is separate setup. |
| facilities | 0 | safe-test-record-with-rollback | No current review entries landed here after the sanitized queue rebuild. |
| reports-search | 16 | read-only-complete | Reports, Search Bookings, VAT Reports, export/download/search surfaces. Waiting-list mutation entries are not treated as read-only reports. |
| dashboard-navigation | 0 | read-only-complete | Explicit Dashboard/Golf Plus navigation surfaces only. Bare `0%` and generic `BRS page` labels are not inferred as dashboard pages. |
| online-booking | 2 | read-only-complete | Online booking entry pages are kept separate from admin Timesheet bookings. |
| settings-setup | 110 | read-and-draft-only | Reservation Types, Green Fee Rates, Configure Timesheet, Course Restriction, Booking Statuses, Timesheet Templates, Casual Booking Rules, Services, Catering, No Show Reasons, Club News, System Tools. |
| messaging-setup | 17 | read-and-draft-only | Messages on the Timesheet, Legal Messages, Email and Letter Templates, Membership Groups for Email and Text, Service Reminder Email. |
| memberships | 7 | read-and-draft-only | Memberships, member profiles, Membership Types, Club Systems membership mapping/data-preview surfaces. Member email/text sending surfaces are not included here. |
| competitions | 37 | read-and-draft-only | Competitions, Open Competitions, competition dates, and Add member to waiting list. |
| golf-events | 8 | read-and-draft-only | Golf Events is kept separate from Competitions. |
| contact-setup | 5 | read-and-draft-only | Contact Categories only. |
| restricted-outbound-messaging | 42 | restricted | Send Email, Send Text, Club Messaging, Club Message Detail, SMS credit, admin messages, and member email/text sending contexts. |
| restricted-users-permissions | 14 | restricted | Manage Users, user details, new user, passwords, permissions, staff access. |
| restricted-payments | 18 | restricted | Process Competition Charges, Payment Methods, Payment Requests, Balance Transactions, Transactions, Payouts. VAT Reports are not included here because they are reports. |
| restricted-upload-import | 10 | restricted | Upload Timesheet and Import/Update Members or Contacts. |
| manual-review | 9 | manual-review | Untitled, bare `0%`, or generic `BRS page` entries have insufficient safe metadata to classify. |

## Corrections Made During Audit

- Golf Events is its own family, not Competitions.
- Green Fee Rates for Visitors / Tour Operators / Tee Time Agents is setup, not a tee-time booking write flow.
- Configure Timesheet, Booking Statuses, Casual Booking Rules, Timesheet Templates, and No Show Reasons are setup/draft, not writable booking drivers.
- VAT Reports is a report/search family, not restricted payments.
- Messages on the Timesheet, Legal Messages, Email and Letter Templates, Service Reminder Email, and Membership Groups for Email and Text are messaging setup/draft, not outbound send workflows.
- Contact Categories is contact setup, not contact record create/edit.
- Classification ignores breadcrumb/navigation-path contamination, so System Tools does not inherit Payment Methods.
- Online booking entry pages are separate from admin Timesheet booking writes.
- Bare `0%` labels are not treated as dashboard/navigation evidence.
- Generic `BRS page` labels are not treated as dashboard/navigation evidence.

## Generated Artifacts

- `data/review-driver-runs/2026-07-02T08-35-44-545Z-review-driver-run.json`
- `data/review-driver-runs/2026-07-02T08-35-44-545Z-review-driver-tasks.jsonl`
