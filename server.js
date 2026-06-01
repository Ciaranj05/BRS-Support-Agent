import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const APP_VERSION = "supported-clarification-routing-v2";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const SESSION_LIMIT = 1000;
const HELP_CENTER_SEARCH_URL = "https://help.brsgolf.com/api/v2/help_center/articles/search.json";
const HELP_CENTER_CACHE_TTL_MS = 1000 * 60 * 30;
const UNKNOWN_REPLY = "I don't have enough confirmed information in the BRS Help Center or approved support guidance to answer that accurately. Please check the BRS Help Center or escalate this to support.";

const helpCenterCache = globalThis.__brsHelpCenterCache || new Map();
globalThis.__brsHelpCenterCache = helpCenterCache;
const sessions = globalThis.__brsSupportSessions || new Map();
globalThis.__brsSupportSessions = sessions;

const SUPPORTED_CLARIFICATION_PROFILES = {
  "account-create": {
    topic: "general",
    question: "What kind of record are you trying to create?",
    context: "Ambiguous create account request. Supported routes are admin/staff users and member profiles only.",
    options: [
      { label: "Admin or staff user", value: "Clarification answer: Admin or staff user" },
      { label: "Member profile", value: "Clarification answer: Member profile" },
      { label: "I'm not sure", value: "Clarification answer: I'm not sure what kind of record" },
      { label: "Type details instead", value: "Clarification answer: I need to type details instead" },
    ],
  },
  "booking-access": {
    topic: "teesheet",
    question: "What cannot be booked or seen?",
    context: "Online booking or availability issue.",
    options: [
      { label: "Member tee time booking", value: "Clarification answer: Members cannot book tee times online" },
      { label: "Visitor tee time booking", value: "Clarification answer: Visitors cannot book tee times online" },
      { label: "Competition entry", value: "Clarification answer: People cannot book into a competition" },
      { label: "Tee time not visible online", value: "Clarification answer: Tee time is not visible online" },
      { label: "Facility booking", value: "Clarification answer: Facility booking issue" },
      { label: "Type details instead", value: "Clarification answer: I need to type booking availability details" },
    ],
  },
  "booking-change": {
    topic: "teesheet",
    question: "What do you need to do with the booking?",
    context: "Tee sheet booking task.",
    options: [
      { label: "Find missing booking", value: "Clarification answer: Booking cannot be found" },
      { label: "Move a booking", value: "Clarification answer: Move a booking" },
      { label: "Cancel a booking", value: "Clarification answer: Cancel a booking" },
      { label: "Add or remove players", value: "Clarification answer: Add or remove players on a booking" },
      { label: "Check payment status", value: "Clarification answer: Check booking payment status" },
      { label: "Type details instead", value: "Clarification answer: I need to type booking details" },
    ],
  },
  "payment-issue": {
    topic: "payments",
    question: "Which payment issue is closest?",
    context: "Supported payment issue routes.",
    options: [
      { label: "Refund a booking", value: "Clarification answer: Refund a booking" },
      { label: "Customer says they paid", value: "Clarification answer: Customer says they paid but it is not showing" },
      { label: "Payment not showing", value: "Clarification answer: Payment not showing in BRS" },
      { label: "Payment failed", value: "Clarification answer: Payment failed" },
      { label: "Payout or report", value: "Clarification answer: Payment payout or reporting issue" },
      { label: "Payment request", value: "Clarification answer: Payment request" },
    ],
  },
  "membership-issue": {
    topic: "memberships",
    question: "Which membership area is closest?",
    context: "Supported membership routes.",
    options: [
      { label: "Member profile", value: "Clarification answer: Member profile" },
      { label: "Bill", value: "Clarification answer: Member bill issue" },
      { label: "Subscription", value: "Clarification answer: Membership subscription issue" },
      { label: "Subscription cycle", value: "Clarification answer: Subscription cycle setup" },
      { label: "Payment scheme", value: "Clarification answer: Membership payment scheme" },
      { label: "Wallet/account balance", value: "Clarification answer: Wallet or account balance" },
    ],
  },
  "user-access": {
    topic: "user-management",
    question: "Which user or access task is closest?",
    context: "Supported user-management routes.",
    options: [
      { label: "Add a user", value: "Clarification answer: Add an admin or staff user" },
      { label: "Change permissions", value: "Clarification answer: Change user permissions" },
      { label: "Login issue", value: "Clarification answer: User login issue" },
      { label: "Deactivate user", value: "Clarification answer: Deactivate a user" },
      { label: "User limit", value: "Clarification answer: User limit issue" },
      { label: "Which role to use", value: "Clarification answer: Which user role should I use" },
    ],
  },
  "competition-issue": {
    topic: "teesheet",
    question: "Which competition task is closest?",
    context: "Supported competition routes. Open and regular competition guide overlap should stay hidden from users.",
    options: [
      { label: "People cannot book in", value: "Clarification answer: People cannot book into a competition" },
      { label: "Create or edit details", value: "Clarification answer: Create or edit competition details" },
      { label: "Draws or entry sheets", value: "Clarification answer: Competition draws or entry sheets" },
      { label: "Change or cancel entry", value: "Clarification answer: Change or cancel a competition entry" },
      { label: "Purse or payments", value: "Clarification answer: Competition purse or payments" },
    ],
  },
  "setup-issue": {
    topic: "admin-setup",
    question: "Which setup area is closest?",
    context: "Supported setup/configuration routes.",
    options: [
      { label: "Tee sheet setup", value: "Clarification answer: Tee sheet setup" },
      { label: "Green fee rates", value: "Clarification answer: Green fee rates" },
      { label: "Booking rules", value: "Clarification answer: Booking rules" },
      { label: "Buggy booking", value: "Clarification answer: Buggy booking" },
      { label: "Email templates", value: "Clarification answer: Email templates" },
      { label: "Membership/billing settings", value: "Clarification answer: Membership or billing settings" },
    ],
  },
  "admin-comms-reports": {
    topic: "admin-setup",
    question: "Which admin area is closest?",
    context: "Supported reporting, communications, GDPR, and device routes.",
    options: [
      { label: "Reports", value: "Clarification answer: Reports" },
      { label: "Emails or texts", value: "Clarification answer: Emails or text messages" },
      { label: "GDPR", value: "Clarification answer: GDPR request" },
      { label: "Clubhouse PC/device", value: "Clarification answer: Clubhouse PC or device" },
      { label: "Green fee printer", value: "Clarification answer: Green fee printer" },
      { label: "Type details instead", value: "Clarification answer: I need to type admin details" },
    ],
  },
  unsupported: {
    topic: "general",
    question: "I do not have a confirmed route for that yet. Can you add a bit more detail?",
    context: "No supported clarification profile matched.",
    options: [
      { label: "Type details instead", value: "Clarification answer: I need to type more details" },
      { label: "Booking or tee sheet", value: "Clarification answer: Booking or tee sheet issue" },
      { label: "Payment or refund", value: "Clarification answer: Payment or refund issue" },
      { label: "Member or subscription", value: "Clarification answer: Member or subscription issue" },
      { label: "User login or permissions", value: "Clarification answer: User login or permissions issue" },
    ],
  },
};

