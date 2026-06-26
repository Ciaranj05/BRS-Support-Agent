import fs from "fs/promises";
import path from "path";
import { execFileSync } from "child_process";
import { getQaDataset, qaStorageMode } from "./qaInteractionStore.js";
import { writeXlsxWorkbook } from "./xlsxWriter.js";

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "docs", "qa-analysis");

const AREA_RULES = [
  ["memberships", /\b(member|membership|subscription|bill|billing|flexi|flexible|payment scheme|account balance)\b/i],
  ["timesheet", /\b(timesheet|tee sheet|tee time|booking|block booking|visitor|green fee|slot)\b/i],
  ["payments", /\b(payment|refund|card|transaction|invoice|wallet|charge|paid|stripe|brs payments)\b/i],
  ["reports", /\b(report|export|download|csv|print|statistics|summary)\b/i],
  ["tools-settings", /\b(setting|settings|tool|tools|template|voucher|promotion|policy)\b/i],
  ["users-access", /\b(user|staff|admin|permission|access|login|password|role)\b/i],
  ["messaging", /\b(email|sms|message|mail|communication|notification)\b/i],
  ["competitions", /\b(competition|event|draw|entry|handicap)\b/i],
  ["facilities", /\b(facility|room|court|resource|reservation)\b/i],
];

const GAP_PATTERNS = [
  /\bnot enough confirmed\b/i,
  /\bi do not have\b/i,
  /\bi don't have\b/i,
  /\bknowledge gap\b/i,
  /\bworkflow exploration\b/i,
  /\bqueued\b/i,
  /\bescalat(e|ion)\b/i,
  /\bplease give me more information\b/i,
  /\bwhich brs area\b/i,
];

const VAGUE_PATTERNS = [
  /\bcheck (the )?(relevant|appropriate|club|available) settings\b/i,
  /\bdepending on\b/i,
  /\bif (the )?option is enabled\b/i,
  /\bfrom the .* area\b/i,
  /\bopen or create\b/i,
  /\blook for\b/i,
  /\bshould be able to\b/i,
];

function isoForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function latestCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function wordCount(text = "") {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function answerSpecificityScore(answer = "") {
  const text = String(answer || "");
  let score = 0;
  if (/\b\d+\.\s/.test(text)) score += 2;
  if (/\b(click|select|open|choose|enter|save|preview|create|edit|delete|view|return)\b/i.test(text)) score += 1;
  if (/[A-Z][A-Z /-]{3,}/.test(text)) score += 1;
  if (/(>|>>| > )/.test(text)) score += 1;
  if (/\b(Check|Verify|Confirm):/i.test(text)) score += 1;
  if (wordCount(text) >= 90) score += 1;
  return score;
}

function isHowToQuestion(question = "") {
  return /\b(how do i|how can i|create|add|edit|change|delete|remove|set up|setup|configure|where do i|find|view|run)\b/i.test(question);
}

function inferArea(question = "", answer = "") {
  const combined = `${question} ${answer}`;
  const match = AREA_RULES.find(([, pattern]) => pattern.test(combined));
  return match ? match[0] : "uncategorised";
}

function firstSeenInteraction(interactions = [], answerId = null, questionId = null) {
  return interactions.find((interaction) => (
    (!answerId || interaction.answerId === answerId)
    && (!questionId || interaction.questionId === questionId)
  ));
}

function truncate(text = "", max = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function topItems(items, limit = 10) {
  return items.slice(0, limit);
}

function analyseDataset(dataset) {
  const questionsById = new Map(dataset.questions.map((question) => [question.id, question]));
  const answersById = new Map(dataset.answers.map((answer) => [answer.id, answer]));
  const interactions = dataset.interactions.map((interaction) => ({
    ...interaction,
    question: questionsById.get(interaction.questionId),
    answer: answersById.get(interaction.answerId),
  })).filter((interaction) => interaction.question && interaction.answer);

  const answerQuestionIds = new Map();
  for (const interaction of interactions) {
    if (!answerQuestionIds.has(interaction.answerId)) answerQuestionIds.set(interaction.answerId, new Set());
    answerQuestionIds.get(interaction.answerId).add(interaction.questionId);
  }

  const reusedAnswers = [...answerQuestionIds.entries()]
    .map(([answerId, questionIds]) => ({ answer: answersById.get(answerId), questionIds: [...questionIds] }))
    .filter((group) => group.answer && group.questionIds.length > 1)
    .sort((a, b) => b.questionIds.length - a.questionIds.length || (b.answer.useCount || 0) - (a.answer.useCount || 0));

  const interactionRows = interactions.map((interaction) => {
    const questionText = interaction.question.questionText || "";
    const answerText = interaction.answer.answerText || "";
    const specificityScore = answerSpecificityScore(answerText);
    const howTo = isHowToQuestion(questionText);
    const gap = GAP_PATTERNS.some((pattern) => pattern.test(answerText));
    const vague = VAGUE_PATTERNS.some((pattern) => pattern.test(answerText));
    const noStepsForHowTo = howTo && !/\b\d+\.\s/.test(answerText);
    const shortHowTo = howTo && wordCount(answerText) < 70;
    const optionsOnly = Array.isArray(interaction.metadata?.optionLabels) && interaction.metadata.optionLabels.length >= 3 && wordCount(answerText) < 45;
    return {
      interaction,
      area: inferArea(questionText, answerText),
      specificityScore,
      gap,
      vague,
      noStepsForHowTo,
      shortHowTo,
      optionsOnly,
      needsReview: gap || vague || noStepsForHowTo || shortHowTo || optionsOnly || specificityScore <= 1,
    };
  });

  const reviewCandidates = interactionRows
    .filter((row) => row.needsReview)
    .sort((a, b) => {
      const severityA = Number(a.gap) * 4 + Number(a.noStepsForHowTo) * 3 + Number(a.shortHowTo) * 2 + Number(a.vague) + Number(a.optionsOnly);
      const severityB = Number(b.gap) * 4 + Number(b.noStepsForHowTo) * 3 + Number(b.shortHowTo) * 2 + Number(b.vague) + Number(b.optionsOnly);
      return severityB - severityA || a.specificityScore - b.specificityScore;
    });

  return {
    interactions,
    reusedAnswers,
    reviewCandidates,
    areaCounts: countBy(interactionRows, (row) => row.area),
    routeCounts: countBy(interactionRows, (row) => row.interaction.metadata?.version || row.interaction.answer.metadata?.version || "unknown"),
    totals: {
      interactions: dataset.interactions.length,
      uniqueQuestions: dataset.questions.length,
      uniqueAnswers: dataset.answers.length,
      reusedAnswerGroups: reusedAnswers.length,
      reviewCandidates: reviewCandidates.length,
    },
  };
}

function reasonLabels(row) {
  return [
    row.gap ? "knowledge gap/escalation language" : null,
    row.noStepsForHowTo ? "how-to question without numbered steps" : null,
    row.shortHowTo ? "short answer for workflow-style question" : null,
    row.vague ? "vague routing or conditional wording" : null,
    row.optionsOnly ? "mostly clarification/options" : null,
    row.specificityScore <= 1 ? "low screen-label specificity" : null,
  ].filter(Boolean).join("; ");
}

function bulletList(items, emptyText = "None found in this window.") {
  if (!items.length) return `- ${emptyText}`;
  return items.map((item) => `- ${item}`).join("\n");
}

function buildMarkdown({ analysis, generatedAt, startAt, endAt }) {
  const commit = latestCommit();
  const windowLabel = startAt || endAt
    ? `${startAt || "beginning"} to ${endAt || "now"}`
    : "all stored Q&A";
  const lines = [
    "# Q&A Response Quality Notes",
    "",
    `Generated at: ${generatedAt.toISOString()}`,
    `Analysis window: ${windowLabel}`,
    `Storage mode: ${qaStorageMode()}`,
    `Latest commit: ${commit}`,
    "",
    "## Summary",
    "",
    `- Interactions analysed: ${analysis.totals.interactions}`,
    `- Unique questions: ${analysis.totals.uniqueQuestions}`,
    `- Unique answers: ${analysis.totals.uniqueAnswers}`,
    `- Reused answer groups: ${analysis.totals.reusedAnswerGroups}`,
    `- Review candidates: ${analysis.totals.reviewCandidates}`,
    "",
    "## Main Areas Asked About",
    "",
    bulletList(topItems(analysis.areaCounts).map(([area, count]) => `${area}: ${count}`)),
    "",
    "## Answer Routes",
    "",
    bulletList(topItems(analysis.routeCounts).map(([route, count]) => `${route}: ${count}`)),
    "",
    "## Answers Reused By Multiple Questions",
    "",
    bulletList(topItems(analysis.reusedAnswers, 12).map((group) => {
      const questions = group.questionIds
        .map((id) => analysis.interactions.find((interaction) => interaction.questionId === id)?.question?.questionText)
        .filter(Boolean)
        .slice(0, 4)
        .map((question) => `"${truncate(question, 110)}"`)
        .join("; ");
      return `Answer ${group.answer.id} reused by ${group.questionIds.length} question variants. Answer excerpt: "${truncate(group.answer.answerText, 180)}" Questions: ${questions}`;
    }), "No answer was reused by multiple distinct question phrasings."),
    "",
    "## Responses To Review",
    "",
    bulletList(topItems(analysis.reviewCandidates, 20).map((row) => {
      const interaction = firstSeenInteraction(analysis.interactions, row.interaction.answerId, row.interaction.questionId) || row.interaction;
      return [
        `${interaction.askedAt || "unknown time"} | ${row.area} | ${reasonLabels(row)}`,
        `Question: "${truncate(row.interaction.question.questionText, 160)}"`,
        `Answer: "${truncate(row.interaction.answer.answerText, 260)}"`,
      ].join("\n  ");
    }), "No obvious weak responses found by the deterministic checks."),
    "",
    "## Suggested Knowledge Work",
    "",
    bulletList(topItems(analysis.reviewCandidates, 10).map((row) => {
      const area = row.area === "uncategorised" ? "the relevant workflow family" : row.area;
      return `Improve ${area}: add exact BRS navigation labels, button names, required fields, save/verification step, and any important warning for "${truncate(row.interaction.question.questionText, 120)}".`;
    }), "No immediate knowledge additions suggested."),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function buildWorkbookSheets({ analysis, generatedAt, startAt, endAt }) {
  const windowLabel = startAt || endAt
    ? `${startAt || "beginning"} to ${endAt || "now"}`
    : "all stored Q&A";
  return [
    {
      name: "Summary",
      rows: [
        ["Generated at", generatedAt.toISOString()],
        ["Analysis window", windowLabel],
        ["Storage mode", qaStorageMode()],
        ["Latest commit", latestCommit()],
        ["Interactions analysed", analysis.totals.interactions],
        ["Unique questions", analysis.totals.uniqueQuestions],
        ["Unique answers", analysis.totals.uniqueAnswers],
        ["Reused answer groups", analysis.totals.reusedAnswerGroups],
        ["Review candidates", analysis.totals.reviewCandidates],
      ],
    },
    {
      name: "Responses To Review",
      rows: [
        ["Asked at", "Area", "Reason", "Question", "Answer", "Route/version", "Escalation ready", "Question ID", "Answer ID", "Session ID"],
        ...analysis.reviewCandidates.map((row) => [
          row.interaction.askedAt || "",
          row.area,
          reasonLabels(row),
          row.interaction.question.questionText || "",
          row.interaction.answer.answerText || "",
          row.interaction.metadata?.version || row.interaction.answer.metadata?.version || "",
          row.interaction.metadata?.escalationReady ?? "",
          row.interaction.questionId || "",
          row.interaction.answerId || "",
          row.interaction.sessionId || "",
        ]),
      ],
    },
    {
      name: "Reused Answers",
      rows: [
        ["Answer ID", "Use count", "Distinct question count", "Answer", "Example questions"],
        ...analysis.reusedAnswers.map((group) => [
          group.answer.id,
          group.answer.useCount || 0,
          group.questionIds.length,
          group.answer.answerText || "",
          group.questionIds
            .map((id) => analysis.interactions.find((interaction) => interaction.questionId === id)?.question?.questionText)
            .filter(Boolean)
            .join(" | "),
        ]),
      ],
    },
    {
      name: "Area Counts",
      rows: [["Area", "Count"], ...analysis.areaCounts],
    },
    {
      name: "Route Counts",
      rows: [["Route/version", "Count"], ...analysis.routeCounts],
    },
  ];
}

export async function runQaAnalysis({ startAt = null, endAt = null, outputDir = DEFAULT_OUTPUT_DIR, writeFile = true, now = new Date() } = {}) {
  const dataset = await getQaDataset({ startAt, endAt });
  const analysis = analyseDataset(dataset);
  const markdown = buildMarkdown({ analysis, generatedAt: now, startAt, endAt });
  const fileName = `qa-analysis-${isoForFile(now)}.md`;
  const filePath = path.join(outputDir, fileName);
  const workbookFileName = `qa-analysis-${isoForFile(now)}.xlsx`;
  const workbookFilePath = path.join(outputDir, workbookFileName);
  if (writeFile) {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(filePath, markdown);
    await writeXlsxWorkbook(workbookFilePath, buildWorkbookSheets({ analysis, generatedAt: now, startAt, endAt }));
  }
  return {
    fileName,
    filePath,
    workbookFileName,
    workbookFilePath,
    markdown,
    summary: analysis.totals,
  };
}

