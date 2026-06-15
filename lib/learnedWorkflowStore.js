import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { normaliseKnowledgeEntry } from "./knowledgeSources.js";

const DATABASE_URL = process.env.DATABASE_URL;
const LEARNED_WORKFLOW_DIR = process.env.BRS_LEARNED_WORKFLOW_DIR || path.join(process.cwd(), "knowledge", "workflows");
const MAX_LEARNED_WORKFLOWS = Number(process.env.BRS_MAX_LEARNED_WORKFLOWS || 80);

let pool = null;
let schemaReady = null;

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
      CREATE TABLE IF NOT EXISTS learned_workflows (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL UNIQUE,
        question TEXT NOT NULL DEFAULT '',
        workflow TEXT NOT NULL DEFAULT '',
        topic TEXT,
        confidence TEXT NOT NULL DEFAULT 'approved',
        safe_for_chatbot BOOLEAN NOT NULL DEFAULT TRUE,
        entry JSONB NOT NULL,
        times_seen INTEGER NOT NULL DEFAULT 1,
        learned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_learned_workflows_safe ON learned_workflows (safe_for_chatbot, confidence);
      CREATE INDEX IF NOT EXISTS idx_learned_workflows_last_used ON learned_workflows (last_used_at DESC);
    `);
  }
  await schemaReady;
}

function fallbackFileName(entry = {}) {
  const workflow = String(entry.workflow || "workflow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "workflow";
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${workflow}-${entry.sourceId || "learned"}.json`;
}

async function saveLearnedWorkflowToFile(entry = {}) {
  await fs.mkdir(LEARNED_WORKFLOW_DIR, { recursive: true });
  const filePath = path.join(LEARNED_WORKFLOW_DIR, fallbackFileName(entry));
  await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
  return { storage: "file", filePath, entry };
}

export async function saveLearnedWorkflow(entry = {}) {
  const db = await getPool();
  if (!db) return saveLearnedWorkflowToFile(entry);
  await ensureDatabaseSchema();
  const id = entry.sourceId || randomUUID();
  const result = await db.query(
    `INSERT INTO learned_workflows (id, source_id, question, workflow, topic, confidence, safe_for_chatbot, entry)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (source_id)
     DO UPDATE SET
       entry = EXCLUDED.entry,
       question = EXCLUDED.question,
       workflow = EXCLUDED.workflow,
       topic = EXCLUDED.topic,
       confidence = EXCLUDED.confidence,
       safe_for_chatbot = EXCLUDED.safe_for_chatbot,
       times_seen = learned_workflows.times_seen + 1,
       last_used_at = NOW()
     RETURNING entry`,
    [
      id,
      entry.sourceId || id,
      entry.userNeed || "",
      entry.workflow || "",
      entry.area || null,
      entry.confidence || "approved",
      entry.safeForChatbot !== false,
      JSON.stringify(entry),
    ]
  );
  return { storage: "database", filePath: null, entry: result.rows[0]?.entry || entry };
}

export async function loadApprovedLearnedWorkflows({ limit = MAX_LEARNED_WORKFLOWS } = {}) {
  const db = await getPool();
  if (!db) return [];
  await ensureDatabaseSchema();
  const result = await db.query(
    `SELECT entry
     FROM learned_workflows
     WHERE safe_for_chatbot = TRUE AND confidence = 'approved'
     ORDER BY last_used_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => normaliseKnowledgeEntry(row.entry));
}
