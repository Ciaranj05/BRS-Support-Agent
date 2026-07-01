import assert from "node:assert/strict";
import test from "node:test";
import { validateChatInput } from "../lib/middleware/security.js";
import { normaliseImageAttachments, redactVisionSummary, messageWithVisionContext } from "../lib/visionContext.js";
import { visualAidOptionForAnswer } from "../lib/visualAids.js";
import { approvedStaticWorkflowReply } from "../lib/staticWorkflowAnswers.js";
import { buildVerifiedScreenshotContext, isVerifiedScreenshotRequest, screenshotUnavailableReply } from "../lib/verifiedScreenshotRequest.js";
import { prepareChatPayload } from "../services/chat/chatPayloadService.js";

const tinyPng = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };
}

test("chat image attachments are validated and normalised", () => {
  const attachments = normaliseImageAttachments([{ filename: "screen.png", mimeType: "image/png", dataUrl: tinyPng }]);

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].mimeType, "image/png");
  assert.equal(attachments[0].filename, "screen.png");
  assert.equal(typeof attachments[0].hash, "string");
  assert.notEqual(attachments[0].hash, attachments[0].dataUrl);
});

test("chat validation accepts screenshot-only messages and rejects invalid images", () => {
  const okReq = { body: { attachments: [{ filename: "screen.png", mimeType: "image/png", dataUrl: tinyPng }] } };
  const okRes = makeRes();
  let nextCalled = false;
  validateChatInput(okReq, okRes, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(okReq.body.attachments.length, 1);

  const badReq = { body: { message: "help", attachments: [{ filename: "bad.txt", mimeType: "text/plain", dataUrl: "data:text/plain;base64,SGVsbG8=" }] } };
  const badRes = makeRes();
  validateChatInput(badReq, badRes, () => {});

  assert.equal(badRes.statusCode, 400);
  assert.match(badRes.payload.error, /base64 image data URL|PNG, JPG, WEBP, or GIF/i);
});

test("vision summaries are redacted before they are used as routing context", () => {
  const summary = redactVisionSummary("Member Joe Bloggs has email joe@example.com and phone +44 028 9568 0288 on booking BRS-123456.");
  const message = messageWithVisionContext("Why can I not save this?", { summary });

  assert.match(summary, /\[redacted-email\]/);
  assert.match(summary, /\[redacted-phone\]/);
  assert.match(summary, /\[redacted-reference\]/);
  assert.match(message, /Uploaded screenshot context for routing only/);
  assert.match(message, /\[redacted-email\]/);
});

test("member export answers offer opt-in verified screenshots instead of auto images", async () => {
  const reply = [
    "Create a Filtered Member Data Export",
    "",
    "1. Open \"Memberships\".",
    "2. Use \"Filter Active Members\" and \"Membership Type\".",
    "3. Click \"Download CSV Members\".",
  ].join("\n");
  const option = visualAidOptionForAnswer(reply, "member email export");
  const payload = await prepareChatPayload({
    client: null,
    payload: { reply, escalationReady: false, options: [], version: "knowledge-retrieval-v1" },
    message: "Can I export member email addresses?",
    debug: { stages: [] },
    debugEnabled: false,
  });

  assert.equal(option.label, "Still can't find it?");
  assert.equal(payload.images, undefined);
  assert.equal(payload.options[0].label, "Still can't find it?");
  assert.match(payload.options[0].value, /Verified screenshot request/i);
  assert.match(payload.reply, /Create a Filtered Member Data Export/);
});

test("member email delivery troubleshooting offers opt-in screenshot without auto images", async () => {
  const message = "Can you please check on an email address from one of our members which doesn't seem to be accepting emails from BRS.";
  const reply = approvedStaticWorkflowReply(message);
  const payload = await prepareChatPayload({
    client: null,
    payload: { reply, escalationReady: false, options: [], version: "approved-static-delivery-troubleshooting-v1" },
    message,
    debug: { stages: [] },
    debugEnabled: false,
  });

  assert.match(payload.reply, /Check Why a Member Is Not Receiving BRS Emails/);
  assert.equal(payload.images, undefined);
  assert.equal(payload.options[0].label, "Still can't find it?");
});

test("verified screenshot requests use previous support context and avoid mock images", () => {
  const history = [
    { role: "user", content: "How do I export member emails?" },
    { role: "assistant", content: "Create a Filtered Member Data Export\n\n1. Open \"Memberships\"." },
  ];
  const context = buildVerifiedScreenshotContext(history);
  const unavailable = screenshotUnavailableReply("worker not configured");

  assert.equal(isVerifiedScreenshotRequest("Verified screenshot request: show me where this is in the BRS demo system."), true);
  assert.equal(context.question, "How do I export member emails?");
  assert.match(context.answer, /Filtered Member Data Export/);
  assert.match(unavailable, /I have not generated a mock-up or illustrative image/);
});
