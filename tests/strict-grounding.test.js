import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { answerFromKnowledge, answerFromKnowledgeDetailed, isBRSWorkflowQuestion } from "../lib/knowledgeAnswer.js";
import { routeActionRequest } from "../lib/actionRouter.js";
import { candidateGuideMatchesQuestion, hasUnsupportedGeneratedWorkflowShape } from "../lib/groundingGuards.js";
import { approvedMoveBookingReply, hasForbiddenMoveBookingAdvice, isMoveBookingQuestion } from "../lib/bookingWorkflowAnswers.js";
import { BRS_SCREEN_LOCATION_RECORD } from "../lib/brsScreenLocations.js";
import { isMemberBalanceReportQuestion } from "../lib/membershipWorkflowAnswers.js";
import { approvedStaticWorkflowReply, isSuperuserCreateRequest } from "../lib/staticWorkflowAnswers.js";
import { relatedGuidesForQuestion, titleFromHelpCenterUrl } from "../lib/relatedGuides.js";
import { approvedRefundReply, approvedOfflineRefundReply } from "../server.js";
import { applyAnswerQualityGate } from "../lib/answerQuality.js";
import { verifiedStaticReplyMatch } from "../lib/verifiedAnswerRegistry.js";

test("classifies operational BRS questions as workflow questions", () => {
  assert.equal(isBRSWorkflowQuestion("how do I add a buggy to a booking"), true);
  assert.equal(isBRSWorkflowQuestion("refund a membership bill"), true);
  assert.equal(isBRSWorkflowQuestion("where do I export the visitors report"), true);
});

test("does not classify generic thanks as a workflow question", () => {
  assert.equal(isBRSWorkflowQuestion("thanks that worked"), false);
});

test("conceptual why questions are not forced into workflow shape", () => {
  assert.equal(isBRSWorkflowQuestion("why would I use a reservation type?"), false);

  const reply = approvedStaticWorkflowReply("why would I use a reservation type?");
  assert.match(reply, /classify tee-time bookings by purpose/i);
  assert.match(reply, /configured at Tools > Reservation Types/i);
  assert.doesNotMatch(reply, /Set Up Reservation Types and Colours/i);
  assert.doesNotMatch(reply, /Click "?Add"?/i);
});

test("knowledge detail reports static-heavy fallback composition", async () => {
  const result = await answerFromKnowledgeDetailed("what is a payment scheme?", { allowDynamic: false });

  assert.match(result.reply, /Payment Schemes in BRS allow membership bills/i);
  assert.equal(result.answerComposition.mode, "static-fallback");
  assert.equal(result.answerComposition.staticFallbackUsed, true);
  assert.equal(result.answerComposition.staticShare, 1);
  assert.equal(result.answerComposition.recommendCrawlEnhancement, true);
});

test("production chat route uses live lookup only as a post-knowledge safety net", () => {
  const serverSource = fs.readFileSync(new URL("../server-with-feedback.js", import.meta.url), "utf8");

  assert.match(serverSource, /answerFromKnowledgeDetailed/);
  assert.match(serverSource, /liveBrsLookup/);
  assert.match(serverSource, /answerFromLiveEvidence/);
  assert.match(serverSource, /saveLearnedWorkflowFromLiveAnswer/);
  assert.match(serverSource, /!hasStaticAnswer && queueKnowledgeGaps && shouldAttemptLiveBrsLookup/);
  assert.ok(
    serverSource.search(/const knowledgeResult = await answerFromKnowledgeDetailed/) <
    serverSource.search(/liveLookup = await liveBrsLookup/)
  );
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

  assert.match(serverSource, /verifiedStaticReplyMatch/);
  assert.match(serverSource, /routeLabel: "verified-static-precheck"/);
  assert.match(serverSource, /allowDynamicKnowledge: false/);
  assert.match(serverSource, /queueKnowledgeGaps: false/);
  assert.ok(
    serverSource.search(/const verifiedStaticMatch = verifiedStaticReplyMatch\(routingMessage, approvedStaticReply\)/) <
    serverSource.search(/const objectFirstReply = answerFromObjectFirstRouting\(routingMessage\)/)
  );
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
  assert.match(regularReply, /Open Reports in the Memberships navigation/i);
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
  assert.match(userReply, /User Group\*/i);
  assert.match(userReply, /Create new user/i);
  assert.match(paymentReply, /"Tools" > "BRS Payments" > "General Payment Requests"/i);
  assert.match(copyReply, /Copy Services, Catering, or Green Fees/i);
  assert.doesNotMatch(copyReply, /\bdelete\b/i);
});

test("long data export questions synthesize related member routes instead of email messaging", async () => {
  const reply = await answerFromKnowledge(
    "I'm trying to produce a database of members names and their email addresses from specific categories of membership. In this case our 4 junior categories, is it possible to apply filters to produce just that info please?",
    { allowDynamic: false }
  );

  assert.match(reply, /Create a Filtered Member Data Export/i);
  assert.match(reply, /Yes\. For a list of member names and email addresses/i);
  assert.match(reply, /your 4 junior membership categories/i);
  assert.match(reply, /Filter Active Members/i);
  assert.match(reply, /Membership Type/i);
  assert.match(reply, /Filter Columns/i);
  assert.match(reply, /Download CSV Members/i);
  assert.match(reply, /Other ways to get the same information/i);
  assert.match(reply, /Member Categories/i);
  assert.match(reply, /Member Email Addresses for Outlook/i);
  assert.doesNotMatch(reply, /Email Members in a Membership Type/i);
  assert.doesNotMatch(reply, /Choose "Email Membership Types"/i);
  assert.doesNotMatch(reply, /Prepare and send the email/i);
  assert.doesNotMatch(reply, /data\/export request|email-message request|club needs|club wants|the club wants|the club needs/i);
});

