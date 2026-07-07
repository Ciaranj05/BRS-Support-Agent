import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { retrieveKnowledge, formatRetrievedSources } from "./retrieval.js";
import { tokenize } from "./knowledgeSources.js";
import { approvedMoveBookingReply, hasForbiddenMoveBookingAdvice, isMoveBookingQuestion } from "./bookingWorkflowAnswers.js";
import { approvedMemberBalanceReportReply, isMemberBalanceReportQuestion } from "./membershipWorkflowAnswers.js";
import { approvedStaticWorkflowReply } from "./staticWorkflowAnswers.js";
import { isVerifiedStaticReply } from "./verifiedAnswerRegistry.js";
import { evaluateStaticAnswerAgainstIntent } from "./intentFrame.js";
import { buildContextualSupportFallbackReply, buildQuestionContextProfile, contextualAnswerIssue } from "./questionContextProfile.js";
import { withTimeout } from "./openaiHelpers.js";
import { formatLiveEvidence } from "./liveBrsLookup.js";

const HELP_CENTER_SEARCH_URL = "https://help.brsgolf.com/api/v2/help_center/articles/search.json";
const HELP_CENTER_CACHE_TTL_MS = 1000 * 60 * 30;
const MAX_EVIDENCE_CHARS = 12000;
const UNKNOWN_REPLY = "I don't have enough confirmed information in the BRS Help Center or approved support guidance to answer that accurately. Please check the BRS Help Center or escalate this to support.";
const BRS_SUPPORT_CONTACT_REPLY = `Call us on UK 028 9568 0288 or IE 0353 1800 852 935.
Opening hours are Monday to Friday, 8am through to 5:30pm.
Email the team on support.en@golfnowbusiness.com and we’ll get back to you as soon as possible.

For Golf Now based questions, please contact Golf Now Customer Support.`;
const GOLF_NOW_SUPPORT_REPLY = "For Golf Now based questions, please contact Golf Now Customer Support.";

const TOPICS = ["teesheet", "payments", "memberships", "user-management", "admin-setup", "general"];
const SOURCE_WEIGHT = { workflow: 7, system: 5, manual: 4, local: 4, help: 3 };
const WORKFLOW_STEP_PATTERN = /^\s*\d+\.\s+/m;
const TOPIC_DECISION_TREE_FILES = {
  teesheet: ["timesheet", "tools", "reports"],
  payments: ["tools", "timesheet", "memberships", "reports"],
  memberships: ["memberships", "reports", "tools"],
  "user-management": ["users", "messages"],
  "admin-setup": ["tools", "messages", "contacts", "facilities", "dashboard", "golf-plus"],
  general: ["timesheet", "tools", "memberships", "reports", "messages", "users"],
};
const TOPIC_LABELS = {
  teesheet: "Timesheet / bookings",
  payments: "BRS Payments / payment records",
  memberships: "Memberships / member billing",
  "user-management": "Users / access",
  "admin-setup": "Tools / admin setup",
  general: "General BRS support",
};

const helpCenterCache = globalThis.__brsKnowledgeAnswerHelpCenterCache || new Map();
globalThis.__brsKnowledgeAnswerHelpCenterCache = helpCenterCache;
const HELP_CENTER_CACHE_MAX_SIZE = 500;

// Cache approved support files in memory — they are static per deployment.
let _approvedSupportFilesCache = null;
const decisionTreeCache = globalThis.__brsKnowledgeAnswerDecisionTreeCache || new Map();
globalThis.__brsKnowledgeAnswerDecisionTreeCache = decisionTreeCache;

let openAiClient = null;

function getOpenAiClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openAiClient) openAiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openAiClient;
}

function normalise(value = "") {
  return String(value || "").toLowerCase();
}

