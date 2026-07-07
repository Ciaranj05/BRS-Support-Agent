const TYPO_CORRECTIONS = [
  [/\bgreenfee\b/g, "green fee"],
  [/\bgreenfees\b/g, "green fees"],
  [/\bfeee\b/g, "fee"],
  [/\bpris\b/g, "price"],
  [/\bpric\b/g, "price"],
  [/\bvisotr\b/g, "visitor"],
  [/\bvistior\b/g, "visitor"],
  [/\bvistor\b/g, "visitor"],
  [/\bvisotrs\b/g, "visitors"],
  [/\bvisotors\b/g, "visitors"],
  [/\bopperator\b/g, "operator"],
  [/\bopperators\b/g, "operators"],
  [/\boprator\b/g, "operator"],
  [/\boprators\b/g, "operators"],
  [/\bagnt\b/g, "agent"],
  [/\bagnts\b/g, "agents"],
  [/\bchnage\b/g, "change"],
  [/\btwilite\b/g, "twilight"],
  [/\btcket\b/g, "ticket"],
  [/\bmemb\b/g, "member"],
  [/\bmembr\b/g, "member"],
];

function normalise(value = "") {
  let text = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of TYPO_CORRECTIONS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function hasAny(lower = "", terms = []) {
  return terms.some((term) => lower.includes(term));
}

function latestAssistantWithOptions(history = []) {
  return [...history].reverse().find((item) => item?.role === "assistant" && (item.options?.length || item.clarificationId || item.content)) || null;
}

function optionOrMessageText(message = "", history = []) {
  const assistant = latestAssistantWithOptions(history);
  return normalise([
    message,
    assistant?.content || "",
    assistant?.clarificationId || "",
  ].join(" "));
}

function payload({ reply, topic = "knowledge", options = [], escalationReady = false, intentContract = null }) {
  return {
    reply,
    escalationReady,
    topic,
    options,
    clarificationId: intentContract?.clarificationId || null,
    version: "domain-model-routing-v1",
    intentContract,
  };
}

export const BRS_DOMAIN_MODEL = {
  screens: {
    buggySystemConfiguration: {
      path: "Tools > System Configuration",
      section: "Buggy Booking",
      controls: [
        "Number of buggies available",
        "Time the buggy is required before tee time",
        "Time the buggy is required after finishing the round",
        "visitor/member buggy booking switches where enabled",
        "Update",
      ],
      sources: [
        "Approved local Tools knowledge: buggy-booking-availability",
        "BRS Help Center: Buggy Management",
        "BRS Help Center: Buggy Booking Duration",
      ],
    },
    greenFeeRates: {
      path: "Tools > Green Fee Rates",
      variants: ["Green Fee Rates v1", "Green Fee Rates v2"],
      uses: [
        "rates staff select from the green-fee/rate dropdown when making manual Timesheet bookings",
        "member and member-guest online rates",
        "member guest online charging where the club is on v2",
      ],
      fields: ["Category", "Sub Category", "Holes", "Start Date", "End Date", "Rates", "Mem Types", "Default", "Global", "Add Green Fees", "Actions"],
      sources: [
        "Approved local Tools knowledge: Green Fee Rates",
        "BRS Help Center release note: Version 14.40.0 mentions version 2 green fee rates tool",
      ],
    },
    visitorAgentGreenFeeRates: {
      path: "Tools > Green Fee Rates for Visitors / Tour Operators / Tee Time Agents",
      uses: [
        "online rates visitors see when booking through the club website",
        "tour operator rates",
        "tee time agent rates",
        "multi-year visitor/agent rates",
      ],
      fields: ["Channel", "Enabled Rates Only", "All Rates", "Include Years", "Include Months", "Include Days", "Course", "Start Date", "End Date", "Start Time", "End Time", "Green Fee Rate", "Type", "Holes", "Days Advance Booking", "Days of Week"],
      sources: [
        "BRS Help Center: Online Green Fee Rates - How do I add a Green Fee Rate for Visitors / Agents?",
        "BRS Help Center: Multi-Year Green Fee Rates",
        "Approved local Tools knowledge: Visitor, agent, tour-operator, and day ticket rates",
      ],
    },
    playerCheckIn: {
      primaryPath: "Timesheet",
      setupPath: "Tools > System Configuration",
      control: "Display Arrived / Check-In buttons",
      action: "Arrived / Check-In button beside the player on the Timesheet",
      sources: [
        "Approved local Tools knowledge: System Configuration help text",
      ],
    },
    clubSystems: {
      path: "Tools > Club Systems Member Preview / Club Systems Member Maps",
      moduleType: "optional third-party integration",
      sources: [
        "Approved local Tools knowledge: Club Systems member data preview/import and mapping",
      ],
    },
  },
};

function isBuggyCapacityQuestion(lower = normalise("")) {
  if (isBuggyServicePriceQuestion(lower)) return false;
  if (hasAny(lower, ["not the number", "not number", "not the amount", "not amount", "not availability", "not capacity"])) return false;
  return hasAny(lower, ["buggy", "buggies", "golf cart", "golf carts"]) &&
    hasAny(lower, ["amount", "number", "count", "available", "availability", "capacity", "how many", "stock", "have available"]);
}

function isNegatedBuggyServicePriceQuestion(lower = "") {
  return hasAny(lower, ["not asking about price", "not about price", "not the price", "not price", "not asking about rate", "not the rate", "not service rate"]);
}

function isBuggyServicePriceQuestion(lower = "") {
  if (isNegatedBuggyServicePriceQuestion(lower)) return false;
  return hasAny(lower, ["buggy", "buggies", "golf cart", "golf carts"]) &&
    hasAny(lower, ["price", "prices", "rate", "rates", "cost", "charge", "charges", "service rate", "hire price", "buggy hire", "hire charge"]);
}

function isCheckInQuestion(lower = "") {
  const arrivalSignal = hasAny(lower, ["check in", "check-in", "checked in", "mark arrived", "mark as arrived", "arrived"]);
  const personSignal = hasAny(lower, ["player", "players", "golfer", "golfers", "member", "visitor", "someone", "them", "person", "people"]);
  const controlSignal = hasAny(lower, ["button", "buttons", "timesheet", "tee sheet", "teesheet"]);
  return arrivalSignal && (personSignal || controlSignal);
}

function isClubSystemsQuestion(lower = "") {
  if (hasAny(lower, ["competition", "competitions", "comp", "golf genius", "leaderboard", "score", "scores", "scoring", "result", "results"])) return false;
  return lower.includes("club systems") && hasAny(lower, ["member", "members", "import", "sync", "synchronise", "synchronize", "upload"]);
}

function isDeletedBookingReferenceQuestion(lower = "") {
  const deletedSignal = hasAny(lower, ["deleted booking", "cancelled booking", "canceled booking", "removed booking", "deleted tee booking", "cancelled tee booking", "removed tee booking"]);
  const referenceSignal = hasAny(lower, ["reference", "info", "details", "find", "where", "report", "undo", "restore", "recover", "reinstate", "wrong booking"]);
  return deletedSignal && referenceSignal;
}

function isCourseWorkRestrictionQuestion(lower = "") {
  const workSignal = hasAny(lower, ["maintenance", "course maintenance", "course work", "greenkeeper", "greenkeepers", "hollow coring", "frost delay", "front nine", "back nine", "course closed", "course closure"]);
  const restrictionSignal = hasAny(lower, ["closed", "close", "block", "blocked", "restrict", "restriction", "no visitors", "online", "visitor booked", "booked anyway", "morning", "afternoon", "panicking", "8", "10"]);
  return workSignal && restrictionSignal;
}

function isPaymentOrRefundQuestion(lower = "") {
  return hasAny(lower, [
    "refund",
    "refunded",
    "money back",
    "paid",
    "payment",
    "payments",
    "partial",
    "transaction",
    "reduce from",
    "reduced from",
    "green fee back",
  ]);
}

function isPaidGreenFeeRateTriageQuestion(lower = "") {
  return hasAny(lower, ["green fee", "rate table", "rate setup"]) &&
    hasAny(lower, ["paid", "payment", "charged", "charge"]) &&
    hasAny(lower, ["wrong", "rate table", "rate setup", "check first", "where start", "pro says", "caller", "customer", "staff"]);
}

function isStaffSelectedGreenFeeQuestion(lower = "") {
  if (hasAny(lower, ["visitor", "visitors", "tour operator", "tee time agent"]) && hasAny(lower, [" vs ", "versus", "both", "separate", "split", "which page", "mixed"])) return false;
  return hasAny(lower, ["desk selects", "desk select", "rate the desk", "staff rate", "manual timesheet", "green fee dropdown", "phone booking", "pro shop dropdown"]) &&
    hasAny(lower, ["rate", "green fee", "reservation", "booking", "timesheet"]);
}

function isPolicyOrComparisonQuestion(lower = "") {
  const comparison = hasAny(lower, ["why", "higher", "lower", "more expensive", "cheaper", "compare", "compared", "than"]);
  const policy = hasAny(lower, ["policy", "terms", "conditions", "manager", "committee", "club-specific", "club specific"]);
  const rateSubject = hasAny(lower, ["member guest", "member guests", "guest rate", "green fee", "rate", "price", "charge"]);
  return rateSubject && (policy || comparison);
}

function isVisitorTimeBandPricingQuestion(lower = "") {
  return hasAny(lower, ["twilight", "off peak", "off-peak", "quiet afternoon", "dynamic pricing", "cheaper online", "cheaper later", "cheaper after", "discount"]) &&
    hasAny(lower, ["online", "visitor", "visitors", "green fee", "green fees", "rate", "rates", "price", "prices"]);
}

function isContactOrMessagingQuestion(lower = "") {
  const contactSignal = hasAny(lower, ["contact", "contacts", "company/group", "company record", "marketing", "consent", "gdpr"]);
  const deliverySignal = hasAny(lower, ["email", "emails", "mail", "message", "messages", "sms", "text", "never gets", "not receiving", "doesn't get", "doesnt get", "suppressed", "spam", "junk"]);
  return contactSignal || deliverySignal;
}

function shouldSkipGreenFeeDomainRoute(lower = "") {
  return hasAny(lower, ["competition", "competitions", "open comp", "open comps", "comp ", "purse", "competition purse"]) ||
    isPaymentOrRefundQuestion(lower) ||
    isPolicyOrComparisonQuestion(lower) ||
    isVisitorTimeBandPricingQuestion(lower) ||
    isContactOrMessagingQuestion(lower);
}

function greenFeeChannel(lower = "") {
  if (isDayTicketQuestion(lower)) return "day-ticket";

  const hasRateTerm = /\b(green fees?|rates?|prices?|pricing|charges?|charging|costs?)\b/.test(lower);
  const routeSplitSignal = hasAny(lower, [
    "pro shop dropdown",
    "staff dropdown",
    "timesheet dropdown",
    "booking themselves",
    "book themselves",
    "web booking",
    "club website",
    "member guest",
    "member guests",
    "tour operator",
    "tour operators",
    "tee time agent",
    "tee time agents",
    "golf package",
    "day of week",
    "days of week",
  ]);
  const explicitVisitorAgentSignal = hasAny(lower, [
    "visitor",
    "visitors",
    "customer",
    "customers",
    "tour operator",
    "tour operators",
    "tee time agent",
    "tee time agents",
    "club website",
    "web booking",
    "website",
    "visitors see",
    "customers see",
    "golf package",
    "package rate",
  ]);
  const explicitStaffSignal = hasAny(lower, ["manual", "manually", "staff", "desk", "pro shop", "phone", "rings", "dropdown", "select from", "timesheet"]);
  const explicitMemberSignal = hasAny(lower, ["member", "members", "member guest", "member guests", "members guest", "members guests"]);
  if (!hasRateTerm && !routeSplitSignal) return "";
  if (shouldSkipGreenFeeDomainRoute(lower)) return "";

  if (explicitStaffSignal && hasAny(lower, ["not online", "not online visitor", "not visitor", "phone booking", "manual booking"])) return "staff-manual";
  if (explicitMemberSignal && !explicitVisitorAgentSignal && hasAny(lower, ["not visitor", "not visitors", "member guest", "member guests", "members guest", "members guests"])) {
    if (hasAny(lower, ["member guest", "member guests", "members guest", "members guests"])) return "member-guest-online";
    return "member-online";
  }
  const audienceCount = [explicitStaffSignal, explicitMemberSignal, explicitVisitorAgentSignal].filter(Boolean).length;
  if (audienceCount > 1 && hasAny(lower, [" vs ", "versus", "both", "separate", "split", "mixed", "which page", "disagree", "member, visitor", "visitor and tee time agent", "member guest price and tour operator"])) return "split";
  if (hasAny(lower, ["member guest", "member guests", "members guest", "members guests"])) return "member-guest-online";
  if (hasAny(lower, ["member", "members"]) && hasAny(lower, ["online", "website", "app", "web", "book themselves", "booking themselves"])) return "member-online";
  if (explicitVisitorAgentSignal || (hasAny(lower, ["website", "web", "8am", "10am", "weekends only", "fridays", "saturdays", "sundays", "not showing", "no price", "one course"]) && !explicitStaffSignal && !explicitMemberSignal)) return "visitor-agent-online";
  if (hasAny(lower, ["member guest", "member guests", "members guest", "members guests"])) return "member-guest-online";
  if (hasAny(lower, ["manual", "manually", "staff", "pro shop", "phone", "rings", "dropdown", "select from", "timesheet"])) return "staff-manual";
  if (hasAny(lower, ["online", "website", "app", "book themselves", "booking themselves"])) return "ambiguous-online";
  return "";
}

function isDayTicketQuestion(lower = "") {
  return hasAny(lower, ["day ticket", "day tickets"]) ||
    (hasAny(lower, ["two rounds", "2 rounds", "same day"]) && hasAny(lower, ["visitor", "visitors", "green fee", "rate", "price"]));
}

function buggyCapacityAnswer() {
  const screen = BRS_DOMAIN_MODEL.screens.buggySystemConfiguration;
  return payload({
    topic: "admin-setup",
    intentContract: {
      object: "buggy",
      action: "change-capacity",
      requiredFields: ["Number of buggies available", "Update"],
      sourceBasis: screen.sources,
    },
    reply: [
      "Change the Number of Buggies Available",
      "",
      `1. Go to ${screen.path}.`,
      `2. Open or find the ${screen.section} settings.`,
      "3. Change the \"Number of buggies available\" value to the new total the club wants to make available.",
      "4. Check the related buggy settings before saving, especially how long a buggy is needed before tee time and after the round, and whether online buggy booking is enabled for visitors or members.",
      "5. Click \"Update\" on System Configuration.",
      "6. Reopen the Timesheet and test a time where buggies should be available to confirm the new availability is reflected.",
      "",
      "This is different from Tools > Services. Services controls bookable extras and prices; the buggy quantity/availability limit is a System Configuration setting.",
    ].join("\n"),
  });
}

function buggyServicePriceAnswer() {
  return payload({
    topic: "admin-setup",
    intentContract: {
      object: "buggy-service",
      action: "change-price",
      requiredFields: ["Service Type", "Service Name", "Service Rate", "Add"],
      sourceBasis: [
        "Approved local Tools knowledge: Services",
        "Approved local Tools knowledge: buggy-booking-availability",
      ],
    },
    reply: [
      "Change Buggy Hire Price",
      "",
      "1. Go to Tools > Services.",
      "2. Use \"Select a Year\" to choose the year you are changing.",
      "3. Find the Buggy service row, or create a new service with \"Service Type\" set to Buggy.",
      "4. Set \"Service Name\" so staff can recognise the buggy hire option.",
      "5. Set \"Service Rate\" to the price staff should charge when adding the buggy service.",
      "6. Click \"Add\" for a new service, or use the row's \"Actions\" control to save an existing buggy service change.",
      "7. Open a test booking afterward and check the buggy service can be selected with the correct price.",
      "",
      "Use Tools > System Configuration only for buggy quantity, availability, and online buggy booking settings. Tools > Services controls bookable extras and prices.",
    ].join("\n"),
  });
}

function clubSystemsClarification() {
  return payload({
    topic: "memberships",
    escalationReady: true,
    intentContract: {
      clarificationId: "club-systems-member-import",
      object: "member-data",
      action: "choose-import-route",
      module: "club-systems",
      sourceBasis: BRS_DOMAIN_MODEL.screens.clubSystems.sources,
    },
    reply: "Do you mean syncing members from the Club Systems integration, or uploading a CSV file into BRS? Club Systems is an optional third-party integration, so the exact sync screens depend on whether that module is enabled for the club.",
    options: [
      { label: "Club Systems sync", value: "Clarification answer: Club Systems member sync", clarificationId: "club-systems-member-import" },
      { label: "CSV upload", value: "Clarification answer: CSV member upload", clarificationId: "club-systems-member-import" },
      { label: "I'm not sure / type details", value: "Clarification answer: I am not sure which member import route this is", clarificationId: "club-systems-member-import" },
    ],
  });
}

function clubSystemsSyncAnswer() {
  const screen = BRS_DOMAIN_MODEL.screens.clubSystems;
  return payload({
    topic: "memberships",
    escalationReady: true,
    intentContract: {
      object: "member-data",
      action: "club-systems-sync",
      module: "club-systems",
      sourceBasis: screen.sources,
    },
    reply: [
      "Club Systems Member Sync",
      "",
      "It sounds like you mean syncing/importing member data from the Club Systems integration, not uploading a CSV into BRS.",
      "",
      `Club Systems is an optional third-party integration. If it is enabled for the club, use the Club Systems member preview/mapping tools, not Tools > Upload Members and Contacts.`,
      "",
      "Safe checks:",
      "1. Confirm the club has the Club Systems integration enabled.",
      "2. Go to Tools and look for \"Club Systems Member Preview\" or \"Club Systems Member Maps\".",
      "3. Use the preview/mapping route to check what Club Systems data will match or update in BRS before applying any changes.",
      "4. Do not use the CSV upload workflow unless the club is manually importing a file rather than syncing from Club Systems.",
      "5. If the Club Systems tools are not visible, escalate to BRS Support with the club name and whether the integration should be enabled.",
    ].join("\n"),
  });
}

function greenFeeClarification() {
  return payload({
    topic: "teesheet",
    intentContract: {
      clarificationId: "green-fee-rate-channel",
      object: "green-fee-rate",
      action: "choose-rate-channel",
      sourceBasis: [
        ...BRS_DOMAIN_MODEL.screens.greenFeeRates.sources,
        ...BRS_DOMAIN_MODEL.screens.visitorAgentGreenFeeRates.sources,
      ],
    },
    reply: [
      "Which online green fee rate do you mean?",
      "",
      "1. Use Tools > Green Fee Rates for staff-selected manual Timesheet rates, and for member/member-guest online rates.",
      "2. Use Tools > Green Fee Rates for Visitors / Tour Operators / Tee Time Agents for visitor, tour-operator, and tee-time-agent online rates.",
      "",
      "Choose the closest route and I can give the setup steps.",
    ].join("\n"),
    options: [
      { label: "Visitors / agents online", value: "Clarification answer: Visitor and tee time agent online green fee rates", clarificationId: "green-fee-rate-channel" },
      { label: "Members / member guests", value: "Clarification answer: Member or member guest online green fee rates", clarificationId: "green-fee-rate-channel" },
      { label: "Staff/manual dropdown", value: "Clarification answer: Staff manual Timesheet green fee dropdown rates", clarificationId: "green-fee-rate-channel" },
      { label: "I'm not sure / type details", value: "Clarification answer: I am not sure which green fee rate route this is", clarificationId: "green-fee-rate-channel" },
    ],
  });
}

function visitorAgentGreenFeeAnswer() {
  const screen = BRS_DOMAIN_MODEL.screens.visitorAgentGreenFeeRates;
  return payload({
    topic: "teesheet",
    intentContract: {
      object: "green-fee-rate",
      action: "configure",
      channel: "visitor-agent-online",
      requiredFields: ["Course", "Start Date", "End Date", "Start Time", "End Time", "Green Fee Rate", "Channel"],
      sourceBasis: screen.sources,
    },
    reply: [
      "Set Visitor / Agent Online Green Fee Rates",
      "",
      `1. Go to ${screen.path}.`,
      "2. Use the filters if needed, such as \"Channel\", \"Enabled Rates Only\" or \"All Rates\", \"Include Years\", \"Include Months\", and \"Include Days\".",
      "3. Add or edit the rate for the correct Course, Start Date, End Date, Start Time, End Time, holes, and channel.",
      "4. Enter the online \"Green Fee Rate\" and set Type, such as Golf Only or Golf / Package.",
      "5. For package rates, check Golf Package Name, Package Description, and Package Icons as well as the price.",
      "6. Set the booking availability controls, such as Club Website, Tee Time Agents, Tour Operators, Days Advance Booking, and Days of Week.",
      "7. Save the rate and test the visitor or agent booking flow for the same date/time/channel.",
      "",
      "Use this route for visitors, tour operators, and tee time agents. Do not use it for staff-selected manual Timesheet rates or member/member-guest online rates.",
    ].join("\n"),
  });
}

function greenFeeRouteSplitAnswer() {
  return payload({
    topic: "teesheet",
    intentContract: {
      object: "green-fee-rate",
      action: "choose-rate-channel",
      sourceBasis: [
        ...BRS_DOMAIN_MODEL.screens.greenFeeRates.sources,
        ...BRS_DOMAIN_MODEL.screens.visitorAgentGreenFeeRates.sources,
      ],
    },
    reply: [
      "Choose the Correct Green Fee Rate Route",
      "",
      "1. Use Tools > Green Fee Rates for staff-selected manual Timesheet rates, such as the rate the pro shop selects from the Timesheet or Booking Details dropdown.",
      "2. Use Tools > Green Fee Rates for member or member-guest online rates where that setup is enabled. For member guests online, check whether the Green Fee Rates v2 controls are available.",
      "3. Use Tools > Green Fee Rates for Visitors / Tour Operators / Tee Time Agents for visitor club-website rates, tour operator rates, and tee time agent rates.",
      "4. Keep these routes separate: changing a staff/manual rate does not necessarily change the visitor website, tour-operator, or tee-time-agent price.",
      "5. After changing the right route, test the matching flow: staff Timesheet booking, member/member-guest online booking, visitor club website, tour operator, or tee time agent channel.",
    ].join("\n"),
  });
}

function dayTicketGreenFeeAnswer() {
  return payload({
    topic: "teesheet",
    intentContract: {
      object: "day-ticket-rate",
      action: "configure",
      requiredFields: ["Course 1", "Course 2", "Green Fee Rate for 1 Player", "Green Fee Rate for 2 Players", "Green Fee Rate for 3 Players", "Green Fee Rate for 4 Players"],
      sourceBasis: [
        "Approved local Tools knowledge: Day Ticket Rates for Visitors",
      ],
    },
    reply: [
      "Set Day Ticket Rates for Visitors",
      "",
      "1. Go to Tools.",
      "2. Open Day Ticket Rates for Visitors.",
      "3. Set Course 1 and Course 2 for the two-round same-day visitor product.",
      "4. Set Start Date and End Date.",
      "5. Enter Green Fee Rate for 1 Player, 2 Players, 3 Players, and 4 Players.",
      "6. Set Type, Days Advance Booking, and Days of Week.",
      "7. Click Add, then check the visitor online booking flow.",
      "",
      "Check: The demo page currently says this feature is not enabled and to contact the Support Team to enable it.",
    ].join("\n"),
  });
}

function paidGreenFeeRateTriageAnswer() {
  return payload({
    topic: "teesheet",
    intentContract: {
      object: "paid-green-fee-rate",
      action: "triage-rate-and-payment",
      requiredFields: ["Booking Details", "Tools > Green Fee Rates", "Tools > Green Fee Rates for Visitors / Tour Operators / Tee Time Agents", "BRS Payments transaction"],
      sourceBasis: [
        "Approved local Tools knowledge: Green Fee Rates",
        "Approved local Tools knowledge: Visitor and agent green fee rates",
        "Approved local Payments knowledge: online booking refunds and BRS Payments transactions",
      ],
    },
    reply: [
      "Check a Paid Green Fee Against the Rate Setup",
      "",
      "1. Start with the booking, not the rate table. Open the Timesheet or Search, then open Booking Details for the exact customer, date, course, tee time, player count, and payment status.",
      "2. Confirm what was actually paid and whether the payment sits in Booking Details or Tools > BRS Payments > Transactions before discussing any refund or correction.",
      "3. Then check the rate route that should have produced the amount: Tools > Green Fee Rates for staff/manual Timesheet rates and member/member-guest online rates.",
      "4. For visitor club-website, tour-operator, or tee-time-agent online rates, check Tools > Green Fee Rates for Visitors / Tour Operators / Tee Time Agents.",
      "5. Compare course, date range, start/end time, days of week, holes, channel, package/type, and player/audience before changing any setup.",
      "6. Keep the checks separate: changing a future rate table does not automatically refund a paid booking. If money needs to be returned, follow the approved BRS Payments or booking refund workflow after the club confirms the amount.",
    ].join("\n"),
  });
}

function staffManualGreenFeeAnswer(channel = "staff-manual") {
  const screen = BRS_DOMAIN_MODEL.screens.greenFeeRates;
  const memberGuestNote = channel === "member-guest-online"
    ? "For member guests booking online, the club needs to be using Green Fee Rates v2. If the v2 controls are not visible, escalate before promising the setup is available."
    : channel === "member-online"
      ? "Use this route for members booking online where the club's Green Fee Rates setup controls member online charging. Keep it separate from visitor, tour-operator, and tee-time-agent rates."
    : "These rates are also the place to check member/member-guest online rates where that setup is enabled.";
  return payload({
    topic: "teesheet",
    intentContract: {
      object: "green-fee-rate",
      action: "configure",
      channel,
      requiredFields: ["Category", "Sub Category", "Holes", "Start Date", "End Date", "Rates", "Mem Types", "Add Green Fees"],
      sourceBasis: screen.sources,
    },
    reply: [
      channel === "member-guest-online" ? "Set Member Guest Online Green Fee Rates" : channel === "member-online" ? "Set Member Online Green Fee Rates" : "Set Staff-Selected Green Fee Rates",
      "",
      `1. Go to ${screen.path}.`,
      "2. Select the correct year and month tab for the period you are changing.",
      "3. Add a new rate with \"Add Green Fees\", or use the \"Actions\" column to edit an existing rate.",
      "4. Set the category/sub-category, holes, start date, end date, rate amount, and member-type applicability.",
      "5. Check whether the rate should be default/global before saving.",
      "6. Save the change, then test the matching staff Timesheet booking or member/member-guest online booking route.",
      "",
      memberGuestNote,
    ].join("\n"),
  });
}

function checkInPlayerAnswer() {
  const screen = BRS_DOMAIN_MODEL.screens.playerCheckIn;
  return payload({
    topic: "teesheet",
    intentContract: {
      object: "player-check-in",
      action: "record-arrival",
      requiredFields: [screen.control, "Arrived / Check-In button"],
      sourceBasis: screen.sources,
    },
    reply: [
      "Check In a Player",
      "",
      "1. Open the Timesheet for the correct date and course.",
      "2. Find the booking and the player you want to mark as arrived.",
      "3. Click the \"Arrived\" / \"Check-In\" button beside that player on the Timesheet.",
      "4. Check that the player's status changes on the Timesheet before moving on.",
      "",
      `If the button is not visible, an admin should go to ${screen.setupPath}, find \"${screen.control}\", enable it if the club wants to use check-in buttons, and click \"Update\". Then reopen the Timesheet and check the button appears beside players.`,
      "",
      "Use this for marking arrival/check-in only. If you need to change who is on the booking, use the player edit/add/remove workflow instead.",
    ].join("\n"),
  });
}

function deletedBookingReferenceAnswer() {
  return payload({
    topic: "teesheet",
    intentContract: {
      object: "deleted-tee-time-booking",
      action: "find-reference-details",
      requiredFields: ["Reports", "Cancelled Bookings", "date range", "customer/player reference"],
      sourceBasis: [
        "Approved local Timesheet knowledge: cancelled bookings report",
        "Approved local Timesheet knowledge: deleted booking recovery boundary",
      ],
    },
    reply: [
      "Find Details for a Deleted or Cancelled Booking",
      "",
      "BRS does not provide a simple undo/restore button for a deleted tee-time booking.",
      "1. Open Reports.",
      "2. Use the Cancelled Bookings report to look for the deleted/cancelled booking details.",
      "3. Search by the date range, customer/player name, booking reference, or other details staff have.",
      "4. Use the report details only as a reference before recreating anything manually.",
      "5. If the original booking had a payment or services attached, check payment records and service availability before recreating or refunding.",
      "",
      "If the wrong paid booking was deleted, confirm the customer, date, course, tee time, payment status, and refund position before making another change.",
    ].join("\n"),
  });
}

function courseWorkRestrictionAnswer() {
  return payload({
    topic: "teesheet",
    intentContract: {
      object: "course-work-tee-times",
      action: "restrict-availability",
      requiredFields: ["Timesheet", "Tools > Course Restrictions", "Start Date", "End Date", "Start Time", "End Time", "Player Types"],
      sourceBasis: [
        "Approved local Timesheet knowledge: course work closures",
        "Approved local Tools knowledge: Course Restrictions",
      ],
    },
    reply: [
      "Close or Restrict Tee Times for Course Work",
      "",
      "1. First decide whether the club is closing specific tee times on the Timesheet or applying a booking rule for a date/time range.",
      "2. Use Course Restrictions when the rule limits who can book, when they can book, player type, or group size for a date/time range.",
      "3. Open Tools, then open Course Restrictions.",
      "4. Set the course, Start Date, End Date, Start Time, and End Time for the affected front nine/back nine or time range, such as 8 to 10.",
      "5. Set Player Types so the restriction applies to visitors, members, or both as required.",
      "6. Do not use Booking Statuses for this; booking statuses describe booking records, not course-work availability.",
      "7. If existing bookings already sit inside the affected time range, review those bookings and payment status before changing or deleting anything.",
      "8. Check the Timesheet and the visitor-facing online booking view after saving.",
      "",
      "For a one-off internal block, a Closed or Course Maintenance reservation type on the Timesheet may be enough. For visitor online access rules, check Course Restrictions.",
    ].join("\n"),
  });
}

function notSureGreenFeePrompt() {
  return payload({
    topic: "teesheet",
    intentContract: { object: "green-fee-rate", action: "collect-channel-detail", clarificationId: "green-fee-rate-channel" },
    reply: "No problem. Tell me who will see or select the rate: staff booking manually on the Timesheet, members/member guests booking online, or visitors/tour operators/tee time agents booking online.",
    options: [],
  });
}

function notSureClubSystemsPrompt() {
  return payload({
    topic: "memberships",
    escalationReady: true,
    intentContract: { object: "member-data", action: "collect-integration-detail", clarificationId: "club-systems-member-import" },
    reply: "No problem. Tell me whether the club is trying to sync members from Club Systems, upload a spreadsheet/CSV, or check whether the Club Systems module is enabled.",
    options: [],
  });
}

export function resolveDomainClarificationPayload(message = "", history = []) {
  const lower = normalise(message);
  const context = optionOrMessageText(message, history);
  const assistant = latestAssistantWithOptions(history);
  const assistantText = normalise(assistant?.content || "");

  if (context.includes("club-systems-member-import") || assistantText.includes("club systems integration")) {
    if (hasAny(lower, ["csv", "spreadsheet", "file upload", "uploading a csv", "member upload"])) return null;
    if (hasAny(lower, ["club systems sync", "club systems member sync", "syncing members", "integration sync"]) || context.includes("club systems member sync")) return clubSystemsSyncAnswer();
    if (hasAny(lower, ["not sure", "type details"]) || context.includes("not sure which member import")) return notSureClubSystemsPrompt();
  }

  if (context.includes("green-fee-rate-channel") || assistantText.includes("which online green fee rate")) {
    if (hasAny(lower, ["visitor", "visitors", "agents", "tee time agent", "tour operator", "customer", "customers"]) || context.includes("visitor and tee time agent")) return visitorAgentGreenFeeAnswer();
    if (hasAny(lower, ["member guest", "member guests", "members guest", "members guests"])) return staffManualGreenFeeAnswer("member-guest-online");
    if (hasAny(lower, ["member", "members"])) return staffManualGreenFeeAnswer("member-online");
    if (hasAny(lower, ["staff", "manual", "dropdown", "timesheet", "pro shop"])) return staffManualGreenFeeAnswer("staff-manual");
    if (hasAny(lower, ["not sure", "type details"]) || context.includes("not sure which green fee")) return notSureGreenFeePrompt();
  }

  return null;
}

export function domainSpecificPreRoutePayload(message = "", history = []) {
  const clarification = resolveDomainClarificationPayload(message, history);
  if (clarification) return clarification;

  const lower = normalise(message);
  if (isBuggyServicePriceQuestion(lower)) return buggyServicePriceAnswer();
  if (isBuggyCapacityQuestion(lower)) return buggyCapacityAnswer();
  if (isCheckInQuestion(lower)) return checkInPlayerAnswer();
  if (isDeletedBookingReferenceQuestion(lower)) return deletedBookingReferenceAnswer();
  if (isCourseWorkRestrictionQuestion(lower)) return courseWorkRestrictionAnswer();
  if (isClubSystemsQuestion(lower)) return clubSystemsClarification();
  if (isPaidGreenFeeRateTriageQuestion(lower)) return paidGreenFeeRateTriageAnswer();
  if (isStaffSelectedGreenFeeQuestion(lower)) return staffManualGreenFeeAnswer("staff-manual");
  if (isDayTicketQuestion(lower)) return dayTicketGreenFeeAnswer();

  const channel = greenFeeChannel(lower);
  if (channel === "day-ticket") return dayTicketGreenFeeAnswer();
  if (channel === "ambiguous-online") return greenFeeClarification();
  if (channel === "split") return greenFeeRouteSplitAnswer();
  if (channel === "visitor-agent-online") return visitorAgentGreenFeeAnswer();
  if (channel === "member-guest-online" || channel === "member-online" || channel === "staff-manual") return staffManualGreenFeeAnswer(channel);

  return null;
}

export function applyDomainAnswerContract(payloadValue = {}, message = "", history = []) {
  if (!payloadValue || typeof payloadValue !== "object" || typeof payloadValue.reply !== "string") return payloadValue;
  const lower = normalise(message);
  const reply = normalise(payloadValue.reply);

  if (isBuggyServicePriceQuestion(lower) && (reply.includes("number of buggies available") || !reply.includes("service rate"))) {
    const replacement = buggyServicePriceAnswer();
    return { ...replacement, domainContract: { blocked: true, reason: "buggy-price-answer-confused-with-capacity", originalVersion: payloadValue.version || null } };
  }

  if (isBuggyCapacityQuestion(lower) && (!reply.includes("number of buggies available") || !reply.includes("update"))) {
    const replacement = buggyCapacityAnswer();
    return { ...replacement, domainContract: { blocked: true, reason: "buggy-capacity-answer-missing-specific-field", originalVersion: payloadValue.version || null } };
  }

  if (isCheckInQuestion(lower) && (reply.includes("cannot verify") || reply.includes("complete player check-in workflow") || !hasAny(reply, ["arrived", "check-in", "check in"]))) {
    const replacement = checkInPlayerAnswer();
    return { ...replacement, domainContract: { blocked: true, reason: "check-in-answer-missing-timesheet-arrived-action", originalVersion: payloadValue.version || null } };
  }

  if (greenFeeChannel(lower) === "ambiguous-online" && !payloadValue.clarificationId && !reply.includes("which online green fee rate")) {
    const replacement = greenFeeClarification();
    return { ...replacement, domainContract: { blocked: true, reason: "green-fee-ambiguous-channel-not-clarified", originalVersion: payloadValue.version || null } };
  }

  if (isClubSystemsQuestion(lower) && reply.includes("upload members or contacts")) {
    const replacement = clubSystemsClarification();
    return { ...replacement, domainContract: { blocked: true, reason: "club-systems-answer-confused-with-csv-upload", originalVersion: payloadValue.version || null } };
  }

  return payloadValue;
}

export function freeTextClarificationHint(label = "", value = "", assistantText = "") {
  const lower = normalise(`${label} ${value} ${assistantText}`);
  if (lower.includes("green fee")) {
    return "No problem. Tell me who will see or select the rate: staff booking manually on the Timesheet, members/member guests booking online, or visitors/tour operators/tee time agents booking online.";
  }
  if (lower.includes("club systems")) {
    return "No problem. Tell me whether the club is trying to sync members from Club Systems, upload a spreadsheet/CSV, or check whether the Club Systems module is enabled.";
  }
  if (lower.includes("check-in") || lower.includes("check in") || lower.includes("arrived")) {
    return "No problem. Tell me whether you are marking the player as arrived, changing the player on the booking, or trying to enable the check-in buttons.";
  }
  return "";
}
