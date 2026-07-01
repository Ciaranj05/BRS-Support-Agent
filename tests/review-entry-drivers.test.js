import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDriverQuestion,
  classifyReviewEntryForDriver,
  summarizeDriverAssignments,
} from "../lib/reviewEntryDrivers.js";

test("blocks high-risk payment messaging user and import workflows", () => {
  const cases = [
    ["Process Competition Charges", "restricted-payments"],
    ["Send an Email confirmed BRS page evidence", "restricted-outbound-messaging"],
    ["Member [redacted-name] for Email and Text", "restricted-outbound-messaging"],
    ["Manage Users confirmed BRS page evidence", "restricted-users-permissions"],
    ["Upload Timesheet confirmed BRS page evidence", "restricted-upload-import"],
  ];

  for (const [title, family] of cases) {
    const assignment = classifyReviewEntryForDriver({ title, reviewReason: "incomplete-workflow-evidence" });
    assert.equal(assignment.driverFamily, family);
    assert.equal(assignment.driverStatus, "blocked");
    assert.equal(assignment.safeMutationAllowed, false);
  }
});

test("queues safe reversible and read-only review entries with appropriate tiers", () => {
  const assignments = [
    classifyReviewEntryForDriver({ title: "Tee Booking System confirmed BRS page evidence" }),
    classifyReviewEntryForDriver({ title: "View Contacts confirmed BRS page evidence" }),
    classifyReviewEntryForDriver({ title: "Reports confirmed BRS page evidence" }),
    classifyReviewEntryForDriver({ title: "Reservation Types confirmed BRS page evidence" }),
  ];

  assert.equal(assignments[0].driverFamily, "timesheet-bookings");
  assert.equal(assignments[0].driverTier, "safe-test-record-with-rollback");
  assert.equal(assignments[0].safeMutationAllowed, true);
  assert.equal(assignments[1].driverFamily, "contact-records");
  assert.equal(assignments[1].requiresRollback, true);
  assert.equal(assignments[2].driverTier, "read-only-complete");
  assert.equal(assignments[3].driverTier, "read-and-draft-only");
});

test("keeps setup and report areas out of broad booking or payment families", () => {
  const greenFees = classifyReviewEntryForDriver({ title: "Green Fee Rates for Visitors / Tour Operators / Tee Time Agents" });
  const bookingStatuses = classifyReviewEntryForDriver({ title: "Booking Statuses confirmed BRS page evidence" });
  const vatReports = classifyReviewEntryForDriver({ title: "VAT Reports confirmed BRS page evidence" });
  const messagesOnTimesheet = classifyReviewEntryForDriver({ title: "Messages on the Timesheet for 2026" });
  const contactCategories = classifyReviewEntryForDriver({ title: "Contact Categories confirmed BRS page evidence" });
  const systemTools = classifyReviewEntryForDriver({
    title: "System Tools workflow",
    area: "System Tools",
    navigationPath: "System Tools > Payment Methods",
  });
  const waitingList = classifyReviewEntryForDriver({ title: "Add member to waiting list workflow" });
  const onlineBooking = classifyReviewEntryForDriver({ title: "Book Tee Times Online at [redacted-club] confirmed BRS page evidence" });

  assert.equal(greenFees.driverFamily, "settings-setup");
  assert.equal(bookingStatuses.driverFamily, "settings-setup");
  assert.equal(vatReports.driverFamily, "reports-search");
  assert.equal(messagesOnTimesheet.driverFamily, "messaging-setup");
  assert.equal(contactCategories.driverFamily, "contact-setup");
  assert.equal(systemTools.driverFamily, "settings-setup");
  assert.equal(waitingList.driverFamily, "competitions");
  assert.equal(onlineBooking.driverFamily, "online-booking");
});

test("keeps Golf Events separate from Competitions", () => {
  const golfEvents = classifyReviewEntryForDriver({ title: "Golf Events for 2026 confirmed BRS page evidence" });
  const competitions = classifyReviewEntryForDriver({ title: "Competitions for 2026 confirmed BRS page evidence" });

  assert.equal(golfEvents.driverFamily, "golf-events");
  assert.equal(golfEvents.driverTier, "read-and-draft-only");
  assert.equal(competitions.driverFamily, "competitions");
});

test("does not infer a dashboard driver from bare percentage labels", () => {
  const assignment = classifyReviewEntryForDriver({ title: "0%", area: "0%" });

  assert.equal(assignment.driverFamily, "manual-review");
  assert.equal(assignment.driverStatus, "blocked");
});

test("does not infer a dashboard driver from generic BRS page labels", () => {
  const assignment = classifyReviewEntryForDriver({ title: "BRS page confirmed BRS page evidence", area: "BRS page" });

  assert.equal(assignment.driverFamily, "manual-review");
  assert.equal(assignment.driverStatus, "blocked");
});

test("summarizes all driver assignments and creates tier-aware questions", () => {
  const assignments = [
    classifyReviewEntryForDriver({ id: "a", title: "Reports confirmed BRS page evidence", area: "Reports" }),
    classifyReviewEntryForDriver({ id: "b", title: "Send a Text confirmed BRS page evidence", area: "Send a Text" }),
  ];
  const summary = summarizeDriverAssignments(assignments);

  assert.equal(summary.total, 2);
  assert.equal(summary.queuedCount, 1);
  assert.equal(summary.blockedCount, 1);
  assert.match(buildDriverQuestion(assignments[0]), /^Verify the read-only BRS workflow/);
  assert.match(buildDriverQuestion(assignments[1]), /^Review the BRS workflow/);
});
