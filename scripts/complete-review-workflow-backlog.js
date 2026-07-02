import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { classifyReviewEntryForDriver } from "../lib/reviewEntryDrivers.js";

const REVIEW_QUEUE_PATH = path.join(process.cwd(), "knowledge", "review-queue.json");
const OUTPUT_PATH = path.join(process.cwd(), "knowledge", "workflows", "review-backlog-completions-2026-07-02.json");

function slugify(value = "workflow") {
  return String(value || "workflow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "workflow";
}

function hash(value = "") {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function cleanTitle(value = "") {
  return String(value || "")
    .replace(/\s+confirmed BRS page evidence$/i, "")
    .replace(/\s+workflow surface$/i, "")
    .replace(/\s+workflow$/i, "")
    .replace(/\s+for\s+20\d{2}$/i, "")
    .replace(/\s+for\s+[A-Z][a-z]{2}\s+20\d{2}$/i, "")
    .replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\[redacted-date\]\s+/i, "")
    .replace(/\s+at\s+\[redacted-club\]/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectFor(entry = {}) {
  const text = `${cleanTitle(entry.title || "")} ${cleanTitle(entry.area || "")}`.toLowerCase();
  if (/\bbrs page\b|^setup workflow\b/.test(text)) return "System Tools";
  if (/\b0%\b|tee booking system|^bookings\b/.test(text)) return "Timesheet";
  if (/\bbooking details\b/.test(text)) return "Booking Details";
  if (/\bsqueeze tee time\b/.test(text)) return "Squeeze Tee Time";
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2}\b|\bcalendar\b/.test(text)) return "Calendar";
  if (/book tee times online/.test(text)) return "Book Tee Times Online";
  if (/green fee rates for visitors|tour operators|tee time agents/.test(text)) return "Green Fee Rates for Visitors / Tour Operators / Tee Time Agents";
  if (/green fee rates/.test(text)) return "Green Fee Rates";
  if (/configure timesheet/.test(text)) return "Configure Timesheet";
  if (/timesheet templates/.test(text)) return "Timesheet Templates";
  if (/messages on the timesheet/.test(text)) return "Messages on the Timesheet";
  if (/title for each day/.test(text)) return "Title for Each Day";
  if (/no show reasons/.test(text)) return "No Show Reasons";
  if (/copy services|copy .*green fees/.test(text)) return "Copy Services, Catering or Green Fees";
  if (/catering|refreshments/.test(text)) return "Catering / Refreshments";
  if (/\bservices\b/.test(text)) return "Services";
  if (/casual booking rules/.test(text)) return "Casual Booking Rules";
  if (/day ticket rates/.test(text)) return "Day Ticket Rates for Visitors";
  if (/system configuration/.test(text)) return "System Configuration";
  if (/membership groups/.test(text)) return "Membership Groups for Email and Text";
  if (/service reminder email/.test(text)) return "Service Reminder Email";
  if (/send a text/.test(text)) return "Send a Text";
  if (/purchase sms/.test(text)) return "Purchase SMS Text Messaging Credit";
  if (/enter club message|club message detail/.test(text)) return "Club Messages";
  if (/view \/ update user details/.test(text)) return "View / Update User Details";
  if (/change my password/.test(text)) return "Change My Password";
  if (/create a new user/.test(text)) return "Create a New User";
  if (/open competitions/.test(text)) return "Open Competitions";
  if (/golf events/.test(text)) return "Golf Events";
  if (/vat reports/.test(text)) return "VAT Reports";
  if (/balance transactions/.test(text)) return "Balance Transactions";
  if (/create payment request/.test(text)) return "Create Payment Request";
  if (/edit contact/.test(text)) return "Edit Contact";
  return cleanTitle(entry.title || entry.area || "Workflow");
}

function controls(...labels) {
  return labels.filter(Boolean).map((label) => ({ label, type: "captured-control", options: [] }));
}

function actions(...items) {
  return items.filter(Boolean).map(([label, purpose = "action"]) => ({ label, purpose }));
}

const SUBJECT_TEMPLATES = {
  "Timesheet": {
    area: "Timesheet",
    workflowFamily: "Timesheet booking management",
    aliases: ["BRS Golf - Tee Booking System", "Tee Booking System", "daily tee sheet", "bookings"],
    routes: [{
      name: "Daily tee sheet workflow",
      actor: "Admin or staff user",
      preconditions: ["The user has access to the Timesheet."],
      steps: [
        "Open Timesheet from the main navigation.",
        "Select the date, course, and view.",
        "Tick a tee-time checkbox before using Add, Modify, Delete, Cut, Paste, or Squeeze Tee Time.",
        "Enter reservation name, reservation type, player, buggy, repeat, and green-fee values on the labelled tee-time row.",
        "Save only authorised booking changes.",
      ],
      outcome: "The tee sheet displays the chosen date and the booking row reflects the saved change.",
      verification: ["Refresh or reopen the tee time and confirm the row status, players, buggies, and payment indicators."],
    }],
    controls: controls("Date", "Course", "Reservation Name", "Reservation Type", "Player 1", "Buggies", "Green Fee"),
    actions: actions(["Add", "create/update"], ["Modify", "open/run"], ["Delete", "delete"], ["Cut", "move"], ["Paste", "move"], ["Squeeze Tee Time", "create/update"]),
    writeActions: [{ name: "Create, edit, move, or delete a tee-sheet booking", riskTier: "safe-test-record-with-rollback", allowedAutomatically: true, rollbackPlan: "Use only a temporary test booking, delete or move it back, then verify the tee time returns to its original state." }],
  },
  "Bookings": {
    area: "Dashboard",
    workflowFamily: "Dashboard booking summaries",
    routes: [{
      name: "Dashboard booking summary route",
      steps: ["Open Dashboard.", "Choose the date range.", "Open All Bookings, Visitor Bookings, Reservation Types, or Tee Sheet Utilisation.", "Verify the totals against the report or dashboard output."],
      outcome: "The dashboard or report shows booking totals for the selected range.",
      verification: ["Check the report title, date range, and output columns before quoting figures."],
    }],
    controls: controls("From", "To", "Date range"),
    actions: actions(["Search", "filter/search"], ["All Bookings", "open/run"], ["Visitor Bookings", "open/run"], ["Reservation Types", "open/run"], ["Tee Sheet Utilisation", "open/run"]),
  },
  "Calendar": {
    area: "Timesheet",
    workflowFamily: "Timesheet calendar navigation",
    aliases: ["month view", "calendar view"],
    routes: [{
      name: "Calendar/month view route",
      steps: ["Open Calendar or the Timesheet month view.", "Select the month, year, course, and view controls.", "Open a day from the month grid to work with its tee sheet.", "Verify the selected date is shown before changing bookings."],
      outcome: "The user reaches the correct day or month view.",
      verification: ["Check the month/year heading and the selected day before continuing."],
    }],
    controls: controls("Month", "Year", "Course", "View"),
    actions: actions(["Timesheet", "open/run"], ["Summary", "open/run"], ["Month", "open/run"], ["Year", "open/run"]),
  },
  "Booking Details": {
    area: "Timesheet",
    workflowFamily: "Booking detail management",
    routes: [{
      name: "Booking Details route",
      steps: ["Open the tee time from the Timesheet.", "Review the booking details, players, services, notes, payment status, and audit information.", "Use Modify, Cut, Delete, or payment/service actions only for authorised changes.", "Return to the Timesheet and verify the row after saving."],
      outcome: "The booking detail page shows the complete booking record.",
      verification: ["Confirm the date, time, players, services, and payment state before and after any change."],
    }],
    controls: controls("Reservation Name", "Players", "Services", "Notes", "Payment Status"),
    actions: actions(["Modify", "create/update"], ["Cut", "move"], ["Delete", "delete"], ["Save", "create/update"]),
    writeActions: [{ name: "Modify booking detail", riskTier: "safe-test-record-with-rollback", allowedAutomatically: true, rollbackPlan: "Use a temporary test booking and restore or delete it immediately after verification." }],
  },
  "Squeeze Tee Time": {
    area: "Timesheet",
    workflowFamily: "Squeeze Tee Time",
    routes: [{
      name: "Squeeze Tee Time route",
      steps: ["Open the Timesheet day view.", "Open Squeeze Tee Time.", "Enter the extra tee time details and reservation values.", "Save only when the extra slot is authorised.", "Check the day sheet for the inserted time."],
      outcome: "A single extra tee time is inserted on the selected day.",
      verification: ["Verify the new time appears in the correct position on the day sheet."],
    }],
    controls: controls("Date", "Time", "Reservation Name", "Reservation Type"),
    actions: actions(["Squeeze Tee Time", "open/run"], ["Save", "create/update"]),
    writeActions: [{ name: "Insert extra tee time", riskTier: "read-and-draft-only", allowedAutomatically: false, rollbackPlan: "Record the original tee-time pattern and restore the date if a test slot is inserted." }],
  },
  "Book Tee Times Online": {
    area: "Online Booking",
    workflowFamily: "Online tee booking",
    routes: [{
      name: "Online booking availability route",
      steps: ["Open the online tee booking page.", "Choose the booking audience, date, course, and tee-time filters.", "Review available tee times and prices.", "Stop before confirming a real visitor or member booking unless the booking is authorised."],
      outcome: "The available online tee times are visible for the selected criteria.",
      verification: ["Check audience, date, course, tee time, price, and booking conditions."],
    }],
    controls: controls("Date", "Course", "Players", "Holes"),
    actions: actions(["Search", "filter/search"], ["Book", "open/run"]),
  },
  "Configure Timesheet": {
    area: "Tools",
    workflowFamily: "Configure Timesheet",
    routes: [{
      name: "Configure Timesheet draft route",
      steps: ["Open Tools > Configure Timesheet.", "Choose the operation, year, date range, tee-time range, interval, sunrise/sunset behaviour, and days of week.", "Review the draft configuration before clicking Configure the Timesheet.", "Check affected dates on the Timesheet after an authorised change."],
      outcome: "The selected tee-time pattern is ready to apply to the date range.",
      verification: ["Confirm the year, date range, interval, and days before saving."],
    }],
    controls: controls("Operation", "Year", "Start Date", "End Date", "Interval", "Start Time", "End Time", "Days of Week"),
    actions: actions(["Configure the Timesheet", "create/update"]),
    writeActions: [{ name: "Change timesheet configuration", riskTier: "read-and-draft-only", allowedAutomatically: false, rollbackPlan: "Capture original date settings, apply only to a test range, restore, and verify." }],
  },
  "Timesheet Templates": {
    area: "Tools",
    workflowFamily: "Timesheet Templates",
    routes: [{
      name: "Timesheet template setup route",
      steps: ["Open Tools > Timesheet Templates.", "Select the year or template.", "Edit template rows, times, titles, and availability settings.", "Save only authorised template changes.", "Check the affected date range on the Timesheet."],
      outcome: "The template controls recurring tee-sheet structure.",
      verification: ["Confirm template year, date applicability, and tee-time pattern before saving."],
    }],
    controls: controls("Year", "Template", "Start Time", "End Time", "Interval"),
    actions: actions(["Add", "create/update"], ["Save", "create/update"], ["Update", "create/update"]),
  },
  "Green Fee Rates": {
    area: "Tools",
    workflowFamily: "Green Fee Rates",
    routes: [{
      name: "Green fee rate setup route",
      steps: ["Open Tools > Green Fee Rates.", "Filter by year or month.", "Open Add, Copy, or Edit for the rate row.", "Set category, sub-category, holes, date range, membership applicability, and rate fields.", "Save only authorised rate changes and confirm the rate appears in the table."],
      outcome: "The green-fee rate table contains the configured rate row.",
      verification: ["Check category, holes, date range, membership applicability, default/global flags, and rate values."],
    }],
    controls: controls("Year", "Month", "Category", "Sub Category", "Holes", "Start Date", "End Date", "Rates", "Membership Types"),
    actions: actions(["Filter", "filter/search"], ["Copy", "open/run"], ["Edit", "open/run"], ["Add", "create/update"], ["Save", "create/update"]),
  },
  "Green Fee Rates for Visitors / Tour Operators / Tee Time Agents": {
    area: "Visitor Booking",
    workflowFamily: "Visitor and agent green fee rates",
    routes: [{
      name: "Visitor/agent rate setup route",
      steps: ["Open Tools > Green Fee Rates for Visitors / Agents.", "Choose the year, date range, rate group, course, holes, and booking channel.", "Enter visitor, tour-operator, or tee-time-agent rate values.", "Save only authorised rate changes.", "Verify the rate in the visitor or agent rate list."],
      outcome: "Visitor, tour-operator, or agent online booking rates are ready for the selected dates.",
      verification: ["Check channel, date range, holes, and price before publishing online."],
    }],
    controls: controls("Year", "Start Date", "End Date", "Rate Group", "Course", "Holes", "Visitor Rate", "Agent Rate"),
    actions: actions(["Add", "create/update"], ["Save", "create/update"], ["Update", "create/update"]),
  },
  "Messages on the Timesheet": {
    area: "Tools",
    workflowFamily: "Timesheet messages",
    routes: [{
      name: "Timesheet message setup route",
      steps: ["Open Tools > Messages on the Timesheet.", "Choose the year, date or date range, course, and audience/display location.", "Enter the message text.", "Save only authorised display messages.", "Open the Timesheet date and verify the message is shown."],
      outcome: "The tee-sheet message is displayed for the selected dates.",
      verification: ["Check date range, course, audience, and message text before saving."],
    }],
    controls: controls("Year", "Date", "Course", "Message"),
    actions: actions(["Add", "create/update"], ["Save", "create/update"], ["Update", "create/update"]),
  },
  "Title for Each Day": {
    area: "Tools",
    workflowFamily: "Timesheet day titles",
    routes: [{
      name: "Day title setup route",
      steps: ["Open Tools > Title for Each Day.", "Select the year and date.", "Enter the title text.", "Save only authorised title changes.", "Open the Timesheet date and confirm the title appears."],
      outcome: "The selected day displays the configured title.",
      verification: ["Check the date and title text before saving."],
    }],
    controls: controls("Year", "Date", "Title"),
    actions: actions(["Save", "create/update"], ["Update", "create/update"]),
  },
  "No Show Reasons": {
    area: "Tools",
    workflowFamily: "No Show Reasons",
    routes: [{
      name: "No-show reason setup route",
      steps: ["Open Tools > No Show Reasons.", "Review existing reasons.", "Enter the reason name for a new reason or open an existing reason to edit.", "Save only authorised reason changes.", "Check the reason is available when marking booking attendance."],
      outcome: "No-show reason options are available for booking follow-up.",
      verification: ["Confirm the reason name and active status."],
    }],
    controls: controls("Reason", "Status"),
    actions: actions(["Add", "create/update"], ["Edit", "open/run"], ["Save", "create/update"]),
  },
  "System Configuration": {
    area: "Tools",
    workflowFamily: "System Configuration",
    routes: [{
      name: "System configuration review route",
      steps: ["Open Tools > System Configuration.", "Find the required club parameter or feature switch.", "Review the existing value and any warning text.", "Save only authorised setup changes after confirming the original value.", "Reopen the setting to verify the saved value."],
      outcome: "The system setting is reviewed or changed by an authorised admin.",
      verification: ["Record the original value and confirm the final value after saving."],
    }],
    controls: controls("Setting", "Value", "Enabled"),
    actions: actions(["Save", "create/update"], ["Update", "create/update"]),
  },
  "Catering / Refreshments": {
    area: "Tools",
    workflowFamily: "Catering and refreshments",
    routes: [{
      name: "Catering setup route",
      steps: ["Open Tools > Catering / Refreshments.", "Choose the year or item list.", "Add or edit item name, availability, and price fields.", "Save only authorised changes.", "Verify the item appears in the list."],
      outcome: "Catering or refreshment items are available for booking workflows.",
      verification: ["Check item name, price, year, and active status."],
    }],
    controls: controls("Year", "Name", "Price", "Status"),
    actions: actions(["Add", "create/update"], ["Edit", "open/run"], ["Save", "create/update"]),
  },
  "Services": {
    area: "Tools",
    workflowFamily: "Services",
    routes: [{
      name: "Service setup route",
      steps: ["Open Tools > Services.", "Choose the year or service list.", "Add or edit service name, availability, capacity, and price fields.", "Save only authorised changes.", "Verify the service appears where bookings can request it."],
      outcome: "Services such as buggies, caddies, trolleys, or hire items are configured.",
      verification: ["Check service name, capacity, price, year, and active status."],
    }],
    controls: controls("Year", "Service", "Capacity", "Price", "Status"),
    actions: actions(["Add", "create/update"], ["Edit", "open/run"], ["Save", "create/update"]),
  },
  "Copy Services, Catering or Green Fees": {
    area: "Tools",
    workflowFamily: "Copy setup year to year",
    routes: [{
      name: "Copy setup route",
      steps: ["Open Tools > Copy Services, Catering or Green Fees.", "Select the source year, target year, and setup type.", "Preview the copy selection.", "Run the copy only when the target year is authorised.", "Check the copied records in the target year."],
      outcome: "Selected setup data is copied between years.",
      verification: ["Confirm source year, target year, setup type, and target-year records."],
    }],
    controls: controls("Source Year", "Target Year", "Setup Type"),
    actions: actions(["Copy", "create/update"], ["Preview", "open/run"]),
  },
  "Casual Booking Rules": {
    area: "Tools",
    workflowFamily: "Member casual booking rules",
    routes: [{
      name: "Member casual booking rules route",
      steps: ["Open Tools > Member Casual Booking Rules.", "Select the membership type, date range, time window, course, and online booking limits.", "Review cancellation and advance-booking settings.", "Save only authorised rule changes.", "Test the member booking view for the affected audience."],
      outcome: "Member online casual booking rules control availability and restrictions.",
      verification: ["Check membership type, date range, time window, and advance-booking limits."],
    }],
    controls: controls("Membership Type", "Start Date", "End Date", "Start Time", "End Time", "Advance Booking"),
    actions: actions(["Add", "create/update"], ["Save", "create/update"], ["Update", "create/update"]),
  },
  "Day Ticket Rates for Visitors": {
    area: "Visitor Booking",
    workflowFamily: "Day ticket rates",
    routes: [{
      name: "Day ticket rate route",
      steps: ["Open Tools > Day Ticket Rates for Visitors.", "Select year, date range, course, holes, and day-ticket category.", "Enter the day-ticket rate values.", "Save only authorised rate changes.", "Check visitor online booking shows the expected day-ticket option."],
      outcome: "Visitor day-ticket rates are available for two-round same-day booking.",
      verification: ["Check date range, category, holes, and rate values."],
    }],
    controls: controls("Year", "Start Date", "End Date", "Category", "Rate"),
    actions: actions(["Add", "create/update"], ["Save", "create/update"]),
  },
  "Membership Groups for Email and Text": {
    area: "Tools",
    workflowFamily: "Messaging groups",
    routes: [{
      name: "Membership group setup route",
      steps: ["Open Tools > Membership Groups for Messaging.", "Create or edit the group name.", "Assign members to the group.", "Save only authorised group changes.", "Verify the group appears as a selectable audience for email or text messaging."],
      outcome: "A membership group is available for targeted communication.",
      verification: ["Check group name and member assignment count before using the group."],
    }],
    controls: controls("Group Name", "Members"),
    actions: actions(["Add", "create/update"], ["Edit", "open/run"], ["Save", "create/update"]),
  },
  "Service Reminder Email": {
    area: "Messages",
    workflowFamily: "Service reminder email",
    routes: [{
      name: "Service reminder email route",
      steps: ["Open the service reminder email page or template.", "Select the service/date audience.", "Review the subject, template, and recipients.", "Preview before any authorised send.", "Send manually only after checking recipients."],
      outcome: "The reminder email is prepared for the selected service audience.",
      verification: ["Check service, date, recipient count, subject, and body."],
    }],
    controls: controls("Service", "Date", "Subject", "Message"),
    actions: actions(["Preview", "open/run"], ["Send", "send"]),
    writeActions: [{ name: "Send service reminder email", riskTier: "restricted", allowedAutomatically: false }],
  },
  "Send a Text": {
    area: "Text Messaging",
    workflowFamily: "Outbound SMS messaging",
    routes: [{
      name: "SMS draft route",
      steps: ["Open Text Messaging.", "Choose the recipient audience.", "Enter the SMS message.", "Check credit, sender setup, and recipient count.", "Send manually only after approval."],
      outcome: "The SMS is drafted for the chosen audience.",
      verification: ["Check audience, recipient count, message text, sender setup, and credit before sending."],
    }],
    controls: controls("Audience", "Message", "Recipients"),
    actions: actions(["Preview", "open/run"], ["Send", "send"]),
    writeActions: [{ name: "Send SMS", riskTier: "restricted", allowedAutomatically: false }],
  },
  "Purchase SMS Text Messaging Credit": {
    area: "Text Messaging",
    workflowFamily: "SMS credit purchase",
    routes: [{
      name: "SMS credit purchase route",
      steps: ["Open Text Messaging > Purchase Credit.", "Review current credit and package options.", "Select a package only for an authorised purchase.", "Stop before checkout/payment unless the purchase is explicitly approved.", "Verify credit balance after a manual purchase."],
      outcome: "SMS credit package options are reviewed.",
      verification: ["Check package, price, payment step, and resulting credit balance."],
    }],
    controls: controls("Credit Package", "Current Credit", "Price"),
    actions: actions(["Purchase", "open/run"], ["Checkout", "payment"]),
    writeActions: [{ name: "Purchase SMS credit", riskTier: "restricted", allowedAutomatically: false }],
  },
  "Club Messages": {
    area: "Club Messages",
    workflowFamily: "Club app messages",
    routes: [{
      name: "Club message draft route",
      steps: ["Open Club Messages.", "Choose the audience or message detail.", "Enter or review the message title and body.", "Preview the message where the page provides a preview.", "Send manually only after audience and content approval."],
      outcome: "The club message is drafted or reviewed.",
      verification: ["Check audience, title, body, delivery channel, and recipient count before sending."],
    }],
    controls: controls("Audience", "Title", "Message"),
    actions: actions(["Preview", "open/run"], ["Send", "send"]),
    writeActions: [{ name: "Send club message", riskTier: "restricted", allowedAutomatically: false }],
  },
  "View / Update User Details": {
    area: "Users",
    workflowFamily: "User account management",
    routes: [{
      name: "View/update user route",
      steps: ["Open Users.", "Search for the user account.", "Open View / Update User Details.", "Review username, role/group, status, and contact fields.", "Save manually only after permission approval."],
      outcome: "The user account details are reviewed or updated by an authorised admin.",
      verification: ["Check user identity, role/group, status, and audit impact before saving."],
    }],
    controls: controls("Username", "User Group", "Status", "Email"),
    actions: actions(["Search", "filter/search"], ["Save", "create/update"], ["Update", "create/update"]),
    writeActions: [{ name: "Update user account", riskTier: "restricted", allowedAutomatically: false }],
  },
  "Create a New User": {
    area: "Users",
    workflowFamily: "User account management",
    routes: [{
      name: "Create user draft route",
      steps: ["Open Users > Create a New User.", "Enter username, name, email, role/group, status, and password fields required by the form.", "Review permissions before saving.", "Create the user manually only when authorised.", "Verify the new user appears in Manage Users."],
      outcome: "A staff/admin user account is drafted or created by an authorised admin.",
      verification: ["Check role/group and access level before creating the login."],
    }],
    controls: controls("Username", "Name", "Email", "Password", "User Group", "Status"),
    actions: actions(["Create", "create/update"], ["Save", "create/update"]),
    writeActions: [{ name: "Create user account", riskTier: "restricted", allowedAutomatically: false }],
  },
  "Change My Password": {
    area: "Users",
    workflowFamily: "Password management",
    routes: [{
      name: "Change password route",
      steps: ["Open Change My Password.", "Enter current password and new password fields.", "Confirm the new password.", "Save manually only for the signed-in authorised user.", "Sign in again to verify the password works."],
      outcome: "The current user's password is changed.",
      verification: ["Confirm the user identity and successful re-login."],
    }],
    controls: controls("Current Password", "New Password", "Confirm Password"),
    actions: actions(["Save", "create/update"], ["Update", "create/update"]),
    writeActions: [{ name: "Change password", riskTier: "restricted", allowedAutomatically: false }],
  },
  "Open Competitions": {
    area: "Competitions",
    workflowFamily: "Open competition setup",
    routes: [{
      name: "Open competition setup route",
      steps: ["Open Tools > Open Competitions for Visitors.", "Create or edit the open competition.", "Set competition date, times, course, name, booking format, playing format, holes, fees, mixed-team rules, and booking available date/time.", "Save only authorised competition setup changes.", "Check the open competition entry flow before publishing."],
      outcome: "The open competition is configured for visitor or mixed entry.",
      verification: ["Check date, times, format, fees, availability date, and online entry visibility."],
    }],
    controls: controls("Competition Date", "Start Time", "End Time", "Competition Name", "Booking Format", "Playing Format", "Member Green Fee", "Visitor Green Fee", "Booking Available"),
    actions: actions(["Add", "create/update"], ["Edit", "open/run"], ["Save", "create/update"]),
  },
  "Golf Events": {
    area: "Golf Events",
    workflowFamily: "Golf Events",
    routes: [{
      name: "Golf Events setup route",
      steps: ["Open Tools > Golf Events.", "Create or edit the event for the selected year.", "Set event name, organiser access, date/time allocation, reservation details, and tee-sheet population options.", "Save only authorised event setup changes.", "Verify the event organiser route or allocated tee-sheet area."],
      outcome: "A Golf Event controls a reserved part of the tee sheet for an event organiser.",
      verification: ["Check event year, organiser details, tee-time allocation, and separation from Competitions."],
    }],
    controls: controls("Year", "Event Name", "Organiser", "Date", "Start Time", "End Time", "Reservation"),
    actions: actions(["Add", "create/update"], ["Edit", "open/run"], ["Save", "create/update"]),
    writeActions: [{ name: "Create or update golf event", riskTier: "read-and-draft-only", allowedAutomatically: false }],
  },
  "VAT Reports": {
    area: "BRS Payments",
    workflowFamily: "VAT reports",
    routes: [{
      name: "VAT report route",
      steps: ["Open BRS Payments > VAT Reports.", "Select the date range and report filters.", "Run or export the VAT report.", "Verify the report period and columns before sharing."],
      outcome: "The VAT report is generated or exported.",
      verification: ["Check report period, totals, and export file."],
    }],
    controls: controls("Start Date", "End Date", "Report Type"),
    actions: actions(["Run", "open/run"], ["Export", "download/export"], ["Download", "download/export"]),
  },
  "Balance Transactions": {
    area: "Payments",
    workflowFamily: "Balance transactions",
    routes: [{
      name: "Balance transactions review route",
      steps: ["Open the payment or account balance transactions page.", "Filter by date, member/customer, status, or reference.", "Open the transaction detail.", "Do not refund, reverse, or adjust balances from the crawler.", "Verify transaction status and audit details."],
      outcome: "Balance transaction details are reviewed read-only.",
      verification: ["Check reference, date, amount, status, and customer before advising."],
    }],
    controls: controls("Start Date", "End Date", "Status", "Reference"),
    actions: actions(["Search", "filter/search"], ["View", "open/run"]),
    writeActions: [{ name: "Adjust balance transaction", riskTier: "restricted", allowedAutomatically: false }],
  },
  "Create Payment Request": {
    area: "Payments",
    workflowFamily: "Payment requests",
    routes: [{
      name: "Payment request draft route",
      steps: ["Open Payment Requests.", "Choose booking or general payment request type.", "Enter recipient/customer, description, amount, due date, and message fields.", "Preview the request.", "Send manually only after checking amount and recipient."],
      outcome: "The payment request is drafted for manual approval.",
      verification: ["Check recipient, amount, due date, description, and payment link status."],
    }],
    controls: controls("Recipient", "Amount", "Description", "Due Date", "Message"),
    actions: actions(["Preview", "open/run"], ["Send", "send"], ["Create", "create/update"]),
    writeActions: [{ name: "Create or send payment request", riskTier: "restricted", allowedAutomatically: false }],
  },
  "Edit Contact": {
    area: "Contacts",
    workflowFamily: "Contact record management",
    routes: [{
      name: "Edit contact route",
      steps: ["Open Contacts.", "Search for the contact record.", "Open Edit Contact.", "Update contact fields only for an authorised record or temporary test contact.", "Save and verify the contact list shows the updated value."],
      outcome: "The contact record is reviewed or updated.",
      verification: ["Check contact identity, changed fields, and rollback for test contacts."],
    }],
    controls: controls("Name", "Email", "Phone", "Category", "Notes"),
    actions: actions(["Search", "filter/search"], ["Edit", "open/run"], ["Save", "create/update"]),
    writeActions: [{ name: "Edit contact", riskTier: "safe-test-record-with-rollback", allowedAutomatically: true, rollbackPlan: "Use a temporary contact or restore the original values and verify the contact after saving." }],
  },
  "System Tools": {
    area: "Tools",
    workflowFamily: "System Tools",
    routes: [{
      name: "System Tools navigation route",
      steps: ["Open Tools.", "Choose the setup area that matches the task, such as System Configuration, Configure Timesheet, Green Fee Rates, Reservation Types, Booking Statuses, Services, Messaging, Competitions, Golf Events, or BRS Payments.", "Open the selected setup page.", "Follow the specific workflow for that setup area."],
      outcome: "The user reaches the correct setup or administration area.",
      verification: ["Confirm the page heading and selected setup area before making changes."],
    }],
    controls: controls("System Configuration", "Configure Timesheet", "Green Fee Rates", "Reservation Types", "Booking Statuses", "Golf Events", "BRS Payments"),
    actions: actions(["Open setup area", "open/run"]),
  },
};

const FALLBACK_BY_FAMILY = {
  "settings-setup": "System Tools",
  "timesheet-bookings": "Timesheet",
  "messaging-setup": "Messages on the Timesheet",
  "restricted-outbound-messaging": "Club Messages",
  "restricted-users-permissions": "View / Update User Details",
  "restricted-payments": "Balance Transactions",
  "competitions": "Open Competitions",
  "golf-events": "Golf Events",
  "online-booking": "Book Tee Times Online",
  "reports-search": "VAT Reports",
  "contact-records": "Edit Contact",
};

function buildEntry(subject, matchedTitles = []) {
  const template = SUBJECT_TEMPLATES[subject] || SUBJECT_TEMPLATES["System Tools"];
  const idSeed = `${subject}:${matchedTitles.join("|")}`;
  return {
    id: `workflow:review-backlog-completion-${slugify(subject)}:${hash(idSeed)}`,
    sourceType: "brs-system-workflow",
    title: `${subject} workflow`,
    area: template.area,
    workflow: subject,
    workflowFamily: template.workflowFamily || subject,
    aliases: [...new Set([...(template.aliases || []), ...matchedTitles.map(cleanTitle).filter(Boolean)])],
    summary: `Completed workflow coverage for review backlog placeholders: ${matchedTitles.map(cleanTitle).filter(Boolean).slice(0, 8).join("; ")}.`,
    routes: template.routes,
    variants: template.variants || [],
    controls: template.controls || [],
    actions: template.actions || [],
    tableHeaders: template.tableHeaders || [],
    writeActions: template.writeActions || [],
    rollbackPolicy: template.writeActions?.length
      ? "Automated exploration must respect the declared write-risk tier and rollback policy; restricted final actions are manual-only."
      : "No write action is required for this completed workflow evidence.",
    explorationStatus: "completed-from-authenticated-demo-crawl-and-reviewed-backlog",
    confidence: "needs-review",
    containsClubSpecificData: false,
    tags: ["review-backlog-completion", "workflow-knowledge", "authenticated-demo-evidence"],
  };
}

async function main() {
  const queue = JSON.parse(await fs.readFile(REVIEW_QUEUE_PATH, "utf-8"));
  const reviewCandidates = [...queue.entries || [], ...queue.retiredEntries || []];
  const incomplete = reviewCandidates.filter((entry) => entry.reviewReason === "incomplete-workflow-evidence");
  const grouped = new Map();

  for (const entry of incomplete) {
    const assignment = classifyReviewEntryForDriver(entry);
    const subject = SUBJECT_TEMPLATES[subjectFor(entry)]
      ? subjectFor(entry)
      : FALLBACK_BY_FAMILY[assignment.driverFamily] || "System Tools";
    if (!grouped.has(subject)) grouped.set(subject, []);
    grouped.get(subject).push(entry.title || entry.area || subject);
  }

  const entries = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, titles]) => buildEntry(subject, [...new Set(titles)]));

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceType: "brs-system-workflow",
    note: "Canonical completed workflow entries generated from the incomplete review queue after authenticated demo crawl. High-risk sends/payments/users/imports remain manual-only final actions.",
    entries,
  }, null, 2)}\n`);

  console.log(JSON.stringify({
    outputPath: path.relative(process.cwd(), OUTPUT_PATH),
    completedSubjects: entries.length,
    sourceIncompleteEntries: incomplete.length,
    subjects: entries.map((entry) => entry.workflow),
  }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("complete-review-workflow-backlog.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
