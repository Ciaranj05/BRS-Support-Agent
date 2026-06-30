import { addKnownScreenLocation } from "./brsScreenLocations.js";

function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function hasAll(lower, terms) {
  return terms.every((term) => lower.includes(term));
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

function isTimesheetSetupQuestion(lower) {
  const mentionsTeeTimePattern = hasAny(lower, ["tee time", "tee times", "timesheet", "tee sheet", "teesheet", "tee shet", "shet"]);
  if (!mentionsTeeTimePattern) return false;
  if (hasAny(lower, ["single tee time booking", "tee time booking"])) return false;
  if (hasAny(lower, BOOKING_CREATION_TERMS) && !hasAny(lower, ["interval", "intervals", "configure", "set up", "setup", "start of", "end of", "first tee time", "last tee time"])) return false;

  const explicitConfigure = hasAny(lower, ["set tee times", "change time intervals", "time intervals", "configure timesheet", "configure the timesheet", "configure tee sheet", "configure the tee sheet", "configure tee shet", "configure the tee shet", "conifgure tee shet", "conifgure the tee shet", "setup tee sheet", "set up tee sheet"]);
  const dateRangeConfigure = hasAny(lower, ["next year", "next month", "intervals", "tee times"]) && hasAny(lower, ["configure", "conifgure", "set up", "setup", "change"]) && hasAny(lower, ["timesheet", "tee sheet", "teesheet", "tee shet", "shet"]);
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

  if (/\bdelete\b/.test(lower) && hasAny(lower, ["all bookings", "all tee times", "next month"])) {
    return "I can't provide bulk-delete instructions for bookings. For a large booking change, confirm the date range, course, affected reservations, payments, and customer notifications first, then contact BRS Support or use an approved operational process for the specific bookings that need to be changed.";
  }

  if (isSuperuserCreateRequest(message)) {
    return approvedSuperuserEscalationReply();
  }

  if (lower.includes("grace period")) {
    return answer("Change the Membership Grace Period", [
      "Go to Memberships.",
      "Open Settings.",
      "Open General.",
      "Find Grace Period and update the value required for your membership process.",
      "Save the change, then check the affected member workflow to confirm the new grace period is applying as expected.",
    ]);
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

  if (hasAny(lower, ["main club setup", "club setup page", "system configuration", "feature on or off", "turn a feature", "enable feature", "disable feature"])) {
    return answer("Open System Configuration", [
      "Go to Tools.",
      "Open System Configuration.",
      "Use the visible System Configuration sections and labels, such as Club Contact Details, Display Configuration, General Configuration, Features Supported, Marketing Consent, Buggy Booking, Members Booking Module - Casual Golf, Visitor Booking - General, or Online Merchant Module.",
      "Edit only the exact labelled setting that matches what you need to change.",
      "Save the System Configuration changes, then check the affected BRS page.",
    ]);
  }

  if (isMemberDataOutputIntent(lower)) {
    return detailedAnswer(
      "Create a Filtered Member Data Export",
      "This is a member data/export request, not an email-message request. Use the member list first when the club needs names and email addresses filtered by membership category, then use the report routes when a formal report is a better fit.",
      [
        "Open Memberships.",
        "Open Members inside Memberships.",
        "On the Members page, use Search, Filter Active Members, and Membership Type to narrow the list to the required member categories.",
        "Use Filter Columns on the Members page to keep the fields needed for the export, such as Title, First Name, Last Name, Email, Membership Type, and Membership Status.",
        "Click Download CSV Members on the Members page, then check the spreadsheet before using or sharing it.",
      ],
      [
        {
          title: "Alternative routes",
          items: [
            "For a formal membership report, open Memberships > Reports and choose Member Categories under Member Reports.",
            "For an Outlook-style email list, use the main navigation menu to open Reports, open the Type of Report dropdown, and choose Member Email Addresses for Outlook.",
            "If the same segment will be reused, check Memberships > Settings > Member Filters before running the member list or report again.",
          ],
        },
        {
          title: "Check",
          items: [
            "Use Email Messaging only when the club wants to send a message; it is not the route for producing a database or spreadsheet of email addresses.",
          ],
        },
      ]
    );
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

  if (asksAbout(lower, ["add", "attach", "set up", "setup"], ["services to a booking", "service to a booking", "services on a booking"]) || (hasAny(lower, ["add", "attach"]) && hasAny(lower, ["buggy", "hire", "service", "thing", "extra"]) && lower.includes("booking"))) {
    return answer("Add Services to a Booking", [
      "Open the booking from the Timesheet so you are in Booking Details.",
      "Use the booking's services or extras area to add the service, such as a buggy, caddie, trolley, club hire, room hire, or other configured service.",
      "Check the quantity, service type, and any charge before saving the booking.",
      "If the service is not available to select, go to Tools > Services to check that the service has been set up for the club.",
    ]);
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

  if ((lower.includes("booking") && mentionsPayment) || (mentionsTimesheet && mentionsPayment && hasAny(lower, ["slot", "cust", "customer", "their"]))) {
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

  if (asksAbout(lower, ["make", "add", "create", "book"], ["facility booking", "room booking", "resource reservation", "facility reservation"]) || (hasAny(lower, ["book", "reserve"]) && hasAny(lower, ["function room", "room", "facility", "resource"]))) {
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

  if (asksAbout(lower, ["add", "create"], ["visitor contact", "new contact", "society contact", "tour operator contact", "hotel contact"]) || (hasAny(lower, ["add", "create"]) && hasAny(lower, ["hotel", "visitor", "society", "tour operator"]) && lower.includes("contact"))) {
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

  if (lower.includes("contact") && hasAny(lower, ["category", "type"]) && hasAny(lower, ["make", "new", "create", "set up", "setup"])) {
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

  if (!dataOutputIntent && (lower.includes("email contacts") || (hasAny(lower, ["email", "mail", "send an email"]) && lower.includes("contact")))) {
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
      "Choose Message All Members.",
      "Enter the club message content.",
      "Check the audience and send the club message when it is ready.",
    ]);
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
      "Select the subscriptions, discounts, or Custom Bill Items needed for the bill. Use ADD ITEM only when the club needs an extra one-off line item.",
      "In Payment Schemes, select a scheme only if members should be offered scheduled or instalment payments; otherwise leave it unselected for a one-lump-sum bill.",
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
  if (paymentSchemeIntent === "apply") {
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

  if (hasAny(lower, ["add", "new", "needs login", "create", "make"]) && hasAny(lower, ["staff user", "new user", "admin user", "user account", "receptionist", "pro shop user", "login", "read only staff", "readonly staff", "staff account"])) {
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
      "Go to Users.",
      "Find and open the correct user account.",
      "Use Change Password from the Update User Details page if an admin is setting the password directly.",
      "Use Reset Password by email when an email address is available and the user should set their own password.",
      "Confirm the user can sign in after the reset route is complete.",
    ], "Check: Do not ask the person for their current password.");
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
      "Open the VAT report area.",
      "Choose the date range required for the report.",
      "Download or export the VAT report for reconciliation.",
    ]);
  }

  if (lower.includes("vat") && hasAny(lower, ["report", "reports", "export", "download"])) {
    return answer("Download a BRS Payments VAT Report", [
      "Go to Tools > BRS Payments.",
      "Open the VAT report area.",
      "Choose the date range required for the report.",
      "Download or export the VAT report for reconciliation.",
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

  if (lower.includes("report") || lower.includes("reports") || hasAny(lower, ["takings", "rounds were played", "download spreadsheet"])) {
    if (hasAny(lower, ["no show", "no-show", "noshow"])) {
      return answer("Run a No Show Report", [
        "Open Reports.",
        "Choose the no-show or booking-attendance report.",
        "Set the date range, course, and any no-show filters required.",
        "Run the report and export it if you need a file.",
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
        "Run the report and export it if needed.",
      ]);
    }
    if (lower.includes("member guest") || lower.includes("member's guest") || lower.includes("members guest")) {
      return answer("Run a Member Guest Report", [
        "Open Reports.",
        "Choose the member guest report.",
        "Set the date range, course, and member/guest filters required.",
        "Run the report and export it if needed.",
      ]);
    }
    if (hasAny(lower, ["flex points", "flexi points", "course flex"])) {
      return answer("Run a Course Flex Points Report", [
        "Open Reports.",
        "Choose the course flex points report.",
        "Set the date range, course, and member filters required.",
        "Run the report and export it if needed.",
      ]);
    }
    if (lower.includes("wallet transaction") || lower.includes("wallet transactions")) {
      return answer("Run a Wallet Transaction Report", [
        "Open Reports.",
        "Choose the wallet transaction report.",
        "Set the date range and member or transaction filters required.",
        "Run the report and export it if needed.",
      ]);
    }
    if (lower.includes("booking") || lower.includes("bookings")) {
      return answer("Run a Booking Report", [
        "Open Reports.",
        "Choose the booking report or booking-related report you need.",
        "Set the date range and filters.",
        "Run the report and export it if you need a file.",
      ]);
    }
    if (lower.includes("contact")) {
      return answer("Run a Contact Report", [
        "Open Reports.",
        "Choose the contact report.",
        "Set any category or date filters required.",
        "Run the report and export it if needed.",
      ]);
    }
    if (lower.includes("revenue") || lower.includes("takings")) {
      return answer("Run a Revenue Report", [
        "Open Reports.",
        "Choose the revenue report.",
        "Set the date range, course, and any payment filters required.",
        "Run the report and export it if you need a file.",
      ]);
    }
    if (lower.includes("playing") || lower.includes("rounds were played") || lower.includes("rounds played")) {
      return answer("Run a Playing Statistics Report", [
        "Open Reports.",
        "Choose the playing statistics report.",
        "Set the date range, course, and player filters required.",
        "Run the report and export it if needed.",
      ]);
    }
    if (lower.includes("payment")) {
      return answer("Run a Payment Report", [
        "Open Reports.",
        "Choose the payment report.",
        "Set the date range and payment filters.",
        "Run the report and export it if you need a file.",
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
  }

  if (lower.includes("playing statistics") || lower.includes("rounds played by members")) {
    return answer("Run a Playing Statistics Report", [
      "Open Reports.",
      "Choose the playing statistics report.",
      "Set the date range, course, and player filters required.",
      "Run the report and export it if needed.",
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

  if (!lower.includes("copy") && !hasAny(lower, ["competition", "comp"]) && greenFeeIntent === "configure") {
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

  if (lower.includes("booking status")) {
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
  if (serviceIntent === "configure" && hasAny(lower, ["buggy", "buggies", "caddie", "caddy", "trolley", "club hire", "room hire", "services", "service", "bookable", "hire"])) {
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
    hasAny(lower, ["buggy", "buggies", "golf cart", "golf carts"]) &&
    hasAny(lower, ["availability", "available", "count", "number", "visitors book", "visitor book", "book online", "online booking", "setup", "set up", "configure", "settings"])
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

  if (lower.includes("legal messages") || lower.includes("privacy policy") || lower.includes("marketing preference") || (hasAny(lower, ["terms", "legal", "privacy", "marketing preference"]) && hasAny(lower, ["text", "message", "wording"]))) {
    return answer("Set Up Legal Messages", [
      "Go to Tools.",
      "Open Legal Messages.",
      "Use the Legal Messages table with Legal Message, Version, and Actions.",
      "Open the required entry, such as Marketing Preferences, Privacy Policy, Member Terms and Conditions, Visitor Terms and Conditions, Tour Operator Terms and Conditions, or Facility Booking Terms and Conditions.",
      "Edit the legal message text for that entry.",
      "Save the change, then check the matching member, visitor, tour operator, or facility booking screen.",
    ]);
  }

  if (lower.includes("course restriction") || (hasAny(lower, ["stop", "restrict"]) && lower.includes("members") && lower.includes("course"))) {
    return answer("Configure Course Restrictions", [
      "Go to Tools.",
      "Open Course Restrictions.",
      "Use Show expired Course Restrictions if you need to review old restrictions.",
      "Set Start Date, End Date, Start Time, and End Time.",
      "Set Player Types to Members & Visitors, Members, or Visitors.",
      "Choose Max Group Size.",
      "Enter Message.",
      "Click Add, then check the affected booking flow.",
    ]);
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

  if (lower.includes("tour operator") && lower.includes("rates")) {
    return answer("Set Tour Operator Rates", [
      "Go to Tools.",
      "Open Tour Operator Rates.",
      "Choose the tour operator, date range, and course.",
      "Enter the rates and check they apply to the correct tour operator bookings.",
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

  if (hasAny(lower, ["upload", "uploads", "import", "imports", "update file", "bulk update"]) && (lower.includes("member") || lower.includes("contact"))) {
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

  if (lower.includes("golf event") || hasAll(lower, ["golf", "society", "day"]) || hasAll(lower, ["organiser", "booking"])) {
    return answer("Set Up a Golf Event Organiser Reservation", [
      "Open Golf Events.",
      "Create or open the golf event.",
      "Add the organiser reservation or event booking details.",
      "Set the event date, times, players or guests, and any linked charges.",
      "Check the event reservation appears correctly in the event or booking view.",
    ]);
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
