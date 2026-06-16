function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function asksAbout(lower, actions, objects) {
  return hasAny(lower, actions) && hasAny(lower, objects);
}

function answer(title, steps, extra = "") {
  return [
    title,
    "",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    extra ? `\n${extra}` : "",
  ].join("\n").trim();
}

export function approvedStaticWorkflowReply(message = "") {
  const lower = normalise(message);

  if (hasAny(lower, ["online versus offline", "online vs offline", "online and offline", "offline booking counts"])) {
    return answer("Check Online and Offline Booking Counts", [
      "Open the Dashboard.",
      "Use the dashboard booking panels for the date you are checking.",
      "Review the Online and Offline booking count sections shown on the dashboard.",
      "If the club has more than one course, select the course or combined view before comparing the counts.",
    ], "Check: Dashboard figures are live club data, so do not treat the numbers themselves as reusable product knowledge.");
  }

  if (lower.includes("dashboard") && lower.includes("today") && lower.includes("bookings")) {
    return answer("View Today's Bookings on the Dashboard", [
      "Open the Dashboard.",
      "Use the dashboard date controls to show today.",
      "Review the bookings panel or booking figures shown for the selected day.",
      "If the club has more than one course, choose the course or combined view before comparing figures.",
    ]);
  }

  if (lower.includes("dashboard") && lower.includes("tomorrow")) {
    return answer("Switch the Dashboard to Tomorrow", [
      "Open the Dashboard.",
      "Use the dashboard date control to move from today to tomorrow.",
      "Check the dashboard panels after the date changes.",
      "Switch back to today when you are finished checking tomorrow's figures.",
    ]);
  }

  if (lower.includes("dashboard") && lower.includes("course")) {
    return answer("View Dashboard Figures by Course", [
      "Open the Dashboard.",
      "Use the course selector or course filter on the dashboard.",
      "Choose the course you want to review.",
      "Use the combined or all-course view if the club needs totals across courses.",
    ]);
  }

  if (asksAbout(lower, ["view", "open", "switch", "show"], ["timesheet by month", "month view"]) || (lower.includes("timesheet") && lower.includes("month"))) {
    return answer("View the Timesheet by Month", [
      "Open the Timesheet.",
      "Use the Month view option in the timesheet view selector.",
      "Choose the month/date you want to inspect.",
      "Use the normal Timesheet or Day view again when you need to work on a specific tee time.",
    ]);
  }

  if (lower.includes("timesheet") && (lower.includes("both courses") || lower.includes("both course") || lower.includes("combined"))) {
    return answer("View Both Courses on the Timesheet", [
      "Open the Timesheet.",
      "Use the course selector on the timesheet.",
      "Choose Both or the combined-course option.",
      "Switch back to an individual course when you only want one course's tee times.",
    ]);
  }

  if (asksAbout(lower, ["add", "create", "make"], ["single tee time booking", "tee time booking"]) || (lower.includes("single") && lower.includes("tee time") && lower.includes("booking"))) {
    return answer("Add a Single Tee Time Booking", [
      "Open the Timesheet for the correct date and course.",
      "Click the tee time slot you want to book.",
      "Enter the booking details for the player or customer.",
      "Add any required booking notes, services, or payment details that are available in Booking Details.",
      "Save the booking and check it appears on the Timesheet in the correct tee time.",
    ]);
  }

  if (lower.includes("print") && lower.includes("timesheet")) {
    return answer("Print the Timesheet", [
      "Open the Timesheet for the date and course you need.",
      "Use the Print option on the Timesheet.",
      "Choose any available print settings required by the club.",
      "Print or save the timesheet output.",
    ]);
  }

  if (lower.includes("booking details") && hasAny(lower, ["tee sheet", "timesheet", "tee"])) {
    return answer("Open Booking Details from the Tee Sheet", [
      "Open the Timesheet for the booking date.",
      "Find the tee time containing the booking.",
      "Click the booking on the tee sheet to open Booking Details.",
      "Review or update only the fields needed for the support task.",
    ]);
  }

  if (lower.includes("squeeze") && (lower.includes("tee time") || lower.includes("timesheet"))) {
    return answer("Use Squeeze Tee Time", [
      "Open the Timesheet for the date you want to adjust.",
      "Use the Squeeze Tee Time option where it is enabled.",
      "Choose where the extra tee time should be inserted, such as before the first tee time, after the last tee time, or between existing tee times.",
      "Confirm the tee time details before saving the change.",
    ], "Check: If the Squeeze Tee Time option is not visible, check Tools > System Configuration because Enable Squeeze Times controls whether it appears.");
  }

  if (asksAbout(lower, ["add", "attach", "set up", "setup"], ["services to a booking", "service to a booking", "services on a booking"])) {
    return answer("Add Services to a Booking", [
      "Open the booking from the Timesheet so you are in Booking Details.",
      "Use the booking's services or extras area to add the service, such as a buggy, caddie, trolley, club hire, room hire, or other configured service.",
      "Check the quantity, service type, and any charge before saving the booking.",
      "If the service is not available to select, go to Tools > Services to check that the service has been set up for the club.",
    ]);
  }

  if (lower.includes("refund") && hasAny(lower, ["booking payment", "booking", "tee time payment"])) {
    return answer("Refund a Booking Payment", [
      "Open the booking from the Timesheet and go to Booking Details.",
      "Check the payment or transaction history for the booking.",
      "Confirm whether the payment was taken through BRS Payments.",
      "If it was taken through BRS Payments, use the BRS Payments refund route and check Tools > BRS Payments > Refunds for refund records.",
      "If it was not taken through BRS Payments, follow the club's own non-BRS payment process.",
    ], "Check: Confirm the booking, customer, amount, payment status, and transaction before refunding.");
  }

  if (lower.includes("booking") && lower.includes("payment")) {
    return answer("Check Payments on a Booking", [
      "Open the booking from the Timesheet and go to Booking Details.",
      "Review the booking payment or transaction area.",
      "Check the payment status, amount, customer, and any BRS Payments transaction reference.",
      "Use Tools > BRS Payments > Transactions if you need to cross-check a BRS Payments transaction.",
    ]);
  }

  if ((lower.includes("search") && lower.includes("booking")) || (lower.includes("booking") && hasAny(lower, ["reference", "customer name", "email", "phone"]))) {
    return answer("Search for a Booking", [
      "Open Search.",
      "Choose the booking search route.",
      "Search by the available customer detail, such as customer name, booking reference, email, or phone number.",
      "Open the matching booking result and check the date, tee time, customer, and reference before taking action.",
    ]);
  }

  if (asksAbout(lower, ["make", "add", "create", "book"], ["facility booking", "room booking", "resource reservation", "facility reservation"])) {
    return answer("Make a Facility Booking", [
      "Open Facilities.",
      "Use the Booking view for the date you need.",
      "Enter or select the reservation name, guest count, room or facility, start time, and end time.",
      "Use repeat days or repeat weeks only if the reservation should repeat.",
      "Check the facility booking grid to make sure the reservation is shown in the right place.",
    ]);
  }

  if (hasAny(lower, ["room", "resource", "facility"]) && lower.includes("reservation")) {
    return answer("Find a Facility Reservation", [
      "Open Facilities.",
      "Use the Booking, Month, or Year view depending on how wide a date range you need.",
      "Look for the reservation by room/facility, reservation name, date, start time, or end time.",
      "Open the reservation record to check the details before changing anything.",
    ]);
  }

  if (asksAbout(lower, ["add", "create"], ["visitor contact", "new contact", "society contact", "tour operator contact", "hotel contact"])) {
    return answer("Add a New Contact", [
      "Open Contacts.",
      "Click Add New.",
      "Enter the non-member contact details.",
      "Choose the relevant contact category, such as Visitor, Society, Tour Operator, Hotel, Company, Other, or the club's own category.",
      "Save the contact record when the details are correct.",
    ], "Check: This route is for non-member contact records; use the appropriate member or login admin area for those records.");
  }

  if (lower.includes("contacts") && lower.includes("category") && hasAny(lower, ["filter", "view", "find"])) {
    return answer("Filter Contacts by Category", [
      "Open Contacts.",
      "Use View Contacts or View All.",
      "Filter by the contact category, such as Visitor, Society, Tour Operator, Hotel, Company, Other, or a club category.",
      "Open the contact record you need from the filtered results.",
    ]);
  }

  if (lower.includes("society contact") || (lower.includes("contacts") && lower.includes("society"))) {
    return answer("Find a Society Contact", [
      "Open Contacts.",
      "Use View Contacts or View All.",
      "Filter the contact category to Society.",
      "Search or scan the results for the society contact record.",
      "Open the contact record to check the details.",
    ]);
  }

  if (lower.includes("email contacts") || (lower.includes("email") && lower.includes("contacts"))) {
    return answer("Email Contacts", [
      "Open Messages.",
      "Go to Email Messages.",
      "Choose Email Contacts.",
      "Select or filter the contacts who should receive the email.",
      "Check the audience and email content before sending.",
    ]);
  }

  if (lower.includes("email") && lower.includes("membership type")) {
    return answer("Email Members in a Membership Type", [
      "Open Messages.",
      "Go to Email Messages.",
      "Choose Email Membership Types.",
      "Select the membership type audience, using the male/female options if those are needed.",
      "Prepare and send the email when the audience and content are correct.",
    ]);
  }

  if (lower.includes("email") && lower.includes("selected members")) {
    return answer("Email Selected Members", [
      "Open Messages.",
      "Go to Email Messages.",
      "Choose Email Selected Members.",
      "Select the members who should receive the email.",
      "Check the selected members and email content before sending.",
    ]);
  }

  if (lower.includes("email") && lower.includes("timesheet")) {
    return answer("Email the Timesheet", [
      "Open Messages.",
      "Go to Email Messages.",
      "Choose Email the Timesheet.",
      "Select the date and time range for the timesheet audience.",
      "Check whether the message should go to members, contacts, or both people linked to bookings on that timesheet.",
      "Prepare and send the email when the audience and content are correct.",
    ]);
  }

  if ((lower.includes("text") || lower.includes("sms")) && lower.includes("selected members")) {
    return answer("Text Selected Members", [
      "Open Messages.",
      "Go to Text Messages.",
      "Choose Text Message Selected Members.",
      "Select the members who should receive the text message.",
      "Check SMS credit and the selected audience before sending.",
    ]);
  }

  if ((lower.includes("text") || lower.includes("sms")) && lower.includes("contacts")) {
    return answer("Text Contacts", [
      "Open Messages.",
      "Go to Text Messages.",
      "Choose the text-message route for Contacts.",
      "Select or filter the contacts who should receive the text.",
      "Check SMS credit and the selected audience before sending.",
    ]);
  }

  if ((lower.includes("text") || lower.includes("sms")) && lower.includes("credit")) {
    return answer("Buy Text Messaging Credit", [
      "Open Messages.",
      "Go to Text Messages.",
      "Use the Purchase Credit option.",
      "Review the club's available SMS credit before buying more.",
      "Complete the purchase only when the club has confirmed the credit amount required.",
    ]);
  }

  if ((lower.includes("text") || lower.includes("sms")) && (lower.includes("recently sent") || lower.includes("sent text"))) {
    return answer("View Recently Sent Text Messages", [
      "Open Messages.",
      "Go to Text Messages.",
      "Open the recently sent text messages or SMS report area.",
      "Use the date or message list to review the text messages that were sent.",
    ]);
  }

  if (lower.includes("club message") && lower.includes("all members")) {
    return answer("Send a Club Message to All Members", [
      "Open Messages or the dashboard Club Messages shortcut.",
      "Go to Club Messaging.",
      "Choose Message All Members.",
      "Enter the club message content.",
      "Check the audience and send the club message when it is ready.",
    ]);
  }

  if (lower.includes("club message") && lower.includes("timesheet")) {
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

  if (lower.includes("message") && lower.includes("timesheet")) {
    return answer("Add a Timesheet Message", [
      "Open the Timesheet.",
      "Use the timesheet message option for the date or sheet you are updating.",
      "Enter the message that should appear on the timesheet.",
      "Save the timesheet message and refresh the sheet to confirm it appears where expected.",
    ]);
  }

  if (lower.includes("flexible membership") && hasAny(lower, ["add", "enable", "turn on", "club"])) {
    return answer("Add Flexible Membership", [
      "Treat Flexible Membership as an optional BRS feature.",
      "Contact the club's BRS account manager or sales/support contact to add or enable Flexible Membership.",
      "After it is enabled, manage flexi member records from the Memberships/member profile area.",
    ]);
  }

  if (lower.includes("failed") && lower.includes("scheduled") && lower.includes("membership")) {
    return answer("Check Failed Scheduled Membership Payments", [
      "Open Memberships.",
      "Go to the billing or scheduled payments area.",
      "Filter for failed scheduled payments.",
      "Open the relevant member profile to review the member, bill, payment status, amount, and payment history.",
      "Use the billing reports area if the club needs a list rather than one member record.",
    ]);
  }

  if (lower.includes("add") && hasAny(lower, ["staff user", "new user", "admin user", "user account"])) {
    return answer("Add a User", [
      "Go to Users.",
      "Click Add New.",
      "Choose the User Group, such as Staff, StaffReadOnly, Member, or another enabled user group.",
      "Complete the required user fields, including username, first name, last name, and any required membership type.",
      "Set a password directly or use the reset-by-email route where an email address is available.",
      "Create the new user when the details and permissions are correct.",
    ], "Check: Do not ask anyone to share an existing password in chat.");
  }

  if (lower.includes("password") && lower.includes("user")) {
    return answer("Change or Reset a User Password", [
      "Go to Users.",
      "Find and open the correct user account.",
      "Use Change Password from the Update User Details page if an admin is setting the password directly.",
      "Use Reset Password by email when an email address is available and the user should set their own password.",
      "Confirm the user can sign in after the reset route is complete.",
    ], "Check: Do not request the current password in chat.");
  }

  if ((lower.includes("staff user") || lower.includes("user")) && (lower.includes("access tools") || lower.includes("not access tools") || lower.includes("privileges"))) {
    return answer("Check User Privileges", [
      "Go to Users.",
      "Open User Privileges.",
      "Find the relevant user group or user permission set.",
      "Check whether Tools access is enabled for that user group.",
      "Update the privileges only after confirming the staff member should have access.",
    ], "Check: If the user is in the wrong user group, open the user record under Users and correct the group first.");
  }

  if (lower.includes("own user details") || lower.includes("my own user details") || lower.includes("your details")) {
    return answer("Find Your Own User Details", [
      "Go to Users.",
      "Open Your Details.",
      "Review the details shown for the signed-in account.",
      "Update allowed fields only where the club's setup permits it.",
    ]);
  }

  if (hasAny(lower, ["disable a user", "disable user", "enable or disable"]) || (lower.includes("user") && lower.includes("disabled"))) {
    return answer("Disable a User", [
      "Go to Users.",
      "Find and open the correct user account.",
      "Use the enable/disable option in the user management area.",
      "Prefer disabling over deleting when the club may need to retain audit history.",
      "Confirm the intended account before saving the change.",
    ]);
  }

  if (lower.includes("member login user") || (lower.includes("member") && lower.includes("login user"))) {
    return answer("Add or Manage a Member Login User", [
      "Go to Users.",
      "Use Add New if the member needs a new login account.",
      "Choose the Member user group or member-login user type available in the club's setup.",
      "Link the login to the appropriate member details where required.",
      "Use Memberships for the member profile, billing, subscription, and wallet details.",
    ]);
  }

  if (lower.includes("general payment request") && lower.includes("refund")) {
    return answer("Refund a General Payment Request", [
      "Go to Tools > BRS Payments > Transactions.",
      "Search for the general payment request transaction.",
      "Confirm the customer, amount, date, and payment status.",
      "Use the refund action on the correct transaction when the payment is eligible.",
      "Review Tools > BRS Payments > Refunds for the refund record.",
    ]);
  }

  if (lower.includes("brs payments") && lower.includes("transactions")) {
    return answer("View BRS Payments Transactions", [
      "Go to Tools > BRS Payments.",
      "Open Transactions.",
      "Search or filter for the transaction you need.",
      "Review the customer, amount, date, payment status, and reference before taking any action.",
    ]);
  }

  if (lower.includes("brs payments") && lower.includes("payout")) {
    return answer("View BRS Payments Payouts", [
      "Go to Tools > BRS Payments.",
      "Open Payouts.",
      "Choose the payout date range or payout entry you need.",
      "Review the payout summary and linked transactions.",
    ]);
  }

  if ((lower.includes("brs payments") || lower.includes("payments")) && lower.includes("vat")) {
    return answer("Download a BRS Payments VAT Report", [
      "Go to Tools > BRS Payments.",
      "Open the VAT report area.",
      "Choose the date range required for the report.",
      "Download or export the VAT report for reconciliation.",
    ]);
  }

  if (lower.includes("brs payments") && lower.includes("refund")) {
    return answer("View BRS Payments Refunds", [
      "Go to Tools > BRS Payments.",
      "Open Refunds.",
      "Search or filter for the refund record.",
      "Review the customer, amount, date, payment status, and linked transaction.",
    ]);
  }

  if (lower.includes("brs payments") && lower.includes("setup")) {
    return answer("Configure BRS Payments Setup", [
      "Go to Tools > BRS Payments.",
      "Open Setup.",
      "Review the payment configuration available to the club.",
      "Only change setup values when the club has confirmed the required payment configuration.",
    ]);
  }

  if (lower.includes("booking payment request")) {
    return answer("View Booking Payment Requests", [
      "Go to Tools > BRS Payments.",
      "Open Booking Payment Requests.",
      "Search or filter for the booking payment request.",
      "Review the request status, customer, booking, and payment details.",
    ]);
  }

  if (lower.includes("general payment request")) {
    return answer("Create a General Payment Request", [
      "Go to Tools > BRS Payments > General Payment Requests.",
      "Use Create Payment Request.",
      "Enter the request details and amount.",
      "Check the customer and payment request details before sending or creating it.",
      "Use the General Payment Requests view to review the request afterward.",
    ]);
  }

  if (lower.includes("report") || lower.includes("reports")) {
    if (lower.includes("booking")) {
      return answer("Run a Booking Report", [
        "Open Reports.",
        "Choose the booking report or booking-related report you need.",
        "Set the date range and filters.",
        "Run the report and export it if the club needs a file.",
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
    if (lower.includes("revenue")) {
      return answer("Run a Revenue Report", [
        "Open Reports.",
        "Choose the revenue report.",
        "Set the date range, course, and any payment filters required.",
        "Run the report and export it if the club needs a file.",
      ]);
    }
    if (lower.includes("playing")) {
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
        "Run the report and export it if the club needs a file.",
      ]);
    }
    if (lower.includes("export")) {
      return answer("Export a Report", [
        "Open Reports.",
        "Run the report with the required date range and filters.",
        "Use the report export or download option.",
        "Open the exported file and check the date range before sharing it.",
      ]);
    }
  }

  if (!lower.includes("copy") && hasAny(lower, ["green fee rates", "green fees"])) {
    return answer("Set Up Green Fee Rates", [
      "Go to Tools.",
      "Open Green Fee Rates or the green-fee setup area.",
      "Choose the course, date range, day, or season you need to update.",
      "Enter the visitor rates and check the timesheet/rate display afterward.",
    ]);
  }

  if (lower.includes("reservation type") || lower.includes("colour") || lower.includes("color")) {
    return answer("Set Up Reservation Types and Colours", [
      "Go to Tools.",
      "Open Reservation Types.",
      "Create or edit the reservation type.",
      "Choose the colour used to identify that reservation type on BRS screens.",
      "Save and check the relevant booking or reservation screen.",
    ]);
  }

  if (lower.includes("booking status")) {
    return answer("Configure Booking Statuses", [
      "Go to Tools.",
      "Open Booking Statuses.",
      "Create or update the booking status options used by the club.",
      "Check how the status appears on bookings before using it operationally.",
    ]);
  }

  if (lower.includes("payment method")) {
    return answer("Set Up Payment Methods", [
      "Go to Tools.",
      "Open Payment Methods.",
      "Create or update the payment method used by the club.",
      "Check the method appears correctly wherever staff record payments.",
    ]);
  }

  if (lower.includes("buggy") && lower.includes("services")) {
    return answer("Set Up Buggy Services", [
      "Go to Tools > Services.",
      "Create or edit the buggy service.",
      "Set the available quantity, booking rules, and any charge required by the club.",
      "Check the service can be selected from the relevant booking flow.",
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

  if (lower.includes("copy") && hasAny(lower, ["services", "green fees", "catering"])) {
    return answer("Copy Services, Catering, or Green Fees to Another Year", [
      "Go to Tools.",
      "Open Copy Services, Catering or Green Fees.",
      "Choose what you want to copy, such as Services, Catering, or Green Fees.",
      "Select the source year to copy from.",
      "Select the destination year to copy to.",
      "Run the copy action and then check the destination year setup.",
    ]);
  }

  if (lower.includes("catering") || lower.includes("refreshments")) {
    return answer("Set Up Catering and Refreshments", [
      "Go to Tools.",
      "Open Catering/Refreshments or Services, depending on the club setup.",
      "Create or edit the catering item or refreshment option.",
      "Check the item is available in the booking or event flow where staff need to use it.",
    ]);
  }

  if (lower.includes("no show reasons")) {
    return answer("Set Up No Show Reasons", [
      "Go to Tools.",
      "Open No Show Reasons.",
      "Create or edit the reason options staff can use.",
      "Check the reason appears when marking or reviewing a no-show.",
    ]);
  }

  if (lower.includes("title for each day") && lower.includes("timesheet")) {
    return answer("Set the Title for Each Day on the Timesheet", [
      "Go to Tools.",
      "Open Title for Each Day.",
      "Choose the date or day title you need to update.",
      "Enter the timesheet title and save it.",
      "Return to the Timesheet and confirm the title appears on the correct day.",
    ]);
  }

  if (lower.includes("legal messages")) {
    return answer("Set Up Legal Messages", [
      "Go to Tools.",
      "Open Legal Messages.",
      "Create or update the message required by the club.",
      "Check where the legal message appears before making it live for users.",
    ]);
  }

  if (lower.includes("course restriction")) {
    return answer("Configure Course Restrictions", [
      "Go to Tools.",
      "Open Course Restrictions.",
      "Choose the course, date range, and restriction rule you need.",
      "Save the restriction and check the booking flow affected by it.",
    ]);
  }

  if (lower.includes("member booking rules")) {
    return answer("Configure Member Booking Rules", [
      "Go to Tools.",
      "Open Member Booking Rules.",
      "Choose the membership type, date range, or rule set you need.",
      "Update the member booking rule and check the online booking behaviour afterward.",
    ]);
  }

  if (lower.includes("visitor") && lower.includes("rates")) {
    return answer("Set Visitor Booking Rates", [
      "Go to Tools.",
      "Open Visitor Booking Rates or Green Fee Rates.",
      "Choose the course, date range, and visitor category.",
      "Enter the visitor rates and check the rate shown in the booking flow.",
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

  if (lower.includes("clubhouse pc") || lower.includes("club house pc")) {
    return answer("Set This PC as the Clubhouse PC", [
      "Go to Tools.",
      "Open Set this PC as the Club House PC.",
      "Confirm the setting only on the machine that should act as the clubhouse PC.",
      "Check the clubhouse-facing workflow on that computer afterward.",
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

  if (hasAny(lower, ["upload", "uploads"]) && lower.includes("members") && lower.includes("contacts")) {
    return answer("Upload Members or Contacts", [
      "Go to Tools.",
      "Open Uploads.",
      "Choose the member or contact upload option required.",
      "Prepare the import file in the format BRS expects.",
      "Run the upload only after checking the file contains the intended records.",
    ]);
  }

  if (lower.includes("competition") && lower.includes("visitor") && lower.includes("charges")) {
    return answer("Check Visitor Charges for an Open Competition", [
      "Open Competitions.",
      "Open the open competition setup.",
      "Review the visitor charge settings for the competition.",
      "Check the visitor entry flow or competition charge summary to confirm the amount.",
    ]);
  }

  if (lower.includes("competition") && lower.includes("charges")) {
    return answer("Configure Competition Charges", [
      "Open Competitions.",
      "Open the competition setup or charging area.",
      "Set the competition charges for the relevant entry type or visitor/member category.",
      "Check the charge shown in the competition entry flow.",
    ]);
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

  if (lower.includes("golf event")) {
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