test("email address data-field questions do not steal real messaging workflows", () => {
  const dataReply = approvedStaticWorkflowReply("Can I download a spreadsheet of member names and email addresses by membership type?");
  const contactDataReply = approvedStaticWorkflowReply("Can I export a report of contact email addresses?");
  const messagingReply = approvedStaticWorkflowReply("How do I email all members in a membership type?");

  assert.match(dataReply, /Create a Filtered Member Data Export/i);
  assert.match(dataReply, /Download CSV Members/i);
  assert.doesNotMatch(dataReply, /Choose "Email Membership Types"/i);

  assert.match(contactDataReply, /Run a Contact Report|Export a Report/i);
  assert.doesNotMatch(contactDataReply, /Email Contacts/i);

  assert.match(messagingReply, /Email Members in a Membership Type/i);
  assert.match(messagingReply, /Email Membership Types/i);
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
  assert.match(createService, /Service Type/i);
  assert.match(createService, /Service Name/i);
  assert.match(createService, /Service Rate/i);
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
  assert.equal(isMemberBalanceReportQuestion("What are bills?"), false);
  assert.equal(isMemberBalanceReportQuestion("How do I charge members for a competition?"), false);
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

  assert.match(memberProfileReply, /Create a Member Profile/i);
  assert.match(memberProfileReply, /"Memberships"/i);
  assert.match(memberProfileReply, /"CREATE MEMBER"/i);
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
  const contactCategoriesReply = approvedStaticWorkflowReply("Where do I manage contact categories in BRS?");
  const emailReply = approvedStaticWorkflowReply("How do I email contacts?");

  assert.match(dashboardReply, /Dashboard/i);
  assert.match(dashboardReply, /bookings/i);
  assert.match(searchReply, /Search/i);
  assert.match(searchReply, /booking reference/i);
  assert.match(contactReply, /Contacts/i);
  assert.match(contactReply, /category/i);
  assert.match(contactCategoriesReply, /Contact Categories/i);
  assert.match(emailReply, /Email Contacts/i);
});

test("BRS Contacts product questions do not route to support contact details", async () => {
  const reply = await answerFromKnowledge("Where do I manage contact categories in BRS?");

  assert.match(reply, /Contact Categories/i);
  assert.match(reply, /Tools/i);
  assert.doesNotMatch(reply, /Call us on UK/i);
  assert.doesNotMatch(reply, /Golf Now Customer Support/i);
});

