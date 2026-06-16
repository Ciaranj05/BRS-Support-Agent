import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
const QUEUE_PATH = process.env.BRS_WORKFLOW_EXPLORATION_QUEUE_PATH || path.join(process.cwd(), "data", "workflow-exploration-queue.jsonl");
const AUTO_EXPLORE_ENABLED = process.env.BRS_AUTO_WORKFLOW_EXPLORATION !== "false";
const TEST_CLUB_ID = process.env.BRS_DEMO_CLUB_ID || process.env.BRS_CLUB_ID || process.env.BRS_LOCAL_CLUB_ID || "amysgolfclub";

let pool = null;
let schemaReady = null;

function compact(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalise(value = "") {
  return compact(value).toLowerCase();
}

function inferAllowedTier(question = "") {
  const lower = normalise(question);
  if (/\b(payment provider|gateway|refund|charge|payout|user permission|password|sms|email|delete user|integration)\b/.test(lower)) return "auto-restricted";
  if (/\bsetting|configuration|configure|setup|set up|permission|rate|rule|template\b/.test(lower)) return "read-and-draft-only";
  if (/\bbooking|tee|timesheet|facility|room|resource|buggy|service|hire item\b/.test(lower)) return "safe-test-record-with-rollback";
  return "read-only";
}

async function getPool() {
  if (!DATABASE_URL) return null;
  if (!pool) {
    const { default: pg } = await import("pg");
    const { Pool } = pg;
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensureDatabaseSchema() {
  const db = await getPool();
  if (!db) return;
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS workflow_exploration_queue (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        allowed_tier TEXT NOT NULL DEFAULT 'read-only',
        test_club_id TEXT NOT NULL DEFAULT '',
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_workflow_exploration_queue_status ON workflow_exploration_queue (status, created_at);
    `);
  }
  await schemaReady;
}

async function appendQueueFile(item) {
  await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
  await fs.appendFile(QUEUE_PATH, `${JSON.stringify(item)}\n`);
  return { storage: "file", filePath: QUEUE_PATH, item };
}

export function buildWorkflowExplorationTask({ question = "", reason = "knowledge-gap", topic = null, staticEvidence = "", liveLookup = null } = {}) {
  const cleanedQuestion = compact(question);
  const id = crypto.createHash("sha256").update(`${normalise(cleanedQuestion)}:${reason}`).digest("hex").slice(0, 20);
  const allowedTier = inferAllowedTier(cleanedQuestion);
  return {
    id,
    question: cleanedQuestion,
    reason,
    topic,
    status: AUTO_EXPLORE_ENABLED ? "queued" : "paused",
    allowedTier,
    testClubId: TEST_CLUB_ID,
    automationPolicy: {
      autoExploreEnabled: AUTO_EXPLORE_ENABLED,
      collectAllRoutes: true,
      classifyAliasesAndVariants: true,
      allowWriteActions: ["safe-test-record-with-rollback"].includes(allowedTier),
      requireRollbackVerification: true,
      blockSettingsMutationWithoutSpecificRollback: true,
      blockPaymentsMessagingAndPermissions: true,
    },
    staticEvidence: compact(staticEvidence).slice(0, 4000),
    liveLookupError: liveLookup?.error || null,
    liveLookupMode: liveLookup?.mode || null,
    createdAt: new Date().toISOString(),
  };
}

export async function enqueueWorkflowExploration(input = {}) {
  const task = buildWorkflowExplorationTask(input);
  if (!task.question) return null;
  const db = await getPool();
  if (!db) return appendQueueFile(task);
  await ensureDatabaseSchema();
  const result = await db.query(
    `INSERT INTO workflow_exploration_queue (id, question, status, allowed_tier, test_club_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (id)
     DO UPDATE SET
       status = CASE WHEN workflow_exploration_queue.status = 'completed' THEN workflow_exploration_queue.status ELSE EXCLUDED.status END,
       allowed_tier = EXCLUDED.allowed_tier,
       test_club_id = EXCLUDED.test_club_id,
       payload = EXCLUDED.payload,
       updated_at = NOW()
     RETURNING payload`,
    [task.id, task.question, task.status, task.allowedTier, task.testClubId, JSON.stringify(task)]
  );
  return { storage: "database", filePath: null, item: result.rows[0]?.payload || task };
}
