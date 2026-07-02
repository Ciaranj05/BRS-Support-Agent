function normalise(value = "") {
  return String(value || "").toLowerCase();
}

function hasAny(lower, terms = []) {
  return terms.some((term) => lower.includes(term));
}

function allGroupsMatch(lower, groups = []) {
  return groups.every((group) => hasAny(lower, group));
}

export const VERIFIED_STATIC_REPLY_RULES = [
  {
    id: "configure-timesheet",
    title: /Configure the Timesheet/i,
    groups: [["tee slot", "tee slots", "tee time", "tee times", "interval", "intervals", "opening earlier", "opening time"]],
  },
  {
    id: "timesheet-day-title",
    title: /Title for Each Day/i,
    groups: [["label", "title", "heading", "top of", "particular day", "timesheet", "tee sheet"]],
  },
  {
    id: "copy-services-catering-green-fees",
    title: /Copy Services, Catering, or Green Fees/i,
    groups: [["copy"], ["services", "catering", "green fees", "next year", "from year", "to year"]],
  },
  {
    id: "legal-messages",
    title: /Set Up Legal Messages/i,
    groups: [["privacy policy", "member terms", "terms message", "legal messages", "appears online"]],
  },
  {
    id: "open-competition-terms",
    title: /Set Open Competition Terms and Conditions/i,
    groups: [["open competition", "open competitions", "all ireland"], ["terms", "terms and conditions", "conditions", "search"]],
  },
  {
    id: "golf-events-vs-competitions",
    title: /Golf Events vs Competitions/i,
    groups: [["golf event", "golf events", "competition", "competitions"]],
  },
  {
    id: "golf-event-organiser-reservation",
    title: /Set Up a Golf Event Organiser Reservation/i,
    groups: [["golf event", "golf events", "corporate day", "event organiser", "organiser"], ["tee times", "blocked", "block", "start", "set up", "setup"]],
  },
  {
    id: "open-competition-visitors",
    title: /Set Up an Open Competition for Visitors/i,
    groups: [["open competition"], ["visitor", "visitors", "online", "book online", "fields", "page"]],
  },
  {
    id: "competition-waiting-list",
    title: /Add a Member to a Competition Waiting List/i,
    groups: [["competition", "comp sheet", "comp"], ["waiting list", "wait list", "waitlist", "missed"]],
  },
  {
    id: "member-bill-brs-payments-reconciliation",
    title: /Check a Member Bill Payment Against BRS Payments/i,
    groups: [["member", "bill", "billing"], ["paid", "payment", "transactions", "brs payments"]],
  },
  {
    id: "services-definition",
    title: /Services in BRS are bookable extras/i,
    groups: [["service", "services", "buggies", "buggy", "hire clubs", "club hire"]],
  },
  {
    id: "membership-groups-email-text",
    title: /Email Membership Groups and Text Message Membership Groups/i,
    groups: [["email membership groups", "text message membership groups", "text membership groups"]],
  },
  {
    id: "brs-payments-vat-report",
    title: /Download a BRS Payments VAT Report/i,
    groups: [["vat"], ["report", "reports", "download", "export", "month"]],
  },
  {
    id: "contact-categories",
    title: /Set Up Contact Categories/i,
    groups: [["contact type", "contact category", "contact categories", "society organiser", "society organisers"]],
  },
  {
    id: "user-password",
    title: /Change or Reset a User Password/i,
    groups: [["password"], ["forgot", "change", "reset", "own", "user", "staff"]],
  },
];

export function verifiedStaticReplyMatch(message = "", reply = "") {
  if (!reply) return null;
  const lower = normalise(message);
  return VERIFIED_STATIC_REPLY_RULES.find((rule) => rule.title.test(reply) && allGroupsMatch(lower, rule.groups)) || null;
}

export function isVerifiedStaticReply(message = "", reply = "") {
  return Boolean(verifiedStaticReplyMatch(message, reply));
}
