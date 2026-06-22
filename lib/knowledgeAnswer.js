import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { retrieveKnowledge, formatRetrievedSources } from "./retrieval.js";
import { tokenize } from "./knowledgeSources.js";
import { approvedMoveBookingReply, hasForbiddenMoveBookingAdvice, isMoveBookingQuestion } from "./bookingWorkflowAnswers.js";
import { approvedMemberBalanceReportReply, isMemberBalanceReportQuestion } from "./membershipWorkflowAnswers.js";
import { approvedStaticWorkflowReply } from "./staticWorkflowAnswers.js";

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

const helpCenterCache = globalThis.__brsKnowledgeAnswerHelpCenterCache || new Map();
globalThis.__brsKnowledgeAnswerHelpCenterCache = helpCenterCache;

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
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `Classify the latest BRS Golf support question for evidence retrieval. Return only JSON with keys: topic, task, object, confidence, needsClarification, clarifyingQuestion, queryTerms. Allowed topics: ${TOPICS.join(", ")}.
Rules:
- membership/member/bill/invoice/subscription/wallet/flexi/unpaid bill/owed money/outstanding balance questions are memberships, even if payment words appear.
- booking/tee time refunds are payments or teesheet only when booking/tee time is explicit.
- competition purse evidence is only relevant when the user explicitly asks about competitions.
- report/list questions keep their business object, e.g. unpaid membership bills or outstanding member balances is memberships/report, not a generic payment issue.
- ask clarification only when multiple product objects are genuinely possible.`,
        },
        { role: "user", content: message },
      ],
    });
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
  if (intent.topic === "memberships") {
    queries.push("membership bill unpaid bills subscriptions member profile billing report flexible membership flexi member outstanding balance arrears owed money");
    queries.push("memberships billing payments dashboard unpaid paid failed scheduled payments billing overview create bills export report");
    if (lower.includes("report") || lower.includes("unpaid") || lower.includes("outstanding") || lower.includes("owe") || lower.includes("owed") || lower.includes("balance")) queries.push("membership reports unpaid bills members outstanding balance billing export download filters status date range billing cycle");
    if (lower.includes("flexi") || lower.includes("flexible")) queries.push("flexible membership flexi member membership tab member profile");
    if (lower.includes("refund")) queries.push("membership bill payment refund member billing payments");
  }
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
  const reports = unique(lines.filter((line) => /report|dashboard|billing overview|create bills|billing\/payments|billing payments/i.test(line)).slice(0, 20), 12);
  const filters = unique(lines.filter((line) => /filter|status|unpaid|outstanding|failed|paid|date range|billing cycle|period|scheduled/i.test(line)).slice(0, 24), 14);
  const columns = unique(lines.flatMap((line) => {
    const matches = line.match(/\b(member name|member|bill|invoice|amount|balance|balance due|due date|status|payment status|paid|unpaid|scheduled|failed|date|billing cycle|subscription)\b/gi) || [];
    return matches;
  }), 14);
  const exports = unique(lines.filter((line) => /export|download|csv|excel|print/i.test(line)).slice(0, 16), 8);
  const paths = unique(lines.filter((line) => />>| > |go to|open the|navigate|memberships|billing\/payments|dashboard/i.test(line)).slice(0, 20), 10);
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
  const dataDir = path.join(process.cwd(), "data", "knowledge");
  try {
    const files = await fs.readdir(dataDir);
    const entries = await Promise.all(files.filter((file) => file.endsWith(".txt")).map(async (file) => ({
      sourceType: "local",
      title: file.replace(/\.txt$/, ""),
      content: await fs.readFile(path.join(dataDir, file), "utf-8"),
      confidence: "approved",
    })));
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
  const lower = normalise(message);
  const asksWorkflow = /\b(how|where|which|what|show|see|find|list|report|filter|export|download|add|change|edit|configure|set up|setup|refund|reverse|run|open)\b/.test(lower);
  const productArea = /\b(brs|member|membership|bill|payment|refund|booking|tee|timesheet|teesheet|competition|report|user|admin|staff|setting|configuration|service|buggy|buggies|caddie|caddy|club hire|trolley|facility|contact|message|visitor|green fee)\b/.test(lower);
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
    const response = await client.responses.create({
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
    });
    return response.output_text?.trim().toUpperCase() === "SUPPORTED";
  } catch (error) {
    console.error("Knowledge answer verification failed:", error);
    return false;
  }
}