function truncateText(value = "", limit = 2200) {
  return value.length > limit ? `${value.slice(0, limit).trim()}...` : value;
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function inferQuestionType(message = "") {
  const lower = normalise(message);
  if (/\b(why is|why are|why isn't|why isnt|why can't|why cant|why won't|why wont|not receiving|not working|missing|cannot|can't|cant|won't|wont|error|failed|failing)\b/.test(lower)) return "troubleshooting";
  if (/\b(what is|what are|what does .+ mean|explain|meaning of|definition of|tell me about)\b/.test(lower)) return "definition";
  if (/\b(why would|why should|why do i need|why use|what .+ used for|purpose of|when would .+ use|when should .+ use)\b/.test(lower)) return "purpose";
  if (/\b(report|list|show|find|export|download|spreadsheet|csv|database|filter|columns)\b/.test(lower)) return "report-or-data";
  if (/\b(how do i|how to|add|create|change|edit|configure|set up|setup|run|open|refund|delete|remove|cancel|manage|apply|attach|assign)\b/.test(lower)) return "workflow";
  return "support-answer";
}

function isConceptualSupportQuestion(message = "") {
  return ["definition", "purpose"].includes(inferQuestionType(message));
}

function inferCandidateTopics(message = "", intent = {}) {
  const lower = normalise(message);
  const topics = [intent.topic || inferTopic(message)];
  if (hasAny(lower, ["reservation type", "reservation types", "booking status", "booking statuses", "green fee", "green fees", "course restriction", "member booking rule", "booking rule"])) topics.push("admin-setup", "teesheet");
  if (hasAny(lower, ["payment scheme", "payment schemes", "payment plan", "instalment", "installment", "direct debit"])) topics.push("memberships", "payments");
  if (hasAny(lower, ["brs payments", "transaction", "refund", "payout", "vat", "payment request"])) topics.push("payments", "admin-setup");
  if (hasAny(lower, ["email", "emails", "text", "sms", "message", "messages", "not receiving"])) topics.push("admin-setup", "memberships", "user-management");
  if (hasAny(lower, ["contact", "contacts", "society", "tour operator", "visitor contact"])) topics.push("admin-setup", "teesheet");
  if (hasAny(lower, ["facility", "room", "resource"])) topics.push("admin-setup", "teesheet");
  if (hasAny(lower, ["member", "members", "membership", "bill", "invoice", "subscription", "wallet", "flexi", "flexible"])) topics.push("memberships");
  if (hasAny(lower, ["booking", "tee", "timesheet", "tee sheet", "teesheet", "competition", "visitor", "player"])) topics.push("teesheet");
  return unique(topics.filter((topic) => TOPICS.includes(topic)), 5);
}

function buildEvidencePlan(message = "", intent = {}) {
  const candidateTopics = inferCandidateTopics(message, intent);
  const questionType = inferQuestionType(message);
  const queryTerms = unique([
    message,
    intent.topic,
    intent.task,
    intent.object,
    ...(intent.queryTerms || []),
    ...candidateTopics.map((topic) => TOPIC_LABELS[topic] || topic),
  ], 12);
  return {
    questionType,
    candidateTopics,
    candidateAreas: candidateTopics.map((topic) => TOPIC_LABELS[topic] || topic),
    queryTerms,
    useMultipleAreas: candidateTopics.length > 1,
  };
}

function unique(values = [], limit = 40) {
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

function decodeHtmlEntities(value = "") {
  return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function stripHtml(html = "") {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/li>|<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseJsonObject(text = "") {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

async function fetchJson(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "BRS-Support-Agent/1.0" } });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Knowledge answer Help Center fetch failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function inferTopic(message = "") {
  const lower = normalise(message);
  const scores = {
    memberships: ["member", "membership", "bill", "invoice", "subscription", "wallet", "account balance", "payment scheme", "flexi", "flexible", "unpaid", "owed", "owing", "arrears", "balance"],
    payments: ["brs payments", "transaction", "payout", "payment request", "bank statement", "vat", "refund"],
    teesheet: ["tee", "tee sheet", "teesheet", "timesheet", "booking", "visitor", "green fee", "competition", "draw", "entry sheet"],
    "user-management": ["user", "staff", "admin", "permission", "role", "login", "password"],
    "admin-setup": ["report", "settings", "setup", "configure", "email", "text", "gdpr", "printer", "buggy", "device"],
  };
  if (hasAny(lower, ["membership bill", "member bill", "bill payment", "payment on a bill", "unpaid bills", "owed money", "owe money", "outstanding balance", "outstanding balances", "arrears", "flexi member", "flexible member"])) return "memberships";
  if (hasAny(lower, ["booking refund", "tee time refund", "visitor booking refund"])) return "payments";
  const ranked = Object.entries(scores).map(([topic, terms]) => [topic, terms.filter((term) => lower.includes(term)).length]).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] > 0 ? ranked[0][0] : "general";
}

function keywordIntent(message = "") {
  const lower = normalise(message);
  const topic = inferTopic(message);
  const object = [
    (hasAny(lower, ["unpaid", "outstanding", "owe", "owed", "owing", "arrears", "balance"]) && hasAny(lower, ["bill", "bills", "invoice", "member", "members", "membership", "money", "balance"])) ? "unpaid membership bills / outstanding member balances" : null,
    lower.includes("flexi") || lower.includes("flexible") ? "flexible membership" : null,
    lower.includes("bill") || lower.includes("invoice") ? "membership bill" : null,
    lower.includes("refund") ? "refund" : null,
    lower.includes("report") || lower.includes("list") || lower.includes("which") || lower.includes("show") || lower.includes("see") ? "report/list" : null,
    lower.includes("competition") ? "competition" : null,
    lower.includes("booking") ? "booking" : null,
  ].filter(Boolean).join(", ") || "unknown";
  return {
    topic,
    task: lower.includes("report") || lower.includes("show") || lower.includes("find me") || lower.includes("see") || lower.includes("which") || lower.includes("list") || lower.includes("download") || lower.includes("export") ? "report" : lower.includes("refund") ? "refund" : lower.includes("create") || lower.includes("add") ? "create" : "support-answer",
    object,
    confidence: topic === "general" ? 0.35 : 0.65,
    queryTerms: [message, `${topic} ${object}`].filter(Boolean),
    needsClarification: false,
    clarifyingQuestion: "",
  };
}

async function classifySupportIntent(message) {
  const fallback = keywordIntent(message);
  const client = getOpenAiClient();
  if (!client) return fallback;
  try {
    const response = await withTimeout(
      () => client.responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: `Classify the latest BRS Golf support question for evidence retrieval. Return only JSON with keys: topic, task, object, confidence, needsClarification, clarifyingQuestion, queryTerms. Allowed topics: ${TOPICS.join(", ")}.
Rules:
- membership/member/bill/invoice/subscription/wallet/flexi/unpaid bill/owed money/outstanding balance questions are memberships, even if payment words appear.
- database/list/report/export/spreadsheet/filter questions keep their data object; "email address" is a data field unless the user is asking to send an email.
- booking/tee time refunds are payments or teesheet only when booking/tee time is explicit.
- competition purse evidence is only relevant when the user explicitly asks about competitions.
- report/list questions keep their business object, e.g. unpaid membership bills or outstanding member balances is memberships/report, not a generic payment issue.
- ask clarification only when multiple product objects are genuinely possible.`,
          },
          { role: "user", content: message },
        ],
      }),
      { label: "classifySupportIntent", fallback: null }
    );
    if (!response) return fallback;
    const parsed = parseJsonObject(response.output_text) || {};
    return {
      ...fallback,
      ...parsed,
      topic: TOPICS.includes(parsed.topic) ? parsed.topic : fallback.topic,
      confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : fallback.confidence,
      queryTerms: Array.isArray(parsed.queryTerms) && parsed.queryTerms.length ? parsed.queryTerms.slice(0, 8) : fallback.queryTerms,
    };
  } catch (error) {
    console.error("Dynamic support intent classification failed:", error);
    return fallback;
  }
}

function buildSearchQueries(message, intent = keywordIntent(message)) {
  const lower = normalise(message);
  const queries = [message, ...(intent.queryTerms || [])];
  const wantsDataOutput = hasAny(lower, ["database", "spreadsheet", "csv", "export", "download", "report", "reports", "list", "listing", "produce", "pull", "extract", "filter", "filters", "filtered", "columns", "email address", "email addresses"]);
  if (intent.topic === "memberships") {
    queries.push("membership bill unpaid bills subscriptions member profile billing report flexible membership flexi member outstanding balance arrears owed money");
    queries.push("memberships billing payments dashboard unpaid paid failed scheduled payments billing overview create bills export report");
    if (lower.includes("report") || lower.includes("unpaid") || lower.includes("outstanding") || lower.includes("owe") || lower.includes("owed") || lower.includes("balance")) queries.push("membership reports unpaid bills members outstanding balance billing export download filters status date range billing cycle");
    if (wantsDataOutput) queries.push("memberships members list member details email membership type Filter Active Members Filter Columns Download CSV Members member reports Member Categories Member Filters member email addresses");
    if (lower.includes("flexi") || lower.includes("flexible")) queries.push("flexible membership flexi membership type membership types Flex checkbox CREATE MEMBERSHIP TYPE member profile account balances wallets");
    if (lower.includes("refund")) queries.push("membership bill payment refund member billing payments");
  }
  if (wantsDataOutput) queries.push("reports export download csv spreadsheet filters columns Type of Report member email addresses contact details report");
  if (intent.topic === "payments") queries.push("BRS Payments transactions refunds payment requests payouts");
  if (intent.topic === "teesheet") queries.push("tee sheet booking timesheet visitor green fee competition entry");
  if (intent.topic === "user-management") queries.push("users permissions staff admin role login password");
  if (intent.topic === "admin-setup") queries.push("reports settings configuration email text GDPR printer buggy device");
  if (lower.includes("competition")) queries.push("competition setup open competition member visitor booking fees purse");
  return [...new Set(queries.map((query) => query.trim()).filter((query) => query.length > 2))].slice(0, 10);
}

