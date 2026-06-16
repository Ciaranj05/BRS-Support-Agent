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
      "If it was not taken through BRS Payments, follow the club's non-BRS payment process or escalate.",
    ], "Check: Confirm the booking, customer, amount, payment status, and transaction before refunding.");
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

  if (asksAbout(lower, ["add", "create"], ["visitor contact", "new contact", "society contact", "tour operator contact", "hotel contact"])) {
    return answer("Add a New Contact", [
      "Open Contacts.",
      "Click Add New.",
      "Enter the non-member contact details.",
      "Choose the relevant contact category, such as Visitor, Society, Tour Operator, Hotel, Company, Other, or the club's own category.",
      "Save the contact record when the details are correct.",
    ], "Check: Use Memberships or Users instead if the person is a club member or needs login access.");
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

  if (lower.includes("flexible membership") && hasAny(lower, ["add", "enable", "turn on", "club"])) {
    return answer("Add Flexible Membership", [
      "Treat Flexible Membership as an optional BRS feature.",
      "Contact the club's BRS account manager or sales/support contact to add or enable Flexible Membership.",
      "After it is enabled, manage flexi member records from the Memberships/member profile area.",
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
    ], "Check: Never ask the user to share their current password in chat.");
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

  if (lower.includes("general payment request")) {
    return answer("Create a General Payment Request", [
      "Go to Tools > BRS Payments > General Payment Requests.",
      "Use Create Payment Request.",
      "Enter the request details and amount.",
      "Check the customer and payment request details before sending or creating it.",
      "Use the General Payment Requests view to review the request afterward.",
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

  return null;
}
