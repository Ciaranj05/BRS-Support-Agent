import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import pg from "pg";

const { Pool } = pg;
const STORE_PATH = path.join(process.cwd(), "data", "feedback-store.json");
const EMPTY_STORE = { resolvedInteractions: [], surveyResponses: [] };
const DATABASE_URL = process.env.DATABASE_URL;
let writeQueue = Promise.resolve();
let pool = null;
let schemaReady = null;

function getPool() {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensureDatabaseSchema() {
  const db = getPool();
  if (!db) return;
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS resolved_interactions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        conversation_id TEXT,
        topic TEXT,
        resolved_by TEXT NOT NULL DEFAULT 'user',
        resolved BOOLEAN NOT NULL DEFAULT TRUE,
        escalated BOOLEAN NOT NULL DEFAULT FALSE,
        comment TEXT NOT NULL DEFAULT '',
        resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb
      );

      CREATE TABLE IF NOT EXISTS survey_responses (
        id TEXT PRIMARY KEY,
        resolved_interaction_id TEXT NOT NULL REFERENCES resolved_interactions(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        conversation_id TEXT,
        type TEXT NOT NULL DEFAULT 'resolution-score',
        score INTEGER NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (resolved_interaction_id)
      );

      CREATE INDEX IF NOT EXISTS idx_resolved_interactions_resolved_at ON resolved_interactions(resolved_at DESC);
      CREATE INDEX IF NOT EXISTS idx_survey_responses_score ON survey_responses(score);
      CREATE TABLE IF NOT EXISTS app_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    schemaReady = schemaReady.then(() => db.query(`
      ALTER TABLE resolved_interactions ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE resolved_interactions ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE resolved_interactions ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT '';
      ALTER TABLE survey_responses DROP CONSTRAINT IF EXISTS survey_responses_score_check;
      ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_score_check CHECK (score >= 0 AND score <= 100);
    `));
    schemaReady = schemaReady.then(() => db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM app_schema_migrations WHERE id = 'survey_score_percent_v1') THEN
          UPDATE survey_responses SET score = score * 10 WHERE score >= 0 AND score <= 10;
          INSERT INTO app_schema_migrations (id) VALUES ('survey_score_percent_v1');
        END IF;
      END $$;
    `));
  }
  await schemaReady;
}

async function ensureStoreFile() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(EMPTY_STORE, null, 2));
  }
}

async function readJsonStore() {
  await ensureStoreFile();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      resolvedInteractions: Array.isArray(parsed.resolvedInteractions) ? parsed.resolvedInteractions : [],
      surveyResponses: Array.isArray(parsed.surveyResponses) ? parsed.surveyResponses : [],
    };
  } catch (error) {
    console.error("Feedback store read failed:", error);
    return { ...EMPTY_STORE };
  }
}

async function writeJsonStore(store) {
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

function withJsonStoreUpdate(updateFn) {
  const nextWrite = writeQueue.catch(() => {}).then(async () => {
    const store = await readJsonStore();
    const result = await updateFn(store);
    await writeJsonStore(store);
    return result;
  });
  writeQueue = nextWrite.catch(() => {});
  return nextWrite;
}

function normaliseScore(score) {
  const value = Number(score);
  if (!Number.isInteger(value) || value < 0 || value > 100 || value % 10 !== 0) {
    const error = new Error("Survey score must be 0%, 10%, 20%, up to 100%.");
    error.status = 400;
    throw error;
  }
  return value;
}

function serialiseHistory(history = []) {
  return Array.isArray(history)
    ? history.slice(-20).map((item) => ({ role: item.role, content: item.content }))
    : [];
}

function normaliseDateRange({ startDate, endDate } = {}) {
  const range = {};
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) range.startDate = start;
  }
  if (endDate) {
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (!Number.isNaN(end.getTime())) {
      end.setUTCDate(end.getUTCDate() + 1);
      range.endDate = end;
    }
  }
  return range;
}

function dateInRange(value, range) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (range.startDate && date < range.startDate) return false;
  if (range.endDate && date >= range.endDate) return false;
  return true;
}

function buildResolvedDateWhere(range) {
  const conditions = [];
  const values = [];
  if (range.startDate) {
    values.push(range.startDate.toISOString());
    conditions.push(`ri.resolved_at >= $${values.length}`);
  }
  if (range.endDate) {
    values.push(range.endDate.toISOString());
    conditions.push(`ri.resolved_at < $${values.length}`);
  }
  return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

function rowToResolvedInteraction(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    conversationId: row.conversation_id,
    topic: row.topic,
    resolvedBy: row.resolved_by,
    resolved: row.resolved ?? true,
    escalated: row.escalated ?? false,
    comment: row.comment || "",
    resolvedAt: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : row.resolved_at,
    conversationHistory: row.conversation_history || [],
  };
}

function rowToSurveyResponse(row) {
  return {
    id: row.id,
    resolvedInteractionId: row.resolved_interaction_id,
    sessionId: row.session_id,
    conversationId: row.conversation_id,
    type: row.type,
    score: row.score,
    comment: row.comment || "",
    submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at,
  };
}

async function recordResolvedInteractionInDatabase({ sessionId, conversationId, resolvedBy = "user", topic = null, resolved = true, escalated = false, comment = "", conversationHistory = [] }) {
  await ensureDatabaseSchema();
  const db = getPool();
  const id = randomUUID();
  const history = serialiseHistory(conversationHistory);
  const result = await db.query(
    `INSERT INTO resolved_interactions (id, session_id, conversation_id, topic, resolved_by, resolved, escalated, comment, conversation_history)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [id, sessionId || "unknown-session", conversationId || sessionId || null, topic, resolvedBy, Boolean(resolved), Boolean(escalated), String(comment || "").trim(), JSON.stringify(history)]
  );
  return rowToResolvedInteraction(result.rows[0]);
}

