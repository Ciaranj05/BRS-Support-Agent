import assert from "node:assert/strict";
import test from "node:test";
import { isBRSWorkflowQuestion } from "../lib/knowledgeAnswer.js";

test("classifies operational BRS questions as workflow questions", () => {
  assert.equal(isBRSWorkflowQuestion("how do I add a buggy to a booking"), true);
  assert.equal(isBRSWorkflowQuestion("refund a membership bill"), true);
  assert.equal(isBRSWorkflowQuestion("where do I export the visitors report"), true);
});

test("does not classify generic thanks as a workflow question", () => {
  assert.equal(isBRSWorkflowQuestion("thanks that worked"), false);
});
