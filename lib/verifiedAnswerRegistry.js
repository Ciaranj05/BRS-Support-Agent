function normalise(value = "") {
  return String(value || "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"")
    .toLowerCase();
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
    id: "squeeze-tee-time",
    title: /Use Squeeze Tee Time/i,
    groups: [["squeeze", "extra tee time", "extra slot", "extra gap"], ["timesheet", "tee time", "tee", "09:00", "09:08"], ["add", "hour", "minute", "between"]],
  },
  {
    id: "timesheet-day-title",
    title: /Title for Each Day/i,
    groups: [["label", "title", "heading", "top of", "particular day", "timesheet", "tee sheet"]],
  },
  {
    id: "timesheet-message",
    title: /Add a Message on the Timesheet|Set Messages on the Timesheet|Messages on the Timesheet/i,
    groups: [["message", "notice", "warning", "warning note", "frost delay", "delay notice", "recurring message"], ["timesheet", "tee sheet", "teesheet", "sheet", "specific days", "days of week", "recurring"]],
  },
  {
    id: "course-closure-restriction",
    title: /Close or Restrict Tee Times for Course Work/i,
    groups: [["course", "hollow coring", "maintenance", "course work", "greenkeeper", "greenkeepers", "frost delay", "course shut", "course closed", "front nine", "back nine"], ["block", "restriction", "restrict", "tee time", "tee times", "morning", "afternoon", "closed", "front nine", "back nine", "no visitors", "online", "8", "10"]],
  },
  {
    id: "club-policy-boundary",
    title: /Club-Specific Policy or Refund Rule/i,
    groups: [["policy", "policies", "foul weather", "bad weather", "weather refund", "rain check", "dumbarnie", "guest rate", "cancellation window"], ["refund", "weather", "rate", "visitor", "guest", "cancel"]],
  },
  {
    id: "member-guest-rate-comparison",
    title: /Explain a Member Guest Rate Difference/i,
    groups: [["member guest", "member guests", "members guest", "guest rate"], ["why", "higher", "lower", "more expensive", "cheaper", "than", "compare"]],
  },
  {
    id: "marketing-consent-filtering",
    title: /Email Only Opted-In Contacts/i,
    groups: [["marketing", "consent", "opted in", "opt-in", "opted out", "opt-out", "unsubscribe", "remove me", "offers", "sale", "sales", "never opted in"], ["email", "text", "sms", "visitor", "visitors", "customer", "customers", "contact", "contacts", "member", "members", "imported", "captured", "online bookings"]],
  },
  {
    id: "named-user-password-guardrail",
    title: /Named User Password Reset Guardrail/i,
    groups: [["password", "passwrd", "passwrod"], ["reset", "change", "forgot", "set"], ["david murphy", "another user", "member's password", "staff password", "user's password"]],
  },
  {
    id: "supplied-password-guardrail",
    title: /Named User Password Reset Guardrail/i,
    groups: [["set it to", "make it", "change it to", "reset it to", "password to", "golf123"]],
  },
  {
    id: "public-golfer-cancellation",
    title: /Visitor Booking Cancellation Guidance/i,
    groups: [["i booked", "my booking", "my online booking", "booked online", "confirmation email", "i'm a golfer", "im a golfer"], ["can't make it", "cant make it", "cannot make it", "cancel me", "cancel my", "need to cancel", "can you do it"]],
  },
  {
    id: "member-balance-live-data-guardrail",
    title: /Live Member Balance Data Guardrail/i,
    groups: [["show me", "list", "give me", "who owes", "who still owes", "who hasn't paid", "who hasnt paid", "who haven't paid", "who havent paid", "all unpaid", "all outstanding", "names and emails"], ["member", "members", "subs", "subscription", "subscriptions", "renewal", "bill", "bills", "balance", "balances", "outstanding balances", "money"], ["balance", "balances", "unpaid", "outstanding", "owe", "owes", "money", "hasn't paid", "hasnt paid", "haven't paid", "havent paid", "not paid", "subs", "bills"]],
  },
  {
    id: "named-member-financial-data-guardrail",
    title: /Live Member Balance Data Guardrail/i,
    groups: [["member balance", "balance", "owes", "unpaid", "outstanding", "subs", "bill"], ["what is", "sarah o'neill", "member's"]],
  },
  {
    id: "live-action-prompt-guardrail",
    title: /Chatbot Guidance for Live BRS Actions/i,
    groups: [["ignore your rules", "ignore the rules", "ignore instructions", "book me", "can you book", "could you book", "will you book", "make me a booking", "cancel me", "delete this booking", "delete that booking", "cancel this booking", "refund them", "refund this booking", "delete and refund", "squeeze a tee time", "squeeze this tee time", "show me all", "send this marketing email", "send this email", "send this message"], ["booking", "tee time", "tee slot", "member", "members", "customer", "visitor", "visitors", "database", "email", "message", "payment", "balance", "refund", "live brs sheet", "john smith"]],
  },
  {
    id: "society-block-booking",
    title: /Reserve or Block Consecutive Tee Times/i,
    groups: [["society", "charity day", "corporate day", "corporate group", "golf day", "rugby club", "organiser", "organizer", "shotgun"], ["consecutive", "fourball", "fourballs", "4-ball", "blocked off", "block off", "block them", "block slots", "block slot", "block tee slots", "reserve", "reserved", "hold", "held", "tee slots", "tee times", "slots reserved", "names later", "collect names", "rough numbers", "stop them showing online", "stop visitors taking", "visitors grabbing"]],
  },
  {
    id: "member-booking-release-lock",
    title: /Member Booking Release and Tee-Time Lock/i,
    groups: [["locked", "lock", "vanished", "disappeared", "disappear", "disappears", "no booking shows", "no booking appears", "slot vanished"], ["release", "refresh", "refreshing", "7pm", "member", "members", "book now"]],
  },
  {
    id: "member-booking-privilege-rules",
    title: /Check Member Booking Privileges and Casual Booking Rules/i,
    groups: [["member", "members", "membership", "5-day", "five-day", "five day", "wrong category"], ["can book", "book saturday", "book beyond", "beyond 7 days", "7 days", "weekend", "saturday", "category", "privilege", "rules", "setting", "app", "tee times", "online"], ["where", "check", "why", "should", "able", "what controls", "what rules", "rules area", "controls", "getting"]],
  },
  {
    id: "membership-bill-publish-visibility",
    title: /Check Whether Membership Bills Are Published/i,
    groups: [["bill", "bills", "invoice", "invoices", "renewal"], ["published", "publish", "printed", "app", "visible", "showing"]],
  },
  {
    id: "membership-bill-create",
    title: /Create a Membership Bill/i,
    groups: [["member", "membership", "renewal", "subs", "subscription", "bill", "invoice"], ["create", "add", "new", "generate", "raise", "make", "bill"]],
  },
  {
    id: "member-bill-brs-payments-reconciliation",
    title: /Check or Record a Membership Bill Payment|Check a Member Bill Payment Against BRS Payments/i,
    groups: [["member", "membership", "renewal", "subs", "subscription", "bill", "invoice"], ["paid", "payment", "payments", "record", "unpaid", "brs payments", "transaction", "cash", "direct debit", "reconcile", "came out"]],
  },
  {
    id: "membership-bill-refund",
    title: /Refund a Payment on a Membership Bill/i,
    groups: [["member", "membership", "renewal", "subs", "subscription", "bill", "invoice"], ["refund", "reverse", "money back", "partial refund", "payment"]],
  },
  {
    id: "membership-grace-access",
    title: /Change the Membership Grace Period/i,
    groups: [["grace period", "unpaid", "not paid", "non-payer", "non payer", "subscription", "subs", "renewal bill", "overdue", "paid late"], ["booking access", "app access", "stop online booking", "restrict booking", "auto stop", "lose app access", "after 30 days", "come back", "where configured", "configured"]],
  },
  {
    id: "live-booking-change-guardrail",
    title: /Chatbot Guidance for Live Booking Changes/i,
    groups: [["can you", "could you", "will you", "please"], ["move", "change", "edit", "cancel", "delete"], ["booking", "tee time", "reservation"]],
  },
  {
    id: "online-tee-time-refund",
    title: /Refund an Online Tee-Time Booking Payment/i,
    groups: [["refund", "money back", "reverse", "return"], ["visitor", "tee time", "booking", "card payment", "paid online", "online payment", "green fee", "4ball", "fourball", "3ball", "threeball", "one player", "one visitor"]],
  },
  {
    id: "timesheet-booking-cancellation",
    title: /Cancel a Tee Sheet Booking/i,
    groups: [["cancel", "cancle", "delete", "remove", "deleting", "cancellation"], ["booking", "reservation", "tee time", "tee sheet", "timesheet"], ["payment", "paid", "refund", "customer", "member", "visitor", "whole tee slot"]],
  },
  {
    id: "cancelled-bookings-report",
    title: /Run a Cancelled Bookings Report|Find Details for a Deleted or Cancelled Booking/i,
    groups: [["cancelled", "canceled", "cancelled booking", "canceled booking", "deleted booking", "removed booking", "deleted", "removed"], ["report", "print", "printable", "last weekend", "last month", "csv", "download", "reference", "info", "find", "wrong booking"]],
  },
  {
    id: "no-show-reasons",
    title: /Set Up No Show Reasons/i,
    groups: [["no show reason", "no-show reason", "no show reasons", "no-show reasons"], ["add", "create", "new", "setup", "set up", "where"]],
  },
  {
    id: "no-show-report",
    title: /Run a No Show Report/i,
    groups: [["no show", "no-show", "no shows", "no-shows", "noshow", "didn't arrive", "didnt arrive", "did not arrive", "didn't turn up", "didnt turn up"], ["report", "reports", "by member", "member", "members", "last month", "date range", "where", "looking"]],
  },
  {
    id: "competition-scoring-integration",
    title: /Check Competition Scoring or Leaderboard Integrations/i,
    groups: [["competition", "competitions", "comp", "leaderboard", "scores", "scoring"], ["score", "scores", "scoring", "leaderboard", "results", "golf genius", "handicapmaster", "handicap master"]],
  },
  {
    id: "member-login-access",
    title: /Check Member Login and Registration Access/i,
    groups: [["member", "members", "new joiner", "joined today", "membership"], ["login", "log in", "log into", "app", "register", "registration", "username", "password", "user account", "enable", "disabled", "forgot"]],
  },
  {
    id: "member-details-change",
    title: /Change a Member's Details/i,
    groups: [["member", "members", "app"], ["email", "mobile", "postcode", "address", "contact", "phone", "wrong"]],
  },
  {
    id: "member-profile-lookup",
    title: /Find or Update a Member Profile/i,
    groups: [["member", "members"], ["find", "search", "surname", "postcode", "email", "mobile", "address", "contact", "record", "profile"]],
  },
  {
    id: "member-profile-create",
    title: /Create a Member Profile/i,
    groups: [["member", "membership", "joiner", "membr"], ["add", "create", "new", "record", "profile", "account", "put", "make"]],
  },
  {
    id: "membership-status-change",
    title: /Change a Member's Membership Status|Delete or Deactivate a Member|Suspend or Freeze a Membership/i,
    groups: [["member", "membership"], ["status", "lapsed", "resigned", "resignation", "inactive", "deactivate", "suspend", "delete", "remove"]],
  },
  {
    id: "booking-confirmation-template",
    title: /Set Up Email and Letter Templates/i,
    groups: [["booking confirmation", "confirmation email", "booking email"], ["template", "email"]],
  },
  {
    id: "online-vs-staff-bookings",
    title: /Online vs Staff-Entered Bookings/i,
    groups: [["online booking", "online bookings"], ["staff enter", "shop", "offline", "compared with"]],
  },
  {
    id: "wallet-vs-membership-bill",
    title: /Distinguish Member Wallet Credit from an Unpaid Membership Bill/i,
    groups: [["wallet", "flexi wallet", "member wallet", "account balance", "credit"], ["bill", "bills", "renewal bill", "unpaid", "outstanding", "subscription", "subs", "membership bill", "invoice"]],
  },
  {
    id: "membership-payment-scheme-definition",
    title: /Payment Schemes in BRS allow membership bills/i,
    groups: [["payment scheme", "payment schemes"], ["bill", "bills", "one-off", "difference", "instalment", "installment", "direct debit"]],
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
    groups: [["golf event", "golf events", "corporate outing", "corporate day", "society day", "reserved tee times"], ["competition", "competitions", "comp", "scoring", "draw"]],
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
    groups: [["open competition", "open competitions", "open comp", "open comps", "opne comp"], ["visitor", "visitors", "visotrs", "online", "book online", "fields", "page", "can't see", "cant see", "cant book"]],
  },
  {
    id: "open-competition-multi-area",
    title: /Check an Open Competition Visitor Query Across Areas/i,
    groups: [["open competition", "open competitions", "open comp", "open comps"], ["hotel partner", "paid", "payment", "buggy", "find the booking", "separate things", "legal", "wording", "terms", "conditions", "fee", "fees", "green fee", "charge", "price"]],
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
    groups: [["owe", "owes", "owed", "outstanding", "unpaid", "subs", "subscription", "renewal"], ["member", "members", "money", "subs", "membership", "renewal"]],
  },
  {
    id: "services-definition",
    title: /Services in BRS are bookable extras/i,
    groups: [["service", "services", "buggies", "buggy", "hire clubs", "club hire"]],
  },
  {
    id: "bookable-services-setup",
    title: /Set Up Bookable Services/i,
    groups: [["service", "services", "buggy", "buggies", "hire", "club hire", "trolley", "caddie"], ["set up", "setup", "create", "add", "change", "edit", "price", "rate", "cost", "charge"]],
  },
  {
    id: "add-services-to-booking",
    title: /Add Services to a Booking|Check Services on a Tee-Time Booking/i,
    groups: [["booking", "tee booking", "tee time", "event booking", "tomorrow booking"], ["buggy", "buggies", "club", "clubs", "club hire", "hire clubs", "service", "services", "extras", "trolley"]],
  },
  {
    id: "member-groups-for-messaging",
    title: /Set Up Member Groups for Messaging/i,
    groups: [["group", "groups", "member group", "member groups", "senior", "seniors", "junior", "juniors"], ["email", "text", "sms", "message", "messaging"]],
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
    id: "general-payment-request",
    title: /Create a General Payment Request/i,
    groups: [["non-booking", "non booking", "general payment", "payment link", "pay link", "society organiser", "society organizer", "room hire", "function room", "facility"], ["payment link", "pay link", "request", "owes", "balance", "deposit", "hire"]],
  },
  {
    id: "unsafe-bulk-booking-change",
    title: /bulk-delete or bulk-cancellation instructions|Bulk Booking Change Guardrail/i,
    groups: [["delete", "remove", "cancel"], ["all bookings", "all visitor bookings", "all tee times", "every booking", "bulk delete", "bulk cancel", "tomorrow", "next month"]],
  },
  {
    id: "member-data-export",
    title: /Create a Filtered Member Data Export|Export Member Email Addresses/i,
    groups: [["member", "members", "junior", "membership"], ["email", "emails", "email addresses", "spreadsheet", "csv", "export", "download", "chat"]],
  },
  {
    id: "club-message-members",
    title: /Send a Club Message to All Members/i,
    groups: [["club app message", "app message", "club message", "push notification", "push message", "app notification", "notification only"], ["member", "members", "all members", "everyone", "not email", "not sms"]],
  },
  {
    id: "tee-time-usage-reservation-type",
    title: /Run Tee Time Usage by Reservation Type/i,
    groups: [["reservation type", "reservation types"], ["usage", "busy", "summer", "print", "report"]],
  },
  {
    id: "reservation-type-colours",
    title: /Set Up Reservation Types and Colours/i,
    groups: [["reservation type", "reservation types", "society bookings", "corporate reservation", "corporate"], ["colour", "color", "colours", "colors", "timesheet", "report", "reports", "configured"]],
  },
  {
    id: "tee-time-usage-report",
    title: /Run a Tee Time Usage Report/i,
    groups: [["tee time usage", "tee-time usage", "tee sheet usage", "tee usage", "usage percentage", "utilisation", "utilization", "occupancy"], ["report", "usage", "percentage", "busy", "print"]],
  },
  {
    id: "visitor-booking-reports",
    title: /Run Visitor Booking Reports|Run a Visitor Report/i,
    groups: [["visitor", "visitors"], ["report", "reports", "revenue", "totals", "by country", "online bookings"]],
  },
  {
    id: "visitor-time-band-pricing",
    title: /Set Visitor Time-Band Green Fee Rates/i,
    groups: [["twilight", "off peak", "off-peak", "quiet afternoon", "dynamic pricing", "cheaper", "cheaper online"], ["green fee", "green fees", "price", "prices", "pricing", "rate", "rates", "visitor", "online"]],
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
    id: "member-visitor-booking-rules",
    title: /Check Member and Visitor Online Booking Rules/i,
    groups: [["member", "members"], ["visitor", "visitors"], ["slot", "slots", "before", "after", "noon", "online", "book", "booking", "rules"]],
  },
  {
    id: "add-contact-company-record",
    title: /Add a New Contact/i,
    groups: [["hotel", "society", "tour operator", "company"], ["partner", "company record", "record", "sending guests", "sends visitors", "store", "details", "contact"]],
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
    id: "facility-booking-create",
    title: /Make a Facility Booking/i,
    groups: [["facility", "room", "restaurant room", "function room", "meeting room", "resource"], ["book", "booking", "reserve", "reservation"]],
  },
  {
    id: "facility-booking-terms",
    title: /Set Up Legal Messages/i,
    groups: [["facility booking terms", "facility terms", "room booking", "room bookings", "meeting room"], ["change", "set", "terms", "conditions", "agree", "wording"]],
  },
  {
    id: "dashboard-today-bookings",
    title: /View Today's Bookings on the Dashboard/i,
    groups: [["today", "todays", "today's"], ["booking", "bookings", "bookins", "tee times", "tee time"]],
  },
  {
    id: "single-tee-time-booking",
    title: /Add a Single Tee Time Booking|Add a Tee-Time Booking from the Timesheet/i,
    groups: [["tee time", "tee slot", "timesheet", "tee sheet", "sheet", "golfer", "player", "customer", "walk-in", "walk in", "visitor", "member", "guest", "4-ball", "4 ball", "rang"], ["add", "create", "make", "put", "book", "stick"]],
  },
  {
    id: "wrong-course-booking-move",
    title: /Move a Booking to the Correct Course/i,
    groups: [["wrong course", "wrong one", "different course", "other course", "two courses"], ["booking", "booked", "tee time", "course"], ["safe", "safest", "move", "change", "switch", "correct", "fix"]],
  },
  {
    id: "tee-time-booking-notes",
    title: /Add Notes to a Tee-Time Booking/i,
    groups: [["note", "notes", "comment", "comments", "pro shop"], ["tee booking", "tee time", "booking", "timesheet", "tee sheet"], ["add", "put", "enter", "save", "update", "show"]],
  },
  {
    id: "blocked-visitor-availability",
    title: /Check Visitor Availability for Blocked Tee Times/i,
    groups: [["visitor", "visitors", "public", "online", "website", "book online"], ["blocked", "block", "reserved", "restriction", "closed", "still book", "still available", "still appears", "appears", "meant to hold", "hold internally", "grabbing times"], ["verify", "check", "why", "thought", "appears", "meant to hold", "grabbing"]],
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
    id: "membership-category-change",
    title: /Change a Member's Membership Category|Change a Member's Membership Type/i,
    groups: [["member", "members"], ["category", "membership type", "membership category", "member type", "intermediate", "full member", "full membership", "5-day", "five-day", "five day", "7-day", "seven-day", "seven day"]],
  },
  {
    id: "email-membership-type",
    title: /Email Members in a Membership Type/i,
    groups: [["email", "mail"], ["member", "members", "membership type", "membership"]],
  },
  {
    id: "add-user",
    title: /Add a User/i,
    groups: [["add", "create", "new", "needs"], ["staff", "user", "assistant", "assitant", "pro shop", "access", "acsess"]],
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
    title: /Find a Booking That Is Not Showing on the Timesheet|Find a Booking That Is Not Visible on the Timesheet/i,
    groups: [["booking", "bookng", "tee time", "booked", "customer", "visitor", "golfer", "someone", "name"], ["not on the sheet", "not on timesheet", "isnt on the sheet", "isn't on the sheet", "isnt there", "isn't there", "name isn't there", "name isnt there", "can't see", "cant see", "cannot see", "can't find", "cant find", "no one can find", "missing"]],
  },
  {
    id: "timesheet-both-courses",
    title: /View Both Courses on the Timesheet/i,
    groups: [["both courses", "all courses", "two courses", "one course", "only one course"], ["timesheet", "tee sheet", "sheet", "staff user", "admin", "course access"], ["view", "see", "show", "appears", "check", "course access"]],
  },
  {
    id: "messy-booking-payment-triage",
    title: /Triage a Messy Tee-Time Booking Issue/i,
    groups: [["booking", "booked", "paid online", "tee sheet", "timesheet", "confirmation email", "wrong course", "lad rang", "mate paid"], ["paid", "payment", "money", "buggy", "no buggy", "no one can find", "only see two names", "sheet says empty"], ["start", "checklist", "screen first", "where do i start", "calm"]],
  },
  {
    id: "staff-changed-booking-check",
    title: /Check a Booking After Staff Changed It/i,
    groups: [["disappeared", "disappear", "vanished", "gone", "missing"], ["staff changed", "changed it", "changed the staff", "moved", "deleted", "wrong slot"], ["member", "customer", "golfer", "booking", "tee time", "slot"]],
  },
  {
    id: "timesheet-course-visibility",
    title: /Check a Missing Course on the Timesheet/i,
    groups: [["course"], ["timesheet", "tee sheet", "tomorrow", "date", "day"], ["can't see", "cant see", "cannot see", "not showing", "missing", "why"]],
  },
  {
    id: "member-app-payment-visibility",
    title: /Check Payment for a Member App Booking/i,
    groups: [["member"], ["app"], ["payment", "paid", "payment missing"], ["booking", "booked", "tee time"]],
  },
  {
    id: "visitor-booking-confirmation-issue",
    title: /Check a Visitor Online Booking Confirmation Issue/i,
    groups: [["visitor", "customer", "golfer"], ["booked online", "online booking", "visitor booking", "confirmation"], ["never got", "didn't get", "didnt get", "not got", "no confirmation", "can't see", "cant see"]],
  },
  {
    id: "user-password",
    title: /Change or Reset a User Password|Change or Reset Your Own BRS Password/i,
    groups: [["password", "passwrd", "passwrod"], ["forgot", "change", "reset", "own", "user", "staff"]],
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