const PROFILE_DESCRIPTIONS = Object.entries(SUPPORTED_CLARIFICATION_PROFILES)
  .filter(([id]) => id !== "unsupported")
  .map(([id, profile]) => `${id}: ${profile.context}; options: ${profile.options.map((option) => option.label).join(", ")}`)
  .join("\n");

const transactionOptions = [
  { label: "Yes, transaction found", value: "Yes, I found the matching transaction in BRS Payments" },
  { label: "No, no transaction found", value: "No, I cannot find a matching transaction in BRS Payments" },
];

const brsPaymentOptions = [
  { label: "Yes, BRS Payments", value: "The payment was taken through BRS Payments" },
  { label: "No, other payment method", value: "The payment was not taken through BRS Payments" },
];

const fullPartialRefundOptions = [
  { label: "Full Refund", value: "This is a full refund" },
  { label: "Partial Refund", value: "This is a partial refund" },
];

const topicSearchHints = {
  teesheet: ["tee sheet booking timesheet", "booking details", "member visitor booking", "competition booking availability"],
  payments: ["refund online payment", "BRS Payments transactions", "payment request refund", "competition purse payment"],
  memberships: ["member profile membership subscription bill", "member wallet payment scheme", "member online access"],
  "user-management": ["users permissions admin user", "create user reset password", "staff login roles"],
  "admin-setup": ["system configuration setup", "tools system configuration", "reports emails GDPR device printer"],
};

function createDefaultState() {
  return { conversationHistory: [], escalationState: "none", escalationDraft: null, currentTopic: null, clarificationContext: null, clarificationCount: 0, updatedAt: Date.now() };
}

function cleanupSessions() {
  const now = Date.now();
  for (const [sessionId, state] of sessions.entries()) {
    if (!state?.updatedAt || now - state.updatedAt > SESSION_TTL_MS) sessions.delete(sessionId);
  }
  if (sessions.size <= SESSION_LIMIT) return;
  [...sessions.entries()].sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0)).slice(0, sessions.size - SESSION_LIMIT).forEach(([sessionId]) => sessions.delete(sessionId));
}

function getSessionId(req) {
  return (req.headers["x-session-id"] || req.body?.sessionId || req.query?.sessionId || "default-session").toString();
}

function getSessionState(sessionId) {
  cleanupSessions();
  if (!sessions.has(sessionId)) sessions.set(sessionId, createDefaultState());
  const state = sessions.get(sessionId);
  state.updatedAt = Date.now();
  return state;
}

function saveSessionState(sessionId, state) { sessions.set(sessionId, { ...state, updatedAt: Date.now() }); }
function resetSessionState(sessionId) { const freshState = createDefaultState(); sessions.set(sessionId, freshState); return freshState; }
function loadFile(filePath) { const fullPath = path.join(__dirname, filePath); return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : ""; }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

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

function truncateText(value = "", limit = 2200) { return value.length > limit ? `${value.slice(0, limit).trim()}...` : value; }
function uniqueValues(values) { return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]; }

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

function parseJsonArray(text = "") {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
}