test("approved static workflows cover common booking and payment lookup variants", () => {
  const bookingReply = approvedStaticWorkflowReply("How do I add a single tee time booking?");
  const detailsReply = approvedStaticWorkflowReply("How do I open booking details from the tee sheet?");
  const cancelReply = approvedStaticWorkflowReply("How do I cancel a booking?");
  const deleteReply = approvedStaticWorkflowReply("How do I delete a tee time booking?");
  const removeReply = approvedStaticWorkflowReply("How do I remove a booking from the timesheet?");
  const vatReply = approvedStaticWorkflowReply("Where do I download a VAT report for payments?");
  const uploadReply = approvedStaticWorkflowReply("Where do I upload members or contacts?");
  const refundRecordsReply = approvedStaticWorkflowReply("Where can I see refund records after a refund has been made?");
  const refundReportReply = approvedStaticWorkflowReply("Where do I find the refund report?");

  assert.match(bookingReply, /Single Tee Time Booking/i);
  assert.match(detailsReply, /Booking Details/i);
  for (const reply of [cancelReply, deleteReply, removeReply]) {
    assert.match(reply, /Cancel a Tee Sheet Booking/i);
    assert.match(reply, /Timesheet/i);
    assert.match(reply, /Delete/i);
    assert.match(reply, /existing reservation/i);
    assert.match(reply, /"Tools" > "BRS Payments" > "Refunds"/i);
    assert.doesNotMatch(reply, /complete proven BRS workflow/i);
  }
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
  assert.equal(routeActionRequest("Visitors say no tee times are showing on the website for next month. What setup should I check?"), null);
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

test("employee accuracy scoretest regressions route to the specific workflow object", async () => {
  const titleReply = approvedStaticWorkflowReply("Where do I change the title that appears on a Saturday tee sheet?");
  const sheetNoticeReply = approvedStaticWorkflowReply("I need a frost delay notice on the tee sheet");
  const outlookReply = approvedStaticWorkflowReply("I need email addresses for Outlook, not to send email in BRS");
  const bookingSearchReply = approvedStaticWorkflowReply("How do I find someone who booked this morning if I only have part of their name?");
  const contactLookupReply = approvedStaticWorkflowReply("Where do I look up a contact record?");
  const groupSetupReply = approvedStaticWorkflowReply("I need to make a group first so later we can email or text them, not sending yet");
  const smsReply = approvedStaticWorkflowReply("How do I text all members about a frost delay?");
  const clubMessageReply = approvedStaticWorkflowReply("Where do I send a club app message to everyone?");
  const openCompTermsReply = approvedStaticWorkflowReply("Where do I change the terms for an open competition?");
  const competitionChargesReply = await answerFromKnowledge("How do I charge members for a competition?", { allowDynamic: false });
  const billsReply = await answerFromKnowledge("What are bills?", { allowDynamic: false });
  const paymentPlanReply = approvedStaticWorkflowReply("Can I put a member on instalments?");
  const uploadReply = approvedStaticWorkflowReply("I need to upload a spreadsheet of members");
  const transactionsReply = approvedStaticWorkflowReply("I need a CSV of card payments taken online");
  const legalReply = approvedStaticWorkflowReply("Where do I set the privacy policy that appears in the app?");
  const courseRestrictionReply = approvedStaticWorkflowReply("Where do I stop members booking four-balls on one course?");
  const tourOperatorReply = approvedStaticWorkflowReply("How do I set tour operator prices for online booking?");

  assert.match(titleReply, /Title for Each Day/i);
  assert.doesNotMatch(titleReply, /Members Booking App/i);

  assert.match(sheetNoticeReply, /Message on the Timesheet|Messages on the Timesheet/i);
  assert.doesNotMatch(sheetNoticeReply, /Email the Timesheet|Schedule a Message/i);

  assert.match(outlookReply, /Member Email Addresses for Outlook/i);
  assert.doesNotMatch(outlookReply, /Email Members|Email Messaging/i);

  assert.match(bookingSearchReply, /Search for a Booking/i);
  assert.match(bookingSearchReply, /Search Bookings/i);

  assert.match(contactLookupReply, /Contact Record/i);
  assert.doesNotMatch(contactLookupReply, /Memberships/i);

  assert.match(groupSetupReply, /Member Groups for Messaging/i);
  assert.doesNotMatch(groupSetupReply, /Schedule a Message/i);

  assert.match(smsReply, /Text Members in a Membership Type or Group/i);
  assert.doesNotMatch(smsReply, /Schedule a Message/i);

  assert.match(clubMessageReply, /Club Message to All Members/i);
  assert.doesNotMatch(clubMessageReply, /Members Booking App/i);

  assert.match(openCompTermsReply, /Open Competition Terms|Legal Messages/i);
  assert.doesNotMatch(openCompTermsReply, /Run a Report/i);

  assert.match(competitionChargesReply, /Competition Charges|Member Competition Charges/i);
  assert.match(competitionChargesReply, /competition purse|purse\/payment/i);
  assert.doesNotMatch(competitionChargesReply, /unpaid membership bills|Overdue Bills|membership balances/i);

  assert.match(billsReply, /Bills in BRS are membership billing records/i);
  assert.doesNotMatch(billsReply, /Overdue Bills|unpaid or outstanding membership balances/i);

  assert.match(paymentPlanReply, /Payment Scheme to a Membership Bill/i);
  assert.doesNotMatch(paymentPlanReply, /What are you trying to do/i);

  assert.match(uploadReply, /Upload Members or Contacts/i);
  assert.doesNotMatch(uploadReply, /Download CSV Members|Filtered Member Data Export/i);

  assert.match(transactionsReply, /BRS Payments Transactions/i);
  assert.doesNotMatch(transactionsReply, /complete verified BRS workflow/i);

  assert.match(legalReply, /Legal Messages/i);
  assert.doesNotMatch(legalReply, /Members Booking App/i);

  assert.match(courseRestrictionReply, /Course Restrictions/i);
  assert.match(courseRestrictionReply, /Max Group Size/i);
  assert.doesNotMatch(courseRestrictionReply, /Booking Statuses/i);

  assert.match(tourOperatorReply, /Tour Operator Booking Rates/i);
  assert.match(tourOperatorReply, /Green Fee Rates for Visitors/i);
});

test("second-round accuracy regressions use locked verified routes", async () => {
  const cases = [
    [
      "We are opening earlier on Saturdays next month and I think I need to make more tee slots. Where do I change the times/intervals without manually adding every slot?",
      /Configure the Timesheet/i,
      /First Tee Time Hour|Tee Time Interval|Saturday/i,
      /View the Timesheet by Month|complete verified BRS workflow/i,
    ],
    [
      "Where do I change the label that appears at the top of a particular day on the timesheet?",
      /Title for Each Day/i,
      /open Title for Each Day/i,
      /complete verified BRS workflow/i,
    ],
    [
      "I set up this year and now need to copy catering/services/green fees into next year. Where is that?",
      /Copy Services, Catering, or Green Fees/i,
      /Operation[\s\S]*Copy Services[\s\S]*Copy Catering[\s\S]*Copy Green Fees/i,
      /Set Up Bookable Services/i,
    ],
    [
      "Where do I set the privacy policy or member terms message that appears online?",
      /Legal Messages/i,
      /Privacy Policy[\s\S]*Member Terms and Conditions/i,
      /complete verified BRS workflow|Members Booking App/i,
    ],
    [
      "What is the difference between a golf event and a competition? I do not want to set up the wrong one.",
      /Golf Events vs Competitions/i,
      /event-style booking[\s\S]*entrants, draws/i,
      /Create a Competition/i,
    ],
    [
      "A member missed the comp sheet and asked if I can put them on the waiting list. What is the right workflow?",
      /Competition Waiting List/i,
      /"?Add"? member to waiting list/i,
      /entrant.+booking.+management|complete verified BRS workflow/i,
    ],
    [
      "We are setting up an open competition for visitors to book online. Which page and fields matter?",
      /Open Competition for Visitors/i,
      /Booking Available Date[\s\S]*Booking Available Time/i,
      /System Configuration|Reservation Types|Booking Statuses/i,
    ],
    [
      "A member says they paid a bill but I also see BRS Payments transactions. Where should I check first?",
      /Member Bill Payment Against BRS Payments/i,
      /member's Billing area[\s\S]*BRS Payments[\s\S]*Transactions/i,
      /unpaid or outstanding membership balances|Overdue Bills/i,
    ],
    [
      "What are services in BRS? Is that where buggies and hire clubs live?",
      /Services in BRS are bookable extras/i,
      /Tools > Services/i,
      /System Configuration|Configure Timesheet/i,
    ],
    [
      "What is the difference between Email Membership Groups and Text Message Membership Groups?",
      /Email Membership Groups and Text Message Membership Groups/i,
      /Email Messaging[\s\S]*Text Messaging/i,
      /Club Messages/i,
    ],
  ];

  for (const [question, expected, alsoExpected, forbidden] of cases) {
    const result = await answerFromKnowledgeDetailed(question, { allowDynamic: false });
    assert.equal(result.route, "locked-static-safety");
    assert.match(result.reply, expected);
    assert.match(result.reply, alsoExpected);
    assert.doesNotMatch(result.reply, forbidden);
  }
});

test("verified answer registry protects scoretest failures and partials from dynamic or object-first overrides", async () => {
  const cases = [
    [
      "The manager wants a VAT report for the month. Where do I download it?",
      "brs-payments-vat-report",
      /Download a BRS Payments VAT Report/i,
      /VAT Reports[\s\S]*invoice period month and year[\s\S]*PDF or CSV/i,
      /complete verified BRS workflow|Open the VAT report area/i,
    ],
    [
      "A customer says they booked but I only caught half his surname. Where can I look them up?",
      "search-booking",
      /Search for a Booking/i,
      /Search Bookings[\s\S]*Search Text[\s\S]*Reservation "?Name"?[\s\S]*Booking Ref\. Number/i,
      /complete verified BRS workflow|I don't have enough confirmed information|escalate/i,
    ],
    [
      "We need to stop 4 balls after 3pm on Fridays for visitors and members. Is that booking status or something else?",
      "course-restriction-group-size",
      /Configure Course Restrictions/i,
      /Start Time[\s\S]*End Time[\s\S]*Player Types[\s\S]*Max Group Size/i,
      /Set Up Booking Statuses|complete verified BRS workflow|I don't have enough confirmed information/i,
    ],
    [
      "We need a new contact type for society organisers. Is that in contacts or tools?",
      "contact-categories",
      /Set Up Contact Categories/i,
      /Tools[\s\S]*Contact Categories[\s\S]*contact records/i,
      /complete verified BRS workflow/i,
    ],
    [
      "The captain is asking about terms and conditions on the all Ireland open competition search bit. Is that part of reports search or open comps?",
      "open-competition-terms",
      /Set Open Competition Terms and Conditions/i,
      /Legal Messages[\s\S]*All Ireland Open Competitions "?Search"? Facility/i,
      /Run a Report|complete verified BRS workflow/i,
    ],
    [
      "A member says they paid a bill but I also see BRS Payments transactions. Where should I check first?",
      "member-bill-brs-payments-reconciliation",
      /Check a Member Bill Payment Against BRS Payments/i,
      /member's Billing area[\s\S]*BRS Payments[\s\S]*Transactions/i,
      /What are you trying to do for the member|unpaid or outstanding membership balances/i,
    ],
    [
      "We have a corporate day and the organiser needs some tee times blocked out. Is that Golf Events and how do I start?",
      "golf-event-organiser-reservation",
      /Set Up a Golf Event Organiser Reservation/i,
      /Event Date[\s\S]*Event "?Start Time"?[\s\S]*Event "?End Time"?[\s\S]*Event "?Username"?/i,
      /Open Competitions|Create a Competition/i,
    ],
    [
      "I forgot my own BRS password. Is there a change password area?",
      "user-password",
      /Change or Reset a User Password/i,
      /Forgot password[\s\S]*Change My "?Password"?[\s\S]*Current "?Password"?[\s\S]*New "?Password"?[\s\S]*Confirm "?Password"?/i,
      /Create a New User/i,
    ],
  ];

  for (const [question, expectedRule, expected, alsoExpected, forbidden] of cases) {
    const staticReply = approvedStaticWorkflowReply(question);
    assert.equal(verifiedStaticReplyMatch(question, staticReply)?.id, expectedRule);

    const result = await answerFromKnowledgeDetailed(question, { allowDynamic: false });
    assert.equal(result.route, "locked-static-safety");
    assert.equal(result.answerComposition.mode, "locked-static");
    assert.match(result.reply, expected);
    assert.match(result.reply, alsoExpected);
    assert.doesNotMatch(result.reply, forbidden);
  }
});

test("expanded employee phrasing still reaches the right approved workflow", async () => {
  const cases = [
    [
      "cust says hes booked but i only caught half his surname, where do i find the tee time?",
      /Search for a Booking/i,
      /Search Text[\s\S]*Reservation "?Name"?[\s\S]*4 Player Names/i,
      /I don't have enough confirmed information|escalate/i,
    ],
    [
      "soz, we need to stop groups of four after 3pm for visitors - is that a booking status thing?",
      /Configure Course Restrictions/i,
      /Max Group Size[\s\S]*"?Booking Statuses"? are for tracking the booking lifecycle/i,
      /Set Up Booking Statuses|I don't have enough confirmed information/i,
    ],
    [
      "The society organiser wants buggy hire and hire clubs added to their tee booking. Where does that live?",
      /Add Services to a Booking/i,
      /Booking Details[\s\S]*buggy[\s\S]*club hire[\s\S]*main navigation menu[\s\S]*Tools[\s\S]*Services/i,
      /Green Fee Rates|Contact Categories/i,
    ],
    [
      "Captain says visitors cant see the open comp online yet - where should I set that up?",
      /Set Up an Open Competition for Visitors/i,
      /Open Competitions for Visitors[\s\S]*Booking Available Date[\s\S]*Booking Available Time/i,
      /Reports Search|Golf Events/i,
    ],
  ];

  for (const [question, expected, alsoExpected, forbidden] of cases) {
    const result = await answerFromKnowledgeDetailed(question, { allowDynamic: false });
    assert.match(result.reply, expected);
    assert.match(result.reply, alsoExpected);
    assert.doesNotMatch(result.reply, forbidden);
  }
});

test("expanded live-review misses now route to protected answers", async () => {
  const cases = [
    [
      "who still owes subs money",
      /View Members Who Owe Membership Money|Find members with unpaid or outstanding membership balances/i,
      /Memberships[\s\S]*Reports[\s\S]*unpaid membership bills|outstanding balances/i,
      /complete verified BRS workflow|I don't have enough confirmed information/i,
    ],
    [
      "how do i make a new contct cat for tour opperators?",
      /Set Up Contact Categories/i,
      /Tools[\s\S]*Contact Categories[\s\S]*contact records/i,
      /What is the customer trying to do/i,
    ],
    [
      "Can I export contact email addresses for tour operators without emailing them?",
      /Run a Contact Report/i,
      /export\/download control[\s\S]*email-sending workflow only when you want to send/i,
      /Email Contacts\n|Email Messaging/i,
    ],
    [
      "SMS has stopped sending. Where do I check credits?",
      /Buy Text Messaging Credit|Check Why a Recipient Is Not Receiving BRS Text Messages/i,
      /Text Messaging|SMS credit/i,
      /complete verified BRS workflow|I don't have enough confirmed information/i,
    ],
    [
      "Where do I change the terms on the all Ireland open competition search page?",
      /Set Open Competition Terms and Conditions/i,
      /Legal Messages[\s\S]*All Ireland Open Competitions/i,
      /Set Up an Open Competition for Visitors/i,
    ],
    [
      "Can you just make the booking for me if I give you the customer name?",
      /Chatbot Guidance for Live BRS Records/i,
      /cannot create, edit, or look up live BRS records[\s\S]*staff must make or change bookings directly in BRS/i,
      /Search for a Booking\n/i,
    ],
    [
      "Visitors say no tee times are showing on the website for next month. What setup should I check?",
      /Check Visitor Online Booking Availability/i,
      /Green Fee Rates[\s\S]*Course Restriction[\s\S]*advance-booking window/i,
      /I don't have enough confirmed information/i,
    ],
    [
      "i need to chnage a users passwrod and also they cant see rpeorts",
      /Check a User Password and Report Access/i,
      /"?Password"? access and report visibility are separate checks/i,
      /Create a New User/i,
    ],
    [
      "Morning, can u tell me why Johns booking isnt on the sheet?",
      /Find a Booking That Is Not Showing on the Timesheet/i,
      /Search Bookings[\s\S]*date, course, player\/customer, and reference/i,
      /I don't have enough confirmed information/i,
    ],
  ];

  for (const [question, expected, alsoExpected, forbidden] of cases) {
    const result = await answerFromKnowledgeDetailed(question, { allowDynamic: false });
    assert.equal(result.route, "locked-static-safety");
    assert.match(result.reply, expected);
    assert.match(result.reply, alsoExpected);
    assert.doesNotMatch(result.reply, forbidden);
  }
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
    approvedStaticWorkflowReply("I need names and email addresses for our junior membership categories in a spreadsheet"),
    approvedRefundReply("full"),
    approvedOfflineRefundReply(),
  ].join("\n\n");

  assert.match(replies, /"Main club email address \(mandatory\)"/i);
  assert.match(replies, /"Tee Time Interval"|"Alternate Tee Time Intervals"/i);
  assert.match(replies, /"Message on the Timesheet"/i);
  assert.match(replies, /"Days Advance Booking"/i);
  assert.doesNotMatch(replies, /support task|advising staff|another support agent|club wants|club needs|club is asking|BRS customers using|data\/export request|email-message request/i);
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
    approvedStaticWorkflowReply("Can I download a spreadsheet of member names and email addresses by membership type?"),
  ].filter(Boolean);

  for (const reply of replies) {
    assert.doesNotMatch(reply, /\b(user means|Clarify|reusable product knowledge|support agent|technical support specialist|data\/export request|email-message request)\b/i);
    assert.doesNotMatch(reply, /\b(payment scheme workflow|bill workflow|normal messaging route|booking search route|club-message route|text-message route|member email route)\b/i);
  }
});

