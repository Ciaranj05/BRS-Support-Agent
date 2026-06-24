function normaliseMessage(message = "") {
  return String(message || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function compactWorkflowText(value = "") {
  return normaliseMessage(value)
    .replace(/["']/g, "")
    .replace(/\s*>\s*/g, " > ")
    .replace(/[^\w\s>/-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function workflowTitle(value = "") {
  return String(value || "").split(/\r?\n/).find((line) => line.trim())?.trim() || "";
}

function latestAssistantWorkflow(history = []) {
  return [...history].reverse().find((item) => (
    item?.role === "assistant"
    && typeof item.content === "string"
    && /^\s*\S[\s\S]*\n\s*1\.\s+/m.test(item.content)
  )) || null;
}

function isExhaustedWorkflowFollowUp(message = "") {
  const lower = normaliseMessage(message);
  if (!lower) return false;
  const saysTried = hasAny(lower, [
    "already",
    "i have done",
    "i've done",
    "ive done",
    "i've dont",
    "ive dont",
    "done that",
    "dont that",
    "did that",
    "tried that",
    "checked",
    "looked",
    "followed",
  ]);
  const saysMissing = hasAny(lower, [
    "not there",
    "isn't there",
    "isnt there",
    "nothing there",
    "no ",
    "none",
    "cannot find",
    "can't find",
    "cant find",
    "doesn't show",
    "doesnt show",
    "not showing",
    "not visible",
    "missing",
    "definitely no",
    "still not",
  ]);
  return saysTried && saysMissing;
}

function isSameWorkflowAnswer(candidate = "", previous = "") {
  const candidateText = compactWorkflowText(candidate);
  const previousText = compactWorkflowText(previous);
  if (!candidateText || !previousText) return false;
  if (candidateText === previousText) return true;

  const candidateTitle = compactWorkflowText(workflowTitle(candidate));
  const previousTitle = compactWorkflowText(workflowTitle(previous));
  return Boolean(candidateTitle && candidateTitle === previousTitle);
}

function repeatedWorkflowTopic(message = "", history = []) {
  const context = normaliseMessage([
    message,
    ...history.slice(-6).map((item) => item?.content || ""),
  ].join(" "));
  if (hasAny(context, ["payment", "payments", "paid", "transaction", "brs payments", "payout", "refund"])) return "payments";
  if (hasAny(context, ["member", "membership", "bill", "invoice", "subscription"])) return "memberships";
  if (hasAny(context, ["booking", "tee time", "timesheet", "tee sheet", "reservation"])) return "bookings";
  return "knowledge";
}

function repeatedWorkflowEscalationReply(topic = "knowledge") {
  if (topic === "payments") {
    return [
      "You have already completed the normal payment check, and the expected payment or transaction still is not showing.",
      "",
      "That rules out the standard booking-payment route. I do not have a proven BRS workflow for linking, repairing, or explaining a missing/unattached payment record from approved knowledge, so this should be escalated to BRS Support rather than repeating the same steps.",
      "",
      "Before escalating, capture the booking reference, customer name, tee time/date, amount, where the customer says they paid, any BRS Payments transaction reference or provider reference, and a screenshot of the booking payment area plus Tools > BRS Payments > Transactions if available.",
    ].join("\n");
  }

  return [
    "You have already followed the normal workflow, and the expected item or option still is not showing.",
    "",
    "I do not have a proven BRS workflow for the next corrective step from approved knowledge, so this should be escalated to BRS Support rather than repeating the same instructions.",
    "",
    "Before escalating, capture the original request, the exact steps already tried, what you expected to see, what is missing, any relevant booking/member/reference details, and screenshots of the page where the workflow stops.",
  ].join("\n");
}

export function repeatedWorkflowFollowUpPayload(message = "", history = [], candidateReply = "") {
  if (!isExhaustedWorkflowFollowUp(message)) return null;
  const previousWorkflow = latestAssistantWorkflow(history);
  if (!previousWorkflow || !isSameWorkflowAnswer(candidateReply, previousWorkflow.content)) return null;

  const topic = repeatedWorkflowTopic(message, history);
  return {
    reply: repeatedWorkflowEscalationReply(topic),
    escalationReady: false,
    topic,
    options: [],
    version: "repeated-workflow-escalation-v1",
  };
}

export function exhaustedWorkflowFollowUpPayload(message = "", history = []) {
  if (!isExhaustedWorkflowFollowUp(message)) return null;
  const previousWorkflow = latestAssistantWorkflow(history);
  if (!previousWorkflow) return null;

  const topic = repeatedWorkflowTopic(message, history);
  return {
    reply: repeatedWorkflowEscalationReply(topic),
    escalationReady: false,
    topic,
    options: [],
    version: "exhausted-workflow-escalation-v1",
  };
}

function latestAssistantMessage(history = []) {
  return [...history].reverse().find((item) => item?.role === "assistant" && item.content)?.content || "";
}

function latestRelevantUserIssue(history = []) {
  return [...history].reverse().find((item) => {
    if (item?.role !== "user" || !item.content) return false;
    if (isExhaustedWorkflowFollowUp(item.content)) return false;
    const lower = normaliseMessage(item.content);
    return lower.split(/\s+/).length > 3 && hasAny(lower, ["payment", "paid", "transaction", "booking", "member", "bill", "refund"]);
  })?.content || "";
}

function lastUserExhaustedWorkflow(history = []) {
  return [...history].reverse().find((item) => item?.role === "user" && isExhaustedWorkflowFollowUp(item.content))?.content || "";
}

function paymentObjectClarification(message = "") {
  const lower = normaliseMessage(message);
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (wordCount > 5) return "";
  if (hasAny(lower, ["booking", "tee time", "reservation"])) return "This is about a booking payment.";
  if (hasAny(lower, ["member", "membership", "bill", "invoice", "subscription"])) return "This is about a membership bill payment.";
  if (hasAny(lower, ["general payment", "payment request", "link"])) return "This is about a general payment request.";
  return "";
}

function asksPaymentObjectClarification(message = "") {
  const lower = normaliseMessage(message);
  return (
    hasAny(lower, ["which payment", "what payment", "which payment are you referring to"])
    && hasAny(lower, ["booking", "membership", "member", "general payment"])
  ) || (
    hasAny(lower, ["are you looking for a payment", "looking for a payment"])
    && hasAny(lower, ["booking", "membership", "member"])
  );
}

export function contextualiseShortClarificationFollowUp(message = "", history = []) {
  const clarification = paymentObjectClarification(message);
  if (!clarification) return message;
  if (!asksPaymentObjectClarification(latestAssistantMessage(history))) return message;

  const originalIssue = latestRelevantUserIssue(history);
  const exhaustedFollowUp = lastUserExhaustedWorkflow(history);
  return [
    originalIssue ? `Original issue: ${originalIssue}` : null,
    `User clarification: ${clarification}`,
    exhaustedFollowUp ? `Earlier follow-up: ${exhaustedFollowUp}` : null,
    exhaustedFollowUp ? "The user has already completed the previous workflow/check and the expected item is still missing. Do not repeat the same workflow; if no proven next workflow is available, escalate to support." : null,
  ].filter(Boolean).join("\n");
}
