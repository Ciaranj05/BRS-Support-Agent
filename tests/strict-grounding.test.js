import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { answerFromKnowledge, isBRSWorkflowQuestion } from "../lib/knowledgeAnswer.js";
import { routeActionRequest } from "../lib/actionRouter.js";
import { candidateGuideMatchesQuestion, hasUnsupportedGeneratedWorkflowShape } from "../lib/groundingGuards.js";
import { approvedMoveBookingReply, hasForbiddenMoveBookingAdvice, isMoveBookingQuestion } from "../lib/bookingWorkflowAnswers.js";
import { BRS_SCREEN_LOCATION_RECORD } from "../lib/brsScreenLocations.js";
import { isMemberBalanceReportQuestion } from "../lib/membershipWorkflowAnswers.js";
import { approvedStaticWorkflowReply } from "../lib/staticWorkflowAnswers.js";
import { relatedGuidesForQuestion, titleFromHelpCenterUrl } from "../lib/relatedGuides.js";
import { approvedRefundReply, approvedOfflineRefundReply } from "../server.js";

test("classifies operational BRS questions as workflow questions", () => {
  assert.equal(isBRSWorkflowQuestion("how do I add a buggy to a booking"), true);
  assert.equal(isBRSWorkflowQuestion("refund a membership bill"), true);
  assert.equal(isBRSWorkflowQuestion("where do I export the visitors report"), true);
});

test("does not classify generic thanks as a workflow question", () => {
  assert.equal(isBRSWorkflowQuestion("thanks that worked"), false);
});

test("production chat route does not invoke live lookup", () => {
  const serverSource = fs.readFileSync(new URL("../server-with-feedback.js", import.meta.url), "utf8");

  assert.doesNotMatch(serverSource, /liveBrsLookup|formatLiveEvidence|shouldAttemptLiveBrsLookup/);
});

test("production chat route can skip dynamic knowledge before stateful clarification", () => {
  const serverSource = fs.readFileSync(new URL("../server-with-feedback.js", import.meta.url), "utf8");

  assert.match(serverSource, /shouldPreferStatefulClarification/);
  assert.match(serverSource, /handleRefundClarificationFlow/);
  assert.match(serverSource, /refund-clarification-flow/);
  assert.match(serverSource, /historyHasRefundPrompt/);
  assert.match(serverSource, /refundClarificationAnswer/);
  assert.match(serverSource, /isRefundRecordsLookup/);
  assert.match(serverSource, /allowDynamicKnowledge: !preferStatefulClarification/);
  assert.match(serverSource, /queueKnowledgeGaps: !preferStatefulClarification/);
});

test("production chat route returns specific object-first answers before model fallback", () => {
  const serverSource = fs.readFileSync(new URL("../server-with-feedback.js", import.meta.url), "utf8");

  assert.match(serverSource, /objectFirstReply\?\.routeStrength === "specific"/);
  assert.ok(
    serverSource.search(/const objectFirstReply = answerFromObjectFirstRouting\(routingMessage\)/) <
    serverSource.search(/const preferStatefulClarification = shouldPreferStatefulClarification\(routingMessage, history\)/)
  );
  assert.ok(
    serverSource.search(/const objectFirstReply = answerFromObjectFirstRouting\(routingMessage\)/) <
    serverSource.search(/const initialRefundFlowPayload = handleRefundClarificationFlow\(routingMessage, history\)/)
  );
  assert.match(serverSource, /includeInitialPrompt: false/);
});

test("browser only renders server-provided clarification options", () => {
  const appSource = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(appSource, /function getBotOptions\(text, opts = \[\]\)/);
  assert.match(appSource, /return provided;/);
  assert.doesNotMatch(appSource, /return provided\.length \? provided : inferClarificationOptions\(text\)/);
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
  const memberGuides = relatedGuidesForQuestion("how do I add a member in the system", [
    {
      title: "Add a User",
      url: "https://help.brsgolf.com/hc/en-us/articles/123-Add-a-User",
    },
  ]);

  assert.equal(generalGuides[0].title, "Move part of a booking to another tee time");
  assert.equal(generalGuides.some((guide) => guide.title === "Buggy Management"), false);
  assert.equal(serviceGuides[0].title, "Move part of a booking to another tee time");
  assert.equal(serviceGuides.some((guide) => guide.title === "Buggy Management"), true);
  assert.equal(memberGuides.some((guide) => guide.title === "Add a User"), false);
});