async function searchHelpCenter(query) {
  const cleanedQuery = query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleanedQuery || cleanedQuery.length < 3) return [];
  const cached = helpCenterCache.get(cleanedQuery);
  if (cached && Date.now() - cached.createdAt < HELP_CENTER_CACHE_TTL_MS) return cached.articles;
  const params = new URLSearchParams({ query: cleanedQuery, locale: "en-us", per_page: "4" });
  const payload = await fetchJson(`${HELP_CENTER_SEARCH_URL}?${params.toString()}`);
  const articles = (payload?.results || [])
    .filter((article) => article.result_type === "article" && article.title && article.html_url && article.body)
    .map((article) => ({ sourceType: "help", title: article.title, area: null, navigationPath: null, sourceUrl: article.html_url, url: article.html_url, updatedAt: article.updated_at, content: truncateText(stripHtml(article.body)), query: cleanedQuery }))
    .slice(0, 4);
  // Evict oldest entries if cache exceeds size limit.
  if (helpCenterCache.size >= HELP_CENTER_CACHE_MAX_SIZE) {
    const oldest = [...helpCenterCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < Math.ceil(HELP_CENTER_CACHE_MAX_SIZE * 0.2); i++) {
      helpCenterCache.delete(oldest[i][0]);
    }
  }
  helpCenterCache.set(cleanedQuery, { createdAt: Date.now(), articles });
  return articles;
}

function scoreText(query, text) {
  const haystack = new Set(tokenize(text));
  return tokenize(query).reduce((score, token) => score + (haystack.has(token) ? 1 : 0), 0);
}

function evidenceTopic(entry) {
  return inferTopic([entry.title, entry.area, entry.navigationPath, entry.content, ...(entry.tags || [])].join(" "));
}

function crossTopicPenalty(intent, entry) {
  const text = normalise([entry.title, entry.area, entry.navigationPath, entry.content, entry.sourceUrl].join(" "));
  const object = normalise(`${intent.object || ""} ${intent.task || ""}`);
  let penalty = 0;
  if (intent.topic === "memberships" && !object.includes("competition") && hasAny(text, ["competition purse", "open competition", "competition entry"])) penalty += 20;
  if ((object.includes("bill") || object.includes("invoice") || object.includes("subscription")) && hasAny(text, ["competition purse", "green fee", "tee time", "visitor booking"])) penalty += 10;
  if ((object.includes("booking") || object.includes("tee time")) && hasAny(text, ["membership bill", "subscription cycle", "member billing"])) penalty += 8;
  return penalty;
}

