import assert from "node:assert/strict";
import test from "node:test";
import { analyzeAnswerCoverage } from "../lib/answerCoverageAnalysis.js";

test("answer coverage analysis separates static fallback from approved evidence", async () => {
  const reviewRun = {
    generatedAt: "2026-07-02T00:00:00.000Z",
    tasks: [
      {
        driverFamily: "golf-events",
        allowedTier: "read-and-draft-only",
        status: "queued",
      },
      {
        driverFamily: "golf-events",
        allowedTier: "read-and-draft-only",
        status: "queued",
      },
      {
        driverFamily: "restricted-payments",
        allowedTier: "restricted",
        status: "blocked",
      },
    ],
  };

  const report = await analyzeAnswerCoverage({
    reviewRun,
    promptsByFamily: {
      "golf-events": ["How do I set up a golf event?"],
      "restricted-payments": ["How do I check BRS Payments transactions?"],
      "manual-review": ["0%"],
    },
    staticReply: (prompt) => prompt.includes("0%") ? "" : `Static answer for ${prompt}`,
    retrieve: async (prompt) => prompt.includes("Payments")
      ? [{ id: "payments", title: "BRS Payments", sourceType: "workflow", confidence: "approved", content: "Transactions" }]
      : [],
  });

  const golfEvents = report.families.find((family) => family.family === "golf-events");
  const payments = report.families.find((family) => family.family === "restricted-payments");
  const manual = report.families.find((family) => family.family === "manual-review");

  assert.equal(golfEvents.coverageStatus, "static-only");
  assert.equal(golfEvents.priority, "high");
  assert.equal(golfEvents.reviewBacklog.total, 2);
  assert.equal(golfEvents.approvedEvidence.count, 0);

  assert.equal(payments.coverageStatus, "mixed-static-and-dynamic");
  assert.equal(payments.priority, "manual-safety-review");
  assert.equal(payments.reviewBacklog.blocked, 1);
  assert.equal(payments.approvedEvidence.count, 1);

  assert.equal(manual.coverageStatus, "evidence-gap");
  assert.equal(manual.priority, "normal");
});
