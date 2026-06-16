import { buildReusableWorkflowEntry } from "./liveBrsLookup.js";
import { saveLearnedWorkflow } from "./learnedWorkflowStore.js";
import { buildWorkflowFamilyEntry } from "./workflowFamily.js";

const MIN_SUCCESS_SCORE = Number(process.env.BRS_LEARNING_MIN_SCORE || 70);
const AUTO_APPROVE_LEARNED_WORKFLOWS = process.env.BRS_LEARNING_AUTO_APPROVE !== "false";
const STORE_APPROVED_STATIC_ANSWERS = process.env.BRS_LEARNING_STORE_APPROVED_STATIC !== "false";

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
  const question = latestUserQuestion(conversationHistory);
  const answer = latestAssistantAnswer(conversationHistory);
  if (!question || !answer) return null;
  if (!liveResult?.successful && !STORE_APPROVED_STATIC_ANSWERS) return null;

  const intent = inferIntentFromHistory(conversationHistory, topic);
  const evidenceResult = liveResult?.successful
    ? liveResult
    : {
        successful: true,
        pages: [{
          title: "User-approved support answer",
          headings: [intent.object || intent.topic || "BRS support answer"],
          breadcrumbs: [],
          controls: [],
          tableHeaders: [],
          captions: [],
        }],
      };
  const entry = buildReusableWorkflowEntry({ question, answer, intent, liveResult: evidenceResult, staticEvidenceUsed: !liveResult?.successful });
  const familyEntry = buildWorkflowFamilyEntry({
    question,
    answer,
    intent,
    routes: entry.routes || [],
    evidencePages: evidenceResult.pages || [],
    source: liveResult?.successful ? "live-evidence-approved-answer" : "static-knowledge-approved-answer",
    explorationStatus: liveResult?.successful ? "observed-live-and-resolved" : "resolved-from-approved-static-knowledge",
  });
  const learningSourceTag = liveResult?.successful ? "live-evidence-approved-answer" : "static-knowledge-approved-answer";
  const approvedEntry = AUTO_APPROVE_LEARNED_WORKFLOWS
    ? {
        ...entry,
        summary: liveResult?.successful
          ? entry.summary
          : "Reusable workflow learned from a successfully resolved support conversation using approved static knowledge. Generate a fresh answer from this evidence rather than reusing the original wording.",
        confidence: "approved",
        safeForChatbot: true,
        tags: [...new Set([...(entry.tags || []), "auto-approved-successful-resolution", learningSourceTag])],
      }
    : entry;
  const learnedWorkflow = await saveLearnedWorkflow(approvedEntry);
  const learnedFamily = await saveLearnedWorkflow({
    ...familyEntry,
    tags: [...new Set([...(familyEntry.tags || []), "auto-approved-successful-resolution", learningSourceTag])],
  });
  return { ...learnedWorkflow, workflowFamily: learnedFamily };
}