async function recordSurveyScoreInDatabase({ resolvedInteractionId, sessionId, conversationId, score, type = "resolution-score", comment = "", topic = null, conversationHistory = [] }) {
  await ensureDatabaseSchema();
  const db = getPool();
  const surveyScore = normaliseScore(score);
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    let resolvedInteraction = null;

    if (resolvedInteractionId) {
      const existing = await client.query("SELECT * FROM resolved_interactions WHERE id = $1", [resolvedInteractionId]);
      resolvedInteraction = existing.rows[0] || null;
    }

    if (!resolvedInteraction) {
      const created = await client.query(
        `INSERT INTO resolved_interactions (id, session_id, conversation_id, topic, resolved_by, resolved, escalated, conversation_history)
         VALUES ($1, $2, $3, $4, 'user', TRUE, FALSE, $5::jsonb)
         RETURNING *`,
        [randomUUID(), sessionId || "unknown-session", conversationId || sessionId || null, topic, JSON.stringify(serialiseHistory(conversationHistory))]
      );
      resolvedInteraction = created.rows[0];
    }

    const response = await client.query(
      `INSERT INTO survey_responses (id, resolved_interaction_id, session_id, conversation_id, type, score, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (resolved_interaction_id)
       DO UPDATE SET type = EXCLUDED.type, score = EXCLUDED.score, comment = EXCLUDED.comment, submitted_at = NOW()
       RETURNING *`,
      [
        randomUUID(),
        resolvedInteraction.id,
        resolvedInteraction.session_id,
        resolvedInteraction.conversation_id,
        type,
        surveyScore,
        String(comment || "").trim(),
      ]
    );

    await client.query("COMMIT");
    return {
      resolvedInteraction: rowToResolvedInteraction(resolvedInteraction),
      surveyResponse: rowToSurveyResponse(response.rows[0]),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getSurveyMetricsFromDatabase(options = {}) {
  await ensureDatabaseSchema();
  const db = getPool();
  const range = normaliseDateRange(options);
  const filter = buildResolvedDateWhere(range);
  const [totals, scores, recent] = await Promise.all([
    db.query(`
      SELECT
        COUNT(ri.id)::int AS total_queries,
        COUNT(*) FILTER (WHERE ri.resolved)::int AS total_resolved,
        COUNT(*) FILTER (WHERE NOT ri.resolved)::int AS total_not_resolved,
        COUNT(*) FILTER (WHERE ri.escalated)::int AS total_escalated,
        COUNT(sr.id)::int AS total_survey_responses,
        ROUND(AVG(sr.score)::numeric, 2)::float AS average_score
      FROM resolved_interactions ri
      LEFT JOIN survey_responses sr ON sr.resolved_interaction_id = ri.id
      ${filter.clause}
    `, filter.values),
    db.query(`
      SELECT sr.score, COUNT(*)::int AS count
      FROM resolved_interactions ri
      JOIN survey_responses sr ON sr.resolved_interaction_id = ri.id
      ${filter.clause}
      GROUP BY sr.score
    `, filter.values),
    db.query(`
      SELECT
        ri.id AS resolved_interaction_id,
        ri.session_id,
        ri.conversation_id,
        ri.topic,
        ri.resolved,
        ri.escalated,
        ri.comment AS outcome_comment,
        ri.resolved_at,
        sr.score,
        sr.comment,
        sr.submitted_at
      FROM resolved_interactions ri
      LEFT JOIN survey_responses sr ON sr.resolved_interaction_id = ri.id
      ${filter.clause}
      ORDER BY ri.resolved_at DESC
      LIMIT 50
    `, filter.values),
  ]);

  const totalQueries = totals.rows[0]?.total_queries || 0;
  const totalResolved = totals.rows[0]?.total_resolved || 0;
  const totalNotResolved = totals.rows[0]?.total_not_resolved || 0;
  const totalEscalated = totals.rows[0]?.total_escalated || 0;
  const totalSurveyResponses = totals.rows[0]?.total_survey_responses || 0;
  const scoreCounts = Object.fromEntries(Array.from({ length: 11 }, (_, index) => [String(index * 10), 0]));
  for (const row of scores.rows) scoreCounts[String(row.score)] = row.count;

  return {
    totalQueries,
    totalResolved,
    totalNotResolved,
    totalEscalated,
    totalSurveyResponses,
    responseRate: totalResolved ? totalSurveyResponses / totalResolved : 0,
    resolutionRate: totalQueries ? totalResolved / totalQueries : 0,
    averageScore: totals.rows[0]?.average_score ?? null,
    scoreCounts,
    recentResponses: recent.rows.map((row) => ({
      resolvedInteractionId: row.resolved_interaction_id,
      sessionId: row.session_id,
      conversationId: row.conversation_id,
      topic: row.topic,
      resolved: row.resolved ?? true,
      escalated: row.escalated ?? false,
      outcomeComment: row.outcome_comment || "",
      resolvedAt: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : row.resolved_at,
      score: row.score ?? null,
      comment: row.comment || "",
      submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at,
    })),
  };
}

export async function recordResolvedInteraction(payload) {
  if (getPool()) return recordResolvedInteractionInDatabase(payload);
  return withJsonStoreUpdate((store) => {
    const now = new Date().toISOString();
    const resolvedInteraction = {
      id: randomUUID(),
      sessionId: payload.sessionId || "unknown-session",
      conversationId: payload.conversationId || payload.sessionId || null,
      topic: payload.topic || null,
      resolvedBy: payload.resolvedBy || "user",
      resolved: payload.resolved ?? true,
      escalated: payload.escalated ?? false,
      comment: String(payload.comment || "").trim(),
      resolvedAt: now,
      conversationHistory: serialiseHistory(payload.conversationHistory),
    };
    store.resolvedInteractions.push(resolvedInteraction);
    return resolvedInteraction;
  });
}

export async function recordSurveyScore(payload) {
  if (getPool()) return recordSurveyScoreInDatabase(payload);
  const surveyScore = normaliseScore(payload.score);
  return withJsonStoreUpdate((store) => {
    const now = new Date().toISOString();
    let resolvedInteraction = payload.resolvedInteractionId
      ? store.resolvedInteractions.find((item) => item.id === payload.resolvedInteractionId)
      : null;

    if (!resolvedInteraction) {
      resolvedInteraction = {
        id: randomUUID(),
        sessionId: payload.sessionId || "unknown-session",
        conversationId: payload.conversationId || payload.sessionId || null,
        topic: payload.topic || null,
        resolvedBy: "user",
        resolved: true,
        escalated: false,
        comment: "",
        resolvedAt: now,
        conversationHistory: serialiseHistory(payload.conversationHistory),
      };
      store.resolvedInteractions.push(resolvedInteraction);
    }

    const existing = store.surveyResponses.find((item) => item.resolvedInteractionId === resolvedInteraction.id);
    const response = {
      id: existing?.id || randomUUID(),
      resolvedInteractionId: resolvedInteraction.id,
      sessionId: resolvedInteraction.sessionId,
      conversationId: resolvedInteraction.conversationId,
      type: payload.type || "resolution-score",
      score: surveyScore,
      comment: String(payload.comment || "").trim(),
      submittedAt: now,
    };

    if (existing) Object.assign(existing, response);
    else store.surveyResponses.push(response);

    return { resolvedInteraction, surveyResponse: response };
  });
}

export async function getSurveyMetrics(options = {}) {
  if (getPool()) return getSurveyMetricsFromDatabase(options);

  const store = await readJsonStore();
  const range = normaliseDateRange(options);
  const filteredInteractions = store.resolvedInteractions.filter((interaction) => dateInRange(interaction.resolvedAt, range));
  const filteredInteractionIds = new Set(filteredInteractions.map((interaction) => interaction.id));
  const filteredResponses = store.surveyResponses.filter((response) => filteredInteractionIds.has(response.resolvedInteractionId));
  const totalQueries = filteredInteractions.length;
  const totalResolved = filteredInteractions.filter((interaction) => interaction.resolved !== false).length;
  const totalNotResolved = filteredInteractions.filter((interaction) => interaction.resolved === false).length;
  const totalEscalated = filteredInteractions.filter((interaction) => interaction.escalated === true).length;
  const totalSurveyResponses = filteredResponses.length;
  const scoreCounts = Object.fromEntries(Array.from({ length: 11 }, (_, index) => [String(index * 10), 0]));
  let scoreTotal = 0;

  for (const response of filteredResponses) {
    if (Number.isInteger(response.score) && Object.hasOwn(scoreCounts, String(response.score))) {
      scoreCounts[String(response.score)] += 1;
      scoreTotal += response.score;
    }
  }

  const responsesByInteraction = new Map(filteredResponses.map((response) => [response.resolvedInteractionId, response]));
  const recentResponses = filteredInteractions
    .slice()
    .reverse()
    .slice(0, 50)
    .map((interaction) => {
      const response = responsesByInteraction.get(interaction.id);
      return {
        resolvedInteractionId: interaction.id,
        sessionId: interaction.sessionId,
        conversationId: interaction.conversationId,
        topic: interaction.topic,
        resolved: interaction.resolved ?? true,
        escalated: interaction.escalated ?? false,
        outcomeComment: interaction.comment || "",
        resolvedAt: interaction.resolvedAt,
        score: response?.score ?? null,
        comment: response?.comment || "",
        submittedAt: response?.submittedAt || null,
      };
    });

  return {
    totalQueries,
    totalResolved,
    totalNotResolved,
    totalEscalated,
    totalSurveyResponses,
    responseRate: totalResolved ? totalSurveyResponses / totalResolved : 0,
    resolutionRate: totalQueries ? totalResolved / totalQueries : 0,
    averageScore: totalSurveyResponses ? Number((scoreTotal / totalSurveyResponses).toFixed(2)) : null,
    scoreCounts,
    recentResponses,
  };
}
