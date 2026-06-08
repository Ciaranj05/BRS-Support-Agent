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

function response(reply, topic, options = []) {
  return { reply, escalationReady: false, topic, options, version: APP_VERSION };
}

function competitionReply(lower) {
  if (!hasCompetitionObject(lower)) return null;
  if (wantsChargeOrPayment(lower) && !hasMemberAudience(lower) && !hasVisitorAudience(lower)) {
    return response("Who are you charging for the competition?", "teesheet", [
      { label: "Members", value: "Clarification answer: Members competition charging through the competition purse", clarificationId: "competition-charge" },
      { label: "Visitors", value: "Clarification answer: Visitors open competition charging through green fee or entry fee setup", clarificationId: "competition-charge" },
      { label: "Both", value: "Clarification answer: Both members and visitors competition charging", clarificationId: "competition-charge" },
      { label: "Type details instead", value: "Clarification answer: I need to type competition charging details", clarificationId: "competition-charge" },
    ]);
  }
  if (wantsChargeOrPayment(lower) && hasMemberAudience(lower)) {
    return response(`For member competition charging, use the competition purse route rather than membership billing or a generic payment request.

Check the competition setup and purse/payment settings for the competition, then confirm the member entry fee is being taken from the member's competition purse.

If visitors are also entering, handle visitor/open competition fees separately from member purse charging.`, "teesheet");
  }
  if (wantsChargeOrPayment(lower) && hasVisitorAudience(lower)) {
    return response(`For visitor or open competition charging, use the visitor/open competition fee setup rather than the member competition purse.

Check the open competition setup, visitor entry fee, and green fee/payment settings. If members are also entering, handle the member purse route separately.`, "teesheet");
  }
  return null;
}

function membershipReply(lower) {
  if (!hasMembershipObject(lower)) return null;
  if (hasBookingObject(lower) && !hasAny(lower, ["member booking", "members booking", "member cannot book"])) return null;

  if (hasReportIntent(lower) && hasAny(lower, ["unpaid", "outstanding", "bill", "bills", "balance", "balances", "invoice", "invoices"])) {
    return response(`Use the Memberships reporting/billing area for this, not BRS Payments, booking payments, or competition purse.

Go to:
Memberships >> Reports

Look for the billing report for unpaid/outstanding member bills, then filter or export the report as needed. If the report is not visible, check the member profile Billing area for the affected member and confirm the bill is published/unpaid.`, "memberships");
  }

  if (hasAny(lower, ["refund", "reverse"]) && hasAny(lower, ["bill", "billing", "invoice", "membership payment", "member payment"])) {
    return response(`For a refund on a membership bill, use the member billing/payment record rather than the tee sheet booking refund route.

Go to:
Memberships >> Members >> open the member profile >> Billing >> open the bill >> Payments

Then confirm the correct bill, payment, amount, and allocation before refunding or reversing anything. If the payment was taken through BRS Payments, review refund records under Tools >> BRS Payments >> Refunds.`, "memberships");
  }

  if (hasAny(lower, ["wallet", "account balance", "credit balance", "top up", "top-up"])) {
    return response(`Use Account Balances for member wallet questions.

Go to:
Memberships >> Members >> open the member profile >> Account Balances

From there you can check the wallet balance, review balance movement, and top up the relevant wallet/account balance where configured. For transaction reporting, use Memberships >> Reports >> Wallet Transactions.`, "memberships");
  }

  if (hasAny(lower, ["flexi", "flexible"])) {
    return response(`Handle flexi/flexible membership from the membership/member profile area, not from booking payments.

Go to:
Memberships >> Members >> open or create the member profile

Then check the member's membership type, subscriptions, billing setup, and any flexi/flexible membership configuration enabled for the club. If the flexi option is enabled but not visible on the profile, check Memberships settings and membership type setup.`, "memberships");
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
