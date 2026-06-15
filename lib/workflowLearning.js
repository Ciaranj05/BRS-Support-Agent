import { buildReusableWorkflowEntry } from "./liveBrsLookup.js";
import { saveLearnedWorkflow } from "./learnedWorkflowStore.js";

const MIN_SUCCESS_SCORE = Number(process.env.BRS_LEARNING_MIN_SCORE || 70);
const AUTO_APPROVE_LEARNED_WORKFLOWS = process.env.BRS_LEARNING_AUTO_APPROVE !== "false";

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
  const approvedEntry = AUTO_APPROVE_LEARNED_WORKFLOWS
    ? {
        ...entry,
        confidence: "approved",
        safeForChatbot: true,
        tags: [...new Set([...(entry.tags || []), "auto-approved-successful-resolution"])],
      }
    : entry;
  return saveLearnedWorkflow(approvedEntry);
}
