import assert from "node:assert/strict";
import test from "node:test";
import { rewriteAddsUnsupportedDetails } from "../lib/rewriteSafety.js";

test("rejects rewrites that add new support links", () => {
  const original = "Go to Memberships >> Reports and choose the relevant billing report.";
  const rewritten = "Go to Memberships >> Reports and choose the relevant billing report. If you need more help, visit https://support.brsws.com";

  assert.equal(rewriteAddsUnsupportedDetails(original, rewritten), true);
});

test("rejects rewrites that add new menu paths", () => {
  const original = "Open the member profile and check Billing.";
  const rewritten = "Open the member profile, then go to Tools >> BRS Payments >> Transactions.";

  assert.equal(rewriteAddsUnsupportedDetails(original, rewritten), true);
});

test("allows rewrites that preserve existing source links and paths", () => {
  const original = "Go to Memberships >> Reports.\n\nSource: https://help.brsgolf.com/hc/en-us/articles/123";
  const rewritten = "Open Memberships >> Reports.\n\nSource: https://help.brsgolf.com/hc/en-us/articles/123";

  assert.equal(rewriteAddsUnsupportedDetails(original, rewritten), false);
});
