import fs from "fs/promises";
import path from "path";

const DEFAULT_KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const DEFAULT_INDEX_PATH = path.join(DEFAULT_KNOWLEDGE_DIR, "knowledge-index.json");
const TRACKED_TIMESTAMP_CRAWLS = new Set([
  "brs-system-1780913820705.json",
  "brs-system-1782127941508.json",
  "brs-workflows-1782127941508.json",
]);

export function tokenize(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2);
}

function normaliseSourceType(sourceType = "manual") {
  if (sourceType === "brs-system") return "system";
  if (sourceType === "brs-system-workflow") return "workflow";
  if (sourceType === "brs-workflow-family") return "workflow";
  return sourceType;
}

function shouldReadKnowledgeJson(fileName = "") {
  if (!fileName.endsWith(".json")) return false;
  if (/^brs-(system|workflows)-\d{13}\.json$/i.test(fileName)) {
    return TRACKED_TIMESTAMP_CRAWLS.has(fileName);
  }
  return !["knowledge-index.json", "review-queue.json"].includes(fileName);
}

function flattenLabels(items = []) {
  return items.map((item) => {
    if (typeof item === "string") return item;
    return [item.label, item.helpText, item.type, item.purpose, item.title, item.ariaLabel, item.iconText, ...(item.options || [])].filter(Boolean).join(": ");
  });
}

function flattenWorkflow(entry = {}) {
  const routes = Array.isArray(entry.routes) ? entry.routes : [];
  const variants = Array.isArray(entry.variants) ? entry.variants : [];
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
  const writeActions = Array.isArray(entry.writeActions) ? entry.writeActions : [];
  const relatedWorkflows = Array.isArray(entry.relatedWorkflows) ? entry.relatedWorkflows : [];
  return [
    entry.workflow && `Workflow: ${entry.workflow}`,
    entry.workflowFamily && `Workflow family: ${entry.workflowFamily}`,
    aliases.length ? `Aliases: ${aliases.join("; ")}` : null,
    ...(entry.steps || []).map((step, index) => `Step ${index + 1}: ${step}`),
    ...variants.flatMap((variant, variantIndex) => [
      `Variant ${variantIndex + 1}: ${variant.name || variant.title || variant.object || "Workflow variant"}`,
      variant.appliesWhen ? `Variant ${variantIndex + 1} applies when: ${variant.appliesWhen}` : null,
      variant.answerImpact ? `Variant ${variantIndex + 1} answer impact: ${variant.answerImpact}` : null,
      variant.sameAsWorkflow ? `Variant ${variantIndex + 1} same workflow as: ${variant.sameAsWorkflow}` : null,
      ...(variant.notes || []).map((note) => `Variant ${variantIndex + 1} note: ${note}`),
    ].filter(Boolean)),
    ...routes.flatMap((route, routeIndex) => [
      `Route ${routeIndex + 1}: ${route.name || route.title || "Workflow route"}`,
      route.actor ? `Route ${routeIndex + 1} actor: ${route.actor}` : null,
      route.preconditions?.length ? `Route ${routeIndex + 1} preconditions: ${route.preconditions.join("; ")}` : null,
      ...(route.steps || []).map((step, stepIndex) => `Route ${routeIndex + 1} step ${stepIndex + 1}: ${step}`),
      route.outcome ? `Route ${routeIndex + 1} outcome: ${route.outcome}` : null,
      route.verification?.length ? `Route ${routeIndex + 1} verification: ${route.verification.join("; ")}` : null,
    ].filter(Boolean)),
    ...writeActions.flatMap((action, actionIndex) => [
      `Write action ${actionIndex + 1}: ${action.name || action.label || action.type || "Write action"}`,
      action.riskTier ? `Write action ${actionIndex + 1} risk tier: ${action.riskTier}` : null,
      action.allowedAutomatically === false ? `Write action ${actionIndex + 1} automatic use: blocked` : null,
      action.rollbackPlan ? `Write action ${actionIndex + 1} rollback plan: ${action.rollbackPlan}` : null,
      action.rollbackVerified ? `Write action ${actionIndex + 1} rollback verified: yes` : null,
    ].filter(Boolean)),
    ...relatedWorkflows.flatMap((relationship, relationshipIndex) => [
      `Related workflow ${relationshipIndex + 1}: ${relationship.workflowFamily || relationship.family || relationship.title || relationship.id || "related workflow"}`,
      relationship.type ? `Related workflow ${relationshipIndex + 1} type: ${relationship.type}` : null,
      relationship.reason ? `Related workflow ${relationshipIndex + 1} reason: ${relationship.reason}` : null,
      relationship.answerUse ? `Related workflow ${relationshipIndex + 1} answer use: ${relationship.answerUse}` : null,
      relationship.includeWhen?.length ? `Related workflow ${relationshipIndex + 1} include when: ${relationship.includeWhen.join("; ")}` : null,
      relationship.excludeWhen?.length ? `Related workflow ${relationshipIndex + 1} exclude when: ${relationship.excludeWhen.join("; ")}` : null,
    ].filter(Boolean)),
    entry.rollbackPolicy && `Rollback policy: ${entry.rollbackPolicy}`,
    entry.explorationStatus && `Exploration status: ${entry.explorationStatus}`,
    ...(entry.controls || []).map((control) => `Control: ${flattenLabels([control])[0]}`),
    ...(entry.actions || []).map((action) => `Action: ${flattenLabels([action])[0]}`),
    ...(entry.tableHeaders || []).map((header) => `Table column: ${header}`),
    ...(entry.pageEvidence?.headings || []).map((heading) => `Heading: ${heading}`),
    ...(entry.pageEvidence?.captions || []).map((caption) => `Caption: ${caption}`),
  ].filter(Boolean);
}

