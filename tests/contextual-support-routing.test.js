import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { approvedStaticWorkflowReply } from "../lib/staticWorkflowAnswers.js";
import { answerFromObjectFirstRouting } from "../lib/objectFirstRouting.js";
import { answerFromKnowledgeDetailed } from "../lib/knowledgeAnswer.js";
import {
  applyContextualAnswerContract,
  buildQuestionContextProfile,
  contextualAnswerIssue,
  WRONG_CONTEXT_STATIC_TITLES,
} from "../lib/questionContextProfile.js";

const CUSTOMER_CASES = [
  {
    id: "competition-purse-cancelled-duplicate",
    message: "We have a problem with three users - and there may be more. They have \u20ac30 - \u20ac32 in their purse but they are getting a message to say they cannot enter a competition because they have insufficient funds. The competition is \u20ac20 and they should be allowed. In the office we can see it says the name of the competition and (Cancelled) after it. We did have a competition with the same name (Presidents Prize) that we had to cancel after day 1 because of weather.",
    facts: ["\u20ac30", "\u20ac20", "Presidents Prize"],
    checks: [/System Configuration/i, /Competition Purse Module/i, /Minimum member competition purse balance/i, /Competition Purse Transactions/i],
  },
  {
    id: "missing-tour-operator-contact",
    message: "We keep a list of Tour Operators and Hotels in Contacts for Troon, Ayr and Carrick. There should be 20 Tour Operators and 5 Hotels in each site but Golf Around Scotland has disappeared from Ayr and we only have 19 tour operators now.",
    facts: ["20 Tour Operators", "5 Hotels", "Golf Around Scotland"],
    checks: [/Contacts/i, /View All|full contacts list/i, /Contact Categories/i, /Tour Operator/i, /Hotel/i],
  },
  {
    id: "prorata-membership-bill",
    message: "I need to create a bill for a new member who's joining 3 months into a 2 year red tee deal so it will be a prorata bill. First year runs from 1/7/2026 until 31/3/27, 9 months at \u00a330 a month. Can you advise how to raise this bill please.",
    facts: ["3 months", "2 year", "1/7/2026", "9 months", "\u00a330"],
    checks: [/Memberships/i, /member profile/i, /Billing Reference|description/i, /Due Date/i, /bill\/period dates|bill period/i, /ADD ITEM/i, /PREVIEW/i, /\u00a3270/i],
  },
  {
    id: "course-9-hole-golfnow-availability",
    message: "Our Parkland Course is dropping to a 9 hole golf course tomorrow and our 5 Day Members cannot book. Golf Now is also showing hot deals as 18 holes for visitors when these should not show. Please can you look into this for us?",
    facts: ["Parkland Course", "9 hole", "5 Day Members", "18 holes"],
    checks: [/course\/hole setup/i, /Member Casual Booking Rules/i, /Course Restriction/i, /Green Fee Rates/i, /Holes/i, /GolfNow/i, /visitor/i],
  },
  {
    id: "flexible-member-not-filtered",
    message: "We have a flexible member Alban Sayers member number 5480. He appears in BRS users but its not filtered across to Flexible memberships - can you take a look please.",
    facts: ["Alban Sayers", "member number 5480"],
    checks: [/Users/i, /linked member profile/i, /Membership Type/i, /Flex/i, /Club Systems/i, /Member Category Mapping/i],
  },
  {
    id: "member-guest-report",
    message: "Could you tell me if it is possible to run a report showing how many guests a member has booked in over a specified period of time?",
    facts: [],
    checks: [/Reports/i, /Start Date/i, /End Date/i, /Booking Details/i, /Full Booking Details/i, /Booking \/ Payment Status/i],
  },
  {
    id: "tournament-payment-reconciliation",
    message: "We ran a tournament called Seniors Open on Thursday 18th June 2026 and set it up to take online payments. We are trying to reconcile tournament entries but some golfers withdrew and we have a no refunds within 4 weeks policy. Is there a debit card entry report or total payment entry even if the member name is not on the tee sheet?",
    facts: ["Seniors Open", "Thursday 18th June 2026", "4 weeks"],
    checks: [/BRS Payments/i, /Transactions/i, /Revenue From Online Merchant Payments/i, /Payments by Payment Date/i, /Payments by Transaction Date/i, /tee sheet/i],
  },
  {
    id: "angry-short-contact-variant",
    message: "This is urgent, one of our hotel contacts has vanished again. We had 5 hotels yesterday and now only 4 are showing in Contacts. Where has the record gone?",
    facts: ["5 hotels", "4"],
    checks: [/Contacts/i, /View All|full contacts list/i, /Contact Categories/i],
  },
  {
    id: "spelling-prorata-variant",
    message: "new memb is joinng half way thru the yearly sub, need pro rata bill for 6 months at \u00a342 pm, why is caddie telling me to make a booking?",
    facts: ["6 months", "\u00a342"],
    checks: [/Memberships/i, /Billing\/Payments|member's billing area/i, /ADD ITEM/i],
  },
  {
    id: "adjacent-competition-fee-variant",
    message: "Two members paid into the competition purse but cannot enter the Captain's Day comp. It says not enough funds although the fee is only \u00a315 and one member has \u00a318. I do not want to change every competition charge.",
    facts: ["Captain's Day", "\u00a315", "\u00a318"],
    checks: [/Competition Purse/i, /Minimum member competition purse balance/i],
  },
  {
    id: "adjacent-golfnow-feed-variant",
    message: "Visitors can still see 18 hole availability on GolfNow for Valley even though Valley is 9 holes only from Monday. Members are also blocked online. What should we check first?",
    facts: ["18 hole", "GolfNow", "Valley", "9 holes", "Monday"],
    checks: [/course\/hole setup/i, /Member Casual Booking Rules/i, /Course Restriction/i, /Green Fee Rates/i, /GolfNow/i, /visitor/i],
  },
  {
    id: "adjacent-reconciliation-variant",
    message: "Open comp payments do not match the start sheet because withdrawn players are missing from the sheet. We need a total card payment report for the event, not a member bill refund.",
    facts: [],
    checks: [/BRS Payments/i, /Transactions/i, /Payments by Payment Date/i, /tee sheet|start sheet/i],
  },
  {
    id: "booking-payment-payout-reference",
    message: "A customer paid for booking REF 21494 but the booking still says balance outstanding and I cannot see it in the payout schedule. Can you confirm if the payment was successful before we refund?",
    facts: ["REF 21494"],
    checks: [/Booking Details/i, /Payments/i, /BRS Payments/i, /Transactions/i, /Payouts/i, /Transfer Date/i, /Status/i],
  },
  {
    id: "messages-not-received",
    message: "Several members say they did not receive a club message email we sent yesterday. We need to know what to check before sending it again.",
    facts: [],
    checks: [/Messages/i, /recipient/i, /Email Message Summary Report/i],
  },
  {
    id: "users-permission-report-access",
    message: "One staff user can log in but cannot see revenue reports anymore. They had access last week and are busy on reception now.",
    facts: [],
    checks: [/Users/i, /role|user group|permissions/i, /report/i],
  },
  {
    id: "facility-buggy-report",
    message: "The buggy hire numbers for Saturday do not match what we charged. Which area should we check and can we report on it?",
    facts: [],
    checks: [/facility|service|buggy/i, /Buggy, Caddy and Club Hire Report/i, /Players, Payment, Buggies and Caddies/i],
  },
  {
    id: "timesheet-booking-not-visible",
    message: "A visitor says they booked 10:20 tomorrow but staff cannot see the booking on the tee sheet. What should we check?",
    facts: ["10:20", "tomorrow"],
    checks: [/Timesheet/i, /Booking Details/i, /date.*course|course.*date/i],
  },
];

const FORBIDDEN_CONTEXTUAL_WORDING = [
  /Check This Case Before Applying a Workflow/i,
  /use the details provided/i,
  /first matching workflow/i,
  /BRS area you were working in/i,
  /Hi We/i,
  /Dear BRS/i,
  /Kind regards/i,
];

function assertNoWrongStaticTitle(reply = "") {
  for (const title of WRONG_CONTEXT_STATIC_TITLES) {
    assert.notEqual(String(reply).split(/\r?\n/).find(Boolean), title);
  }
  for (const pattern of FORBIDDEN_CONTEXTUAL_WORDING) assert.doesNotMatch(reply, pattern);
}

test("context profile forces synthesis for real and derived customer cases", () => {
  for (const item of CUSTOMER_CASES) {
    const profile = buildQuestionContextProfile(item.message);
    assert.equal(profile.requiresContextualSynthesis, true, item.id);
    assert.equal(profile.allowDirectWorkflowAnswer, false, item.id);
    assert.ok(profile.problemSignals.length || profile.reportSignal || profile.liveActionSignal || profile.policyAdviceSignal, item.id);
  }

  const cleanWorkflow = buildQuestionContextProfile("How do I set up green fee rates?");
  assert.equal(cleanWorkflow.requiresContextualSynthesis, false);
  assert.equal(cleanWorkflow.allowDirectWorkflowAnswer, true);
});

test("final contextual answer contract blocks wrong workflow titles and keeps user context", () => {
  for (const item of CUSTOMER_CASES) {
    const staticReply = approvedStaticWorkflowReply(item.message);
    const objectReply = answerFromObjectFirstRouting(item.message);
    const candidateReply = staticReply || objectReply?.reply || "Add a Tee-Time Booking from the Timesheet\n\n1. Open Timesheet.";
    const gated = applyContextualAnswerContract({ reply: candidateReply, version: "test-static-route" }, item.message);

    assert.equal(gated.version, "contextual-support-fallback-v1", item.id);
    assert.equal(gated.contextualAnswerContract.blocked, true, item.id);
    assertNoWrongStaticTitle(gated.reply);
    assert.doesNotMatch(gated.reply, /Confidence: (medium|low|high)/, item.id);
    for (const pattern of item.checks) assert.match(gated.reply, pattern, item.id);
    for (const fact of item.facts.slice(0, 2)) assert.match(gated.reply, new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), item.id);
  }
});

