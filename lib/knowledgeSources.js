import fs from "fs/promises";
import path from "path";

const DEFAULT_INDEX_PATH = path.join(process.cwd(), "knowledge", "knowledge-index.json");

export function tokenize(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2);
}

export function normaliseKnowledgeEntry(entry = {}) {
  const title = entry.title || entry.page || entry.area || "Untitled knowledge entry";
  const body = [entry.summary, entry.purpose, entry.content, ...(entry.helpText || []), ...(entry.fields || []).map((field) => `${field.label}: ${field.helpText || field.type || ""}`), ...(entry.actions || []).map((action) => action.label || action)].filter(Boolean).join("\n");
  return {
    id: entry.id || `${entry.sourceType || "manual"}:${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    sourceType: entry.sourceType || "manual",
    title,
    area: entry.area || null,
    navigationPath: entry.navigationPath || null,
    sourceUrl: entry.sourceUrl || null,
    confidence: entry.confidence || "needs-review",
    lastObservedAt: entry.lastObservedAt || null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    content: body,
  };
}

export async function loadKnowledgeBase(indexPath = DEFAULT_INDEX_PATH) {
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.entries) ? parsed.entries.map(normaliseKnowledgeEntry) : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
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
