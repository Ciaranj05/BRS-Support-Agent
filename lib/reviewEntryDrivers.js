function compact(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalise(value = "") {
  return compact(value).toLowerCase();
}

const DRIVER_RULES = [
  {
    family: "reports-search",
    tier: "read-only-complete",
    status: "queued",
    pattern: /\b(vat reports?|financial reports?|reports?|search bookings?|search|export|download)\b/i,
    reason: "Reports and search workflows can usually be completed by running filters and verifying result columns without writing data.",
  },
  {
    family: "online-booking",
    tier: "read-only-complete",
    status: "queued",
    pattern: /\b(book tee times online|online tee bookings?|member on-line booking|visitor on-line booking)\b/i,
    reason: "Online booking entry pages can be verified read-only without mutating admin tee-sheet records.",
  },
  {
    family: "messaging-setup",
    tier: "read-and-draft-only",
    status: "queued",
    pattern: /\b(messages on the timesheet|legal messages|membership groups for email and text|email and letter templates|service reminder email)\b/i,
    reason: "Messaging setup/template pages can be opened and drafted, but sending or saving live changes requires a restore helper.",
  },
  {
    family: "restricted-outbound-messaging",
    tier: "restricted",
    status: "blocked",
    pattern: /\b(send an email|send a text|member\s+\[redacted-name\].*email and text|email messaging|text messaging|text messages?|sms|club messaging|club message|admin messages?|messages|recently sent messages|brs registration reminder|golf plus reminder|purchase sms|enter club message)\b/i,
    reason: "Outbound email, text, SMS, and club-message workflows must not be sent automatically.",
  },
  {
    family: "restricted-users-permissions",
    tier: "restricted",
    status: "blocked",
    pattern: /\b(manage users?|view \/ update user details|user details|create a new user|new user|users?|permissions?|password|superuser|login|staff access)\b/i,
    reason: "User, password, permission, and staff-access changes require manual approval and a dedicated rollback design.",
  },
  {
    family: "restricted-upload-import",
    tier: "restricted",
    status: "blocked",
    pattern: /\b(upload timesheet|import|data merge|membership data merge)\b/i,
    reason: "Uploads/imports can bulk-change live data, so the automated driver may inspect only after a fixture and rollback plan exist.",
  },
  {
    family: "restricted-payments",
    tier: "restricted",
    status: "blocked",
    pattern: /\b(process competition charges|payment requests?|create payment request|balance transactions?|transactions?|payouts?|refunds?|payment methods?|payments?)\b/i,
    reason: "Payments, refunds, payouts, payment requests, and wallet mutations must not be automatically changed by a crawl driver.",
  },
  {
    family: "contact-records",
    tier: "safe-test-record-with-rollback",
    status: "queued",
    pattern: /\b(view contacts?|add contact|edit contact|contacts)\b/i,
    reason: "Contact workflows can be tested only with temporary contact records and verified cleanup.",
  },
  {
    family: "contact-setup",
    tier: "read-and-draft-only",
    status: "queued",
    pattern: /\b(contact categories)\b/i,
    reason: "Contact category setup can be inspected and drafted, but saving changes requires a restore helper.",
  },
  {
    family: "facilities",
    tier: "safe-test-record-with-rollback",
    status: "queued",
    pattern: /\b(facilities|facility|room|resource)\b/i,
    reason: "Facility/resource bookings can be tested only with temporary records and verified cleanup.",
  },
  {
    family: "memberships",
    tier: "read-and-draft-only",
    status: "queued",
    pattern: /\bmemberships?\b|\bmember profile\b|\bmember\s+\[redacted-name\]|\bmembers\b|\bsubscription\b|\bbilling\b|\bbills?\b|\bpayment scheme\b|\bflexi\b|\bwallet\b/i,
    reason: "Membership workflows may be opened and drafted, but profile, billing, wallet, and subscription writes need a fixture-specific rollback helper.",
  },
  {
    family: "competitions",
    tier: "read-and-draft-only",
    status: "queued",
    pattern: /\b(competition|competitions|open competitions?|draw entrants?|competition dates?|add member to waiting list)\b/i,
    reason: "Competition setup can be inspected and drafted, but live setup or charge mutations require a rollback helper.",
  },
  {
    family: "golf-events",
    tier: "read-and-draft-only",
    status: "queued",
    pattern: /\b(golf events?)\b/i,
    reason: "Golf Events is a separate workflow area. It can be inspected and drafted, but live event setup requires a rollback helper.",
  },
  {
    family: "settings-setup",
    tier: "read-and-draft-only",
    status: "queued",
    pattern: /\b(reservation types?|booking statuses?|green fee|rates?|course restriction|configure timesheet|system configuration|system tools|setup|templates?|timesheet templates|services|catering|rules?|casual booking rules|no show reasons|categories|club news)\b/i,
    reason: "Settings/setup pages can be opened and drafted, but saving changes requires a setting-specific restore helper.",
  },
  {
    family: "timesheet-bookings",
    tier: "safe-test-record-with-rollback",
    status: "queued",
    pattern: /\b(tee booking system|timesheet|tee sheet|bookings?|squeeze tee time|calendar|january|february|march|april|may|june|july|august|september|october|november|december|title for each day|buggy|demo explored workflow routes|brs demo workflow exploration)\b/i,
    reason: "Booking workflows can be tested with temporary records only when rollback is verified immediately.",
  },
  {
    family: "dashboard-navigation",
    tier: "read-only-complete",
    status: "queued",
    pattern: /\b(dashboard|online tee bookings|golf plus)\b/i,
    reason: "Dashboard/navigation entries can be verified read-only by opening the target and confirming route/result state.",
  },
];

export function classifyReviewEntryForDriver(entry = {}) {
  const text = compact([
    entry.title,
    entry.area,
    entry.workflow,
    entry.workflowFamily,
  ].filter(Boolean).join(" "));

  const rule = DRIVER_RULES.find((candidate) => candidate.pattern.test(text));
  if (rule) {
    return {
      entryId: entry.id || null,
      title: entry.title || "Untitled review entry",
      area: entry.area || null,
      reviewReason: entry.reviewReason || null,
      driverFamily: rule.family,
      driverTier: rule.tier,
      driverStatus: rule.status,
      reason: rule.reason,
      safeMutationAllowed: rule.tier === "safe-test-record-with-rollback",
      requiresRollback: rule.tier === "safe-test-record-with-rollback",
    };
  }

  return {
    entryId: entry.id || null,
    title: entry.title || "Untitled review entry",
    area: entry.area || null,
    reviewReason: entry.reviewReason || null,
    driverFamily: "manual-review",
    driverTier: "manual-review",
    driverStatus: "blocked",
    reason: "No safe automated driver family matched this review entry.",
    safeMutationAllowed: false,
    requiresRollback: false,
  };
}

export function classifyReviewEntriesForDrivers(entries = []) {
  return entries.map(classifyReviewEntryForDriver);
}

export function summarizeDriverAssignments(assignments = []) {
  const countBy = (key) => assignments.reduce((counts, assignment) => {
    const value = assignment[key] || "(none)";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
  return {
    total: assignments.length,
    byStatus: countBy("driverStatus"),
    byTier: countBy("driverTier"),
    byFamily: countBy("driverFamily"),
    safeMutationCandidateCount: assignments.filter((assignment) => assignment.safeMutationAllowed).length,
    blockedCount: assignments.filter((assignment) => assignment.driverStatus === "blocked").length,
    queuedCount: assignments.filter((assignment) => assignment.driverStatus === "queued").length,
    normalizedAt: new Date().toISOString(),
  };
}

export function buildDriverQuestion(assignment = {}) {
  const subject = compact([assignment.area, assignment.title].filter(Boolean).join(" - "));
  if (!subject) return "Verify this BRS workflow from safe evidence.";
  if (assignment.driverTier === "read-only-complete") return `Verify the read-only BRS workflow for ${subject}.`;
  if (assignment.driverTier === "read-and-draft-only") return `Open and draft the BRS workflow for ${subject} without saving changes.`;
  if (assignment.driverTier === "safe-test-record-with-rollback") return `Test the BRS workflow for ${subject} using only temporary data and verified rollback.`;
  return `Review the BRS workflow for ${subject}.`;
}