async function fetchWithTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "BRS-Support-Agent/1.0" } });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Help Center fetch failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildSearchMessage(message, state = {}) {
  return uniqueValues([state.clarificationContext || "", ...state.conversationHistory.slice(-6).map((item) => item.content || ""), message]).join(" ");
}

function getKeywordSearchQueries(message, topic, state = {}) {
  const lower = message.toLowerCase();
  const queries = [message, ...(topicSearchHints[topic] || []), state.clarificationContext || ""];

  if (lower.includes("account")) queries.push("admin staff user member profile account");
  if (lower.includes("competition")) {
    queries.push("competition setup open competition member visitor booking draw entry sheet purse");
    queries.push("open competitions visitor booking competition entry payment purse");
  }
  if (lower.includes("refund") || lower.includes("refund button") || lower.includes("can't refund") || lower.includes("cannot refund")) {
    queries.push("refund online payment booking details refund button");
    queries.push("BRS Payments refund payment booking");
  }
  if (lower.includes("tee time") || lower.includes("tee times") || lower.includes("timesheet") || lower.includes("tee sheet")) {
    queries.push("configure timesheet tee times");
    queries.push("configure timesheet year not available");
    queries.push("add tee times timesheet");
  }
  if (lower.includes("payment") || lower.includes("paid") || lower.includes("transaction")) {
    queries.push("BRS Payments transactions payment booking");
    queries.push("payment missing booking not showing");
  }
  if (lower.includes("password") || lower.includes("login") || lower.includes("permission") || lower.includes("user")) {
    queries.push("user login permissions reset password");
    queries.push("admin user staff permissions");
  }
  if (lower.includes("member") || lower.includes("membership") || lower.includes("subscription") || lower.includes("bill")) {
    queries.push("membership subscription bill member profile");
    queries.push("member wallet payment scheme");
  }
  if (lower.includes("buggy") || lower.includes("buggies")) {
    queries.push("buggy booking system configuration");
    queries.push("buggy management availability");
  }

  return uniqueValues(queries).slice(0, 10);
}

async function getExpandedSearchQueries(message, topic, state = {}) {
  const baseQueries = getKeywordSearchQueries(message, topic, state);
  try {
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: "You create BRS Golf Help Center search queries from vague support questions. Return only a JSON array of 3 to 5 short search strings. Use likely BRS product terms, guide categories, menu names, and article keywords. Do not answer the question." },
        { role: "user", content: `Topic: ${topic}\nClarification context: ${state.clarificationContext || "None"}\nUser question: ${message}` },
      ],
    });
    return uniqueValues([...baseQueries, ...parseJsonArray(response.output_text)]).slice(0, 12);
  } catch (error) {
    console.error("Help Center query expansion failed:", error);
    return baseQueries;
  }
}

async function searchHelpCenter(query) {
  const cleanedQuery = query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleanedQuery || cleanedQuery.length < 3) return [];

  const cached = helpCenterCache.get(cleanedQuery);
  if (cached && Date.now() - cached.createdAt < HELP_CENTER_CACHE_TTL_MS) return cached.articles;

  const params = new URLSearchParams({ query: cleanedQuery, locale: "en-us", per_page: "5" });
  const payload = await fetchWithTimeout(`${HELP_CENTER_SEARCH_URL}?${params.toString()}`);
  const articles = (payload?.results || [])
    .filter((article) => article.result_type === "article" && article.title && article.html_url && article.body)
    .slice(0, 5)
    .map((article) => ({ title: article.title, url: article.html_url, updatedAt: article.updated_at, text: truncateText(stripHtml(article.body)), query: cleanedQuery }));

  helpCenterCache.set(cleanedQuery, { createdAt: Date.now(), articles });
  return articles;
}

async function getHelpCenterArticles(message, topic, state = {}) {
  const searchMessage = buildSearchMessage(message, state);
  const queries = await getExpandedSearchQueries(searchMessage, topic, state);
  const batches = await Promise.all(queries.map((query) => searchHelpCenter(query)));
  const byUrl = new Map();
  for (const article of batches.flat()) {
    if (!byUrl.has(article.url)) byUrl.set(article.url, article);
  }
  return [...byUrl.values()].slice(0, 5);
}

function formatHelpCenterContext(articles) {
  if (!articles.length) return "";
  return articles.map((article, index) => `ARTICLE ${index + 1}: ${article.title}\nURL: ${article.url}\nUPDATED: ${article.updatedAt || "Unknown"}\nMATCHED QUERY: ${article.query || "Unknown"}\nTEXT:\n${article.text}`).join("\n\n---\n\n");
}

function getApprovedSupportContext(topic) {
  const decisionTree = loadFile(`data/decision-trees/${topic}-decision-tree.txt`);
  const knowledge = loadFile(`data/knowledge/${topic}.txt`);
  return truncateText([decisionTree, knowledge].filter(Boolean).join("\n\n---\n\n"), 5000);
}

