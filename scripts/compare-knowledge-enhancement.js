import fs from "fs/promises";
import path from "path";

const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts");
const DATA_FILES = ["memberships", "contacts", "payments", "reports", "competitions", "tools"];

async function latestSnapshotRoot() {
  const dirs = (await fs.readdir(ARTIFACTS_DIR, { withFileTypes: true }))
    .filter((item) => item.isDirectory() && item.name.startsWith("knowledge-enhancement-"))
    .map((item) => item.name)
    .sort();
  if (!dirs.length) throw new Error("No knowledge-enhancement snapshot found.");
  return path.join(ARTIFACTS_DIR, dirs.at(-1));
}

function extractPriorityBlock(content = "") {
  const match = content.match(/Priority answer cues:\r?\n([\s\S]*?)(?=\r?\n## )/);
  return match ? match[1].trim() : "";
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function main() {
  const root = await latestSnapshotRoot();
  const changedFiles = [];
  for (const file of DATA_FILES) {
    const before = await fs.readFile(path.join(root, "data-knowledge-before", `${file}.txt`), "utf8");
    const after = await fs.readFile(path.join(process.cwd(), "data", "knowledge", `${file}.txt`), "utf8");
    changedFiles.push({
      file: `data/knowledge/${file}.txt`,
      beforeHadPriority: Boolean(extractPriorityBlock(before)),
      afterPriorityLines: extractPriorityBlock(after).split(/\r?\n/).filter(Boolean),
    });
  }

  const beforeIndex = await readJsonIfExists(path.join(root, "knowledge-index-before.json"));
  const afterIndex = await readJsonIfExists(path.join(process.cwd(), "knowledge", "knowledge-index.json"));
  const beforeTitles = new Set((beforeIndex.entries || []).map((entry) => entry.title));
  const newEntries = (afterIndex.entries || [])
    .filter((entry) => !beforeTitles.has(entry.title))
    .map((entry) => ({
      title: entry.title,
      type: entry.sourceType,
      confidence: entry.confidence,
      preview: String(entry.content || "").replace(/\s+/g, " ").slice(0, 220),
    }));

  const manualFiles = (await fs.readdir(path.join(process.cwd(), "knowledge", "manual")))
    .filter((file) => file.includes("case-evidence"))
    .sort();

  const lines = [
    "# Knowledge Base Comparison",
    "",
    `Snapshot: ${path.relative(process.cwd(), root)}`,
    "",
    `Before index entries: ${(beforeIndex.entries || []).length}`,
    `After index entries: ${(afterIndex.entries || []).length}`,
    "",
    `New manual evidence files: ${manualFiles.length}`,
    ...manualFiles.map((file) => `- knowledge/manual/${file}`),
    "",
    "## Active data/knowledge priority cues",
    ...changedFiles.flatMap((item) => [
      "",
      `### ${item.file}`,
      `Before had priority cue block: ${item.beforeHadPriority ? "yes" : "no"}`,
      ...item.afterPriorityLines,
    ]),
    "",
    "## New indexed titles",
    ...newEntries.map((entry) => `- ${entry.title} (${entry.type}, ${entry.confidence})`),
  ];

  const outputPath = path.join(root, "knowledge-comparison.md");
  await fs.writeFile(outputPath, `${lines.join("\n")}\n`);
  console.log(JSON.stringify({
    outputPath,
    beforeEntries: (beforeIndex.entries || []).length,
    afterEntries: (afterIndex.entries || []).length,
    changedFiles: changedFiles.map((item) => item.file),
    newEntries: newEntries.map((entry) => entry.title),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
