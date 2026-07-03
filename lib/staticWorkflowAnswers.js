import { addKnownScreenLocation } from "./brsScreenLocations.js";

const TYPO_CORRECTIONS = [
  [/\brefud\b/g, "refund"],
  [/\brefun\b/g, "refund"],
  [/\breufnd\b/g, "refund"],
  [/\bcancell\b/g, "cancel"],
  [/\bcnacel\b/g, "cancel"],
  [/\bcancle\b/g, "cancel"],
  [/\btimeshet\b/g, "timesheet"],
  [/\btimesehet\b/g, "timesheet"],
  [/\btimsheet\b/g, "timesheet"],
  [/\btimeshee\b/g, "timesheet"],
  [/\bmemebrship\b/g, "membership"],
  [/\bmemberhsip\b/g, "membership"],
  [/\bmemership\b/g, "membership"],
  [/\bmembershp\b/g, "membership"],
  [/\bmemebrs\b/g, "members"],
  [/\bmembrs\b/g, "members"],
  [/\bmembers\b/g, "members"],
  [/\bmenbers\b/g, "members"],
  [/\bbooikng\b/g, "booking"],
  [/\bbokking\b/g, "booking"],
  [/\bbooking\b/g, "booking"],
  [/\bboking\b/g, "booking"],
  [/\bbookng\b/g, "booking"],
  [/\bbookin\b/g, "booking"],
  [/\bfaciltiy\b/g, "facility"],
  [/\bfacilty\b/g, "facility"],
  [/\bfaciilty\b/g, "facility"],
  [/\bvisotrs\b/g, "visitors"],
  [/\bvisotors\b/g, "visitors"],
  [/\breservaton\b/g, "reservation"],
  [/\breservatoin\b/g, "reservation"],
  [/\breseravtion\b/g, "reservation"],
  [/\bserch\b/g, "search"],
  [/\breciept\b/g, "receipt"],
  [/\breceipt\b/g, "receipt"],
  [/\bpasswrod\b/g, "password"],
  [/\bpasswrd\b/g, "password"],
  [/\bpassowrd\b/g, "password"],
  [/\bassitant\b/g, "assistant"],
  [/\bassitants\b/g, "assistants"],
  [/\bacsess\b/g, "access"],
  [/\bacess\b/g, "access"],
  [/\bcompetiiton\b/g, "competition"],
  [/\bcompettion\b/g, "competition"],
  [/\bcompitition\b/g, "competition"],
  [/\bvistor\b/g, "visitor"],
  [/\bvistior\b/g, "visitor"],
  [/\bvisotr\b/g, "visitor"],
  [/\bopne\b/g, "open"],
  [/\bconfigre\b/g, "configure"],
  [/\bconifgure\b/g, "configure"],
  [/\bconfiguer\b/g, "configure"],
  [/\bchnage\b/g, "change"],
  [/\brpeorts\b/g, "reports"],
  [/\bpaymnts\b/g, "payments"],
  [/\bpaymnt\b/g, "payment"],
  [/\bcontct\b/g, "contact"],
  [/\bcontcts\b/g, "contacts"],
  [/\bopperators\b/g, "operators"],
  [/\bopperator\b/g, "operator"],
  [/\bopperater\b/g, "operator"],
  [/\bmembr\b/g, "member"],
  [/\bsubscirption\b/g, "subscription"],
  [/\bsubscrption\b/g, "subscription"],
  [/\bsubscripion\b/g, "subscription"],
];