function hasHelpCenterSource(reply = "") { return /https:\/\/help\.brsgolf\.com\/hc\/en-us\/articles\//i.test(reply); }
function appendSourceIfMissing(reply, articles) { return hasHelpCenterSource(reply) || !articles.length ? reply : `${reply.trim()}\n\nSource: [${articles[0].title}](${articles[0].url})`; }

async function isReplyGrounded(reply, helpCenterContext, approvedSupportContext, sourceRequired) {
  if (!reply || reply === UNKNOWN_REPLY) return false;
  if (sourceRequired && !hasHelpCenterSource(reply)) return false;
  try {
    const verification = await client.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: `You are a support-answer safety verifier. Decide whether the assistant answer is reasonably grounded in the supplied BRS sources.

Sources may include BRS Help Center articles and local approved support guidance.

Reply exactly SUPPORTED if:
- the answer is based on the supplied BRS sources, and
- the troubleshooting path is a reasonable application of those sources to the user's issue, and
- any product-specific UI labels, buttons, menu paths, workflows, prices, rules, or policies are present in the supplied sources.

Reply exactly UNSUPPORTED only if:
- the answer invents product-specific UI labels, buttons, menu paths, workflows, prices, rules, or policies that are not present in the supplied sources, or
- the answer contradicts the supplied sources, or
- the supplied sources are unrelated to the user's issue, or
- a Help Center URL is required but the answer has no BRS Help Center article URL.

Do not reject an answer just because it translates vague wording into likely BRS product terms or combines related source facts into a troubleshooting sequence.` },
        { role: "user", content: `BRS HELP CENTER ARTICLE CONTEXT:\n${helpCenterContext || "No Help Center articles found."}\n\nLOCAL APPROVED SUPPORT GUIDANCE:\n${approvedSupportContext || "No local approved guidance found."}\n\nHELP CENTER URL REQUIRED: ${sourceRequired ? "yes" : "no"}\n\nASSISTANT ANSWER:\n${reply}` },
      ],
    });
    return verification.output_text?.trim().toUpperCase() === "SUPPORTED";
  } catch (error) {
    console.error("Grounding verification failed:", error);
    return false;
  }
}

async function createGroundedReply(message, topic, conversationHistory, state = {}) {
  const articles = await getHelpCenterArticles(message, topic, state);
  const helpCenterContext = formatHelpCenterContext(articles);
  const approvedSupportContext = getApprovedSupportContext(topic);
  if (!helpCenterContext && !approvedSupportContext) return UNKNOWN_REPLY;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [{ role: "system", content: getContextForTopic(topic, helpCenterContext, approvedSupportContext, state) }, ...conversationHistory.slice(-12)],
  });

  const reply = appendSourceIfMissing(response.output_text?.trim() || "", articles);
  return await isReplyGrounded(reply, helpCenterContext, approvedSupportContext, Boolean(articles.length)) ? reply : UNKNOWN_REPLY;
}

function parseDirectAnswerRoutes(decisionTree) {
  const routes = [];
  const routeRegex = /^ROUTE:\s*(.+?)\s*$([\s\S]*?)(?=^ROUTE:\s*|^---\s*$|$)/gim;
  let match;
  while ((match = routeRegex.exec(decisionTree)) !== null) {
    const [, id, body] = match;
    const answerId = body.match(/^ANSWER ID:\s*(.+?)\s*$/im)?.[1]?.trim();
    const matchAnyGroups = [...body.matchAll(/^MATCH ANY:\s*(.+?)\s*$/gim)].map((line) => line[1].split(",").map((term) => term.trim().toLowerCase()).filter(Boolean));
    if (answerId && matchAnyGroups.length) routes.push({ id: id.trim(), answerId, matchAnyGroups });
  }
  return routes;
}

function routeMatchesMessage(route, message) {
  const lower = message.toLowerCase();
  return route.matchAnyGroups.every((group) => group.some((term) => lower.includes(term)));
}

function getApprovedAnswer(topic, answerId) {
  const knowledge = loadFile(`data/knowledge/${topic}.txt`);
  const answerRegex = new RegExp(`## APPROVED ANSWER:\\s*${escapeRegExp(answerId)}\\s*\\r?\\n([\\s\\S]*?)\\r?\\n## END APPROVED ANSWER`, "i");
  return knowledge.match(answerRegex)?.[1]?.trim() || null;
}

function getDirectAnswerForMessage(topic, message) {
  const decisionTree = loadFile(`data/decision-trees/${topic}-decision-tree.txt`);
  const route = parseDirectAnswerRoutes(decisionTree).find((candidate) => routeMatchesMessage(candidate, message));
  return route ? getApprovedAnswer(topic, route.answerId) : null;
}

function detectTopic(message) {
  const lower = message.toLowerCase();
  if (lower.includes("payment") || lower.includes("paid") || lower.includes("refund") || lower.includes("transaction") || lower.includes("payout") || lower.includes("vat") || lower.includes("bank statement")) return "payments";
  if (lower.includes("member") || lower.includes("membership") || lower.includes("subscription") || lower.includes("bill") || lower.includes("wallet")) return "memberships";
  if (lower.includes("admin user") || lower.includes("staff") || lower.includes("login") || lower.includes("permission")) return "user-management";
  if (lower.includes("buggy") || lower.includes("buggies")) return "admin-setup";
  if (lower.includes("competition") || lower.includes("draw") || lower.includes("entry sheet")) return "teesheet";
  if (lower.includes("booking") || lower.includes("tee") || lower.includes("timesheet") || lower.includes("player") || lower.includes("green fee") || lower.includes("society") || lower.includes("move")) return "teesheet";
  if (lower.includes("configure") || lower.includes("setup") || lower.includes("email template") || lower.includes("green fee rate")) return "admin-setup";
  return "general";
}

