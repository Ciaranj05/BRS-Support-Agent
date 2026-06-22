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

function hasMembershipObject(lower) {
  return hasAny(lower, [
    "member", "members", "membership", "subscription", "bill", "bills", "billing", "invoice", "invoices",
    "wallet", "account balance", "flexi", "flexible", "payment scheme", "payment plan", "unpaid", "outstanding balance",
  ]);
}

function hasBookingObject(lower) {
  return hasAny(lower, ["booking", "tee time", "tee sheet", "teesheet", "timesheet", "golfer", "visitor booking", "green fee"]);
}

function hasReportIntent(lower) {
  return hasAny(lower, ["report", "reports", "list", "show", "shows", "find", "export", "download", "breakdown"]);
}

function hasCompetitionObject(lower) {
  return hasAny(lower, ["competition", "competitions", "open competition", "entry sheet", "draw", "purse"]);
}

function wantsChargeOrPayment(lower) {
  return hasAny(lower, ["charge", "charging", "fee", "fees", "cost", "price", "payment", "pay", "paid", "purse", "refund"]);
}

function hasActionIntent(lower) {
  return hasAny(lower, [
    "create", "add", "new", "generate", "raise", "make", "change", "edit", "amend", "set up", "setup", "manage",
    "cancel", "remove", "delete", "find", "show", "list", "export", "download", "fix", "refund", "reverse", "top up",
  ]);
}

function hasMemberAudience(lower) {
  return hasAny(lower, ["member", "members", "member's", "members'"]);
}

function hasVisitorAudience(lower) {
  return hasAny(lower, ["visitor", "visitors", "guest", "guests", "open competition", "public", "non-member", "non member"]);
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
  if (wantsChargeOrPayment(lower) && !hasMemberAudience(lower) && !hasVisitorAudience(lower)) {
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
4. Do not use the member account area or a generic payment request for member competition charges.

Check: If visitors are also entering, handle visitor/open competition fees separately from member purse charging.`, "teesheet", [], "guardrail");
  }
  if (wantsChargeOrPayment(lower) && hasVisitorAudience(lower)) {
    return response(`For visitor or open competition charging, use the visitor/open competition fee setup rather than the member competition purse.

Check the open competition setup, visitor entry fee, and green fee/payment settings. If members are also entering, handle the member purse route separately.`, "teesheet", [], "guardrail");
  }
  return null;
}

function membershipReply(lower) {
  if (!hasMembershipObject(lower)) return null;
  if (hasBookingObject(lower) && !hasAny(lower, ["member booking", "members booking", "member cannot book"])) return null;

  if (hasReportIntent(lower) && hasAny(lower, ["unpaid", "outstanding", "bill", "bills", "balance", "balances", "invoice", "invoices"])) {
    return response(`Go to:
Memberships >> Reports

Open Memberships from the main navigation menu, then use the Reports area inside Memberships. Look for the billing report for unpaid/outstanding member bills, then use the filters and export control shown on that report page.`, "memberships", [], "generic");
  }

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

  if (hasAny(lower, ["wallet", "account balance", "credit balance", "top up", "top-up"])) {
    return response(`Use Account Balances for member wallet questions.

Go to:
Memberships >> Members >> open the member profile >> Account Balances

Open Memberships from the main navigation menu, find the member in the Members area, open the member profile, then use Account Balances on that profile. From there you can check the wallet balance, review balance movement, and top up the relevant wallet/account balance where configured. For transaction reporting, use Memberships >> Reports >> Wallet Transactions.`, "memberships");
  }

  if (hasAny(lower, ["flexi", "flexible"])) {
    return response(`Handle flexi/flexible membership from the membership/member profile area, not from booking payments.

Go to:
Memberships >> Members >> open or create the member profile

Open Memberships from the main navigation menu, then use the Members area to open or create the member profile. On the profile, check the member's membership type, subscriptions, billing setup, and any flexi/flexible membership configuration enabled for the club. If the flexi option is enabled but not visible on the profile, check Memberships settings and membership type setup.`, "memberships");
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
  const competition = competitionReply(lower);
  if (competition) return competition;

  const membership = membershipReply(lower);
  if (membership) return membership;

  if (hasPaymentIntent(lower) && !hasMembershipObject(lower) && !hasCompetitionObject(lower)) return null;
  return null;
}
