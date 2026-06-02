import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { retrieveKnowledge, formatRetrievedSources } from "./retrieval.js";
import { tokenize } from "./knowledgeSources.js";

const HELP_CENTER_SEARCH_URL = "https://help.brsgolf.com/api/v2/help_center/articles/search.json";
const HELP_CENTER_CACHE_TTL_MS = 1000 * 60 * 30;
const MAX_EVIDENCE_CHARS = 9000;
const UNKNOWN_REPLY = "I don't have enough confirmed information in the BRS Help Center or approved support guidance to answer that accurately. Please check the BRS Help Center or escalate this to support.";
const BRS_SUPPORT_CONTACT_REPLY = `Call us on UK 028 9568 0288 or IE 0353 1800 852 935.
Opening hours are Monday to Friday, 8am through to 5:30pm.
Email the team on support.en@golfnowbusiness.com and we’ll get back to you as soon as possible.

For Golf Now based questions, please contact Golf Now Customer Support.`;
const GOLF_NOW_SUPPORT_REPLY = "For Golf Now based questions, please contact Golf Now Customer Support.";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const helpCenterCache = globalThis.__brsKnowledgeAnswerHelpCenterCache || new Map();
globalThis.__brsKnowledgeAnswerHelpCenterCache = helpCenterCache;

function normalise(value = "") {
  return String(value || "").toLowerCase();
}

function truncateText(value = "", limit = 2200) {
  return value.length > limit ? `${value.slice(0, limit).trim()}...` : value;
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

function buildSearchQueries(message) {
  const lower = normalise(message);
  const queries = [message];
  if (lower.includes("competition")) queries.push("competition setup open competition member visitor booking fees purse");
  if (lower.includes("green fee") || lower.includes("rate")) queries.push("green fee rates visitor member guest society rates");
  if (lower.includes("timesheet") || lower.includes("tee sheet") || lower.includes("tee time")) queries.push("configure timesheet tee times booking timesheet");
  if (lower.includes("facility") || lower.includes("room")) queries.push("facilities booking room reservation resources");
  if (lower.includes("report")) queries.push("reports revenue booking payment course report");
  if (lower.includes("sms") || lower.includes("text")) queries.push("text messages SMS membership contacts timesheet");
  if (lower.includes("email")) queries.push("email messages membership contacts timesheet");
  if (lower.includes("user") || lower.includes("permission") || lower.includes("login")) queries.push("users permissions staff admin read only login");
  if (lower.includes("booking") || lower.includes("visitor") || lower.includes("member")) queries.push("member visitor online booking reservation type availability");
  return [...new Set(queries.map((query) => query.trim()).filter((query) => query.length > 2))].slice(0, 6);
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
    .map((article) => ({ title: article.title, url: article.html_url, updatedAt: article.updated_at, text: truncateText(stripHtml(article.body)), query: cleanedQuery }))
    .slice(0, 4);
  helpCenterCache.set(cleanedQuery, { createdAt: Date.now(), articles });
  return articles;
}

function scoreText(query, text) {
  const haystack = new Set(tokenize(text));
  return tokenize(query).reduce((score, token) => score + (haystack.has(token) ? 1 : 0), 0);
}

async function getHelpCenterContext(message) {
  const batches = await Promise.all(buildSearchQueries(message).map(searchHelpCenter));
  const byUrl = new Map();
  for (const article of batches.flat()) if (!byUrl.has(article.url)) byUrl.set(article.url, article);
  const articles = [...byUrl.values()]
    .map((article) => ({ ...article, score: scoreText(message, `${article.title} ${article.text}`) }))
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    articles,
    context: articles.map((article, index) => `ARTICLE ${index + 1}: ${article.title}\nURL: ${article.url}\nUPDATED: ${article.updatedAt || "Unknown"}\nTEXT:\n${article.text}`).join("\n\n---\n\n"),
  };
}

