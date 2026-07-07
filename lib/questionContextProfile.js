const WRONG_STATIC_TITLES_FOR_CONTEXT_CASES = [
  "Add a Tee-Time Booking from the Timesheet",
  "Add a Single Tee Time Booking",
  "Configure Member Competition Charges",
  "Distinguish Member Profiles from Contact Records",
  "Set Member Online Green Fee Rates",
  "Set Staff-Selected Green Fee Rates",
  "Refund a Payment on a Membership Bill",
  "Find members with unpaid or outstanding membership balances",
  "Find a Booking That Is Not Visible on the Timesheet",
  "Find a Booking That Is Not Showing on the Timesheet",
  "Manage a Flexible Member",
  "Create a Filtered Member Data Export",
];

const LIVE_DATA_AREAS = [
  "payment",
  "payments",
  "refund",
  "purse",
  "transaction",
  "permission",
  "permissions",
  "user",
  "users",
  "deleted",
  "disappeared",
  "missing",
  "cannot book",
  "can't book",
  "cant book",
  "not showing",
  "not filtered",
];

function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(lower = "", terms = []) {
  return terms.some((term) => lower.includes(term));
}

function unique(values = [], limit = 20) {
  const seen = new Set();
  const output = [];
  for (const value of values.map((item) => String(item || "").replace(/\s+/g, " ").trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function firstLine(value = "") {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function extractQuotedFacts(message = "") {
  return [...String(message).matchAll(/["'`](.{3,60}?)["'`]/g)].map((match) => match[1]);
}

function extractCapitalisedFacts(message = "") {
  return [...String(message).matchAll(/\b([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+){1,4})\b/g)]
    .map((match) => match[1])
    .filter((value) => !/^(BRS|Golf Now|GolfNow|Tools|Reports|Memberships|Contacts|Timesheet)$/i.test(value));
}

function extractContextFacts(message = "") {
  const text = String(message || "");
  const amounts = [...text.matchAll(/[\u00a3\u20ac$]\s?\d+(?:\.\d+)?(?:\s?-\s?[\u00a3\u20ac$]?\s?\d+(?:\.\d+)?)?/g)].map((match) => match[0]);
  const dates = [
    ...text.matchAll(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g),
    ...text.matchAll(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\s+\d{4}\b/gi),
    ...text.matchAll(/\b(?:today|tomorrow|yesterday|next week|last week)\b/gi),
  ].map((match) => match[0]);
  const quantities = [
    ...text.matchAll(/\b\d+\s?(?:months?|years?|weeks?|holes?|users?|members?|operators?|hotels?|guests?|entries?|players?)\b/gi),
    ...text.matchAll(/\b\d+\s+tour operators?\b/gi),
    ...text.matchAll(/\b(?:only|just|now only|we only have|only have)\s+\d+\b/gi),
  ].map((match) => match[0]);
  const memberNumbers = [...text.matchAll(/\bmember\s+(?:number|no\.?|#)?\s*\d+\b/gi)].map((match) => match[0]);
  const namedRecords = extractCapitalisedFacts(text);
  const statusPhrases = [...text.matchAll(/\((cancelled|canceled|deleted|inactive|failed|withdrawn)\)/gi)].map((match) => match[0]);
  return unique([...amounts, ...dates, ...quantities, ...memberNumbers, ...statusPhrases, ...extractQuotedFacts(text), ...namedRecords], 12);
}

function extractAreas(lower = "") {
  const areas = [];
  if (hasAny(lower, ["competition", "competitions", "purse", "tournament", "open"])) areas.push("competitions");
  if (hasAny(lower, ["contact", "contacts", "tour operator", "hotel", "society", "company"])) areas.push("contacts");
  if (hasAny(lower, ["member", "members", "membership", "bill", "invoice", "subscription", "flexible", "flexi", "prorata", "pro rata"])) areas.push("memberships");
  if (hasAny(lower, ["payment", "payments", "refund", "transaction", "debit card", "paid", "reconcile"])) areas.push("payments");
  if (hasAny(lower, ["booking", "tee", "timesheet", "tee sheet", "guest", "guests"])) areas.push("timesheet");
  if (hasAny(lower, ["green fee", "rate", "rates", "golfnow", "golf now", "visitor", "visitors", "9 hole", "18 hole"])) areas.push("visitor-online");
  if (hasAny(lower, ["report", "reports", "export", "spreadsheet", "csv", "list"])) areas.push("reports");
  return unique(areas, 8);
}

function problemSignals(lower = "") {
  const signals = [];
  if (hasAny(lower, ["problem", "issue", "not working", "wrong", "error", "message to say", "saying they cannot"])) signals.push("problem");
  if (hasAny(lower, ["wrong answer", "telling me to", "why is caddie", "why has caddie", "why is it telling"])) signals.push("wrong-answer");
  if (hasAny(lower, ["prorata", "pro rata"]) && hasAny(lower, ["bill", "billing", "subscription", "sub", "member", "memb"])) signals.push("prorata-billing");
  if (hasAny(lower, ["cannot", "can't", "cant", "unable", "won't", "wont", "not allowed", "blocked"])) signals.push("blocked-action");
  if (hasAny(lower, ["missing", "disappeared", "gone", "not showing", "still showing", "still see", "cannot see", "can't see", "cant see", "not visible", "not filtered"])) signals.push("missing-or-not-visible");
  if (hasAny(lower, ["figures", "not adding up", "reconcile", "reconciling", "counting", "total"])) signals.push("reconciliation");
  if (hasAny(lower, ["insufficient funds", "purse", "balance", "should be allowed"])) signals.push("balance-contradiction");
  if (hasAny(lower, ["angry", "urgent", "asap", "please can you look", "can you look into", "take a look"])) signals.push("urgency-or-live-action");
  return unique(signals, 8);
}

function isContextualReportingCase(lower = "") {
  const guestReport = hasAny(lower, ["how many guests", "guests a member", "guest has", "guest report", "member has booked in"]);
  const paymentReconciliationReport = hasAny(lower, ["debit card", "card payment", "total payment", "payment entry", "transaction report", "refund report"]) &&
    hasAny(lower, ["competition", "tournament", "event", "open", "entries", "tee sheet", "start sheet", "withdrawn", "reconcile"]);
  return guestReport || paymentReconciliationReport;
}

function isCleanWorkflowHowTo(lower = "", wordCount = 0) {
  const startsLikeWorkflow = /^(how do i|how to|where do i|where can i|what are the steps|show me how)\b/.test(lower);
  if (!startsLikeWorkflow) return false;
  if (wordCount > 26) return false;
  if (problemSignals(lower).length) return false;
  if (hasAny(lower, ["we have", "we are having", "i have a problem", "customer", "users", "there may be", "for some reason", "not adding up"])) return false;
  return true;
}

export function buildQuestionContextProfile(message = "") {
  const lower = normalise(message);
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const facts = extractContextFacts(message);
  const areas = extractAreas(lower);
  const problems = problemSignals(lower);
  const reportSignal = hasAny(lower, ["report", "reports", "showing how many", "export", "download", "spreadsheet", "list", "reconcile", "reconciliation"]);
  const liveActionSignal = hasAny(lower, ["can you look", "take a look", "look into", "fix this", "sort this", "do this for us", "please can you"]);
  const policyAdviceSignal = hasAny(lower, ["can you advise", "should", "possible", "allowed", "policy", "what do i tell", "what should i tell"]);
  const narrativeSignal = wordCount >= 28 || hasAny(lower, ["we have", "we are having", "we keep", "we ran", "we noticed", "there should be", "for some reason", "this means"]);
  const cleanWorkflowHowTo = isCleanWorkflowHowTo(lower, wordCount);
  const contextualReportingCase = isContextualReportingCase(lower);
  const contextualAdviceCase = policyAdviceSignal && Boolean(problems.length || liveActionSignal || narrativeSignal || facts.length >= 2);
  const contextualReportCase = reportSignal && Boolean(contextualReportingCase || problems.length || (narrativeSignal && (areas.length > 1 || facts.length > 0)));
  const requiresContextualSynthesis = !cleanWorkflowHowTo && Boolean(
    problems.length ||
    liveActionSignal ||
    contextualReportCase ||
    contextualAdviceCase ||
    (narrativeSignal && (areas.length > 1 || facts.length > 0))
  );
  const confidence = requiresContextualSynthesis
    ? hasAny(lower, LIVE_DATA_AREAS) || areas.length > 1
      ? "medium"
      : "low"
    : "high";

  return {
    version: "question-context-profile-v1",
    lower,
    wordCount,
    facts,
    areas,
    problemSignals: problems,
    reportSignal,
    contextualReportingCase,
    liveActionSignal,
    policyAdviceSignal,
    narrativeSignal,
    cleanWorkflowHowTo,
    requiresContextualSynthesis,
    allowDirectWorkflowAnswer: !requiresContextualSynthesis,
    confidence,
  };
}

export function shouldForceContextualSynthesis(message = "") {
  return buildQuestionContextProfile(message).requiresContextualSynthesis;
}

export function routingCandidateEvidence(label = "", candidate = null) {
  const reply = typeof candidate === "string" ? candidate : candidate?.reply || "";
  if (!reply) return "";
  return [
    `ROUTING CANDIDATE (${label || "unknown"}): ${firstLine(reply)}`,
    "Use this only as candidate workflow evidence. Verify it against the whole user question before using it.",
    reply,
  ].join("\n");
}

function titleIsForbiddenForContextCase(reply = "") {
  const title = firstLine(reply);
  return WRONG_STATIC_TITLES_FOR_CONTEXT_CASES.some((wrongTitle) => title.toLowerCase() === wrongTitle.toLowerCase());
}

function hasEnoughQuestionContext(profile = {}, reply = "") {
  const lowerReply = normalise(reply);
  const facts = (profile.facts || []).filter((fact) => String(fact).length >= 3);
  if (!facts.length) return true;
  const matched = facts.filter((fact) => lowerReply.includes(normalise(fact))).length;
  if (facts.length <= 2) return matched >= 1;
  return matched >= 2;
}

export function contextualAnswerIssue(message = "", reply = "") {
  const profile = buildQuestionContextProfile(message);
  if (!profile.requiresContextualSynthesis) return null;
  if (!reply) return "missing-reply";
  if (titleIsForbiddenForContextCase(reply)) return "forbidden-static-workflow-title";
  if (!hasEnoughQuestionContext(profile, reply)) return "answer-does-not-reflect-user-context";
  return null;
}

function issueSpecificChecks(profile = {}) {
  const lower = profile.lower || "";
  const checks = [];

  if (hasAny(lower, ["competition", "tournament", "purse", "insufficient funds", "cancelled", "canceled"])) {
    checks.push("Open the relevant competition record and confirm the active competition is the one users are entering, especially if there is a cancelled or duplicate competition with the same name.");
    checks.push("Check the entry fee, purse/payment setting, member entry status, and competition transaction history for one affected member before changing any charge.");
  }
  if (hasAny(lower, ["contact", "contacts", "tour operator", "hotel", "disappeared"])) {
    checks.push("In Contacts, check the category/filter/site view first, then search for the company/person name before assuming the contact record was deleted.");
    checks.push("Compare the expected category counts across the affected sites and collect an example missing record name for escalation.");
  }
  if (hasAny(lower, ["prorata", "pro rata", "bill", "invoice", "subscription", "membership"])) {
    checks.push("In Memberships, check the member profile, membership type, bill period, subscription amount, due dates, and whether the bill needs a prorated line rather than a booking workflow.");
    checks.push("Calculate the period and amount outside BRS first, then create or adjust the membership bill using the confirmed billing route.");
  }
  if (hasAny(lower, ["9 hole", "9-hole", "18 hole", "18-hole", "course", "golfnow", "golf now", "5 day", "cannot book"])) {
    checks.push("Check the course/hole setup, member booking rules for the affected member type, online availability, and visitor/GolfNow-facing setup separately.");
    checks.push("Use one affected date, course, member type, and visitor channel as the test case so you can see which rule is blocking availability.");
  }
  if (hasAny(lower, ["flexible", "flexi", "not filtered", "brs users"])) {
    checks.push("Check the member profile, linked user/account details, membership type, and flexible membership flag before changing wallet or billing settings.");
    checks.push("If the member appears in Users but not the flexible membership view, collect the member number, user record, and membership type for escalation.");
  }
  if (hasAny(lower, ["guest", "guests", "booked in", "specified period", "report"])) {
    checks.push("Start from booking/member-guest reporting rather than membership balances. Filter by member/player and date range, then export if the report supports it.");
  }
  if (hasAny(lower, ["reconcile", "reconciliation", "debit card", "withdrawn", "online payments", "not the tee sheet"])) {
    checks.push("Check competition entries, withdrawn/cancelled entries, and BRS Payments transactions separately; the tee sheet alone will not prove all paid entries.");
    checks.push("Use transaction/refund/payment exports for the payment total, then compare that against the competition entry list and withdrawal policy.");
  }

  if (!checks.length) {
    checks.push("Start by identifying the exact BRS record, date range, user/member/contact/booking, and screen where the mismatch appears.");
    checks.push("Check the relevant workflow evidence against those details before applying a setup or payment change.");
  }
  return unique(checks, 8);
}

export function buildContextualSupportFallbackReply({ message = "", profile = buildQuestionContextProfile(message), reason = "contextual-synthesis-required" } = {}) {
  const facts = profile.facts?.length ? profile.facts.slice(0, 6).join(", ") : "the record/date/amount details in the question";
  const areas = profile.areas?.length ? profile.areas.join(", ") : "the relevant BRS area";
  const checks = issueSpecificChecks(profile);
  const confidence = profile.confidence || "medium";
  const strongerEscalation = hasAny(profile.lower || "", LIVE_DATA_AREAS);

  return [
    "Check This Case Before Applying a Workflow",
    "",
    `I cannot inspect the club's live BRS data from this chat. For this question, use the details provided (${facts}) to check ${areas} rather than applying the first matching workflow.`,
    "",
    ...checks.map((check, index) => `${index + 1}. ${check}`),
    "",
    `Confidence: ${confidence}. I can give the checks to run, but the exact cause depends on the club's live configuration and records.`,
    "",
    strongerEscalation
      ? "Escalate if the checks do not explain it, or before changing payments, refunds, permissions, deleted records, or live availability. Include the affected club/site, record name, date/time range, member/contact/booking identifiers, screenshots, and the exact error or mismatch."
      : "If those checks do not resolve it, escalate with the affected record, date range, screenshots, and the exact outcome the club expected.",
  ].join("\n");
}

export function applyContextualAnswerContract(payload = {}, message = "") {
  if (!payload || typeof payload !== "object" || typeof payload.reply !== "string") return payload;
  const issue = contextualAnswerIssue(message, payload.reply);
  if (!issue) return payload;
  const profile = buildQuestionContextProfile(message);
  return {
    ...payload,
    reply: buildContextualSupportFallbackReply({ message, profile, reason: issue }),
    escalationReady: true,
    options: [],
    version: "contextual-support-fallback-v1",
    contextProfile: profile,
    contextualAnswerContract: {
      blocked: true,
      reason: issue,
      originalVersion: payload.version || null,
      originalTitle: firstLine(payload.reply),
    },
  };
}

export const WRONG_CONTEXT_STATIC_TITLES = WRONG_STATIC_TITLES_FOR_CONTEXT_CASES;