export async function answerFromKnowledge(message, options = {}) {
  const { allowDynamic = true } = options;
  const contactReply = deterministicContactReply(message);
  if (contactReply) return contactReply;
  if (isMoveBookingQuestion(message)) return approvedMoveBookingReply(message);
  if (isMemberBalanceReportQuestion(message)) return deterministicMembershipReportReply(message);
  const staticWorkflowReply = approvedStaticWorkflowReply(message);
  if (staticWorkflowReply) return staticWorkflowReply;
  if (!allowDynamic) return null;
  if (!shouldAttemptKnowledgeAnswer(message)) return null;
  if (!isBRSWorkflowQuestion(message)) {
    const timesheetSetupReply = deterministicTimesheetSetupReply(message);
    if (timesheetSetupReply) return timesheetSetupReply;
    const membershipReportReply = deterministicMembershipReportReply(message);
    if (membershipReportReply) return membershipReportReply;
    const deterministicReply = deterministicRefundReply(message);
    if (deterministicReply) return deterministicReply;
  }

  const intent = await classifySupportIntent(message);
  if (intent.needsClarification && Number(intent.confidence || 0) < 0.65) {
    return intent.clarifyingQuestion || "Can you confirm which BRS area this is about?";
  }

  const [localEntriesRaw, helpCenter, approvedSupportContext] = await Promise.all([
    retrieveKnowledge([message, intent.topic, intent.task, intent.object, ...(intent.queryTerms || [])].join(" "), { limit: 18 }),
    getHelpCenterContext(message, intent),
    getApprovedSupportContext(message, intent),
  ]);

  const usefulLocalEntries = rankEvidence(localEntriesRaw.filter((entry) => entry.confidence === "approved"), message, intent).slice(0, 8);
  const localKnowledgeContext = formatRetrievedSources(usefulLocalEntries);
  const baseEvidence = compactEvidence(
    localKnowledgeContext && `APPROVED BRS DEMO SYSTEM KNOWLEDGE:\n${localKnowledgeContext}`,
    approvedSupportContext && `APPROVED LOCAL SUPPORT GUIDANCE:\n${approvedSupportContext}`,
    helpCenter.context && `BRS HELP CENTER ARTICLES:\n${helpCenter.context}`,
  );

  if (!baseEvidence) return null;
  const specificsPack = formatEvidenceSpecificsPack(extractEvidenceSpecifics(baseEvidence, usefulLocalEntries));
  const evidence = compactEvidence(
    specificsPack && `EXTRACTED WORKFLOW SPECIFICS TO USE IF RELEVANT:\n${specificsPack}`,
    baseEvidence,
  );

  const client = getOpenAiClient();
  if (!client) return null;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "system",
        content: `You are a technical support assistant for BRS Golf customers: golf club admins and staff using BRS to manage their own club. Give customer-facing instructions for the person operating BRS, not internal notes for another support agent. Use strict evidence-led routing: answer only from supplied evidence that directly proves the classified topic/object and workflow.

Evidence priority:
- Treat APPROVED BRS DEMO SYSTEM KNOWLEDGE as the primary source for menu names, page titles, field labels, table columns, buttons/actions, and step order because it reflects the actual system UI.
- Use APPROVED LOCAL SUPPORT GUIDANCE only when it does not conflict with demo system labels and helps explain a proven workflow.
- Use BRS HELP CENTER ARTICLES only to fill gaps or provide supporting context; do not let Help Center wording override labels or navigation observed in the demo system.
- If a field/control label is visible in demo system evidence, use that exact wording in the answer.
- Put exact BRS UI labels, menu names, page names, field names, button names, report names, and table column names in double quotes so the customer can match them to the screen.

Answer style:
- Give a complete first answer only when the evidence directly proves the complete workflow.
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
      { role: "user", content: `CLASSIFIED INTENT:\n${JSON.stringify(intent, null, 2)}\n\nUSER QUESTION:\n${message}\n\nAPPROVED EVIDENCE:\n${evidence}` },
    ],
  });

  const reply = response.output_text?.trim();
  if (!reply || reply === UNKNOWN_REPLY) return null;
  const supported = await verifyReply(message, intent, evidence, reply);
  if (!supported) return null;
  if (isBRSWorkflowQuestion(message) && !hasWorkflowShape(reply)) return null;
  if (helpCenter.articles.length && !/https:\/\/help\.brsgolf\.com\/hc\/en-us\/articles\//i.test(reply)) {
    const article = helpCenter.articles[0];
    return `${reply}\n\nSource: [${article.title}](${article.sourceUrl})`;
  }
  return reply;
}
