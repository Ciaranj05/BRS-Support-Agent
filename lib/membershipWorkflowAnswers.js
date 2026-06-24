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
  if (hasAny(lower, ["refund", "reverse", "money back", "return payment"])) return false;
  const asksToCreateBill = hasAny(lower, ["create", "add", "new", "generate", "raise", "make"])
    && hasAny(lower, ["bill", "bills", "invoice", "invoices", "billing"]);
  const hasExplicitDebtTerm = hasAny(lower, [
    "owe",
    "owes",
    "owed",
    "owing",
    "balance",
    "balances",
    "unpaid",
    "outstanding",
    "overdue",
    "arrears",
    "debt",
    "debtor",
    "debtors",
    "amount due",
    "due amount",
  ]);
  if (asksToCreateBill && !hasExplicitDebtTerm) return false;
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

1. Open Memberships from the main navigation menu.
2. Use the Memberships billing/report area, such as Billing/Payments or Memberships > Reports, depending on the club's interface.
3. In that billing/report view, use the unpaid, outstanding, failed, or balance due member bill filters or statuses shown on the page.
4. Narrow the results using the billing cycle, period, date range, or membership type controls shown in the same billing/report view when you need a specific renewal window.
5. Export or download the list from the billing/report view using the export/download control shown on that page.

Check:
- For one individual member, open the member profile and check their Billing area instead of using the all-member list.`;
}
