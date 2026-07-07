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
    checks: [/cancelled or duplicate competition/i, /purse\/payment setting|purse/i],
  },
  {
    id: "missing-tour-operator-contact",
    message: "We keep a list of Tour Operators and Hotels in Contacts for Troon, Ayr and Carrick. There should be 20 Tour Operators and 5 Hotels in each site but Golf Around Scotland has disappeared from Ayr and we only have 19 tour operators now.",
    facts: ["20 Tour Operators", "5 Hotels", "Golf Around Scotland"],
    checks: [/Contacts, check the category\/filter\/site view/i, /expected category counts/i],
  },
  {
    id: "prorata-membership-bill",
    message: "I need to create a bill for a new member who's joining 3 months into a 2 year red tee deal so it will be a prorata bill. First year runs from 1/7/2026 until 31/3/27, 9 months at \u00a330 a month. Can you advise how to raise this bill please.",
    facts: ["3 months", "2 year", "1/7/2026", "9 months", "\u00a330"],
    checks: [/Memberships, check the member profile/i, /prorated line/i],
  },
  {
    id: "course-9-hole-golfnow-availability",
    message: "Our Parkland Course is dropping to a 9 hole golf course tomorrow and our 5 Day Members cannot book. Golf Now is also showing hot deals as 18 holes for visitors when these should not show. Please can you look into this for us?",
    facts: ["Parkland Course", "9 hole", "5 Day Members", "18 holes"],
    checks: [/course\/hole setup/i, /GolfNow-facing setup/i],
  },
  {
    id: "flexible-member-not-filtered",
    message: "We have a flexible member Alban Sayers member number 5480. He appears in BRS users but its not filtered across to Flexible memberships - can you take a look please.",
    facts: ["Alban Sayers", "member number 5480"],
    checks: [/member profile, linked user\/account details/i, /member number, user record, and membership type/i],
  },
  {
    id: "member-guest-report",
    message: "Could you tell me if it is possible to run a report showing how many guests a member has booked in over a specified period of time?",
    facts: [],
    checks: [/member-guest reporting/i, /date range/i],
  },
  {
    id: "tournament-payment-reconciliation",
    message: "We ran a tournament called Seniors Open on Thursday 18th June 2026 and set it up to take online payments. We are trying to reconcile tournament entries but some golfers withdrew and we have a no refunds within 4 weeks policy. Is there a debit card entry report or total payment entry even if the member name is not on the tee sheet?",
    facts: ["Seniors Open", "Thursday 18th June 2026", "4 weeks"],
    checks: [/competition entries, withdrawn\/cancelled entries/i, /transaction\/refund\/payment exports/i],
  },
  {
    id: "angry-short-contact-variant",
    message: "This is urgent, one of our hotel contacts has vanished again. We had 5 hotels yesterday and now only 4 are showing in Contacts. Where has the record gone?",
    facts: ["5 hotels", "4"],
    checks: [/Contacts, check the category\/filter\/site view/i],
  },
  {
    id: "spelling-prorata-variant",
    message: "new memb is joinng half way thru the yearly sub, need pro rata bill for 6 months at \u00a342 pm, why is caddie telling me to make a booking?",
    facts: ["6 months", "\u00a342"],
    checks: [/Memberships, check the member profile/i],
  },
  {
    id: "adjacent-competition-fee-variant",
    message: "Two members paid into the competition purse but cannot enter the Captain's Day comp. It says not enough funds although the fee is only \u00a315 and one member has \u00a318. I do not want to change every competition charge.",
    facts: ["Captain's Day", "\u00a315", "\u00a318"],
    checks: [/competition record/i, /entry fee, purse\/payment setting/i],
  },
  {
    id: "adjacent-golfnow-feed-variant",
    message: "Visitors can still see 18 hole availability on GolfNow for Valley even though Valley is 9 holes only from Monday. Members are also blocked online. What should we check first?",
    facts: ["18 hole", "GolfNow", "Valley", "9 holes", "Monday"],
    checks: [/course\/hole setup/i, /visitor\/GolfNow-facing setup/i],
  },
  {
    id: "adjacent-reconciliation-variant",
    message: "Open comp payments do not match the start sheet because withdrawn players are missing from the sheet. We need a total card payment report for the event, not a member bill refund.",
    facts: [],
    checks: [/BRS Payments transactions/i, /tee sheet alone will not prove all paid entries/i],
  },
];

function assertNoWrongStaticTitle(reply = "") {
  for (const title of WRONG_CONTEXT_STATIC_TITLES) {
    assert.notEqual(String(reply).split(/\r?\n/).find(Boolean), title);
  }
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
    assert.match(gated.reply, /Confidence: (medium|low|high)/, item.id);
    assert.match(gated.reply, /I cannot inspect the club's live BRS data from this chat/i, item.id);
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
      assert.equal(result.route, "contextual-support-fallback", item.id);
      assert.equal(result.contextProfile.requiresContextualSynthesis, true, item.id);
      assertNoWrongStaticTitle(result.reply);
      assert.match(result.reply, /Confidence: (medium|low|high)/, item.id);
      assert.equal(contextualAnswerIssue(item.message, result.reply), null, item.id);
    }
  } finally {
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  }
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
