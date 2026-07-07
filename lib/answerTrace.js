import crypto from "crypto";

function hashText(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function firstLine(value = "") {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function roundScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

function unique(values = [], limit = 20) {
  const seen = new Set();
  const output = [];
  for (const value of values.map((item) => String(item || "").replace(/\s+/g, " ").trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function summarizeIntent(intent = {}) {
  if (!intent || typeof intent !== "object") return null;
  return {
    topic: intent.topic || null,
    task: intent.task || null,
    object: intent.object || null,
    confidence: Number.isFinite(Number(intent.confidence)) ? Number(intent.confidence) : null,
    needsClarification: Boolean(intent.needsClarification),
    queryTermCount: Array.isArray(intent.queryTerms) ? intent.queryTerms.length : 0,
  };
}

function summarizeEvidencePlan(plan = {}) {
  if (!plan || typeof plan !== "object") return null;
  return {
    questionType: plan.questionType || null,
    candidateTopics: plan.candidateTopics || [],
    candidateAreas: plan.candidateAreas || [],
    useMultipleAreas: Boolean(plan.useMultipleAreas),
    queryTermCount: Array.isArray(plan.queryTerms) ? plan.queryTerms.length : 0,
  };
}

function summarizeContextProfile(profile = {}) {
  if (!profile || typeof profile !== "object") return null;
  return {
    version: profile.version || null,
    wordCount: profile.wordCount || 0,
    factCount: Array.isArray(profile.facts) ? profile.facts.length : 0,
    areas: profile.areas || [],
    problemSignals: profile.problemSignals || [],
    reportSignal: Boolean(profile.reportSignal),
    contextualReportingCase: Boolean(profile.contextualReportingCase),
    liveActionSignal: Boolean(profile.liveActionSignal),
    policyAdviceSignal: Boolean(profile.policyAdviceSignal),
    narrativeSignal: Boolean(profile.narrativeSignal),
    cleanWorkflowHowTo: Boolean(profile.cleanWorkflowHowTo),
    requiresContextualSynthesis: Boolean(profile.requiresContextualSynthesis),
    allowDirectWorkflowAnswer: Boolean(profile.allowDirectWorkflowAnswer),
  };
}

function summarizeEntry(entry = {}) {
  return {
    title: entry.title || null,
    sourceType: entry.sourceType || null,
    area: entry.area || null,
    navigationPath: entry.navigationPath || null,
    workflowFamily: entry.workflowFamily || null,
    topic: entry.topic || null,
    score: roundScore(entry.score),
    confidence: entry.confidence || null,
    tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 8) : [],
  };
}

function summarizeComposition(composition = {}) {
  if (!composition || typeof composition !== "object") return null;
  return {
    mode: composition.mode || null,
    questionType: composition.questionType || null,
    candidateAreas: composition.candidateAreas || [],
    useMultipleAreas: Boolean(composition.useMultipleAreas),
    sourceCounts: composition.sourceCounts || {},
    staticShare: Number.isFinite(Number(composition.staticShare)) ? Number(composition.staticShare) : 0,
    staticFallbackUsed: Boolean(composition.staticFallbackUsed),
    lockedStaticUsed: Boolean(composition.lockedStaticUsed),
    recommendCrawlEnhancement: Boolean(composition.recommendCrawlEnhancement),
  };
}

export function buildDeveloperAnswerTrace({
  message = "",
  route = null,
  contextProfile = null,
  seedIntent = null,
  intent = null,
  evidencePlan = null,
  staticWorkflowReply = "",
  staticIntentEvaluation = null,
  routingEvidence = [],
  usefulLocalEntries = [],
  answerComposition = null,
  evidencePack = null,
  fallbackReason = null,
  qualityIssue = null,
  verification = null,
} = {}) {
  const selectedEvidence = unique(usefulLocalEntries.map((entry) => entry.title || entry.id || entry.navigationPath).filter(Boolean), 12);
  const routingCandidateTitles = unique(routingEvidence.map(firstLine).filter(Boolean), 8);
  return {
    version: "developer-answer-trace-v1",
    messageHash: hashText(message),
    route,
    contextProfile: summarizeContextProfile(contextProfile),
    seedIntent: summarizeIntent(seedIntent),
    intent: summarizeIntent(intent || seedIntent),
    evidencePlan: summarizeEvidencePlan(evidencePlan),
    staticCandidate: staticWorkflowReply
      ? {
        title: firstLine(staticWorkflowReply),
        allowed: staticIntentEvaluation?.allowed ?? null,
        rejectedReason: staticIntentEvaluation?.reason || null,
      }
      : null,
    routingCandidateCount: routingEvidence.length,
    routingCandidateTitles,
    selectedEvidenceTitles: selectedEvidence,
    selectedEvidence: usefulLocalEntries.slice(0, 10).map(summarizeEntry),
    evidencePack: evidencePack
      ? {
        sourceCount: evidencePack.sources?.length || 0,
        sourceTitles: evidencePack.sources?.map((source) => source.title).filter(Boolean).slice(0, 12) || [],
        hasSpecifics: Boolean(evidencePack.specificsText),
      }
      : null,
    answerComposition: summarizeComposition(answerComposition),
    qualityIssue: qualityIssue || null,
    verification: verification || null,
    fallbackReason: fallbackReason || null,
  };
}
