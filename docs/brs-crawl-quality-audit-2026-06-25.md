# BRS Crawl Quality Audit - 2026-06-25

## Purpose

Audit the previous BRS demo-system crawl for evidence that was stored as reusable chatbot knowledge without a completed workflow behind it.

This audit was prompted by a bad answer where the chatbot used a launcher label such as "How to Create a New Member" and then generated vague steps that were not proven by the crawl.

## Findings

The previous crawl contained useful page observations, but it also contained many incomplete workflow records across BRS areas. The risky records had one or more of these traits:

- Generic generated steps such as "Use the visible fields, filters, tabs, or actions shown on the page".
- Launcher/help labels from "Need Help?", WalkMe, or "How to..." buttons without the workflow being opened and completed.
- Sign-in, access-denied, or server-error pages with enough page chrome to pass the old approval heuristic.
- Redacted individual member/finance pages that could rank for broad member questions but did not prove a create-member workflow.
- Page-level surfaces named "workflow surface" rather than a confirmed route with exact controls and outcome.

The issue was global, not membership-specific. Affected areas in the review queue include top-level BRS pages, Timesheet, Contacts, Users, Reports, Search, Tools, Messages, Competitions, Memberships, and error/access pages.

## Fix Applied

The knowledge build and retrieval path now treats incomplete crawl evidence as audit material only.

- `scripts/build-knowledge-base.js` uses incomplete-workflow detection before auto-approving crawled system entries.
- `lib/retrieval.js` retrieves only `confidence: "approved"` entries.
- `lib/groundingGuards.js` detects launcher-only, generic, sign-in, access-denied, server-error, and redacted member-page evidence.
- Regression tests cover launcher-only workflows, generic sign-in/action captures, error pages, and retrieval exclusion.

## Rebuild Result

After rebuilding `knowledge/knowledge-index.json`:

- Total entries: 352
- Approved entries: 114
- Review entries: 238
- Approved entries matching unsafe incomplete-workflow patterns: 0

The 238 review entries remain in `knowledge/review-queue.json` so they can be inspected later, but they are no longer eligible as chatbot evidence.

## Remaining Work

The crawl still needs proper completion for workflows currently represented only by launcher labels or generic page surfaces. Those should be recrawled by opening each workflow and recording exact navigation, fields, controls, save/submit behavior, and verification steps before being promoted to approved knowledge.

