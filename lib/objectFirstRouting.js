const APP_VERSION = "object-first-routing-v1";

function normalise(text = "") {
  return String(text || "").toLowerCase();
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function hasPaidWord(lower) {
  return /\bpaid\b/.test(lower);
}

function hasPaymentIntent(lower) {
  return hasPaidWord(lower) || hasAny(lower, ["payment", "payments", "refund", "transaction", "payout", "vat", "bank statement", "money taken"]);
}

function isConceptualQuestion(lower = "") {
  if (/\b(what is|what are|what does .+ mean|explain|meaning of|definition of|tell me about)\b/.test(lower)) return true;
  if (/\b(what'?s|whats)\b.*\b(difference|different)\b/.test(lower)) return true;
  if (/\b(difference between|different from|versus|vs\.?)\b/.test(lower)) return true;
  return /\b(why would|why should|why do i need|why use|what .+ used for|purpose of|when would .+ use|when should .+ use)\b/.test(lower);
}

export function hasMembershipOwnedObject(lower = "") {
  return hasAny(lower, [
    "member", "members", "membership", "memberships",
    "member profile", "membership type", "member type",
    "subscription", "subscriptions",
    "member bill", "membership bill", "bill", "bills", "billing",
    "member invoice", "membership invoice", "invoice", "invoices",
    "wallet", "account balance", "credit balance",
    "flexi", "flexible",
    "payment scheme", "payment schemes", "payment plan", "payment plans",
    "instalment", "instalments", "installment", "installments",
    "scheduled payment", "scheduled payments",
    "unpaid", "outstanding balance",
  ]);
}

function hasMembershipObject(lower) {
  return hasMembershipOwnedObject(lower);
}

function hasBookingObject(lower) {
  return hasAny(lower, ["booking", "tee time", "tee sheet", "teesheet", "timesheet", "golfer", "visitor booking", "green fee"]);
}

function hasReportIntent(lower) {
  return hasAny(lower, ["report", "reports", "list", "show", "shows", "find", "export", "download", "breakdown"]);
}

function hasCompetitionObject(lower) {
  return hasAny(lower, ["competition", "competitions", "open competition", "entry sheet", "draw", "purse", "compitition", "compettion", "comp"]);
}

function wantsChargeOrPayment(lower) {
  return hasAny(lower, ["charge", "charging", "charges", "chargs", "fee", "fees", "cost", "price", "payment", "pay", "paid", "purse", "refund", "money", "muny"]);
}

function hasActionIntent(lower) {
  return hasAny(lower, [
    "create", "add", "new", "generate", "raise", "make", "change", "edit", "amend", "set up", "setup", "manage",
    "apply", "attach", "link", "select", "assign", "use", "put",
    "cancel", "remove", "delete", "find", "show", "list", "export", "download", "fix", "refund", "reverse", "top up",
  ]);
}

function hasMemberAudience(lower) {
  return hasAny(lower, ["member", "members", "member's", "members'"]);
}

function hasVisitorAudience(lower) {
  return hasAny(lower, ["visitor", "visitors", "visotr", "guest", "guests", "open competition", "open comp", "public", "non-member", "non member"]);
}

function response(reply, topic, options = [], routeStrength = "specific") {
  return { reply, escalationReady: false, topic, options, routeStrength, version: APP_VERSION };
}

function numberedAnswer(title, steps, extra = "") {
  return [
    title,
    "",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    extra ? `\n${extra}` : "",
  ].join("\n").trim();
}

function competitionReply(lower) {
  if (!hasCompetitionObject(lower)) return null;
  const entryManagement = hasAny(lower, [
    "entry", "entery", "entrant", "player", "change", "cancel", "remove", "amend", "withdraw", "withdrew",
    "draw", "draw sheet", "start sheet", "comp sheet", "waiting list", "wait list", "waitlist",
  ]);
  if (entryManagement) return null;
  const memberPurse = hasAny(lower, ["purse", "competition purse"]) || (hasAny(lower, ["member", "members", "membr"]) && wantsChargeOrPayment(lower));
  if (wantsChargeOrPayment(lower) && !hasMemberAudience(lower) && !hasVisitorAudience(lower)) {
    if (memberPurse) {
      return response(`Member Competition Charges

1. Open Competitions from the main navigation menu and find the relevant member competition.
2. In the competition record, use the competition setup, charges, and purse/payment settings for that competition.
3. Confirm the member entry fee is being taken from the member's competition purse.
4. Review the member entry, purse balance, and competition transaction history before changing a charge.
5. Keep member competition charges in the competition purse/payment settings, separate from normal member account billing or generic payment requests.

Check: If visitors are also entering, handle visitor/open competition fees separately from member purse charging.`, "teesheet", [], "guardrail");
    }
    return response("Who are you charging for the competition?", "teesheet", [
      { label: "Members", value: "Clarification answer: Members competition charging through the competition purse", clarificationId: "competition-charge" },
      { label: "Visitors", value: "Clarification answer: Visitors open competition charging through green fee or entry fee setup", clarificationId: "competition-charge" },
      { label: "Both", value: "Clarification answer: Both members and visitors competition charging", clarificationId: "competition-charge" },
      { label: "Type details instead", value: "Clarification answer: I need to type competition charging details", clarificationId: "competition-charge" },
    ], "guardrail");
  }
  if (wantsChargeOrPayment(lower) && hasMemberAudience(lower)) {
    return response(`Member Competition Charges

1. Open Competitions from the main navigation menu and find the relevant member competition.
2. In the competition record, use the competition setup, charges, and purse/payment settings for that competition.
3. Confirm the member entry fee is being taken from the member's competition purse.
4. Keep member competition charges in the competition purse/payment settings, separate from normal member account billing or generic payment requests.

Check: If visitors are also entering, handle visitor/open competition fees separately from member purse charging.`, "teesheet", [], "guardrail");
  }
  if (wantsChargeOrPayment(lower) && hasVisitorAudience(lower)) {
    return response(`Check Visitor Charges for an Open Competition

1. Open Competitions.
2. Open the relevant open competition setup or Open Competitions for Visitors.
3. Review the visitor entry fee, visitor green fee, and any member/visitor team settings for that competition.
4. Check the visitor entry flow or competition charge summary to confirm the fee, charge, price, or green fee visitors will see online.
5. Use the visitor/open competition fee setup for visitor-facing charges.
6. If members are also entering, handle the member competition purse charge separately from the visitor/open competition fee.`, "teesheet", [], "guardrail");
  }
  return null;
}

function membershipReply(lower) {
  if (!hasMembershipObject(lower)) return null;
  if (hasBookingObject(lower) && !hasAny(lower, ["member booking", "members booking", "member cannot book"])) return null;

  if (hasAny(lower, ["refund", "reverse"]) && hasAny(lower, ["bill", "billing", "invoice", "membership payment", "member payment"])) {
    return response(numberedAnswer("Refund a Payment on a Membership Bill", [
      "Open Memberships from the main navigation menu.",
      "Find and open the relevant member profile from the Members area.",
      "Open the member's Billing area, then open the bill that contains the payment.",
      "Open the Payments section for that bill and confirm the payment is attached to the correct member bill.",
      "Confirm the payment was taken through BRS Payments. Payments taken by cash, PDQ, cheque, or another non-BRS method cannot be refunded through BRS.",
      "Use the Refund action on the correct bill payment. For a partial refund, enter only the amount that should be returned, then enter a reason if required and confirm the refund.",
    ], "Processed refunds can be found under Tools >> BRS Payments >> Refunds."), "memberships");
  }

  if (hasReportIntent(lower) && hasAny(lower, ["unpaid", "outstanding", "bill", "bills", "balance", "balances", "invoice", "invoices"])) {
    return response(`Go to:
Memberships >> Reports

Open Memberships from the main navigation menu, then use the Reports area inside Memberships. Look for the billing report for unpaid/outstanding member bills, then use the filters and export control shown on that report page.`, "memberships", [], "generic");
  }

  if (hasAny(lower, ["wallet", "account balance", "credit balance", "top up", "top-up"])) {
    return response(`Use Account Balances for member wallet questions.

Go to:
Memberships >> Members >> open the member profile >> Account Balances

Open Memberships from the main navigation menu, find the member in the Members area, open the member profile, then use Account Balances on that profile. From there you can check the wallet balance, review balance movement, and top up the relevant wallet/account balance where configured. For transaction reporting, use Memberships >> Reports >> Wallet Transactions.`, "memberships");
  }

  if (hasAny(lower, ["flexi", "flexible"])) {
    const mentionsTypeSetup = hasAny(lower, ["membership type", "member type", "type", "category"])
      || (hasAny(lower, ["create", "new", "set up", "setup", "edit", "change", "configure"]) && !hasAny(lower, ["member profile", "flexible member", "flexi member"]));
    if (mentionsTypeSetup) {
      return response(numberedAnswer("Create a Flexible Membership Type", [
        "Open Memberships from the main navigation menu.",
        "Open Membership Types.",
        "Click CREATE MEMBERSHIP TYPE.",
        "In Membership Type Details, enter the Name and choose the Membership Type Status.",
        "Tick Flex to make the membership type a flexible membership type.",
        "Use Ages only if the type should be limited by Minimum Age or Maximum Age.",
        "Use Qualifying Length of Service only if eligibility depends on years of service.",
        "Use Next Chained Membership Type only if members should move automatically to another type later.",
        "In Subscription Items, select any default subscriptions that should be attached to this membership type.",
        "Click CREATE, then return to Membership Types and check the new row shows Flex as Yes."
      ], "Check: Flexible wallet visibility is controlled separately in Memberships >> Settings >> General with Display Flexible Wallets table on dashboard. Use Members only when assigning an existing flexible membership type to a specific member."), "memberships");
    }

    return response(numberedAnswer("Manage a Flexible Member", [
      "Open Memberships from the main navigation menu.",
      "Open Members and find the member profile.",
      "Check the member's Membership Type and confirm it is one of the flexible membership types.",
      "Use Account Balances for the member's flexible wallet balance.",
      "Use Edit Balance when you need to top up or claw back points from the wallet.",
      "Use Billing/Payments only if the question is about a membership bill, invoice, or scheduled payment."
    ], "For setup questions, use Memberships >> Membership Types to create or edit the flexible membership type, and Memberships >> Settings >> General for the flexible wallets dashboard setting."), "memberships");
  }

  if (hasActionIntent(lower)) {
    return null;
  }

  if (hasAny(lower, ["bill", "bills", "billing", "invoice", "subscription", "payment scheme", "payment plan"])) {
    return response("What are you trying to do for the member?", "memberships", [
      { label: "Create or change a bill", value: "Clarification answer: Create or change a member bill", clarificationId: "membership-issue" },
      { label: "Check a bill problem", value: "Clarification answer: Member bill looks wrong, is unpaid, or is not visible", clarificationId: "membership-issue" },
      { label: "Recurring fee/renewal", value: "Clarification answer: Membership subscription issue", clarificationId: "membership-issue" },
      { label: "Instalments/payment plan", value: "Clarification answer: Membership payment scheme", clarificationId: "membership-issue" },
      { label: "Wallet or credit balance", value: "Clarification answer: Wallet or account balance", clarificationId: "membership-issue" },
      { label: "I'm not sure", value: "Clarification answer: I am not sure which membership task this is", clarificationId: "membership-issue" },
    ]);
  }

  return null;
}

export function answerFromObjectFirstRouting(message) {
  if (/^Clarification answer:\s*/i.test(String(message || ""))) return null;

  const lower = normalise(message);
  if (isConceptualQuestion(lower)) return null;

  const competition = competitionReply(lower);
  if (competition) return competition;

  const membership = membershipReply(lower);
  if (membership) return membership;

  if (hasPaymentIntent(lower) && !hasMembershipObject(lower) && !hasCompetitionObject(lower)) return null;
  return null;
}