function getContextForTopic(topic, helpCenterContext = "", approvedSupportContext = "", state = {}) {
  const instructions = loadFile("data/instructions.txt");
  const decisionTree = loadFile(`data/decision-trees/${topic}-decision-tree.txt`);
  const knowledge = loadFile(`data/knowledge/${topic}.txt`);
  return `
${instructions}

RESPONSE STYLE:
- Use the relevant BRS Help Center article context and approved local support guidance. Do not answer as a generic IT assistant.
- Clarification context from the user: ${state.clarificationContext || "No clarification context yet."}
- Try to answer from BRS Help Center articles first.
- If no useful Help Center article is available, answer from approved local support guidance when it clearly supports the answer.
- If neither source supports a useful response, reply exactly: ${UNKNOWN_REPLY}
- Keep replies short and operational.
- Ask only one next-step question at a time.
- Use approved BRS navigation labels only.
- If Help Center article context is provided, use it as product documentation and include the most relevant source link at the end.
- You may translate vague user wording into likely BRS product terms and combine related source facts into practical troubleshooting steps.
- Do not invent product workflows, buttons, menu items, prices, policies, or rules that are not present in the provided sources.

PRIORITY ORDER:
1. Direct approved answers from local knowledge
2. Relevant BRS Help Center article context
3. Approved local support guidance
4. Ask a clarification question if the request is ambiguous
5. Safe escalation if unsure

TOPIC:
${topic}

BRS HELP CENTER ARTICLE CONTEXT:
${helpCenterContext || "No matching Help Center article was found for this message."}

APPROVED LOCAL SUPPORT GUIDANCE:
${approvedSupportContext || "No approved local support guidance was found for this topic."}

RELEVANT DECISION TREE:
${decisionTree}

RELEVANT KNOWLEDGE:
${knowledge}
`;
}

function isConversationEnd(message) {
  const lower = message.toLowerCase();
  return lower.includes("all good") || lower.includes("thanks") || lower.includes("thank you") || lower.includes("sorted") || lower.includes("that worked") || lower.includes("resolved");
}

function isRefundRequest(text) {
  const lower = text.toLowerCase();
  return lower.includes("refund") && (lower.includes("booking") || lower.includes("payment") || lower.includes("golfer") || lower.includes("customer"));
}

function isAdminUserCreateRequest(text) {
  const lower = text.toLowerCase();
  return (lower.includes("admin user") || lower.includes("staff user") || lower.includes("new user") || lower.includes("create user") || lower.includes("add user")) && (lower.includes("create") || lower.includes("add") || lower.includes("setup") || lower.includes("set up"));
}

function approvedAdminUserReply() {
  return `Go to:
Users >> Add New

Then:
1. Click the dropdown beside User Group.
2. Choose the correct user type.
3. Complete the required fields: User Group, Username, Membership Type, First Name, and Last Name.
4. Complete Password and Re-type Password to set the user password.
5. Click Create New User.

User group options:
- Admin: overall control of the system. Cannot add other Admin users.
- Staff: can complete most day-to-day tasks, but cannot access the Tools menu or Revenue Reports.
- StaffReadOnly: can view but cannot save changes.
- Member: can only log in through the Members Booking pages to view or book tee times.

To change the password later:
1. Go back to Users.
2. Click Find User.
3. Open the user from the list.
4. Use Change Password, or use Reset Password if an email address is saved for the user.`;
}

function isBuggyBookingRequest(text) { const lower = text.toLowerCase(); return lower.includes("buggy") || lower.includes("buggies"); }
function isFullRefundAnswer(text) { const lower = text.toLowerCase(); return lower.includes("full refund") || lower === "full" || lower.includes("full amount"); }
function isPartialRefundAnswer(text) { const lower = text.toLowerCase(); return lower.includes("partial refund") || lower === "partial" || lower.includes("part refund"); }
function isBrsPaymentAnswer(text) { const lower = text.toLowerCase(); return lower.includes("brs payments") || lower.includes("through brs") || lower.includes("yes"); }
function isNonBrsPaymentAnswer(text) { const lower = text.toLowerCase(); return lower.includes("not taken through brs") || lower.includes("other payment") || lower.includes("cash") || lower.includes("pdq") || lower.includes("cheque") || lower === "no"; }