async function readApprovedSupportFiles() {
  const dataDir = path.join(process.cwd(), "data", "knowledge");
  try {
    const files = await fs.readdir(dataDir);
    const entries = await Promise.all(files.filter((file) => file.endsWith(".txt")).map(async (file) => ({
      title: file.replace(/\.txt$/, ""),
      text: await fs.readFile(path.join(dataDir, file), "utf-8"),
    })));
    return entries;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function getApprovedSupportContext(message) {
  const entries = await readApprovedSupportFiles();
  return entries
    .map((entry) => ({ ...entry, score: scoreText(message, `${entry.title} ${entry.text}`) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => `LOCAL SUPPORT FILE: ${entry.title}\n${truncateText(entry.text, 1800)}`)
    .join("\n\n---\n\n");
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

function compactEvidence(...sections) {
  const text = sections.filter(Boolean).join("\n\n---\n\n");
  return truncateText(text, MAX_EVIDENCE_CHARS);
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function deterministicContactReply(message) {
  const lower = normalise(message);
  const mentionsBrs = hasAny(lower, ["brs", "brs golf"]);
  const mentionsGolfNow = hasAny(lower, ["golf now", "golfnow", "golfnow business"]);
  const supportIdentityTerms = [
    "brs support",
    "brs customer support",
    "brs technical support",
    "brs technical support team",
    "brs helpdesk",
    "brs help desk",
    "support team",
    "customer support",
    "technical support",
    "technical support team",
    "helpdesk",
    "help desk",
    "support agent",
    "support department",
  ];
  const contactIntentTerms = [
    "contact",
    "contact details",
    "contact information",
    "phone",
    "phone number",
    "telephone",
    "number",
    "email",
    "email address",
    "call",
    "ring",
    "speak to",
    "talk to",
    "reach",
    "get in touch",
    "message",
    "opening hours",
    "hours",
    "open",
    "available",
    "availability",
    "details",
    "info",
    "infor",
  ];
  const hasContactIntent = hasAny(lower, contactIntentTerms);
  if (!hasContactIntent) return null;
  if (mentionsGolfNow && !mentionsBrs) return GOLF_NOW_SUPPORT_REPLY;
  const hasSupportIdentity = hasAny(lower, supportIdentityTerms) || mentionsBrs;
  return hasSupportIdentity ? BRS_SUPPORT_CONTACT_REPLY : null;
}

export async function answerFromKnowledge(message) {
  const deterministicReply = deterministicContactReply(message);
  if (deterministicReply) return deterministicReply;
  if (!shouldAttemptKnowledgeAnswer(message)) return null;

  const [localEntries, helpCenter, approvedSupportContext] = await Promise.all([
    retrieveKnowledge(message, { limit: 8 }),
    getHelpCenterContext(message),
    getApprovedSupportContext(message),
  ]);

  const usefulLocalEntries = localEntries.filter((entry) => entry.confidence === "approved" && entry.score >= 2).slice(0, 6);
  const localKnowledgeContext = formatRetrievedSources(usefulLocalEntries);
  const evidence = compactEvidence(
    helpCenter.context && `BRS HELP CENTER ARTICLES:\n${helpCenter.context}`,
    localKnowledgeContext && `APPROVED BRS PRODUCT KNOWLEDGE:\n${localKnowledgeContext}`,
    approvedSupportContext && `APPROVED LOCAL SUPPORT GUIDANCE:\n${approvedSupportContext}`,
  );

  if (!evidence) return null;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "system",
        content: `You are a technical support agent for BRS Golf admin/staff users. Answer only from the supplied evidence: BRS Help Center articles, approved BRS product knowledge gathered from admin UI templates, and approved local support guidance. Use Help Center articles first when they are directly relevant, then approved product knowledge, then approved local guidance. Treat example-club observations as reusable product behaviour only, never as club-specific settings. Do not invent workflows, buttons, menu paths, prices, club policies, or live club data. If the evidence is not enough, reply exactly: ${UNKNOWN_REPLY}. Keep the answer concise and operational. Ask one next-step question only if needed.`,
      },
      { role: "user", content: `USER QUESTION:\n${message}\n\nAPPROVED EVIDENCE:\n${evidence}` },
    ],
  });

  const reply = response.output_text?.trim();
  if (!reply || reply === UNKNOWN_REPLY) return null;
  if (helpCenter.articles.length && !/https:\/\/help\.brsgolf\.com\/hc\/en-us\/articles\//i.test(reply)) {
    const article = helpCenter.articles[0];
    return `${reply}\n\nSource: [${article.title}](${article.url})`;
  }
  return reply;
}
