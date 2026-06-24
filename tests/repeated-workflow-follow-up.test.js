import assert from "node:assert/strict";
import test from "node:test";
import { approvedStaticWorkflowReply } from "../lib/staticWorkflowAnswers.js";
import {
  contextualiseShortClarificationFollowUp,
  exhaustedWorkflowFollowUpPayload,
  repeatedWorkflowFollowUpPayload,
} from "../lib/repeatedWorkflowFollowUp.js";

test("does not replace the first approved payment-check workflow", () => {
  const reply = approvedStaticWorkflowReply("the customer says they paid but there is no payment tied to the booking");

  assert.match(reply, /Check Payments on a Booking/i);
  assert.equal(repeatedWorkflowFollowUpPayload("the customer says they paid but there is no payment tied to the booking", [], reply), null);
});

test("escalates instead of repeating an exhausted workflow answer", () => {
  const firstReply = approvedStaticWorkflowReply("the customer says they paid but there is no payment tied to the booking");
  const repeatedReply = approvedStaticWorkflowReply("I have checked the booking and there is definitely no payment tied to it");
  const history = [
    { role: "user", content: "the customer says they paid but there is no payment tied to the booking" },
    { role: "assistant", content: firstReply },
  ];

  const payload = repeatedWorkflowFollowUpPayload(
    "I have checked the booking and there is definitely no payment tied to it",
    history,
    repeatedReply
  );

  assert.equal(payload.version, "repeated-workflow-escalation-v1");
  assert.equal(payload.topic, "payments");
  assert.match(payload.reply, /already completed the normal payment check/i);
  assert.match(payload.reply, /escalated to BRS Support/i);
  assert.doesNotMatch(payload.reply, /Review the booking payment or transaction area/i);
});

test("escalates typo-heavy exhausted follow-ups even before a new workflow is selected", () => {
  const firstReply = approvedStaticWorkflowReply("the customer says they paid but there is no payment tied to the booking");
  const history = [
    { role: "user", content: "the customer says they paid but there is no payment tied to the booking" },
    { role: "assistant", content: firstReply },
  ];

  const payload = exhaustedWorkflowFollowUpPayload("i've dont that and the payment isnt there", history);

  assert.equal(payload.version, "exhausted-workflow-escalation-v1");
  assert.equal(payload.topic, "payments");
  assert.match(payload.reply, /escalated to BRS Support/i);
});

test("contextualises short payment-object clarification answers from prior chat history", () => {
  const firstReply = approvedStaticWorkflowReply("the customer says they paid but there is no payment tied to the booking");
  const history = [
    { role: "user", content: "the customer says they paid but there is no payment tied to the booking" },
    { role: "assistant", content: firstReply },
    { role: "user", content: "i've dont that and the payment isnt there" },
    { role: "assistant", content: "Can you please specify which payment you are referring to? Are you looking for a payment relating to a booking, a membership, or something else?" },
  ];

  const contextual = contextualiseShortClarificationFollowUp("a booking", history);

  assert.match(contextual, /Original issue: the customer says they paid/i);
  assert.match(contextual, /User clarification: This is about a booking payment/i);
  assert.match(contextual, /Earlier follow-up: i've dont that/i);
  assert.match(contextual, /Do not repeat the same workflow/i);
});

test("repeat guard works from matching workflow title, not an exact example string", () => {
  const firstReply = `Open Booking Details

1. Open the Timesheet.
2. Click the booking name.
3. Review the details.`;
  const candidateReply = `Open Booking Details

1. Go to the Timesheet.
2. Select the booking.
3. Review the details.`;
  const history = [
    { role: "user", content: "where do I see the booking details?" },
    { role: "assistant", content: firstReply },
  ];

  const payload = repeatedWorkflowFollowUpPayload("I've already checked and it still isn't there", history, candidateReply);

  assert.equal(payload.version, "repeated-workflow-escalation-v1");
  assert.equal(payload.topic, "bookings");
  assert.match(payload.reply, /normal workflow/i);
});
