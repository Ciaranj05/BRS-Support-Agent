const ACTION_WORDS = /\b(configure|conifgure|configur|set up|setup|create|generate|build|add|change|update|delete|remove)\b/i;
const TIMESHEET_WORDS = /\b(timesheet|time sheet|teesheet|tee sheet|teeshseet|tee times?)\b/i;
const GUIDANCE_WORDS = /^(how|where|what)\b|\b(how do i|how to|where do i|steps|guide|instructions)\b/i;

// Backend-owned router for executable actions. Keep this conservative:
// guidance and uncertain requests should fall back to the knowledge flow.
function normaliseMessage(message = "") {
  return String(message || "").trim();
}

function isGuidanceQuestion(message) {
  return GUIDANCE_WORDS.test(normaliseMessage(message));
}

function isTimesheetTarget(message) {
  return TIMESHEET_WORDS.test(normaliseMessage(message));
}

function isActionRequest(message) {
  return ACTION_WORDS.test(normaliseMessage(message));
}

function isTimesheetContentGuidance(message) {
  return /\b(message|note|notice|warning|text|print|view|open|find|search)\b/i.test(normaliseMessage(message));
}

export function routeActionRequest(message) {
  const text = normaliseMessage(message);
  if (!text) return null;

  if (isGuidanceQuestion(text)) return null;

  if (isTimesheetTarget(text) && isActionRequest(text) && !isTimesheetContentGuidance(text)) {
    return {
      type: "timesheet.configure",
      confidence: "high",
      reason: "User asked to change or configure the timesheet.",
    };
  }

  return null;
}
