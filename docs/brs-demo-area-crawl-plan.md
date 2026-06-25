# BRS demo area crawl plan

This plan is for building stronger, more specific chatbot answers from the approved demo BRS system without recording club-specific data.

## Scope

Capture product workflow knowledge only:

- navigation routes and breadcrumbs
- page purpose and area boundaries
- visible actions, filters, fields, table columns, report names, and wizard steps
- validation messages and reversible confirmation states
- safe verification checks a golf club staff user can perform

Do not record live member names, staff names, visitor names, bookings, rates, balances, payment references, email addresses, phone numbers, custom club policies, credentials, or any value that belongs to the demo club rather than the BRS product.

## Crawl order

Work one area or workflow family at a time, and only promote knowledge after the notes are reviewed and redacted.

1. Memberships > Billing/Payments: create bills, single bill view, batch bill view, overdue bills, payments from bill views.
2. Memberships > Members: member profile, billing area, communication/preferences, membership status, member documents, member search/filter.
3. Memberships > Membership Types, Subscriptions, Accounts, and Settings: setup fields, renewal/billing relationships, payment schemes, discounts.
4. Timesheet and Booking Details: create bookings, edit bookings, move/cancel bookings, services, notes, statuses, payments, no-shows.
5. BRS Payments: transactions, refunds, payouts, payment requests, VAT reports, payment status checks.
6. Tools > System Configuration and Configure Timesheet: booking rules, intervals, rates, reservation types, confirmation templates, operational settings.
7. Messages and Email/Letter Templates: templates, timesheet messages, member/visitor communications, send restrictions.
8. Users and permissions: staff users, roles, password actions, access boundaries.
9. Reports: booking, revenue, membership, customer, payment, and operational reports.
10. Contacts, Search, Facilities, Golf Plus, Dashboard, and Need Help: search workflows, facility setup, dashboard links, cross-area support routes.

## Evidence template

Each workflow note should include:

- area and page title
- route or breadcrumb
- user role: golf club admin, golf club staff, pro shop, or membership/admin staff
- task wording and likely user aliases
- preconditions
- exact visible action labels
- fields and required fields
- table columns and filters
- modal/wizard steps
- safe step-by-step answer
- verification/check step that is directly relevant to the task
- uncertainty or unobserved controls
- sensitivity review result

## Safety tiers

- `read-only`: navigate, search, open views, and record UI structure.
- `read-and-draft-only`: open wizards or forms and inspect controls without submitting.
- `reversible-write`: create or edit only a temporary test record after recording the original state, then undo and verify rollback.
- `restricted`: payments, refunds, payouts, outbound messaging, permission changes, integrations, irreversible deletes, and anything that affects real customers. Do not mutate these without a separate explicit approval and rollback design.

## Change ledger

Every write/edit test must be recorded before the mutation is attempted:

| Timestamp | Area | Workflow | Action | Test record label | Original state | New state | Rollback action | Rollback verified | Evidence file |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Use a clearly temporary label such as `BRS Chatbot Test YYYY-MM-DD`. Prefer draft-only paths. Do not send customer messages, take payments, issue refunds, change real staff permissions, or leave bookings/bills/settings behind.

## Current progress

- Memberships > Billing/Payments > Create Bills has been captured in read-and-draft-only mode.
- Single bill, batch bill, and overdue bill report views have been captured in read-only mode.
- No demo records were created or edited during the first Memberships billing pass, so no rollback was required.
- The Who To Bill controls inside the Create Bills filter modal still need a separate capture pass because the browser bridge did not reliably switch to that modal tab.
- Memberships > Membership Types > Create Membership Type has been captured in read-and-draft-only mode, including the Flex checkbox, status options, age/service/chained-type fields, default subscription selection, and verification that the Membership Types list shows Flex as Yes for flexible types.
- Memberships opens an embedded app. Future crawls should open the approved embedded Memberships iframe directly after login so Dashboard, Members, Membership Types, Subscriptions, Billing/Payments, Reports, Accounts, and Settings are captured as real pages rather than a blank parent iframe.
