import assert from "node:assert/strict";
import test from "node:test";
import { buildClarifiedSupportQuestion } from "../server.js";

test("combines clarification answers with the original support question", () => {
  const question = buildClarifiedSupportQuestion({
    originalQuestion: "How do I update a member bill?",
    question: "Is the bill published, draft, or already paid?",
    context: "Membership bill update request.",
    answers: [],
  }, "Published");

  assert.match(question, /Original question: How do I update a member bill\?/);
  assert.match(question, /Clarification asked: Is the bill published, draft, or already paid\?/);
  assert.match(question, /User clarification: Published/);
  assert.match(question, /Relevant context: Membership bill update request\./);
});

test("preserves earlier clarification answers when asking a second question", () => {
  const question = buildClarifiedSupportQuestion({
    originalQuestion: "The customer paid but nothing is there",
    question: "Where were you expecting to see the payment?",
    context: "Payment visibility issue.",
    answers: [
      { question: "What is the payment attached to?", answer: "Member bill" },
    ],
  }, "BRS Payments transaction");

  assert.match(question, /Original question: The customer paid but nothing is there/);
  assert.match(question, /User clarification: BRS Payments transaction/);
  assert.match(question, /Earlier clarifications: What is the payment attached to\? -> Member bill/);
});

test("falls back to the answer when there is no pending clarification", () => {
  assert.equal(buildClarifiedSupportQuestion(null, "Published"), "Published");
});
