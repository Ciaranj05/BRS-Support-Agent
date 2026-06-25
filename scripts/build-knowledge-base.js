import fs from "fs/promises";
import path from "path";
import { hasIncompleteWorkflowEvidence } from "../lib/groundingGuards.js";
import { normaliseKnowledgeEntry } from "../lib/knowledgeSources.js";
import { hasSensitiveData, redactText } from "../lib/knowledgeRedaction.js";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const OUTPUT_PATH = path.join(KNOWLEDGE_DIR, "knowledge-index.json");
const TRACKED_TIMESTAMP_CRAWLS = new Set([
  "brs-system-1780913820705.json",
  "brs-system-1782127941508.json",
  "brs-workflows-1782127941508.json",
]);

function shouldReadKnowledgeJson(fileName = "") {
  if (!fileName.endsWith(".json")) return false;
  if (/^brs-(system|workflows)-\d{13}\.json$/i.test(fileName)) {
    return TRACKED_TIMESTAMP_CRAWLS.has(fileName);
  }
  return true;
}

function isSystemEntry(entry = {}) {
  return ["system", "brs-system", "workflow", "brs-system-workflow", "brs-workflow-family"].includes(entry.sourceType);
}

function compactTextParts(parts = []) {
  return parts.flat().filter(Boolean).join("\n");
}

function entryTextForReview(entry = {}) {
  return compactTextParts([
    entry.title,
    entry.area,
    entry.navigationPath,
    entry.summary,
    entry.purpose,
    entry.content,
    entry.workflow,
    entry.workflowFamily,
    entry.aliases || [],
    entry.steps || [],
    (entry.variants || []).flatMap((variant) => [
      variant.name,
      variant.title,
      variant.object,
      variant.appliesWhen,
      variant.answerImpact,
      variant.sameAsWorkflow,
      variant.notes || [],
    ]),
    (entry.routes || []).flatMap((route) => [
      route.name,
      route.title,
      route.actor,
      route.preconditions || [],
      route.steps || [],
      route.outcome,
      route.verification || [],
    ]),
    (entry.writeActions || []).flatMap((action) => [
      action.name,
      action.label,
      action.type,
      action.riskTier,
      action.rollbackPlan,
      action.rollbackVerified ? "rollback verified" : null,
    ]),
    (entry.relatedWorkflows || []).flatMap((relationship) => [
      relationship.id,
      relationship.workflowId,
      relationship.workflowFamily,
      relationship.family,
      relationship.title,
      relationship.type,
      relationship.reason,
      relationship.answerUse,
      relationship.includeWhen || [],
      relationship.excludeWhen || [],
    ]),
    entry.helpText || [],
    entry.tableHeaders || [],
    (entry.controls || []).map((control) => compactTextParts([control.label, control.type, control.options || []])),
    (entry.fields || []).map((field) => compactTextParts([field.label, field.helpText, field.type])),
    (entry.actions || []).map((action) => typeof action === "string" ? action : compactTextParts([action.label, action.purpose, action.title, action.ariaLabel, action.iconText])),
  ]);
}

function redactValue(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue).filter((item) => item !== "");
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, redactValue(nested)]));
  }
  return value;
}

function hasEnoughReusableProductKnowledge(entry = {}) {
  const text = entryTextForReview(entry);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const hasUiShape = (entry.fields || []).length || (entry.actions || []).length || (entry.helpText || []).length || (entry.routes || []).length;
  return wordCount >= 8 && (hasUiShape || Boolean(entry.purpose || entry.content)) && !hasIncompleteWorkflowEvidence(entry);
}

function prepareSystemEntry(entry = {}) {
  const sourceType = ["workflow", "brs-system-workflow", "brs-workflow-family"].includes(entry.sourceType) ? "workflow" : "system";
  const redacted = redactValue({ ...entry, sourceType });
  const reviewText = entryTextForReview(redacted);
  const tags = new Set([...(redacted.tags || []), "crawled-brs-system", "redacted-system-observation"]);
  const safeForChatbot = hasEnoughReusableProductKnowledge(redacted)
    && !redacted.containsClubSpecificData
    && !hasSensitiveData(reviewText);

  return {
    ...redacted,
    sourceUrl: null,
    clubId: undefined,
    clubScope: "template",
    confidence: safeForChatbot ? "approved" : "needs-review",
    tags: [
      ...tags,
      sourceType === "workflow" ? "workflow-knowledge" : null,
      hasIncompleteWorkflowEvidence(redacted) ? "incomplete-workflow-evidence" : null,
      safeForChatbot ? "auto-approved-after-redaction" : "requires-human-review",
    ].filter(Boolean),
  };
}

function prepareEntry(entry = {}) {
  if (isSystemEntry(entry)) return prepareSystemEntry(entry);
  return entry;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFiles(dir) {
  if (!await pathExists(dir)) return [];
  const files = await fs.readdir(dir, { withFileTypes: true });
  const entries = [];
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      entries.push(...await readJsonFiles(filePath));
      continue;
    }
    if (!shouldReadKnowledgeJson(file.name)) continue;
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.entries)) entries.push(...parsed.entries);
    else if (Array.isArray(parsed)) entries.push(...parsed);
    else entries.push(parsed);
  }
  return entries;
}

async function readManualMarkdown(dir) {
  if (!await pathExists(dir)) return [];
  const files = await fs.readdir(dir);
  const entries = [];
  for (const file of files.filter((name) => name.endsWith(".md"))) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    const title = content.match(/^#\s+(.+)$/m)?.[1] || file.replace(/\.md$/, "");
    entries.push({ sourceType: "manual", title, content, confidence: "approved", tags: ["manual-support-guidance"] });
  }
  return entries;
}

export async function buildKnowledgeBase({ knowledgeDir = KNOWLEDGE_DIR, outputPath = OUTPUT_PATH } = {}) {
  const sources = [
    ...await readJsonFiles(path.join(knowledgeDir, "system")),
    ...await readJsonFiles(path.join(knowledgeDir, "workflows")),
    ...await readJsonFiles(path.join(knowledgeDir, "help-center")),
    ...await readManualMarkdown(path.join(knowledgeDir, "manual")),
  ];

  const entries = sources.map(prepareEntry).map(normaliseKnowledgeEntry);
  const reviewQueue = entries.filter((entry) => entry.confidence !== "approved");

  await fs.mkdir(knowledgeDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
  await fs.writeFile(path.join(knowledgeDir, "review-queue.json"), JSON.stringify({ generatedAt: new Date().toISOString(), entries: reviewQueue }, null, 2));
  return { entries, reviewQueue };
}

async function main() {
  const { entries, reviewQueue } = await buildKnowledgeBase();
  console.log(`Built knowledge index with ${entries.length} entries. ${reviewQueue.length} entries need review.`);
}

if (process.argv[1] && process.argv[1].endsWith("build-knowledge-base.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
