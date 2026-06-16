import assert from "node:assert/strict";
import test from "node:test";
import { answerFromKnowledge, isBRSWorkflowQuestion } from "../lib/knowledgeAnswer.js";
import { approvedMoveBookingReply, hasForbiddenMoveBookingAdvice, isMoveBookingQuestion } from "../lib/bookingWorkflowAnswers.js";
import { isMemberBalanceReportQuestion } from "../lib/membershipWorkflowAnswers.js";
import { relatedGuidesForQuestion, titleFromHelpCenterUrl } from "../lib/relatedGuides.js";

test("classifies operational BRS questions as workflow questions", () => {
  assert.equal(isBRSWorkflowQuestion("how do I add a buggy to a booking"), true);
  assert.equal(isBRSWorkflowQuestion("refund a membership bill"), true);
  assert.equal(isBRSWorkflowQuestion("where do I export the visitors report"), true);
});

test("does not classify generic thanks as a workflow question", () => {
  assert.equal(isBRSWorkflowQuestion("thanks that worked"), false);
});

test("move booking wording uses protected approved workflow", async () => {
  const reply = await answerFromKnowledge("how do I move a buggy booking?");

  assert.equal(isMoveBookingQuestion("move a paid visitor booking"), true);
  assert.match(reply, /Click Cut from inside the Booking Details page/);
  assert.match(reply, /Click Paste/);
  assert.doesNotMatch(reply, /drag|right-click|move button/i);
  assert.equal(hasForbiddenMoveBookingAdvice(reply), false);
});

test("forbidden move-booking generated actions are detected", () => {
  assert.equal(hasForbiddenMoveBookingAdvice("Drag the booking to a new tee time."), true);
  assert.equal(hasForbiddenMoveBookingAdvice(approvedMoveBookingReply()), false);
});

test("related guides use workflow family first and variants only when relevant", () => {
  const generalGuides = relatedGuidesForQuestion("how do I move a booking?");
  const serviceGuides = relatedGuidesForQuestion("how do I move a buggy booking?");

  assert.equal(generalGuides[0].title, "Move part of a booking to another tee time");
  assert.equal(generalGuides.some((guide) => guide.title === "Buggy Management"), false);
  assert.equal(serviceGuides[0].title, "Move part of a booking to another tee time");
  assert.equal(serviceGuides.some((guide) => guide.title === "Buggy Management"), true);
});

test("member balance lookup uses protected membership workflow and does not leak contacts routing notes", async () => {
  const typoReply = await answerFromKnowledge("how do I see what menebrs owe me money");
  const regularReply = await answerFromKnowledge("how do I see what members owe me money");

  assert.equal(isMemberBalanceReportQuestion("how do I see what menebrs owe me money"), true);
  assert.match(typoReply, /Open the Memberships area/);
  assert.match(typoReply, /For one individual member/);
  assert.doesNotMatch(typoReply, /Contacts section|non-member records|avoid using the Contacts/i);
  assert.match(regularReply, /Billing\/Payments or Memberships > Reports/);
  assert.doesNotMatch(regularReply, /Contacts section|non-member records|avoid using the Contacts/i);
});

test("help center article urls can display as guide titles", () => {
  assert.equal(
    titleFromHelpCenterUrl("https://help.brsgolf.com/hc/en-us/articles/360001644554-Move-part-of-a-booking-to-another-tee-time"),
    "Move Part Of A Booking To Another Tee Time"
  );
});
