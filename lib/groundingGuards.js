const ACTION_WORDS = new Set([
  "add",
  "adding",
  "create",
  "creating",
  "new",
  "edit",
  "change",
  "update",
  "delete",
  "remove",
  "view",
  "find",
  "run",
  "open",
  "set",
  "setup",
  "up",
  "make",
  "manage",
  "use",
  "how",
  "where",
  "what",
  "which",
  "do",
  "i",
  "the",
  "a",
  "an",
  "in",
  "on",
  "to",
  "for",
  "of",
  "with",
  "and",
  "or",
  "brs",
  "system",
]);

const VAGUE_WORKFLOW_PATTERNS = [
  /\blook for\b/i,
  /\bor a similar (action|option|button|link|control)\b/i,
  /\bsimilar action\b/i,
  /\bavailable fields\b/i,
  /\bas prompted by the system\b/i,
  /\bif available\b/i,
  /\bif shown\b/i,
  /\bmay be\b/i,
  /\blikely\b/i,
  /\busually\b/i,
  /\bshould be able to\b/i,
  /\bdepending on\b/i,
  /\bthe relevant (screen|area|section|settings)\b/i,
  /\bappropriate (screen|area|section|settings)\b/i,
];

function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function objectTokens(value = "") {
  return normalise(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !ACTION_WORDS.has(token));
}

export function hasVagueWorkflowGuessLanguage(reply = "") {
  return VAGUE_WORKFLOW_PATTERNS.some((pattern) => pattern.test(String(reply || "")));
}

export function isWorkflowStyleQuestion(message = "") {
  return /\b(how|where|which|what|show|see|find|list|report|filter|export|download|add|create|change|edit|configure|set up|setup|refund|reverse|run|open|delete|remove)\b/i.test(message);
}

export function hasUnsupportedGeneratedWorkflowShape(message = "", reply = "") {
  if (!reply || !isWorkflowStyleQuestion(message)) return false;
  return hasVagueWorkflowGuessLanguage(reply);
}

export function candidateGuideMatchesQuestion(message = "", guide = {}) {
  const url = guide?.url || guide?.sourceUrl || "";
  const title = guide?.title || "";
  const guideText = `${title} ${url}`;
  const questionTokens = new Set(objectTokens(message));
  const guideTokens = new Set(objectTokens(guideText));
  if (!questionTokens.size || !guideTokens.size) return false;
  return [...guideTokens].some((token) => questionTokens.has(token));
}

