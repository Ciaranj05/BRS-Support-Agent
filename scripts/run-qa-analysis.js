import { runQaAnalysis } from "../lib/qaAnalysis.js";

const result = await runQaAnalysis({
  startAt: process.env.QA_ANALYSIS_START_AT || null,
  endAt: process.env.QA_ANALYSIS_END_AT || null,
  outputDir: process.env.QA_ANALYSIS_OUTPUT_DIR || undefined,
  writeFile: process.env.QA_ANALYSIS_WRITE_FILE !== "false",
});

console.log(JSON.stringify({
  ok: true,
  filePath: result.filePath,
  fileName: result.fileName,
  summary: result.summary,
}, null, 2));
