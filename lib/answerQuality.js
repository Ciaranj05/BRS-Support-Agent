const VAGUE_WORKFLOW_PATTERNS = [
  /\bfollow the prompts\b/i,
  /\bdepending on the club'?s interface\b/i,
  /\bsimilar privilege-related fields\b/i,
  /\bor similar\b/i,
  /\bor a similar (action|option|button|link|control|field)\b/i,
  /\bavailable fields\b/i,
  /\bas prompted by the system\b/i,
  /\bif available\b/i,
  /\bif shown\b/i,
  /\bmay be\b/i,
  /\blikely\b/i,
  /\busually\b/i,
  /\bcomplete the required fields\b/i,
  /\bcomplete the required [a-z ]*fields\b/i,
  /\bclub-specific .*details\b/i,
  /\brelevant fields\b/i,
  /\blook for\b/i,
];

const WORKFLOW_QUESTION_PATTERN = /\b(how|where|which|what|show|see|find|list|report|filter|export|download|add|create|change|edit|configure|set up|setup|refund|reverse|run|open|delete|remove)\b/i;

export function hasVagueCustomerWorkflowAdvice(reply = "") {
  return VAGUE_WORKFLOW_PATTERNS.some((pattern) => pattern.test(String(reply || "")));
}

export function shouldBlockVagueWorkflowAnswer(message = "", reply = "") {
  if (!reply || !hasVagueCustomerWorkflowAdvice(reply)) return false;
  return WORKFLOW_QUESTION_PATTERN.test(String(message || "")) || /\b\d+\.\s+/m.test(String(reply || ""));
}

export function buildAnswerQualityEscalationReply() {
  return [
    "I do not have a complete verified BRS workflow for that yet, so I should not give steps that may be wrong.",
    "",
    "I am escalating this to BRS Support. Please include the BRS area you were working in, what you were trying to do, and a screenshot of the page where you got stuck.",
  ].join("\n");
}

export function applyAnswerQualityGate(payload = {}, message = "") {
  if (!payload || typeof payload !== "object" || typeof payload.reply !== "string") return payload;
  if (!shouldBlockVagueWorkflowAnswer(message, payload.reply)) return payload;
  return {
    ...payload,
    reply: buildAnswerQualityEscalationReply(),
    escalationReady: true,
    options: [],
    version: "answer-quality-escalation-v1",
    qualityGate: {
      blocked: true,
      reason: "vague-or-unverified-workflow-advice",
      originalVersion: payload.version || null,
    },
  };
}