function approvedRefundReply(type = "refund") {
  const partialLine = type === "partial" ? "For the partial refund, type the amount to be refunded into the Amount field before clicking Refund." : "The system will automatically add the full refundable amount for you to refund.";
  return `BRS customers using the BRS Payments processor can refund online payments from the Booking Details screen. If the club does not use BRS Payments, use the non-BRS Payments refund process instead.

Go to:
Tee Sheet >> Tee Time >> Booking Details >> Payments tab

Then:
1. From the tee sheet, click the tee time to open the Booking Details screen.
2. Expand the Payments tab.
3. Online payments completed through BRS Payments should have a Refund button beside the payment.
4. Click Refund.
5. ${partialLine}
6. Enter a reason if required.
7. Click Refund to transfer the payment back to the customer.

Please allow 5-10 days for refunds to return to the customer account.

To retrieve a record of refunds, go to:
Tools >> Payments >> Refunds`;
}

function approvedOfflineRefundReply() {
  return `If the payment was not taken through BRS Payments, the money needs to be returned outside BRS using the club's offline process, for example cash, PDQ, or cheque.

Important:
1. Confirm the correct booking and customer first.
2. Confirm how the original payment was taken.
3. Process the money return outside BRS.
4. Record the refund in BRS only where the club's process supports that.

Do not tell the customer the money has been returned until the offline refund has actually been completed.`;
}

function isPaymentMissingScenario(text) {
  const lower = text.toLowerCase();
  const paymentTerms = lower.includes("paid") || lower.includes("payment") || lower.includes("money") || lower.includes("bank statement") || lower.includes("receipt") || lower.includes("proof of payment");
  const missingBookingTerms = lower.includes("no booking") || lower.includes("not on the teesheet") || lower.includes("not on tee sheet") || lower.includes("turned up") || lower.includes("booking not showing");
  const noRecordTerms = lower.includes("no record") || lower.includes("not showing") || lower.includes("can't see") || lower.includes("cant see") || lower.includes("cannot see") || lower.includes("no payment") || lower.includes("no transaction") || lower.includes("not in brs") || lower.includes("not in the system") || lower.includes("nothing there");
  return paymentTerms && (missingBookingTerms || noRecordTerms);
}

function userConfirmedNoRecord(message) {
  const lower = message.toLowerCase();
  return lower.includes("no") || lower.includes("nothing") || lower.includes("no record") || lower.includes("no transaction") || lower.includes("not there") || lower.includes("cannot find") || lower.includes("can't find") || lower.includes("cant find");
}

function userConfirmedRecordFound(message) {
  const lower = message.toLowerCase();
  return lower.includes("yes") || lower.includes("found") || lower.includes("transaction found") || lower.includes("can see") || lower.includes("there is a transaction");
}

function clearStaleStateForMessage(state, message) {
  if (state.escalationState === "refund_type_asked" && !isRefundRequest(message) && !isFullRefundAnswer(message) && !isPartialRefundAnswer(message)) state.escalationState = "none";
  if (state.escalationState === "refund_source_asked" && !isBrsPaymentAnswer(message) && !isNonBrsPaymentAnswer(message)) state.escalationState = "none";
  if (state.escalationState === "check_asked" && !isPaymentMissingScenario(message) && !userConfirmedNoRecord(message) && !userConfirmedRecordFound(message)) state.escalationState = "none";
}

function createEscalationDraft(conversationHistory) {
  const transcript = conversationHistory.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  return { to: "support@brsgolf.com", subject: "Payment missing in BRS - support investigation required", body: `Hi Support Team,

A payment issue needs investigation.

Conversation transcript:
${transcript}

Kind regards` };
}

function isFreshAmbiguousRootQuestion(message) {
  const lower = message.toLowerCase();
  const startsLikeNewQuestion = /^(how|what|why|where|when|can|could|i need|help|please)\b/.test(lower);
  const ambiguousRootTerms = ["account", "setup", "set up", "not working", "can't book", "cant book", "cannot book", "won't let", "wont let", "issue", "problem", "access"];
  return startsLikeNewQuestion && ambiguousRootTerms.some((term) => lower.includes(term));
}

function resetClarificationForNewRootQuestion(state) {
  state.clarificationContext = null;
  state.clarificationCount = 0;
  state.currentTopic = null;
  if (!["refund_type_asked", "refund_source_asked", "check_asked"].includes(state.escalationState)) {
    state.escalationState = "none";
  }
}

function isBroadOrAmbiguous(message, topic, state) {
  if (state.clarificationContext && !isFreshAmbiguousRootQuestion(message)) return false;
  const lower = message.toLowerCase();
  const ambiguousTerms = ["account", "setup", "set up", "not working", "can't book", "cant book", "cannot book", "won't let", "wont let", "issue", "problem", "help", "access"];
  if (topic === "general") return true;
  return ambiguousTerms.some((term) => lower.includes(term)) && lower.split(/\s+/).length <= 10;
}

