import fs from "fs/promises";
import path from "path";
import { buildReusableWorkflowEntry } from "./liveBrsLookup.js";

const LEARNED_WORKFLOW_DIR = process.env.BRS_LEARNED_WORKFLOW_DIR || path.join(process.cwd(), "knowledge", "workflows", "learned");
const MIN_SUCCESS_SCORE = Number(process.env.BRS_LEARNING_MIN_SCORE || 70);

function safeSlug(value = "workflow") {
  return String(value || "workflow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "workflow";
}

function latestAssistantAnswer(history = []) {
  return [...history].reverse().find((item) => item.role === "assistant" && item.content)?.content || "";
}

function latestUserQuestion(history = []) {
  return [...history].reverse().find((item) => item.role === "user" && item.content && !/^clarification answer:/i.test(item.content))?.content || "";
}

function latestLiveLookup(history = []) {
  return [...history].reverse().find((item) => item.liveLookup?.successful)?.liveLookup || null;
}

function inferIntentFromHistory(history = [], topic = null) {
  const question = latestUserQuestion(history).toLowerCase();
  const task = /report|show|list|see|find|export|download/.test(question) ? "report" : /refund/.test(question) ? "refund" : /create|add|new/.test(question) ? "create" : "support-answer";
  const object = [
    /unpaid|outstanding|overdue/.test(question) && /bill|invoice/.test(question) ? "unpaid membership bills" : null,
    /member|membership/.test(question) ? "membership" : null,
    /payment|transaction|refund/.test(question) ? "payment" : null,
    /booking|tee/.test(question) ? "booking" : null,
    /competition/.test(question) ? "competition" : null,
  ].filter(Boolean).join(", ") || "BRS workflow";
  return { topic, task, object };
}

export async function saveLearnedWorkflowFromResolution({ conversationHistory = [], topic = null, score = 100, resolved = true } = {}) {
  if (!resolved || Number(score) < MIN_SUCCESS_SCORE) return null;
  const liveResult = latestLiveLookup(conversationHistory);
  if (!liveResult?.successful) return null;
  const question = latestUserQuestion(conversationHistory);
  const answer = latestAssistantAnswer(conversationHistory);
  if (!question || !answer) return null;

  const intent = inferIntentFromHistory(conversationHistory, topic);
  const entry = buildReusableWorkflowEntry({ question, answer, intent, liveResult, staticEvidenceUsed: true });
  await fs.mkdir(LEARNED_WORKFLOW_DIR, { recursive: true });
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeSlug(entry.workflow || intent.object)}-${entry.sourceId}.json`;
  const filePath = path.join(LEARNED_WORKFLOW_DIR, fileName);
  await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
  return { filePath, entry };
}
