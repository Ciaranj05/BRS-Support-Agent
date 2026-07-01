import fs from "fs/promises";
import path from "path";
import { prepareEntry } from "./build-knowledge-base.js";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const SOURCE_DIRS = [
  path.join(KNOWLEDGE_DIR, "system"),
  path.join(KNOWLEDGE_DIR, "workflows"),
];

function shouldReadJson(fileName = "") {
  return fileName.endsWith(".json") && !["knowledge-index.json", "review-queue.json"].includes(fileName);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectJsonFiles(dir) {
  if (!await pathExists(dir)) return [];
  const files = await fs.readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      paths.push(...await collectJsonFiles(filePath));
      continue;
    }
    if (shouldReadJson(file.name)) paths.push(filePath);
  }
  return paths;
}

function sanitizeParsedJson(parsed) {
  if (Array.isArray(parsed)) return parsed.map(prepareEntry);
  if (Array.isArray(parsed.entries)) return { ...parsed, entries: parsed.entries.map(prepareEntry) };
  return prepareEntry(parsed);
}

async function main() {
  const files = (await Promise.all(SOURCE_DIRS.map(collectJsonFiles))).flat();
  for (const filePath of files) {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const sanitized = sanitizeParsedJson(parsed);
    await fs.writeFile(filePath, `${JSON.stringify(sanitized, null, 2)}\n`);
  }
  console.log(`Sanitized ${files.length} knowledge source files.`);
}

if (process.argv[1] && process.argv[1].endsWith("sanitize-knowledge-sources.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
