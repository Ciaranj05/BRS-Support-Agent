import assert from "node:assert/strict";
import test from "node:test";
import { rewriteAddsUnsupportedDetails } from "../lib/rewriteSafety.js";
import { prepareChatPayload } from "../services/chat/chatPayloadService.js";

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

test("skips model rewrite for approved deterministic response versions", async () => {
  const previous = process.env.BRS_ENABLE_REPLY_REWRITE;
  process.env.BRS_ENABLE_REPLY_REWRITE = "true";
  try {
    const payload = await prepareChatPayload({
      client: {
        responses: {
          create: async () => {
            throw new Error("rewrite should not run");
          },
        },
      },
      payload: {
        reply: "Go to:\nTee Sheet >> Tee Time >> Booking Details >> Payments tab",
        version: "audience-aware-clarification-routing-v3",
      },
      message: "Yes, BRS Payments",
      debug: {},
      debugEnabled: false,
    });

    assert.match(payload.reply, /Booking Details/);
  } finally {
    if (previous === undefined) delete process.env.BRS_ENABLE_REPLY_REWRITE;
    else process.env.BRS_ENABLE_REPLY_REWRITE = previous;
  }
});