function heuristicClarificationProfile(message, topic) {
  const lower = message.toLowerCase();
  if ((lower.includes("create") || lower.includes("add") || lower.includes("new")) && lower.includes("account")) return "account-create";
  if (lower.includes("competition")) return "competition-issue";
  if (lower.includes("can't book") || lower.includes("cant book") || lower.includes("cannot book") || lower.includes("won't let") || lower.includes("wont let") || lower.includes("not visible") || lower.includes("availability")) return "booking-access";
  if (lower.includes("refund") || lower.includes("payment") || lower.includes("paid") || lower.includes("payout") || lower.includes("transaction")) return "payment-issue";
  if (lower.includes("member") || lower.includes("membership") || lower.includes("subscription") || lower.includes("bill") || lower.includes("wallet")) return "membership-issue";
  if (lower.includes("user") || lower.includes("staff") || lower.includes("admin") || lower.includes("login") || lower.includes("permission")) return "user-access";
  if (lower.includes("report") || lower.includes("email") || lower.includes("text") || lower.includes("gdpr") || lower.includes("printer") || lower.includes("device") || lower.includes("clubhouse pc")) return "admin-comms-reports";
  if (lower.includes("setup") || lower.includes("set up") || lower.includes("configure") || lower.includes("green fee") || lower.includes("booking rule") || lower.includes("buggy")) return "setup-issue";
  if (topic === "teesheet") return "booking-change";
  if (topic === "payments") return "payment-issue";
  if (topic === "memberships") return "membership-issue";
  if (topic === "user-management") return "user-access";
  if (topic === "admin-setup") return "setup-issue";
  return "unsupported";
}

async function classifyClarificationProfile(message, topic, state, reason) {
  const heuristic = heuristicClarificationProfile(message, topic);
  if (heuristic !== "unsupported") return heuristic;

  try {
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: `Choose one supported clarification profile for a BRS Golf support chatbot. Return only JSON: {"profile":"profile-id"}.

You may only choose one of these IDs. Do not invent IDs, questions, or buttons. If none fit, choose unsupported.

${PROFILE_DESCRIPTIONS}
unsupported: no supported profile fits` },
        { role: "user", content: `Reason: ${reason}\nDetected topic: ${topic}\nClarification context: ${state.clarificationContext || "None"}\nRecent conversation:\n${state.conversationHistory.slice(-6).map((item) => `${item.role}: ${item.content}`).join("\n")}\nLatest user message: ${message}` },
      ],
    });
    const profile = parseJsonObject(response.output_text)?.profile;
    return SUPPORTED_CLARIFICATION_PROFILES[profile] ? profile : "unsupported";
  } catch (error) {
    console.error("Clarification profile classification failed:", error);
    return "unsupported";
  }
}

async function createSupportedClarification(message, topic, state, reason = "The request is ambiguous or not supported enough to answer safely.") {
  const profileId = await classifyClarificationProfile(message, topic, state, reason);
  const profile = SUPPORTED_CLARIFICATION_PROFILES[profileId] || SUPPORTED_CLARIFICATION_PROFILES.unsupported;
  state.clarificationContext = uniqueValues([state.clarificationContext || "", profile.context, `Clarification question: ${profile.question}`]).join(" | ");
  state.clarificationCount = (state.clarificationCount || 0) + 1;
  return { reply: profile.question, escalationReady: false, topic: profile.topic || topic, options: profile.options, version: APP_VERSION };
}

function appendClarificationToMessage(message) {
  return message.replace(/^Clarification answer:\s*/i, "").trim();
}

function applyClarificationAnswerToState(state, message) {
  state.clarificationContext = uniqueValues([state.clarificationContext || "", `User selected: ${message}`]).join(" | ");
}

app.get("/api/health", (req, res) => { res.json({ ok: true, version: APP_VERSION }); });

