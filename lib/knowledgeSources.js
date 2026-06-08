import fs from "fs/promises";
import path from "path";

const DEFAULT_KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const DEFAULT_INDEX_PATH = path.join(DEFAULT_KNOWLEDGE_DIR, "knowledge-index.json");

export function tokenize(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2);
}

function normaliseSourceType(sourceType = "manual") {
  if (sourceType === "brs-system") return "system";
  if (sourceType === "brs-system-workflow") return "workflow";
  return sourceType;
}

function flattenLabels(items = []) {
  return items.map((item) => {
    if (typeof item === "string") return item;
    return [item.label, item.helpText, item.type, item.purpose, item.title, item.ariaLabel, item.iconText, ...(item.options || [])].filter(Boolean).join(": ");
  });
}

function flattenWorkflow(entry = {}) {
  return [
    entry.workflow && `Workflow: ${entry.workflow}`,
    ...(entry.steps || []).map((step, index) => `Step ${index + 1}: ${step}`),
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
    controls: Array.isArray(entry.controls) ? entry.controls : [],
    actions: Array.isArray(entry.actions) ? entry.actions : [],
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
  for (const file of files.filter((name) => name.endsWith(".json") && !["knowledge-index.json", "review-queue.json"].includes(name))) {
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
