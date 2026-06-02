const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const MONEY_PATTERN = /(?:GBP|EUR|USD|£|€|\$)\s?\d+(?:[,.]\d{2})?/gi;
const LONG_NUMBER_PATTERN = /\b\d{6,}\b/g;
const DATE_TIME_PATTERN = /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4}(?:\s+\d{1,2}:\d{2})?\b/gi;
const PERSON_WITH_ROLE_PATTERN = /\b(player|golfer|member|visitor|staff|customer)\s*[:#-]?\s*[A-Z][a-z]+\s+[A-Z][a-z]+\b/gi;

export function normaliseWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function patternMatches(pattern, value) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

export function redactText(value = "") {
  return normaliseWhitespace(value)
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(MONEY_PATTERN, "[redacted-money]")
    .replace(DATE_TIME_PATTERN, "[redacted-date]")
    .replace(PERSON_WITH_ROLE_PATTERN, "$1 [redacted-name]")
    .replace(LONG_NUMBER_PATTERN, "[redacted-number]");
}

export function hasSensitiveData(value = "") {
  const text = String(value || "");
  return [EMAIL_PATTERN, PHONE_PATTERN, MONEY_PATTERN, LONG_NUMBER_PATTERN, PERSON_WITH_ROLE_PATTERN]
    .some((pattern) => patternMatches(pattern, text));
}

export function keepReusableProductText(value = "") {
  const redacted = redactText(value);
  if (!redacted || redacted.length < 2) return "";
  if (/^\[redacted-(email|phone|money|number)\]$/.test(redacted)) return "";
  return redacted;
}
