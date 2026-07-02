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
    const key = normaliseTitle(entry.title);
    if (!key || EXCLUDED_TITLE_KEYS.has(key)) continue;
    const family = classifyReviewEntryForDriver(entry).driverFamily;
    const indexKey = `${family}|${key}`;
    if (!index.has(indexKey)) index.set(indexKey, []);
    index.get(indexKey).push({
      id: entry.id,
      title: entry.title,
      sourceType: entry.sourceType,
    });
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
    const approvedMatches = approvedTitleIndex.get(`${assignment.driverFamily}|${titleKey}`) || [];
    const canRetire = entry.reviewReason === "incomplete-workflow-evidence" &&
      isReviewPlaceholder(entry) &&
      titleKey &&
      !EXCLUDED_TITLE_KEYS.has(titleKey) &&
      !["restricted", "manual-review"].includes(assignment.driverTier) &&
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
