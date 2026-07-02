import fs from "fs/promises";
import path from "path";
import { analyzeAnswerCoverage } from "../lib/answerCoverageAnalysis.js";

const REVIEW_RUN_DIR = path.join(process.cwd(), "data", "review-driver-runs");
const OUTPUT_DIR = path.join(process.cwd(), "data", "answer-coverage");

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function latestReviewRunPath() {
  if (!await pathExists(REVIEW_RUN_DIR)) throw new Error(`Missing review-driver run directory: ${REVIEW_RUN_DIR}`);
  const files = (await fs.readdir(REVIEW_RUN_DIR))
    .filter((file) => /review-driver-run\.json$/i.test(file))
    .sort();
  if (!files.length) throw new Error("No review-driver-run.json files found. Run scripts/drive-review-entry-workflows.js first.");
  return path.join(REVIEW_RUN_DIR, files.at(-1));
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : await latestReviewRunPath();
  const reviewRun = JSON.parse(await fs.readFile(inputPath, "utf-8"));
  const report = await analyzeAnswerCoverage({ reviewRun });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const outputPath = path.join(OUTPUT_DIR, `${stamp}-answer-coverage.json`);
  await fs.writeFile(outputPath, JSON.stringify({
    ...report,
    sourceReviewRunPath: path.relative(process.cwd(), inputPath),
  }, null, 2));
  console.log(JSON.stringify({
    outputPath: path.relative(process.cwd(), outputPath),
    summary: report.summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