export function normaliseKnowledgeEntry(entry = {}) {
  const sourceType = normaliseSourceType(entry.sourceType || "manual");
  const title = entry.title || entry.page || entry.area || "Untitled knowledge entry";
  const body = [
    entry.summary,
    entry.purpose,
    entry.content,
    entry.userNeed && `User need: ${entry.userNeed}`,
    entry.answerPattern && `Approved answer pattern: ${entry.answerPattern}`,
    ...flattenWorkflow(entry),
    ...(entry.helpText || []),
    ...flattenLabels(entry.fields || []),
    ...flattenLabels(entry.actions || []),
  ].filter(Boolean).join("\n");

  return {
    id: entry.id || `${sourceType}:${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    sourceType,
    title,
    area: entry.area || null,
    navigationPath: entry.navigationPath || null,
    sourceUrl: ["system", "workflow"].includes(sourceType) ? null : entry.sourceUrl || null,
    confidence: entry.confidence || "needs-review",
    lastObservedAt: entry.lastObservedAt || null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    content: body,
    workflow: entry.workflow || null,
    workflowFamily: entry.workflowFamily || entry.workflow || null,
    aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
    variants: Array.isArray(entry.variants) ? entry.variants : [],
    relatedWorkflows: Array.isArray(entry.relatedWorkflows) ? entry.relatedWorkflows : [],
    controls: Array.isArray(entry.controls) ? entry.controls : [],
    actions: Array.isArray(entry.actions) ? entry.actions : [],
    routes: Array.isArray(entry.routes) ? entry.routes : [],
    tableHeaders: Array.isArray(entry.tableHeaders) ? entry.tableHeaders : [],
  };
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
  const files = await fs.readdir(dir);
  const entries = [];
  for (const file of files.filter(shouldReadKnowledgeJson)) {
    const raw = await fs.readFile(path.join(dir, file), "utf-8");
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

async function loadSourceKnowledge(knowledgeDir = DEFAULT_KNOWLEDGE_DIR) {
  const sources = [
    ...await readJsonFiles(path.join(knowledgeDir, "system")),
    ...await readJsonFiles(path.join(knowledgeDir, "workflows")),
    ...await readJsonFiles(path.join(knowledgeDir, "help-center")),
    ...await readManualMarkdown(path.join(knowledgeDir, "manual")),
  ];
  return sources.map(normaliseKnowledgeEntry);
}

export async function loadKnowledgeBase(indexPath = DEFAULT_INDEX_PATH) {
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.entries) ? parsed.entries.map(normaliseKnowledgeEntry) : [];
  } catch (error) {
    if (error.code === "ENOENT") return loadSourceKnowledge(path.dirname(indexPath));
    throw error;
  }
}

export function scoreKnowledgeEntry(query, entry) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;
  const haystack = tokenize([entry.title, entry.area, entry.navigationPath, entry.content, ...(entry.tags || [])].join(" "));
  const counts = new Map();
  for (const token of haystack) counts.set(token, (counts.get(token) || 0) + 1);
  return queryTokens.reduce((score, token) => score + Math.min(counts.get(token) || 0, 4), 0);
}
