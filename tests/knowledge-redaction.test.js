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

test("flags record edit links and opaque identifiers as sensitive crawl data", () => {
  const contactUrl = "https://www.brsgolf.com/amysgolfclub/contacts.php?operation=edit_contact&customer_id=78";
  const identifier = "e29ae85a-597e-11ef-b8c0-b6aea80b5905";

  assert.equal(redactText(contactUrl), "[redacted-record-link]");
  assert.equal(redactText(`Common ID ${identifier}`), "Common ID [redacted-id]");
  assert.equal(hasSensitiveData(contactUrl), true);
  assert.equal(hasSensitiveData(`Common ID ${identifier}`), true);
});

test("redacts demo club urls and names without treating reusable product text as sensitive", () => {
  const text = "AMYS GOLF CLUB links to https://www.brsgolf.com/amysgolfclub/index.php and uses Amy Chambers GC consent text.";
  const redacted = redactText(text);

  assert.equal(
    redacted,
    "[redacted-club] links to [redacted-club-url] and uses [redacted-club] consent text.",
  );
  assert.equal(hasSensitiveData(redacted), false);
});
