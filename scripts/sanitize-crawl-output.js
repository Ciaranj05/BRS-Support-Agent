import fs from "fs";

const files = process.argv.slice(2);

const sensitivePatterns = [
  /[£€]/,
  /@/,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{5,}\b/,
  /\b[A-Z][A-Za-z' -]+,\s*[A-Z][A-Za-z' -]+/,
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+,\s*[A-Z][a-z]+/,
];

function isSensitive(value = "") {
  return sensitivePatterns.some((pattern) => pattern.test(String(value)));
}

function isEmpty(value) {
  return value === null
    || value === ""
    || (Array.isArray(value) && value.length === 0)
    || (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
}

function clean(value) {
  if (Array.isArray(value)) return value.map(clean).filter((item) => !isEmpty(item));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested === "string" && isSensitive(nested)) continue;
      const cleaned = clean(nested);
      if (!isEmpty(cleaned)) output[key] = cleaned;
    }
    return output;
  }
  if (typeof value === "string") {
    return value.split("\n").filter((line) => !isSensitive(line)).join("\n");
  }
  return value;
}

for (const file of files) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, `${JSON.stringify(clean(parsed), null, 2)}\n`);
}