app.post("/api/chat", async (req, res) => {
  const sessionId = getSessionId(req);
  const state = getSessionState(sessionId);

  try {
    const rawText = String(req.body?.message || "").trim();
    const wasClarificationAnswer = /^Clarification answer:\s*/i.test(rawText);
    const message = appendClarificationToMessage(rawText);
    if (!message) return res.json({ reply: "Please enter a question.", escalationReady: false, options: [], version: APP_VERSION });
    if (!wasClarificationAnswer && isFreshAmbiguousRootQuestion(message)) resetClarificationForNewRootQuestion(state);
    if (wasClarificationAnswer) applyClarificationAnswerToState(state, message);
    if (isConversationEnd(message)) {
      resetSessionState(sessionId);
      return res.json({ reply: "Great - glad that is sorted. Starting fresh for the next issue.", escalationReady: false, options: [], version: APP_VERSION });
    }

    clearStaleStateForMessage(state, message);

    const detectedTopic = detectTopic(message);
    if (detectedTopic !== "general") state.currentTopic = detectedTopic;
    const topic = detectedTopic !== "general" ? detectedTopic : (state.currentTopic || detectedTopic);
    const historyText = state.conversationHistory.map((m) => m.content).join(" ");
    const combinedText = `${historyText} ${message}`;

    if (isBuggyBookingRequest(message)) {
      state.currentTopic = "admin-setup";
      state.escalationState = "none";
      state.clarificationContext = uniqueValues([state.clarificationContext || "", "Buggy booking or buggy availability"]).join(" | ");
      const reply = getApprovedAnswer("admin-setup", "buggy-booking-availability");
      if (reply) {
        state.conversationHistory.push({ role: "user", content: message });
        state.conversationHistory.push({ role: "assistant", content: reply });
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic: "admin-setup", options: [], version: APP_VERSION });
      }
    }

    if (state.escalationState === "refund_type_asked") {
      state.conversationHistory.push({ role: "user", content: message });
      if (isFullRefundAnswer(message) || isPartialRefundAnswer(message)) {
        state.pendingRefundType = isPartialRefundAnswer(message) ? "partial" : "full";
        state.escalationState = "refund_source_asked";
        const reply = "Was the payment taken through BRS Payments?";
        state.conversationHistory.push({ role: "assistant", content: reply });
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic: "payments", options: brsPaymentOptions, version: APP_VERSION });
      }
      const reply = "Please choose whether this is a full refund or partial refund.";
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "payments", options: fullPartialRefundOptions, version: APP_VERSION });
    }

    if (state.escalationState === "refund_source_asked") {
      state.conversationHistory.push({ role: "user", content: message });
      const reply = isNonBrsPaymentAnswer(message) ? approvedOfflineRefundReply() : approvedRefundReply(state.pendingRefundType || "refund");
      state.escalationState = "none";
      state.pendingRefundType = null;
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "payments", options: [], version: APP_VERSION });
    }

    if (state.escalationState === "check_asked") {
      state.conversationHistory.push({ role: "user", content: message });
      if (userConfirmedRecordFound(message)) {
        state.escalationState = "none";
        const reply = "Thanks. If the transaction is visible in BRS Payments, check whether it is linked to a booking, bill, or failed/abandoned booking reference. What status does the transaction show?";
        state.conversationHistory.push({ role: "assistant", content: reply });
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic: "payments", options: [], version: APP_VERSION });
      }
      if (userConfirmedNoRecord(message)) {
        state.escalationState = "escalated";
        const reply = "Thanks - if there is no matching transaction in BRS Payments, this needs to be investigated with the payments platform. I have prepared an escalation draft for support below. Please review it before sending.";
        state.conversationHistory.push({ role: "assistant", content: reply });
        state.escalationDraft = createEscalationDraft(state.conversationHistory);
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: true, escalationDraft: state.escalationDraft, topic: "payments", options: [], version: APP_VERSION });
      }
      const reply = "Please select whether the matching transaction is visible in Tools >> BRS Payments >> Transactions.";
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "payments", options: transactionOptions, version: APP_VERSION });
    }

    if (isRefundRequest(message)) {
      state.currentTopic = "payments";
      state.clarificationContext = uniqueValues([state.clarificationContext || "", "Booking refund"]).join(" | ");
      state.escalationState = "refund_type_asked";
      const reply = "Is this a full refund or partial refund?";
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "payments", options: fullPartialRefundOptions, version: APP_VERSION });
    }

    if (topic === "payments" && isPaymentMissingScenario(combinedText)) {
      state.escalationState = "check_asked";
      const reply = "It sounds like the golfer may have paid, but the booking has not created on the tee sheet. First, check Tools >> BRS Payments >> Transactions. Can you see a matching transaction there?";
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic, options: transactionOptions, version: APP_VERSION });
    }

    if (isAdminUserCreateRequest(message) || (state.clarificationContext?.includes("Ambiguous create account request") && message.toLowerCase().includes("admin or staff user"))) {
      state.currentTopic = "user-management";
      const reply = approvedAdminUserReply();
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "user-management", options: [], version: APP_VERSION });
    }

    if (isBroadOrAmbiguous(message, topic, state)) {
      state.conversationHistory.push({ role: "user", content: message });
      const clarification = await createSupportedClarification(message, topic, state, "The request uses broad or ambiguous wording.");
      state.conversationHistory.push({ role: "assistant", content: clarification.reply });
      saveSessionState(sessionId, state);
      return res.json(clarification);
    }

    const directAnswer = getDirectAnswerForMessage(topic, buildSearchMessage(message, state));
    if (directAnswer) {
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: directAnswer });
      saveSessionState(sessionId, state);
      return res.json({ reply: directAnswer, escalationReady: false, topic, options: [], version: APP_VERSION });
    }

    state.conversationHistory.push({ role: "user", content: message });
    const reply = await createGroundedReply(message, topic, state.conversationHistory, state);

    if (reply === UNKNOWN_REPLY && state.clarificationCount < 2) {
      const clarification = await createSupportedClarification(message, topic, state, "The available sources did not support a confident answer.");
      state.conversationHistory.push({ role: "assistant", content: clarification.reply });
      saveSessionState(sessionId, state);
      return res.json(clarification);
    }

    state.conversationHistory.push({ role: "assistant", content: reply });
    saveSessionState(sessionId, state);
    res.json({ reply, escalationReady: false, topic, options: [], version: APP_VERSION });
  } catch (error) {
    console.error("FULL ERROR:", error);
    saveSessionState(sessionId, state);
    res.status(500).json({ reply: "Sorry - something went wrong. Please try again.", escalationReady: false, options: [], version: APP_VERSION });
  }
});

app.post("/chat", (req, res, next) => { req.url = "/api/chat"; next(); });
app.post("/reset", (req, res) => { resetSessionState(getSessionId(req)); res.json({ message: "Conversation reset." }); });
app.post("/api/reset", (req, res) => { resetSessionState(getSessionId(req)); res.json({ message: "Conversation reset." }); });

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

export default function handler(req, res) { return app(req, res); }
