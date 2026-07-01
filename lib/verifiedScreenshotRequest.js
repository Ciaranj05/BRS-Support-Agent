export function isVerifiedScreenshotRequest(message = "") {
  return /^verified screenshot request:/i.test(String(message || "").trim())
    || /^still can'?t find it\??$/i.test(String(message || "").trim());
}

export function buildVerifiedScreenshotContext(history = []) {
  const items = Array.isArray(history) ? history : [];
  const lastAssistant = [...items].reverse().find((item) =>
    item?.role === "assistant" &&
    item.content &&
    !isVerifiedScreenshotRequest(item.content)
  );
  const lastUser = [...items].reverse().find((item) =>
    item?.role === "user" &&
    item.content &&
    !isVerifiedScreenshotRequest(item.content)
  );

  return {
    question: String(lastUser?.content || "").trim(),
    answer: String(lastAssistant?.content || "").trim(),
  };
}

export function screenshotUnavailableReply(error = "") {
  const reason = String(error || "").trim();
  return [
    "I can only show verified screenshots captured from the BRS demo system.",
    "",
    reason
      ? `I could not capture one this time because: ${reason}`
      : "I could not capture one this time because the verified screenshot runtime is not configured.",
    "",
    "I have not generated a mock-up or illustrative image.",
  ].join("\n");
}
