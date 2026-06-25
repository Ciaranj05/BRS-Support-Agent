# BRS workflow-family audit - 2026-06-25

This audit compares the current approved knowledge structure with the live Amy's Golf Club demo navigation observed on 2026-06-25. It is intended for maintaining chatbot knowledge, not for end-user answers.

## Live top-level BRS areas

- Dashboard
- Timesheet
- Messages
- Golf Plus
- Facilities
- Contacts
- Memberships
- Users
- Reports
- Search
- Tools
- Need Help

These still match the broad knowledge-file split in `data/knowledge`, so the current area families remain useful.

## Embedded Memberships app

Memberships is a separate embedded app. The top-level BRS page contains a Memberships iframe whose active product surface is on `embedded-memberships.brsgolf.com`. The crawler must open that approved embedded app directly after BRS login; otherwise it records only the parent iframe and misses the actual workflow screens.

Observed Memberships navigation:

- Dashboard
- Members
- Membership Types
- Subscriptions
- Billing/Payments
- Reports
- Accounts
- Settings, shown as the cog icon

## Coverage status

| Family | Status | Notes |
| --- | --- | --- |
| Memberships > Billing/Payments > Create Bills | Approved but partial | Main create-bills route is approved. `Who To Bill` modal tab still needs deeper capture. |
| Memberships > Membership Types | Improved 2026-06-25 | Create/edit flexible membership type route is now approved with form fields and verification. |
| Memberships > Settings | Partial | General settings captured for grace period, dashboard flexible wallet display, billing/payment minimums, payment receipt email, checkout timeout, and auto-generated BRS username. Other tabs need direct capture. |
| Memberships > Accounts | Partial | Existing KB covers wallets/accounts at list level. Account create/edit fields still need direct capture. |
| Memberships > Members | Partial | Member list/search and member-profile concept are known. Profile tabs and write flows need reversible test-record exploration. |
| Memberships > Subscriptions | Partial | List-level actions and columns are known. Create/edit subscription, cycles, and apply/remove workflows need deeper capture. |
| Memberships > Reports | Good list coverage | Report names are captured. Individual report filters/exports need per-report capture where answer quality is weak. |
| Timesheet and Booking Details | Good starter workflow coverage | Create/move booking families exist. Service, payment, no-show, and cancellation variants need systematic verification. |
| Tools > Configure Timesheet/System Configuration | Broad but risky | Read/draft capture only unless a setting-specific rollback helper exists. |
| Messages/Templates | Broad | Messaging actions are captured. Sending messages remains restricted. |
| Users/Permissions | Broad | Read capture only for permissions; no mutation without explicit approval and rollback design. |
| Reports | Broad | Main report surface is covered, but workflow answers need exact report filters and exports by report. |
| Facilities/Contacts/Search/Golf Plus/Dashboard/Need Help | Basic | Current split remains accurate; detailed workflow capture is lower priority unless user questions expose gaps. |

## Immediate priority order

1. Finish Memberships > Billing/Payments > Create Bills, especially `Who To Bill`.
2. Capture Memberships > Members profile tabs using a temporary test member with rollback.
3. Capture Memberships > Subscriptions create/edit and apply/remove flows.
4. Capture Memberships > Settings tabs: Payment Schemes, Payment Types, Membership Statuses, Wallets, Member Filters, PDF Templates, Email Templates.
5. Capture Memberships > Accounts create/edit wallet/account setup.
6. Expand Timesheet Booking Details variants: services, payments, cancellation, no-show, notes, and status changes.
7. Add per-report filter/export details for the reports most often asked about.

## Safety notes

- Use read-only or read-and-draft-only capture for settings, permissions, payments, refunds, payouts, outbound messaging, integrations, and templates.
- Use reversible-write exploration only for temporary test records, and record the original state, mutation, rollback action, and rollback verification.
- Do not record member names, emails, balances, payment references, booking/customer details, prices, or club-specific policy values as reusable product knowledge.
