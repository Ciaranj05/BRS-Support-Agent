const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const MONEY_PATTERN = /(?:GBP|EUR|USD|£|€|\$)\s?\d+(?:[,.]\d{2})?/gi;
const LONG_NUMBER_PATTERN = /\b\d{6,}\b/g;
const DATE_TIME_PATTERN = /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4}(?:\s+\d{1,2}:\d{2})?\b/gi;
const PLAYER_TERMS = /\b(?:player|golfer|member|visitor|staff|customer)\s*[:#-]?\s*[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;

export function normaliseWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function redactText(value = "") {
  return normaliseWhitespace(value)
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(MONEY_PATTERN, "[redacted-money]")
    .replace(DATE_TIME_PATTERN, "[redacted-date]")
    .replace(PLAYER_TERMS, "$1 [redacted-name]")
    .replace(LONG_NUMBER_PATTERN, "[redacted-number]");
}

export function hasSensitiveData(value = "") {
  const text = String(value || "");
  return EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text) || MONEY_PATTERN.test(text) || LONG_NUMBER_PATTERN.test(text);
}

export function keepReusableProductText(value = "") {
  const redacted = redactText(value);
  if (!redacted || redacted.length < 2) return "";
  if (/^\[redacted-(email|phone|money|number)\]$/.test(redacted)) return "";
  return redacted;
}
