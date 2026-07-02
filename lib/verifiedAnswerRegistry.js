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
    id: "timesheet-message",
    title: /Add a Message on the Timesheet|Set Messages on the Timesheet|Messages on the Timesheet/i,
    groups: [["message", "notice", "frost delay", "delay notice"], ["timesheet", "tee sheet", "teesheet", "sheet"]],
  },
  {
    id: "copy-services-catering-green-fees",
    title: /Copy Services, Catering, or Green Fees/i,
    groups: [["copy"], ["services", "catering", "green fees", "next year", "from year", "to year"]],
  },
  {
    id: "legal-messages",
    title: /Set Up Legal Messages/i,
    groups: [["privacy policy", "member terms", "visitor terms", "facility booking terms", "terms message", "legal messages", "legal", "privacy", "wording", "appears online"]],
  },
  {
    id: "open-competition-terms",
    title: /Set Open Competition Terms and Conditions/i,
    groups: [["open competition", "open competitions", "open comp", "open comps", "all ireland"], ["terms", "terms and conditions", "conditions", "search"]],
  },
  {
    id: "golf-events-vs-competitions",
    title: /Golf Events vs Competitions/i,
    groups: [["golf event", "golf events", "competition", "competitions"]],
  },
  {
    id: "golf-event-organiser-reservation",
    title: /Set Up a Golf Event Organiser Reservation/i,
    groups: [["golf event", "golf events", "corporate day", "event organiser", "organiser"], ["tee times", "blocked", "block", "start", "set up", "setup", "username", "event username"]],
  },
  {
    id: "golf-event-multi-area",
    title: /Handle a Golf Event Change with Extras or Payment/i,
    groups: [["golf event", "society day", "society organiser", "event"], ["changed date", "change date", "new date", "payment link"]],
  },
  {
    id: "open-competition-visitors",
    title: /Set Up an Open Competition for Visitors/i,
    groups: [["open competition", "open competitions", "open comp", "open comps"], ["visitor", "visitors", "online", "book online", "fields", "page", "can't see", "cant see"]],
  },
  {
    id: "open-competition-multi-area",
    title: /Check an Open Competition Visitor Query Across Areas/i,
    groups: [["open competition", "open competitions", "open comp", "open comps"], ["hotel partner", "paid", "payment", "buggy", "find the booking", "separate things"]],
  },
  {
    id: "competition-waiting-list",
    title: /Add a Member to a Competition Waiting List/i,
    groups: [["competition", "comp sheet", "comp"], ["waiting list", "wait list", "waitlist", "missed"]],
  },
  {
    id: "create-competition",
    title: /Create a Competition/i,
    groups: [["competition", "competitions", "comp", "comp sheet"], ["create", "add", "new", "setup", "set up", "make"]],
  },
  {
    id: "open-competition-visitor-charges",
    title: /Check Visitor Charges for an Open Competition|Configure Competition Charges/i,
    groups: [["open competition", "open competitions", "open comp", "open comps"], ["visitor", "visitors", "fee", "fees", "price", "prices", "charge", "charges"]],
  },
  {
    id: "member-bill-brs-payments-reconciliation",
    title: /Check a Member Bill Payment Against BRS Payments/i,
    groups: [["member", "bill", "billing"], ["paid", "payment", "transactions", "brs payments"]],
  },
  {
    id: "member-balance-report",
    title: /Find members with unpaid or outstanding membership balances|View Members Who Owe Membership Money/i,
    groups: [["owe", "owes", "owed", "outstanding", "unpaid", "subs", "subscription"], ["member", "members", "money", "subs", "membership"]],
  },
  {
    id: "services-definition",
    title: /Services in BRS are bookable extras/i,
    groups: [["service", "services", "buggies", "buggy", "hire clubs", "club hire"]],
  },
  {
    id: "add-services-to-booking",
    title: /Add Services to a Booking/i,
    groups: [["booking", "tee booking", "event booking"], ["buggy", "buggies", "club hire", "hire clubs", "services", "extras"]],
  },
  {
    id: "member-groups-for-messaging",
    title: /Set Up Member Groups for Messaging/i,
    groups: [["group", "groups", "member group", "member groups"], ["email", "text", "sms", "message", "messaging"]],
  },
  {
    id: "message-delivery-troubleshooting",
    title: /Check Why a Member Is Not Receiving BRS Emails|Check Why a Recipient Is Not Receiving BRS Emails|Check Why a Recipient Is Not Receiving BRS Text Messages/i,
    groups: [["email", "emails", "text", "sms", "message"], ["not receiving", "never gets", "doesn't get", "doesnt get", "not arrived", "suppressed", "spam", "junk"]],
  },
  {
    id: "text-messaging-credit",
    title: /Buy Text Messaging Credit/i,
    groups: [["sms", "text", "txt"], ["credit", "credits", "top up", "topup"]],
  },
  {
    id: "text-members",
    title: /Text Members in a Membership Type or Group/i,
    groups: [["text", "txt", "sms"], ["all members", "members", "membership type", "membership group"]],
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
    id: "brs-payments-transactions",
    title: /Download BRS Payments Transactions|View BRS Payments Transactions/i,
    groups: [["brs payments", "card payment", "card payments", "paymnts", "payments"], ["transaction", "transactions", "csv", "download", "export", "accountant"]],
  },
  {
    id: "member-data-export",
    title: /Create a Filtered Member Data Export|Export Member Email Addresses/i,
    groups: [["member", "members", "junior", "membership"], ["email", "emails", "email addresses", "spreadsheet", "csv", "export", "download"]],
  },
  {
    id: "tee-time-usage-reservation-type",
    title: /Run Tee Time Usage by Reservation Type/i,
    groups: [["reservation type", "reservation types"], ["usage", "busy", "summer", "print", "report"]],
  },
  {
    id: "visitor-booking-reports",
    title: /Run Visitor Booking Reports|Run a Visitor Report/i,
    groups: [["visitor", "visitors"], ["report", "reports", "revenue", "totals", "by country", "online bookings"]],
  },
  {
    id: "visitor-booking-rates",
    title: /Set Visitor Booking Rates|Set Up Green Fee Rates|Set Tour Operator Booking Rates/i,
    groups: [["visitor", "visitors", "tour operator", "tour operators"], ["green fee", "green fees", "price", "prices", "rate", "rates", "online booking"]],
  },
  {
    id: "upload-members-or-contacts",
    title: /Upload Members or Contacts/i,
    groups: [["upload", "import", "csv", "spreadsheet"], ["member", "members", "contact", "contacts"]],
  },
  {
    id: "search-booking",
    title: /Search for a Booking/i,
    groups: [
      ["booked", "booking", "bookin", "bookng", "reservation", "tee time", "tee slot"],
      ["part of their name", "partial name", "half his surname", "surname", "last name", "only caught", "look them up", "find them", "search", "mobile", "mob", "phone"],
    ],
  },
  {
    id: "chatbot-live-record-guardrail",
    title: /Chatbot Guidance for Live BRS Records/i,
    groups: [["can you", "could you", "will you", "please"], ["make the booking", "create the booking", "find", "look up", "search"]],
  },
  {
    id: "course-restriction-group-size",
    title: /Configure Course Restrictions/i,
    groups: [
      ["course restriction", "course restrictions", "four-ball", "four ball", "4-ball", "4 ball", "4balls", "fourballs", "group size", "max group size", "groups of four", "maintenance", "blocked off", "blocked-off"],
      ["stop", "restrict", "block", "limit", "after", "before", "certain time", "booking status", "course", "maintenance"],
    ],
  },
  {
    id: "visitor-online-availability",
    title: /Check Visitor Online Booking Availability/i,
    groups: [["visitor", "visitors"], ["online", "website", "book online", "not showing", "no tee times", "can't book", "cant book", "why"]],
  },
  {
    id: "contact-categories",
    title: /Set Up Contact Categories/i,
    groups: [["contact type", "contact category", "contact categories", "contact cat", "contact cats", "contct cat", "contct", "society organiser", "society organisers", "tour operator", "tour operators", "opperator", "opperators"]],
  },
  {
    id: "contact-report-export",
    title: /Run a Contact Report/i,
    groups: [["contact", "contacts"], ["email addresses", "emails", "export", "download", "spreadsheet", "report"]],
  },
  {
    id: "facility-reservation-search",
    title: /Find a Facility Reservation/i,
    groups: [["facility", "room", "simulator", "resource"], ["booking", "reservation", "find", "search", "phone", "mobile"]],
  },
  {
    id: "facility-booking-terms",
    title: /Set Up Legal Messages/i,
    groups: [["facility booking terms", "facility terms"], ["change", "set", "terms"]],
  },
  {
    id: "dashboard-today-bookings",
    title: /View Today's Bookings on the Dashboard/i,
    groups: [["today", "todays", "today's"], ["booking", "bookings", "bookins", "tee times", "tee time"]],
  },
  {
    id: "dashboard-vs-reports",
    title: /Dashboard vs Reports/i,
    groups: [["dashboard"], ["report", "reports", "last month", "historical", "which is which"]],
  },
  {
    id: "payment-area-distinction",
    title: /Distinguish Member Billing from Tee Booking Payments/i,
    groups: [["member billing", "member bill", "membership bill", "member account balance", "account balance"], ["tee booking", "booking payment", "booking payments", "visitor booking payment"]],
  },
  {
    id: "user-access-vat-reporting",
    title: /Give a Staff User Access for VAT Reporting/i,
    groups: [["vat"], ["access", "permission", "permissions", "assistant", "user", "staff"]],
  },
  {
    id: "user-password-report-access",
    title: /Check a User Password and Report Access/i,
    groups: [["password", "passwrd", "passwrod"], ["report", "reports", "rpeorts", "access", "permission", "permissions"]],
  },
  {
    id: "staff-report-access",
    title: /Check Staff User Report Access/i,
    groups: [["staff", "user", "users", "assistant"], ["report", "reports", "rpeorts", "access", "permission", "permissions", "can log in"]],
  },
  {
    id: "missing-booking-timesheet-search",
    title: /Find a Booking That Is Not Showing on the Timesheet/i,
    groups: [["booking", "bookng", "tee time"], ["not on the sheet", "not on timesheet", "isnt on the sheet", "isn't on the sheet"]],
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
