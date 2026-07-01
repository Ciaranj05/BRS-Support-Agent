import fs from "fs/promises";
import path from "path";
import {
  buildDriverQuestion,
  classifyReviewEntriesForDrivers,
  summarizeDriverAssignments,
} from "../lib/reviewEntryDrivers.js";

const REVIEW_QUEUE_PATH = process.env.BRS_REVIEW_QUEUE_PATH || path.join(process.cwd(), "knowledge", "review-queue.json");
const OUTPUT_DIR = process.env.BRS_REVIEW_DRIVER_OUTPUT_DIR || path.join(process.cwd(), "data", "review-driver-runs");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");

async function readReviewQueue() {
  const raw = await fs.readFile(REVIEW_QUEUE_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.entries) ? parsed.entries : [];
}

function buildTask(assignment = {}) {
  return {
    id: assignment.entryId,
    question: buildDriverQuestion(assignment),
    title: assignment.title,
    area: assignment.area,
    reviewReason: assignment.reviewReason,
    driverFamily: assignment.driverFamily,
    allowedTier: assignment.driverTier,
    status: assignment.driverStatus,
    safeMutationAllowed: assignment.safeMutationAllowed,
    requiresRollback: assignment.requiresRollback,
    blockReason: assignment.driverStatus === "blocked" ? assignment.reason : null,
    policy: {
      allowWriteActions: assignment.safeMutationAllowed,
      requireRollbackVerification: assignment.requiresRollback,
      blockSettingsMutationWithoutSpecificRollback: true,
      blockPaymentsMessagingUsersImports: true,
    },
  };
}

async function main() {
  const entries = await readReviewQueue();
  const assignments = classifyReviewEntriesForDrivers(entries);
  const summary = summarizeDriverAssignments(assignments);
  const tasks = assignments.map(buildTask);
  const output = {
    generatedAt: new Date().toISOString(),
    sourceReviewQueue: path.relative(process.cwd(), REVIEW_QUEUE_PATH),
    mode: "classification-and-queue",
    note: "This runner processes every review entry through a safety tier. It does not perform high-risk writes. Queued safe-test entries still require a workflow-specific driver that verifies rollback before promotion.",
    summary,
    tasks,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, `${RUN_ID}-review-driver-run.json`);
  const jsonlPath = path.join(OUTPUT_DIR, `${RUN_ID}-review-driver-tasks.jsonl`);
  await fs.writeFile(jsonPath, `${JSON.stringify(output, null, 2)}\n`);
  await fs.writeFile(jsonlPath, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);

  console.log(JSON.stringify({
    jsonPath: path.relative(process.cwd(), jsonPath),
    jsonlPath: path.relative(process.cwd(), jsonlPath),
    summary,
  }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("drive-review-entry-workflows.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