test("static workflow answers include proven screen locations for controls generally", () => {
  const printReply = approvedStaticWorkflowReply("How do I print the timesheet?");
  const greenFeeReply = approvedStaticWorkflowReply("How do I set up green fee rates for visitors?");
  const reportReply = approvedStaticWorkflowReply("How do I run a visitor report?");
  const bookingReply = approvedStaticWorkflowReply("How do I add a single tee time booking?");

  assert.match(printReply, /action toolbar above the tee-time grid/i);
  assert.match(printReply, /"?Add"?, Modify, Delete, Clear, Block, Cut, Copy, and Paste/i);
  assert.doesNotMatch(printReply, /grid\. for/i);
  assert.match(greenFeeReply, /"Tools" page/i);
  assert.match(greenFeeReply, /Basic Set Up Requirements/i);
  assert.match(reportReply, /"Type of Report" dropdown/i);
  assert.match(reportReply, /Revenue From Visitor Online Bookings/i);
  assert.match(reportReply, /Number of Visitors by Country/i);
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

test("answer quality gate escalates vague customer workflow advice", () => {
  const gated = applyAnswerQualityGate({
    reply: "Create a competition\n\n1. Open Tools.\n2. Follow the prompts on the page.",
    escalationReady: false,
    version: "knowledge-retrieval-v1",
  }, "How do I create a competition?");

  assert.equal(gated.escalationReady, true);
  assert.equal(gated.version, "answer-quality-escalation-v1");
  assert.match(gated.reply, /complete verified BRS workflow/i);

  const requiredFieldsGated = applyAnswerQualityGate({
    reply: "Add a User\n\n1. Open Users.\n2. Complete the required user fields.",
    escalationReady: false,
    version: "knowledge-retrieval-v1",
  }, "How do I add a staff user?");

  assert.equal(requiredFieldsGated.escalationReady, true);

  const internalToneGated = applyAnswerQualityGate({
    reply: "Create a Filtered Member Data Export\n\nThis is a member data/export request, not an email-message request.\n\n1. Open Memberships.",
    escalationReady: false,
    version: "knowledge-retrieval-v1",
  }, "Can I export member names and email addresses?");

  assert.equal(internalToneGated.escalationReady, true);
  assert.equal(internalToneGated.qualityGate.reason, "internal-or-third-person-workflow-wording");

  const approvedBillReply = approvedStaticWorkflowReply("How do I create a bill?");
  const billGated = applyAnswerQualityGate({
    reply: approvedBillReply,
    escalationReady: false,
    version: "knowledge-retrieval-v1",
  }, "How do I create a bill?");

  assert.equal(billGated.escalationReady, false);
  assert.equal(billGated.version, "knowledge-retrieval-v1");
  assert.match(billGated.reply, /Create a Membership Bill/i);
});

test("high-risk static answers avoid vague workflow placeholders", async () => {
  const replies = [
    approvedStaticWorkflowReply("How do I create a new member?"),
    approvedStaticWorkflowReply("How do I change a staff user permission?"),
    approvedStaticWorkflowReply("How do I export member email addresses?"),
    approvedStaticWorkflowReply("How do I create a competition?"),
    approvedStaticWorkflowReply("How do I add a new staff user?"),
    approvedStaticWorkflowReply("How do I find a booking by reference?"),
    approvedStaticWorkflowReply("How do I run a visitor booking report?"),
    approvedStaticWorkflowReply("How do I add a new visitor contact?"),
    approvedStaticWorkflowReply("How do I set up a new buggy service?"),
    approvedStaticWorkflowReply("How do I check BRS Payments transactions?"),
    approvedStaticWorkflowReply("How do I send an email to members?"),
    approvedStaticWorkflowReply("How do I set up payment methods?"),
    approvedStaticWorkflowReply("How do I set up booking statuses?"),
    approvedStaticWorkflowReply("How do I add a no show reason?"),
    approvedStaticWorkflowReply("How do I set up catering refreshments?"),
    approvedStaticWorkflowReply("How do I set up reservation types and colours?"),
    approvedStaticWorkflowReply("How do I set up green fee rates?"),
    approvedStaticWorkflowReply("How do I configure member booking rules?"),
    approvedStaticWorkflowReply("How do I edit privacy policy text?"),
    approvedStaticWorkflowReply("How do I add a course restriction?"),
    approvedStaticWorkflowReply("How do I set visitor prices?"),
    approvedStaticWorkflowReply("How do I set day ticket rates for visitors?"),
    approvedStaticWorkflowReply("How do I copy green fees to next year?"),
    await answerFromKnowledge("Where can I see unpaid membership bills?", { allowDynamic: false }),
  ].filter(Boolean).join("\n\n");

  assert.doesNotMatch(replies, /depending on the club'?s interface/i);
  assert.doesNotMatch(replies, /follow the prompts/i);
  assert.doesNotMatch(replies, /similar privilege-related fields/i);
  assert.doesNotMatch(replies, /complete the required fields/i);
  assert.doesNotMatch(replies, /complete the required [a-z ]*fields/i);
  assert.doesNotMatch(replies, /club-specific .*details/i);
  assert.doesNotMatch(replies, /relevant fields/i);
  assert.doesNotMatch(replies, /choose the visitor report/i);
  assert.doesNotMatch(replies, /visitor filters required/i);
  assert.doesNotMatch(replies, /choose the member email option that matches/i);
  assert.match(approvedStaticWorkflowReply("How do I change a staff user permission?"), /Retrieve Users/i);
  assert.match(approvedStaticWorkflowReply("How do I change a staff user permission?"), /User Group/i);
});

test("live-verified admin answers include exact demo controls", async () => {
  const userReply = await answerFromKnowledge("How do I add a new staff user?", { allowDynamic: false });
  const searchReply = approvedStaticWorkflowReply("How do I find a booking by reference?");
  const reportReply = approvedStaticWorkflowReply("How do I run a visitor booking report?");
  const contactReply = approvedStaticWorkflowReply("How do I add a new visitor contact?");
  const serviceReply = approvedStaticWorkflowReply("How do I set up a new buggy service?");
  const paymentsReply = approvedStaticWorkflowReply("How do I check BRS Payments transactions?");

  assert.match(userReply, /Create a New User \/ Add a Member/i);
  assert.match(userReply, /User Group\*/i);
  assert.match(userReply, /Username\*/i);
  assert.match(userReply, /Enable \/ Disable\*/i);
  assert.match(userReply, /Password/i);
  assert.match(userReply, /Re-type Password/i);
  assert.match(userReply, /First Name\*/i);
  assert.match(userReply, /Last Name\*/i);
  assert.match(userReply, /Create new user/i);

  assert.match(searchReply, /Search Bookings/i);
  assert.match(searchReply, /Search Text/i);
  assert.match(searchReply, /Year/i);
  assert.match(searchReply, /Booking Ref\. Number/i);
  assert.match(searchReply, /Club Ref\. Number/i);

  assert.match(reportReply, /Course/i);
  assert.match(reportReply, /Start Date/i);
  assert.match(reportReply, /End Date/i);
  assert.match(reportReply, /Type of Report/i);
  assert.match(reportReply, /Revenue From Visitor Online Bookings/i);
  assert.match(reportReply, /Number of Visitors by Country/i);
  assert.match(reportReply, /Booking Details/i);
  assert.match(reportReply, /Full Booking Details/i);
  assert.match(reportReply, /Submit/i);

  assert.match(contactReply, /Add Contact/i);
  assert.match(contactReply, /Company \/ Group Name/i);
  assert.match(contactReply, /Contact Category/i);
  assert.match(contactReply, /General Information/i);
  assert.match(contactReply, /Address Information/i);
  assert.match(contactReply, /Club Details/i);
  assert.match(contactReply, /Marketing Preferences/i);

  assert.match(serviceReply, /Select a Year/i);
  assert.match(serviceReply, /Service Type/i);
  assert.match(serviceReply, /Buggy/i);
  assert.match(serviceReply, /Service Name/i);
  assert.match(serviceReply, /Service Rate/i);
  assert.match(serviceReply, /Add/i);

  assert.match(paymentsReply, /Tools/i);
  assert.match(paymentsReply, /BRS Payments/i);
  assert.match(paymentsReply, /Transactions/i);
});

test("superuser creation is support-only and escalation-ready", async () => {
  const source = fs.readFileSync(new URL("../data/knowledge/users.txt", import.meta.url), "utf8");
  const serverWithFeedback = fs.readFileSync(new URL("../server-with-feedback.js", import.meta.url), "utf8");
  const serverSource = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const reply = await answerFromKnowledge("How do I add a superuser in BRS?", { allowDynamic: false });
  const spacedReply = approvedStaticWorkflowReply("How do I create a new super user?");
  const staffReply = await answerFromKnowledge("How do I add a new staff user?", { allowDynamic: false });

  assert.equal(isSuperuserCreateRequest("How do I add a superuser in BRS?"), true);
  assert.equal(isSuperuserCreateRequest("How do I add a new staff user?"), false);
  assert.match(source, /new superuser can only be created by a BRS employee/i);
  assert.match(serverWithFeedback, /escalationReady: isSuperuserCreateRequest\(message\)/);
  assert.match(serverSource, /approvedSuperuserEscalationReply/);

  assert.match(reply, /Superusers can only be created by a BRS employee/i);
  assert.match(reply, /BRS Support/i);
  assert.match(reply, /Before escalating/i);
  assert.match(reply, /Club name/i);
  assert.match(reply, /Requested user's full name/i);
  assert.match(reply, /Requested username/i);
  assert.match(reply, /Email address and contact number/i);
  assert.match(reply, /authorised club contact/i);
  assert.match(reply, /Do not use Users > Add New/i);
  assert.doesNotMatch(reply, /set "?User Group\*"? to the superuser/i);
  assert.doesNotMatch(reply, /highest available/i);
  assert.doesNotMatch(reply, /Click "?Create"? at the bottom/i);
  assert.match(spacedReply, /Superusers can only be created by a BRS employee/i);
  assert.match(staffReply, /Create a New User \/ Add a Member/i);
});

test("verified tools setup and messaging answers use exact demo labels", () => {
  const emailReply = approvedStaticWorkflowReply("How do I send an email to members?");
  const selectedEmailReply = approvedStaticWorkflowReply("How do I email selected members?");
  const smsReply = approvedStaticWorkflowReply("How do I text selected members?");
  const paymentMethodReply = approvedStaticWorkflowReply("How do I set up payment methods?");
  const bookingStatusReply = approvedStaticWorkflowReply("How do I set up booking statuses?");
  const noShowReply = approvedStaticWorkflowReply("How do I add a no show reason?");
  const cateringReply = approvedStaticWorkflowReply("How do I set up catering refreshments?");
  const reservationTypeReply = approvedStaticWorkflowReply("How do I set up reservation types and colours?");
  const greenFeeReply = approvedStaticWorkflowReply("How do I set up green fee rates?");

  assert.match(emailReply, /Tools/i);
  assert.match(emailReply, /Email Messaging/i);
  assert.match(emailReply, /Email Membership Types/i);
  assert.match(emailReply, /Email Membership Groups/i);
  assert.match(emailReply, /Email Selected Members/i);
  assert.doesNotMatch(emailReply, /Open Messages|Email Messages/i);

  assert.match(selectedEmailReply, /Email Selected Members/i);
  assert.match(smsReply, /Text Messaging/i);
  assert.match(smsReply, /Text Message Selected Members/i);
  assert.doesNotMatch(smsReply, /Open Messages|Text Messages/i);

  assert.match(paymentMethodReply, /Payment Methods/i);
  assert.match(paymentMethodReply, /Name/i);
  assert.match(paymentMethodReply, /Supported/i);
  assert.match(paymentMethodReply, /Actions/i);
  assert.match(paymentMethodReply, /Payment Method Name/i);
  assert.match(paymentMethodReply, /Add/i);

  assert.match(bookingStatusReply, /Booking Statuses/i);
  assert.match(bookingStatusReply, /Name/i);
  assert.match(bookingStatusReply, /Supported/i);
  assert.match(bookingStatusReply, /Actions/i);
  assert.match(bookingStatusReply, /Add/i);

  assert.match(noShowReply, /No Show Reasons/i);
  assert.match(noShowReply, /Name/i);
  assert.match(noShowReply, /Supported/i);
  assert.match(noShowReply, /Actions/i);
  assert.match(noShowReply, /Add/i);

  assert.match(cateringReply, /Catering \/ Refreshments/i);
  assert.match(cateringReply, /Select a Year/i);
  assert.match(cateringReply, /Name/i);
  assert.match(cateringReply, /Rate/i);
  assert.match(cateringReply, /Add/i);

  assert.match(reservationTypeReply, /Reservation Types/i);
  assert.match(reservationTypeReply, /Name/i);
  assert.match(reservationTypeReply, /Code/i);
  assert.match(reservationTypeReply, /Supported/i);
  assert.match(reservationTypeReply, /Allow Online Bookings/i);
  assert.match(reservationTypeReply, /Set As Default/i);
  assert.match(reservationTypeReply, /Colour/i);

  assert.match(greenFeeReply, /Green Fee Rates/i);
  assert.match(greenFeeReply, /Select a Year/i);
  assert.match(greenFeeReply, /Filter Category/i);
  assert.match(greenFeeReply, /Add Green Fees/i);
  assert.match(greenFeeReply, /Category/i);
  assert.match(greenFeeReply, /Sub Category/i);
  assert.match(greenFeeReply, /Holes/i);
  assert.match(greenFeeReply, /Start Date/i);
  assert.match(greenFeeReply, /End Date/i);
  assert.match(greenFeeReply, /Rates/i);
  assert.match(greenFeeReply, /Mem Types/i);
  assert.match(greenFeeReply, /Default/i);
  assert.match(greenFeeReply, /Global/i);
});

test("verified rules legal rates and copy answers use exact demo labels", () => {
  const memberRulesReply = approvedStaticWorkflowReply("How do I configure member booking rules?");
  const legalReply = approvedStaticWorkflowReply("How do I edit privacy policy text?");
  const courseRestrictionReply = approvedStaticWorkflowReply("How do I add a course restriction?");
  const visitorRatesReply = approvedStaticWorkflowReply("How do I set visitor prices?");
  const dayTicketReply = approvedStaticWorkflowReply("How do I set day ticket rates for visitors?");
  const copyReply = approvedStaticWorkflowReply("How do I copy green fees to next year?");

  assert.match(memberRulesReply, /Member Casual Booking Rules/i);
  assert.match(memberRulesReply, /Casual Booking Rules/i);
  assert.match(memberRulesReply, /Course/i);
  assert.match(memberRulesReply, /Start Date/i);
  assert.match(memberRulesReply, /End Date/i);
  assert.match(memberRulesReply, /Start Time/i);
  assert.match(memberRulesReply, /End Time/i);
  assert.match(memberRulesReply, /Days Advance Booking/i);
  assert.match(memberRulesReply, /Guest booking allowed from/i);
  assert.match(memberRulesReply, /Casual guests not allowed/i);
  assert.match(memberRulesReply, /Number of Players Per Tee Time/i);
  assert.match(memberRulesReply, /Days of Week/i);
  assert.match(memberRulesReply, /Applies to/i);
  assert.doesNotMatch(memberRulesReply, /form\.,/i);

  assert.match(legalReply, /Legal Messages/i);
  assert.match(legalReply, /Legal Message/i);
  assert.match(legalReply, /Version/i);
  assert.match(legalReply, /Marketing Preferences/i);
  assert.match(legalReply, /Privacy Policy/i);
  assert.match(legalReply, /Member Terms and Conditions/i);
  assert.match(legalReply, /Visitor Terms and Conditions/i);

  assert.match(courseRestrictionReply, /Course Restriction/i);
  assert.match(courseRestrictionReply, /Show expired Course Restrictions/i);
  assert.match(courseRestrictionReply, /Start Date/i);
  assert.match(courseRestrictionReply, /End Date/i);
  assert.match(courseRestrictionReply, /Player Types/i);
  assert.match(courseRestrictionReply, /Members & Visitors/i);
  assert.match(courseRestrictionReply, /Max Group Size/i);
  assert.match(courseRestrictionReply, /Message/i);

  assert.match(visitorRatesReply, /Green Fee Rates for Visitors \/ Agents/i);
  assert.match(visitorRatesReply, /Filter Rates/i);
  assert.match(visitorRatesReply, /Channel/i);
  assert.match(visitorRatesReply, /Enabled Rates Only/i);
  assert.match(visitorRatesReply, /All Rates/i);
  assert.match(visitorRatesReply, /Include Years/i);
  assert.match(visitorRatesReply, /Include Months/i);
  assert.match(visitorRatesReply, /Include Days/i);
  assert.match(visitorRatesReply, /Green Fee Rate/i);
  assert.match(visitorRatesReply, /Golf \/ Package/i);
  assert.match(visitorRatesReply, /Tee Time Agents/i);

  assert.match(dayTicketReply, /Day Ticket Rates for Visitors/i);
  assert.match(dayTicketReply, /Course 1/i);
  assert.match(dayTicketReply, /Course 2/i);
  assert.match(dayTicketReply, /Green Fee Rate/i);
  assert.match(dayTicketReply, /1 Player/i);
  assert.match(dayTicketReply, /4 Players/i);
  assert.match(dayTicketReply, /feature is not enabled/i);

  assert.match(copyReply, /Copy Services, Catering or Green Fees/i);
  assert.match(copyReply, /Operation/i);
  assert.match(copyReply, /Copy Services/i);
  assert.match(copyReply, /Copy Catering/i);
  assert.match(copyReply, /Copy Green Fees/i);
  assert.match(copyReply, /From Year/i);
  assert.match(copyReply, /To Year/i);
});

test("golf events and competitions remain separate answer areas", () => {
  const eventDefinition = approvedStaticWorkflowReply("What is a golf event in BRS?");
  const eventSetup = approvedStaticWorkflowReply("How do I set up a golf event?");
  const competitionDefinition = approvedStaticWorkflowReply("What is a competition in BRS?");
  const competitionSetup = approvedStaticWorkflowReply("How do I set up an open competition?");
  const genericOrganiserBooking = approvedStaticWorkflowReply("How do I handle an organiser booking?");

  assert.match(eventDefinition, /Golf Events in BRS is a separate area from Competitions/i);
  assert.match(eventSetup, /Open "Golf Events"/i);
  assert.doesNotMatch(eventSetup, /Open Competitions/i);

  assert.match(competitionDefinition, /Competitions in BRS are used for competition setup/i);
  assert.match(competitionSetup, /Open Competitions/i);
  assert.doesNotMatch(competitionSetup, /Open Golf Events/i);

  assert.doesNotMatch(genericOrganiserBooking || "", /Open Golf Events/i);
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

test("member profile creation routes to Memberships instead of Users", async () => {
  const reply = await answerFromKnowledge("how do I add a member in the system?", { allowDynamic: false });

  assert.match(reply, /Create a Member Profile/i);
  assert.match(reply, /Memberships/i);
  assert.match(reply, /Members/i);
  assert.match(reply, /CREATE MEMBER/i);
  assert.doesNotMatch(reply, /Create a New User \/ Add a Member/i);
  assert.doesNotMatch(reply, /User Group\*|Username\*|Re-type Password|Address Line 1|CDH Number/i);

  const staffReply = await answerFromKnowledge("how do I add a new staff user?", { allowDynamic: false });
  assert.match(staffReply, /Add a User/i);
  assert.match(staffReply, /Users/i);
});
