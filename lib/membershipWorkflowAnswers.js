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
  if (hasAny(lower, ["competition", "competitions", "open competition", "competition purse", "entry fee"])) return false;
  if (hasAny(lower, ["grace period", "booking access", "app access", "stop online booking", "restrict booking", "auto stop", "lose app access", "come back automatically"])) return false;
  if (
    hasAny(lower, ["bill", "bills", "invoice", "invoices", "renewal"]) &&
    (hasAny(lower, ["publish", "published", "printed", "print", "member app", "members app", "in the app", "visible", "showing"]) || /\bapp\b/.test(lower))
  ) return false;
  if (/^\s*what\s+(is|are)\s+(a\s+)?(bill|bills|invoice|invoices|billing)\b/.test(lower)) return false;
  if (hasAny(lower, ["what is a bill", "what are bills", "what does bill mean", "definition of bill"])) return false;
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
  if (hasAny(lower, ["paid", "payment", "transaction", "transactions", "brs payments"]) && !hasExplicitDebtTerm) return false;
  const asksForLookup = /\b(how|where|which|who|show|see|find|list|report|view|check|download|export|total|totals)\b/.test(lower) ||
    hasAny(lower, ["committee wants", "accounts wants", "accounts need", "money owed", "unpaid renewal money"]);
  const whatLookup = /\bwhat\b/.test(lower) && hasAny(lower, ["owe", "owed", "owing", "outstanding", "overdue", "arrears", "balance due", "amount due"]);
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
    "renewal",
    "renewals",
    "subs",
    "subscription",
    "amount due",
    "due amount",
  ]);

  const hasMembershipDebtContext = hasMemberTerm(lower) ||
    hasAny(lower, ["renewal", "renewals", "subs", "subscription", "subscriptions", "membership bill", "membership bills"]);

  return (asksForLookup || whatLookup) && hasMembershipDebtContext && hasDebtConcept;
}

export function approvedMemberBalanceReportReply(message = "") {
  if (!isMemberBalanceReportQuestion(message)) return null;

  const lower = normalise(message);
  const asksForLiveList = hasAny(lower, ["show me", "give me", "list", "all unpaid", "all outstanding", "who owes", "who still owes"]) &&
    hasAny(lower, ["member", "members", "membership"]);
  const liveDataBoundary = asksForLiveList
    ? "I cannot show live member names, balances, or unpaid lists from the chat. Use BRS reports if you are authorised to review member billing data."
    : "Use the membership reports when authorised staff need to review unpaid member bills or outstanding balances.";

  return `Find members with unpaid or outstanding membership balances

${liveDataBoundary}

1. Open Memberships from the main navigation menu.
2. Open Reports in the Memberships navigation.
3. In Financial Reports, open Overdue Bills when you need members with overdue membership bills.
4. Use Bills Overview when you need a wider billing status view across membership bills.
5. On Overdue Bills, use the Search box, Due Date From, Due Date To, Payment Status, Membership Types, and Show Draft Bills controls to narrow the list.
6. Check the report columns: Bill Name, Player Name, Membership Type, Membership Status, Raised, Due, Total, Paid, Outstanding, Payment Status, Publish Status, and Actions.
7. Use Download CSV Overdue bills Report when you need a spreadsheet.

Check:
- For one individual member, open the member profile and check their Billing area instead of using the all-member list.
- Member balances are personal/financial data, so check permissions before exporting or sharing a report.`;
}