test("member balance lookup uses protected membership workflow and does not leak contacts routing notes", async () => {
  const typoReply = await answerFromKnowledge("how do I see what menebrs owe me money");
  const regularReply = await answerFromKnowledge("how do I see what members owe me money");

  assert.equal(isMemberBalanceReportQuestion("how do I see what menebrs owe me money"), true);
  assert.match(typoReply, /Open Memberships from the main navigation menu/);
  assert.match(typoReply, /For one individual member/);
  assert.doesNotMatch(typoReply, /Contacts section|non-member records|avoid using the Contacts/i);
  assert.match(regularReply, /billing\/report area/i);
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
  const configureReply = await answerFromKnowledge("How do I configure the timesheet for next month?");
  const emailReply = await answerFromKnowledge("How do I email all members in a membership type?");
  const userReply = await answerFromKnowledge("How do I add a new staff user?");
  const paymentReply = await answerFromKnowledge("How do I create a general payment request?");
  const copyReply = await answerFromKnowledge("How do I copy services or green fees from one year to another?");

  assert.match(monthReply, /Timesheet by Month/i);
  assert.match(monthReply, /Month link/i);
  assert.match(configureReply, /Configure the Timesheet/i);
  assert.match(configureReply, /"Operation"/i);
  assert.match(configureReply, /"Configure the Timesheet"/i);
  assert.doesNotMatch(configureReply, /View the Timesheet by Month/i);
  assert.match(emailReply, /Email Membership Types/i);
  assert.match(userReply, /Users/i);
  assert.match(userReply, /Add New/i);
  assert.match(paymentReply, /"Tools" > "BRS Payments" > "General Payment Requests"/i);
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
  assert.match(toolsReply, /Member Casual Booking Rules/i);
});

test("approved static workflows avoid misleading safety and routing wording", () => {
  const refundReply = approvedStaticWorkflowReply("How do I refund a booking payment?");
  const memberBillRefundReply = approvedStaticWorkflowReply("How do I refund a member bill?");
  const membershipBillRefundReply = approvedStaticWorkflowReply("How do I refund a payment on a membership bill?");
  const paymentSchemeReply = approvedStaticWorkflowReply("How do I create a payment scheme?");
  const applyPaymentSchemeReply = approvedStaticWorkflowReply("How do I apply a payment scheme to a bill?");
  const contactReply = approvedStaticWorkflowReply("How do I add a new visitor contact?");
  const passwordReply = approvedStaticWorkflowReply("How do I change a user's password?");
  const copyReply = approvedStaticWorkflowReply("How do I copy services or green fees from one year to another?");

  assert.doesNotMatch(refundReply, /escalate/i);
  assert.match(refundReply, /Booking Details/i);
  assert.match(refundReply, /Payments/i);
  assert.match(refundReply, /Click "?Refund"? beside the correct payment/i);
  assert.match(refundReply, /Processed refunds can be found under "?Tools"? > "?BRS Payments"? > "?Refunds"?/i);
  assert.doesNotMatch(refundReply, /use the "?BRS Payments"? refund route/i);
  assert.match(memberBillRefundReply, /taken through "?BRS Payments"?/i);
  assert.match(memberBillRefundReply, /non-BRS method/i);
  assert.match(memberBillRefundReply, /Processed refunds can be found under "?Tools"? > "?BRS Payments"? > "?Refunds"?/i);
  assert.doesNotMatch(memberBillRefundReply, /rather than|do not use/i);
  assert.match(membershipBillRefundReply, /Refund a Payment on a Membership Bill/i);
  assert.match(membershipBillRefundReply, /taken through "?BRS Payments"?/i);
  assert.match(paymentSchemeReply, /Membership Payment Scheme/i);
  assert.match(paymentSchemeReply, /Settings/i);
  assert.match(paymentSchemeReply, /Payment Schemes/i);
  assert.doesNotMatch(paymentSchemeReply, /member profile/i);
  assert.match(applyPaymentSchemeReply, /Apply a Payment Scheme to a Membership Bill/i);
  assert.match(applyPaymentSchemeReply, /member profile/i);
  assert.match(applyPaymentSchemeReply, /bill/i);
  assert.doesNotMatch(paymentSchemeReply, /What is happening with the payment/i);
  assert.doesNotMatch(contactReply, /\bMemberships\b/);
  assert.doesNotMatch(passwordReply, /ask the user to share/i);
  assert.doesNotMatch(passwordReply, /in chat/i);
  assert.match(copyReply, /Copy Services, Catering, or Green Fees/i);
});

