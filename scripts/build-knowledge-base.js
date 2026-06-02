import fs from "fs/promises";
import path from "path";
import { normaliseKnowledgeEntry } from "../lib/knowledgeSources.js";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const OUTPUT_PATH = path.join(KNOWLEDGE_DIR, "knowledge-index.json");

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
  for (const file of files.filter((name) => name.endsWith(".json"))) {
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

async function main() {
  const sources = [
    ...await readJsonFiles(path.join(KNOWLEDGE_DIR, "system")),
    ...await readJsonFiles(path.join(KNOWLEDGE_DIR, "help-center")),
    ...await readManualMarkdown(path.join(KNOWLEDGE_DIR, "manual")),
  ];

  const entries = sources.map(normaliseKnowledgeEntry);
  const reviewQueue = entries.filter((entry) => entry.confidence !== "approved");

  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
  await fs.writeFile(path.join(KNOWLEDGE_DIR, "review-queue.json"), JSON.stringify({ generatedAt: new Date().toISOString(), entries: reviewQueue }, null, 2));
  console.log(`Built knowledge index with ${entries.length} entries. ${reviewQueue.length} entries need review.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
