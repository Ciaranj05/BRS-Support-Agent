import { recordResolvedInteraction, recordSurveyScore } from "../../feedbackStore.js";
import { saveLearnedWorkflowFromResolution } from "../../lib/workflowLearning.js";

function learnedWorkflowSummary(learnedWorkflow) {
  if (!learnedWorkflow) return null;
  return {
    storage: learnedWorkflow.storage,
    filePath: learnedWorkflow.filePath,
    sourceId: learnedWorkflow.entry?.sourceId,
  };
}

export async function recordResolvedInteractionWithLearning({ sessionId, payload }) {
  const conversationHistory = payload?.conversationHistory || [];
  const resolvedInteraction = await recordResolvedInteraction({
    sessionId,
    conversationId: payload?.conversationId,
    resolvedBy: payload?.resolvedBy || "user",
    topic: payload?.topic || null,
    resolved: payload?.resolved ?? true,
    escalated: payload?.escalated ?? false,
    comment: payload?.comment || "",
    conversationHistory,
  });
  const learnedWorkflow = await saveLearnedWorkflowFromResolution({
    conversationHistory,
    topic: payload?.topic || null,
    resolved: payload?.resolved ?? true,
    score: 100,
  }).catch((error) => {
    console.error("Workflow learning from resolved interaction failed:", error);
    return null;
  });
  return { resolvedInteraction, learnedWorkflow: learnedWorkflowSummary(learnedWorkflow) };
}

export async function recordSurveyScoreWithLearning({ sessionId, payload }) {
  const conversationHistory = payload?.conversationHistory || [];
  const result = await recordSurveyScore({
    resolvedInteractionId: payload?.resolvedInteractionId,
    sessionId,
    conversationId: payload?.conversationId,
    score: payload?.score,
    type: payload?.type || "resolution-score",
    comment: payload?.comment || "",
    topic: payload?.topic || null,
    conversationHistory,
  });
  const learnedWorkflow = await saveLearnedWorkflowFromResolution({
    conversationHistory,
    topic: payload?.topic || null,
    resolved: Number(payload?.score) >= 70,
    score: payload?.score,
  }).catch((error) => {
    console.error("Workflow learning from survey feedback failed:", error);
    return null;
  });
  return { ...result, learnedWorkflow: learnedWorkflowSummary(learnedWorkflow) };
}
