function extractUrls(text = "") {
  return [...String(text).matchAll(/https?:\/\/[^\s)]+/gi)].map((match) => match[0].replace(/[.,;!?]+$/, ""));
}

function extractMenuPaths(text = "") {
  return [...String(text).matchAll(/\b[A-Z][A-Za-z/& ]+(?:\s*>>\s*[A-Z][A-Za-z/& ]+)+/g)].map((match) => (
    match[0]
      .replace(/\s+/g, " ")
      .replace(/^(Go to|Open|Use|Check|Then go to)\s+/i, "")
      .trim()
  ));
}

function hasNewValues(originalValues, rewrittenValues) {
  const originals = new Set(originalValues.map((value) => value.toLowerCase()));
  return rewrittenValues.some((value) => !originals.has(value.toLowerCase()));
}

export function rewriteAddsUnsupportedDetails(originalReply = "", rewrittenReply = "") {
  if (hasNewValues(extractUrls(originalReply), extractUrls(rewrittenReply))) return true;
  if (hasNewValues(extractMenuPaths(originalReply), extractMenuPaths(rewrittenReply))) return true;
  return false;
}
