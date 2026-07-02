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

test("keeps sensitive entries actionable while retiring covered restricted placeholders", () => {
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
  ]);

  assert.equal(result.retiredReviewEntries.length, 1);
  assert.equal(result.retiredReviewEntries[0].title, "Send an Email confirmed BRS page evidence");
  assert.equal(result.reviewQueue.length, 1);
  assert.equal(result.reviewQueue[0].reviewReason, "sensitive-or-live-crawl-data");
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
