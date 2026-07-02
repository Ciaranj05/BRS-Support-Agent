import assert from "node:assert/strict";
import test from "node:test";
import { resolveReviewQueue } from "../lib/reviewQueueResolution.js";

function placeholder(overrides = {}) {
  return {
    id: "review:1",
    sourceType: "workflow",
    title: "View Contacts confirmed BRS page evidence",
    area: "View Contacts",
    confidence: "needs-review",
    reviewReason: "incomplete-workflow-evidence",
    reviewPayloadWithheld: true,
    controls: [],
    actions: [],
    routes: [],
    fields: [],
    tableHeaders: [],
    ...overrides,
  };
}

test("retires incomplete placeholders already covered by approved same-family knowledge", () => {
  const result = resolveReviewQueue([
    {
      id: "approved:view-contacts",
      sourceType: "system",
      title: "View Contacts",
      area: "View Contacts",
      confidence: "approved",
    },
    placeholder(),
  ]);

  assert.equal(result.reviewQueue.length, 0);
  assert.equal(result.retiredReviewEntries.length, 1);
  assert.equal(result.retiredReviewEntries[0].resolution, "superseded-by-approved-same-family-knowledge");
  assert.equal(result.retiredReviewEntries[0].approvedMatch.title, "View Contacts");
});

test("retires covered restricted and sensitive duplicates while keeping uncovered sensitive entries actionable", () => {
  const result = resolveReviewQueue([
    {
      id: "approved:send-email",
      sourceType: "system",
      title: "Send an Email",
      area: "Email Messaging",
      confidence: "approved",
    },
    placeholder({
      id: "review:send-email",
      title: "Send an Email confirmed BRS page evidence",
      area: "Send an Email",
      reviewReason: "incomplete-workflow-evidence",
    }),
    placeholder({
      id: "review:sensitive-view-contacts",
      title: "View Contacts",
      area: "View Contacts",
      reviewReason: "sensitive-or-live-crawl-data",
    }),
    placeholder({
      id: "review:sensitive-uncovered",
      title: "Uncovered Live Record",
      area: "Uncovered Live Record",
      reviewReason: "sensitive-or-live-crawl-data",
    }),
    {
      id: "approved:view-contacts",
      sourceType: "system",
      title: "View Contacts",
      area: "View Contacts",
      confidence: "approved",
    },
  ]);

  assert.equal(result.retiredReviewEntries.length, 2);
  assert.deepEqual(result.retiredReviewEntries.map((entry) => entry.title).sort(), [
    "Send an Email confirmed BRS page evidence",
    "View Contacts",
  ]);
  assert.equal(result.reviewQueue.length, 1);
  assert.equal(result.reviewQueue[0].reviewReason, "sensitive-or-live-crawl-data");
  assert.equal(result.reviewQueue[0].title, "Uncovered Live Record");
});

test("does not retire generic placeholder labels", () => {
  const result = resolveReviewQueue([
    {
      id: "approved:zero",
      sourceType: "system",
      title: "0%",
      area: "Dashboard",
      confidence: "approved",
    },
    placeholder({
      id: "review:zero",
      title: "0%",
      area: "0%",
    }),
  ]);

  assert.equal(result.retiredReviewEntries.length, 0);
  assert.equal(result.reviewQueue.length, 1);
});

test("retires reviewed page chrome and empty withheld sources", () => {
  const result = resolveReviewQueue([
    placeholder({
      id: "review:zero",
      title: "0%",
      area: "0%",
      reviewReason: "sensitive-or-live-crawl-data",
    }),
    placeholder({
      id: "review:untitled",
      title: "Untitled knowledge entry",
      area: null,
      reviewReason: "requires-human-review",
    }),
  ]);

  assert.equal(result.reviewQueue.length, 0);
  assert.equal(result.retiredReviewEntries.length, 2);
  assert.deepEqual([...new Set(result.retiredReviewEntries.map((entry) => entry.resolution))], [
    "reviewed-non-actionable-empty-or-page-chrome-source",
  ]);
});

test("retires remaining sensitive aliases when approved canonical workflow evidence exists", () => {
  const result = resolveReviewQueue([
    {
      id: "approved:send-text",
      sourceType: "workflow",
      title: "Send a Text workflow",
      area: "Text Messaging",
      confidence: "approved",
    },
    {
      id: "approved:messaging-groups",
      sourceType: "workflow",
      title: "Membership Groups for Email and Text workflow",
      area: "Tools",
      confidence: "approved",
    },
    {
      id: "approved:timesheet",
      sourceType: "workflow",
      title: "Timesheet workflow",
      area: "Timesheet",
      confidence: "approved",
    },
    {
      id: "approved:open-competitions",
      sourceType: "workflow",
      title: "Open Competitions workflow",
      area: "Competitions",
      confidence: "approved",
    },
    placeholder({
      id: "review:text-messages",
      title: "Text Messages confirmed BRS page evidence",
      area: "Text Messages",
      reviewReason: "sensitive-or-live-crawl-data",
    }),
    placeholder({
      id: "review:messaging-group",
      title: "Member [redacted-name] for Email and Text",
      area: "Member [redacted-name] for Email and Text",
      reviewReason: "sensitive-or-live-crawl-data",
    }),
    placeholder({
      id: "review:demo-routes",
      title: "Demo explored workflow routes",
      area: "BRS demo workflow exploration",
      reviewReason: "sensitive-or-live-crawl-data",
    }),
    placeholder({
      id: "review:open-competition-terms",
      title: "Terms and Conditions - All Ireland Open Competitions Search Facility confirmed BRS page evidence",
      area: "Terms and Conditions - All Ireland Open Competitions Search Facility",
      reviewReason: "sensitive-or-live-crawl-data",
    }),
  ]);

  assert.equal(result.reviewQueue.length, 0);
  assert.equal(result.retiredReviewEntries.length, 4);
  assert.deepEqual(result.retiredReviewEntries.map((entry) => entry.approvedMatch.title).sort(), [
    "Membership Groups for Email and Text workflow",
    "Open Competitions workflow",
    "Send a Text workflow",
    "Timesheet workflow",
  ]);
});
