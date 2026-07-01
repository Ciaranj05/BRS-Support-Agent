import assert from "node:assert/strict";
import test from "node:test";
import { applyAnswerQualityGate } from "../lib/answerQuality.js";
import { approvedStaticWorkflowReply } from "../lib/staticWorkflowAnswers.js";

test("delivery failure questions route to troubleshooting instead of send-email workflow", () => {
  const questions = [
    "Can you please check on an email address from one of our members which doesn't seem to be accepting emails from BRS. He has checked for messages in his spam folder. The email address does not appear to be suppressed on our system.",
    "A member is not receiving emails from BRS.",
    "A contact is not getting club messages.",
    "A user is not receiving password reset emails.",
    "An SMS bounced for a visitor mobile number.",
  ];

  for (const question of questions) {
    const reply = approvedStaticWorkflowReply(question);

    assert.match(reply, /not receiving brs messages/i);
    assert.match(reply, /Unsuppress/i);
    assert.match(reply, /suppressed by the BRS\/email delivery system/i);
    assert.match(reply, /spam\/junk/i);
    assert.match(reply, /recipient was included in the selected audience/i);
    assert.doesNotMatch(reply, /Email Members\s*\n\n1\. "Tools"/i);
    assert.doesNotMatch(reply, /Choose "Email Membership Types", "Email Membership Groups", or "Email Selected Members"/i);
    assert.doesNotMatch(reply, /Select the membership type, member group, or selected members who should receive the email/i);
  }
});

test("send-email questions still route to the send-email workflow", () => {
  const reply = approvedStaticWorkflowReply("How do I send an email to members?");

  assert.match(reply, /Email Members/i);
  assert.match(reply, /Email Membership Types/i);
  assert.match(reply, /Email Membership Groups/i);
  assert.match(reply, /Email Selected Members/i);
});

test("approved delivery troubleshooting answer is not replaced by the quality gate", () => {
  const question = "Can you please check on an email address from one of our members which doesn't seem to be accepting emails from BRS. He has checked for messages in his spam folder. The email address does not appear to be suppressed on our system.";
  const reply = approvedStaticWorkflowReply(question);
  const payload = applyAnswerQualityGate({ reply, version: "approved-static-delivery-troubleshooting-v1" }, question);

  assert.equal(Boolean(payload.qualityGate?.blocked), false);
  assert.match(payload.reply, /Unsuppress/i);
});
