function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function hasMemberTerm(lower) {
  return /\b(member|members|membership|memberships)\b/.test(lower)
    || /\bmenebrs|membres|memebrs|membrs|memeber|memeber?s\b/.test(lower);
}

export function isMemberBalanceReportQuestion(message = "") {
  const lower = normalise(message);
  const asksForLookup = /\b(how|where|which|who|what|show|see|find|list|report|view|check|download|export)\b/.test(lower);
  const hasDebtConcept = hasAny(lower, [
    "owe",
    "owes",
    "owed",
    "owing",
    "money",
    "balance",
    "balances",
    "unpaid",
    "outstanding",
    "overdue",
    "arrears",
    "debt",
    "debtor",
    "debtors",
    "bill",
    "bills",
    "invoice",
    "invoices",
    "amount due",
    "due amount",
  ]);

  return asksForLookup && hasMemberTerm(lower) && hasDebtConcept;
}

export function approvedMemberBalanceReportReply(message = "") {
  if (!isMemberBalanceReportQuestion(message)) return null;

  return `Find members with unpaid or outstanding membership balances

1. Open the Memberships area.
2. Go to Billing/Payments or Memberships > Reports, depending on the club's interface.
3. Use the billing/report view for unpaid, outstanding, failed, or balance due member bills.
4. Narrow the results by billing cycle, period, date range, or membership type when the club needs a specific renewal window.
5. Export or download the list from the billing/report view when an export option is available.

Check:
- For one individual member, open the member profile and check their Billing area instead of using the all-member list.`;
}
