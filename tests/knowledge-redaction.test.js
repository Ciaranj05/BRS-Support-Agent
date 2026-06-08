import assert from "node:assert/strict";
import test from "node:test";
import { hasSensitiveData, redactText } from "../lib/knowledgeRedaction.js";

test("preserves product phrases that start with member-related words", () => {
  const productText = "Membership Billing Reports show members with unpaid bills and outstanding membership balances.";
  const redacted = redactText(productText);

  assert.equal(redacted, productText);
  assert.equal(hasSensitiveData(productText), false);
});

test("preserves generic role nouns that are followed by product concepts", () => {
  const productText = "Visitor Booking Reports and Staff Permissions pages describe system workflows.";
  const redacted = redactText(productText);

  assert.equal(redacted, productText);
  assert.equal(hasSensitiveData(productText), false);
});

test("redacts likely real names when they are labelled by user role", () => {
  assert.equal(redactText("member: John Smith has a balance"), "member [redacted-name] has a balance");
  assert.equal(redactText("Customer Jane Bloggs called support"), "Customer [redacted-name] called support");
  assert.equal(hasSensitiveData("Visitor Sam Jones paid online"), true);
});