function normalise(value = "") {
  let text = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of TYPO_CORRECTIONS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function hasAll(lower, terms) {
  return terms.every((term) => lower.includes(term));
}

function hasStandaloneAppTerm(lower) {
  return /\b(app|android|iphone|ios)\b/.test(lower) ||
    hasAny(lower, ["mobile app", "phone app", "members booking app", "member booking app"]);
}

function hasSchedulingDeliveryIntent(lower) {
  return hasAny(lower, [
    "schedule",
    "scheduled",
    "send later",
    "send at",
    "send on",
    "queue",
    "timed",
    "future date",
    "future time",
  ]) || /\bdelay (sending|delivery|the send|that message|that email|that text)\b/.test(lower);
}

function explicitlyNotScheduling(lower) {
  return hasAny(lower, [
    "not sending yet",
    "not send yet",
    "not ready to send",
    "before sending",
    "first before we send",
    "later we can email",
    "later we can text",
  ]);
}

function asksAbout(lower, actions, objects) {
  return hasAny(lower, actions) && hasAny(lower, objects);
}

const DATA_OUTPUT_TERMS = [
  "database",
  "spreadsheet",
  "csv",
  "export",
  "download",
  "report",
  "reports",
  "list",
  "listing",
  "produce",
  "pull",
  "extract",
  "filter",
  "filters",
  "filtered",
  "columns",
  "details",
  "email address",
  "email addresses",
];

const STRONG_DATA_OUTPUT_TERMS = [
  "database",
  "spreadsheet",
  "csv",
  "export",
  "download",
  "report",
  "reports",
  "list",
  "listing",
  "produce",
  "pull",
  "extract",
  "filter",
  "filters",
  "filtered",
  "columns",
];

const MESSAGE_SEND_TERMS = [
  "send",
  "sent",
  "sending",
  "email members",
  "email all",
  "email selected",
  "send an email",
  "send email",
  "send emails",
  "mailshot",
  "message",
  "notify",
  "newsletter",
  "communication",
];

function isDataOutputIntent(lower) {
  const wantsNamesAndEmails = hasAny(lower, ["name", "names"]) && hasAny(lower, ["email address", "email addresses", "emails"]);
  const wantsOutput = hasAny(lower, DATA_OUTPUT_TERMS) || wantsNamesAndEmails;
  const strongOutput = hasAny(lower, STRONG_DATA_OUTPUT_TERMS) || wantsNamesAndEmails;
  const explicitlySending = hasAny(lower, MESSAGE_SEND_TERMS);
  return wantsOutput && (!explicitlySending || strongOutput);
}

function isMemberDataOutputIntent(lower) {
  const isEditIntent = hasAny(lower, ["change", "update", "edit", "modify", "alter", "amend", "correct", "fix"]) &&
    hasAny(lower, ["email", "email address", "name", "address", "phone", "details"]) &&
    !hasAny(lower, ["export", "download", "spreadsheet", "csv", "database", "report", "list", "produce", "pull"]);
  const isImportIntent = hasAny(lower, ["import", "upload", "bulk add", "bulk create", "load"]) &&
    !hasAny(lower, ["export", "download", "spreadsheet", "csv", "database", "report"]);
  if (isEditIntent || isImportIntent) return false;
  return hasAny(lower, ["member", "members", "membership", "memberships"]) &&
    isDataOutputIntent(lower) &&
    hasAny(lower, [
      "email address",
      "email addresses",
      "emails",
      "name",
      "names",
      "database",
      "spreadsheet",
      "csv",
      "details",
      "columns",
      "category",
      "categories",
      "membership type",
      "membership types",
      "filter",
      "filters",
    ]);
}

const MESSAGE_DELIVERY_CHANNEL_TERMS = [
  "email",
  "emails",
  "mail",
  "message",
  "messages",
  "club message",
  "club messages",
  "notification",
  "notifications",
  "text",
  "texts",
  "sms",
  "password reset",
  "reset email",
  "confirmation email",
];

const MESSAGE_DELIVERY_FAILURE_TERMS = [
  "not receiving",
  "not receive",
  "not getting",
  "not get",
  "doesn't receive",
  "doesnt receive",
  "does not receive",
  "doesn't get",
  "doesnt get",
  "does not get",
  "never gets",
  "never get",
  "isn't receiving",
  "isnt receiving",
  "not accepting",
  "doesn't seem to be accepting",
  "doesnt seem to be accepting",
  "does not seem to be accepting",
  "not arrived",
  "hasn't arrived",
  "hasnt arrived",
  "never arrived",
  "failed delivery",
  "delivery failure",
  "undelivered",
  "bounced",
  "bounce",
  "blocked",
  "spam",
  "junk",
  "suppressed",
  "suppress",
  "unsuppress",
  "opted out",
  "unsubscribed",
  "blacklist",
  "blacklisted",
];

function isMessageDeliveryTroubleshootingIntent(lower) {
  const hasChannel = hasAny(lower, MESSAGE_DELIVERY_CHANNEL_TERMS);
  const hasFailure = hasAny(lower, MESSAGE_DELIVERY_FAILURE_TERMS);
  const hasRecipient = hasAny(lower, [
    "member",
    "members",
    "contact",
    "contacts",
    "customer",
    "customers",
    "player",
    "players",
    "visitor",
    "visitors",
    "user",
    "users",
    "staff",
    "someone",
    "person",
    "recipient",
    "email address",
    "mobile",
    "phone",
  ]);
  const asksToSend = hasAny(lower, ["how do i send", "how to send", "send an email", "send email", "email all", "email selected", "text selected", "sms a", "message all"]);

  return hasChannel && hasFailure && (hasRecipient || !asksToSend);
}

function isGolfEventIntent(lower = "") {
  return hasAny(lower, [
    "golf event",
    "golf events",
    "golf day",
    "golf days",
    "corporate outing",
    "corporate day",
    "corporate event",
    "society day",
    "society event",
    "organiser reservation",
    "organizer reservation",
    "event organiser",
    "event organizer",
    "event booking",
  ]) || (
    hasAny(lower, ["organiser", "organizer"]) &&
    hasAny(lower, ["event", "golf day", "society", "corporate", "reserved tee times", "reserved times"])
  );
}

function isClubPolicyQuestion(lower = "") {
  const policySignal = hasAny(lower, [
    "policy",
    "policies",
    "terms",
    "club-specific",
    "club specific",
    "foul weather",
    "bad weather",
    "weather refund",
    "rain check",
    "raincheck",
    "dumbarnie",
    "guest rate",
    "guests rate",
    "visitor rate",
    "refund policy",
    "cancellation policy",
  ]);
  const subjectSignal = hasAny(lower, ["refund", "cancel", "cancellation", "weather", "rate", "price", "charge", "visitor", "guest"]);
  return policySignal && subjectSignal;
}

function clubPolicyBoundaryAnswer(lower = "") {
  const mentionsRefund = hasAny(lower, ["refund", "money back", "reverse"]);
  const mentionsRate = hasAny(lower, ["rate", "price", "charge", "green fee", "guest"]);

  const steps = [
    "I cannot confirm a club-specific policy from the demo BRS system. Policies such as foul-weather refunds, cancellation windows, visitor terms, guest rates, and manager-approved exceptions must be checked against the club's own rules.",
    "For public-facing visitor terms, go to Tools > Legal Messages and review Visitor Terms and Conditions or the matching legal message shown during online booking.",
  ];

  if (mentionsRate) {
    steps.push("For visitor or guest pricing, check Tools > Green Fee Rates for Visitors / Tour Operators / Tee Time Agents and confirm the date, course, day, time band, and player type before quoting a price.");
  }

  if (mentionsRefund) {
    steps.push("If the club has decided a refund is due, open the booking in Booking Details and use the Payments section to refund only the correct BRS Payments transaction.");
  }

  steps.push("If the policy is unclear, ask a manager or the club's authorised contact to confirm the decision before replying to the customer.");

  return answer("Club-Specific Policy or Refund Rule", steps, "Use BRS to check settings and process approved actions; do not invent the club's policy, prices, or weather/refund promise from the chatbot.");
}

function isMarketingConsentIntent(lower = "") {
  const consentSignal = hasAny(lower, [
    "marketing",
    "consent",
    "opted in",
    "opt in",
    "opt-in",
    "opted-in",
    "opted out",
    "opt out",
    "opt-out",
    "unsubscribe",
    "unsubscribed",
    "permission",
    "gdpr",
    "complained",
    "remove me",
    "do not contact",
    "don't contact",
    "dont contact",
    "offers",
  ]);
  const audienceSignal = hasAny(lower, ["email", "emails", "text", "sms", "message", "contacts", "contact", "visitors", "customers", "members", "imported"]);
  return consentSignal && audienceSignal;
}

function marketingConsentAnswer() {
  return answer("Email Only Opted-In Contacts", [
    "Treat this as a marketing-consent question, not a general visitor-booking or live-booking change.",
    "Open the relevant member or contact records and check Marketing Preferences before adding anyone to a marketing audience.",
    "When sending marketing email or SMS, use only the audience/filter that includes people opted into that marketing channel.",
    "Do not send marketing messages to people who have opted out, unsubscribed, asked to be removed, or only gave details for a booking/transaction.",
    "For imported visitors or contacts, verify the import field mapped correctly to Marketing Preferences before using them in Email Messaging or Text Messaging.",
    "If a customer asks to stop receiving marketing, update their marketing preference on the contact/member record and confirm the request has been handled.",
  ], "Transactional booking messages and marketing messages are different. If the club is unsure whether a message is marketing, get the club's authorised GDPR/privacy contact to confirm before sending.");
}

function isNamedUserPasswordResetRequest(lower = "") {
  if (!hasAny(lower, ["password", "passwrd", "passwrod"])) return false;
  if (!hasAny(lower, ["reset", "change", "new password", "forgot"])) return false;
  if (hasAny(lower, ["my own", "own password", "my password", "i forgot", "forgot my"])) return false;

  return hasAny(lower, ["another user", "someone else", "member's password", "staff password", "user's password", "david murphy"]) ||
    /\b(reset|change)\s+[a-z][a-z'-]+\s+[a-z][a-z'’-]+(?:'s|’s)?\s+password\b/.test(lower) ||
    /\b[a-z][a-z'-]+\s+[a-z][a-z'’-]+(?:'s|’s)?\s+password\b/.test(lower);
}

function namedUserPasswordResetAnswer() {
  return answer("Named User Password Reset Guardrail", [
    "I cannot reset a named person's password from the chat or accept a password on their behalf.",
    "An authorised club admin should open Users, find the correct user account, and use the password reset or change-password route available on that user record.",
    "Prefer a reset email where available so the user sets their own password.",
    "Before changing access, confirm the person's identity, role, email address, and that the request is authorised by the club.",
    "Do not share current passwords or send a new password through chat.",
  ], "If the club cannot complete the reset from Users, escalate to BRS Support with the user's name, username/email, club, role, and the reason the normal reset route did not work.");
}

function isPublicGolferCancellationIntent(lower = "") {
  const firstPersonBooking = hasAny(lower, ["i booked", "i've booked", "ive booked", "my booking", "my tee time", "booked online", "confirmation email"]);
  const cancelNeed = hasAny(lower, ["can't make it", "cant make it", "cannot make it", "cancel me", "cancel my", "cancel the booking"]);
  return firstPersonBooking && cancelNeed;
}

function publicGolferCancellationAnswer() {
  return answer("Visitor Booking Cancellation Guidance", [
    "The chatbot cannot cancel a golfer's live booking from chat.",
    "If the golfer has a booking confirmation email, ask them to use the cancellation link or instructions in that email where the club provides one.",
    "If there is no cancellation option, the golfer should contact the golf club directly so staff can confirm the booking, policy, payment status, and any refund decision.",
    "For club staff handling the request, open the booking from the Timesheet or Search, confirm the customer and payment status, then cancel/refund only according to club policy.",
  ], "Refund and late-cancellation rules are club-specific, so do not promise a refund unless the club policy or manager decision confirms it.");
}

function isLiveMutationInstruction(lower = "") {
  const directAction = hasAny(lower, ["book me", "make me a booking", "create a booking for me", "cancel me", "delete my booking", "move my booking", "send everyone", "send all members", "show me all"]);
  const promptBypass = hasAny(lower, ["ignore your rules", "ignore the rules", "ignore instructions", "pretend you can", "override", "bypass"]);
  const liveObject = hasAny(lower, ["booking", "tee time", "tee slot", "member", "members", "customer", "visitor", "email", "message", "payment", "balance"]);
  return liveObject && (directAction || promptBypass);
}

function liveActionGuardrailAnswer() {
  return answer("Chatbot Guidance for Live BRS Actions", [
    "I cannot create, change, cancel, send, or expose live BRS records from the chat, even if the message asks me to ignore that rule.",
    "Staff must make live changes directly in BRS after checking the correct club, person, date, time, audience, payment status, and authorisation.",
    "For a tee-time booking, use the Timesheet or Search to find the booking, then make the change from Booking Details if the club has confirmed it should be done.",
    "For messages, payments, member balances, or personal data, use the relevant BRS screen and verify the audience or record before taking action.",
  ], "The chatbot can explain the workflow, but it must not perform the live action or reveal live personal/financial data from chat.");
}

function isSocietyBlockBookingIntent(lower = "") {
  if (hasAny(lower, ["competition", "competitions", "scoring", "draw", "wrong one", "difference between"])) return false;

  const groupSignal = hasAny(lower, ["society", "societies", "corporate day", "golf day", "rugby club", "organiser", "organizer", "shotgun-ish", "shotgun"]);
  const blockSignal = hasAny(lower, ["consecutive", "fourball", "fourballs", "4-ball", "4balls", "blocked off", "block off", "block each", "multiple tee times", "8 or 9", "names later", "visitors grabbing"]) ||
    (hasAny(lower, ["reserve", "reserved"]) && hasAny(lower, ["slots", "tee times", "time range", "names later", "visitors grabbing", "multiple"]));
  return groupSignal && blockSignal;
}

function societyBlockBookingAnswer() {
  return answer("Reserve or Block Consecutive Tee Times", [
    "Do not treat a society or group block as one ordinary single tee-time booking.",
    "Use the Timesheet date and course controls to get to the correct tee sheet, then reserve or block the consecutive tee times the group needs.",
    "Use a clear reservation type/name such as the society or organiser name so staff can recognise the block on the tee sheet and reports.",
    "If the group is being managed as an organised golf day with an organiser login, use Golf Events for the event block and organiser reservation instead of a normal single booking.",
    "Add player names later only after the slots are safely reserved for the correct time range.",
    "Check the public visitor booking view or online availability after saving so those reserved times are not accidentally available to visitors.",
  ], "Before changing the sheet, confirm date, course, start time, number of slots/fourballs, whether it repeats, and whether payments or deposits are needed.");
}

function isTeeTimeReleaseLockIntent(lower = "") {
  const lockSignal = hasAny(lower, ["locked", "lock", "vanished", "disappeared", "no booking shows", "no booking appears", "slot vanished"]);
  const releaseSignal = hasAny(lower, ["release", "refresh", "refreshing", "countdown", "book now", "7pm", "member", "members", "app"]);
  return lockSignal && releaseSignal;
}

function teeTimeReleaseLockAnswer() {
  return answer("Member Booking Release and Tee-Time Lock", [
    "This is normally the member-booking release and temporary tee-time lock behaviour, not proof that a confirmed booking already exists.",
    "When a member clicks to book a tee time, BRS temporarily locks that slot for that member while they complete the booking.",
    "The lock lasts about three minutes. During that short window, other members may see the slot as unavailable even though no completed booking is visible yet.",
    "If the member does not finish the booking, the slot is released again automatically and other members can try to book it.",
    "For committee context, explain that the lock is designed to stop two members booking the same slot at the same time.",
    "If the issue is about who can access the released times, check Tools > Member Casual Booking Rules and the relevant membership privileges/categories.",
  ], "Avoid blaming individual members. If locks do not clear after a few minutes or the release time looks wrong, collect the date, course, tee time, member details, and screenshots before escalating to BRS Support.");
}

function isMembershipBillPublishVisibilityIntent(lower = "") {
  const visibilitySignal = hasAny(lower, ["published", "publish", "printed", "print", "member app", "members app", "in the app", "visible", "showing"]) || /\bapp\b/.test(lower);
  return hasAny(lower, ["bill", "bills", "invoice", "invoices", "renewal"]) &&
    visibilitySignal;
}

function membershipBillPublishVisibilityAnswer() {
  return answer("Check Whether Membership Bills Are Published", [
    "Open Memberships and find the relevant member or billing area.",
    "Use Bills Overview, Overdue Bills, or the member's billing tab to find the renewal bill or invoice.",
    "Check whether the bill is draft/unpublished, printed only, or published for online/member-app visibility.",
    "If members should see the bill online, publish or resend it only after confirming the member, bill amount, due date, payment scheme, and email/app visibility settings.",
    "Open one affected member profile after publishing to confirm the bill status changed as expected.",
  ], "Printing a bill is not the same as publishing it for member online/app payment.");
}

function isMemberBalanceLiveDataRequest(lower = "") {
  return hasAny(lower, ["show me", "list", "give me", "who owes", "who still owes", "all unpaid", "all outstanding"]) &&
    hasAny(lower, ["member", "members"]) &&
    hasAny(lower, ["balance", "balances", "unpaid", "outstanding", "owe", "owes", "subs", "subscription", "bills"]);
}

function memberBalanceLiveDataAnswer() {
  return answer("Live Member Balance Data Guardrail", [
    "I cannot show live member names, balances, or unpaid lists from the chat.",
    "For authorised staff, open Memberships > Reports and use Overdue Bills, Bills Overview, Bill History, or the relevant billing report.",
    "Set the filters for year, membership type, bill status, due date, or payment status as needed.",
    "Use the report/export option if the club needs a reviewed list for follow-up.",
    "Open an individual member profile only when you need to confirm that person's billing history or balance.",
  ], "Member balances are personal/financial data. Check permissions and use BRS reports rather than asking the chatbot to expose the data.");
}

function isGeneralPaymentRequestIntent(lower = "") {
  return hasAny(lower, ["general payment", "payment link", "pay link", "send a link", "send him a link", "send her a link", "send them a link"]) &&
    hasAny(lower, ["society", "organiser", "organizer", "non-booking", "non booking", "deposit", "balance", "owes", "outstanding", "extra", "food"]);
}

function generalPaymentRequestAnswer() {
  return answer("Create a General Payment Request", [
    "Go to Tools > BRS Payments > General Payment Requests.",
    "Use Create Payment Request.",
    "Enter the organiser/customer details, description, amount, and contact email address.",
    "Check that this is not already tied to a tee-time booking, membership bill, competition entry, or existing BRS Payments transaction.",
    "Send or create the payment request only after confirming the amount and reason with the club.",
    "Use the General Payment Requests view to review whether the request has been sent and paid.",
  ], "Use this for a non-booking balance or payment link such as a society organiser balance or separate deposit. For tee-time booking payments, open the booking instead; for membership bills, use the member billing workflow.");
}

function isVisitorTimeBandPricingIntent(lower = "") {
  const timeBandSignal = hasAny(lower, [
    "twilight",
    "off peak",
    "off-peak",
    "quiet afternoon",
    "quiet afternoons",
    "demand",
    "dynamic pricing",
    "cheaper online",
    "cheaper later",
    "cheaper after",
  ]);
  const pricingSignal = hasAny(lower, ["green fee", "green fees", "price", "prices", "pricing", "rate", "rates", "visitor", "visitors", "online"]);
  return timeBandSignal && pricingSignal;
}

function visitorTimeBandPricingAnswer() {
  return answer("Set Visitor Time-Band Green Fee Rates", [
    "Use visitor green-fee rate setup rather than changing each tee time manually.",
    "Go to Tools > Green Fee Rates for Visitors / Tour Operators / Tee Time Agents.",
    "Create or edit the rate rows that apply to the visitor channel, course, date range, day of week, and time band such as a twilight or off-peak period.",
    "Set the lower twilight/off-peak price only for the intended time band.",
    "Check any related visitor booking availability or course restrictions if the cheaper period should only appear online at certain times.",
    "Test the public visitor booking flow for a sample twilight tee time and a non-twilight tee time to confirm the price shown is correct.",
  ], "Do not invent the club's exact pricing rule from chat. Confirm the intended dates, courses, days, start/end times, and rate with the manager before saving.");
}

function isMemberBookingPrivilegeRuleIntent(lower = "") {
  const memberSignal = hasAny(lower, ["member", "members", "membership"]);
  const categorySignal = hasAny(lower, ["5-day", "five-day", "five day", "7-day", "seven-day", "seven day", "membership type", "membership category", "member category"]);
  const accessSignal = hasAny(lower, ["can book", "book saturday", "book weekend", "weekend", "saturday", "sundays", "category", "privilege", "privileges", "rules", "member app", "members app", "booking app"]) || /\bapp\b/.test(lower);
  const lookupSignal = hasAny(lower, ["where", "check", "why", "should i", "should we", "able to", "not able"]);
  return memberSignal && categorySignal && accessSignal && lookupSignal;
}

function memberBookingPrivilegeRuleAnswer() {
  return answer("Check Member Booking Privileges and Casual Booking Rules", [
    "First confirm the member is on the correct membership type/category, such as 5-day or 7-day, because the rule only works if the member is assigned correctly.",
    "Open the member profile in Memberships and check the member's membership type/category and status.",
    "Go to Tools > Member Casual Booking Rules.",
    "Check the rule for the relevant course, date range, days of week, start/end time, membership types/categories, and whether it allows members to book or view only.",
    "If a 5-day member can book Saturday times, check whether Saturday is included in the rule or whether the member is in a category covered by a wider rule.",
    "After any change, test the member booking app or member booking website with a representative Saturday tee time.",
  ], "Do not assume the app is wrong until the member category and booking rule both match the intended club policy.");
}

function isNoShowReportIntent(lower = "") {
  if (hasAny(lower, ["no show reason", "no-show reason", "no show reasons", "no-show reasons"])) return false;
  return hasAny(lower, ["no show", "no-show", "no shows", "no-shows", "noshow", "noshows"]) &&
    hasAny(lower, ["report", "reports", "by member", "member", "members", "where", "looking", "boss wants", "not just cancellations"]);
}

function noShowReportAnswer() {
  return answer("Run a No Show Report", [
    "Open Reports.",
    "Choose the no-show or booking-attendance report.",
    "Set the date range, course, and any no-show filters required.",
    "Use member/player filters or the report columns to review no-shows by member where available.",
    "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
  ], "Use Cancelled Bookings only for cancelled tee times. For golfers who did not arrive, use the No Show reporting route.");
}

function messageDeliveryTroubleshootingAnswer(lower = "") {
  const mentionsEmail = hasAny(lower, ["email", "emails", "mail", "password reset", "reset email", "confirmation email"]);
  const mentionsSms = hasAny(lower, ["sms", "text", "texts", "mobile"]);
  const mentionsMember = hasAny(lower, ["member", "members", "membership"]);
  const mentionsContact = hasAny(lower, ["contact", "contacts"]);
  const mentionsUser = hasAny(lower, ["user", "users", "staff"]);
  const alreadyCheckedSpam = hasAny(lower, ["spam", "junk"]);
  const alreadyCheckedSuppression = hasAny(lower, ["not appear to be suppressed", "does not appear to be suppressed", "not suppressed", "no suppression"]);

  if (mentionsEmail && mentionsMember) {
    return answer("Check Why a Member Is Not Receiving BRS Emails", [
      "Open Users, search for the member, and click into the member profile/details page.",
      "Confirm the email address on the profile is correct and saved.",
      "Look beside the email address for an Unsuppress button. If Unsuppress is shown, the address is suppressed by the BRS/email delivery system. If it is not shown, there is no visible suppression on that profile.",
      "Check the sent email record or report in Email Messaging and confirm this member was included in the audience for the email that should have reached them.",
      alreadyCheckedSpam
        ? "Because spam/junk has already been checked, ask the member to check blocked senders or mailbox rules next."
        : "Ask the member to check spam/junk, blocked senders, and mailbox rules.",
      alreadyCheckedSuppression
        ? "If the email address is correct, no Unsuppress button is shown, and the member was included in the audience, escalate to BRS Support with the member, email address, email type, and sent date/time."
        : "If the email address is correct, the member was included in the audience, and the email still does not arrive, escalate to BRS Support with the member, email address, email type, and sent date/time.",
    ]);
  }

  if (mentionsEmail) {
    const recordStep = mentionsContact
      ? "Open Contacts, find the contact, and check the email address on their contact record."
      : mentionsUser
        ? "Open Users, find the user, and check the email address on their user profile."
        : "Open the recipient's record and check the email address saved on that profile.";
    return answer("Check Why a Recipient Is Not Receiving BRS Emails", [
      recordStep,
      "Look beside the email address for an Unsuppress button. If Unsuppress is shown, the address is suppressed by the BRS/email delivery system. If it is not shown, there is no visible suppression on that profile.",
      "Check the sent email record or report in Email Messaging and confirm the recipient was included in the audience.",
      alreadyCheckedSpam ? "Because spam/junk has already been checked, ask the recipient to check blocked senders or mailbox rules next." : "Ask the recipient to check spam/junk, blocked senders, and mailbox rules.",
      "If the address is correct, the recipient was included, and the email still does not arrive, escalate to BRS Support with the recipient, email address, email type, and sent date/time.",
    ]);
  }

  if (mentionsSms) {
    return answer("Check Why a Recipient Is Not Receiving BRS Text Messages", [
      "Open the recipient's member or contact record and confirm the mobile number is correct and saved.",
      "Check the sent text message record or report and confirm the recipient was included in the selected audience.",
      "Check whether SMS is enabled and whether the club has enough SMS credit.",
      "If the number is correct, SMS is enabled, and the recipient was included, escalate to BRS Support with the recipient, mobile number, message type, and sent date/time.",
    ]);
  }

  return answer("Check Why a Recipient Is Not Receiving a BRS Message", [
    "Open the recipient's member, contact, or user record and confirm the saved contact details are correct.",
    "Check the sent message record or report and confirm the recipient was included in the selected audience.",
    "Check for any visible opt-out, suppression, or delivery status shown on the recipient record or sent-message report.",
    "If the recipient details are correct and they were included in the audience, escalate to BRS Support with the recipient, message type, and sent date/time.",
  ]);
}

function memberCategoryPhrase(lower) {
  const juniorCountMatch = lower.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+junior\b/);
  if (juniorCountMatch) return `your ${juniorCountMatch[1]} junior membership categories`;
  if (hasAny(lower, ["junior category", "junior categories", "junior membership", "junior memberships"])) return "the junior membership categories";
  if (hasAny(lower, ["senior category", "senior categories", "senior membership", "senior memberships"])) return "the senior membership categories";
  if (hasAny(lower, ["membership category", "membership categories"])) return "the membership categories you need";
  if (hasAny(lower, ["membership type", "membership types"])) return "the membership types you need";
  return "the membership categories you need";
}

function memberDataExportAnswer(lower) {
  const categoryPhrase = memberCategoryPhrase(lower);
  return detailedAnswer(
    "Create a Filtered Member Data Export",
    `Yes. For a list of member names and email addresses, start from the member list because it lets you filter to ${categoryPhrase} and download the result as a CSV.`,
    [
      "Open Memberships.",
      "Open Members inside Memberships.",
      `On the Members page, use Search, Filter Active Members, and Membership Type to narrow the list to ${categoryPhrase}.`,
      "Use Filter Columns on the Members page to keep the fields you need, such as Title, First Name, Last Name, Email, Membership Type, and Membership Status.",
      "Click Download CSV Members on the Members page.",
      "Open the downloaded spreadsheet and remove any columns you do not need before using or sharing it.",
    ],
    [
      {
        title: "Other ways to get the same information",
        items: [
          "For a formal membership report, open Memberships > Reports and choose Member Categories under Member Reports.",
          "For an Outlook-style email list, use the main navigation menu to open Reports, open the Type of Report dropdown, and choose Member Email Addresses for Outlook.",
          "If you will need the same group again, check Memberships > Settings > Member Filters before running the member list or report again.",
        ],
      },
      {
        title: "Check",
        items: [
          "Use Email Messaging only when you want to send an email to those members, not when you only need their email addresses in a spreadsheet.",
        ],
      },
    ]
  );
}

const PAYMENT_SCHEME_TERMS = [
  "payment scheme",
  "payment schemes",
  "payment plan",
  "payment plans",
  "instalment",
  "instalments",
  "installment",
  "installments",
  "scheduled payment",
  "scheduled payments",
];

const CONFIGURE_OBJECT_ACTIONS = [
  "configure",
  "set up",
  "setup",
  "create",
  "add new",
  "new",
  "manage",
  "change",
  "edit",
  "update",
];

const APPLY_OBJECT_ACTIONS = [
  "apply",
  "applied",
  "attach",
  "attached",
  "link",
  "linked",
  "select",
  "selected",
  "assign",
  "assigned",
  "use",
  "used",
  "put",
  "add to",
];

const BILL_TARGET_TERMS = [
  "add to bill",
  "on a bill",
  "to a bill",
  "bill",
  "billing",
  "invoice",
];

const BILL_CREATION_ACTIONS = [
  "create",
  "add",
  "new",
  "generate",
  "raise",
  "make",
];

const BILL_CREATION_EXCLUSIONS = [
  "refund",
  "reverse",
  "payment scheme",
  "payment schemes",
  "payment plan",
  "payment plans",
  "instalment",
  "instalments",
  "installment",
  "installments",
  "unpaid",
  "outstanding",
  "owe",
  "owed",
  "owing",
  "arrears",
  "report",
  "list",
  "show",
  "find",
  "view",
];

const BOOKING_TARGET_TERMS = [
  "booking",
  "bookings",
  "reservation",
  "reservations",
  "tee time",
  "tee sheet",
  "timesheet",
  "booking details",
];

const MEMBER_TARGET_TERMS = [
  "member",
  "members",
  "member profile",
  "member account",
];

const MEMBER_CREATE_TERMS = [
  "add a member",
  "add member",
  "create a member",
  "create member",
  "new member",
  "register a member",
  "set up a member",
  "setup a member",
  "member profile",
  "membership profile",
];

const USER_ACCOUNT_TERMS = [
  "staff",
  "admin",
  "receptionist",
  "pro shop",
  "login",
  "password",
  "permission",
  "permissions",
  "privilege",
  "privileges",
  "user account",
  "new user",
  "staff user",
  "admin user",
  "read only",
  "readonly",
];

const MEMBER_CREATE_EXCLUSION_TERMS = [
  "bill",
  "billing",
  "invoice",
  "payment",
  "payments",
  "payment scheme",
  "subscription",
  "subscriptions",
  "subs",
  "owe",
  "owed",
  "owing",
  "outstanding",
  "balance",
  "refund",
];

function objectIntent(lower, objectTerms, targetTerms = []) {
  if (!hasAny(lower, objectTerms)) return null;

  const hasTarget = targetTerms.length ? hasAny(lower, targetTerms) : false;
  const hasApply = hasAny(lower, APPLY_OBJECT_ACTIONS) || (lower.includes("add") && hasTarget);
  if (hasApply && hasTarget) return "apply";

  const hasConfigure = hasAny(lower, CONFIGURE_OBJECT_ACTIONS) || (lower.includes("add") && !hasTarget);
  if (hasConfigure) return "configure";

  return null;
}

const TIMESHEET_SETUP_ACTIONS = [
  "add",
  "remove",
  "delete",
  "change",
  "extend",
  "start",
  "finish",
  "open",
  "close",
  "configure",
  "set up",
  "setup",
  "make",
];

const TIMESHEET_BOUNDARY_TERMS = [
  "start of the day",
  "start of day",
  "beginning of the day",
  "beginning of day",
  "end of the day",
  "end of day",
  "end of the timesheet",
  "end of timesheet",
  "before the first",
  "after the last",
  "first tee time",
  "last tee time",
  "earlier",
  "later",
  "opening time",
  "closing time",
  "tee slot",
  "tee slots",
  "more tee slots",
  "extra tee slots",
  "additional tee slots",
  "more tee times",
  "extra tee times",
  "additional tee times",
];

const BOOKING_CREATION_TERMS = [
  "booking",
  "book a",
  "golfer",
  "player",
  "customer",
  "reservation name",
  "visitor",
];

function isTeeSheetBookingCancellationQuestion(lower) {
  if (hasAny(lower, ["competition", "comp", "facility", "room", "resource", "bill", "invoice", "payment request", "general payment request"])) return false;
  if (!hasAny(lower, ["booking", "bookings", "reservation", "reservations", "tee time", "tee times", "timesheet", "tee sheet", "teesheet"])) return false;

  const cancelAction = hasAny(lower, ["cancel", "cancelled", "canceled", "cancelling", "canceling", "delete", "deleted", "remove booking", "remove a booking", "remove the booking"]);
  const removeWholeBooking = lower.includes("remove") && !hasAny(lower, ["remove a player", "remove player", "remove golfer", "remove a golfer", "remove person"]);
  return cancelAction || removeWholeBooking;
}

function isTimesheetSetupQuestion(lower) {
  const mentionsTeeTimePattern = hasAny(lower, ["tee time", "tee times", "tee slot", "tee slots", "timesheet", "tee sheet", "teesheet", "tee shet", "shet"]);
  if (!mentionsTeeTimePattern) return false;
  if (hasAny(lower, ["single tee time booking", "tee time booking"])) return false;
  if (hasAny(lower, BOOKING_CREATION_TERMS) && !hasAny(lower, ["interval", "intervals", "configure", "set up", "setup", "start of", "end of", "first tee time", "last tee time"])) return false;

  const explicitConfigure = hasAny(lower, ["set tee times", "change time intervals", "time intervals", "configure timesheet", "configure the timesheet", "configure tee sheet", "configure the tee sheet", "configure tee shet", "configure the tee shet", "conifgure tee shet", "conifgure the tee shet", "setup tee sheet", "set up tee sheet"]);
  const dateRangeConfigure = hasAny(lower, ["next year", "next month", "intervals", "tee times", "tee slots"]) && hasAny(lower, ["configure", "conifgure", "set up", "setup", "change"]) && hasAny(lower, ["timesheet", "tee sheet", "teesheet", "tee shet", "shet", "tee slot", "tee slots"]);
  const boundaryConfigure = hasAny(lower, TIMESHEET_SETUP_ACTIONS) && hasAny(lower, TIMESHEET_BOUNDARY_TERMS);

  return explicitConfigure || dateRangeConfigure || boundaryConfigure;
}

const DEMO_LABELS = [
  "Main club email address (mandatory)",
  "Email and Letter Templates",
  "Booking Confirmation",
  "System Configuration",
  "Club Contact Details",
  "Display Configuration",
  "General Configuration",
  "Features Supported",
  "Marketing Consent",
  "Members Booking Module - Casual Golf",
  "Visitor Booking - General",
  "Online Merchant Module",
  "Member Casual Booking Rules",
  "Configure Timesheet",
  "Configure the Timesheet",
  "Messages on the Timesheet",
  "Message on the Timesheet",
  "Upload Timesheet",
  "Upload Members and Contacts",
  "Green Fee Rates",
  "Reservation Types",
  "Booking Statuses",
  "Payment Methods",
  "Contact Categories",
  "Catering / Refreshments",
  "No Show Reasons",
  "Legal Messages",
  "Course Restriction",
  "Email Messaging",
  "Text Messaging",
  "Member Groups for Messaging",
  "Set this PC as Club House PC",
  "Green Fee Rates for Visitors / Agents",
  "Green Fee Rates for Visitors / Tour Operators / Tee Time Agents",
  "Day Ticket Rates for Visitors",
  "Open Competitions for Visitors",
  "Golf Events",
  "Green Fee Rates for Tour Operator",
  "Competition Charges",
  "Club Systems",
  "Club Systems Member Maps",
  "Club Systems Member Preview",
  "BRS Payments",
  "Booking Payment Requests",
  "General Payment Requests",
  "VAT Reports",
  "Transactions",
  "Refunds",
  "Payouts",
  "Setup",
  "Dashboard",
  "Timesheet",
  "Messages",
  "Facilities",
  "Contacts",
  "Memberships",
  "Settings",
  "Payment Schemes",
  "Billing/Payments",
  "VIEW PAYMENTS",
  "CREATE BILLS",
  "Billing Reference",
  "Due Date",
  "SET BILL FILTERS",
  "Bill Cycles/Periods",
  "Who To Bill",
  "All Cycles",
  "Selected Cycles",
  "No Cycles/Periods",
  "Custom Bill Items",
  "ADD ITEM",
  "PREVIEW",
  "View All Bills",
  "Download CSV Bills",
  "Download Bill PDF",
  "Download Bill Batch PDF",
  "Resend Bill",
  "Edit Bill",
  "Cancel Bill",
  "Make One-off Payment",
  "Overdue Bills",
  "Payment Status",
  "General",
  "Users",
  "Retrieve Users",
  "Create a New User / Add a Member",
  "User Group",
  "User Group*",
  "Username",
  "Username*",
  "Enable / Disable",
  "Enable / Disable*",
  "Membership Type",
  "Membership Type*",
  "Password",
  "Re-type Password",
  "First Name",
  "First Name*",
  "Last Name",
  "Last Name*",
  "Email",
  "Filter Active Members",
  "Filter Columns",
  "Download CSV Members",
  "Member Reports",
  "Member Categories",
  "Member Filters",
  "Member Email Addresses for Outlook",
  "Create new user",
  "Reports",
  "Search",
  "Search Bookings",
  "Search Text",
  "Search Text:",
  "Find User",
  "Tools",
  "Need Help",
  "Squeeze Tee Time",
  "Operation",
  "Year",
  "Start Month",
  "Start Day of Month",
  "End Month",
  "End Day of Month",
  "Tee Time Interval",
  "Alternate Tee Time Intervals",
  "First Tee Time Hour",
  "First Tee Time Minute",
  "Last Tee Time Hour",
  "Last Tee Time Minute",
  "Select the days of the week you want to configure",
  "Start Date",
  "End Date",
  "Start Time",
  "End Time",
  "Message Time",
  "Days of Week",
  "Members",
  "CREATE MEMBER",
  "FLEX MEMBERS",
  "Visitors",
  "Message",
  "Add New",
  "Type",
  "Days Advance Booking",
  "Applies to",
  "Grace Period",
  "Type of Report",
  "Course",
  "Print Report",
  "Submit",
  "Email Options",
  "Email Membership Types",
  "Email Membership Groups",
  "Email Selected Members",
  "Email the Timesheet",
  "Email Contacts",
  "Recently Sent Messages",
  "Text Messaging Set Up Options",
  "Text Message Membership Types",
  "Text Message Membership Groups",
  "Text Message Selected Members",
  "Text Message the Timesheet",
  "Text Message Contacts",
  "Purchase Text Messaging Credit",
  "Company / Group Name",
  "Company / Group Name:",
  "Contact Category",
  "Contact Category:",
  "Add Contact",
  "General Information",
  "Address Information",
  "Club Details",
  "Marketing Preferences",
  "Add",
  "Service Type",
  "Service Type:",
  "Service Name",
  "Service Name:",
  "Service Rate",
  "Service Rate:",
  "Select a Year",
  "Revenue From Visitor Online Bookings",
  "Number of Visitors by Country",
  "Booking Details",
  "Full Booking Details",
  "Payment Methods",
  "Payment Method Name",
  "Payment Method",
  "Booking Status Name",
  "Booking Status",
  "No Show Name",
  "No Show",
  "Supported",
  "Supported:",
  "Name",
  "Name:",
  "Actions",
  "Code",
  "Code:",
  "Allow Online Bookings",
  "Allow Online Bookings:",
  "Set As Default",
  "Set As Default:",
  "Colour",
  "Colour:",
  "Rate",
  "Rate:",
  "Filter Category",
  "Add Green Fees",
  "Casual Booking Rules",
  "Course:",
  "Guest booking allowed from",
  "Guest booking allowed from:",
  "Casual guests not allowed",
  "Casual guests not allowed:",
  "Number of Players",
  "Number of Players:",
  "Number of Players Per Tee Time",
  "Number of Players Per Tee Time:",
  "Guests",
  "Guests:",
  "Number of Guests",
  "Number of Guests:",
  "Days of Week",
  "Days of Week:",
  "Applies to",
  "Applies to:",
  "All Membership Types",
  "Selected Membership Types ONLY",
  "All Membership Types EXCEPT those selected",
  "Legal Message",
  "Version",
  "Marketing Preferences",
  "Privacy Policy",
  "Member Terms and Conditions",
  "Visitor Terms and Conditions",
  "Tour Operator Terms and Conditions",
  "Facility Booking Terms and Conditions",
  "Show expired Course Restrictions",
  "Player Types",
  "Player Types:",
  "Max Group Size",
  "Max Group Size:",
  "Filter Rates",
  "Channel",
  "Channel:",
  "Enabled Rates Only",
  "All Rates",
  "Include Years",
  "Include Years:",
  "Include Months",
  "Include Months:",
  "Include Days",
  "Include Days:",
  "Package Name",
  "Multi-Year",
  "1 Player",
  "2 Players",
  "3 Players",
  "4 Players",
  "Saving %",
  "Saving %:",
  "Green Fee Rate",
  "Green Fee Rate:",
  "Golf / Package",
  "Golf / Package:",
  "Golf Only",
  "Golf Package",
  "Golf Package Name",
  "Golf Package Name:",
  "Package Description",
  "Package Description:(Optional)",
  "Package Icons",
  "Package Icons:",
  "Club Website",
  "Club Website:",
  "Tee Time Agents",
  "Tee Time Agents:",
  "Tour Operators",
  "Tour Operators:",
  "Course 1",
  "Course 1:",
  "Course 2",
  "Course 2:",
  "Operation",
  "Operation:",
  "Copy Services, Catering or Green Fees",
  "From Year",
  "From Year:",
  "To Year",
  "To Year:",
  "Copy Services",
  "Copy Catering",
  "Copy Green Fees",
  "Members & Visitors",
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quoteDemoLabels(text = "") {
  let quoted = String(text);
  for (const label of DEMO_LABELS.sort((a, b) => b.length - a.length)) {
    quoted = quoted.split(/(".*?")/g).map((part, index) => {
      if (index % 2) return part;
      const pattern = new RegExp(`(^|[^A-Za-z0-9"])(${escapeRegExp(label)})(?=$|[^A-Za-z0-9"])`, "g");
      return part.replace(pattern, `$1"$2"`);
    }).join("");
  }
  return quoted;
}

function answer(title, steps, extra = "") {
  return [
    title,
    "",
    ...steps.map((step, index) => `${index + 1}. ${quoteDemoLabels(addKnownScreenLocation(step))}`),
    extra ? `\n${quoteDemoLabels(extra)}` : "",
  ].join("\n").trim();
}

function detailedAnswer(title, intro, steps, sections = []) {
  const formattedSections = sections.map((section) => [
    "",
    `${section.title}:`,
    ...section.items.map((item) => `- ${quoteDemoLabels(addKnownScreenLocation(item))}`),
  ].join("\n"));

  return [
    title,
    "",
    quoteDemoLabels(intro),
    "",
    ...steps.map((step, index) => `${index + 1}. ${quoteDemoLabels(addKnownScreenLocation(step))}`),
    ...formattedSections,
  ].join("\n").trim();
}

export function isSuperuserCreateRequest(message = "") {
  const lower = normalise(message);
  return hasAny(lower, ["superuser", "super user", "super-user"]) &&
    hasAny(lower, ["add", "create", "new", "setup", "set up", "make", "user", "account", "login"]);
}

export function approvedSuperuserEscalationReply() {
  return [
    "New Superuser Request",
    "",
    "Club staff cannot create a new superuser from BRS. Superusers can only be created by a BRS employee, so this needs to go to BRS Support.",
    "",
    "Before escalating, confirm these details for the profile:",
    "",
    "1. Club name.",
    "2. Requested user's full name.",
    "3. Requested username.",
    "4. Email address and contact number.",
    "5. Current role at the club.",
    "6. Why superuser access is required.",
    "7. Confirmation that an authorised club contact has approved the request.",
    "",
    "Do not use Users > Add New for this, and do not use Admin, Staff, StaffReadOnly, or any other club user group as a substitute for superuser access.",
    "",
    "I am escalating this to BRS Support once those details have been confirmed.",
  ].join("\n");
}

export function approvedStaticWorkflowReply(message = "") {
  const lower = normalise(message);
  const mentionsDashboard = hasAny(lower, ["dashboard", "home screen", "main page", "front page"]);
  const mentionsBookings = hasAny(lower, ["booking", "bookings", "bookin", "bookins", "golfer", "player", "customer"]);
  const mentionsTimesheet = hasAny(lower, ["timesheet", "tee sheet", "teesheet", "tee shet", "shet", "sheet", "tee time", "tee slot", "tee times", "slot"]);
  const mentionsTomorrow = hasAny(lower, ["tomorrow", "tomorow", "next day"]);
  const mentionsToday = hasAny(lower, ["today", "todays", "today's"]);
  const mentionsCourse = hasAny(lower, ["course", "courses", "two courses", "both courses"]);
  const mentionsSearch = hasAny(lower, ["search", "find", "look up", "lookup"]);
  const mentionsMember = hasAny(lower, ["member", "members", "membership", "subs", "subscription", "sub"]);
  const mentionsPayment = hasAny(lower, ["payment", "payments", "paid", "money", "pay", "stripe", "online payment"]);
  const mentionsRefund = hasAny(lower, ["refund", "money back", "reverse", "return payment"]);
  const dataOutputIntent = isDataOutputIntent(lower);

  if (
    hasAny(lower, ["delete", "remove", "cancel"]) &&
    hasAny(lower, ["all bookings", "all visitor bookings", "all tee times", "every booking", "bulk delete", "bulk cancel", "tomorrow", "next month"]) &&
    hasAny(lower, ["booking", "bookings", "tee times", "visitor", "visitors"])
  ) {
    return "I can't provide bulk-delete or bulk-cancellation instructions for bookings. For a large booking change, confirm the date range, course, affected reservations, payment status, and customer notifications first, then contact BRS Support or use an approved club operational process for the specific bookings that need to be changed.";
  }

  if (isSuperuserCreateRequest(message)) {
    return approvedSuperuserEscalationReply();
  }

  if (isVisitorTimeBandPricingIntent(lower)) {
    return visitorTimeBandPricingAnswer();
  }

  if (isMemberBookingPrivilegeRuleIntent(lower)) {
    return memberBookingPrivilegeRuleAnswer();
  }

  if (isNoShowReportIntent(lower)) {
    return noShowReportAnswer();
  }

  if (isClubPolicyQuestion(lower)) {
    return clubPolicyBoundaryAnswer(lower);
  }

  if (isMarketingConsentIntent(lower)) {
    return marketingConsentAnswer();
  }

  if (isNamedUserPasswordResetRequest(lower)) {
    return namedUserPasswordResetAnswer();
  }

  if (isPublicGolferCancellationIntent(lower)) {
    return publicGolferCancellationAnswer();
  }

  if (isMemberBalanceLiveDataRequest(lower)) {
    return memberBalanceLiveDataAnswer();
  }

  if (isLiveMutationInstruction(lower)) {
    return liveActionGuardrailAnswer();
  }

  if (isSocietyBlockBookingIntent(lower)) {
    return societyBlockBookingAnswer();
  }

  if (isTeeTimeReleaseLockIntent(lower)) {
    return teeTimeReleaseLockAnswer();
  }

  if (isMembershipBillPublishVisibilityIntent(lower)) {
    return membershipBillPublishVisibilityAnswer();
  }

  if (isGeneralPaymentRequestIntent(lower)) {
    return generalPaymentRequestAnswer();
  }

  if (/\b(can you|could you|will you|please)\b/.test(lower) && hasAny(lower, ["make the booking", "create the booking", "book it", "book this", "find", "look up", "search"]) && hasAny(lower, ["booking", "tee time", "tee slot", "customer", "visitor", "member"])) {
    return answer("Chatbot Guidance for Live BRS Records", [
      "I cannot create, edit, or look up live BRS records from the chat.",
      "If you need to find an existing tee-time booking, open Search and use Search Bookings.",
      "Enter the customer, player, reservation, email, mobile, phone, postcode, Booking Ref. Number, or Club Ref. Number in Search Text.",
      "Choose the Year and select Golf for tee-time bookings or Facility for facility reservations.",
      "If you need to make a new booking, open the Timesheet for the correct date and create the booking in BRS after checking the customer, date, time, course, player count, and payment requirements.",
    ], "Check: The chatbot can guide the workflow, but staff must make or change bookings directly in BRS.");
  }

  if (/\b(can you|could you|will you|please)\b/.test(lower) && hasAny(lower, ["move", "change", "edit", "cancel", "delete"]) && hasAny(lower, ["booking", "tee time", "tee slot", "reservation"])) {
    return answer("Chatbot Guidance for Live Booking Changes", [
      "I cannot move, edit, cancel, or delete a live BRS booking from the chat.",
      "Open Timesheet for the booking date and course.",
      "Click the booked tee time or booking name to open Booking Details.",
      "For a move, use Cut from inside Booking Details, return to the Timesheet, tick the target tee time, and click Paste in the Timesheet action toolbar.",
      "Check the booking, customer, player count, services, and payment status before saving or confirming any change.",
    ], "Staff must make live booking changes directly in BRS after confirming the booking details.");
  }

  if (hasAny(lower, ["refund", "money back", "reverse"]) && hasAny(lower, ["visitor", "tee time", "tee-time", "booking", "card payment", "paid online", "online payment"]) && !hasAny(lower, ["availability", "no tee times", "not showing", "can't book", "cant book"])) {
    return answer("Refund an Online Tee-Time Booking Payment", [
      "Open the booking from the Timesheet so you are in Booking Details.",
      "Expand the Payments section in Booking Details.",
      "Confirm the payment was taken through BRS Payments and check the customer, booking date, amount, and transaction status.",
      "Click Refund beside the correct payment.",
      "For a partial refund, enter only the amount that should be returned.",
      "Enter a reason if required and confirm the refund.",
      "After processing, go to Tools > BRS Payments > Refunds to check the refund record.",
    ], "Payments taken by cash, PDQ, cheque, card terminal, or another non-BRS method cannot be refunded through BRS Payments.");
  }

  if (hasAny(lower, ["course is shut", "course shut", "course closed", "course closure", "hollow coring", "hollowing", "maintenance"]) && hasAny(lower, ["block", "restriction", "restrict", "tee time", "tee times", "morning", "afternoon", "closed"])) {
    return answer("Close or Restrict Tee Times for Course Work", [
      "First decide whether the club is closing specific tee times or applying a rule to a date/time range.",
      "Use Course Restrictions when the rule limits who can book, when they can book, player type, or group size for a date/time range.",
      "Open Tools and then Course Restrictions.",
      "Set Start Date, End Date, Start Time, End Time, Player Types, Max Group Size where relevant, and Message.",
      "If you only need to stop individual tee slots from being booked, use the Timesheet for the date and block or close the affected slots according to the club's normal operational process.",
      "Check the Timesheet and online booking view after saving so staff and customers see the closure correctly.",
    ], "Do not use Booking Statuses for this. Booking Statuses track a booking's lifecycle; they do not close the course for maintenance.");
  }

  if (hasAny(lower, ["cancelled", "canceled", "cancelled tee", "canceled tee", "cancelled booking", "canceled booking"]) && hasAny(lower, ["report", "print", "printable", "last weekend", "last month", "csv", "download"])) {
    return answer("Run a Cancelled Bookings Report", [
      "Open Reports from the main navigation menu.",
      "Open the Type of Report dropdown.",
      "Choose Cancelled Bookings.",
      "Set Start Date and End Date for the period you want to check.",
      "Choose Course if the club has more than one course.",
      "Click Submit.",
      "Review the report, then use Print Report or the export/download option if you need a copy.",
    ]);
  }

  if (hasAny(lower, ["no show reason", "no-show reason", "no show reasons", "no-show reasons"]) && hasAny(lower, ["add", "create", "new", "setup", "set up", "where"])) {
    return answer("Set Up No Show Reasons", [
      "Go to Tools.",
      "Open No Show Reasons.",
      "Check the existing No Show Reasons table columns: Name, Supported, and Actions.",
      "For a new no-show reason, enter Name.",
      "Set Supported.",
      "Click Add, then check the reason appears when marking or reviewing a no-show.",
    ]);
  }

  if (hasAny(lower, ["booking confirmation email template", "confirmation email template", "booking email template"]) || (hasAny(lower, ["change", "edit", "update"]) && hasAny(lower, ["booking confirmation", "confirmation email"]) && hasAny(lower, ["template", "email"]))) {
    return answer("Set Up Email and Letter Templates", [
      "Go to Tools.",
      "Open Email and Letter Templates.",
      "Use Category, Type, and Description to find the template, such as Golf > Email > Booking Confirmation.",
      "Edit the Text field.",
      "Use the visible TAG values only for values the template should fill automatically, such as R_FIRSTNAME, R_SURNAME, R_DATE, R_STARTTIME, R_RESERVATIONNAME, R_EMAIL, or R_TELEPHONE_WORK.",
      "Save the template and check the booking confirmation wording before relying on it for customers.",
    ]);
  }

  if (hasAny(lower, ["room booking", "room bookings", "facility booking", "facility bookings", "meeting room"]) && hasAny(lower, ["terms", "conditions", "agree", "agreed", "legal wording", "wording"])) {
    return answer("Set Up Legal Messages", [
      "Go to Tools.",
      "Open Legal Messages.",
      "Use the Legal Messages table with Legal Message, Version, and Actions.",
      "Open Facility Booking Terms and Conditions.",
      "Edit the legal message text for that entry.",
      "Save the change, then check the facility or room booking screen.",
    ]);
  }

  if (hasAny(lower, ["online booking", "online bookings"]) && hasAny(lower, ["staff enter", "staff entered", "staff enter in", "shop", "offline", "in the shop", "compared with"])) {
    return answer("Online vs Staff-Entered Bookings", [
      "Online bookings are bookings made by members, visitors, or other eligible users through the online booking flow.",
      "Staff-entered bookings are created directly by club staff in BRS, normally from the Timesheet or Booking Details.",
      "Use the Timesheet or Dashboard for day-to-day operational checking of both online and staff-entered bookings.",
      "Use Reports when you need a historical split, date range, or downloadable booking output.",
      "If a question is about card transactions, cross-check Tools > BRS Payments > Transactions rather than relying only on the booking source.",
    ], "Do not treat online and staff-entered bookings as the same operational source when reporting or troubleshooting.");
  }

  if (
    hasAny(lower, ["password", "passwrd", "passwrod", "reset my own", "forgot my"]) &&
    hasAny(lower, ["own", "my", "reset", "change", "forgot", "brs"]) &&
    !hasAny(lower, ["report", "reports", "rpeorts", "access", "permission", "permissions", "cant see", "can't see", "cannot see"])
  ) {
    return answer("Change or Reset Your Own BRS Password", [
      "If you cannot sign in, use Forgot password on the BRS sign-in page.",
      "If you are already signed in, open Users and use Your Details or Change My Password.",
      "On Change My Password, enter Current Password, New Password, and Confirm Password, then save the change.",
      "If the password reset email does not arrive or you cannot access the account, ask an authorised club admin or BRS Support to help reset access.",
    ], "Do not share the current password in any message.");
  }

  if (hasAny(lower, ["member billing", "member bill", "membership bill", "members bill", "member account balance", "account balance"]) && hasAny(lower, ["tee booking", "booking payment", "tee time payment", "booking payments", "visitor booking payment"])) {
    return answer("Distinguish Member Billing from Tee Booking Payments", [
      "First identify the object the payment belongs to.",
      "For a membership bill, open Memberships, find the member, and check the member's Billing area and bill payment status.",
      "For a tee-time or visitor booking payment, open the booking from the Timesheet and check the booking payment area in Booking Details.",
      "For BRS Payments card transactions, cross-check Tools > BRS Payments > Transactions.",
      "Do not move money between membership bills and tee-time bookings unless the matching bill, booking, customer, amount, and transaction have been confirmed.",
    ]);
  }

  if (hasAny(lower, ["password", "passwrd", "pass"]) && hasAny(lower, ["report", "reports", "access", "permission", "permissions", "cant see", "can't see", "cannot see"])) {
    return answer("Check a User Password and Report Access", [
      "Open Users and find the staff user account.",
      "For the password issue, use the reset/change password route that applies to that user.",
      "For the reports issue, check the user's User Group and permissions.",
      "Confirm whether the user should have reports access before changing their group.",
      "If the existing user groups do not provide the right combination of access, escalate to BRS Support with the staff role and reports needed.",
    ], "Password access and report visibility are separate checks: resetting a password does not grant report permissions.");
  }

  if (hasAny(lower, ["vat", "vat report", "vat reports"]) && hasAny(lower, ["access", "permission", "permissions", "user", "assistant", "staff"]) && hasAny(lower, ["not edit members", "cannot edit members", "can't edit members", "read only", "reports"])) {
    return answer("Give a Staff User Access for VAT Reporting", [
      "Open Users and find or create the staff user.",
      "Check the user's User Group and permissions before giving access.",
      "Choose a user group that allows the required report/BRS Payments access without giving member-edit access if the club needs a restricted role.",
      "For the VAT report itself, go to Tools > BRS Payments > VAT Reports.",
      "If the available user groups do not match the club's required access, escalate to BRS Support with the staff role and exact reports they need.",
    ], "Check: User access and VAT report download are separate tasks; confirm permissions before sharing finance access.");
  }

  if (
    hasAny(lower, ["staff", "user", "users", "assistant"]) &&
    hasAny(lower, ["report", "reports", "access", "permission", "permissions", "can log in"]) &&
    hasAny(lower, ["cannot see", "can't see", "cant see", "can log in", "not see"]) &&
    !hasAny(lower, ["add", "create", "new", "needs login", "needs access", "make"])
  ) {
    return answer("Check Staff User Report Access", [
      "Open Users and find the staff user account.",
      "Check the user's User Group and permissions.",
      "Confirm which reports the staff member should be allowed to see.",
      "Change the User Group only if that is the approved access level for that staff role.",
      "If the available groups do not provide the right report access, escalate to BRS Support with the staff role and reports needed.",
    ], "Do not change a user's access until the club has confirmed what the staff member should be allowed to view.");
  }

  if (hasAny(lower, ["booking isn't on the sheet", "booking isnt on the sheet", "booking not on the sheet", "booking isn't on the timesheet", "booking isnt on the timesheet", "booking not on the timesheet"]) || (mentionsBookings && hasAny(lower, ["not on the sheet", "not on timesheet", "not on the timesheet"]))) {
    return answer("Find a Booking That Is Not Showing on the Timesheet", [
      "First confirm the booking date, course, and approximate tee time the customer expects.",
      "Open Search and use Search Bookings with the customer/player name, mobile, email, or booking reference in Search Text.",
      "Check the Year and whether the booking is Golf or Facility.",
      "If Search finds the booking, open the result and compare the date, tee time, customer, and reference before changing anything.",
      "If Search does not find it, check whether the customer may have a different date/course or whether the booking was cancelled and appears in a cancelled booking report.",
    ], "Do not tell the customer the booking exists until the booking date, course, player/customer, and reference have been confirmed in BRS.");
  }

  if (isTimesheetSetupQuestion(lower)) {
    return detailedAnswer("Configure the Timesheet",
      "Use this when you need to change the tee-time pattern, not make individual bookings. This covers opening earlier, finishing later, adding more generated tee slots, or changing the interval between tee times.",
      [
        "Go to Tools.",
        "Open Configure Timesheet.",
        "Under Operation, choose Configure one or multiple days with the same tee time interval or Configure one or multiple days with alternative tee time intervals.",
        "Set Year, Start Month, Start Day of Month, End Month, and End Day of Month for the dates you want to change.",
        "Set Tee Time Interval or Alternate Tee Time Intervals, then use First Tee Time Hour, First Tee Time Minute, Last Tee Time Hour, and Last Tee Time Minute to control the start and end of the day.",
        "Tick the required days under Select the days of the week you want to configure, then click Configure the Timesheet.",
        "Open the Timesheet and check the affected dates before taking bookings on the new pattern.",
      ],
      [
        {
          title: "Check",
          items: [
            "For opening earlier on Saturdays, set the date range and tick Saturday only.",
            "If you only need one extra slot on one day, check Squeeze Tee Time on the Timesheet before changing the wider timesheet setup.",
            "After saving, check the first tee time, last tee time, and interval spacing on the affected Timesheet dates.",
          ],
        },
      ]);
  }

  if (
    hasAny(lower, ["label", "title", "heading", "wording"]) &&
    hasAny(lower, ["top of", "appears at the top", "particular day", "specific day", "day on", "timesheet", "tee sheet"]) &&
    hasAny(lower, ["change", "set", "edit", "where"])
  ) {
    return answer("Set the Title for Each Day on the Timesheet", [
      "Go to Tools.",
      "Open Title for Each Day.",
      "Choose the date or day title you need to update.",
      "Enter the timesheet title and save it.",
      "Return to the Timesheet and confirm the title appears on the correct day.",
    ]);
  }

  if (lower.includes("copy") && hasAny(lower, ["services", "green fees", "catering", "prices", "buggies", "buggy"]) && hasAny(lower, ["year", "next year", "another year", "from year", "to year"])) {
    return answer("Copy Services, Catering, or Green Fees to Another Year", [
      "Go to Tools.",
      "Open Copy Services, Catering or Green Fees.",
      "In Operation, choose Copy Services, Copy Catering, or Copy Green Fees.",
      "Choose From Year.",
      "Choose To Year.",
      "Click Copy.",
      "Open the destination year setup page afterward and check the copied Services, Catering / Refreshments, or Green Fee Rates.",
    ]);
  }

  if (isGolfEventIntent(lower) && hasAny(lower, ["competition", "competitions", "comp", "wrong one", "difference", "different"])) {
    return [
      "Golf Events vs Competitions",
      "",
      "Use Golf Events when the club is organising an event-style booking, such as a corporate day, golf day, society-style event, or event organiser reservation. Golf Events make a part of the timesheet available for an organiser to populate.",
      "",
      "Use Competitions when the task is about competition setup, entrants, draws/start sheets, competition charges, member competition purses, or open competition visitor entry.",
      "",
      "Quick check:",
      "- Event/reservation organisation: use Golf Events.",
      "- Entrants, draws, competition purse, charges, or open competition booking: use Competitions.",
    ].join("\n");
  }

  if (isGolfEventIntent(lower) && hasAny(lower, ["changed date", "change date", "new date", "payment link", "pay link", "general payment"]) && hasAny(lower, ["buggy", "buggies", "club hire", "services", "payment link", "pay link", "general payment"])) {
    return answer("Handle a Golf Event Change with Extras or Payment", [
      "Use Golf Events for the event date, event start/end time, organiser reservation, and event username.",
      "Use the Timesheet or Booking Details for the affected event booking before changing player or booking details.",
      "Use the booking's services/extras area to add buggies, club hire, caddies, trolleys, or other configured services.",
      "Use Tools > BRS Payments > General Payment Requests only when the club needs a non-booking-specific payment link.",
      "Check the event date, reserved tee times, organiser, services, and payment amount before saving or sending anything.",
    ], "This is a multi-area task: Golf Events controls the event block, Services controls extras, and BRS Payments controls general payment links.");
  }

  if (
    hasAny(lower, ["open competition", "open competitions", "open comp", "open comps"]) &&
    (
      hasAny(lower, ["hotel partner", "paid", "payment", "buggy", "find the booking", "find booking", "separate things"]) ||
      (hasAny(lower, ["legal", "wording", "terms", "conditions"]) && hasAny(lower, ["visitor fee", "green fee", "fee", "fees", "price", "charge", "cost"]))
    )
  ) {
    return answer("Check an Open Competition Visitor Query Across Areas", [
      "Use Open Competitions for Visitors to check the open competition setup, visitor entry, booking availability, and visitor fee.",
      "Use Legal Messages if the public open-competition terms, conditions, or legal wording are wrong.",
      "Use Search > Search Bookings if you need to find the related booking or reservation by name, mobile, email, or booking reference.",
      "Use the booking's services/extras area if the visitor or organiser needs a buggy, caddie, trolley, club hire, or other configured service.",
      "Use BRS Payments Transactions only to cross-check a card transaction that was taken through BRS Payments.",
      "Confirm the competition, entrant/visitor, booking/reservation, service, amount, and transaction before making changes.",
    ]);
  }

  if (hasAny(lower, ["paid a bill", "paid their bill", "paid the bill", "bill payment"]) && hasAny(lower, ["brs payments", "transaction", "transactions", "check first"])) {
    return answer("Check a Member Bill Payment Against BRS Payments", [
      "Open Memberships.",
      "Open Members and find the member profile.",
      "Open the member's Billing area and open the bill they say they paid.",
      "Check the bill payment status, paid amount, outstanding amount, and any payment entries recorded on that bill.",
      "If the bill payment should have been taken through BRS Payments, go to Tools > BRS Payments > Transactions and search for the matching transaction.",
      "Compare the member/customer, amount, date, payment status, and reference before changing anything.",
      "If the BRS Payments transaction exists but the member bill is not marked paid, do not create a duplicate payment. Escalate with the member, bill, amount, date, and transaction reference.",
    ]);
  }

  if (hasAny(lower, ["open competition", "open competitions", "open comp", "open comps"]) && hasAny(lower, ["visitors", "visitor", "book online", "online", "fields", "page", "setting up", "set up", "setup", "can't see", "cant see", "not showing"]) && !hasAny(lower, ["fee", "fees", "price", "prices", "charge", "charges", "cost", "terms", "conditions", "legal", "wording"])) {
    return answer("Set Up an Open Competition for Visitors", [
      "Go to Tools.",
      "Open Open Competitions for Visitors.",
      "Create or edit the open competition.",
      "Set the competition date, start/end time, competition name or reservation name, booking/playing format, and competition type.",
      "Set the member green fee and visitor green fee where those fields apply.",
      "Set whether mixed member/visitor teams are allowed if that option is used.",
      "Set Booking Available Date and Booking Available Time for online visitor entry.",
      "Check the open competition entry flow before publishing or taking entries.",
    ]);
  }

  if (!hasAny(lower, ["open competition", "open competitions", "open comp", "open comps", "report", "reports", "revenue", "totals", "by country", "rate", "rates", "price", "prices", "green fee", "green fees", "tour operator"]) && hasAny(lower, ["visitor", "visitors"]) && hasAny(lower, ["online", "website", "web site", "book online", "cant book", "can't book", "cannot book", "not showing", "no tee times", "not available", "not visible", "why"]) && hasAny(lower, ["tee time", "tee times", "booking", "book", "bookings", "wednesday", "days", "next month"])) {
    return answer("Check Visitor Online Booking Availability", [
      "First confirm the date, course, and time the visitor is trying to book.",
      "Go to Tools and check Green Fee Rates for Visitors / Tour Operators / Tee Time Agents for that date range, day of week, time range, channel, and course.",
      "Check whether any Course Restriction limits visitors, player types, or maximum group size for that time.",
      "Check the relevant visitor booking rules or advance-booking window for how far ahead visitors can book.",
      "Check the public visitor booking flow after saving any setup change.",
    ], "Do not assume the cause from the question alone. Visitor availability can be controlled by rates, days of week, advance booking windows, course restrictions, or online booking setup.");
  }

  if ((lower.includes("competition") || lower.includes("comp sheet") || lower.includes("comp")) && hasAny(lower, ["waiting list", "wait list", "waitlist", "missed the comp sheet"])) {
    return answer("Add a Member to a Competition Waiting List", [
      "Open Competitions.",
      "Find and open the relevant competition or competition sheet.",
      "Use Add member to waiting list if that action is shown for the competition.",
      "Select the correct member only after confirming the competition, date, and member identity.",
      "Save only if the waiting-list action is available on that competition, then check the member appears on the waiting list.",
    ], "Check: Waiting list controls are competition-specific. If Add member to waiting list is not shown, do not guess another route; check the competition setup or escalate with the competition name and date.");
  }

  if (!lower.includes("club systems") && hasAny(lower, ["upload", "uploads", "import", "imports", "update file", "bulk update", "load file", "load csv", "load a file"]) && (lower.includes("member") || lower.includes("contact"))) {
    return answer("Upload Members or Contacts", [
      "Go to Tools.",
      "Open Upload Members and Contacts.",
      "On Import/Update Members or Contacts, choose the record type: Members or Contacts.",
      "Select the CSV import file.",
      "Tick Update Existing Members only if you are updating existing member records.",
      "Click Next and follow the import steps.",
      "For member uploads, check the file contains User ID plus Last Name or Full Name, and Member Type.",
      "For contact uploads, check the file contains Category plus Last Name, Full Name, or Company, and at least one contact method such as email or phone.",
    ]);
  }

  if (hasAny(lower, ["email addresses for outlook", "email address for outlook", "emails for outlook", "email list for outlook"]) && hasAny(lower, ["report", "spreadsheet", "export", "download", "get", "not to send", "not sending", "outlook"])) {
    return answer("Export Member Email Addresses", [
      "Open Reports.",
      "Open the Type of Report dropdown.",
      "Choose Member Email Addresses for Outlook.",
      "Set the visible membership type or member filters needed for the list.",
      "Run the report, then use the export/download control on the report output if you need a file for Outlook.",
    ]);
  }

  if (hasAny(lower, ["reservation type", "reservation types"]) && hasAny(lower, ["how busy", "usage", "utilisation", "utilization", "used", "breakdown", "report"])) {
    return answer("Run Tee Time Usage by Reservation Type", [
      "Open Reports from the main navigation menu.",
      "Open the Type of Report dropdown.",
      "Choose Tee Time Usage by Reservation Type.",
      "Set Start Date and End Date for the period.",
      "Choose Course if the club has more than one course.",
      "Click Submit.",
      "Review the usage by reservation type, then use Print Report or the export option if you need a file.",
    ]);
  }

  if (hasAny(lower, ["booked", "bookin", "booking", "reservation", "tee time", "tee slot"]) && hasAny(lower, ["part of their name", "partial name", "part of the name", "part name", "only have part", "only got part", "only have a name", "only got a name", "half his surname", "half her surname", "surname", "last name", "only caught", "look them up", "find them", "find a person", "customer name", "player name"])) {
    return answer("Search for a Booking", [
      "Open Search.",
      "Use the Search Bookings form.",
      "Enter the partial customer, player, reservation, email, phone, or reference detail in Search Text.",
      "Choose the Year for the booking.",
      "Leave Golf selected for tee time bookings, or choose Facility only when the booking is a facility reservation.",
      "Click Search.",
      "Open the matching result only after checking the booking date, tee time, customer, and reference.",
    ], "Search Bookings checks Reservation Name, the 4 Player Names, Booking Contact Name, Booking Ref. Number, Club Ref. Number, Email, Telephone, Mobile, and Postcode.");
  }

  if (hasAny(lower, ["contact record", "contact records"]) && hasAny(lower, ["find", "look up", "lookup", "where", "open", "see", "view"])) {
    return answer("Find a Contact Record", [
      "Open Contacts.",
      "Use View Contacts or View All.",
      "Search or filter by the contact name, company/group name, contact category, email, telephone, or mobile.",
      "Open the matching contact record only after checking it is the right visitor, society, tour operator, hotel, company, or other contact.",
    ]);
  }

  if (hasAny(lower, ["set up a group", "setup a group", "make a group", "create a group", "build a group", "group first", "set up member group", "setup member group", "create member group", "make member group", "build member group", "member groups for messaging", "groups for messaging"]) && hasAny(lower, ["email", "text", "sms", "message", "messaging"])) {
    return answer("Set Up Member Groups for Messaging", [
      "Go to Tools.",
      "Open Member Groups for Messaging.",
      "Create or edit the member group used for message targeting.",
      "Add the relevant members or criteria to the group.",
      "Return to Email Messaging, Text Messaging, or Club Messages and check the group is available as a message audience.",
    ]);
  }

  if (hasAny(lower, ["text all members", "sms all members", "text every member", "sms every member"]) || (hasAny(lower, ["text", "txt", "sms"]) && hasAny(lower, ["all members", "everyone", "everybody"]))) {
    return answer("Text Members in a Membership Type or Group", [
      "Go to Tools.",
      "Open Text Messaging.",
      "Choose Text Message Membership Types or Text Message Membership Groups.",
      "Select the membership type or member group audience that represents the members you need to text.",
      "Check SMS credit, the selected audience, and message content before sending.",
    ]);
  }

  if (hasAny(lower, ["club app message", "app message", "club message", "push notification", "push message"]) && hasAny(lower, ["everyone", "all members", "every member", "everybody", "members", "member"])) {
    return answer("Send a Club Message to All Members", [
      "Open Messages or the dashboard Club Messages shortcut.",
      "Go to Club Messaging.",
      "Choose Message All Members if the app/website message should go to every member, or choose the matching member group/type option if it should only go to a segment.",
      "Enter the club message content. This sends through Club Messages as an app/website notice, not as an email.",
      "Review the audience, message wording, and timing before sending.",
      "Send only after the club has confirmed the message should go to that app/website audience.",
    ], "Use Club Messages for member app/new members website notices. Use the separate email workflow only when the club wants an email.");
  }

  if (lower.includes("open competition") && hasAny(lower, ["terms", "terms and conditions", "conditions", "legal wording"])) {
    return answer("Set Open Competition Terms and Conditions", [
      "Go to Tools.",
      "Open Legal Messages.",
      "Use the Legal Messages table with Legal Message, Version, and Actions.",
      "Open the Terms and Conditions entry for the All Ireland Open Competitions Search Facility when that is the wording being changed.",
      "Use Visitor Terms and Conditions or Tour Operator Terms and Conditions only when the open-competition flow is using that legal-message entry.",
      "Edit the legal message text for the open competition entry flow.",
      "Save the change, then check the open competition booking screen.",
    ], "This is Legal Messages/Open Competitions wording, not a Reports Search workflow.");
  }

  if ((lower.includes("competition") || lower.includes("comp")) && lower.includes("member") && hasAny(lower, ["charge", "charges", "charging", "entry fee", "fee", "purse"])) {
    return answer("Configure Member Competition Charges", [
      "Open Competitions.",
      "Find and open the relevant member competition.",
      "Use the competition setup, charges, and purse/payment settings for that competition.",
      "Confirm the member entry fee is taken from the member's competition purse.",
      "Check the charge shown in the member competition entry flow before taking entries.",
    ], "Keep member competition charges separate from normal membership bills and unpaid-bill reports.");
  }

  if (
    (
      hasAny(lower, ["transaction", "transactions"]) && hasAny(lower, ["card", "cards", "brs payments", "online payment", "stripe"])
    ) ||
    (
      hasAny(lower, ["card payment", "card payments", "online payment", "online payments", "brs payments"]) && hasAny(lower, ["csv", "spreadsheet", "download", "export"])
    )
  ) {
    return answer("Download BRS Payments Transactions", [
      "Go to Tools.",
      "In the BRS Payments section, open Transactions.",
      "Use the available search or date filters to narrow the transaction list.",
      "Review the customer, amount, date, payment status, and reference before exporting.",
      "Use the CSV/download option on Transactions to export the transaction list.",
    ]);
  }

  if (hasAny(lower, ["four-ball", "four ball", "4-ball", "4 ball", "4 balls", "4balls", "fourballs", "four balls", "groups of four", "group size", "max group size"]) && hasAny(lower, ["stop", "restrict", "restriction", "members", "course"])) {
    const earlyCourseRestrictionNote = lower.includes("booking status")
      ? "Use Course Restrictions when the rule limits who can book, when they can book, or the maximum group size. Booking Statuses are for tracking the booking lifecycle/status, not for stopping four-balls or limiting group size by time."
      : "Use Course Restrictions when the rule limits who can book, when they can book, or the maximum group size.";
    return answer("Configure Course Restrictions", [
      "Go to Tools.",
      "Open Course Restrictions.",
      "Use Show expired Course Restrictions if you need to review old restrictions.",
      "Set Start Date, End Date, Start Time, and End Time.",
      "Set Player Types to Members & Visitors, Members, or Visitors.",
      "Choose Max Group Size.",
      "Enter Message.",
      "Click Add, then check the affected booking flow.",
    ], earlyCourseRestrictionNote);
  }

  if (hasAny(lower, ["daily sheet", "day sheet", "daily tee sheet", "daily timesheet"]) && hasAny(lower, ["see", "view", "what is booked", "what's booked", "booked", "change", "amend", "update"])) {
    return answer("Use the Timesheet Day View", [
      "Open Timesheet from the main navigation menu.",
      "Use the date and course controls above the tee-time grid to open the day you need.",
      "Review the bookings shown in the tee-time grid for that day.",
      "Click the relevant booking or tee time to open Booking Details before changing anything.",
      "Save the change, then return to the Timesheet and confirm the day view shows the updated booking.",
    ]);
  }

  if (isMessageDeliveryTroubleshootingIntent(lower)) {
    return messageDeliveryTroubleshootingAnswer(lower);
  }

  // ─── INFORMATIONAL "WHAT IS" ANSWERS (before action handlers) ──────────────
  const asksWhatIs = /\b(what is|what are|what does|what do|explain|meaning of|definition of|tell me about)\b/.test(lower);
  const asksPurpose = /\b(why would|why should|why do i need|why use|what .+ used for|purpose of|when would .+ use|when should .+ use)\b/.test(lower);
  const hasActionIntent = /\b(how do i|how to|set up|setup|configure|change|edit|update|create|add|delete|remove|cancel|run|open|manage|check|view)\b/.test(lower);

  if ((asksWhatIs || asksPurpose) && !hasActionIntent) {
    if (hasAny(lower, ["reservation type", "reservation types"])) {
      return "Reservation Types in BRS classify tee-time bookings by purpose — for example Member, Visitor, Society, Competition, Corporate, Reserved, or Closed. Each type controls the colour shown on the timesheet, affects reporting categories, and can determine booking rules. Reservation Types are configured at Tools > Reservation Types. Clubs can create custom types to match their own booking categories.";
    }

    if (hasAny(lower, ["booking status", "booking statuses"])) {
      return "Booking Statuses in BRS track the lifecycle state of a tee-time booking — for example Provisional, Confirmed, Deposit Requested, Deposit Paid, Full Payment Received, Outstanding Balance, or Closed. Statuses are used for reporting, follow-up actions, and payment tracking. They are configured at Tools > Booking Statuses. Each club can create statuses that match their own booking workflow.";
    }

    if (hasAny(lower, ["email membership groups", "text message membership groups", "text membership groups"]) && hasAny(lower, ["difference", "different", "compare"])) {
      return "Email Membership Groups and Text Message Membership Groups use the same saved member-group audience, but they send through different channels. Email Membership Groups are used from Tools > Email Messaging when sending an email to that group. Text Message Membership Groups are used from Tools > Text Messaging when sending an SMS/text to that group. Create and maintain the audience in Tools > Member Groups for Messaging, then choose the matching Email or Text Messaging option when sending.";
    }

    if (hasAny(lower, ["member group", "member groups", "membership group", "membership groups"])) {
      return "Member Groups in BRS are custom groupings used for messaging and communication. They allow staff to target emails, texts, or club messages to a specific subset of members (e.g. \"Committee\", \"Ladies Section\", \"Seniors\"). Member Groups for Messaging are configured at Tools > Member Groups for Messaging. Members are assigned to groups from their member profile or the group management page.";
    }

    if (hasAny(lower, ["service", "services", "buggies", "buggy", "hire clubs", "club hire"])) {
      return "Services in BRS are bookable extras the club can offer alongside tee-time bookings, such as buggies, caddies, trolleys, golf clubs/club hire, room hire, shoes, or other configured items. Services are set up from Tools > Services, where staff choose the year, service type, service name, and service rate. Once configured, services can be added to bookings where that service is available.";
    }

    if (hasAny(lower, ["payment scheme", "payment schemes"])) {
      return "Payment Schemes in BRS allow membership bills to be paid in instalments rather than a single lump sum. A Payment Scheme defines the schedule (e.g. monthly, quarterly), the number of payments, and the start date. Payment Schemes are created and managed in Memberships > Settings > Payment Schemes, then applied to individual member bills. They work with Direct Debit or card collection where configured.";
    }

    if (hasAny(lower, ["bill", "bills", "invoice", "invoices", "membership bill", "membership bills"])) {
      return "Bills in BRS are membership billing records used to charge members for subscriptions, joining fees, levies, or other membership-related amounts. A bill contains the billed items, due date, total, paid amount, outstanding amount, payment status, and publish status. Bills are created from Memberships > Billing/Payments and can be reviewed from the member profile or Memberships > Reports.";
    }

    if (hasAny(lower, ["purse", "competition purse"])) {
      return "The Competition Purse in BRS is a prepaid credit balance held by a member for competition entry fees. When a member enters a competition, the entry fee is deducted from their purse balance instead of requiring a separate payment each time. Purse balances, top-ups, and transaction history are managed from the Competitions area. Staff can top up a member's purse manually or through integrated payment methods.";
    }

    if (hasAny(lower, ["wallet", "flexi wallet", "member wallet"])) {
      return "The Member Wallet (also called Flexi Wallet) in BRS is a prepaid credit balance for flexible/pay-as-you-play members. Members load credit into their wallet, and booking charges are deducted automatically when they book a tee time. Wallet balances and transactions are visible in the member's profile under Memberships. Staff can view all wallet balances via Memberships > Reports > Wallet Balances.";
    }

    if (hasAny(lower, ["grace period"])) {
      return "The Grace Period in BRS is a number of days after a membership bill becomes due before the system treats the member as lapsed or restricts their booking access. It gives members extra time to pay without immediately losing privileges. The Grace Period value is configured at Memberships > Settings > General.";
    }

    if (hasAny(lower, ["user group", "user groups"])) {
      return "User Groups in BRS control access levels for login accounts. The main groups are: Admin (full system control, cannot add other Admins), Staff (day-to-day access, restricted from Tools and revenue reports), StaffReadOnly (view-only, cannot save changes), and Member (online booking access only via member booking pages). User Groups determine which menu items, pages, and actions each account can access.";
    }

    if (hasAny(lower, ["squeeze tee time", "squeeze"])) {
      return "Squeeze Tee Time in BRS inserts an additional tee time between existing slots on a single day without reconfiguring the entire timesheet. It is used when the club needs one extra slot on a specific date (e.g. to fit in a late request). The Squeeze Tee Time link appears on the Timesheet day view. For permanent changes to tee-time spacing, use Tools > Configure Timesheet instead.";
    }

    if (hasAny(lower, ["direct debit", "dd collection"])) {
      return "Direct Debit in BRS allows membership bills to be collected automatically from a member's bank account on a scheduled basis. It works with Payment Schemes to split annual fees into regular instalments. Direct Debit collection status, failed payments, and retry handling are managed through the Memberships billing area. Not all clubs have Direct Debit enabled — it requires a payment provider integration.";
    }

    if (hasAny(lower, ["brs payment", "brs payments"])) {
      return "BRS Payments is the integrated online payment system in BRS (powered by Stripe). It processes card payments for visitor bookings, green fees, and general payment requests. BRS Payments handles transactions, refunds, payouts to the club's bank account, and VAT reporting. It is managed from Tools > BRS Payments. Clubs must be set up with BRS Payments before they can take online card payments.";
    }

    if (hasAny(lower, ["utilisation", "utilization"])) {
      return "Utilisation in BRS shows the proportion of available tee times that have been booked, expressed as a percentage. The Dashboard displays a quick utilisation figure for the selected date or date range. For detailed utilisation analysis over longer periods, use Reports > Tee Time Usage or Tee Sheet Utilisation report types.";
    }

    if (hasAny(lower, ["display configuration"])) {
      return "Display Configuration in BRS controls how the admin interface appears — including whether the Daily Dashboard is enabled, date display formats, and visual layout preferences. It is found at Tools > System Configuration > Display Configuration. Only Admin users with access to Tools and System Configuration can change these settings.";
    }

    if (hasAny(lower, ["calendar", "month view", "monthly view"])) {
      return "The Calendar or Month view in BRS gives staff a wider date view so they can jump between days, months, and configured timesheets without opening each day one at a time. Use it when you need to scan availability, move quickly to a future date, or choose the correct day before opening the detailed Timesheet day view.";
    }

    if (hasAny(lower, ["contact categor", "contact categories"])) {
      return "Contact Categories in BRS classify non-member contact records for searching, filtering, and reporting. Standard categories include Company, Hotel, Society, Tour Operator, Visitor, and Other. Clubs can have custom categories. Contact Categories are configured at Tools > Contact Categories. They help staff quickly filter the Contacts list to find the right audience for messaging or booking workflows.";
    }

    if (hasAny(lower, ["club message", "club messages"])) {
      return "Club Messages in BRS are push notifications sent to members through the BRS Members Booking App or New Members Website. They can target all members, specific membership types, membership groups, members on the tee sheet for a date, or members currently on the course. Club Messages are managed from Tools > Club Messages or the Dashboard messaging shortcut.";
    }

    if (hasAny(lower, ["no show", "no-show", "no shows"])) {
      return "No Show in BRS records when a booked golfer did not arrive for their tee time. Staff can mark a booking as a No Show from the Timesheet, selecting a reason from the configured list. No Show Reasons are set up at Tools > No Show Reasons. No Show data appears in the No Shows report under Reports for tracking patterns and follow-up.";
    }

    if (hasAny(lower, ["block booking", "block bookings"])) {
      return "Block Bookings in BRS allow staff to reserve multiple tee times at once for a group, event, or repeated reservation. Unlike single bookings (one tee time), a block booking covers several consecutive tee-time slots or the same slots across multiple weeks. Block bookings are managed from the Timesheet and are typically used for societies, corporate days, or recurring internal reservations.";
    }

    if (hasAny(lower, ["online booking", "online bookings", "member booking online", "visitor booking online"])) {
      return "Online Booking in BRS allows members and visitors to book tee times through the internet without calling the club. BRS provides separate online surfaces: Member Booking (for registered members), Visitor Booking (for public/visitor bookings), and Open Competitions (for competition entries). Online booking rules, availability windows, and advance booking limits are configured from Tools. The BRS Members Booking App also provides mobile access.";
    }

    if (isGolfEventIntent(lower)) {
      return "Golf Events in BRS is a separate area from Competitions. It is used for organised golf days, society-style events, or event organiser reservations where the club needs to manage an event booking rather than a competition entry sheet, draw, or competition purse. Use Golf Events for event/reservation organisation; use Competitions when the task is about competition setup, entrants, draws, charges, or open competition entry.";
    }

    if (hasAny(lower, ["competition", "competitions", "open competition", "open competitions"])) {
      return "Competitions in BRS are used for competition setup, entry management, draws/start sheets, competition charges, and open competition entry flows. This is separate from Golf Events, which is for organised golf days or event organiser reservations rather than competition entrant/draw management.";
    }
  }

  // ─── NEGATIVE / EDGE-CASE ANSWERS (before action handlers) ─────────────────

  if (hasAny(lower, ["undo", "undelete", "restore", "get back", "recover"]) && hasAny(lower, ["deleted booking", "cancelled booking", "removed booking", "deleted reservation", "booking back"])) {
    return "BRS does not have an undo or restore function for deleted bookings. Once a booking is deleted from the Timesheet, it cannot be recovered automatically. If you need to reinstate the booking, you must create it again manually using the original tee time, date, and player details. Deleted bookings may still appear in the Cancelled Bookings report under Reports for reference.";
  }

  if (hasAny(lower, ["merge", "combine", "join together"]) && hasAny(lower, ["member", "members", "profile", "profiles", "account", "accounts", "duplicate"])) {
    return "BRS does not support merging two member profiles into one. If a member has duplicate records, the recommended approach is:\n\n1. Identify which profile has the correct billing history and booking data.\n2. Keep that profile as the active record.\n3. Deactivate or disable the duplicate profile.\n4. Update the kept profile with any missing details from the duplicate.\n\nIf both profiles have significant billing or booking history that must be preserved, contact BRS Support for guidance on the specific situation.";
  }

  if (hasSchedulingDeliveryIntent(lower) && !explicitlyNotScheduling(lower) && hasAny(lower, ["email", "emails"]) && hasAny(lower, ["member", "members", "contact", "contacts", "send"])) {
    if (!hasAny(lower, ["payment", "bill", "direct debit", "subscription"])) {
      return "BRS does not support scheduling emails to be sent at a future date/time. When you send an email via Email Messaging, it is dispatched immediately. If you need to send at a specific time, you will need to return to BRS at that time and send manually. For recurring communications, consider using Email and Letter Templates (Tools > Email and Letter Templates) to save your message content so it can be sent quickly when the time comes.";
    }
  }

  if (hasAny(lower, ["bulk delete", "mass delete", "delete all", "batch delete", "remove all"]) && hasAny(lower, ["member", "members", "contact", "contacts"])) {
    return "BRS does not provide a bulk delete function for member or contact records. Member records are retained because they are linked to billing history, booking history, and audit data. To handle multiple unwanted records:\n\n1. For members: change their status to Inactive/Lapsed or disable their user account rather than deleting.\n2. For contacts: individual contacts can be removed one at a time from the Contacts page.\n\nIf you need to remove a large number of records, contact BRS Support for guidance.";
  }

  if (hasAny(lower, ["import", "upload", "bulk add", "bulk create"]) && hasAny(lower, ["booking", "bookings", "tee time", "tee times"]) && !hasAny(lower, ["member", "contact", "timesheet"])) {
    return "BRS does not support bulk importing or uploading bookings from a spreadsheet. Tee-time bookings must be created individually through the Timesheet or via the online booking system. For setting up the same tee-time structure across multiple dates, use Tools > Configure Timesheet to apply a pattern to a date range. For repeated reservations on the same tee times, consider using block bookings.";
  }

  if (hasAny(lower, ["change the date", "move to another date", "move to a different date", "different date", "change date of"]) && hasAny(lower, ["booking", "reservation"])) {
    return "BRS does not have a \"change date\" button on bookings. To move a booking to a different date, use the Cut and Paste workflow:\n\n1. Open the Timesheet and navigate to the current booking date.\n2. Click the booked tee time to open Booking Details.\n3. Click \"Cut\" in Booking Details.\n4. Return to the Timesheet and navigate to the new date.\n5. Tick the checkbox beside the target tee time.\n6. Click \"Paste\" in the Timesheet action toolbar.\n7. Check the booking and payment status after moving.";
  }

  if (hasAny(lower, ["auto", "automatic", "automatically"]) && hasAny(lower, ["cancel", "delete", "remove"]) && hasAny(lower, ["no show", "no-show", "unpaid", "not paid"])) {
    return "BRS does not automatically cancel or delete bookings for no-shows or unpaid balances. No-show and payment follow-up are manual processes handled by staff. After a no-show, staff can mark the booking with a No Show reason (configured at Tools > No Show Reasons) and follow up as needed. Automatic booking removal based on payment status is not a BRS feature.";
  }

  if (hasAny(lower, ["duplicate", "copy", "clone"]) && hasAny(lower, ["member", "membership"]) && hasAny(lower, ["profile", "record", "account"]) && !hasAny(lower, ["merge", "combine"])) {
    return "BRS does not have a \"duplicate member\" or \"clone profile\" function. Each member record must be created individually. If you need to add a member with similar details to an existing one (e.g. a family member), create a new member profile from Memberships > Members > Add and enter their details manually.";
  }

  if (hasStandaloneAppTerm(lower) && hasAny(lower, ["download", "install", "get the app", "where is the app", "find the app"]) && !hasAny(lower, ["report", "csv", "spreadsheet", "privacy", "legal", "terms", "appears", "appear", "club app message", "app message", "club message"])) {
    return "The BRS Members Booking App is available for members to book tee times from their phone. Members can download it from the Apple App Store (iOS) or Google Play Store (Android) by searching for \"BRS Golf\" or the club's app name. Members need their BRS login credentials to sign in. If a member cannot find or access the app, check that their user account is active and that the Members Booking Module is enabled for the club.";
  }

  if (lower.includes("grace period")) {
    return answer("Change the Membership Grace Period", [
      "Go to Memberships.",
      "Open Settings.",
      "Open General.",
      "Find Grace Period. This is the number of days after a membership bill is due before BRS treats the member as outside the allowed payment grace period.",
      "Update the value required for the club's non-payer process, then save.",
      "Check an affected member's bill/payment status and membership status to confirm whether they are still inside the grace period or should now be restricted from member booking/login access.",
      "Test with a representative unpaid member account or member booking view before relying on the setting for all members.",
    ], "Changing this is a live membership setting. Confirm the club's policy before lowering the grace period because it can affect unpaid members' booking/login access.");
  }

  if (hasAny(lower, ["club email address", "club email", "club e-mail", "club email contact", "club contact email"])) {
    return answer("Change the Club Email Address", [
      "Go to Tools.",
      "Open System Configuration.",
      "In Club Contact Details, edit Main club email address (mandatory).",
      "Save the System Configuration changes.",
      "If you need to check the wording of booking emails as well, open Tools > Email and Letter Templates and review the relevant template, such as Booking Confirmation.",
    ]);
  }

  if (
    hasAny(lower, ["wallet", "flexi wallet", "member wallet", "account balance"]) &&
    hasAny(lower, ["bill", "bills", "renewal bill", "unpaid", "outstanding", "subscription", "subs", "membership bill"]) &&
    hasAny(lower, ["same", "different", "difference", "also", "balance", "credit"])
  ) {
    return answer("Distinguish Member Wallet Credit from an Unpaid Membership Bill", [
      "A Member Wallet or Flexi Wallet credit is not the same as an unpaid renewal bill.",
      "Wallet credit is a prepaid balance used for flexible/pay-as-you-play booking charges.",
      "An unpaid renewal bill is a membership billing record for subscriptions, joining fees, levies, or other membership charges.",
      "To check the wallet side, open the member profile in Memberships and review the wallet/account balance area, or use Memberships > Reports > Wallet Balances and Wallet Transactions.",
      "To check the bill side, open the member profile Billing area or use Memberships > Billing/Payments and the relevant billing reports such as Bills Overview, Bill History, or Overdue Bills.",
      "Do not assume wallet credit automatically clears a membership bill. If the club wants to offset one against the other, confirm the amount and use the approved billing/payment adjustment process for that member.",
    ]);
  }

  if (hasAny(lower, ["main club setup", "club setup page", "system configuration", "feature on or off", "turn a feature", "enable feature", "disable feature"])) {
    return answer("Open System Configuration", [
      "Go to Tools.",
      "Open System Configuration.",
      "Use the visible System Configuration sections and labels, such as Club Contact Details, Display Configuration, General Configuration, Features Supported, Marketing Consent, Buggy Booking, Members Booking Module - Casual Golf, Visitor Booking - General, or Online Merchant Module.",
      "Edit only the exact labelled setting that matches what you need to change.",
      "Save the System Configuration changes, then check the affected BRS page.",
    ]);
  }

  if (hasAny(lower, ["change", "update", "edit", "modify", "amend", "correct"]) && hasAny(lower, ["member", "members"]) && hasAny(lower, ["email", "email address", "phone", "telephone", "mobile", "address", "name", "surname", "first name", "last name", "details", "contact details"])) {
    return answer("Change a Member's Details", [
      "Open Memberships from the main navigation menu.",
      "Open Members in the Memberships navigation.",
      "Search for and select the member whose details you want to change.",
      "Click the member to open their profile.",
      "Edit the relevant field (such as email address, phone number, name, or postal address).",
      "Click Save or Update to confirm the change.",
    ], "Check: If the member also has a login account in Users, confirm their login email matches their updated contact details.");
  }

  if (
    hasAny(lower, ["change", "switch", "move", "update", "alter", "amend"]) &&
    hasAny(lower, ["member", "members"]) &&
    hasAny(lower, ["category", "membership type", "membership category", "type of membership", "member type", "intermediate", "full member", "full membership", "from intermediate to full"])
  ) {
    return answer("Change a Member's Membership Category", [
      "Open Memberships from the main navigation menu.",
      "Open Members in the Memberships navigation.",
      "Search for and select the member.",
      "Click the member to open their profile.",
      "In the member profile, find the Membership Type field.",
      "Change the Membership Type to the new category.",
      "Click Save or Update to confirm the change.",
      "This is not the same as changing the member's BRS login user, password, or user group in Users.",
    ], "Check: Changing a member's membership type may affect their booking rules, online booking access, subscription charges, and reports. Review billing and subscriptions for the member after the change.");
  }

  if (hasAny(lower, ["export", "download", "list"]) && hasAny(lower, ["all member", "all members", "full member", "entire member", "complete member", "whole member", "member list", "members list"]) && !hasAny(lower, ["filter", "category", "junior", "senior", "specific"])) {
    return detailedAnswer(
      "Export a List of All Members",
      "Use the Members page in Memberships to download a full member list as a CSV file.",
      [
        "Open Memberships from the main navigation menu.",
        "Open Members in the Memberships navigation.",
        "Ensure no filters are applied (or use Filter Active Members to include only active members).",
        "Use Filter Columns on the Members page to select the fields you want in the export (such as Title, First Name, Last Name, Email, Membership Type, Membership Status).",
        "Click Download CSV Members on the Members page.",
        "Open the downloaded file in Excel or another spreadsheet application.",
      ],
      [
        {
          title: "Alternative",
          items: [
            "For a formal membership report, use Memberships > Reports > Member Categories under Member Reports.",
            "For email addresses only (Outlook format), use Reports > Type of Report > Member Email Addresses for Outlook.",
          ],
        },
      ]
    );
  }

  if (hasAny(lower, ["add", "create", "register", "set up", "setup"]) && hasAny(lower, ["junior", "junior member", "junior membership", "child", "under 18", "youth"]) && !hasAny(lower, ["export", "download", "spreadsheet", "csv", "database", "report", "list", "produce", "filter", "pull"])) {
    return answer("Add a Junior Member", [
      "Open Memberships from the main navigation menu.",
      "Open Members in the Memberships navigation.",
      "Click CREATE MEMBER.",
      "Enter the junior member's details (name, date of birth, contact details).",
      "Set the Membership Type to the club's junior membership category.",
      "Click Save or Create to add the member.",
    ], "Check: The club must have a junior membership type set up first. If one does not exist, create it in Memberships > Membership Types with the appropriate age limits (Minimum Age / Maximum Age).");
  }

  if (hasAny(lower, ["view", "check", "see", "find", "look at"]) && hasAny(lower, ["transaction", "transactions", "transaction history", "payment history"]) && hasAny(lower, ["member", "members"])) {
    return answer("View a Member's Transaction History", [
      "Open Memberships from the main navigation menu.",
      "Open Members in the Memberships navigation.",
      "Search for and select the member.",
      "Click the member to open their profile.",
      "Open the Billing area within the member's profile.",
      "Review the member's bills, payments, and transaction records shown in the billing section.",
    ], "Check: For wallet/flexible membership transactions, check the member's Account Balances area instead. For BRS Payments transactions, use Tools > BRS Payments > Transactions.");
  }

  if (hasAny(lower, ["delete", "remove", "deactivate"]) && hasAny(lower, ["member", "members"]) && !hasAny(lower, ["player", "golfer", "booking"])) {
    return answer("Delete or Deactivate a Member", [
      "Open Memberships from the main navigation menu.",
      "Open Members in the Memberships navigation.",
      "Search for and select the member.",
      "Click the member to open their profile.",
      "Change the Membership Status to Inactive, Resigned, or the appropriate status for your club's process.",
      "Click Save or Update to confirm.",
    ], "Important: BRS does not typically permanently delete member records because historical billing and booking data is linked to the member profile. Deactivating or changing status is the standard approach. If permanent deletion is required, contact BRS Support.");
  }

  if (hasAny(lower, ["suspend", "freeze", "pause", "hold"]) && hasAny(lower, ["member", "members", "membership"])) {
    return answer("Suspend or Freeze a Membership", [
      "Open Memberships from the main navigation menu.",
      "Open Members in the Memberships navigation.",
      "Search for and select the member.",
      "Click the member to open their profile.",
      "Change the Membership Status to the appropriate suspended or inactive status.",
      "Click Save or Update to confirm.",
    ], "Check: Suspending a member may affect their online booking access, billing, and reports. Review any active payment schemes or upcoming bills for the member. If the club needs a specific 'Suspended' status that doesn't exist, it may need to be created as a membership status option.");
  }

  if (hasAny(lower, ["renew", "renewal", "renewals", "new year", "annual renewal", "yearly renewal"]) && hasAny(lower, ["member", "members", "membership", "memberships"])) {
    return detailedAnswer(
      "Renew Memberships for the New Year",
      "Membership renewals in BRS are handled through the billing process. Create a new bill for the renewal period and publish it to members.",
      [
        "Open Memberships from the main navigation menu.",
        "Open Billing/Payments.",
        "Click CREATE BILLS.",
        "Enter a Billing Reference (e.g., '2027 Annual Renewal') and set the Due Date.",
        "Click SET BILL FILTERS and select the appropriate bill cycle or period.",
        "In Who To Bill, select the membership types or members to include in the renewal.",
        "Select the subscriptions that apply to the renewal (annual fees, etc.).",
        "Add a Payment Scheme if members can pay in instalments.",
        "Click PREVIEW to review the bill details, amounts, and audience.",
        "Click Publish Bill to send the renewal bills to members.",
      ],
      [
        {
          title: "Before renewing",
          items: [
            "Check subscriptions are up to date with correct amounts for the new year.",
            "Review membership types and ensure leavers/resignations have been processed.",
            "Confirm the Calendar End Year in Tools > System Configuration covers the new membership year.",
          ],
        },
      ]
    );
  }



  if (hasAny(lower, ["transfer", "reassign", "swap"]) && hasAny(lower, ["membership", "member"]) && hasAny(lower, ["someone else", "another person", "another member", "different person", "new person", "new member"])) {
    return answer("Transfer a Membership to Another Person", [
      "BRS does not have a one-click transfer membership feature.",
      "To transfer, the standard approach is to deactivate the outgoing member and create a new member profile for the incoming person.",
      "Open Memberships > Members and find the outgoing member.",
      "Change their Membership Status to Resigned, Inactive, or the appropriate leaving status and Save.",
      "Click CREATE MEMBER to create a new profile for the incoming person.",
      "Set their Membership Type to the same category as the outgoing member.",
      "Review billing — if the outgoing member had prepaid fees, contact BRS Support about credit adjustments.",
    ], "Check: If the membership involves a share, debenture, or transferable right, the club may have a specific internal process. Confirm with the club committee before making changes in BRS.");
  }

  if (hasAny(lower, ["direct debit", "go cardless", "gocardless", "standing order"]) && hasAny(lower, ["member", "members", "membership", "set up", "setup", "configure"])) {
    return detailedAnswer(
      "Set Up Direct Debit / Scheduled Payments for Members",
      "Direct debit collection for membership fees is managed through Payment Schemes in BRS. Payment schemes allow members to pay bills in scheduled instalments.",
      [
        "Open Memberships from the main navigation menu.",
        "Open Settings (cog icon) in the Memberships navigation.",
        "Open Payment Schemes.",
        "Create or edit a payment scheme with the correct frequency, start date, and amount.",
        "When creating a membership bill (Billing/Payments > CREATE BILLS), select the payment scheme in the Payment Schemes step.",
        "Members assigned to the scheme will have their payments collected on the scheduled dates.",
      ],
      [
        {
          title: "Check",
          items: [
            "The payment scheme must be linked to a bill before payments are collected.",
            "For failed payments, check Memberships > Billing/Payments or the member's billing area.",
            "If the club uses a specific payment processor (e.g., GoCardless), check Tools > BRS Payments for integration settings.",
          ],
        },
      ]
    );
  }

  if (isMemberDataOutputIntent(lower)) {
    return memberDataExportAnswer(lower);
  }

  const mixedMemberVisitorBookingRulesIntent =
    hasAny(lower, ["visitor", "visitors"]) &&
    hasAny(lower, ["member", "members", "members only", "member priority", "priority"]) &&
    hasAny(lower, ["slot", "slots", "before", "after", "noon", "online", "book", "booking", "rules", "when visitors can book"]) &&
    !hasAny(lower, ["four-ball", "four ball", "4-ball", "4 ball", "4 balls", "4balls", "fourballs", "four balls", "groups of four", "group size", "max group size", "maximum group"]);
  if (mixedMemberVisitorBookingRulesIntent) {
    return answer("Check Member and Visitor Online Booking Rules", [
      "First split the setup by audience: members and visitors can be controlled by different BRS settings.",
      "For member access or member-priority times, go to Tools and open Member Casual Booking Rules.",
      "In Member Casual Booking Rules, check Course, Start Date, End Date, Start Time, End Time, Type, Days Advance Booking, Days of Week, and Applies to.",
      "For visitor online availability, check the visitor online booking setup that controls the date range, day of week, time range, course, and booking window.",
      "Also check Green Fee Rates for Visitors / Tour Operators / Tee Time Agents if the visitor slot depends on a visitor rate being available.",
      "Check Course Restrictions if the rule is really blocking a course, time range, player type, or group size rather than changing member or visitor booking availability.",
      "Test both the member booking view and the public visitor booking flow after any change.",
    ], "Do not treat this as one setting: member-only periods, visitor availability, rates, and course restrictions can all affect whether a slot appears online.");
  }

  if (lower.includes("member booking rules") || (lower.includes("member") && hasAny(lower, ["how far ahead", "book ahead", "ahead they book", "booking rules", "rules"]))) {
    return answer("Configure Member Casual Booking Rules", [
      "Go to Tools.",
      "Open Member Casual Booking Rules.",
      "Use Casual Booking Rules.",
      "Choose Course if the club has multiple courses or tees.",
      "Set Start Date, End Date, Start Time, and End Time.",
      "Set Type to Allow Members to Book or Allow Members to View Only.",
      "Set Days Advance Booking, Guest booking allowed from, Casual guests not allowed, Number of Players, Number of Players Per Tee Time, Guests, and Number of Guests where those controls apply.",
      "Set Days of Week.",
      "Set Applies to as All Membership Types, Selected Membership Types ONLY, or All Membership Types EXCEPT those selected.",
      "Click Add, then check the member online booking view.",
    ]);
  }

  if (hasAny(lower, ["booking rules", "booking restrictions", "advance booking", "player limits", "booking window", "who can book", "online availability rule"])) {
    return answer("Check Booking Rules", [
      "First decide who the rule applies to: members, visitors, open competitions, or a course/group-size restriction.",
      "Use Member Casual Booking Rules for member casual golf booking access.",
      "Use Course Restriction for course or group-size restrictions.",
      "Use visitor or open competition setup for visitor-facing availability.",
      "Check who can book, how far in advance bookings can be made, time restrictions, player limits, and online availability before saving any changes.",
    ]);
  }

  if (hasAny(lower, ["cutoff window", "cut off window", "cut-off window", "cancellation time limit", "cancel time limit", "deadline for members to book", "advance booking days", "how far ahead members", "how far in advance members"])) {
    return answer("Check Member Booking Rules", [
      "First decide whether the question is about member online booking access, cancellations, or a different area such as competitions or visitor booking.",
      "For member online booking access, go to Tools.",
      "Open Member Casual Booking Rules.",
      "Review Start Date, End Date, Start Time, End Time, Type, Days Advance Booking, Days of Week, and Applies to.",
      "Save only after confirming the rule should be changed.",
    ], "Check: If the limit is not a member booking rule, open the matching competition, visitor, or payment setup area.");
  }

  if (hasAny(lower, ["online versus offline", "online vs offline", "online and offline", "offline booking counts"]) || (mentionsBookings && hasAny(lower, ["internet", "online"]) && hasAny(lower, ["staff", "offline", "entered"]))) {
    return answer("Check Online and Offline Booking Counts", [
      "Open the Dashboard.",
      "Use the dashboard booking panels for the date you are checking.",
      "Review the Online and Offline booking count sections shown on the dashboard.",
      "If you manage more than one course, select the course or combined view before comparing the counts.",
    ], "Check: Dashboard figures are live, so compare the current figures in BRS before acting on them.");
  }

  if ((mentionsDashboard || hasAny(lower, ["see", "wer do i see", "where do i see"])) && mentionsToday && mentionsBookings) {
    return answer("View Today's Bookings on the Dashboard", [
      "Open the Dashboard.",
      "Use the dashboard date controls to show today.",
      "Review the bookings panel or booking figures shown for the selected day.",
      "If you manage more than one course, choose the course or combined view before comparing figures.",
    ]);
  }

  if ((mentionsDashboard || hasAny(lower, ["numbers", "figures"])) && mentionsTomorrow) {
    return answer("Switch the Dashboard to Tomorrow", [
      "Open the Dashboard.",
      "Use the dashboard date control to move from today to tomorrow.",
      "Check the dashboard panels after the date changes.",
      "Switch back to today when you are finished checking tomorrow's figures.",
    ]);
  }

  if ((mentionsDashboard || hasAny(lower, ["compare", "figures", "numbers"])) && mentionsCourse && !mentionsTimesheet) {
    return answer("View Dashboard Figures by Course", [
      "Open the Dashboard.",
      "Use the course selector or course filter on the dashboard.",
      "Choose the course you want to review.",
      "Use the combined or all-course view if you need totals across courses.",
    ]);
  }

  if (mentionsDashboard && hasAny(lower, ["report", "reports", "last month", "historical", "history"]) && hasAny(lower, ["today", "todays", "current", "live", "which is which"])) {
    return answer("Dashboard vs Reports", [
      "Use the Dashboard for live or near-current operational figures, such as today's bookings, arrivals, utilisation, and quick booking counts.",
      "Use Reports when you need a historical date range, month-end output, revenue totals, visitor reports, booking details, or downloadable/printable records.",
      "For today, open the Dashboard and set the relevant date/course.",
      "For last month, open Reports, choose the relevant report type, set Start Date and End Date for the month, then run or export the report.",
    ], "Dashboard is for quick operational monitoring; Reports is for date-range analysis and exports.");
  }

  if (isTimesheetSetupQuestion(lower)) {
    return detailedAnswer("Configure the Timesheet",
      "Use this when you need to change the tee-time pattern, not make a booking. This covers tee times starting earlier, finishing later, adding extra tee times at the start or end of the day, or changing the spacing between generated tee times.",
      [
      "Go to Tools.",
      "Open Configure Timesheet.",
      "Under Operation, choose Configure one or multiple days with the same tee time interval or Configure one or multiple days with alternative tee time intervals.",
      "Set Year, Start Month, Start Day of Month, End Month, and End Day of Month.",
      "Set Tee Time Interval or Alternate Tee Time Intervals, then use First Tee Time Hour, First Tee Time Minute, Last Tee Time Hour, and Last Tee Time Minute to control the start and end of the day.",
      "Tick the required days under Select the days of the week you want to configure, then click Configure the Timesheet.",
      "Open the Timesheet and check the generated tee times.",
      ],
      [
        {
          title: "Choose the right option",
          items: [
            "If you need a new first tee time, adjust First Tee Time Hour and First Tee Time Minute.",
            "If you need a later finish, adjust Last Tee Time Hour and Last Tee Time Minute.",
            "If you only need to insert one extra tee time on a specific day, check Squeeze Tee Time on the Timesheet before changing the wider timesheet setup.",
          ],
        },
        {
          title: "Check before and after saving",
          items: [
            "Confirm the selected course, year, start/end date range, and days of week before clicking Configure the Timesheet.",
            "Check Tee Time Interval or Alternate Tee Time Intervals still match the required spacing after adding the earlier or later slot.",
            "After saving, open the affected date on the Timesheet and check the first tee time, last tee time, and interval spacing in the tee-time grid.",
          ],
        },
      ]);
  }

  if (asksAbout(lower, ["view", "open", "switch", "show"], ["timesheet by month", "month view"]) || ((mentionsTimesheet || lower.includes("calender") || lower.includes("calendar")) && lower.includes("month"))) {
    return answer("View the Timesheet by Month", [
      "Open the Timesheet.",
      "Use the Month view option in the timesheet view selector.",
      "Choose the month/date you want to inspect.",
      "Use the normal Timesheet or Day view again when you need to work on a specific tee time.",
    ]);
  }

  if (mentionsTimesheet && (lower.includes("both courses") || lower.includes("both course") || lower.includes("combined") || lower.includes("two courses"))) {
    return answer("View Both Courses on the Timesheet", [
      "Open the Timesheet.",
      "Use the course selector on the timesheet.",
      "Choose Both or the combined-course option.",
      "Switch back to an individual course when you only want one course's tee times.",
    ]);
  }

  if (asksAbout(lower, ["add", "create", "make"], ["single tee time booking", "tee time booking"]) || (lower.includes("single") && lower.includes("tee time") && lower.includes("booking")) || (hasAny(lower, ["put", "add", "book"]) && hasAny(lower, ["golfer", "player", "customer"]) && mentionsTimesheet)) {
    return answer("Add a Single Tee Time Booking", [
      "Open the Timesheet for the correct date and course.",
      "Click the tee time slot you want to book.",
      "Enter the booking details for the player or customer.",
      "Add any required booking notes, services, or payment details that are available in Booking Details.",
      "Save the booking and check it appears on the Timesheet in the correct tee time.",
    ]);
  }

  if (isTeeSheetBookingCancellationQuestion(lower)) {
    return detailedAnswer(
      "Cancel a Tee Sheet Booking",
      "BRS uses the Delete action to cancel an existing tee-sheet reservation. Check the booking first, especially if there is a payment attached.",
      [
        "Open Timesheet.",
        "Use the date and course controls above the tee-time grid to show the booking date and course.",
        "Find the booked tee time in the Timesheet grid. If you do not know the date or tee time, open Search, use Search Bookings, enter the booking reference, customer name, email, telephone, mobile, or postcode in Search Text, choose the Year, and leave Golf selected for a tee-time booking.",
        "Click the booked tee time or booking name if you need to open Booking Details and check the customer, players, notes, services, or payment status before cancelling.",
        "Back on the Timesheet grid, tick the checkbox beside the booked tee time you want to cancel.",
        "Click Delete in the Timesheet action toolbar. This is the BRS control for deleting an existing reservation.",
        "Check the Timesheet grid afterward to confirm the booking has been removed or the tee time is available again.",
      ],
      [
        {
          title: "Payment check",
          items: [
            "Deleting the booking is not the same as refunding a BRS Payments transaction. If you need to return money, open Booking Details, expand the Payments section, use Refund beside the correct payment, and check Tools > BRS Payments > Refunds after processing.",
          ],
        },
      ]
    );
  }

  if (lower.includes("print") && mentionsTimesheet) {
    return answer("Print the Timesheet", [
      "Open Timesheet.",
      "Use the date and course controls above the tee-time grid for the date and course you need.",
      "Use the Print option on the Timesheet.",
      "When the print output opens, use the browser print dialog to print or save the timesheet.",
    ]);
  }

  if (hasAny(lower, ["upload a tee sheet", "upload tee sheet", "upload timesheet", "upload a timesheet", "paste a list of fourballs", "paste list of fourballs"]) || (hasAny(lower, ["upload", "paste"]) && hasAny(lower, ["timesheet", "tee sheet", "teesheet", "fourballs"]))) {
    return answer("Upload a Timesheet", [
      "Go to Tools.",
      "Open Upload Timesheet.",
      "Choose the year, date, and course for the timesheet upload.",
      "Paste or upload the timesheet information in the required format.",
      "Click Upload Timesheet and then check the Timesheet for the selected date.",
    ], "Check: Upload Timesheet does not automatically email members, so use Messages separately if you need to notify people.");
  }

  if ((lower.includes("booking details") && hasAny(lower, ["tee sheet", "timesheet", "tee"])) || (mentionsTimesheet && hasAny(lower, ["open", "info", "details"]) && hasAny(lower, ["slot", "booking", "tee"]))) {
    return answer("Open Booking Details from the Tee Sheet", [
      "Open the Timesheet for the booking date.",
      "Find the tee time containing the booking.",
      "Click the booking on the tee sheet to open Booking Details.",
      "Review or update only the fields needed for the task.",
    ]);
  }

  if ((lower.includes("squeeze") || hasAny(lower, ["extra gap", "extra slot", "make gap"])) && (mentionsTimesheet || lower.includes("tee"))) {
    return answer("Use Squeeze Tee Time", [
      "Open the Timesheet for the date you want to adjust.",
      "Use the Squeeze Tee Time option where it is enabled.",
      "Choose where the extra tee time should be inserted, such as before the first tee time, after the last tee time, or between existing tee times.",
      "Confirm the tee time details before saving the change.",
    ], "Check: If the Squeeze Tee Time option is not visible, check Tools > System Configuration because Enable Squeeze Times controls whether it appears.");
  }

  if (hasAny(lower, ["cancel", "delete", "remove"]) && hasAny(lower, ["booking", "reservation"]) && (mentionsTimesheet || hasAny(lower, ["tee time", "tee sheet"])) && !hasAny(lower, ["tee time slot", "tee time pattern", "all tee times", "empty tee time", "report", "reports"])) {
    return detailedAnswer(
      "Delete a Booking from the Timesheet",
      "Use this to cancel or remove a booking from a tee time. The tee time slot itself remains; only the reservation is removed.",
      [
        "Open the Timesheet from the main navigation menu.",
        "Navigate to the date of the booking.",
        "Tick the checkbox beside the booked tee time you want to cancel.",
        "Click Delete in the action toolbar above the tee-time grid.",
        "The reservation is removed and the tee time becomes available again.",
      ],
      [
        {
          title: "Check",
          items: [
            "If the booking has payments attached via BRS Payments, check whether a refund is required before deleting.",
            "Deleted bookings may still appear in the Cancelled Bookings report under Reports.",
            "For block bookings, select all the tee times in the block before clicking Delete.",
          ],
        },
      ]
    );
  }

  if (hasAny(lower, ["add", "extra", "another", "additional", "include"]) && hasAny(lower, ["player", "golfer", "person", "name"]) && hasAny(lower, ["booking", "existing", "tee time", "booked"])) {
    return answer("Add a Player to an Existing Booking", [
      "Open the Timesheet from the main navigation menu.",
      "Navigate to the date and find the booked tee time.",
      "Click the time of the booked tee time to open Booking Details.",
      "In Booking Details, add the player name in the next available player field.",
      "Click Save or Update to confirm the change.",
    ], "Check: If all player slots are full, consider whether the booking needs to be expanded or an additional tee time booked.");
  }

  if (hasAny(lower, ["remove", "delete", "take off", "take out"]) && hasAny(lower, ["player", "golfer", "person", "name"]) && hasAny(lower, ["booking", "existing", "tee time", "booked"])) {
    return answer("Remove a Player from a Booking", [
      "Open the Timesheet from the main navigation menu.",
      "Navigate to the date and find the booked tee time.",
      "Click the time of the booked tee time to open Booking Details.",
      "In Booking Details, clear the player name from the relevant player field.",
      "Click Save or Update to confirm the change.",
    ], "Check: If removing the last player from a booking, consider whether the entire booking should be deleted instead.");
  }

  if ((hasAny(lower, ["change", "alter", "modify", "update", "switch"]) && hasAny(lower, ["interval", "intervals", "gap", "gaps", "spacing"]) && (mentionsTimesheet || hasAny(lower, ["tee time", "tee times"]))) || (lower.includes("interval") && hasAny(lower, ["from", "to"]) && /\d+\s*(min|minute)/.test(lower))) {
    return detailedAnswer(
      "Change the Tee Time Interval",
      "Use Configure Timesheet to change the interval between tee times (for example, from 10 minutes to 8 minutes).",
      [
        "Go to Tools > Configure Timesheet.",
        "In Operation, choose Configure one or multiple days with the same tee time interval.",
        "Select the Year and set the date range using Start Month, Start Day of Month, End Month, and End Day of Month.",
        "In Tee Time Interval, select the new interval value.",
        "Set First Tee Time Hour, First Tee Time Minute, Last Tee Time Hour, and Last Tee Time Minute to match the required tee time range.",
        "Tick the days of the week under Select the days of the week you want to configure.",
        "Click Configure the Timesheet.",
        "Check the affected dates on the Timesheet to confirm the new interval is applied.",
      ],
      [
        {
          title: "Important",
          items: [
            "This overwrites existing tee times for the selected date range and days.",
            "To set different intervals for weekdays versus weekends, run Configure Timesheet twice: once for weekdays with one interval, then again for weekends with a different interval.",
          ],
        },
      ]
    );
  }

  if (hasAny(lower, ["what view", "which view", "available view", "different view", "views available", "views on", "views of", "list of view", "types of view", "timesheet view"]) && (mentionsTimesheet || hasAny(lower, ["tee sheet", "teesheet"]))) {
    return detailedAnswer(
      "Timesheet Views",
      "BRS provides several views accessible from the Timesheet page using the view links above the tee-time grid.",
      [
        "Day view (default) — shows all tee-time rows for a single date with full booking detail.",
        "Summary view — condensed overview of bookings for a date.",
        "4 Week view — shows four weeks of tee times in a grid layout for quick scanning.",
        "Month view — calendar-style monthly overview.",
        "Year view — full-year calendar overview showing configured days across all months.",
        "Both/combined course view (multi-course clubs) — shows all courses on one screen.",
      ],
      [
        {
          title: "To switch views",
          items: [
            "Use the view links (Day, Summary, 4 Week, Month, Year) above the tee-time grid on the Timesheet page.",
          ],
        },
      ]
    );
  }

  if (hasAny(lower, ["message on", "message to", "messages on", "display message", "add message", "add a message", "put a message", "show a message", "display a notice", "display notice", "put a notice", "show a notice", "notice on"]) && (mentionsTimesheet || hasAny(lower, ["tee sheet", "teesheet"])) && !hasAny(lower, ["email", "send", "mailshot"])) {
    return answer("Add a Message on the Timesheet", [
      "Go to Tools > Messages on the Timesheet in the Additional Set Up Requirements section.",
      "Use Select a Year if the message is for a different year.",
      "Set the Start Date and End Date for when the message should appear.",
      "Enter the message text in the Message on the Timesheet field.",
      "Set Message Time if the message should appear at a specific tee time position.",
      "Select the Days of Week the message should display on.",
      "Tick Members and/or Visitors to control who sees the message.",
      "Click Save or Add to apply the message.",
    ], "Note: This displays text on the tee sheet for members/visitors to see when viewing a date. To send a separate email to people booked on the tee sheet, use Email Messaging.");
  }

  if (hasAny(lower, ["copy", "duplicate", "replicate", "clone"]) && (mentionsTimesheet || hasAny(lower, ["tee sheet", "teesheet", "tee time"])) && hasAny(lower, ["week", "day", "date", "month", "another", "other", "next"])) {
    return detailedAnswer(
      "Copy a Timesheet Setup",
      "BRS does not have a direct copy timesheet from one week to another button on the Timesheet grid. There are several options depending on what you need to copy.",
      [
        "To copy the tee time structure/intervals to new dates: Go to Tools > Configure Timesheet and apply the same configuration (interval, times, days) to the new date range.",
        "To use a saved template: Apply a Timesheet Template from the Configure Timesheet page if one has been saved.",
        "To copy individual bookings between tee times: Use the Copy and Paste functions in the Timesheet action toolbar above the tee-time grid.",
      ],
      [
        {
          title: "Clarify with the user",
          items: [
            "Copy tee time structure/intervals = use Configure Timesheet or Templates.",
            "Copy actual bookings/reservations = use Copy/Paste on the Timesheet.",
          ],
        },
      ]
    );
  }

  if (asksAbout(lower, ["add", "attach", "set up", "setup"], ["services to a booking", "service to a booking", "services on a booking"]) || (hasAny(lower, ["add", "attach"]) && hasAny(lower, ["buggy", "hire", "service", "thing", "extra"]) && lower.includes("booking"))) {
    return answer("Add Services to a Booking", [
      "Open the booking from the Timesheet so you are in Booking Details.",
      "Use the booking's services or extras area to add the service, such as a buggy, caddie, trolley, club hire, room hire, or other configured service.",
      "Check the quantity, service type, and any charge before saving the booking.",
      "If the service is not available to select, go to Tools > Services to check that the service has been set up for the club.",
    ]);
  }

  if (hasAny(lower, ["non-booking", "non booking", "general payment", "payment link", "pay link"]) && hasAny(lower, ["payment link", "pay link", "send", "request", "owes", "balance"])) {
    return answer("Create a General Payment Request", [
      "Go to Tools > BRS Payments > General Payment Requests.",
      "Use Create Payment Request.",
      "Enter the customer/payment request details and amount.",
      "Check that the amount is not already tied to a booking, membership bill, or existing BRS Payments transaction.",
      "Send or create the payment request only after confirming it is a genuine non-booking balance.",
      "Use the General Payment Requests view to review the request afterward.",
    ], "Use this for a non-booking payment link. For tee-time booking payments, open the booking instead. For membership bills, use the member billing workflow.");
  }

  if (mentionsRefund && hasAny(lower, ["booking payment", "booking", "tee time payment", "tee booking", "tee"])) {
    return answer("Refund a Booking Payment", [
      "In the tee-time grid, click the booked tee time or booking name to open Booking Details.",
      "Expand the Payments section in Booking Details.",
      "Confirm the payment was taken through BRS Payments. Payments taken by cash, PDQ, cheque, or another non-BRS method cannot be refunded through BRS.",
      "Click Refund beside the correct payment.",
      "For a partial refund, enter only the amount that should be returned.",
      "Enter a reason if required, then click Refund to confirm the refund.",
    ], "Check: Confirm the booking, customer, amount, payment status, and transaction before refunding.\n\nProcessed refunds can be found under Tools > BRS Payments > Refunds.");
  }

  if (((lower.includes("booking") && !hasAny(lower, ["non-booking", "non booking"])) && mentionsPayment) || (mentionsTimesheet && mentionsPayment && hasAny(lower, ["slot", "cust", "customer", "their"]))) {
    return answer("Check Payments on a Booking", [
      "Open the booking from the Timesheet and go to Booking Details.",
      "Review the booking payment or transaction area.",
      "Check the payment status, amount, customer, and any BRS Payments transaction reference.",
      "Use Tools > BRS Payments > Transactions if you need to cross-check a BRS Payments transaction.",
    ]);
  }

  if ((mentionsSearch && (lower.includes("booking") || mentionsTimesheet) && !hasAny(lower, ["room", "facility", "resource"])) || (lower.includes("booking") && hasAny(lower, ["reference", "ref", "customer name", "email", "phone"]) && !hasAny(lower, ["room", "facility", "resource"])) || (mentionsTimesheet && hasAny(lower, ["phone", "email", "ref", "reference"]))) {
    return answer("Search for a Booking", [
      "Open Search.",
      "Use the Search Bookings form.",
      "Enter the booking reference in Search Text.",
      "Choose the Year for the booking.",
      "Leave Golf selected for tee time bookings, or choose Facility only when the booking is a facility reservation.",
      "Click Search.",
      "Use the matching result only after checking the booking date, tee time, customer, and reference.",
    ], "Search Bookings checks Reservation Name, the 4 Player Names, Booking Contact Name, Booking Ref. Number, Club Ref. Number, Email, Telephone, Mobile, and Postcode.");
  }

  if (hasAny(lower, ["visitor totals", "visitors by country", "number of visitors by country", "visitor revenue", "revenue from visitor online bookings", "visitor online booking revenue"])) {
    return answer("Run Visitor Booking Reports", [
      "Open Reports.",
      "Set Course, Start Date, and End Date.",
      "Open the Type of Report dropdown.",
      "Choose Number of Visitors by Country when you need visitor totals by country.",
      "Choose Revenue From Visitor Online Bookings when you need visitor online booking revenue.",
      "Choose Booking Details or Full Booking Details when you need a detailed visitor booking list.",
      "Click Submit, then use Print Report or the export option if you need a file.",
    ]);
  }

  if (
    (lower.includes("report") || lower.includes("reports")) &&
    lower.includes("visitor")
  ) {
    return answer("Run a Visitor Report", [
      "Open Reports.",
      "Set Course, Start Date, and End Date.",
      "Open the Type of Report dropdown.",
      "Choose Revenue From Visitor Online Bookings when you need visitor online booking revenue.",
      "Choose Number of Visitors by Country when you need visitor totals by country.",
      "Choose Booking Details or Full Booking Details when you need a detailed visitor booking list.",
      "Click Submit.",
      "Use Print Report or the report output export control if you need to share the result.",
    ]);
  }

  if (hasAny(lower, ["set up", "setup", "create", "add", "configure"]) && hasAny(lower, ["facility", "room", "resource"]) && !hasAny(lower, ["booking", "reservation", "book"])) {
    return answer("Set Up a New Facility or Room", [
      "Open Facilities from the main navigation menu.",
      "Use the configuration or setup area to add a new room or facility.",
      "Enter the facility name, set available booking fields (Reservation Name, Guests, Room/Facility, Start, End), and configure Repeat Days and Repeat Weeks if recurring availability is needed.",
      "Set the booking rules such as available times and days of week.",
      "Save and confirm the new facility appears in the Facilities booking grid.",
    ], "Check: If facility setup options are not visible, verify that Facility Booking is enabled in Tools > System Configuration, and that your user group has the required permissions in Users.");
  }

  if (hasAny(lower, ["cancel", "delete", "remove"]) && hasAny(lower, ["facility booking", "room booking", "facility reservation", "room reservation"]) || (hasAny(lower, ["cancel", "delete"]) && hasAny(lower, ["facility", "room"]) && hasAny(lower, ["booking", "reservation"]))) {
    return answer("Cancel a Facility Booking", [
      "Open Facilities from the main navigation menu.",
      "Use the Booking view to find the reservation on the correct date.",
      "Click the facility booking you want to cancel.",
      "Click Cancel reservation in the reservation actions.",
      "Confirm the cancellation and check the booking grid to verify it has been removed.",
    ]);
  }

  if (hasAny(lower, ["rate", "rates", "price", "prices", "pricing", "charge", "cost"]) && hasAny(lower, ["facility", "room", "resource"])) {
    return answer("Set Facility Booking Rates", [
      "Facility rate configuration depends on your club's module setup.",
      "Check Tools > System Configuration for facility rate settings.",
      "If rates are configured per room or per time period, set the rate amount for each facility type.",
      "Save changes and verify the correct rate displays when creating a new facility booking.",
    ], "Note: Not all clubs have facility rate configuration enabled. If rate settings are not visible in Tools > System Configuration, contact BRS Support to confirm your club's facility billing setup.");
  }

  if (hasAny(lower, ["facility booking terms", "facility terms", "room booking terms"]) && hasAny(lower, ["change", "set", "edit", "terms"])) {
    return answer("Set Up Legal Messages", [
      "Go to Tools.",
      "Open Legal Messages.",
      "Use the Legal Messages table with Legal Message, Version, and Actions.",
      "Open Facility Booking Terms and Conditions.",
      "Edit the legal message text for that entry.",
      "Save the change, then check the facility booking screen.",
    ]);
  }

  if ((asksAbout(lower, ["make", "add", "create", "book"], ["facility booking", "room booking", "resource reservation", "facility reservation"]) || (hasAny(lower, ["book", "reserve"]) && hasAny(lower, ["function room", "room", "facility", "resource"]))) && !hasAny(lower, ["find", "search", "look up", "locate", "where is"])) {
    return answer("Make a Facility Booking", [
      "Open Facilities.",
      "Use the Booking view for the date you need.",
      "Enter or select the reservation name, guest count, room or facility, start time, and end time.",
      "Use repeat days or repeat weeks only if the reservation should repeat.",
      "Check the facility booking grid to make sure the reservation is shown in the right place.",
    ]);
  }

  if (hasAny(lower, ["room", "rooms", "resource", "facility"]) && hasAny(lower, ["reservation", "booking", "find", "made", "month"])) {
    return answer("Find a Facility Reservation", [
      "Open Facilities.",
      "Use Booking for the reservation list, or Month/Year for a wider date view.",
      "Match the reservation by room/facility, reservation name, date, start time, or end time.",
      "Open the reservation record to check the details before changing anything.",
    ]);
  }

  if (lower.includes("contact") && dataOutputIntent && hasAny(lower, ["email address", "email addresses", "emails", "export", "download", "spreadsheet", "csv", "report", "produce", "pull", "extract"]) && !hasAny(lower, ["send", "sending", "mailshot", "newsletter"])) {
    return answer("Run a Contact Report", [
      "Open Reports.",
      "Choose the contact report or contact-related export.",
      "Set the contact category or other filters needed, such as Tour Operator, Society, Hotel, Company, Visitor, or Other.",
      "Run the report.",
      "Use Print Report or the export/download control to save the contact list.",
      "Use the contact email-sending workflow only when you want to send an email, not when you only need contact email addresses in a spreadsheet.",
    ]);
  }

  if (
    asksAbout(lower, ["add", "create"], ["visitor contact", "new contact", "society contact", "tour operator contact", "hotel contact"]) ||
    (/\b(add|create)\b/.test(lower) && hasAny(lower, ["hotel", "visitor", "society", "tour operator"]) && lower.includes("contact")) ||
    (hasAny(lower, ["hotel partner", "local hotel", "hotel", "company record", "company / group", "group name"]) && hasAny(lower, ["where", "live", "record", "store", "details", "sending guests", "sends visitors"]))
  ) {
    return answer("Add a New Contact", [
      "Open Contacts.",
      "Click Add New.",
      "On Add Contact, use General Information to enter Company / Group Name if the contact is a company, society, hotel, or tour operator.",
      "Choose Contact Category, such as Visitor, Society, Tour Operator, Hotel, Company, or Other.",
      "In Contact, enter the person's Title, First Name, Last Name, Email, Telephone, and Mobile where you have them.",
      "Use Address Information for Address, Town / City, County / State, Country, and Postcode / Zip.",
      "Use Club Details for Club Name, Handicap, and CDH when those golf details are needed.",
      "Set the Marketing Preferences only where the contact has given the club permission.",
      "Click Add when the contact details are correct.",
    ]);
  }

  if (lower.includes("contact") && hasAny(lower, ["category", "categories", "cat", "cats", "type", "types"]) && hasAny(lower, ["make", "new", "create", "set up", "setup"])) {
    return answer("Set Up Contact Categories", [
      "Go to Tools.",
      "Open Contact Categories.",
      "Create or edit the category used for contact records.",
      "Return to Contacts and check the category is available on the contact record.",
    ]);
  }

  if (lower.includes("contact") && hasAny(lower, ["category", "type", "only", "filter", "show"])) {
    return answer("Filter Contacts by Category", [
      "Open Contacts.",
      "Use View Contacts or View All.",
      "Filter by the contact category, such as Visitor, Society, Tour Operator, Hotel, Company, Other, or a club category.",
      "Open the contact record you need from the filtered results.",
    ]);
  }

  if (lower.includes("society contact") || (lower.includes("contact") && lower.includes("society"))) {
    return answer("Find a Society Contact", [
      "Open Contacts.",
      "Use View Contacts or View All.",
      "Filter the contact category to Society.",
      "Search or scan the results for the society contact record.",
      "Open the contact record to check the details.",
    ]);
  }

  if (hasAny(lower, ["change", "update", "edit", "modify", "amend"]) && lower.includes("contact") && hasAny(lower, ["email", "email address", "phone", "telephone", "address", "name", "details"])) {
    return answer("Change a Contact's Details", [
      "Open Contacts from the main navigation menu.",
      "Search for and select the contact you want to update.",
      "Click the contact to open their record.",
      "Edit the relevant field (email address, phone number, name, or address).",
      "Click Save or Update to confirm the change.",
    ]);
  }

  if (lower.includes("contact") && dataOutputIntent && hasAny(lower, ["email address", "email addresses", "emails", "export", "download", "spreadsheet", "csv", "report", "produce", "pull", "extract"]) && !hasAny(lower, ["send", "sending", "mailshot", "newsletter"])) {
    return answer("Run a Contact Report", [
      "Open Reports.",
      "Choose the contact report or contact-related export.",
      "Set the contact category or other filters needed, such as Tour Operator, Society, Hotel, Company, Visitor, or Other.",
      "Run the report.",
      "Use Print Report or the export/download control to save the contact list.",
      "Use the contact email-sending workflow only when you want to send an email, not when you only need contact email addresses in a spreadsheet.",
    ]);
  }

  if (!dataOutputIntent && (lower.includes("email contacts") || (hasAny(lower, ["email", "mail", "send an email"]) && lower.includes("contact") && !hasAny(lower, ["change", "update", "edit", "modify", "amend"])))) {
    return answer("Email Contacts", [
      "Go to Tools.",
      "Open Email Messaging.",
      "Choose Email Contacts.",
      "Select or filter the contacts who should receive the email.",
      "Check the audience and email content before sending.",
    ]);
  }

  if (!dataOutputIntent && ((hasAny(lower, ["email", "mail"]) && lower.includes("membership type")) || (hasAny(lower, ["email", "mail"]) && hasAny(lower, ["senior membership", "membership category", "membership group", "membership"])))) {
    return answer("Email Members in a Membership Type", [
      "Go to Tools.",
      "Open Email Messaging.",
      "Choose Email Membership Types.",
      "Select the membership type audience, using the male/female options if those are needed.",
      "Prepare and send the email when the audience and content are correct.",
    ]);
  }

  if (!dataOutputIntent && hasAny(lower, ["email", "mail"]) && (lower.includes("selected members") || hasAny(lower, ["members i tick", "members i picked", "members i selected"]))) {
    return answer("Email Selected Members", [
      "Go to Tools.",
      "Open Email Messaging.",
      "Choose Email Selected Members.",
      "Select the members who should receive the email.",
      "Check the selected members and email content before sending.",
    ]);
  }

  if (!dataOutputIntent && hasAny(lower, ["email", "mail"]) && lower.includes("members")) {
    return answer("Email Members", [
      "Go to Tools.",
      "Open Email Messaging.",
      "Choose Email Membership Types, Email Membership Groups, or Email Selected Members.",
      "Select the membership type, member group, or selected members who should receive the email.",
      "Check the selected audience and message content before sending.",
    ]);
  }

  if ((hasAny(lower, ["message", "notice", "text"]) && hasAny(lower, ["top of the tee sheet", "top of tee sheet", "top of the timesheet", "top of timesheet", "message at top"])) || (hasAny(lower, ["messages on the timesheet", "timesheet messages"]) && hasAny(lower, ["change", "set", "edit", "add"]))) {
    return answer("Set Messages on the Timesheet", [
      "Go to Tools.",
      "Open Messages on the Timesheet.",
      "Use Select a Year if the message is for a different year.",
      "In Message on the Timesheet, set Start Date, End Date, Message Time, and Days of Week.",
      "Tick Members and/or Visitors if those users should see the message.",
      "Enter the text in Message, then click Add.",
      "Return to the Timesheet and check the message appears in the correct place.",
    ]);
  }

  if (hasAny(lower, ["frost delay notice", "delay notice", "notice needed", "put the message", "put a message", "put a notice"]) && (mentionsTimesheet || hasAny(lower, ["tee sheet", "teesheet"]))) {
    return answer("Add a Message on the Timesheet", [
      "Go to Tools > Messages on the Timesheet in the Additional Set Up Requirements section.",
      "Use Select a Year if the message is for a different year.",
      "Set the Start Date and End Date for when the message should appear.",
      "Enter the message text in the Message on the Timesheet field.",
      "Set Message Time if the message should appear at a specific tee time position.",
      "Select the Days of Week the message should display on.",
      "Tick Members and/or Visitors to control who sees the message.",
      "Click Save or Add to apply the message.",
    ]);
  }

  if (!dataOutputIntent && hasAny(lower, ["email", "mail", "message"]) && (lower.includes("timesheet") || lower.includes("tee sheet") || lower.includes("sheet")) && hasAny(lower, ["people booked", "booked on", "timesheet", "tee sheet"])) {
    return answer("Email the Timesheet", [
      "Go to Tools.",
      "Open Email Messaging.",
      "Choose Email the Timesheet.",
      "Select the date and time range for the timesheet audience.",
      "Check whether the message should go to members, contacts, or both people linked to bookings on that timesheet.",
      "Prepare and send the email when the audience and content are correct.",
    ]);
  }

  if (hasAny(lower, ["text", "txt", "sms"]) && (lower.includes("selected members") || hasAny(lower, ["members i tick", "members i picked", "members i selected"]))) {
    return answer("Text Selected Members", [
      "Go to Tools.",
      "Open Text Messaging.",
      "Choose Text Message Selected Members.",
      "Select the members who should receive the text message.",
      "Check SMS credit and the selected audience before sending.",
    ]);
  }

  if (hasAny(lower, ["text", "txt", "sms"]) && hasAny(lower, ["membership type", "membership group", "member group", "members in a group"])) {
    return answer("Text Members in a Membership Type or Group", [
      "Go to Tools.",
      "Open Text Messaging.",
      "Choose Text Message Membership Types or Text Message Membership Groups.",
      "Select the membership type or member group audience.",
      "Check SMS credit, the selected audience, and message content before sending.",
    ]);
  }

  if (hasAny(lower, ["text", "txt", "sms"]) && lower.includes("contact")) {
    return answer("Text Contacts", [
      "Go to Tools.",
      "Open Text Messaging.",
      "Choose Text Message Contacts.",
      "Select or filter the contacts who should receive the text.",
      "Check SMS credit and the selected audience before sending.",
    ]);
  }

  if (lower.includes("member groups for messaging") || (hasAny(lower, ["set up", "setup", "create", "make"]) && hasAny(lower, ["member group", "member groups", "membership group"]) && lower.includes("messaging"))) {
    return answer("Set Up Member Groups for Messaging", [
      "Go to Tools.",
      "Open Member Groups for Messaging.",
      "Create or edit the member group used for message targeting.",
      "Add the relevant members or criteria to the group.",
      "Return to Messages and check the group is available as a message audience.",
    ]);
  }

  if (hasAny(lower, ["text", "txt", "sms"]) && hasAny(lower, ["credit", "top up", "topup"])) {
    return answer("Buy Text Messaging Credit", [
      "Go to Tools.",
      "Open Text Messaging.",
      "Choose Purchase Text Messaging Credit.",
      "Review the club's available SMS credit before buying more.",
      "Complete the purchase only when the club has confirmed the credit amount required.",
    ]);
  }

  if (hasAny(lower, ["sent message", "sent messages", "message history", "messages i sent", "messages we sent", "find sent", "view sent", "previous message", "previous messages", "old message", "old messages"]) && !hasAny(lower, ["text", "txt", "sms", "club message"])) {
    return answer("View Sent Messages", [
      "For recently sent emails: Go to Tools > Email Messaging. The page displays recently sent messages with columns for username, date/time sent, email subject, recipient count, and attachments.",
      "For recently sent text messages: Go to Tools > Text Messaging. The page displays recently sent SMS with columns for username, date/time sent, message text, number of mobiles, and marketing flag.",
      "For recently sent club messages: Open Messages from the main navigation menu. The Club Messages area shows sent messages with date, audience, and message content.",
    ], "Tip: Each messaging area also provides a report link for older messages beyond the recent list.");
  }

  if (hasSchedulingDeliveryIntent(lower) && !explicitlyNotScheduling(lower) && hasAny(lower, ["message", "email", "text", "sms", "club message"])) {
    return answer("Schedule a Message for Later", [
      "BRS does not currently support scheduling messages to send at a future time.",
      "Messages (emails, texts, and club messages) are sent immediately when you click Send.",
      "If you need to send a message at a specific time, prepare the content in advance and send it manually at the required time.",
    ], "Tip: For recurring operational notices on the Timesheet, use Tools > Messages on the Timesheet — these display automatically on the configured dates without manual sending.");
  }

  if (hasAny(lower, ["text", "txt", "sms"]) && (lower.includes("recently sent") || lower.includes("sent text") || lower.includes("old texts") || lower.includes("old sms"))) {
    return answer("View Recently Sent Text Messages", [
      "Open Messages.",
      "Go to Text Messages.",
      "Open the recently sent text messages or SMS report area.",
      "Use the date or message list to review the text messages that were sent.",
    ]);
  }

  if ((lower.includes("club message") || lower.includes("club notice") || lower.includes("club note")) && hasAny(lower, ["members in a group", "member group", "membership group", "group"])) {
    return answer("Send a Club Message to a Member Group", [
      "Open Messages or the dashboard Club Messages shortcut.",
      "Go to Club Messaging.",
      "Choose the club-message option for member groups.",
      "Select the member group audience.",
      "Check the audience and message content before sending.",
    ]);
  }

  if ((lower.includes("club message") || lower.includes("club notice") || lower.includes("club note")) && lower.includes("course")) {
    return answer("Send a Club Message to a Course", [
      "Open Messages or the dashboard Club Messages shortcut.",
      "Go to Club Messaging.",
      "Choose the club-message option for a course or course audience.",
      "Select the course and any date/audience filters required.",
      "Check the audience and message content before sending.",
    ]);
  }

  if ((lower.includes("club message") && lower.includes("all members")) || (hasAny(lower, ["club notice", "club note"]) && hasAny(lower, ["everyone", "all members"]))) {
    return answer("Send a Club Message to All Members", [
      "Open Messages or the dashboard Club Messages shortcut.",
      "Go to Club Messaging.",
      "Choose Message All Members if the app/website message should go to every member, or choose the matching member group/type option if it should only go to a segment.",
      "Enter the club message content. This sends through Club Messages as an app/website notice, not as an email.",
      "Review the audience, message wording, and timing before sending.",
      "Send only after the club has confirmed the message should go to that app/website audience.",
    ], "Use Club Messages for member app/new members website notices. Use the separate email workflow only when the club wants an email.");
  }

  if ((lower.includes("club message") && lower.includes("timesheet")) || (hasAny(lower, ["club notice", "club note"]) && hasAny(lower, ["sheet", "tee sheet", "people on"]))) {
    return answer("Send a Club Message to the Timesheet", [
      "Open Messages or the dashboard Club Messages shortcut.",
      "Go to Club Messaging.",
      "Choose Message The Timesheet.",
      "Select the date or timesheet audience.",
      "Check the selected members on the tee sheet before sending.",
    ]);
  }

  if (lower.includes("club message") && lower.includes("recently sent")) {
    return answer("View Recently Sent Club Messages", [
      "Open Messages or the dashboard Club Messages shortcut.",
      "Go to Club Messaging.",
      "Open the recent club messages or report area.",
      "Review the recently sent club message entries for the date or audience you need.",
    ]);
  }

  if ((lower.includes("message") && lower.includes("timesheet")) || (hasAny(lower, ["warning note", "note"]) && hasAny(lower, ["tee sheet", "timesheet", "sheet"]))) {
    return answer("Add a Timesheet Message", [
      "Open the Timesheet.",
      "Use the timesheet message option for the date or sheet you are updating.",
      "Enter the message that should appear on the timesheet.",
      "Save the timesheet message and refresh the sheet to confirm it appears where expected.",
    ]);
  }

  if ((lower.includes("flexible membership") || lower.includes("flexi")) && hasAny(lower, ["add", "enable", "turn on", "club"])) {
    return answer("Add Flexible Membership", [
      "Treat Flexible Membership as an optional BRS feature.",
      "Contact BRS if Flexible Membership is not enabled for your club.",
      "After it is enabled, manage flexi member records from the Memberships/member profile area.",
    ]);
  }

  if (hasAny(lower, MEMBER_CREATE_TERMS) && !hasAny(lower, USER_ACCOUNT_TERMS) && !hasAny(lower, MEMBER_CREATE_EXCLUSION_TERMS)) {
    return answer("Create a Member Profile", [
      "Open Memberships from the main navigation menu.",
      "Open Members in the Memberships navigation.",
      "Click CREATE MEMBER on the Members screen.",
      "Enter the member details shown on the create-member screen, including the member name fields and the membership type/status controls shown there.",
      "Save or create the member only after checking the details entered for that member.",
      "Return to Memberships > Members and use Search, Filter Active Members, Membership Type, or the Actions column to confirm the new member profile appears.",
    ], "Check: Use Users > Add New only when the request is about a staff/admin/member login account, password, user group, or permissions. Do not use the Users form as the route for a normal Memberships member profile.");
  }

  const membershipTypeIntent = objectIntent(lower, ["membership type", "membership types", "member type", "member types", "senior membership", "junior membership", "membership category"], MEMBER_TARGET_TERMS);
  if (membershipTypeIntent === "apply") {
    return answer("Change a Member's Membership Type", [
      "Open Memberships.",
      "Find and open the relevant member profile.",
      "Use the membership type or member type field on the member profile.",
      "Select the correct membership type.",
      "Check the member status, subscriptions, and billing effect before saving.",
    ]);
  }

  if (membershipTypeIntent === "configure") {
    return answer("Set Up Membership Types", [
      "Go to Tools.",
      "Open Membership Types.",
      "Use Create Membership Type or open the membership type you need to edit.",
      "Check the membership type name, age rules, status, flex setting, and default subscriptions before saving.",
      "Return to Memberships and check the member profile or bill setup that uses that membership type.",
    ]);
  }

  if (hasAny(lower, ["owes", "owe", "owed", "outstanding"]) && hasAny(lower, ["subs", "subscription", "membership", "members", "money"])) {
    return answer("View Members Who Owe Membership Money", [
      "Open the Memberships area.",
      "Use Billing/Payments or Memberships > Reports to find unpaid membership bills or outstanding balances.",
      "Run the relevant membership billing report if you need a list.",
      "Open an individual member profile when you need to check one member's billing history or balance.",
    ]);
  }

  if (hasAny(lower, ["member balance", "balance history", "billing history"]) || (lower.includes("one member") && hasAny(lower, ["balance", "history", "billing"]))) {
    return answer("Check One Member's Billing History", [
      "Open Memberships.",
      "Find and open the member profile.",
      "Use the member profile billing or payments area.",
      "Review the member's balance, bills, payment history, and outstanding items.",
    ]);
  }

  const membershipBillCreationIntent = (
    hasAny(lower, BILL_CREATION_ACTIONS) &&
    hasAny(lower, BILL_TARGET_TERMS) &&
    !hasAny(lower, BILL_CREATION_EXCLUSIONS)
  );
  if (membershipBillCreationIntent) {
    return answer("Create a Membership Bill", [
      "Open Memberships.",
      "Open Billing/Payments.",
      "Click CREATE BILLS.",
      "In Enter Billing Details, enter the Billing Reference and Due Date.",
      "Click SET BILL FILTERS, choose the bill cycle or period option, then use Who To Bill to confirm the members or audience for the bill.",
      "Select the subscriptions, discounts, or Custom Bill Items needed for the bill. Use ADD ITEM only when you need an extra one-off line item.",
      "In Payment Schemes, select a scheme only if you want to offer scheduled or instalment payments; otherwise leave it unselected for a one-lump-sum bill.",
      "Click PREVIEW, then review the member/audience, bill reference, due date, subscriptions, custom items, discounts, payment options, and totals before finalising.",
    ], "Check: Return to Billing/Payments, use View All Bills or the bill search/filter controls, and confirm the bill appears with the correct member or audience, due date, amount, payment status, and publish status.");
  }

  if (
    hasAny(lower, ["create", "add", "new", "set up", "setup", "register", "enable"]) &&
    hasAny(lower, ["member profile", "member account", "member login", "member registration", "members tee time reservation", "brs members tee time reservation"]) &&
    !hasAny(lower, ["staff", "admin", "receptionist", "pro shop", "login user"])
  ) {
    return answer("Create a Member Profile or Account", [
      "Give the member the club's BRS Members Tee Time Reservation URL, or add that URL to the club website.",
      "Ask the member to register their details through the club website or member booking link.",
      "Verify the member registration in BRS.",
      "Enable the member's profile after the registration has been verified.",
    ], "Check: For staff or admin login accounts, open Users instead.");
  }

  const paymentSchemeIntent = objectIntent(lower, PAYMENT_SCHEME_TERMS, BILL_TARGET_TERMS);
  const paymentSchemeMemberApplyIntent = hasAny(lower, PAYMENT_SCHEME_TERMS) &&
    hasAny(lower, ["member", "members", "member profile", "member bill", "membership bill", "bill"]) &&
    hasAny(lower, ["put", "apply", "attach", "assign", "select", "add to", "link"]);
  if (paymentSchemeIntent === "apply" || paymentSchemeMemberApplyIntent) {
    return answer("Apply a Payment Scheme to a Membership Bill", [
      "Open Memberships.",
      "Find and open the relevant member profile.",
      "Go to the member's billing or bill/payment area.",
      "Open the bill that the payment scheme should be linked to.",
      "Select the payment scheme or scheduled payment option shown for that bill.",
      "Check the scheme start date, payment frequency, amount, member status, and linked bill before saving.",
    ], "Check: If this is about a failed scheduled payment, check the failed payment reason before changing the scheme.");
  }

  if (paymentSchemeIntent === "configure") {
    return answer("Create or Manage Membership Payment Schemes", [
      "Open Memberships.",
      "Open Settings.",
      "Open Payment Schemes.",
      "Create a new payment scheme, or open the existing payment scheme you need to change.",
      "Check the scheme name, schedule, payment amounts, and any active membership bill use before saving.",
    ], "For an existing payment scheme on a specific member bill, open the member bill and apply the scheme there.");
  }

  if (hasAny(lower, ["member bill", "membership bill", "member invoice", "membership invoice"]) && mentionsRefund) {
    return answer("Refund a Payment on a Membership Bill", [
      "Open Memberships.",
      "Find and open the relevant member profile.",
      "Go to the member's billing or bill/payment area.",
      "Find the membership bill payment that needs to be refunded.",
      "Confirm the member, bill, amount, payment status, and that the payment was taken through BRS Payments before refunding.",
      "If the payment was taken by cash, PDQ, cheque, or another non-BRS method, refund it outside BRS using the club's normal process.",
    ], "Processed refunds can be found under Tools > BRS Payments > Refunds.");
  }

  if (hasAny(lower, ["flexi", "flexible"]) && hasAny(lower, ["wallet", "balance", "amount", "account"])) {
    return answer("Check a Flexi Member Wallet Balance", [
      "Open Memberships.",
      "Find and open the flexi member profile.",
      "Review the member profile wallet/account balance area.",
      "Check the balance and transaction history before making changes.",
    ]);
  }

  if ((lower.includes("failed") || lower.includes("fail")) && (lower.includes("scheduled") || lower.includes("schedule")) && (lower.includes("membership") || lower.includes("subs"))) {
    return answer("Check Failed Scheduled Membership Payments", [
      "Open Memberships.",
      "Go to the billing or scheduled payments area.",
      "Filter for failed scheduled payments.",
      "Open the relevant member profile to review the member, bill, payment status, amount, and payment history.",
      "Use the billing reports area if you need a list rather than one member record.",
    ]);
  }

  if (hasAny(lower, ["add", "new", "needs login", "needs access", "create", "make"]) && hasAny(lower, ["staff user", "new user", "admin user", "user account", "receptionist", "pro shop user", "pro shop assistant", "assistant", "login", "access", "read only staff", "readonly staff", "staff account"])) {
    return answer("Add a User", [
      "Go to Users.",
      "Click Add New.",
      "On Create a New User / Add a Member, choose User Group*, such as Staff, StaffReadOnly, Admin, Event, or Member.",
      "Enter Username*.",
      "Leave Enable / Disable* set to Enable for an active staff login.",
      "Choose Membership Type* only if the account type requires it in the form.",
      "Enter Password and Re-type Password. The page notes the password must be at least 5 characters.",
      "Enter First Name* and Last Name*.",
      "Click Create new user when the details and user group are correct.",
    ], "Check: Do not ask the person for their current password.");
  }

  if (lower.includes("password") && (lower.includes("user") || lower.includes("staff") || lower.includes("forgot"))) {
    return answer("Change or Reset a User Password", [
      "If you cannot sign in, use Forgot password on the BRS sign-in page.",
      "If you are already signed in and need to change your own password, open Users and use Your Details or Change My Password.",
      "On Change My Password, enter Current Password, New Password, and Confirm Password, then save the change.",
      "If an admin is resetting another user's password, go to Users, find and open the correct user account, then use Change Password or Reset Password by email from the Update User Details page.",
      "Confirm the user can sign in after the reset route is complete.",
    ], "Check: Do not ask the person for their current password. If the user cannot sign in and the Forgot password route does not work, escalate to an authorised club admin or BRS Support.");
  }

  if (
    hasAny(lower, ["change", "edit", "update", "alter", "amend"]) &&
    hasAny(lower, ["permission", "permissions", "access", "privilege", "privileges", "user group"]) &&
    hasAny(lower, ["staff", "admin user", "user", "pro shop", "receptionist"])
  ) {
    return answer("Change Permissions for a Staff User", [
      "Go to Users.",
      "Use Retrieve Users to find the staff user.",
      "Open the staff user's record.",
      "Review the User Group shown on the user details page.",
      "Change the User Group only if that is the permission level the staff user should have.",
      "Save the user record.",
      "Return to Users and Retrieve Users to confirm the staff user now shows the correct User Group.",
    ], "For changing what a whole group can access, go to Users > User Privileges instead of editing one user record.");
  }

  if ((lower.includes("staff user") || lower.includes("staff group") || lower.includes("user") || lower.includes("pro shop")) && (lower.includes("access tools") || lower.includes("not access tools") || lower.includes("see tools") || lower.includes("privileges") || lower.includes("permissions") || lower.includes("cant") || lower.includes("can't"))) {
    return answer("Check User Privileges", [
      "Go to Users.",
      "Open User Privileges.",
      "Open the user group or permission set you need to review.",
      "Check whether Tools access is enabled for that user group.",
      "Update the privileges only after confirming that user group should have access.",
    ], "Check: If the user is in the wrong user group, open the user record under Users and correct the group first.");
  }

  if (lower.includes("own user details") || lower.includes("my own user details") || lower.includes("your details") || (hasAny(lower, ["my own", "own", "my"]) && hasAny(lower, ["login details", "user details"]))) {
    return answer("Find Your Own User Details", [
      "Go to Users.",
      "Open Your Details.",
      "Review the details shown for the signed-in account.",
      "Update allowed fields only where the club's setup permits it.",
    ]);
  }

  if (hasAny(lower, ["delete", "remove", "deactivate"]) && hasAny(lower, ["user", "user account", "staff account", "login"]) && !hasAny(lower, ["booking", "member", "contact"])) {
    return answer("Delete or Disable a User Account", [
      "Open Users from the main navigation menu.",
      "Find and open the user account you want to remove.",
      "Use the disable option to deactivate the user without deleting their record.",
      "Prefer disabling over permanent deletion to retain audit history and booking records linked to that user.",
      "Confirm the intended account before saving the change.",
    ], "Important: BRS retains user records for audit purposes. Disabling a user removes their access without losing historical data. If permanent deletion is required, contact BRS Support.");
  }

  if (hasAny(lower, ["disable a user", "disable user", "enable or disable", "remove access", "old employee"]) || (lower.includes("user") && lower.includes("disabled"))) {
    return answer("Disable a User", [
      "Go to Users.",
      "Find and open the correct user account.",
      "Use the enable/disable option in the user management area.",
      "Prefer disabling over deleting when the club may need to retain audit history.",
      "Confirm the intended account before saving the change.",
    ]);
  }

  if (lower.includes("member login user") || (lower.includes("member") && lower.includes("login user")) || (lower.includes("member") && lower.includes("online login"))) {
    return answer("Add or Manage a Member Login User", [
      "Go to Users.",
      "Use Add New if the member needs a new login account.",
      "Choose the Member user group or member-login user type available in the club's setup.",
      "Link the login to the appropriate member details where required.",
      "Use Memberships for the member profile, billing, subscription, and wallet details.",
    ]);
  }

  if ((lower.includes("general payment request") && lower.includes("refund")) || (mentionsRefund && hasAny(lower, ["payment link", "pay link"]))) {
    return answer("Refund a General Payment Request", [
      "Go to Tools > BRS Payments > Transactions.",
      "Search for the general payment request transaction.",
      "Confirm the customer, amount, date, and payment status.",
      "Use the refund action on the correct transaction when the payment is eligible.",
      "Review Tools > BRS Payments > Refunds for the refund record.",
    ]);
  }

  if (lower.includes("payment faq") || lower.includes("payments faq") || (lower.includes("brs payments") && hasAny(lower, ["faq", "faqs", "help"]))) {
    return answer("Open BRS Payments FAQs", [
      "Go to Tools > BRS Payments.",
      "Open FAQs.",
      "Use the FAQ entry that matches the payment question.",
      "If the FAQ does not cover the case, check the relevant BRS Payments area such as Transactions, Refunds, Payouts, or Requests.",
    ]);
  }

  if ((lower.includes("brs payments") && lower.includes("transactions")) || (hasAny(lower, ["stripe", "brs payment", "online payment"]) && hasAny(lower, ["list", "transactions", "transaction"]))) {
    return answer("View BRS Payments Transactions", [
      "Go to Tools.",
      "In the BRS Payments section, open Transactions.",
      "Search or filter for the transaction you need.",
      "Review the customer, amount, date, payment status, and reference before taking any action.",
    ]);
  }

  if ((lower.includes("brs payments") && lower.includes("payout")) || (hasAny(lower, ["pay us out", "paid us out", "payout", "payouts"]) && hasAny(lower, ["brs", "online", "payment", "pay"]))) {
    return answer("View BRS Payments Payouts", [
      "Go to Tools > BRS Payments.",
      "Open Payouts.",
      "Choose the payout date range or payout entry you need.",
      "Review the payout summary and linked transactions.",
    ]);
  }

  if ((lower.includes("brs payments") || lower.includes("payments") || lower.includes("online payments")) && lower.includes("vat")) {
    return answer("Download a BRS Payments VAT Report", [
      "Go to Tools > BRS Payments.",
      "Open VAT Reports.",
      "Choose the invoice period month and year for the report.",
      "Download the VAT report as PDF or CSV for reconciliation.",
    ]);
  }

  if (lower.includes("vat") && hasAny(lower, ["report", "reports", "export", "download"])) {
    return answer("Download a BRS Payments VAT Report", [
      "Go to Tools > BRS Payments.",
      "Open VAT Reports.",
      "Choose the invoice period month and year for the report.",
      "Download the VAT report as PDF or CSV for reconciliation.",
    ]);
  }

  if ((lower.includes("brs payments") && lower.includes("refund")) || (hasAny(lower, ["online payment", "brs payment"]) && lower.includes("refund") && lower.includes("list")) || (lower.includes("refund") && hasAny(lower, ["record", "records", "history", "previous", "report", "retrieve", "after a refund", "see refund", "view refund", "find", "list"]))) {
    return answer("View BRS Payments Refunds", [
      "Go to Tools > BRS Payments > Refunds.",
      "Search or filter for the refund record.",
      "Review the customer, amount, date, payment status, and linked transaction.",
    ]);
  }

  if ((lower.includes("brs payments") && lower.includes("setup")) || hasAny(lower, ["set up brs pay", "setup brs pay", "configure brs pay"])) {
    return answer("Configure BRS Payments Setup", [
      "Go to Tools > BRS Payments.",
      "Open Setup.",
      "Review the payment configuration available to the club.",
      "Only change setup values when the club has confirmed the required payment configuration.",
    ]);
  }

  if (lower.includes("booking payment request") || lower.includes("booking pay requests")) {
    return answer("View Booking Payment Requests", [
      "Go to Tools > BRS Payments.",
      "Open Booking Payment Requests.",
      "Search or filter for the booking payment request.",
      "Review the request status, customer, booking, and payment details.",
    ]);
  }

  if (lower.includes("general payment request") || hasAny(lower, ["send somebody a payment link", "send someone a payment link", "payment link"])) {
    return answer("Create a General Payment Request", [
      "Go to Tools > BRS Payments > General Payment Requests.",
      "Use Create Payment Request.",
      "Enter the request details and amount.",
      "Check the customer and payment request details before sending or creating it.",
      "Use the General Payment Requests view to review the request afterward.",
    ]);
  }

  if (lower.includes("report") || lower.includes("reports") || hasAny(lower, ["takings", "rounds were played", "download spreadsheet", "utilisation", "usage by time", "usage by day", "revenue from visitor", "revenue from green fee", "green fee revenue", "visitor revenue", "who booked"])) {
    if (hasAny(lower, ["cancel", "cancelled", "cancellation"])) {
      return answer("Run a Cancelled Bookings Report", [
        "Open Reports from the main navigation menu.",
        "Open the Type of Report dropdown.",
        "Choose Cancelled Bookings.",
        "Set Start Date and End Date for the period you want to check.",
        "Choose Course if the club has more than one course.",
        "Click Submit.",
        "Review the report columns: Tee Time, Reservation Name, Player, Cancelled By, Cancel Date, and Cancel Reason.",
        "Use Print Report or the export option if you need to share the result.",
      ]);
    }
    if (hasAny(lower, ["tee time usage", "tee time utilisation", "utilisation", "usage by time", "usage by day", "usage by reservation"])) {
      return answer("Run a Tee Time Usage Report", [
        "Open Reports from the main navigation menu.",
        "Open the Type of Report dropdown.",
        "Choose Tee Time Usage by Time and Day or Tee Time Usage by Reservation Type depending on what you need.",
        "Set Start Date and End Date for the period.",
        "Choose Course if the club has more than one course.",
        "Click Submit.",
        "Review the utilisation data showing how tee times were used across the selected period.",
        "Use Print Report or the export option if you need a file.",
      ]);
    }
    if (hasAny(lower, ["membership", "member report", "member reports", "membership report", "membership reports"])) {
      return detailedAnswer(
        "Find Membership Reports",
        "BRS has membership reports in two locations depending on what you need.",
        [
          "For billing and financial membership reports: Open Memberships from the main navigation menu, then open Reports in the Memberships navigation. Reports include Overdue Bills, Bills Overview, Bill History, Payments By Subscription Type, Wallet Balances, and Wallet Transactions.",
          "For member data reports: Open Memberships > Reports and look under Member Reports. Reports include Member Categories, Member Notes, Member Status, Membership Retention, and Members with/without Subscriptions.",
          "For booking-related member reports: Open Reports from the main navigation and choose Number of Bookings by User/Date or Booking Details Full.",
        ],
        [
          {
            title: "Quick access",
            items: [
              "Unpaid bills: Memberships > Reports > Overdue Bills.",
              "Member email export: Memberships > Members > Download CSV Members.",
              "Email addresses for Outlook: Reports > Type of Report > Member Email Addresses for Outlook.",
            ],
          },
        ]
      );
    }
    if (hasAny(lower, ["financial", "finance"])) {
      return answer("Run a Financial Report", [
        "For membership financial reports: Open Memberships > Reports. Use Bill History, Bills Overview, Overdue Bills, Payments By Subscription Type, or Year on Year Comparison.",
        "For booking revenue reports: Open Reports from the main navigation. Choose Revenue From Visitor Online Bookings or Booking Transactions by Date Booked/Playing from the Type of Report dropdown.",
        "For payment processor reports: Go to Tools > BRS Payments > Transactions or Tools > BRS Payments > VAT Reports.",
        "Set the date range and filters, then use the export/download option if you need a file.",
      ]);
    }
    if (hasAny(lower, ["who booked", "booked by", "number of bookings by user", "bookings by user", "bookings by staff"])) {
      return answer("See Who Booked Tee Times", [
        "Open Reports from the main navigation menu.",
        "Open the Type of Report dropdown.",
        "Choose Number of Bookings by User/Date.",
        "Set Start Date and End Date for the period.",
        "Choose Course if the club has more than one course.",
        "Click Submit.",
        "Review the report showing which users created bookings and how many.",
      ]);
    }
    if (hasAny(lower, ["no show", "no-show", "noshow"])) {
      return answer("Run a No Show Report", [
        "Open Reports.",
        "Choose the no-show or booking-attendance report.",
        "Set the date range, course, and any no-show filters required.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (lower.includes("visitor")) {
      return answer("Run a Visitor Report", [
        "Open Reports.",
        "Set Course, Start Date, and End Date.",
        "Open the Type of Report dropdown.",
        "Choose Revenue From Visitor Online Bookings when you need visitor online booking revenue.",
        "Choose Number of Visitors by Country when you need visitor totals by country.",
        "Choose Booking Details or Full Booking Details when you need a detailed visitor booking list.",
        "Click Submit.",
        "Use Print Report or the report output export control if you need to share the result.",
      ]);
    }
    if (lower.includes("society")) {
      return answer("Run a Society Report", [
        "Open Reports.",
        "Choose the society report.",
        "Set the date range and society/contact filters required.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (lower.includes("member guest") || lower.includes("member's guest") || lower.includes("members guest")) {
      return answer("Run a Member Guest Report", [
        "Open Reports.",
        "Choose the member guest report.",
        "Set the date range, course, and member/guest filters required.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (hasAny(lower, ["flex points", "flexi points", "course flex"])) {
      return answer("Run a Course Flex Points Report", [
        "Open Reports.",
        "Choose the course flex points report.",
        "Set the date range, course, and member filters required.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (lower.includes("wallet transaction") || lower.includes("wallet transactions")) {
      return answer("Run a Wallet Transaction Report", [
        "Open Reports.",
        "Choose the wallet transaction report.",
        "Set the date range and member or transaction filters required.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (lower.includes("booking") || lower.includes("bookings")) {
      return answer("Run a Booking Report", [
        "Open Reports.",
        "Choose the booking report or booking-related report you need.",
        "Set the date range and filters.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (lower.includes("contact")) {
      return answer("Run a Contact Report", [
        "Open Reports.",
        "Choose the contact report.",
        "Set any category or date filters required.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (lower.includes("revenue") || lower.includes("takings")) {
      return answer("Run a Revenue Report", [
        "Open Reports.",
        "Choose the revenue report.",
        "Set the date range, course, and any payment filters required.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (lower.includes("playing") || lower.includes("rounds were played") || lower.includes("rounds played")) {
      return answer("Run a Playing Statistics Report", [
        "Open Reports.",
        "Choose the playing statistics report.",
        "Set the date range, course, and player filters required.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (lower.includes("payment")) {
      return answer("Run a Payment Report", [
        "Open Reports.",
        "Choose the payment report.",
        "Set the date range and payment filters.",
        "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
      ]);
    }
    if (lower.includes("export") || lower.includes("download spreadsheet") || lower.includes("download")) {
      return answer("Export a Report", [
        "Open Reports.",
        "Run the report with the required date range and filters.",
        "Use the report export or download option.",
        "Open the exported file and check the date range before sharing it.",
      ]);
    }
    return answer("Run a Report in BRS", [
      "Open Reports from the main navigation menu.",
      "Open the Type of Report dropdown to see all available reports.",
      "Choose the report you need (e.g., Booking Details, Revenue From Visitor Online Bookings, Tee Time Usage, Cancelled Bookings, Number of Bookings by User/Date).",
      "Set Start Date, End Date, and Course as required.",
      "Click Submit to run the report.",
      "Use Print Report or the export/download option to save or share the result.",
    ], "Check: For membership billing reports, use Memberships > Reports instead. For payment processor reports, use Tools > BRS Payments.");
  }

  if (lower.includes("playing statistics") || lower.includes("rounds played by members")) {
    return answer("Run a Playing Statistics Report", [
      "Open Reports.",
      "Choose the playing statistics report.",
      "Set the date range, course, and player filters required.",
      "Run the report. Use Print Report or the export control to save the result as PDF or CSV.",
    ]);
  }

  if (hasAny(lower, ["member email addresses", "members email addresses", "member emails", "members emails"]) && hasAny(lower, ["outlook", "export", "report", "spreadsheet", "download", "get"])) {
    return answer("Export Member Email Addresses", [
      "Open Reports.",
      "Open the Type of Report dropdown.",
      "Choose Member Email Addresses for Outlook.",
      "Set the visible membership type or member filters needed for the list.",
      "Run the report, then use the export/download control on the report output if you need a file for Outlook.",
    ]);
  }

  const greenFeeIntent = objectIntent(lower, ["green fee rate", "green fee rates", "green fee", "green fees", "visitor price", "visitor prices", "visitor rate", "visitor rates"], BOOKING_TARGET_TERMS);
  if (greenFeeIntent === "apply") {
    return answer("Assign a Green Fee to a Reservation", [
      "Open the Timesheet for the booking date.",
      "Open the reservation or booking so you are in Booking Details.",
      "Use the green fee or rate option shown for that reservation.",
      "Select the correct green fee for the player or visitor type.",
      "Check the amount on the reservation before saving.",
    ], "If the green fee is not available to select, check the configured rate in Tools > Green Fee Rates.");
  }

  const ambiguousOnlineGreenFee = hasAny(lower, ["online", "club website", "website", "web booking", "online booking"]) &&
    hasAny(lower, ["setup", "set up", "configure", "add", "create", "change", "edit"]) &&
    !hasAny(lower, ["visitor", "visitors", "customer", "customers", "book themselves", "booking themselves", "tee time agent", "tee time agents", "tour operator", "tour operators", "twilight", "off peak", "off-peak", "peak", "time band", "timeband", "cheaper", "saving", "discount", "manual", "manually", "staff", "pro shop", "phone", "member guest"]);

  if (!lower.includes("copy") && !hasAny(lower, ["competition", "comp"]) && greenFeeIntent === "configure" && !ambiguousOnlineGreenFee) {
    return answer("Set Up Green Fee Rates", [
      "Go to Tools.",
      "Open Green Fee Rates.",
      "Use Select a Year and the month tabs to find the rates to edit.",
      "Use Filter Category if you need to filter by Competition, Complimentary, Corporate, Guest, Hotel, Member, Member Guest, Other, Resident, Society, Tour Operator, Visitor, or Voucher.",
      "Click Add Green Fees to add a new rate, or use the Actions column on an existing row.",
      "Check the visible columns Category, Sub Category, Holes, Start Date, End Date, Rates, Mem Types, Default, and Global before saving.",
    ]);
  }

  if (lower.includes("reservation type") || lower.includes("colour") || lower.includes("color") || lower.includes("colours") || lower.includes("reserved slots")) {
    return answer("Set Up Reservation Types and Colours", [
      "Go to Tools.",
      "Open Reservation Types.",
      "Check the existing Reservation Types table columns: Name, Code, Supported, Allow Online Bookings, Default, Colour, and Actions.",
      "For a new reservation type, enter Name and Code.",
      "Set Supported, Allow Online Bookings, Set As Default, and Colour.",
      "Click Add, then check the Timesheet display for that reservation type.",
    ]);
  }

  if (lower.includes("booking status") && !hasAny(lower, ["four-ball", "four ball", "4-ball", "4 ball", "4balls", "fourballs", "four-balls", "four balls", "groups of four", "group size", "max group size", "maximum group", "two-ball", "two ball", "three-ball", "three ball"])) {
    return answer("Configure Booking Statuses", [
      "Go to Tools.",
      "Open Booking Statuses.",
      "Check the existing Booking Statuses table columns: Name, Supported, and Actions.",
      "For a new booking status, enter Name.",
      "Set Supported.",
      "Click Add, then check the booking status appears correctly in Booking Details.",
    ]);
  }

  if (lower.includes("day ticket") && hasAny(lower, ["rate", "rates", "price", "prices", "round", "rounds"])) {
    return answer("Set Day Ticket Rates for Visitors", [
      "Go to Tools.",
      "Open Day Ticket Rates for Visitors.",
      "Set Course 1 and Course 2.",
      "Set Start Date and End Date.",
      "Enter Green Fee Rate for 1 Player, 2 Players, 3 Players, and 4 Players.",
      "Set Type, Days Advance Booking, and Days of Week.",
      "Click Add, then check the visitor online booking flow.",
    ], "Check: The demo page currently says this feature is not enabled and to contact the Support Team to enable it.");
  }

  if (lower.includes("payment method")) {
    return answer("Set Up Payment Methods", [
      "Go to Tools.",
      "Open Payment Methods.",
      "Check the existing Payment Methods table columns: Name, Supported, and Actions.",
      "For a new payment method, enter Payment Method Name.",
      "Set Supported.",
      "Click Add, then check the method appears correctly wherever payments are recorded.",
    ]);
  }

  const serviceIntent = objectIntent(lower, ["buggy", "buggies", "caddie", "caddy", "trolley", "club hire", "room hire", "service", "services", "extra", "extras", "hire item"], BOOKING_TARGET_TERMS);
  const buggyCapacityIntent = hasAny(lower, ["buggy", "buggies", "golf cart", "golf carts"]) &&
    hasAny(lower, ["availability", "available", "count", "number", "amount", "capacity", "how many", "stock", "visitors book", "visitor book", "book online", "online booking", "settings"]);
  if (serviceIntent === "configure" && !buggyCapacityIntent && hasAny(lower, ["buggy", "buggies", "caddie", "caddy", "trolley", "club hire", "room hire", "services", "service", "bookable", "hire"])) {
    return answer("Set Up Bookable Services", [
      "Go to Tools > Services.",
      "Use Select a Year to choose the year you are setting up.",
      "In Service Type, choose Buggy, Caddy, Course, Golf Clubs, Room, Trolley, Shoes, or Other.",
      "Enter Service Name.",
      "Enter Service Rate.",
      "Click Add.",
      "Open a booking afterward and check the service can be selected where services are used.",
    ]);
  }

  if (
    buggyCapacityIntent
  ) {
    return answer("Check Buggy Booking Availability", [
      "Go to Tools.",
      "Open System Configuration.",
      "Use the Buggy Booking settings in System Configuration.",
      "Check the number of buggies available, how long each buggy is needed before and after a round, whether visitors are allowed to book buggies online, and whether the club expects the buggy price to be added by staff after booking.",
      "Click Update on System Configuration, then check the Timesheet to confirm buggy availability is appearing as expected.",
    ]);
  }

  if (lower.includes("contact categories")) {
    return answer("Set Up Contact Categories", [
      "Go to Tools.",
      "Open Contact Categories.",
      "Create or edit the category used for contact records.",
      "Return to Contacts and check the category is available on the contact record.",
    ]);
  }

  if (lower.includes("copy") && hasAny(lower, ["services", "green fees", "catering", "prices", "buggies", "buggy"])) {
    return answer("Copy Services, Catering, or Green Fees to Another Year", [
      "Go to Tools.",
      "Open Copy Services, Catering or Green Fees.",
      "In Operation, choose Copy Services, Copy Catering, or Copy Green Fees.",
      "Choose From Year.",
      "Choose To Year.",
      "Click Copy.",
      "Open the destination year setup page afterward and check the copied Services, Catering / Refreshments, or Green Fee Rates.",
    ]);
  }

  if (lower.includes("catering") || lower.includes("refreshments")) {
    return answer("Set Up Catering and Refreshments", [
      "Go to Tools.",
      "Open Catering / Refreshments.",
      "Use Select a Year to choose the year you are setting up.",
      "Enter Name.",
      "Enter Rate.",
      "Click Add, then check the item in the booking or event flow where it is used.",
    ]);
  }

  if (lower.includes("no show reasons") || lower.includes("no show reason") || (lower.includes("no show") && hasAny(lower, ["reason", "reasons"]))) {
    return answer("Set Up No Show Reasons", [
      "Go to Tools.",
      "Open No Show Reasons.",
      "Check the existing No Show Reasons table columns: Name, Supported, and Actions.",
      "For a new no-show reason, enter Name.",
      "Set Supported.",
      "Click Add, then check the reason appears when marking or reviewing a no-show.",
    ]);
  }

  if (lower.includes("title for each day") || (hasAny(lower, ["change", "set", "edit"]) && lower.includes("title") && hasAny(lower, ["day", "timesheet", "tee sheet"]))) {
    return answer("Set the Title for Each Day on the Timesheet", [
      "Go to Tools.",
      "Open Title for Each Day.",
      "Choose the date or day title you need to update.",
      "Enter the timesheet title and save it.",
      "Return to the Timesheet and confirm the title appears on the correct day.",
    ]);
  }

  if (lower.includes("email template") || lower.includes("letter template") || lower.includes("confirmation email template") || (hasAny(lower, ["template", "templates"]) && hasAny(lower, ["email", "letter", "confirmation"]))) {
    return answer("Set Up Email and Letter Templates", [
      "Go to Tools.",
      "Open Email and Letter Templates.",
      "Use Category, Type, and Description to find the template, such as Golf > Email > Booking Confirmation.",
      "Edit the Text field.",
      "Use the visible TAG values only for values the template should fill automatically, such as R_FIRSTNAME, R_SURNAME, R_DATE, R_STARTTIME, R_RESERVATIONNAME, R_EMAIL, or R_TELEPHONE_WORK.",
      "Save the template and send/check a test only if you need to confirm the wording.",
    ]);
  }

  if (lower.includes("legal messages") || lower.includes("privacy policy") || lower.includes("marketing preference") || lower.includes("facility booking terms") || lower.includes("visitor terms") || lower.includes("member terms") || (hasAny(lower, ["terms", "legal", "privacy", "marketing preference"]) && hasAny(lower, ["text", "message", "wording"]))) {
    return answer("Set Up Legal Messages", [
      "Go to Tools.",
      "Open Legal Messages.",
      "Use the Legal Messages table with Legal Message, Version, and Actions.",
      "Open the required entry, such as Marketing Preferences, Privacy Policy, Member Terms and Conditions, Visitor Terms and Conditions, Tour Operator Terms and Conditions, or Facility Booking Terms and Conditions.",
      "Edit the legal message text for that entry.",
      "Save the change, then check the matching member, visitor, tour operator, or facility booking screen.",
    ]);
  }

  const asksForGroupSizeRestriction = hasAny(lower, ["four-ball", "four ball", "4-ball", "4 ball", "4balls", "fourballs", "four-balls", "four balls", "groups of four", "group size", "max group size", "maximum group", "two-ball", "two ball", "three-ball", "three ball"]) && hasAny(lower, ["stop", "restrict", "block", "limit", "after", "before", "certain time", "visitors", "members", "booking status", "course"]);
  const asksForClosedTimeRestriction = hasAny(lower, ["block off", "blocked off", "blocked-off", "blocked out", "maintenance", "course work", "closed time", "closure"]) && hasAny(lower, ["booking", "book", "people", "visitor", "member", "tee time", "time"]);
  if (lower.includes("course restriction") || asksForGroupSizeRestriction || (asksForClosedTimeRestriction && !isGolfEventIntent(lower)) || (hasAny(lower, ["stop", "restrict"]) && lower.includes("members") && lower.includes("course"))) {
    const courseRestrictionNote = lower.includes("booking status")
      ? "Use Course Restrictions when the rule limits who can book, when they can book, or the maximum group size. Booking Statuses are for tracking the booking lifecycle/status, not for stopping four-balls or limiting group size by time."
      : "Use Course Restrictions when the rule limits who can book, when they can book, or the maximum group size.";
    return answer("Configure Course Restrictions", [
      "Go to Tools.",
      "Open Course Restrictions.",
      "Use Show expired Course Restrictions if you need to review old restrictions.",
      "Set Start Date, End Date, Start Time, and End Time.",
      "Set Player Types to Members & Visitors, Members, or Visitors.",
      "Choose Max Group Size.",
      "Enter Message.",
      "Click Add, then check the affected booking flow.",
    ], courseRestrictionNote);
  }

  if (!hasAny(lower, ["competition", "comp"]) && lower.includes("visitor") && hasAny(lower, ["rates", "prices", "price"])) {
    return answer("Set Visitor Booking Rates", [
      "Go to Tools.",
      "Open Green Fee Rates for Visitors / Tour Operators / Tee Time Agents.",
      "Use Filter Rates with Channel, Enabled Rates Only or All Rates, Include Years, Include Months, and Include Days if you need to narrow the rate list.",
      "For a new rate, choose Course, Start Date, End Date, Start Time, and End Time.",
      "Set Green Fee Rate, Type, Holes, Saving %, and Golf / Package.",
      "For package rates, use Golf Package Name, Package Description, and Package Icons.",
      "Set Club Website, Tee Time Agents, Tour Operators, Days Advance Booking, and Days of Week.",
      "Click Add, then check the visitor online booking flow.",
    ]);
  }

  if (lower.includes("tour operator") && hasAny(lower, ["rate", "rates", "price", "prices", "pricing", "online booking"])) {
    return answer("Set Tour Operator Booking Rates", [
      "Go to Tools.",
      "Open Green Fee Rates for Visitors / Tour Operators / Tee Time Agents.",
      "Use Filter Rates with Channel, Enabled Rates Only or All Rates, Include Years, Include Months, and Include Days if you need to narrow the rate list.",
      "For a new tour operator rate, choose Course, Start Date, End Date, Start Time, and End Time.",
      "Set Green Fee Rate, Type, Holes, Saving %, and Golf / Package.",
      "Set Tour Operators and the required Days Advance Booking and Days of Week.",
      "Click Add, then check the tour operator online booking flow.",
    ]);
  }

  if (lower.includes("club systems") && hasAny(lower, ["map", "maps", "mapping"])) {
    return answer("Open Club Systems Member Maps", [
      "Go to Tools.",
      "Open Club Systems Member Maps.",
      "Review or update the mapping between Club Systems members and BRS member records.",
      "Check the mapped member records before saving any changes.",
    ]);
  }

  if (lower.includes("club systems") && hasAny(lower, ["preview", "sync", "before sync"])) {
    return answer("Open Club Systems Member Preview", [
      "Go to Tools.",
      "Open Club Systems Member Preview.",
      "Preview the Club Systems member data before synchronising or applying changes.",
      "Check any unmatched or unexpected members before continuing.",
    ]);
  }

  if (lower.includes("clubhouse pc") || lower.includes("club house pc")) {
    return answer("Set This PC as the Clubhouse PC", [
      "Go to Tools.",
      "Open Set this PC as the Club House PC.",
      "Confirm the setting only on the machine that should act as the clubhouse PC.",
      "Check the clubhouse-facing setup on that computer afterward.",
    ]);
  }

  if (lower.includes("club news")) {
    return answer("Update Club News", [
      "Go to Tools.",
      "Open Club News.",
      "Create or edit the news item.",
      "Save it and check the news item appears where club users will see it.",
    ]);
  }

  if (!lower.includes("club systems") && hasAny(lower, ["upload", "uploads", "import", "imports", "update file", "bulk update"]) && (lower.includes("member") || lower.includes("contact"))) {
    return answer("Upload Members or Contacts", [
      "Go to Tools.",
      "Open Upload Members and Contacts.",
      "On Import/Update Members or Contacts, choose the record type: Members or Contacts.",
      "Select the CSV import file.",
      "Tick Update Existing Members only if you are updating existing member records.",
      "Click Next and follow the import steps.",
      "For member uploads, check the file contains User ID plus Last Name or Full Name, and Member Type.",
      "For contact uploads, check the file contains Category plus Last Name, Full Name, or Company, and at least one contact method such as email or phone.",
    ]);
  }

  if ((lower.includes("competition") || lower.includes("comp")) && hasAny(lower, ["entry sheet", "draw", "draw sheet", "start sheet"])) {
    return answer("Open the Competition Entry Sheet or Draw", [
      "Open Competitions.",
      "Find and open the relevant competition.",
      "Use the competition entry sheet, draw, or start-sheet area for that competition.",
      "Check the competition date, entrants, and draw details before making changes.",
    ]);
  }

  if ((lower.includes("competition") || lower.includes("comp")) && hasAny(lower, ["cannot book", "can't book", "cant book", "people cannot book", "not book", "not visible"])) {
    return answer("Check Competition Online Booking", [
      "Open Competitions.",
      "Find and open the relevant competition.",
      "Check the competition date, entry settings, online booking availability, member or visitor availability, and any charges.",
      "Check the online competition entry flow before telling players to try again.",
    ]);
  }

  if ((lower.includes("competition") || lower.includes("comp")) && hasAny(lower, ["change entry", "cancel entry", "change or cancel", "remove entry", "amend entry"])) {
    return answer("Change or Cancel a Competition Entry", [
      "Open Competitions.",
      "Find and open the relevant competition.",
      "Open the competition entry sheet or entrant list for that competition.",
      "Find the player entry that needs to be changed or cancelled.",
      "Check the competition date, player, charge, and purse/payment impact before saving the change.",
    ]);
  }

  if ((lower.includes("competition") || lower.includes("comp")) && lower.includes("member") && hasAny(lower, ["online", "book", "booking", "setup", "set up", "entries"])) {
    return answer("Set Up a Members Competition for Online Booking", [
      "Open Competitions.",
      "Open Member Competitions.",
      "Create or edit the members competition.",
      "Set the competition date, entry settings, member availability, and charges on the labelled competition setup fields.",
      "Check the online member entry flow before publishing or taking entries.",
    ]);
  }

  if ((lower.includes("competition") || lower.includes("comp")) && lower.includes("visitor") && hasAny(lower, ["charges", "charge", "prices", "price", "fee"])) {
    return answer("Check Visitor Charges for an Open Competition", [
      "Open Competitions.",
      "Open the open competition setup.",
      "Review the visitor charge settings for the competition.",
      "Check the visitor entry flow or competition charge summary to confirm the amount.",
    ]);
  }

  if ((lower.includes("competition") || lower.includes("comp")) && hasAny(lower, ["charges", "charge", "entry fee", "fee"])) {
    return answer("Configure Competition Charges", [
      "Open Competitions.",
      "Open the competition setup or charging area.",
      "Set the competition charges for the relevant entry type or visitor/member category.",
      "Check the charge shown in the competition entry flow.",
    ]);
  }

  if ((lower.includes("competition") || lower.includes("comp")) && hasAny(lower, ["create", "add", "new", "setup", "set up", "make"])) {
    return answer("Create a Competition", [
      "Open Competitions from the main navigation menu.",
      "Choose whether this is a member competition or an open/visitor competition before creating it.",
      "For a member competition, open Member Competitions.",
      "For an open/visitor competition, open Open Competitions for Visitors.",
      "Enter the labelled competition setup fields shown for that competition type, such as competition date, competition name, booking format, playing format, competition type, number of holes, booking availability, and charges where those fields are shown.",
      "Check the competition entry sheet or online entry flow before publishing or taking entries.",
    ], "If you cannot see the member or open competition setup area, escalate this to BRS Support with the competition type the club is trying to create.");
  }

  if (lower.includes("open competition")) {
    return answer("Set Up an Open Competition", [
      "Open Competitions.",
      "Create or edit the open competition.",
      "Set the date, entry settings, charges, and visitor/member availability.",
      "Check the open competition entry flow before publishing or taking entries.",
    ]);
  }

  if (lower.includes("competition") && lower.includes("purse")) {
    return answer("Manage a Competition Purse", [
      "Open Competitions.",
      "Open the competition purse area.",
      "Find the competition or player purse record.",
      "Review the purse balance, charges, and transactions before making changes.",
    ]);
  }

  if (isGolfEventIntent(lower)) {
    return answer("Set Up a Golf Event Organiser Reservation", [
      "Open Golf Events from the main BRS menu.",
      "Create a new golf event or open the existing event for the corporate day.",
      "Set the Course for the event.",
      "Set the Event Date, Event Start Time, and Event End Time for the tee-time block the organiser needs.",
      "Set the Event Name or Reservation Name that should appear against the reserved times.",
      "Set the Event Username for the organiser access where that login is being used.",
      "Save the event, then check the Timesheet for that date to confirm the matching tee times are reserved for the Golf Event organiser.",
    ], "Use Golf Events for event-style tee-time blocks such as a corporate day. Use Competitions instead when the task is entrants, draws, competition charges, or open competition entry.");
  }

  if (lower.includes("golf plus")) {
    return answer("Find Golf Plus", [
      "Use the main BRS menu.",
      "Open Golf Plus if it is enabled for the club.",
      "If Golf Plus is not visible, check the club's enabled products or user privileges.",
    ]);
  }

  return null;
}
