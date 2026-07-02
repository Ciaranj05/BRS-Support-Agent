import { approvedStaticWorkflowReply } from "./staticWorkflowAnswers.js";
import { retrieveKnowledge } from "./retrieval.js";
import { classifyReviewEntryForDriver } from "./reviewEntryDrivers.js";

export const DEFAULT_FAMILY_PROMPTS = {
  "timesheet-bookings": [
    "How do I add a single tee time booking?",
    "How do I open booking details from the timesheet?",
    "How do I cancel a tee time booking?",
  ],
  "reports-search": [
    "How do I find a booking by reference?",
    "How do I run a visitor booking report?",
    "Where do I download a VAT report?",
  ],
  "settings-setup": [
    "How do I set up reservation types and colours?",
    "How do I set up booking statuses?",
    "How do I set up green fee rates?",
  ],
  "messaging-setup": [
    "How do I set up an email template?",
    "How do I change the message at the top of the tee sheet?",
    "How do I set up member groups for messaging?",
  ],
  memberships: [
    "How do I create a membership bill?",
    "How do I create a payment scheme?",
    "How do I find members with outstanding bills?",
  ],
  competitions: [
    "How do I create a competition?",
    "How do I set up an open competition?",
    "How do I open the competition draw?",
  ],
  "golf-events": [
    "What is a golf event in BRS?",
    "How do I set up a golf event?",
    "How do I add an event organiser reservation?",
  ],
  "online-booking": [
    "What is online booking in BRS?",
    "How do I check online tee bookings?",
    "How do I configure online booking rules?",
  ],
  "contact-records": [
    "How do I add a visitor contact?",
    "How do I view contacts?",
    "How do I filter contacts by category?",
  ],
  "contact-setup": [
    "Where do I manage contact categories?",
    "How do I make a new contact type?",
  ],
  "dashboard-navigation": [
    "How do I see today's bookings on the dashboard?",
    "How do I open Golf Plus?",
  ],
  "restricted-payments": [
    "How do I check BRS Payments transactions?",
    "How do I set up payment methods?",
  ],
  "restricted-outbound-messaging": [
    "How do I send an email to members?",
    "How do I text selected members?",
  ],
  "restricted-users-permissions": [
    "How do I add a staff user?",
    "How do I change a staff user permission?",
  ],
  "restricted-upload-import": [
    "Where do I upload members or contacts?",
    "How do I upload a timesheet?",
  ],
};

function countBy(items = [], keyFn = () => "unknown") {
  return items.reduce((counts, item) => {
    const key = keyFn(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sourceSummary(entries = []) {
  const byType = countBy(entries, (entry) => entry.sourceType || "unknown");
  const titles = [...new Set(entries.map((entry) => entry.title).filter(Boolean))].slice(0, 8);
  return { count: entries.length, byType, titles };
}

function inferCoverageStatus({ staticAnswerCount = 0, approvedEvidenceCount = 0, reviewBacklogCount = 0 } = {}) {
  if (approvedEvidenceCount > 0 && staticAnswerCount > 0 && reviewBacklogCount > approvedEvidenceCount) return "mixed-static-heavy";
  if (approvedEvidenceCount > 0 && staticAnswerCount > 0) return "mixed-static-and-dynamic";
  if (approvedEvidenceCount > 0) return "dynamic-evidence-backed";
  if (staticAnswerCount > 0) return "static-only";
  return "evidence-gap";
}

function inferPriority({ coverageStatus = "", reviewBacklogCount = 0, blockedCount = 0 } = {}) {
  if (coverageStatus === "evidence-gap" && reviewBacklogCount) return "highest";
  if (coverageStatus === "static-only" && reviewBacklogCount) return "high";
  if (coverageStatus === "mixed-static-heavy") return "high";
  if (blockedCount) return "manual-safety-review";
  return "normal";
}

function evidenceMatchesFamily(entry = {}, family = "") {
  if (!family) return false;
  return classifyReviewEntryForDriver(entry).driverFamily === family;
}

export async function analyzeAnswerCoverage({
  reviewRun = {},
  promptsByFamily = DEFAULT_FAMILY_PROMPTS,
  retrieve = retrieveKnowledge,
  staticReply = approvedStaticWorkflowReply,
} = {}) {
  const tasks = Array.isArray(reviewRun.tasks) ? reviewRun.tasks : [];
  const familyNames = [...new Set([
    ...Object.keys(promptsByFamily),
    ...tasks.map((task) => task.driverFamily).filter(Boolean),
  ])].sort();

  const families = [];
  for (const family of familyNames) {
    const prompts = promptsByFamily[family] || tasks
      .filter((task) => task.driverFamily === family)
      .map((task) => task.question || task.title)
      .filter(Boolean)
      .slice(0, 3);
    const reviewTasks = tasks.filter((task) => task.driverFamily === family);
    const staticMatches = prompts
      .map((prompt) => ({ prompt, reply: staticReply(prompt) || "" }))
      .filter((item) => item.reply);
    const retrievedBatches = await Promise.all(prompts.map((prompt) => retrieve(prompt, { limit: 8 })));
    const approvedEvidence = [];
    const seenEvidence = new Set();
    for (const entry of retrievedBatches.flat()) {
      if (entry?.confidence !== "approved") continue;
      if (!evidenceMatchesFamily(entry, family)) continue;
      const key = entry.id || `${entry.title}|${entry.content}`;
      if (seenEvidence.has(key)) continue;
      seenEvidence.add(key);
      approvedEvidence.push(entry);
    }
    const queuedCount = reviewTasks.filter((task) => task.status === "queued").length;
    const blockedCount = reviewTasks.filter((task) => task.status === "blocked").length;
    const coverageStatus = inferCoverageStatus({
      staticAnswerCount: staticMatches.length,
      approvedEvidenceCount: approvedEvidence.length,
      reviewBacklogCount: reviewTasks.length,
    });

    families.push({
      family,
      coverageStatus,
      priority: inferPriority({ coverageStatus, reviewBacklogCount: reviewTasks.length, blockedCount }),
      promptsChecked: prompts,
      staticAnswerCount: staticMatches.length,
      staticAnswerPrompts: staticMatches.map((item) => item.prompt),
      approvedEvidence: sourceSummary(approvedEvidence),
      reviewBacklog: {
        total: reviewTasks.length,
        queued: queuedCount,
        blocked: blockedCount,
        byTier: countBy(reviewTasks, (task) => task.allowedTier),
      },
      note: coverageStatus.includes("static")
        ? "Static fallback coverage exists; use queued review-driver evidence to replace or support static wording before approving more dynamic answers."
        : "No static fallback dependency detected for the sampled prompts.",
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceReviewRunGeneratedAt: reviewRun.generatedAt || null,
    totalFamilies: families.length,
    summary: {
      byCoverageStatus: countBy(families, (family) => family.coverageStatus),
      byPriority: countBy(families, (family) => family.priority),
      totalReviewBacklog: families.reduce((sum, family) => sum + family.reviewBacklog.total, 0),
      totalStaticAnswerPrompts: families.reduce((sum, family) => sum + family.staticAnswerCount, 0),
      totalApprovedEvidenceMatches: families.reduce((sum, family) => sum + family.approvedEvidence.count, 0),
    },
    families,
  };
}
