const WRONG_STATIC_TITLES_FOR_CONTEXT_CASES = [
  "Add a Tee-Time Booking from the Timesheet",
  "Add a Single Tee Time Booking",
  "Configure Member Competition Charges",
  "Distinguish Member Profiles from Contact Records",
  "Set Member Online Green Fee Rates",
  "Set Staff-Selected Green Fee Rates",
  "Refund an Online Tee-Time Booking Payment",
  "Refund a Payment on a Membership Bill",
  "Find members with unpaid or outstanding membership balances",
  "Find a Booking That Is Not Visible on the Timesheet",
  "Find a Booking That Is Not Showing on the Timesheet",
  "Manage a Flexible Member",
  "Create a Filtered Member Data Export",
  "Run a Report in BRS",
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

function cleanContextFact(value = "") {
  let fact = String(value || "").replace(/\s+/g, " ").trim();
  fact = fact.replace(/^(?:a\s+company\s+called|company\s+called|called)\s+/i, "");
  fact = fact.replace(/^(?:hi|hello|good morning|good afternoon|dear brs|dear support|hope you are well today)[,\s-]+/i, "");
  fact = fact.replace(/\b(?:look forward to hearing back from you|kind regards|regards|thanks|thank you)\.?$/i, "").trim();
  if (!fact || fact.length < 2) return "";
  if (/^(?:hi|hello|good morning|good afternoon|dear brs|dear|kind regards|regards|thanks|thank you|brs|we|i|on|in)$/i.test(fact)) return "";
  if (/^(?:hi|hello|dear|good morning|good afternoon)\s+we\b/i.test(fact)) return "";
  if (/^we\b/i.test(fact) && fact.split(/\s+/).length <= 3) return "";
  return fact;
}

function extractCapitalisedFacts(message = "") {
  return [...String(message).matchAll(/\b([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+){1,4})\b/g)]
    .map((match) => match[1])
    .map(cleanContextFact)
    .filter(Boolean)
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
  const times = [...text.matchAll(/\b\d{1,2}:\d{2}\s?(?:am|pm)?\b/gi)].map((match) => match[0]);
  const quantities = [
    ...text.matchAll(/\b\d+\s?(?:months?|years?|weeks?|holes?|users?|members?|operators?|hotels?|guests?|entries?|players?)\b/gi),
    ...text.matchAll(/\b\d+\s+tour operators?\b/gi),
    ...text.matchAll(/\b(?:only|just|now only|we only have|only have)\s+\d+\b/gi),
  ].map((match) => match[0]);
  const memberNumbers = [...text.matchAll(/\bmember\s+(?:number|no\.?|#)?\s*\d+\b/gi)].map((match) => match[0]);
  const references = [...text.matchAll(/\b(?:ref|reference)\s*#?\s*\d+\b/gi)].map((match) => match[0]);
  const namedRecords = extractCapitalisedFacts(text);
  const statusPhrases = [...text.matchAll(/\((cancelled|canceled|deleted|inactive|failed|withdrawn)\)/gi)].map((match) => match[0]);
  return unique([...amounts, ...dates, ...times, ...quantities, ...memberNumbers, ...references, ...statusPhrases, ...extractQuotedFacts(text), ...namedRecords].map(cleanContextFact).filter(Boolean), 12);
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
  if (hasAny(lower, ["problem", "issue", "not working", "wrong", "error", "message to say", "saying they cannot", "did not receive", "not received", "not receiving", "do not match", "does not match", "don't match", "dont match", "not matching", "balance outstanding"])) signals.push("problem");
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

function supportScenarioFlags(profile = {}) {
  const lower = profile.lower || "";
  const areas = profile.areas || [];
  const hasArea = (area) => areas.includes(area);
  const competitionWords = hasAny(lower, ["competition", "competitions", "comp ", "tournament", "open", "medal", "captain", "presidents prize", "captain's"]);
  const paymentWords = hasAny(lower, ["payment", "payments", "paid", "debit card", "card", "transaction", "payout", "refund", "reconcile", "reconciliation"]);
  const reportWords = hasAny(lower, ["report", "reports", "export", "download", "spreadsheet", "csv", "showing how many", "specified period", "list"]);

  return {
    prorataBilling: hasAny(lower, ["prorata", "pro rata", "pro-rata", "half way", "part way", "joining 3 months", "joinng", "joined"]) && hasAny(lower, ["bill", "billing", "subscription", "member", "membership", "deal", "monthly"]),
    contactsMissing: hasArea("contacts") && hasAny(lower, ["missing", "disappeared", "vanished", "gone", "not showing", "only have", "tour operator", "hotel", "company"]),
    contactsReAdd: hasArea("contacts") && hasAny(lower, ["re-add", "re add", "readd", "add back", "add it back", "add new contact", "add contact", "create the missing contact", "create a new contact", "instructions to re-add", "instructions to re add"]),
    guestReport: hasAny(lower, ["how many guests", "guests a member", "member has booked in", "guest has booked", "guest report", "booked in over"]) && reportWords,
    competitionPurse: competitionWords && hasAny(lower, ["purse", "wallet", "insufficient funds", "not enough funds", "balance", "entry fee", "cancelled", "canceled", "charge method", "minimum balance"]),
    competitionReconciliation: competitionWords && paymentWords && hasAny(lower, ["reconcile", "reconciliation", "withdrawn", "withdraw", "no refunds", "total payment", "payment entry", "not the tee sheet", "start sheet", "entry report"]),
    flexibleMemberSync: hasAny(lower, ["flexible", "flexi", "flex memberships", "flexible memberships"]) && hasAny(lower, ["users", "brs users", "not filtered", "filtered across", "not showing", "membership"]),
    bookingPaymentPayout: hasAny(lower, ["booking", "tee time", "ref ", "reference", "balance outstanding", "payout", "payout schedule", "funds", "payment did not", "payment has gone", "partial refund"]) && paymentWords,
    courseAvailability: hasAny(lower, ["9 hole", "9-hole", "18 hole", "18-hole", "golfnow", "golf now", "hot deals", "cannot book", "can't book", "cant book", "online availability", "member booking rules"]),
    reportingLookup: reportWords,
    membershipBilling: hasArea("memberships") && hasAny(lower, ["bill", "billing", "invoice", "subscription", "payment scheme", "scheduled payment", "overdue", "outstanding"]),
    messagingIssue: hasAny(lower, ["email", "emails", "message", "messages", "text", "sms", "club message", "not receiving", "not received"]),
    usersIssue: hasAny(lower, ["user", "users", "login", "password", "permission", "permissions", "role"]) || (hasAny(lower, ["staff"]) && hasAny(lower, ["access", "cannot access", "can't access", "cant access", "log in", "login", "permission", "permissions", "role"])),
    facilitiesIssue: hasAny(lower, ["facility", "facilities", "room", "resource", "catering", "club hire", "buggy", "buggies", "caddy", "caddie"]),
    timesheetIssue: hasAny(lower, ["timesheet", "tee sheet", "teesheet", "tee time", "booking", "reservation"]) && !paymentWords,
    greenFeeIssue: hasAny(lower, ["green fee", "green fees", "visitor rate", "visitor rates", "member rate", "rates", "golfnow", "golf now"]),
  };
}

function scenarioAnswerIssue(profile = {}, reply = "") {
  const lowerReply = normalise(reply);
  const scenarios = supportScenarioFlags(profile);
  const includesAny = (terms) => hasAny(lowerReply, terms.map((term) => normalise(term)));

  if (scenarios.prorataBilling && !(
    includesAny(["member profile", "member's billing area", "member billing area", "Billing/Payments"])
    && includesAny(["Billing Reference", "reference", "description"])
    && includesAny(["Due Date", "due date"])
    && includesAny(["line item", "ADD ITEM", "amount", "total"])
    && includesAny(["PREVIEW", "preview", "publish", "confirm"])
  )) return "missing-prorata-billing-specifics";
  if (scenarios.contactsReAdd && !(includesAny(["Contacts"]) && includesAny(["Add New", "Add Contact"]) && includesAny(["Company / Group Name", "company name", "Contact Category"]) && includesAny(["Tour Operator", "Hotel", "category"]))) return "missing-contact-readd-specifics";
  if (scenarios.contactsMissing && !(includesAny(["Contacts"]) && includesAny(["Search", "View All", "Filter", "Contact Categories", "Tour Operator", "Hotel"]))) return "missing-contacts-specifics";
  if (scenarios.guestReport && !(includesAny(["Reports"]) && includesAny(["Booking Details", "Full Booking Details", "Booking / Payment Status", "Start Date", "End Date", "Type of Report"]))) return "missing-report-specifics";
  if (scenarios.competitionPurse && !(includesAny(["Competition Purse", "System Configuration", "Minimum member competition purse balance", "Competition Purse Transactions", "Process Competition Charges"]) && includesAny(["purse", "balance", "entry fee", "transaction"]))) return "missing-competition-purse-specifics";
  if (scenarios.flexibleMemberSync && !(
    includesAny(["Users", "BRS users", "user account"])
    && includesAny(["linked member profile", "linked profile", "linked to a Memberships member profile", "link"])
    && includesAny(["Membership Type", "Flex", "Flexible"])
    && includesAny(["Club Systems", "Member Category Mapping", "mapping", "sync", "import", "preview", "duplicate profile"])
  )) return "missing-flexible-member-specifics";
  if (scenarios.competitionReconciliation && !(includesAny(["Revenue From Online Merchant Payments", "Payments by Payment Date", "Payments by Transaction Date", "Transactions", "Competition Purse Transactions", "Competition Purse Summary"]) && includesAny(["tee sheet", "start sheet", "entries", "withdrawn", "payment total"]))) return "missing-competition-reconciliation-specifics";
  if (!scenarios.competitionReconciliation && !scenarios.competitionPurse && scenarios.bookingPaymentPayout && !(includesAny(["Booking Details"]) && includesAny(["Payments"]) && includesAny(["Transactions"]) && includesAny(["Payouts"]))) return "missing-booking-payment-specifics";
  if (scenarios.courseAvailability && !(
    includesAny(["course", "hole", "9 hole", "18 hole"])
    && includesAny(["Member Casual Booking Rules", "member booking rules"])
    && includesAny(["Green Fee Rates", "green fee"])
    && includesAny(["Course Restriction", "Course Restrictions"])
    && includesAny(["GolfNow", "Golf Now", "visitor", "availability", "Hot Deals"])
  )) return "missing-course-availability-specifics";
  return null;
}

export function buildQuestionContextProfile(message = "") {
  const lower = normalise(message);
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const facts = extractContextFacts(message);
  const areas = extractAreas(lower);
  const problems = problemSignals(lower);
  const reportSignal = hasAny(lower, ["report", "reports", "showing how many", "export", "download", "spreadsheet", "list", "reconcile", "reconciliation"]);
  const liveActionSignal = hasAny(lower, ["can you look", "take a look", "look into", "fix this", "sort this", "do this for us", "please can you", "can you confirm", "confirm if"]);
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
  if (/Check This Case Before Applying a Workflow|use the details provided|first matching workflow|BRS area you were working in/i.test(reply)) return "internal-generic-contextual-wording";
  if (titleIsForbiddenForContextCase(reply)) return "forbidden-static-workflow-title";
  if (!hasEnoughQuestionContext(profile, reply)) return "answer-does-not-reflect-user-context";
  const scenarioIssue = scenarioAnswerIssue(profile, reply);
  if (scenarioIssue) return scenarioIssue;
  return null;
}

function prorataDetails(message = "") {
  const text = String(message || "");
  const monthAmount = text.match(/\b(\d{1,2})\s+months?\b[\s\S]{0,45}?([\u00a3\u20ac$])\s?(\d+(?:\.\d+)?)/i);
  const dates = [...text.matchAll(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g)].map((match) => match[0]);
  if (!monthAmount && !dates.length) return {};
  const months = monthAmount ? Number(monthAmount[1]) : null;
  const currency = monthAmount ? monthAmount[2] : "";
  const amount = monthAmount ? Number(monthAmount[3]) : null;
  const total = months && amount ? `${currency}${Number((months * amount).toFixed(2)).toString().replace(/\.00$/, "")}` : "";
  return { months, amount, currency, total, dates };
}

function contextLead(profile = {}, fallback = "the details in the question") {
  const facts = (profile.facts || []).slice(0, 6).filter(Boolean);
  return facts.length ? facts.join(", ") : fallback;
}

function lowConfidenceLine(profile = {}) {
  if ((profile.confidence || "medium") !== "low") return "";
  return "I am not fully confident from the available evidence, so use these checks and escalate if the record still does not match.";
}

function liveDataLine(profile = {}) {
  if (!profile.liveActionSignal) return "";
  return "I cannot inspect or change the club's live BRS records from this chat, so use the checks below before making changes.";
}

function issueSpecificChecks(profile = {}, message = "") {
  const lower = profile.lower || "";
  const scenarios = supportScenarioFlags(profile);
  const checks = [];

  if (scenarios.prorataBilling) {
    const details = prorataDetails(message);
    const amountText = details.total ? ` In this example, ${details.months} months at ${details.currency}${details.amount} is ${details.total}.` : "";
    const [startDate, endDate] = details.dates || [];
    const dateText = startDate && endDate ? ` from ${startDate} to ${endDate}` : "";
    const totalText = details.total || "the calculated prorated amount";
    checks.push(`For this one new member prorated bill (${contextLead(profile)}), use "Memberships", not the Timesheet.${amountText}`);
    checks.push(`Open "Memberships" > "Members", create or find the member profile, set the correct "Membership Type" for the deal, set the membership dates${dateText}, then save the profile.`);
    checks.push('From that member profile, open the member billing/bills area and choose the create/add bill or charge option for that individual member.');
    checks.push(`Use a clear "Billing Reference" or description such as "Red Tee prorata ${startDate || "start date"}-${endDate || "end date"}", set the "Due Date" the club wants, and set the bill/period dates to the prorated dates rather than the full annual cycle.`);
    checks.push(`On the line item/subscription step, choose the correct membership subscription if it exists, or use "ADD ITEM" for a one-off prorated membership charge. Enter the item description, quantity 1, and amount ${totalText}.`);
    checks.push('Leave "Payment Schemes" blank unless the club wants instalments or scheduled payments for this bill.');
    checks.push('Use "PREVIEW" before confirming. Check the member, reference/description, due date, bill period, line item, amount, payment scheme, publish status, and total.');
    checks.push('Use "Memberships" > "Billing/Payments" > "CREATE BILLS" only if the club prefers the batch route; in "Who To Bill", select only this member and check the preview before publishing.');
    return checks;
  }

  if (scenarios.contactsReAdd) {
    checks.push(`To re-add the missing contact (${contextLead(profile)}), open "Contacts" and click "Add New".`);
    checks.push('On "Add Contact", use "General Information" to enter the "Company / Group Name" for the organisation, such as the missing tour operator or hotel.');
    checks.push('Choose the right "Contact Category", for example "Tour Operator" or "Hotel". If the club uses a site/location field or custom category, set it to the affected site before saving.');
    checks.push('Enter the available contact details in the "Contact" fields, such as title, first name, last name, email, telephone, and mobile.');
    checks.push('Use "Address Information" and "Club Details" only where the club has those details and they are needed for bookings or reporting.');
    checks.push('Set "Marketing Preferences" only where the contact has given the club permission.');
    checks.push('Click "Add", then return to "Contacts", use "View All" or the category filter, search the company name, and confirm the category count now matches the expected total.');
    checks.push('If the old record later appears, check which record has booking or revenue history before deleting or merging anything, and escalate if the club needs data restored.');
    return checks;
  }

  if (scenarios.contactsMissing) {
    checks.push(`For the missing contact issue (${contextLead(profile)}), start in "Contacts" and do not assume the record has been deleted until the filters have been checked.`);
    checks.push('Use "View All" or the full contacts list, then search for the company/person name and clear any category, site, or status filters that could hide it.');
    checks.push('Filter by the expected "Contact Categories" such as "Tour Operator" or "Hotel" and compare the count for each affected site.');
    checks.push('If the record is found under a different category/site, correct the contact record. If it is not found at all, check whether a user with access to "Contacts" or "Contact Categories" changed the record or category setup.');
    checks.push('For reporting or evidence, use contact-related reports such as contact details or revenue by tour operator/hotel where the club needs an export.');
    checks.push("Escalate with the site, category, missing record name, expected count, current count, and a screenshot of the filtered Contacts page.");
    return checks;
  }

  if (scenarios.guestReport) {
    checks.push("Yes, start from " + '"Reports"' + " for this. Set the " + '"Start Date"' + ' and "End Date" for the period first, then choose the closest booking/member report.');
    checks.push('Try "Booking Details" or "Full Booking Details" first because those reports are the closest match for bookings and player/guest detail over a date range.');
    checks.push('If the question is about whether bookings were paid or completed, also compare with "Booking / Payment Status".');
    checks.push('If the club needs member playing history rather than booking rows, check user/member report options such as "Users / Members Details" or member playing statistics.');
    checks.push('Use the report export/print option, such as "Print Report", then filter or total the guest rows for the member outside BRS if there is no single report that gives the exact guest count.');
    return checks;
  }

  if (scenarios.competitionPurse) {
    checks.push(`For the competition purse problem (${contextLead(profile)}), first confirm the active competition record is the one members are entering, especially if there is a cancelled competition with the same name.`);
    checks.push('In the member competition setup, check the entry fee, charge method, purse/wallet setting, member entry status, and whether the visible competition name includes "(Cancelled)".');
    checks.push('Check the affected member in "Competition Purse Transactions" or the member competition purse history for pending or already-processed charges that could reduce the usable balance.');
    checks.push('Open "System Configuration" and check the "Competition Purse Module" setting called "Minimum member competition purse balance". If the member would fall below that minimum after the entry fee, BRS can block the entry even when the visible purse balance is above the fee.');
    checks.push('Use "Process Competition Charges" only after the competition is over/closed and only for competitions set up to use "Competition Purse" or "Competition Wallet".');
    checks.push('If the checks do not explain it, escalate with the competition ID/name/date, whether there is a cancelled duplicate, the member entry fee, the member purse balance, relevant purse transactions, and the minimum balance setting.');
    return checks;
  }

  if (scenarios.flexibleMemberSync) {
    checks.push(`For the flexible member sync issue (${contextLead(profile)}), treat "Users" and "Memberships" as linked records, but do not assume the Memberships profile exists just because the user account exists.`);
    checks.push('Open "Users" first and find the BRS user record by name or member number. Check whether it is linked to a Memberships member profile.');
    checks.push('If the linked member profile exists, check its "Membership Type" and confirm it is a flexible/flexi type. In "Memberships" > "Membership Types", the type should have the "Flex" flag enabled.');
    checks.push('If the member is not appearing in the flexible membership dashboard/filter, check the Memberships dashboard "FLEX MEMBERS" view and the member filters after confirming the membership type.');
    checks.push('If the user exists but no linked member profile appears in "Memberships", check "Club Systems" mapping/import settings such as "Member Category Mapping" and preview/sync behaviour before creating a duplicate profile.');
    checks.push("Escalate with the user record, member number, linked profile status, membership type, and whether the Club Systems mapping preview shows the member.");
    return checks;
  }

  if (scenarios.competitionReconciliation) {
    checks.push(`For the competition reconciliation (${contextLead(profile)}), do not use the tee sheet/start sheet as the only source because withdrawn paid players may no longer appear there.`);
    checks.push('For open competition/card payments, use "Tools" > "BRS Payments" > "Transactions" to filter the event date/payment date and export or total the successful card payments.');
    checks.push('On the main "Reports" page, compare with payment reports such as "Revenue From Online Merchant Payments", "Payments by Payment Date", and "Payments by Transaction Date/Time & User".');
    checks.push('If it was a member competition using purse/wallet charging, compare the payment total with "Competition Purse Transactions" and "Competition Purse Summary" instead.');
    checks.push("Separately export/check the competition entry list, including withdrawn/cancelled entries if the competition page exposes them, then reconcile entries against the payment transaction export.");
    checks.push("Escalate if the payment report and entry list still do not match, including event name/date, payment route used, refund policy, withdrawn entries, and the transaction export.");
    return checks;
  }

  if (scenarios.bookingPaymentPayout) {
    checks.push(`For the booking payment question (${contextLead(profile)}), you cannot confirm the funds from the Timesheet balance alone.`);
    checks.push('Find the booking by reference/name/date/time, either from the Timesheet or booking search, then open "Booking Details".');
    checks.push('In "Booking Details", expand/check the "Payments" section and confirm the balance, payment status, payment method, and any refund status before promising a refund.');
    checks.push('Open "Tools" > "BRS Payments" > "Transactions" and search/filter by booking reference, name, date, and amount to confirm whether the card transaction succeeded or failed.');
    checks.push('Open "Tools" > "BRS Payments" > "Payouts" and filter the payout date range. Check "Amount", "Transfer Date", and "Status" to see whether a successful transaction has been included in a payout.');
    checks.push("If the transaction is successful but not in the expected payout, escalate with the booking reference, transaction status, payout date range, amount, and screenshots. Do not process the partial refund until the successful transaction is confirmed.");
    return checks;
  }

  if (scenarios.courseAvailability) {
    checks.push(`For the availability issue (${contextLead(profile)}), split the checks between course setup, member booking rules, and visitor/GolfNow availability.`);
    checks.push('Check the course/hole setup and the affected date first so BRS is not still presenting the course as an 18-hole product where 9-hole booking should be used.');
    checks.push('Open "Tools" > "Member Casual Booking Rules" and check the rule "Course", "Start Date", "End Date", "Start Time", "End Time", "Type" ("View" or "Book"), "Days Advance Booking", weekdays, player limits, and whether it applies to "All Membership Types", "Selected Membership Types ONLY", or "All Membership Types EXCEPT those selected".');
    checks.push('Check whether "Casual guests not allowed" or the players/guests controls would block the affected 5 Day member route even though the rate exists.');
    checks.push('Open "Tools" > "Green Fee Rates" for the same year/month/date and check "Category", "Sub Category", "Holes", "Start Date", "End Date", "Rates", "Mem Types", "Default", and "Global". Make sure there is a 9-hole row for the relevant member/visitor route, not only an 18-hole row.');
    checks.push('Open "Tools" > "Course Restriction" and check active and expired restrictions for the date/time. Review "Player Types", "Max Group Size", and "Message" because a restriction can hide or block members, visitors, or both.');
    checks.push('Check the visitor online booking / public visitor availability view for the same date and tee time, then check any GolfNow/Hot Deals inventory separately because external channel display can differ from member booking rules.');
    checks.push('Use one affected member type, one visitor channel, one date, and one tee time as the test case before changing wider availability. If BRS looks correct but GolfNow still shows 18 holes, escalate with screenshots of both BRS visitor availability and GolfNow.');
    return checks;
  }

  if (scenarios.greenFeeIssue) {
    checks.push(`For the green-fee/rate issue (${contextLead(profile)}), separate member online rates, visitor rates, and GolfNow-facing availability before changing prices.`);
    checks.push('Open "Tools" > "Green Fee Rates" and select the correct year/month or date period.');
    checks.push('Use "Add Green Fees" for a new rate or the "Actions" column to edit an existing rate.');
    checks.push('Check category/sub-category, holes, start date, end date, rate amount, member-type applicability, and whether the rate is default/global.');
    checks.push("After saving, test the matching staff Timesheet route and the online member/visitor route that the customer is using.");
    return checks;
  }

  if (scenarios.messagingIssue) {
    checks.push(`For the message/email issue (${contextLead(profile)}), first separate sending a message from exporting email-address data.`);
    checks.push('Use "Messages" when the club is trying to send an email, text/SMS, or Club Message to members or booking contacts.');
    checks.push('Check the recipient selection, membership type/group/date filters, message content/template, and whether the member/contact has a usable email/mobile value.');
    checks.push('Use message summary reports, such as "Email Message Summary Report", "Text Message Summary Report", or "Club Message Summary Report", when the club needs evidence of what was sent.');
    checks.push('If the user only needs email addresses in a spreadsheet, use "Reports" email-address exports instead of the Messages workflow.');
    return checks;
  }

  if (scenarios.usersIssue) {
    checks.push(`For the user/access issue (${contextLead(profile)}), start in "Users" rather than Memberships unless the issue is specifically the member profile.`);
    checks.push("Search for the user account, then check login status, email/username, role, user group, and permissions for the page or report they cannot access.");
    checks.push("If the user is a member-facing account, also check the linked Memberships profile, membership status, and membership type.");
    checks.push("If access looks correct but the user still cannot reach a page, collect the username/email, role/group, affected page, permission checked, and screenshot for escalation.");
    return checks;
  }

  if (scenarios.facilitiesIssue) {
    checks.push(`For the facility/resource issue (${contextLead(profile)}), keep facility or service reservations separate from normal tee-time bookings.`);
    checks.push('Use the relevant Facilities/Rooms/Resources area for room or facility reservations, and use Timesheet services only for booking add-ons such as buggies, caddies, trolleys, or club hire.');
    checks.push('For reporting, use facility or service reports such as "Room/Facility Detail Report", "Room/Facility Summary Report", "Buggy, Caddy and Club Hire Report", or "Players, Payment, Buggies and Caddies".');
    checks.push("Check date range, reservation type, resource/service type, booking status, and payment status before changing setup.");
    return checks;
  }

  if (scenarios.timesheetIssue) {
    checks.push(`For the booking/timesheet issue (${contextLead(profile)}), start from the specific date, course, tee time, and booking reference or player name.`);
    checks.push('Open the "Timesheet", set the correct date and course controls, then open the relevant tee time or "Booking Details".');
    checks.push("Check reservation type, player names, booking status, notes, services, green fees, payment status, and whether the booking was moved/cancelled.");
    checks.push('Use reports such as "Booking Details", "Full Booking Details", "Cancelled Bookings", or "Booking / Payment Status" when the club needs a date-range view rather than one booking.');
    return checks;
  }

  if (scenarios.reportingLookup) {
    checks.push(`For the report request (${contextLead(profile)}), start in "Reports" and choose the report by business object rather than keyword alone.`);
    checks.push('Set "Start Date" and "End Date", then choose the closest "Type of Report".');
    checks.push('Use booking reports for bookings/players, payment reports for payments/reconciliation, contact reports for companies/hotels/tour operators, and Memberships reports for member bills or wallet data.');
    checks.push('Use "Print Report" or the export/download option where the selected report provides it.');
    return checks;
  }

  if (!checks.length) {
    checks.push(`Start with the specific record and outcome in the question (${contextLead(profile)}), then choose the BRS area that owns that object.`);
    checks.push("Use the relevant BRS screen to check the live record, date range, status, filters, and audit/transaction information before changing setup.");
    checks.push("If the question asks for a report, use the report date controls and choose the report type that matches the business object rather than the first keyword match.");
    checks.push("Escalate with the exact record, date range, screenshots, expected result, actual result, and any error message if those checks do not explain it.");
  }
  return unique(checks, 8);
}

export function buildContextualRetrievalQueries(message = "", profile = buildQuestionContextProfile(message), intent = {}, evidencePlan = {}) {
  const scenarios = supportScenarioFlags(profile);
  const queries = [
    message,
    intent.topic,
    intent.task,
    intent.object,
    ...(intent.queryTerms || []),
    ...(evidencePlan.queryTerms || []),
  ];

  if (scenarios.prorataBilling || scenarios.membershipBilling) queries.push(
    'Memberships Billing/Payments CREATE BILLS Billing Reference Due Date SET BILL FILTERS Who To Bill subscriptions ADD ITEM Payment Schemes PREVIEW member profile Billing prorated bill',
  );
  if (scenarios.contactsMissing) queries.push(
    'Contacts View All View Contacts Search Contact Categories Tour Operator Hotel Company contact details revenue by tour operator hotel report',
  );
  if (scenarios.guestReport || (scenarios.reportingLookup && profile.areas?.includes("timesheet"))) queries.push(
    'Reports Start Date End Date Type of Report Booking Details Full Booking Details Booking / Payment Status Users / Members Details member playing statistics Print Report guests member bookings',
  );
  if (scenarios.competitionPurse) queries.push(
    'System Configuration Competition Purse Module Minimum member competition purse balance competition purse balance reminder topup Process Competition Charges Competition Purse Transactions Competition Purse Balance Competition Purse Summary member entry fee Charge Method',
  );
  if (scenarios.competitionReconciliation) queries.push(
    'BRS Payments Transactions Payouts Revenue From Online Merchant Payments Payments by Payment Date Payments by Transaction Date Time User Competition Purse Transactions Competition Purse Summary withdrawn competition entries tee sheet start sheet',
  );
  if (scenarios.flexibleMemberSync) queries.push(
    'Users Memberships linked member profile Membership Type Flex flexible membership Club Systems Member Category Mapping Preview FLEX MEMBERS Membership Types',
  );
  if (scenarios.bookingPaymentPayout) queries.push(
    'Booking Details Payments BRS Payments Transactions Payouts Amount Transfer Date Status Booking / Payment Status refund booking reference balance outstanding',
  );
  if (scenarios.courseAvailability || scenarios.greenFeeIssue) queries.push(
    'course hole setup 9 hole 18 hole GolfNow Hot Deals visitor online availability Member Casual Booking Rules Course Restriction Green Fee Rates Holes Player Types Max Group Size member online green fee rates',
  );
  if (scenarios.messagingIssue) queries.push('Messages email text SMS Club Messages Message Summary Report not receiving members user email addresses');
  if (scenarios.usersIssue) queries.push('Users permissions staff admin role login password linked member profile access user groups');
  if (scenarios.facilitiesIssue) queries.push('Facilities room resource facility reports buggy caddy club hire service reports reservations');
  if (scenarios.timesheetIssue) queries.push('Timesheet Booking Details reservation tee time move cancel no show booking status player notes services buggies caddies');
  if (scenarios.reportingLookup) queries.push('Reports export download csv spreadsheet filters columns Start Date End Date Type of Report Print Report');

  for (const area of profile.areas || []) queries.push(`${area} BRS support workflow reports settings transactions filters`);
  return unique(queries, 14);
}

export function buildContextualSupportFallbackReply({ message = "", profile = buildQuestionContextProfile(message), reason = "contextual-synthesis-required", evidenceEntries = [] } = {}) {
  const checks = issueSpecificChecks(profile, message);
  const liveLine = liveDataLine(profile);
  const title = (() => {
    const scenarios = supportScenarioFlags(profile);
    if (scenarios.prorataBilling) return "Raise the prorated membership bill";
    if (scenarios.contactsReAdd) return "Re-add the missing contact";
    if (scenarios.contactsMissing) return "Check the missing contact record";
    if (scenarios.guestReport) return "Find member guest bookings by date range";
    if (scenarios.competitionPurse) return "Check the competition purse block";
    if (scenarios.flexibleMemberSync) return "Check the linked flexible member record";
    if (scenarios.competitionReconciliation) return "Reconcile the competition payments";
    if (scenarios.bookingPaymentPayout) return "Check the booking payment and payout";
    if (scenarios.courseAvailability) return "Check member and visitor availability";
    if (profile.reportSignal) return "Choose the closest BRS report";
    return "Check the specific BRS record";
  })();

  return [
    title,
    "",
    liveLine,
    liveLine ? "" : null,
    ...checks.map((check, index) => `${index + 1}. ${check}`),
    "",
    lowConfidenceLine(profile),
    lowConfidenceLine(profile) ? "" : null,
    hasAny(profile.lower || "", LIVE_DATA_AREAS)
      ? "Escalate before changing payments, refunds, permissions, deleted records, or live availability if the checks do not explain the issue."
      : "Escalate if the checks do not resolve it.",
  ].filter((line) => line !== null && line !== undefined).join("\n");
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