test("knowledge fallback never returns static workflow for contextual cases when dynamic synthesis is unavailable", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    for (const item of CUSTOMER_CASES) {
      const result = await answerFromKnowledgeDetailed(item.message, { forceContextualSynthesis: true });
      assert.equal(result.route, "contextual-evidence-fallback", item.id);
      assert.equal(result.contextProfile.requiresContextualSynthesis, true, item.id);
      assertNoWrongStaticTitle(result.reply);
      assert.doesNotMatch(result.reply, /Confidence: (medium|low|high)/, item.id);
      assert.equal(contextualAnswerIssue(item.message, result.reply), null, item.id);
      for (const pattern of item.checks) assert.match(result.reply, pattern, item.id);
    }
  } finally {
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  }
});

test("answer contract rejects weak flexible-member replies that ignore linked user mapping", () => {
  const message = "We have a flexible member Alban Sayers member number 5480. He appears in BRS users but its not filtered across to Flexible memberships - can you take a look please.";
  const weakReply = `How to Check Why a Member Isn't Showing Under Flexible Memberships

1. Open Memberships.
2. Click Members.
3. Search for Alban Sayers or member number 5480.
4. Check Membership Type and set it to a flexible category.`;

  assert.equal(contextualAnswerIssue(message, weakReply), "missing-flexible-member-specifics");
});

test("production route cannot bypass contextual synthesis before static or object-first returns", () => {
  const source = fs.readFileSync(new URL("../server-with-feedback.js", import.meta.url), "utf8");

  assert.match(source, /buildQuestionContextProfile/);
  assert.match(source, /forceContextualSynthesis/);
  assert.match(source, /routingCandidateEvidence/);
  assert.ok(
    source.search(/const contextProfile = buildQuestionContextProfile\(routingMessage\)/) <
    source.search(/const domainPayload = domainSpecificPreRoutePayload\(routingMessage, history\)/)
  );
  assert.ok(
    source.search(/const contextProfile = buildQuestionContextProfile\(routingMessage\)/) <
    source.search(/const earlyStaticReply = approvedStaticWorkflowReply\(routingMessage\)/)
  );
  assert.match(source, /if \(domainPayload && !forceContextualSynthesis\)/);
  assert.match(source, /earlyStaticEvaluation\.allowed && !forceContextualSynthesis/);
  assert.match(source, /staticIntentEvaluation\.allowed && !forceContextualSynthesis/);
  assert.match(source, /!forceContextualSynthesis && objectFirstReply\?\.routeStrength === "specific"/);
});
