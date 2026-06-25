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

const INCOMPLETE_EVIDENCE_PATTERNS = [
  /\bworkflow surface\b/i,
  /\bUse the visible fields, filters, tabs, or actions shown on the page\b/i,
  /\bUse the available fields, filters, or selectors to narrow the result\b/i,
  /\bUse the available page actions for the next step\b/i,
  /\bCheck the table columns to verify the correct records or report output\b/i,
  /\bHelp Button Launcher\b/i,
  /\bWalk-Throughs\b/i,
  /\bWalkMe\b/i,
  /\bHow to [A-Z][A-Za-z0-9 /&'-]+:\s*reset filters\b/i,
  /\bForgot password:\s*reset filters\b/i,
  /\bYou may only login if you are authorised to do so\b/i,
  /\bAccess Denied\b/i,
  /\b500\s*-\s*Internal Server Error\b/i,
  /\bInternal Server Error\b/i,
  /\bINTRODUCING OUR FINANCE PARTNER\b/i,
  /\bSIGN UP FIND OUT MORE\b/i,
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

export function hasIncompleteWorkflowEvidence(entry = {}) {
  if (String(entry.title || "").trim() === "MEMBER [redacted-name]" || String(entry.area || "").trim() === "MEMBER [redacted-name]") return true;
  const text = [
    entry.title,
    entry.area,
    entry.workflow,
    entry.navigationPath,
    entry.purpose,
    entry.content,
    ...(entry.steps || []),
    ...(entry.helpText || []),
    ...(entry.pageEvidence?.headings || []),
    ...(entry.pageEvidence?.helpText || []),
    ...(entry.pageEvidence?.safeLinks || []),
    ...(entry.actions || []).map((action) => typeof action === "string" ? action : [action.label, action.purpose, action.title, action.ariaLabel, action.iconText].filter(Boolean).join(": ")),
  ].filter(Boolean).join("\n");
  if (INCOMPLETE_EVIDENCE_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const sourceType = entry.sourceType || "";
  const steps = Array.isArray(entry.steps) ? entry.steps : [];
  const hasGenericSteps = steps.some((step) => INCOMPLETE_EVIDENCE_PATTERNS.some((pattern) => pattern.test(step)));
  const hasRouteSteps = (entry.routes || []).some((route) => Array.isArray(route.steps) && route.steps.length >= 2);
  const hasSpecificSteps = steps.length >= 2 && !hasGenericSteps && steps.some((step) => /\b(click|select|choose|enter|tick|untick|save|update|create|add|download|export|preview|filter|open)\b/i.test(step));
  const isWorkflow = ["workflow", "brs-system-workflow", "brs-workflow-family"].includes(sourceType);
  return isWorkflow && !hasRouteSteps && !hasSpecificSteps;
}