test("setup versus application intent is general across reusable objects", () => {
  const createPaymentScheme = approvedStaticWorkflowReply("How do I create a payment scheme?");
  const applyPaymentScheme = approvedStaticWorkflowReply("How do I attach a payment scheme to a bill?");
  const createMembershipType = approvedStaticWorkflowReply("How do I create a new senior membership type?");
  const assignMembershipType = approvedStaticWorkflowReply("How do I assign a membership type to a member?");
  const createGreenFee = approvedStaticWorkflowReply("How do I set up green fee rates?");
  const assignGreenFee = approvedStaticWorkflowReply("How do I assign a green fee to a reservation?");
  const createService = approvedStaticWorkflowReply("How do I set up buggy services?");
  const addService = approvedStaticWorkflowReply("How do I add a buggy service to a booking?");

  assert.match(createPaymentScheme, /Memberships[\s\S]*Settings[\s\S]*Payment Schemes/i);
  assert.match(applyPaymentScheme, /Payment Scheme to a Membership Bill/i);
  assert.match(applyPaymentScheme, /member profile/i);

  assert.match(createMembershipType, /Set Up Membership Types/i);
  assert.match(createMembershipType, /Tools/i);
  assert.match(assignMembershipType, /Change a Member's Membership Type/i);
  assert.match(assignMembershipType, /member profile/i);

  assert.match(createGreenFee, /Set Up Green Fee Rates/i);
  assert.match(createGreenFee, /Tools/i);
  assert.match(assignGreenFee, /Assign a Green Fee to a Reservation/i);
  assert.match(assignGreenFee, /Booking Details/i);

  assert.match(createService, /Set Up Bookable Services/i);
  assert.match(createService, /Tools/i);
  assert.match(createService, /Services/i);
  assert.match(addService, /Add Services to a Booking/i);
  assert.match(addService, /Booking Details/i);
});

test("approved membership bill creation questions do not fall through to unknown workflow gap", async () => {
  const directBillReply = approvedStaticWorkflowReply("How do I create a bill for a member?");
  const plainBillReply = await answerFromKnowledge("How do I create a bill?");
  const membershipBillReply = await answerFromKnowledge("How do I create a membership bill?");
  const addBillReply = await answerFromKnowledge("How do I add a bill for a member?");
  const invoiceReply = await answerFromKnowledge("How do I raise an invoice for a member?");
  const schemeReply = approvedStaticWorkflowReply("How do I create a payment scheme?");
  const balanceReply = approvedStaticWorkflowReply("How do I find members with outstanding bills?");

  assert.equal(isMemberBalanceReportQuestion("How do I create a membership bill?"), false);
  assert.equal(isMemberBalanceReportQuestion("How do I find members with outstanding bills?"), true);

  for (const reply of [directBillReply, plainBillReply, membershipBillReply, addBillReply, invoiceReply]) {
    assert.match(reply, /Create a Membership Bill/i);
    assert.match(reply, /"Billing\/Payments"/i);
    assert.match(reply, /"CREATE BILLS"/i);
    assert.match(reply, /"Billing Reference"/i);
    assert.match(reply, /"Due Date"/i);
    assert.match(reply, /"SET BILL FILTERS"/i);
    assert.match(reply, /"Payment Schemes"/i);
    assert.match(reply, /"PREVIEW"/i);
    assert.match(reply, /confirm the bill appears with the correct member or audience, due date, amount, payment status, and publish status/i);
    assert.doesNotMatch(reply, /If the user means|payment scheme workflow|scheduled payment/i);
    assert.doesNotMatch(reply, /complete proven BRS workflow/i);
    assert.doesNotMatch(reply, /View Members Who Owe/i);
  }

  assert.match(schemeReply, /Create or Manage Membership Payment Schemes/i);
  assert.match(balanceReply, /View Members Who Owe Membership Money/i);
});

test("approved direct routes cover non-billing BRS areas before workflow gap", async () => {
  const memberProfileReply = await answerFromKnowledge("How do I create a member profile?");
  const memberLoginReply = await answerFromKnowledge("How do I set up a member login?");
  const bookingRulesReply = await answerFromKnowledge("How do I change booking rules?");
  const advanceBookingReply = approvedStaticWorkflowReply("advance booking");
  const buggyVisitorReply = await answerFromKnowledge("How do visitors book buggies?");
  const buggyCountReply = approvedStaticWorkflowReply("buggy count");
  const greenFeeReply = await answerFromKnowledge("How do I setup green fee rates?");
  const emailTemplateReply = await answerFromKnowledge("How do I edit email templates?");
  const teeSheetReply = await answerFromKnowledge("How do I setup tee sheet?");
  const userReply = await answerFromKnowledge("How do I create a staff user?");

  assert.match(memberProfileReply, /Create a Member Profile or Account/i);
  assert.match(memberProfileReply, /BRS "?Members"? Tee Time Reservation URL/i);
  assert.match(memberLoginReply, /Create a Member Profile or Account/i);
  assert.match(bookingRulesReply, /Check Booking Rules/i);
  assert.match(bookingRulesReply, /Member Casual Booking Rules/i);
  assert.match(advanceBookingReply, /Check Booking Rules/i);
  assert.match(buggyVisitorReply, /Check Buggy Booking Availability/i);
  assert.match(buggyVisitorReply, /System Configuration/i);
  assert.match(buggyCountReply, /Check Buggy Booking Availability/i);
  assert.match(greenFeeReply, /Set Up Green Fee Rates/i);
  assert.match(emailTemplateReply, /Set Up Email and Letter Templates/i);
  assert.match(teeSheetReply, /Configure the Timesheet/i);
  assert.match(userReply, /Add a User/i);

  for (const reply of [memberProfileReply, memberLoginReply, bookingRulesReply, buggyVisitorReply, greenFeeReply, emailTemplateReply, teeSheetReply, userReply]) {
    assert.doesNotMatch(reply, /complete proven BRS workflow/i);
  }
});

test("vague workflow prompts clarify instead of queueing exploration", () => {
  const serverSource = fs.readFileSync(new URL("../server-with-feedback.js", import.meta.url), "utf8");

  assert.match(serverSource, /function vagueWorkflowClarificationPayload/);
  assert.match(serverSource, /Which BRS area is this about\?/);
  assert.match(serverSource, /vague-workflow-clarification/);
  assert.ok(
    serverSource.search(/const vagueClarification = vagueWorkflowClarificationPayload\(message\)/) <
    serverSource.search(/const queued = await enqueueWorkflowExploration/)
  );
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
  const refundRecordsReply = approvedStaticWorkflowReply("Where can I see refund records after a refund has been made?");
  const refundReportReply = approvedStaticWorkflowReply("Where do I find the refund report?");

  assert.match(bookingReply, /Single Tee Time Booking/i);
  assert.match(detailsReply, /Booking Details/i);
  assert.match(vatReply, /BRS Payments VAT Report/i);
  assert.match(uploadReply, /Upload Members or Contacts/i);
  assert.match(refundRecordsReply, /BRS Payments Refunds/i);
  assert.match(refundReportReply, /BRS Payments Refunds/i);
});

test("approved static workflows cover slow clarification regressions deterministically", () => {
  const emailMembersReply = approvedStaticWorkflowReply("How do I send an email message to members?");
  const membershipTypesReply = approvedStaticWorkflowReply("How do I set up membership types like senior and junior?");
  const playingStatsReply = approvedStaticWorkflowReply("How do I run playing statistics for members?");
  const memberEmailsReply = approvedStaticWorkflowReply("How do I get member email addresses for Outlook?");
  const competitionBookingReply = approvedStaticWorkflowReply("People cannot book into a competition online. What should I check?");
  const competitionEntryReply = approvedStaticWorkflowReply("How do I change or cancel a competition entry?");
  const typoTimesheetReply = approvedStaticWorkflowReply("How do I conifgure the tee shet intervals?");

  assert.match(emailMembersReply, /Email Members/i);
  assert.match(membershipTypesReply, /Membership Types/i);
  assert.match(playingStatsReply, /Playing Statistics Report/i);
  assert.match(memberEmailsReply, /Member Email Addresses/i);
  assert.match(competitionBookingReply, /Competition Online Booking/i);
  assert.match(competitionEntryReply, /Competition Entry/i);
  assert.match(typoTimesheetReply, /Configure the Timesheet/i);
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

test("uploads and ambiguous grace periods do not fall through to model fallback", async () => {
  const uploadMembersReply = await answerFromKnowledge("upload members");
  const uploadContactsReply = await answerFromKnowledge("import contacts");
  const graceReply = await answerFromKnowledge("how do I extend a grace period");

  assert.match(uploadMembersReply, /Upload Members and Contacts/i);
  assert.match(uploadMembersReply, /Members/i);
  assert.match(uploadMembersReply, /CSV/i);
  assert.match(uploadContactsReply, /Upload Members and Contacts/i);
  assert.match(uploadContactsReply, /Contacts/i);
  assert.match(graceReply, /Change the Membership Grace Period/i);
  assert.match(graceReply, /"Memberships"/i);
  assert.match(graceReply, /"Settings"/i);
  assert.match(graceReply, /"General"/i);
});

test("broad admin setup wording maps to deterministic workflow families", () => {
  const clubEmailReply = approvedStaticWorkflowReply("where do i change club email address");

  assert.match(clubEmailReply, /Change the Club Email Address/i);
  assert.match(clubEmailReply, /"Club Contact Details"/i);
  assert.match(clubEmailReply, /"Main club email address \(mandatory\)"/i);
  assert.match(clubEmailReply, /"Email and Letter Templates"/i);
  assert.doesNotMatch(clubEmailReply, /Check:/i);
  assert.doesNotMatch(clubEmailReply, /core club settings/i);
  assert.match(approvedStaticWorkflowReply("set tee times for next year"), /Configure the Timesheet/i);
  assert.match(approvedStaticWorkflowReply("paste a list of fourballs into brs"), /Upload a Timesheet/i);
  assert.match(approvedStaticWorkflowReply("set day ticket price for 2 rounds"), /Day Ticket Rates/i);
  assert.match(approvedStaticWorkflowReply("setup confirmation email template"), /Email and Letter Templates/i);
  assert.match(approvedStaticWorkflowReply("edit privacy policy text"), /Legal Messages/i);
});

test("broad messaging, reports, and tool wording avoids live fallback", () => {
  assert.match(approvedStaticWorkflowReply("sms a membership group"), /Text Members in a Membership Type or Group/i);
  assert.match(approvedStaticWorkflowReply("set up member groups for messaging"), /Member Groups for Messaging/i);
  assert.match(approvedStaticWorkflowReply("send club message to a course"), /Club Message to a Course/i);
  assert.match(approvedStaticWorkflowReply("report for no shows"), /No Show Report/i);
  assert.match(approvedStaticWorkflowReply("wallet transaction report"), /Wallet Transaction Report/i);
  assert.match(approvedStaticWorkflowReply("payment faq in brs payments"), /BRS Payments FAQs/i);
});

test("broad competitions users club systems and ambiguous booking rules are covered generally", () => {
  assert.match(approvedStaticWorkflowReply("setup members competition online"), /Members Competition/i);
  assert.match(approvedStaticWorkflowReply("competition entry sheet draw where is it"), /Competition Entry Sheet or Draw/i);
  assert.match(approvedStaticWorkflowReply("map club systems members to brs members"), /Club Systems Member Maps/i);
  assert.match(approvedStaticWorkflowReply("preview club systems members before sync"), /Club Systems Member Preview/i);
  assert.match(approvedStaticWorkflowReply("make a read only staff account"), /Add a User/i);
  assert.match(approvedStaticWorkflowReply("change staff group permissions"), /User Privileges/i);
  assert.match(approvedStaticWorkflowReply("change cancellation time limit"), /Member Casual Booking Rules/i);
});

test("broad live-failure regressions keep specific routes ahead of generic ones", () => {
  const timeIntervalsReply = approvedStaticWorkflowReply("change time intervals on tee sheet");
  const addStartReply = approvedStaticWorkflowReply("how do I add a tee time at the start of the day?");
  const addEndReply = approvedStaticWorkflowReply("add more tee times at the end of the timesheet");
  const earlierReply = approvedStaticWorkflowReply("make the first tee time earlier");
  const laterReply = approvedStaticWorkflowReply("make the last tee time later");
  const bookingReply = approvedStaticWorkflowReply("add a customer booking at a tee time");
  const sheetMessageReply = approvedStaticWorkflowReply("change the message at top of the tee sheet");
  const vatReply = approvedStaticWorkflowReply("export vat reports");

  assert.equal(routeActionRequest("change time intervals on tee sheet"), null);
  assert.equal(routeActionRequest("add more tee times at the end of the timesheet"), null);
  assert.equal(routeActionRequest("add a customer booking at a tee time"), null);
  assert.equal(isMoveBookingQuestion("change time intervals on tee sheet"), false);
  assert.match(timeIntervalsReply, /Configure the Timesheet/i);
  assert.match(addStartReply, /Configure the Timesheet/i);
  assert.match(addStartReply, /change the tee-time pattern/i);
  assert.match(addStartReply, /First Tee Time Hour/i);
  assert.match(addStartReply, /Tee Time Interval|Alternate Tee Time Intervals/i);
  assert.match(addStartReply, /Squeeze Tee Time/i);
  assert.match(addEndReply, /Configure the Timesheet/i);
  assert.match(addEndReply, /Last Tee Time Hour/i);
  assert.match(addEndReply, /interval spacing/i);
  assert.match(earlierReply, /Configure the Timesheet/i);
  assert.match(laterReply, /Configure the Timesheet/i);
  assert.doesNotMatch(bookingReply, /Configure the Timesheet/i);
  assert.match(bookingReply, /Add a Single Tee Time Booking|Make a Booking/i);
  assert.match(sheetMessageReply, /Messages on the Timesheet/i);
  assert.doesNotMatch(sheetMessageReply, /Email the Timesheet/i);
  assert.match(vatReply, /BRS Payments VAT Report/i);
});

test("static workflow answers use customer-facing wording and demo labels", () => {
  const replies = [
    approvedStaticWorkflowReply("where do i change club email address"),
    approvedStaticWorkflowReply("turn a feature on or off for the club"),
    approvedStaticWorkflowReply("change time intervals on tee sheet"),
    approvedStaticWorkflowReply("change the message at top of the tee sheet"),
    approvedStaticWorkflowReply("change cancellation time limit"),
    approvedStaticWorkflowReply("How do I send an email message to members?"),
    approvedStaticWorkflowReply("How do I set up membership types like senior and junior?"),
    approvedRefundReply("full"),
    approvedOfflineRefundReply(),
  ].join("\n\n");

  assert.match(replies, /"Main club email address \(mandatory\)"/i);
  assert.match(replies, /"Tee Time Interval"|"Alternate Tee Time Intervals"/i);
  assert.match(replies, /"Message on the Timesheet"/i);
  assert.match(replies, /"Days Advance Booking"/i);
  assert.doesNotMatch(replies, /support task|advising staff|another support agent|club wants|club needs|club is asking|BRS customers using/i);
});

test("representative workflow answers avoid internal routing language", () => {
  const replies = [
    approvedStaticWorkflowReply("How do I create a bill?"),
    approvedStaticWorkflowReply("How do I change booking rules?"),
    approvedStaticWorkflowReply("How do I see today online and offline bookings?"),
    approvedStaticWorkflowReply("How do I upload a timesheet?"),
    approvedStaticWorkflowReply("How do I add a tee time at the start of the day?"),
    approvedStaticWorkflowReply("How do I add a visitor contact?"),
    approvedStaticWorkflowReply("How do I email members?"),
    approvedStaticWorkflowReply("How do I text members in a group?"),
    approvedStaticWorkflowReply("send club message to a course"),
    approvedStaticWorkflowReply("How do I set up membership types?"),
    approvedStaticWorkflowReply("How do I create a payment scheme?"),
    approvedStaticWorkflowReply("How do I add staff user?"),
    approvedStaticWorkflowReply("How do I change password?"),
    approvedStaticWorkflowReply("How do I set up Golf Plus?"),
  ].filter(Boolean);

  for (const reply of replies) {
    assert.doesNotMatch(reply, /\b(user means|Clarify|reusable product knowledge|support agent|technical support specialist)\b/i);
    assert.doesNotMatch(reply, /\b(payment scheme workflow|bill workflow|normal messaging route|booking search route|club-message route|text-message route|member email route)\b/i);
  }
});

test("static workflow answers include proven screen locations for controls generally", () => {
  const printReply = approvedStaticWorkflowReply("How do I print the timesheet?");
  const greenFeeReply = approvedStaticWorkflowReply("How do I set up green fee rates for visitors?");
  const reportReply = approvedStaticWorkflowReply("How do I run a visitor report?");
  const bookingReply = approvedStaticWorkflowReply("How do I add a single tee time booking?");

  assert.match(printReply, /action toolbar above the tee-time grid/i);
  assert.match(printReply, /Add, Modify, Delete, Clear, Block, Cut, Copy, and Paste/i);
  assert.match(greenFeeReply, /"Tools" page/i);
  assert.match(greenFeeReply, /Basic Set Up Requirements/i);
  assert.match(reportReply, /"Type of Report" dropdown/i);
  assert.match(bookingReply, /tee-time grid/i);
});

test("screen location record keeps reusable observed BRS locations", () => {
  assert.match(BRS_SCREEN_LOCATION_RECORD.mainNavigation.Timesheet, /main navigation/i);
  assert.equal(BRS_SCREEN_LOCATION_RECORD.toolsIndex["Green Fee Rates"].section, "Basic Set Up Requirements");
  assert.match(BRS_SCREEN_LOCATION_RECORD.controls.timesheetPrint, /action toolbar above the tee-time grid/i);
  assert.match(BRS_SCREEN_LOCATION_RECORD.controls.reportsType, /Reports page/i);
  assert.ok(BRS_SCREEN_LOCATION_RECORD.sourceSummary.some((source) => /system crawl|browser sampling/i.test(source)));
});

test("protected move booking answer includes screen locations without adding forbidden actions", () => {
  const reply = approvedMoveBookingReply("How do I move a paid booking?");

  assert.match(reply, /Timesheet from the main navigation menu/i);
  assert.match(reply, /tee-time grid/i);
  assert.match(reply, /Timesheet action toolbar above the tee-time grid/i);
  assert.doesNotMatch(reply, /drag|right-click|move button/i);
});

test("generated fallback guards reject vague workflow guesses generally", () => {
  assert.equal(
    hasUnsupportedGeneratedWorkflowShape(
      "how do I add a member in the system",
      "Open Memberships, then look for an option labelled How to Create a New Member or a similar action."
    ),
    true
  );
  assert.equal(
    hasUnsupportedGeneratedWorkflowShape(
      "how do I create a visitor contact",
      "Enter the details in the available fields and save as prompted by the system."
    ),
    true
  );
  assert.equal(
    hasUnsupportedGeneratedWorkflowShape(
      "how do I run a payments report",
      "Open Reports, choose \"BRS Payments VAT Report\", select the date range, then click \"Download\"."
    ),
    false
  );
});

test("candidate help guides must match the question object, not just the action", () => {
  assert.equal(
    candidateGuideMatchesQuestion("how do I add a member in the system", {
      title: "Add a User",
      url: "https://help.brsgolf.com/hc/en-us/articles/123-Add-a-User",
    }),
    false
  );
  assert.equal(
    candidateGuideMatchesQuestion("how do I add a staff user", {
      title: "Add a User",
      url: "https://help.brsgolf.com/hc/en-us/articles/123-Add-a-User",
    }),
    true
  );
});