function rankEvidence(entries, message, intent) {
  const query = [message, intent.topic, intent.task, intent.object, ...(intent.queryTerms || [])].join(" ");
  return entries
    .map((entry) => {
      const topic = evidenceTopic(entry);
      const base = SOURCE_WEIGHT[entry.sourceType] || (entry.confidence === "approved" ? 4 : 1);
      const topicBonus = topic === intent.topic ? 8 : intent.topic === "general" ? 0 : -4;
      const allText = [entry.title, entry.area, entry.navigationPath, entry.content, ...(entry.tags || [])].join(" ");
      const reportBonus = intent.task === "report" && hasAny(normalise(allText), ["report", "dashboard", "billing", "unpaid", "outstanding", "export", "download", "filter", "billing/payments", "billing overview"]) ? 6 : 0;
      const score = base + topicBonus + reportBonus + scoreText(query, allText) - crossTopicPenalty(intent, entry);
      return { ...entry, topic, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function getHelpCenterContext(message, intent) {
  const batches = await Promise.all(buildSearchQueries(message, intent).map(searchHelpCenter));
  const byUrl = new Map();
  for (const article of batches.flat()) if (!byUrl.has(article.sourceUrl)) byUrl.set(article.sourceUrl, article);
  const articles = rankEvidence([...byUrl.values()], message, intent).slice(0, 4);
  return {
    articles,
    context: articles.map((article, index) => `ARTICLE ${index + 1}: ${article.title}\nURL: ${article.sourceUrl}\nUPDATED: ${article.updatedAt || "Unknown"}\nMATCHED QUERY: ${article.query || "Unknown"}\nTEXT:\n${article.content}`).join("\n\n---\n\n"),
  };
}

function deterministicMembershipReportReply(message) {
  return approvedMemberBalanceReportReply(message);
}

function extractEvidenceSpecifics(evidence = "", entries = []) {
  const text = [evidence, ...entries.map((entry) => [entry.title, entry.area, entry.navigationPath, entry.content, ...(entry.tags || [])].join(" \n"))].join("\n");
  const lines = text.split(/\n|\.|;/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const reports = unique(lines.filter((line) => /report|dashboard|billing overview|create bills|billing\/payments|billing payments|member categories|member email addresses/i.test(line)).slice(0, 20), 12);
  const filters = unique(lines.filter((line) => /filter|membership type|category|categories|status|unpaid|outstanding|failed|paid|date range|billing cycle|period|scheduled/i.test(line)).slice(0, 24), 14);
  const columns = unique(lines.flatMap((line) => {
    const matches = line.match(/\b(title|first name|last name|email|email address|member name|member|membership type|membership status|bill|invoice|amount|balance|balance due|due date|status|payment status|paid|unpaid|scheduled|failed|date|billing cycle|subscription)\b/gi) || [];
    return matches;
  }), 14);
  const exports = unique(lines.filter((line) => /export|download|csv|excel|spreadsheet|print/i.test(line)).slice(0, 16), 8);
  const paths = unique(lines.filter((line) => />>| > |go to|open the|navigate|memberships|reports|billing\/payments|dashboard/i.test(line)).slice(0, 20), 10);
  return { reports, filters, columns, exports, paths };
}

function formatEvidenceSpecificsPack(specifics = {}) {
  const sections = [
    specifics.paths?.length ? `Observed/likely navigation hints:\n- ${specifics.paths.join("\n- ")}` : null,
    specifics.reports?.length ? `Relevant report/views found in evidence:\n- ${specifics.reports.join("\n- ")}` : null,
    specifics.filters?.length ? `Filters/statuses/date controls found in evidence:\n- ${specifics.filters.join("\n- ")}` : null,
    specifics.columns?.length ? `Fields/columns to tell the user to check:\n- ${specifics.columns.join("\n- ")}` : null,
    specifics.exports?.length ? `Export/download evidence:\n- ${specifics.exports.join("\n- ")}` : null,
  ].filter(Boolean);
  return sections.length ? sections.join("\n\n") : "";
}

async function readApprovedSupportFiles() {
  if (_approvedSupportFilesCache) return _approvedSupportFilesCache;
  const dataDir = path.join(process.cwd(), "data", "knowledge");
  try {
    const files = await fs.readdir(dataDir);
    const entries = await Promise.all(files.filter((file) => file.endsWith(".txt")).map(async (file) => ({
      sourceType: "local",
      title: file.replace(/\.txt$/, ""),
      content: await fs.readFile(path.join(dataDir, file), "utf-8"),
      confidence: "approved",
    })));
    _approvedSupportFilesCache = entries;
    return entries;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function getApprovedSupportContext(message, intent) {
  const allEntries = await readApprovedSupportFiles();
  const rankedEntries = rankEvidence(allEntries, message, intent);
  const rankedIds = new Set(rankedEntries.slice(0, 6).map((entry) => entry.title));
  const sectionOverview = allEntries
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((entry) => {
      const purpose = entry.content.split(/\r?\n/).find((line) => /^Use this file for/i.test(line)) || "Use this file for this BRS area.";
      return `- ${entry.title}: ${purpose}`;
    })
    .join("\n");
  const detailedEntries = [
    ...rankedEntries.slice(0, 6),
    ...allEntries.filter((entry) => !rankedIds.has(entry.title)).slice(0, 2),
  ];
  const details = detailedEntries
    .map((entry) => `LOCAL SUPPORT FILE: ${entry.title}\nTOPIC FIT: ${entry.topic || evidenceTopic(entry)}\nSCORE: ${entry.score ?? 0}\n${truncateText(entry.content, rankedIds.has(entry.title) ? 1400 : 700)}`)
    .join("\n\n---\n\n");
  return [
    `ALL LOCAL SUPPORT SECTIONS AVAILABLE FOR CROSS-CHECKING:\n${sectionOverview}`,
    details,
  ].filter(Boolean).join("\n\n---\n\n");
}

async function readDecisionTreeFile(file) {
  if (decisionTreeCache.has(file)) return decisionTreeCache.get(file);
  try {
    const content = await fs.readFile(path.join(process.cwd(), "data", "decision-trees", `${file}-decision-tree.txt`), "utf-8");
    decisionTreeCache.set(file, content);
    return content;
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function getDecisionTreeContext(evidencePlan = {}) {
  const files = unique((evidencePlan.candidateTopics || []).flatMap((topic) => TOPIC_DECISION_TREE_FILES[topic] || [topic]), 10);
  const sections = [];
  for (const file of files) {
    const content = await readDecisionTreeFile(file);
    if (!content) continue;
    sections.push(`DECISION TREE: ${file}\n${truncateText(content, 1400)}`);
  }
  return sections.join("\n\n---\n\n");
}

function titleFromStaticReply(reply = "") {
  return String(reply || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "Approved static support snippet";
}

function formatStaticEvidence(reply = "") {
  if (!reply) return "";
  return `APPROVED STATIC SUPPORT SNIPPET: ${titleFromStaticReply(reply)}\nUse this as vetted evidence, not as final wording. Prefer the final answer generator unless this is a locked safety/escalation response.\n${reply}`;
}

function addComposition(composition, type, text = "", count = 1) {
  const chars = String(text || "").length;
  if (!chars) return;
  composition.sourceCharacters[type] = (composition.sourceCharacters[type] || 0) + chars;
  composition.sourceCounts[type] = (composition.sourceCounts[type] || 0) + count;
  composition.totalEvidenceCharacters += chars;
}

function buildAnswerComposition({ mode, evidencePlan = {}, staticReply = "", usefulLocalEntries = [], approvedSupportContext = "", helpCenter = {}, decisionTreeContext = "", liveEvidence = "" } = {}) {
  const composition = {
    mode,
    questionType: evidencePlan.questionType || null,
    candidateAreas: evidencePlan.candidateAreas || [],
    useMultipleAreas: Boolean(evidencePlan.useMultipleAreas),
    sourceCounts: {},
    sourceCharacters: {},
    totalEvidenceCharacters: 0,
    staticShare: 0,
    staticFallbackUsed: mode === "static-fallback",
    lockedStaticUsed: mode === "locked-static",
    recommendCrawlEnhancement: false,
  };

  addComposition(composition, "static", staticReply);
  for (const entry of usefulLocalEntries) addComposition(composition, entry.sourceType || "workflow", entry.content || entry.title || "");
  addComposition(composition, "local-guidance", approvedSupportContext);
  addComposition(composition, "help-center", helpCenter.context || "");
  addComposition(composition, "decision-tree", decisionTreeContext);
  addComposition(composition, "live-evidence", liveEvidence);

  composition.staticShare = composition.totalEvidenceCharacters
    ? Number(((composition.sourceCharacters.static || 0) / composition.totalEvidenceCharacters).toFixed(3))
    : 0;
  composition.recommendCrawlEnhancement = composition.staticFallbackUsed || composition.staticShare >= 0.5;
  return composition;
}

function knowledgeResult(reply, composition, extras = {}) {
  if (!reply) return null;
  return {
    reply,
    answerComposition: composition || null,
    ...extras,
  };
}

function isLockedStaticReply(message = "", reply = "") {
  const lower = normalise(message);
  if (!reply) return false;
  if (isMoveBookingQuestion(message) || isMemberBalanceReportQuestion(message)) return true;
  if (/\bdelete\b/.test(lower) && hasAny(lower, ["all bookings", "all tee times", "next month"])) return true;
  if (hasAny(lower, ["superuser", "super user"])) return true;
  if (isVerifiedStaticReply(message, reply)) return true;
  if (/I can't provide bulk-delete instructions|Superusers can only be created by a BRS employee/i.test(reply)) return true;
  return false;
}

function isTooBroad(message) {
  const lower = normalise(message);
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  return wordCount <= 4 && /^(help|setup|issue|problem|booking|payment|member|competition|report|user)$/.test(lower.replace(/\s+/g, " "));
}

function shouldAttemptKnowledgeAnswer(message) {
  if (!message || isTooBroad(message)) return false;
  if (/^clarification answer:/i.test(message)) return false;
  if (/^(thanks|thank you|sorted|all good|that worked)\b/i.test(message)) return false;
  return true;
}

export function isBRSWorkflowQuestion(message = "") {
  if (isConceptualSupportQuestion(message)) return false;
  const lower = normalise(message);
  const asksWorkflow = /\b(how|where|which|what|show|see|find|list|report|filter|export|download|add|enter|delete|remove|cancel|change|edit|configure|set up|setup|refund|reverse|run|open)\b/.test(lower);
  const productArea = /\b(brs|member|membership|bill|payment|refund|booking|tee|timesheet|teesheet|competition|comp|captain'?s prize|medal|scratch cup|report|user|admin|staff|setting|configuration|service|buggy|buggies|caddie|caddy|club hire|trolley|facility|contact|message|visitor|green fee)\b/.test(lower);
  return asksWorkflow && productArea;
}

function hasWorkflowShape(reply = "") {
  return WORKFLOW_STEP_PATTERN.test(reply);
}

function compactEvidence(...sections) {
  const text = sections.filter(Boolean).join("\n\n---\n\n");
  return truncateText(text, MAX_EVIDENCE_CHARS);
}

function hasContactIntent(lower) {
  return hasAny(lower, ["contact", "contact details", "phone", "phone number", "telephone", "email", "email address", "call", "ring", "speak to", "talk to", "reach", "get in touch", "opening hours", "hours"]);
}

function deterministicContactReply(message) {
  const lower = normalise(message);
  const mentionsBrs = hasAny(lower, ["brs", "brs golf"]);
  const mentionsGolfNow = hasAny(lower, ["golf now", "golfnow", "golfnow business"]);
  if (!hasContactIntent(lower)) return null;
  if (mentionsGolfNow && !mentionsBrs) return GOLF_NOW_SUPPORT_REPLY;
  const supportIdentityTerms = ["brs support", "brs customer support", "brs technical support", "brs helpdesk", "support team", "customer support", "technical support", "helpdesk", "support agent"];
  const productContactTerms = [
    "contact categor",
    "contact record",
    "contact records",
    "contact list",
    "contact report",
    "view contacts",
    "add contact",
    "email contacts",
    "text contacts",
    "club contact details",
    "upload members and contacts",
  ];
  if (hasAny(lower, productContactTerms) && !hasAny(lower, supportIdentityTerms)) return null;
  return hasAny(lower, supportIdentityTerms) || mentionsBrs ? BRS_SUPPORT_CONTACT_REPLY : null;
}

function deterministicTimesheetSetupReply(message) {
  const lower = normalise(message);
  const asksForGuidance = /^(how|where|what|can you show|can you explain|help)/.test(lower)
    || hasAny(lower, ["how do i", "how to", "where do i", "steps", "guide", "instructions"]);
  const mentionsTimesheetSetup = hasAny(lower, [
    "configure timesheet",
    "configure the timesheet",
    "conifgure timesheet",
    "conifgure the timesheet",
    "configur timesheet",
    "configur the timesheet",
    "timesheet setup",
    "set up timesheet",
    "setup timesheet",
    "tee sheet setup",
    "configure tee sheet",
    "configure teesheet",
    "conifgure tee sheet",
    "conifgure teesheet",
  ]);

  if (!asksForGuidance || !mentionsTimesheetSetup) return null;

  return `To configure the BRS timesheet, go to:
Tools >> Configure Timesheet

Then:
1. Choose the operation you want to run.
2. Select the year and the date range.
3. Set the first and last tee time.
4. Choose the tee time interval.
5. Select the days of the week you want to configure.
6. Click Configure the Timesheet.

For example, configure weekdays and weekends separately when they need different tee time intervals.`;
}

function getRefundContext(message) {
  const lower = normalise(message);
  if (!lower.includes("refund")) return null;
  if (hasAny(lower, ["membership bill", "member bill", "members bill", "member's bill", "members' bill", "bill payment", "payment on a bill", "payment on bill", "membership payment", "subscription payment", "member profile", "billing"]) || /\bbills?\b/.test(lower)) return "membership-bill";
  if (hasAny(lower, ["booking", "tee time", "tee sheet", "teesheet", "golfer", "visitor booking", "booking details"])) return "booking";
  if (hasAny(lower, ["general payment request", "payment request", "non-booking payment", "miscellaneous payment"])) return "general-payment-request";
  return "unknown";
}

function deterministicRefundReply(message) {
  const refundContext = getRefundContext(message);
  if (!refundContext) return null;
  if (refundContext === "unknown") return "What is the payment attached to: a booking, a membership bill, or a general payment request?";
  if (refundContext === "booking") return null;
  if (refundContext === "general-payment-request") {
    return `Refund a General Payment Request

1. Go to Tools >> BRS Payments >> Transactions.
2. Search for the payment request transaction.
3. Confirm the customer, amount, date, and payment status.
4. Confirm the transaction was taken through BRS Payments. Payments taken by cash, PDQ, cheque, or another non-BRS method cannot be refunded through BRS.
5. Use the Refund action on the correct transaction.
6. For a partial refund, enter only the amount that should be returned, then enter a reason if required and confirm the refund.`;
  }
  return `Refund a Payment on a Membership Bill

1. Open Memberships from the main navigation menu.
2. Find and open the relevant member profile.
3. Open the member's Billing area, then open the bill that contains the payment.
4. Open the Payments section for that bill and confirm the payment is attached to the correct member bill.
5. Confirm the payment was taken through BRS Payments. Payments taken by cash, PDQ, cheque, or another non-BRS method cannot be refunded through BRS.
6. Use the Refund action on the correct bill payment.
7. For a partial refund, enter only the amount that should be returned, then enter a reason if required and confirm the refund.

Check:
Before refunding, check the bill/payment allocation so you do not refund the wrong payment or leave the bill balance in an unexpected state.

Processed refunds can be found under Tools >> BRS Payments >> Refunds.`;
}

async function verifyReply(message, intent, evidence, reply) {
  if (!reply || reply === UNKNOWN_REPLY) return false;
  if (isMoveBookingQuestion(message) && hasForbiddenMoveBookingAdvice(reply)) return false;
  const client = getOpenAiClient();
  if (!client) return false;
  try {
    const response = await withTimeout(
      () => client.responses.create({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: `Reply exactly SUPPORTED or UNSUPPORTED.

Unsupported means:
- The answer uses unrelated evidence.
- The answer confuses membership bills with competition purse, or membership bill refunds with booking refunds.
- The answer invents BRS UI paths, screens, fields, buttons, actions, or ordering not directly present in evidence.
- The answer uses uncertainty phrases such as "may be", "likely", "usually", "if available", or "look for" to bridge a missing workflow step.
- A numbered workflow step is not directly supported by supplied evidence.

Supported means every menu path, field, control, report, export, filter, and workflow step is directly named or explicitly described in the supplied evidence. If the evidence is only partial, reply UNSUPPORTED.` },
          { role: "user", content: `QUESTION:\n${message}\n\nINTENT:\n${JSON.stringify(intent)}\n\nEVIDENCE:\n${evidence}\n\nANSWER:\n${reply}` },
        ],
      }),
      { label: "verifyReply", fallback: null }
    );
    if (!response) return false;
    return response.output_text?.trim().toUpperCase() === "SUPPORTED";
  } catch (error) {
    console.error("Knowledge answer verification failed:", error);
    return false;
  }
}

async function verifyContextualSupportReply(message, intent, evidence, reply, profile = {}) {
  if (!reply || reply === UNKNOWN_REPLY) return false;
  if (contextualAnswerIssue(message, reply)) return false;
  if (/\b(i fixed|i have fixed|i changed|i updated|i refunded|i deleted|i can see in your live system|the live club system shows)\b/i.test(reply)) return false;
  const client = getOpenAiClient();
  if (!client) return true;
  try {
    const response = await withTimeout(
      () => client.responses.create({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: `Reply exactly SUPPORTED or UNSUPPORTED.

Supported means:
- The answer uses the whole user question and reflects specific facts from it.
- The answer treats workflows as evidence for checks/advice, not as a copied final answer.
- The answer does not claim access to the customer's live club system.
- The answer does not claim a final cause when live club data is needed.
- The answer gives confidence and concrete next checks or escalation details.

Unsupported means:
- The answer returns a generic workflow that ignores the customer's scenario.
- The answer confuses the product area or tells the user to follow an unrelated workflow.
- The answer claims a live fix, live lookup, refund, deletion, or configuration change was done.
- The answer invents exact live club data, prices, policies, UI fields, or step order not present in evidence.` },
          { role: "user", content: `QUESTION:\n${message}\n\nCONTEXT PROFILE:\n${JSON.stringify(profile)}\n\nINTENT:\n${JSON.stringify(intent)}\n\nEVIDENCE:\n${evidence}\n\nANSWER:\n${reply}` },
        ],
      }),
      { label: "verifyContextualSupportReply", fallback: null }
    );
    if (!response) return false;
    return response.output_text?.trim().toUpperCase() === "SUPPORTED";
  } catch (error) {
    console.error("Contextual support answer verification failed:", error);
    return false;
  }
}

export async function answerFromLiveEvidence(message, liveResult = {}) {
  if (!liveResult?.successful) return null;
  const liveEvidence = formatLiveEvidence(liveResult);
  if (!liveEvidence) return null;

  const intent = await classifySupportIntent(message);
  const approvedSupportContext = await getApprovedSupportContext(message, intent).catch((error) => {
    console.error("Live evidence support-context lookup failed:", error);
    return "";
  });
  const evidence = compactEvidence(
    `LIVE READ-ONLY BRS DEMO SYSTEM EVIDENCE:\n${liveEvidence}`,
    approvedSupportContext && `APPROVED LOCAL SUPPORT GUIDANCE FOR CROSS-CHECKING ONLY:\n${approvedSupportContext}`,
  );
  const client = getOpenAiClient();
  if (!client || !evidence) return null;

  const response = await withTimeout(
    () => client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: `You are a technical support assistant for BRS Golf customers. The stored knowledge base did not contain a complete answer, so you are using fresh read-only BRS demo-system evidence as a safety net.

Rules:
- Answer only from LIVE READ-ONLY BRS DEMO SYSTEM EVIDENCE and directly compatible approved support guidance.
- Live evidence is enough only when it names the relevant page, control, field, table column, or navigation item needed for the user's task.
- Use exact BRS UI labels in double quotes.
- Give a short title and a numbered list of directly proven steps.
- When telling the user to click, open, choose, filter, export, print, or inspect a control, include the proven page or screen location in the same step.
- Do not use live member names, balances, booking data, message content, rates, or other club-specific values.
- Do not click or instruct destructive actions unless the evidence directly proves the action and the request requires it.
- If the live evidence is only a launcher page, a broad navigation page, or does not prove the requested workflow, reply exactly: ${UNKNOWN_REPLY}.`,
        },
        { role: "user", content: `CLASSIFIED INTENT:\n${JSON.stringify(intent, null, 2)}\n\nUSER QUESTION:\n${message}\n\nEVIDENCE:\n${evidence}` },
      ],
    }),
    { label: "answerFromLiveEvidence", fallback: null }
  );

  const reply = response?.output_text?.trim();
  if (!reply || reply === UNKNOWN_REPLY) return null;
  const supported = await verifyReply(message, intent, evidence, reply);
  if (!supported) return null;
  if (isBRSWorkflowQuestion(message) && !hasWorkflowShape(reply)) return null;
  return { reply, intent, evidence };
}

export async function answerFromKnowledgeDetailed(message, options = {}) {
  const {
    allowDynamic = true,
    contextProfile: providedContextProfile = null,
    forceContextualSynthesis = false,
    routingEvidence = [],
  } = options;
  const contextProfile = providedContextProfile || buildQuestionContextProfile(message);
  const requiresContextualSynthesis = Boolean(forceContextualSynthesis || contextProfile.requiresContextualSynthesis);
  const seedIntent = keywordIntent(message);
  let evidencePlan = buildEvidencePlan(message, seedIntent);

  if (!requiresContextualSynthesis && isMoveBookingQuestion(message)) {
    const reply = approvedMoveBookingReply(message);
    return knowledgeResult(reply, buildAnswerComposition({ mode: "locked-static", evidencePlan, staticReply: reply }), { route: "locked-move-booking" });
  }

  if (!requiresContextualSynthesis && isMemberBalanceReportQuestion(message)) {
    const reply = deterministicMembershipReportReply(message);
    return knowledgeResult(reply, buildAnswerComposition({ mode: "locked-static", evidencePlan, staticReply: reply }), { route: "locked-member-balance-report" });
  }

  let staticWorkflowReply = approvedStaticWorkflowReply(message);
  const staticIntentEvaluation = evaluateStaticAnswerAgainstIntent(message, staticWorkflowReply);
  if (!staticIntentEvaluation.allowed) staticWorkflowReply = "";
  if (!requiresContextualSynthesis && isLockedStaticReply(message, staticWorkflowReply)) {
    return knowledgeResult(staticWorkflowReply, buildAnswerComposition({ mode: "locked-static", evidencePlan, staticReply: staticWorkflowReply }), { route: "locked-static-safety" });
  }

  const contactReply = deterministicContactReply(message);
  const timesheetSetupReply = deterministicTimesheetSetupReply(message);
  const membershipReportReply = deterministicMembershipReportReply(message);
  const deterministicRefund = deterministicRefundReply(message);
  const fallbackReply = requiresContextualSynthesis ? "" : staticWorkflowReply || contactReply || timesheetSetupReply || membershipReportReply || deterministicRefund;
  const contextualFallback = () => knowledgeResult(
    buildContextualSupportFallbackReply({ message, profile: contextProfile }),
    buildAnswerComposition({ mode: "contextual-support-fallback", evidencePlan, staticReply: staticWorkflowReply }),
    { intent: seedIntent, route: "contextual-support-fallback", contextProfile }
  );

  if (!allowDynamic) {
    if (requiresContextualSynthesis) return contextualFallback();
    return fallbackReply
      ? knowledgeResult(fallbackReply, buildAnswerComposition({ mode: "static-fallback", evidencePlan, staticReply: fallbackReply }), { route: "static-fallback-dynamic-disabled" })
      : null;
  }

  if (!shouldAttemptKnowledgeAnswer(message)) {
    if (requiresContextualSynthesis) return contextualFallback();
    return fallbackReply
      ? knowledgeResult(fallbackReply, buildAnswerComposition({ mode: "static-fallback", evidencePlan, staticReply: fallbackReply }), { route: "static-fallback-non-attemptable" })
      : null;
  }

  const client = getOpenAiClient();
  if (!client) {
    if (requiresContextualSynthesis) return contextualFallback();
    return fallbackReply
      ? knowledgeResult(fallbackReply, buildAnswerComposition({ mode: "static-fallback", evidencePlan, staticReply: fallbackReply }), { route: "static-fallback-no-openai" })
      : null;
  }

  if (!isBRSWorkflowQuestion(message)) {
    // Conceptual and non-workflow support questions still use the synthesis path
    // when dynamic generation is available. Deterministic replies remain as a
    // fallback if retrieval or verification cannot support a fresh answer.
  }

  const intent = await classifySupportIntent(message);
  evidencePlan = buildEvidencePlan(message, intent);
  if (intent.needsClarification && Number(intent.confidence || 0) < 0.65) {
    if (requiresContextualSynthesis && contextProfile.facts?.length) {
      // Do not turn rich customer cases into broad clarification loops when
      // the question already contains enough facts to give checks and context.
    } else {
    const reply = intent.clarifyingQuestion || "Can you confirm which BRS area this is about?";
    return knowledgeResult(reply, buildAnswerComposition({ mode: "clarification", evidencePlan, staticReply: "" }), { intent, route: "intent-clarification" });
    }
  }

  const [localEntriesRaw, helpCenter, approvedSupportContext, decisionTreeContext] = await Promise.all([
    retrieveKnowledge(evidencePlan.queryTerms.join(" "), { limit: 24 }),
    getHelpCenterContext(message, intent),
    getApprovedSupportContext(message, intent),
    getDecisionTreeContext(evidencePlan),
  ]);

  const usefulLocalEntries = rankEvidence(localEntriesRaw.filter((entry) => entry.confidence === "approved"), message, intent).slice(0, 8);
  const localKnowledgeContext = formatRetrievedSources(usefulLocalEntries);
  const baseEvidence = compactEvidence(
    `QUESTION SYNTHESIS AND EVIDENCE PLAN:\n${JSON.stringify({ intent, evidencePlan }, null, 2)}`,
    requiresContextualSynthesis && `QUESTION CONTEXT PROFILE:\n${JSON.stringify(contextProfile, null, 2)}`,
    staticWorkflowReply && formatStaticEvidence(staticWorkflowReply),
    routingEvidence?.length && `ROUTING CANDIDATES TO VERIFY OR REJECT:\n${routingEvidence.filter(Boolean).join("\n\n---\n\n")}`,
    localKnowledgeContext && `APPROVED BRS DEMO SYSTEM KNOWLEDGE:\n${localKnowledgeContext}`,
    approvedSupportContext && `APPROVED LOCAL SUPPORT GUIDANCE:\n${approvedSupportContext}`,
    decisionTreeContext && `DECISION TREE ROUTING HINTS:\nUse these only to decide which BRS areas and workflows to consider. Do not treat decision-tree text alone as proof of a UI control or workflow step.\n${decisionTreeContext}`,
    helpCenter.context && `BRS HELP CENTER ARTICLES:\n${helpCenter.context}`,
  );

  if (!baseEvidence) {
    if (requiresContextualSynthesis) return contextualFallback();
    return fallbackReply
      ? knowledgeResult(fallbackReply, buildAnswerComposition({ mode: "static-fallback", evidencePlan, staticReply: fallbackReply }), { intent, route: "static-fallback-no-evidence" })
      : null;
  }

  const specificsPack = formatEvidenceSpecificsPack(extractEvidenceSpecifics(baseEvidence, usefulLocalEntries));
  const evidence = compactEvidence(
    specificsPack && `EXTRACTED WORKFLOW SPECIFICS TO USE IF RELEVANT:\n${specificsPack}`,
    baseEvidence,
  );
  const dynamicComposition = buildAnswerComposition({
    mode: "dynamic-synthesis",
    evidencePlan,
    staticReply: staticWorkflowReply,
    usefulLocalEntries,
    approvedSupportContext,
    helpCenter,
    decisionTreeContext,
  });

  const response = await withTimeout(
    () => client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: `You are a technical support assistant for BRS Golf customers: golf club admins and staff using BRS to manage their own club. Give customer-facing instructions for the person operating BRS, not internal notes for another support agent.

Use this required flow internally:
1. Read QUESTION SYNTHESIS AND EVIDENCE PLAN.
2. Use decision-tree hints only to decide which evidence areas may matter.
3. Gather the answer from all relevant approved evidence sections, including multiple BRS areas or workflows when the user's question needs them.
4. Generate a fresh answer in your own words.
5. Do not copy static snippets verbatim unless the exact label/path/warning must stay unchanged.

Use strict evidence-led routing: answer only from supplied evidence that directly proves the classified topic/object and workflow.

Evidence priority:
- Treat APPROVED BRS DEMO SYSTEM KNOWLEDGE as the primary source for menu names, page titles, field labels, table columns, buttons/actions, and step order because it reflects the actual system UI.
- Use APPROVED LOCAL SUPPORT GUIDANCE only when it does not conflict with demo system labels and helps explain a proven workflow.
- Use BRS HELP CENTER ARTICLES only to fill gaps or provide supporting context; do not let Help Center wording override labels or navigation observed in the demo system.
- Use APPROVED STATIC SUPPORT SNIPPET as vetted evidence. It is not the final answer format unless no dynamic answer can be verified.
- Use DECISION TREE ROUTING HINTS to choose or reject candidate routes. They are not standalone proof of a UI label, button, field, or exact workflow step.
- Use ROUTING CANDIDATES only as possible evidence to verify or reject. Do not copy a routing candidate as the final answer just because its title sounds related.
- If a field/control label is visible in demo system evidence, use that exact wording in the answer.
- Put exact BRS UI labels, menu names, page names, field names, button names, report names, and table column names in double quotes so the customer can match them to the screen.

Answer style:
- Always tailor the answer to the user's exact question, including named records, dates, amounts, courses, member types, symptoms, and requested outcome when those details are supplied.
- For context-heavy customer cases, do not return a generic workflow title and steps. Explain what to check, where to check it, what not to assume, your confidence level, and what to escalate with if live club data is needed.
- For live-data requests such as "can you look into this", explain that you cannot inspect the customer's live club system from chat, then give the best specific checks using the details in the question.
- Avoid final-cause wording when live club data is needed. Do not say "the cause is" or "this is likely" unless the supplied evidence proves it. Use "Confidence: high/medium/low" instead.
- Match the question type. For definition or purpose questions, explain what the BRS object is and why/when it is used; do not give setup steps unless the user asks how to set it up.
- Give a complete first answer only when the evidence directly proves the complete workflow.
- For long or context-heavy customer questions, identify the user's intended outcome before choosing the workflow. Do not answer the first matching keyword route when another proven route better satisfies the requested outcome.
- Treat "email address" or "email addresses" as data fields when the user asks for a database, list, report, export, spreadsheet, filters, or columns. Use Email Messaging only when the user is trying to send a message, notification, mailshot, or email content to people.
- When several proven BRS routes could solve the same outcome, synthesize them: recommend the best first route, then give the relevant alternatives with when to use each.
- Use a readable structure: short title, then one numbered list of directly proven steps. Add "Check" or "Export/download" sections only when those controls are directly present in evidence.
- Do not mix bullet points inside numbered workflow steps.
- If the evidence proves multiple routes, explain every proven route separately with its actor/preconditions and outcome. Do not stop at the first route.
- Prefer exact workflow evidence when it directly matches because it records observed navigation, controls, filters, table columns, and actions.
- Use the EXTRACTED WORKFLOW SPECIFICS for report/view names, filters, columns, and export/download wording when present.
- When telling the user to click, open, choose, tick, select, use, save, submit, print, export, or edit a BRS control, include the proven screen location in the same step. Examples of acceptable location detail are "in the main navigation menu", "on the Tools page in the Basic Set Up Requirements section", "above the Timesheet grid", "in the Type of Report dropdown", or "in Booking Details". Do this generally for every supported workflow, not only for one example.
- If the evidence proves a control label but not where it appears on the screen, name the proven page or container and avoid inventing a more specific position.
- First cross-check the ALL LOCAL SUPPORT SECTIONS list only to choose the right evidence source. Do not repeat routing-only notes or unrelated area warnings in the user answer.
- Mention another BRS area only when the user named it, the evidence directly proves it is part of the workflow, or the task genuinely depends on choosing between those areas. Do not add "avoid using X" checks from unrelated support files.
- "Check" sections must contain checks inside the selected workflow only, not internal classification guardrails.
- If exact field labels, controls, or intermediate steps are not proven, do not guess and do not say "if available"; reply exactly with the unknown reply below.
- Treat example-club observations as reusable product behaviour only, never as club-specific settings.
- Do not use competition purse/open competition evidence for membership bill/report/refund questions unless the user explicitly mentions competitions.
- Do not use booking refund guidance for membership bill refunds.
- Do not invent prices, club policies, live club data, member names, balances, UI paths, fields, controls, or step order.
- If the evidence is not enough, reply exactly: ${UNKNOWN_REPLY}.`,
      },
      { role: "user", content: `CLASSIFIED INTENT:\n${JSON.stringify(intent, null, 2)}\n\nQUESTION TYPE: ${evidencePlan.questionType}\nCANDIDATE BRS AREAS:\n- ${evidencePlan.candidateAreas.join("\n- ")}\n\nCONTEXT PROFILE:\n${JSON.stringify(contextProfile, null, 2)}\n\nUSER QUESTION:\n${message}\n\nAPPROVED EVIDENCE:\n${evidence}` },
      ],
    }),
    { label: "generateKnowledgeAnswer", timeoutMs: 15000, fallback: null }
  );
  if (!response) {
    if (requiresContextualSynthesis) return contextualFallback();
    return fallbackReply
      ? knowledgeResult(fallbackReply, buildAnswerComposition({ mode: "static-fallback", evidencePlan, staticReply: fallbackReply, usefulLocalEntries, approvedSupportContext, helpCenter, decisionTreeContext }), { intent, route: "static-fallback-generation-timeout" })
      : null;
  }

  const reply = response.output_text?.trim();
  if (!reply || reply === UNKNOWN_REPLY) {
    if (requiresContextualSynthesis) return contextualFallback();
    return fallbackReply
      ? knowledgeResult(fallbackReply, buildAnswerComposition({ mode: "static-fallback", evidencePlan, staticReply: fallbackReply, usefulLocalEntries, approvedSupportContext, helpCenter, decisionTreeContext }), { intent, route: "static-fallback-unknown" })
      : null;
  }

  const supported = requiresContextualSynthesis
    ? await verifyContextualSupportReply(message, intent, evidence, reply, contextProfile)
    : await verifyReply(message, intent, evidence, reply);
  if (!supported || (!requiresContextualSynthesis && isBRSWorkflowQuestion(message) && !hasWorkflowShape(reply))) {
    if (requiresContextualSynthesis) return contextualFallback();
    return fallbackReply
      ? knowledgeResult(fallbackReply, buildAnswerComposition({ mode: "static-fallback", evidencePlan, staticReply: fallbackReply, usefulLocalEntries, approvedSupportContext, helpCenter, decisionTreeContext }), { intent, route: supported ? "static-fallback-workflow-shape" : "static-fallback-verification-failed" })
      : null;
  }

  let finalReply = reply;
  if (helpCenter.articles.length && !/https:\/\/help\.brsgolf\.com\/hc\/en-us\/articles\//i.test(finalReply)) {
    const article = helpCenter.articles[0];
    finalReply = `${finalReply}\n\nSource: [${article.title}](${article.sourceUrl})`;
  }
  return knowledgeResult(finalReply, dynamicComposition, { intent, route: requiresContextualSynthesis ? "contextual-dynamic-synthesis" : "dynamic-synthesis", contextProfile });
}

export async function answerFromKnowledge(message, options = {}) {
  const result = await answerFromKnowledgeDetailed(message, options);
  return typeof result === "string" ? result : result?.reply || null;
}
