import fs from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";

const STORE_PATH = path.join(process.cwd(), "data", "qa-interactions.json");
const DATABASE_URL = process.env.DATABASE_URL;
const MAX_INTERACTIONS = Number(process.env.QA_LOG_MAX_INTERACTIONS || 50000);

const EMPTY_STORE = { questions: [], answers: [], interactions: [] };

let pool = null;
let schemaReady = null;
let writeQueue = Promise.resolve();

async function getPool() {
  if (!DATABASE_URL) return null;
  if (!pool) {
    const pg = await import("pg");
    const { Pool } = pg.default || pg;
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

function normaliseText(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function compactText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hashText(value = "") {
  return createHash("sha256").update(normaliseText(value)).digest("hex");
}

function answerHash(value = "") {
  return createHash("sha256").update(compactText(value)).digest("hex");
}

function serialiseMetadata(metadata = {}) {
  return {
    topic: metadata.topic || null,
    version: metadata.version || null,
    routeStrength: metadata.routeStrength || null,
    escalationReady: metadata.escalationReady ?? null,
    optionLabels: Array.isArray(metadata.options) ? metadata.options.map((option) => option?.label).filter(Boolean) : [],
    visualAidIds: Array.isArray(metadata.visualAidIds) ? metadata.visualAidIds.filter(Boolean) : [],
    imageAttachmentCount: Number.isFinite(Number(metadata.imageAttachmentCount)) ? Number(metadata.imageAttachmentCount) : 0,
    imageAttachmentMetadata: Array.isArray(metadata.imageAttachmentMetadata)
      ? metadata.imageAttachmentMetadata.map((attachment) => ({
        type: attachment?.type || "image",
        mimeType: attachment?.mimeType || null,
        filename: attachment?.filename || null,
        sizeBytes: attachment?.sizeBytes || null,
        hash: attachment?.hash || null,
      }))
      : [],
    visionSummary: metadata.visionSummary || "",
    visionError: metadata.visionError || null,
  };
}

async function ensureDatabaseSchema() {
  const db = await getPool();
  if (!db) return;
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS qa_questions (
        id TEXT PRIMARY KEY,
        question_hash TEXT NOT NULL UNIQUE,
        question_text TEXT NOT NULL,
        ask_count INTEGER NOT NULL DEFAULT 1,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS qa_answers (
        id TEXT PRIMARY KEY,
        answer_hash TEXT NOT NULL UNIQUE,
        answer_text TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        use_count INTEGER NOT NULL DEFAULT 1,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS qa_interactions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        conversation_id TEXT,
        question_id TEXT NOT NULL REFERENCES qa_questions(id) ON DELETE CASCADE,
        answer_id TEXT NOT NULL REFERENCES qa_answers(id) ON DELETE CASCADE,
        asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_qa_interactions_asked_at ON qa_interactions (asked_at DESC);
      CREATE INDEX IF NOT EXISTS idx_qa_interactions_question ON qa_interactions (question_id);
      CREATE INDEX IF NOT EXISTS idx_qa_interactions_answer ON qa_interactions (answer_id);
    `);
  }
  await schemaReady;
}

async function ensureStoreFile() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, `${JSON.stringify(EMPTY_STORE, null, 2)}\n`);
  }
}

async function readJsonStore() {
  await ensureStoreFile();
  try {
    const parsed = JSON.parse(await fs.readFile(STORE_PATH, "utf8"));
    return {
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      answers: Array.isArray(parsed.answers) ? parsed.answers : [],
      interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
    };
  } catch (error) {
    console.error("Q&A store read failed:", error);
    return { ...EMPTY_STORE };
  }
}

async function writeJsonStore(store) {
  if (store.interactions.length > MAX_INTERACTIONS) {
    store.interactions = store.interactions.slice(-MAX_INTERACTIONS);
  }
  await fs.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
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

async function recordQaInteractionInDatabase({ sessionId, conversationId, question, answer, metadata = {} }) {
  await ensureDatabaseSchema();
  const db = await getPool();
  const now = new Date().toISOString();
  const questionDigest = hashText(question);
  const answerDigest = answerHash(answer);
  const meta = serialiseMetadata(metadata);
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const questionResult = await client.query(
      `INSERT INTO qa_questions (id, question_hash, question_text)
       VALUES ($1, $2, $3)
       ON CONFLICT (question_hash)
       DO UPDATE SET ask_count = qa_questions.ask_count + 1, last_seen_at = NOW()
       RETURNING *`,
      [randomUUID(), questionDigest, compactText(question)]
    );
    const answerResult = await client.query(
      `INSERT INTO qa_answers (id, answer_hash, answer_text, metadata)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (answer_hash)
       DO UPDATE SET use_count = qa_answers.use_count + 1, last_seen_at = NOW(), metadata = qa_answers.metadata || EXCLUDED.metadata
       RETURNING *`,
      [randomUUID(), answerDigest, compactText(answer), JSON.stringify(meta)]
    );
    const interactionResult = await client.query(
      `INSERT INTO qa_interactions (id, session_id, conversation_id, question_id, answer_id, asked_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        randomUUID(),
        sessionId || "unknown-session",
        conversationId || sessionId || null,
        questionResult.rows[0].id,
        answerResult.rows[0].id,
        now,
        JSON.stringify(meta),
      ]
    );
    await client.query("COMMIT");
    return { question: questionResult.rows[0], answer: answerResult.rows[0], interaction: interactionResult.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recordQaInteraction({ sessionId, conversationId, question, answer, metadata = {} }) {
  const cleanQuestion = compactText(question);
  const cleanAnswer = compactText(answer);
  if (!cleanQuestion || !cleanAnswer) return null;
  if (DATABASE_URL) return recordQaInteractionInDatabase({ sessionId, conversationId, question: cleanQuestion, answer: cleanAnswer, metadata });

  return withJsonStoreUpdate((store) => {
    const now = new Date().toISOString();
    const questionDigest = hashText(cleanQuestion);
    const answerDigest = answerHash(cleanAnswer);
    let questionItem = store.questions.find((item) => item.questionHash === questionDigest);
    if (!questionItem) {
      questionItem = {
        id: randomUUID(),
        questionHash: questionDigest,
        questionText: cleanQuestion,
        askCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
      };
      store.questions.push(questionItem);
    }
    questionItem.askCount += 1;
    questionItem.lastSeenAt = now;

    let answerItem = store.answers.find((item) => item.answerHash === answerDigest);
    if (!answerItem) {
      answerItem = {
        id: randomUUID(),
        answerHash: answerDigest,
        answerText: cleanAnswer,
        metadata: serialiseMetadata(metadata),
        useCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
      };
      store.answers.push(answerItem);
    }
    answerItem.useCount += 1;
    answerItem.lastSeenAt = now;
    answerItem.metadata = { ...(answerItem.metadata || {}), ...serialiseMetadata(metadata) };

    const interaction = {
      id: randomUUID(),
      sessionId: sessionId || "unknown-session",
      conversationId: conversationId || sessionId || null,
      questionId: questionItem.id,
      answerId: answerItem.id,
      askedAt: now,
      metadata: serialiseMetadata(metadata),
    };
    store.interactions.push(interaction);
    return { question: questionItem, answer: answerItem, interaction };
  });
}

function rowToQuestion(row) {
  return {
    id: row.id,
    questionText: row.question_text,
    askCount: row.ask_count,
    firstSeenAt: row.first_seen_at instanceof Date ? row.first_seen_at.toISOString() : row.first_seen_at,
    lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : row.last_seen_at,
  };
}

function rowToAnswer(row) {
  return {
    id: row.id,
    answerText: row.answer_text,
    metadata: row.metadata || {},
    useCount: row.use_count,
    firstSeenAt: row.first_seen_at instanceof Date ? row.first_seen_at.toISOString() : row.first_seen_at,
    lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : row.last_seen_at,
  };
}

function rowToInteraction(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    conversationId: row.conversation_id,
    questionId: row.question_id,
    answerId: row.answer_id,
    askedAt: row.asked_at instanceof Date ? row.asked_at.toISOString() : row.asked_at,
    metadata: row.metadata || {},
  };
}

function normaliseRange({ startAt, endAt } = {}) {
  const range = {};
  if (startAt) {
    const start = new Date(startAt);
    if (!Number.isNaN(start.getTime())) range.startAt = start;
  }
  if (endAt) {
    const end = new Date(endAt);
    if (!Number.isNaN(end.getTime())) range.endAt = end;
  }
  return range;
}

function inRange(value, range = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (range.startAt && date < range.startAt) return false;
  if (range.endAt && date >= range.endAt) return false;
  return true;
}

async function getQaDatasetFromDatabase(options = {}) {
  await ensureDatabaseSchema();
  const db = await getPool();
  const range = normaliseRange(options);
  const conditions = [];
  const values = [];
  if (range.startAt) {
    values.push(range.startAt.toISOString());
    conditions.push(`i.asked_at >= $${values.length}`);
  }
  if (range.endAt) {
    values.push(range.endAt.toISOString());
    conditions.push(`i.asked_at < $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const interactions = await db.query(`
    SELECT i.*
    FROM qa_interactions i
    ${where}
    ORDER BY i.asked_at ASC
  `, values);
  const questionIds = [...new Set(interactions.rows.map((row) => row.question_id))];
  const answerIds = [...new Set(interactions.rows.map((row) => row.answer_id))];
  const [questions, answers] = await Promise.all([
    questionIds.length ? db.query("SELECT * FROM qa_questions WHERE id = ANY($1)", [questionIds]) : { rows: [] },
    answerIds.length ? db.query("SELECT * FROM qa_answers WHERE id = ANY($1)", [answerIds]) : { rows: [] },
  ]);
  return {
    questions: questions.rows.map(rowToQuestion),
    answers: answers.rows.map(rowToAnswer),
    interactions: interactions.rows.map(rowToInteraction),
  };
}

export async function getQaDataset(options = {}) {
  if (DATABASE_URL) return getQaDatasetFromDatabase(options);
  const store = await readJsonStore();
  const range = normaliseRange(options);
  const interactions = store.interactions.filter((interaction) => inRange(interaction.askedAt, range));
  const questionIds = new Set(interactions.map((interaction) => interaction.questionId));
  const answerIds = new Set(interactions.map((interaction) => interaction.answerId));
  return {
    questions: store.questions.filter((question) => questionIds.has(question.id)),
    answers: store.answers.filter((answer) => answerIds.has(answer.id)),
    interactions,
  };
}

export function qaStorageMode() {
  return DATABASE_URL ? "postgres" : "json";
}
