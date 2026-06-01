import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const STORE_PATH = path.join(process.cwd(), "data", "feedback-store.json");
const EMPTY_STORE = { resolvedInteractions: [], surveyResponses: [] };
let writeQueue = Promise.resolve();

async function ensureStoreFile() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(EMPTY_STORE, null, 2));
  }
}

async function readStore() {
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

async function writeStore(store) {
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

function withStoreUpdate(updateFn) {
  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    const result = await updateFn(store);
    await writeStore(store);
    return result;
  });
  return writeQueue;
}

function normaliseScore(score) {
  const value = Number(score);
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    const error = new Error("Survey score must be an integer from 0 to 10.");
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

export async function recordResolvedInteraction({ sessionId, conversationId, resolvedBy = "user", topic = null, conversationHistory = [] }) {
  return withStoreUpdate((store) => {
    const now = new Date().toISOString();
    const resolvedInteraction = {
      id: randomUUID(),
      sessionId: sessionId || "unknown-session",
      conversationId: conversationId || sessionId || null,
      topic,
      resolvedBy,
      resolvedAt: now,
      conversationHistory: serialiseHistory(conversationHistory),
    };
    store.resolvedInteractions.push(resolvedInteraction);
    return resolvedInteraction;
  });
}

export async function recordSurveyScore({ resolvedInteractionId, sessionId, conversationId, score, type = "resolution-score", comment = "", topic = null, conversationHistory = [] }) {
  const surveyScore = normaliseScore(score);
  return withStoreUpdate((store) => {
    const now = new Date().toISOString();
    let resolvedInteraction = resolvedInteractionId
      ? store.resolvedInteractions.find((item) => item.id === resolvedInteractionId)
      : null;

    if (!resolvedInteraction) {
      resolvedInteraction = {
        id: randomUUID(),
        sessionId: sessionId || "unknown-session",
        conversationId: conversationId || sessionId || null,
        topic,
        resolvedBy: "user",
        resolvedAt: now,
        conversationHistory: serialiseHistory(conversationHistory),
      };
      store.resolvedInteractions.push(resolvedInteraction);
    }

    const existing = store.surveyResponses.find((item) => item.resolvedInteractionId === resolvedInteraction.id);
    const response = {
      id: existing?.id || randomUUID(),
      resolvedInteractionId: resolvedInteraction.id,
      sessionId: resolvedInteraction.sessionId,
      conversationId: resolvedInteraction.conversationId,
      type,
      score: surveyScore,
      comment: String(comment || "").trim(),
      submittedAt: now,
    };

    if (existing) Object.assign(existing, response);
    else store.surveyResponses.push(response);

    return { resolvedInteraction, surveyResponse: response };
  });
}

export async function getSurveyMetrics() {
  const store = await readStore();
  const totalResolved = store.resolvedInteractions.length;
  const totalSurveyResponses = store.surveyResponses.length;
  const scoreCounts = Object.fromEntries(Array.from({ length: 11 }, (_, score) => [String(score), 0]));
  let scoreTotal = 0;

  for (const response of store.surveyResponses) {
    if (Number.isInteger(response.score) && response.score >= 0 && response.score <= 10) {
      scoreCounts[String(response.score)] += 1;
      scoreTotal += response.score;
    }
  }

  const responsesByInteraction = new Map(store.surveyResponses.map((response) => [response.resolvedInteractionId, response]));
  const recentResponses = store.resolvedInteractions
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
        resolvedAt: interaction.resolvedAt,
        score: response?.score ?? null,
        comment: response?.comment || "",
        submittedAt: response?.submittedAt || null,
      };
    });

  return {
    totalResolved,
    totalSurveyResponses,
    responseRate: totalResolved ? totalSurveyResponses / totalResolved : 0,
    averageScore: totalSurveyResponses ? Number((scoreTotal / totalSurveyResponses).toFixed(2)) : null,
    scoreCounts,
    recentResponses,
  };
}
