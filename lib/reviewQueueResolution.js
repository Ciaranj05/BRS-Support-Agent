import { classifyReviewEntryForDriver } from "./reviewEntryDrivers.js";

const EXCLUDED_TITLE_KEYS = new Set([
  "0",
  "0%",
  "brs golf tee booking system",
  "setup",
  "untitled knowledge entry",
]);

function normaliseTitle(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/confirmed brs page evidence/g, "")
    .replace(/workflow surface|workflow/g, "")
    .replace(/["':]/g, "")
    .replace(/\[level=\d+\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseCanonicalTitle(value = "") {
  const title = normaliseTitle(value);
  if (/^(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2}$/.test(title)) {
    return "calendar";
  }
  return title
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, " ")
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/g, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\bredacted date\b/g, " ")
    .replace(/\bredacted club\b/g, " ")
    .replace(/\b\d{1,2}\s*\d{2}\b/g, " ")
    .replace(/\b(?:brs golf )?tee booking system\b/g, "timesheet")
    .replace(/\bbooking details for\b/g, "booking details")
    .replace(/^0$/g, "timesheet")
    .replace(/^bookings$/g, "timesheet")
    .replace(/^brs page$/g, "system tools")
    .replace(/^setup$/g, "system tools")
    .replace(/^create a new user add a member$/g, "create a new user")
    .replace(/^club message detail$/g, "club messages")
    .replace(/^enter club message$/g, "club messages")
    .replace(/\bbook tee times online at\b/g, "book tee times online")
    .replace(/\bfor\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isReviewPlaceholder(entry = {}) {
  return Boolean(entry.reviewPayloadWithheld) &&
    !entry.controls?.length &&
    !entry.actions?.length &&
    !entry.routes?.length &&
    !entry.fields?.length &&
    !entry.tableHeaders?.length;
}

function buildApprovedTitleIndex(approvedEntries = []) {
  const index = new Map();
  for (const entry of approvedEntries) {
    const family = classifyReviewEntryForDriver(entry).driverFamily;
    for (const key of new Set([
      normaliseTitle(entry.title),
      normaliseCanonicalTitle(entry.title),
    ])) {
      if (!key || EXCLUDED_TITLE_KEYS.has(key)) continue;
      const indexKey = `${family}|${key}`;
      if (!index.has(indexKey)) index.set(indexKey, []);
      index.get(indexKey).push({
        id: entry.id,
        title: entry.title,
        sourceType: entry.sourceType,
      });
    }
  }
  return index;
}

export function resolveReviewQueue(entries = []) {
  const approvedEntries = entries.filter((entry) => entry.confidence === "approved");
  const reviewEntries = entries.filter((entry) => entry.confidence !== "approved");
  const approvedTitleIndex = buildApprovedTitleIndex(approvedEntries);
  const actionable = [];
  const retired = [];

  for (const entry of reviewEntries) {
    const assignment = classifyReviewEntryForDriver(entry);
    const titleKey = normaliseTitle(entry.title);
    const canonicalTitleKey = normaliseCanonicalTitle(entry.title);
    const hasUsableTitleKey = [titleKey, canonicalTitleKey].some((key) => key && !EXCLUDED_TITLE_KEYS.has(key));
    const manualPageChromeMatches = assignment.driverTier === "manual-review" && canonicalTitleKey === "system tools"
      ? approvedTitleIndex.get("settings-setup|system tools") || []
      : [];
    const approvedMatches = [
      ...approvedTitleIndex.get(`${assignment.driverFamily}|${titleKey}`) || [],
      ...approvedTitleIndex.get(`${assignment.driverFamily}|${canonicalTitleKey}`) || [],
      ...manualPageChromeMatches,
    ];
    const canRetire = entry.reviewReason === "incomplete-workflow-evidence" &&
      isReviewPlaceholder(entry) &&
      hasUsableTitleKey &&
      (assignment.driverTier !== "manual-review" || manualPageChromeMatches.length > 0) &&
      approvedMatches.length > 0;

    if (!canRetire) {
      actionable.push(entry);
      continue;
    }

    retired.push({
      id: entry.id,
      title: entry.title,
      area: entry.area || null,
      reviewReason: entry.reviewReason,
      driverFamily: assignment.driverFamily,
      resolution: "superseded-by-approved-same-family-knowledge",
      approvedMatch: approvedMatches[0],
    });
  }

  return {
    reviewQueue: actionable,
    retiredReviewEntries: retired,
    summary: {
      totalCandidates: reviewEntries.length,
      actionableCount: actionable.length,
      retiredCount: retired.length,
    },
  };
}
