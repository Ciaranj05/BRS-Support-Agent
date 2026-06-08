const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const MONEY_PATTERN = /(?:GBP|EUR|USD|£|€|\$)\s?\d+(?:[,.]\d{2})?/gi;
const LONG_NUMBER_PATTERN = /\b\d{6,}\b/g;
const DATE_TIME_PATTERN = /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4}(?:\s+\d{1,2}:\d{2})?\b/gi;
const PERSON_WITH_ROLE_PATTERN = /\b([Pp]layer|[Gg]olfer|[Mm]ember|[Vv]isitor|[Ss]taff|[Cc]ustomer)\b\s*(?:[:#-]\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
const PRODUCT_TITLE_WORDS = new Set([
  "account", "accounts", "admin", "availability", "balance", "balances", "bill", "billing", "bills", "booking", "bookings",
  "competition", "competitions", "customer", "customers", "entry", "fee", "fees", "green", "group", "groups", "invoice",
  "invoices", "member", "members", "membership", "memberships", "page", "pages", "payment", "payments", "permission",
  "permissions", "profile", "profiles", "refund", "refunds", "report", "reports", "role", "roles", "setting", "settings",
  "setup", "sheet", "staff", "subscription", "subscriptions", "tee", "timesheet", "transaction", "transactions", "user", "users",
  "visitor", "visitors", "wallet", "wallets",
]);

export function normaliseWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function patternMatches(pattern, value) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function isProductTitlePhrase(nameText = "") {
  return nameText.split(/\s+/).some((word) => PRODUCT_TITLE_WORDS.has(word.toLowerCase()));
}

function hasRoleLabelledPerson(value = "") {
  PERSON_WITH_ROLE_PATTERN.lastIndex = 0;
  let match;
  while ((match = PERSON_WITH_ROLE_PATTERN.exec(value)) !== null) {
    if (!isProductTitlePhrase(match[2])) return true;
  }
  return false;
}

export function redactText(value = "") {
  return normaliseWhitespace(value)
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(MONEY_PATTERN, "[redacted-money]")
    .replace(DATE_TIME_PATTERN, "[redacted-date]")
    .replace(LONG_NUMBER_PATTERN, "[redacted-number]")
    .replace(PERSON_WITH_ROLE_PATTERN, (match, role, nameText) => (
      isProductTitlePhrase(nameText) ? match : `${role} [redacted-name]`
    ));
}

export function hasSensitiveData(value = "") {
  const text = String(value || "");
  return [EMAIL_PATTERN, PHONE_PATTERN, MONEY_PATTERN, LONG_NUMBER_PATTERN].some((pattern) => patternMatches(pattern, text))
    || hasRoleLabelledPerson(text);
}

export function keepReusableProductText(value = "") {
  const redacted = redactText(value);
  if (!redacted || redacted.length < 2) return "";
  if (/^\[redacted-(email|phone|money|number)\]$/.test(redacted)) return "";
  return redacted;
}
