import assert from "node:assert/strict";
import test from "node:test";
import { answerFromKnowledge, isBRSWorkflowQuestion } from "../lib/knowledgeAnswer.js";
import { routeActionRequest } from "../lib/actionRouter.js";
import { approvedMoveBookingReply, hasForbiddenMoveBookingAdvice, isMoveBookingQuestion } from "../lib/bookingWorkflowAnswers.js";
import { isMemberBalanceReportQuestion } from "../lib/membershipWorkflowAnswers.js";
import { approvedStaticWorkflowReply } from "../lib/staticWorkflowAnswers.js";
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

test("approved static workflows cover crawled BRS admin areas without live lookup", async () => {
  const monthReply = await answerFromKnowledge("How do I view the timesheet by month?");
  const emailReply = await answerFromKnowledge("How do I email all members in a membership type?");
  const userReply = await answerFromKnowledge("How do I add a new staff user?");
  const paymentReply = await answerFromKnowledge("How do I create a general payment request?");
  const copyReply = await answerFromKnowledge("How do I copy services or green fees from one year to another?");

  assert.match(monthReply, /Timesheet by Month/i);
  assert.match(monthReply, /Month view/i);
  assert.match(emailReply, /Email Membership Types/i);
  assert.match(userReply, /Users/i);
  assert.match(userReply, /Add New/i);
  assert.match(paymentReply, /Tools > BRS Payments > General Payment Requests/i);
  assert.match(copyReply, /Copy Services, Catering, or Green Fees/i);
  assert.doesNotMatch(copyReply, /\bdelete\b/i);
});

test("approved static workflow matcher is general rather than example-specific", () => {
  const facilityReply = approvedStaticWorkflowReply("How do I make a room booking?");
  const contactReply = approvedStaticWorkflowReply("How do I add a society contact?");
  const smsReply = approvedStaticWorkflowReply("How do I text selected members?");
  const reportReply = approvedStaticWorkflowReply("Where do I run a revenue report?");
  const paymentsReply = approvedStaticWorkflowReply("Where do I see BRS Payments transactions?");
  const toolsReply = approvedStaticWorkflowReply("Where do I configure member booking rules?");

  assert.match(facilityReply, /Make a Facility Booking/i);
  assert.match(contactReply, /Add a New Contact/i);
  assert.match(smsReply, /Text Selected Members/i);
  assert.match(reportReply, /Reports/i);
  assert.match(paymentsReply, /BRS Payments/i);
  assert.match(toolsReply, /Member Booking Rules/i);
});

test("approved static workflows avoid misleading safety and routing wording", () => {
  const refundReply = approvedStaticWorkflowReply("How do I refund a booking payment?");
  const contactReply = approvedStaticWorkflowReply("How do I add a new visitor contact?");
  const passwordReply = approvedStaticWorkflowReply("How do I change a user's password?");
  const copyReply = approvedStaticWorkflowReply("How do I copy services or green fees from one year to another?");

  assert.doesNotMatch(refundReply, /escalate/i);
  assert.doesNotMatch(contactReply, /\bMemberships\b/);
  assert.doesNotMatch(passwordReply, /ask the user to share/i);
  assert.match(copyReply, /Copy Services, Catering, or Green Fees/i);
});

test("approved static workflows cover dashboard, search, and contact variants", () => {
  const dashboardReply = approvedStaticWorkflowReply("How do I see today's bookings on the dashboard?");
  const searchReply = approvedStaticWorkflowReply("How do I find a booking by booking reference?");
  const contactReply = approvedStaticWorkflowReply("How do I filter contacts by category?");
  const emailReply = approvedStaticWorkflowReply("How do I email contacts?");

  assert.match(dashboardReply, /Dashboard/i);
  assert.match(dashboardReply, /bookings/i);
  assert.match(searchReply, /Search/i);
  assert.match(searchReply, /booking reference/i);
  assert.match(contactReply, /Contacts/i);
  assert.match(contactReply, /category/i);
  assert.match(emailReply, /Email Contacts/i);
});

test("approved static workflows cover common booking and payment lookup variants", () => {
  const bookingReply = approvedStaticWorkflowReply("How do I add a single tee time booking?");
  const detailsReply = approvedStaticWorkflowReply("How do I open booking details from the tee sheet?");
  const vatReply = approvedStaticWorkflowReply("Where do I download a VAT report for payments?");
  const uploadReply = approvedStaticWorkflowReply("Where do I upload members or contacts?");

  assert.match(bookingReply, /Single Tee Time Booking/i);
  assert.match(detailsReply, /Booking Details/i);
  assert.match(vatReply, /BRS Payments VAT Report/i);
  assert.match(uploadReply, /Upload Members or Contacts/i);
});

test("hard-mode wording variants map to general workflow families", async () => {
  const dashboardReply = approvedStaticWorkflowReply("wer do i see todays bookins");
  const bookingReply = await answerFromKnowledge("how do i shift a player to another time");
  const subsReply = approvedStaticWorkflowReply("who still owes subs money");
  const smsReply = approvedStaticWorkflowReply("where do i top up sms");
  const compReply = approvedStaticWorkflowReply("open comp entry fee setup");

  assert.match(dashboardReply, /Dashboard/i);
  assert.match(dashboardReply, /bookings/i);
  assert.match(bookingReply, /Click Cut from inside the Booking Details page/i);
  assert.doesNotMatch(bookingReply, /drag|right-click/i);
  assert.match(subsReply, /Memberships/i);
  assert.match(subsReply, /billing/i);
  assert.match(smsReply, /Text Messaging Credit/i);
  assert.match(compReply, /Competition Charges/i);
});

test("hard-mode precedence keeps specific workflows ahead of generic routes", () => {
  const roomReply = approvedStaticWorkflowReply("find a room booking i made");
  const contactTypeReply = approvedStaticWorkflowReply("how do i make a new contact type");
  const openCompReply = approvedStaticWorkflowReply("visitor price for open comp");

  assert.match(roomReply, /Facilities/i);
  assert.match(roomReply, /reservation/i);
  assert.match(contactTypeReply, /Contact Categories/i);
  assert.match(contactTypeReply, /Tools/i);
  assert.match(openCompReply, /competition/i);
  assert.match(openCompReply, /charges/i);
  assert.equal(routeActionRequest("add warning note on tee sheet"), null);
});
