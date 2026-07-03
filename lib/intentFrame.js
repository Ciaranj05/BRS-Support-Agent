function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(lower = "", terms = []) {
  return terms.some((term) => lower.includes(term));
}

function firstLine(value = "") {
  return String(value || "").split(/\r?\n/).find(Boolean) || "";
}

const BUGGY_TERMS = ["buggy", "buggies", "golf cart", "golf carts"];
const BUGGY_CAPACITY_TERMS = ["amount", "number", "count", "available", "availability", "capacity", "how many", "stock"];
const BUGGY_PRICE_TERMS = ["price", "prices", "rate", "rates", "cost", "charge", "charges", "service rate", "hire price", "buggy hire", "hire charge"];
const GREEN_FEE_TERMS = ["green fee", "green fees", "green fee rate", "green fee rates", "visitor rate", "visitor rates"];
const ONLINE_TERMS = ["online", "club website", "website", "web booking", "online booking", "book themselves", "booking themselves"];
const VISITOR_SELF_BOOKING_TERMS = ["visitor", "visitors", "customer", "customers", "club website", "book themselves", "booking themselves", "tee time agent", "tee time agents", "tour operator", "tour operators"];
const GREEN_FEE_TIME_BAND_TERMS = ["twilight", "off peak", "off-peak", "peak", "time band", "timeband", "cheaper", "saving", "discount"];
const STAFF_MANUAL_RATE_TERMS = ["manual", "manually", "staff", "pro shop", "phone", "rings", "member", "member guest", "staff book", "staff books"];

export function buildIntentFrame(message = "") {
  const lower = normalise(message);
  const frame = {
    object: "unknown",
    action: "support-answer",
    channel: "unspecified",
    scope: "unknown",
    module: "core-brs",
    risk: "normal",
    confidence: 0.35,
    needsClarification: false,
    clarifyingQuestion: "",
    rejectedAdjacent: [],
    notes: [],
  };

  const buggyPriceIntent = hasAny(lower, BUGGY_TERMS) && hasAny(lower, BUGGY_PRICE_TERMS);
  const negatesCapacity = hasAny(lower, ["not the number", "not number", "not the amount", "not amount", "not availability", "not capacity"]);
  if (hasAny(lower, BUGGY_TERMS) && hasAny(lower, BUGGY_CAPACITY_TERMS) && !buggyPriceIntent && !negatesCapacity) {
    return {
      ...frame,
      object: "buggy",
      action: "change-capacity",
      channel: hasAny(lower, ONLINE_TERMS) ? "online-booking" : "staff-admin",
      scope: "system-configuration",
      risk: "adjacent-service-setup-mismatch",
      confidence: 0.88,
      rejectedAdjacent: ["Set Up Bookable Services"],
      notes: ["Changing the number of buggies available is a configuration/capacity task, not service creation."],
    };
  }

  if (lower.includes("club systems") && hasAny(lower, ["member", "members", "import", "sync", "synchronise", "synchronize", "upload"])) {
    return {
      ...frame,
      object: "member-data",
      action: hasAny(lower, ["map", "mapping"]) ? "map-records" : "import-or-sync",
      channel: "integration",
      scope: "optional-module",
      module: "club-systems",
      risk: "optional-integration-mismatch",
      confidence: 0.84,
      needsClarification: true,
      clarifyingQuestion: "Do you mean the Club Systems integration sync, or a CSV upload into BRS?",
      rejectedAdjacent: ["Upload Members or Contacts"],
      notes: ["Club Systems is an optional third-party integration; a CSV upload workflow is not a safe substitute."],
    };
  }

  if (hasAny(lower, GREEN_FEE_TERMS)) {
    const asksOnline = hasAny(lower, ONLINE_TERMS);
    const hasTimeBand = hasAny(lower, GREEN_FEE_TIME_BAND_TERMS);
    const explicitVisitor = hasAny(lower, VISITOR_SELF_BOOKING_TERMS);
    const explicitManual = hasAny(lower, STAFF_MANUAL_RATE_TERMS);
    const genericSetup = hasAny(lower, ["setup", "set up", "configure", "add", "create", "change", "edit"]);

    if (asksOnline && genericSetup && !hasTimeBand && !explicitVisitor && !explicitManual) {
      return {
        ...frame,
        object: "green-fee-rate",
        action: "configure",
        channel: "online-ambiguous",
        scope: "rate-configuration",
        risk: "channel-ambiguity",
        confidence: 0.82,
        needsClarification: true,
        clarifyingQuestion: "Are you setting staff-selected rates, or rates that visitors see when booking online?",
        rejectedAdjacent: ["Set Up Green Fee Rates"],
        notes: ["Tools > Green Fee Rates and Tools > Green Fee Rates for Visitors / Tee Time Agents serve different rate channels."],
      };
    }

    return {
      ...frame,
      object: "green-fee-rate",
      action: genericSetup ? "configure" : "support-answer",
      channel: explicitVisitor || hasTimeBand ? "visitor-self-booking" : explicitManual ? "staff-manual-booking" : "unspecified",
      scope: "rate-configuration",
      risk: "normal",
      confidence: 0.7,
    };
  }

  if (hasAny(lower, ["check in", "check-in", "checked in", "arrival", "arrived"]) && hasAny(lower, ["player", "players", "golfer", "golfers", "member", "visitor"])) {
    return {
      ...frame,
      object: "player-check-in",
      action: "record-arrival",
      channel: "staff-admin",
      scope: "timesheet",
      risk: "unsupported-workflow",
      confidence: 0.68,
      needsClarification: true,
      clarifyingQuestion: "Do you mean marking a booked player as arrived, or changing who is on the booking?",
      notes: ["The current approved guidance does not verify a complete player check-in workflow."],
    };
  }

  return frame;
}

