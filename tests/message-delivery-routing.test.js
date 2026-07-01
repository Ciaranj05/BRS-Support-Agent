import assert from "node:assert/strict";
import test from "node:test";
import { applyAnswerQualityGate } from "../lib/answerQuality.js";
import { approvedStaticWorkflowReply } from "../lib/staticWorkflowAnswers.js";

test("member email delivery failure questions route to concise contextual troubleshooting", () => {
  const reply = approvedStaticWorkflowReply("Can you please check on an email address from one of our members which doesn't seem to be accepting emails from BRS. He has checked for messages in his spam folder. The email address does not appear to be suppressed on our system.");

  assert.match(reply, /Check Why a Member Is Not Receiving BRS Emails/i);
  assert.match(reply, /Open "Users", search for the member/i);
  assert.match(reply, /Unsuppress/i);
  assert.match(reply, /no visible suppression on that profile/i);
  assert.match(reply, /spam\/junk has already been checked/i);
  assert.match(reply, /sent email record or report in "Email Messaging"/i);
  assert.doesNotMatch(reply, /"Memberships" > "Members"|open the member profile there instead|SMS|password reset|booking confirmation|registration reminder|staff\/admin|app-registration|Common causes|Avoid/i);
  assert.doesNotMatch(reply, /Email Members\s*\n\n1\. "Tools"/i);
  assert.doesNotMatch(reply, /Choose "Email Membership Types", "Email Membership Groups", or "Email Selected Members"/i);
  assert.doesNotMatch(reply, /Select the membership type, member group, or selected members who should receive the email/i);
});

test("delivery troubleshooting remains contextual across other recipient channels", () => {
  const memberReply = approvedStaticWorkflowReply("A member is not receiving emails from BRS.");
  const contactReply = approvedStaticWorkflowReply("A contact is not receiving emails from BRS.");
  const smsReply = approvedStaticWorkflowReply("An SMS bounced for a visitor mobile number.");

  assert.match(memberReply, /Check Why a Member Is Not Receiving BRS Emails/i);
  assert.match(contactReply, /Check Why a Recipient Is Not Receiving BRS Emails/i);
  assert.match(contactReply, /Open "Contacts"/i);
  assert.match(smsReply, /Check Why a Recipient Is Not Receiving BRS Text Messages/i);
  assert.doesNotMatch(smsReply, /Unsuppress|Email Membership Types/i);
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
  assert.doesNotMatch(payload.reply, /Common causes|Avoid|SMS\/text|password reset/i);
});