export function preRouteClarificationPayload(message = "") {
  const frame = buildIntentFrame(message);

  if (frame.module === "club-systems" && frame.needsClarification) {
    return {
      reply: "Do you mean the Club Systems integration sync, or uploading a CSV into BRS? Club Systems is an optional third-party integration, and I cannot verify that sync workflow from the current demo system. If you mean the integration, this should be checked against the club's enabled modules or escalated to BRS Support.",
      escalationReady: true,
      topic: "memberships",
      options: [
        { label: "Club Systems sync", value: "Clarification answer: This is about syncing members from the Club Systems integration" },
        { label: "CSV upload", value: "Clarification answer: This is about uploading a CSV of members into BRS" },
        { label: "Not sure", value: "Clarification answer: I am not sure which member import route this is" },
      ],
      version: "intent-frame-clarification-v1",
      intentFrame: frame,
    };
  }

  if (frame.object === "green-fee-rate" && frame.channel === "online-ambiguous") {
    return {
      reply: "When you say online green fee rates, which route do you mean? Use Tools > Green Fee Rates for member rates and manual staff bookings. Use Tools > Green Fee Rates for Visitors / Tee Time Agents for rates visitors see when booking themselves online.",
      escalationReady: false,
      topic: "teesheet",
      options: [
        { label: "Visitor online rates", value: "Clarification answer: This is for rates visitors see when booking themselves online" },
        { label: "Staff/manual rates", value: "Clarification answer: This is for rates staff select when booking someone manually" },
        { label: "Not sure", value: "Clarification answer: I am not sure which green fee rate screen this is" },
      ],
      version: "intent-frame-clarification-v1",
      intentFrame: frame,
    };
  }

  if (frame.object === "player-check-in") {
    return {
      reply: "I cannot verify a complete player check-in workflow from the approved guidance yet. Do you mean marking a booked player as arrived on the Timesheet, or changing which player is on a booking? If you need the exact checked-in workflow now, this should be escalated to BRS Support.",
      escalationReady: true,
      topic: "teesheet",
      options: [
        { label: "Mark as arrived", value: "Clarification answer: This is about marking a booked player as arrived" },
        { label: "Change player", value: "Clarification answer: This is about changing who is on the booking" },
        { label: "Escalate", value: "Clarification answer: This needs BRS Support to verify the checked-in workflow" },
      ],
      version: "intent-frame-clarification-v1",
      intentFrame: frame,
    };
  }

  return null;
}

export function evaluateStaticAnswerAgainstIntent(message = "", reply = "") {
  const frame = buildIntentFrame(message);
  const title = firstLine(reply);
  if (!reply) return { allowed: true, frame, reason: "no-static-reply" };

  if (frame.object === "buggy" && frame.action === "change-capacity" && /set up bookable services/i.test(title)) {
    return { allowed: false, frame, reason: "buggy-capacity-is-not-service-setup" };
  }

  if (frame.module === "club-systems" && /upload members or contacts/i.test(title)) {
    return { allowed: false, frame, reason: "club-systems-is-not-csv-upload" };
  }

  if (frame.object === "green-fee-rate" && frame.channel === "online-ambiguous" && /set up green fee rates/i.test(title)) {
    return { allowed: false, frame, reason: "ambiguous-online-green-fee-rates" };
  }

  return { allowed: true, frame, reason: "intent-compatible" };
}

export function controlledBackendErrorPayload(message = "", error = null, context = {}) {
  const reviewNote = {
    reason: "backend-error",
    route: context.route || "chat",
    message: String(message || "").slice(0, 240),
    errorName: error?.name || null,
    errorMessage: error?.message || "Unknown error",
  };

  return {
    reply: "I could not complete this answer because something went wrong while checking the available BRS guidance. I have logged this for review. If this is urgent, please escalate it to BRS Support.",
    escalationReady: true,
    topic: "knowledge",
    options: [],
    version: "controlled-backend-error-v1",
    reviewNote,
  };
}
