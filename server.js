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

const APP_VERSION = "expanded-retrieval-grounding-v1";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const SESSION_LIMIT = 1000;
const HELP_CENTER_SEARCH_URL = "https://help.brsgolf.com/api/v2/help_center/articles/search.json";
const HELP_CENTER_CACHE_TTL_MS = 1000 * 60 * 30;
const UNKNOWN_REPLY = "I don't have enough confirmed information in the BRS Help Center or approved support guidance to answer that accurately. Please check the BRS Help Center or escalate this to support.";
const helpCenterCache = globalThis.__brsHelpCenterCache || new Map();
globalThis.__brsHelpCenterCache = helpCenterCache;
const sessions = globalThis.__brsSupportSessions || new Map();
globalThis.__brsSupportSessions = sessions;

const topicOptions = [
  { label: "Bookings", value: "This is about bookings or the tee sheet" },
  { label: "Payments", value: "This is about payments" },
  { label: "Memberships", value: "This is about memberships" },
  { label: "Users", value: "This is about users, logins or permissions" },
  { label: "System setup", value: "This is about system setup or configuration" },
];

const transactionOptions = [
  { label: "Yes, transaction found", value: "Yes, I found the matching transaction in BRS Payments" },
  { label: "No, no transaction found", value: "No, I cannot find a matching transaction in BRS Payments" },
];

const fullPartialRefundOptions = [
  { label: "Full Refund", value: "This is a full refund" },
  { label: "Partial Refund", value: "This is a partial refund" },
];

const topicSearchHints = {
  teesheet: ["tee sheet booking timesheet", "configure timesheet", "booking details"],
  payments: ["refund online payment", "BRS Payments transactions", "payment request refund"],
  memberships: ["member profile membership subscription bill", "member wallet payment scheme"],
  "user-management": ["users permissions admin user", "create user reset password"],
  "admin-setup": ["system configuration setup", "tools system configuration"],
};

function createDefaultState() {
  return { conversationHistory: [], escalationState: "none", escalationDraft: null, currentTopic: null, updatedAt: Date.now() };
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitRouteTerms(value) {
  return value.split(",").map((term) => term.trim().toLowerCase()).filter(Boolean);
}

function decodeHtmlEntities(value = "") {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
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

function truncateText(value = "", limit = 2200) {
  return value.length > limit ? `${value.slice(0, limit).trim()}...` : value;
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "BRS-Support-Agent/1.0" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Help Center fetch failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getKeywordSearchQueries(message, topic) {
  const lower = message.toLowerCase();
  const queries = [message, ...(topicSearchHints[topic] || [])];

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

  return uniqueValues(queries).slice(0, 8);
}

async function getExpandedSearchQueries(message, topic) {
  const baseQueries = getKeywordSearchQueries(message, topic);

  try {
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: `You create BRS Golf Help Center search queries from vague support questions. Return only a JSON array of 3 to 5 short search strings. Use likely BRS product terms, menu names, and article keywords. Do not answer the question.`,
        },
        {
          role: "user",
          content: `Topic: ${topic}\nUser question: ${message}`,
        },
      ],
    });

    return uniqueValues([...baseQueries, ...parseJsonArray(response.output_text)]).slice(0, 10);
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
    .map((article) => ({
      title: article.title,
      url: article.html_url,
      updatedAt: article.updated_at,
      text: truncateText(stripHtml(article.body)),
      query: cleanedQuery,
    }));

  helpCenterCache.set(cleanedQuery, { createdAt: Date.now(), articles });
  return articles;
}

async function getHelpCenterArticles(message, topic) {
  const queries = await getExpandedSearchQueries(message, topic);
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
  const context = [decisionTree, knowledge].filter(Boolean).join("\n\n---\n\n");
  return truncateText(context, 5000);
}

function hasHelpCenterSource(reply = "") {
  return /https:\/\/help\.brsgolf\.com\/hc\/en-us\/articles\//i.test(reply);
}

function appendSourceIfMissing(reply, articles) {
  if (hasHelpCenterSource(reply) || !articles.length) return reply;
  return `${reply.trim()}\n\nSource: [${articles[0].title}](${articles[0].url})`;
}

async function isReplyGrounded(reply, helpCenterContext, approvedSupportContext, sourceRequired) {
  if (!reply || reply === UNKNOWN_REPLY) return false;
  if (sourceRequired && !hasHelpCenterSource(reply)) return false;

  try {
    const verification = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: `You are a support-answer safety verifier. Decide whether the assistant answer is reasonably grounded in the supplied BRS sources.

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

Do not reject an answer just because it translates vague wording into likely BRS product terms or combines related source facts into a troubleshooting sequence.`,
        },
        {
          role: "user",
          content: `BRS HELP CENTER ARTICLE CONTEXT:\n${helpCenterContext || "No Help Center articles found."}\n\nLOCAL APPROVED SUPPORT GUIDANCE:\n${approvedSupportContext || "No local approved guidance found."}\n\nHELP CENTER URL REQUIRED: ${sourceRequired ? "yes" : "no"}\n\nASSISTANT ANSWER:\n${reply}`,
        },
      ],
    });

    return verification.output_text?.trim().toUpperCase() === "SUPPORTED";
  } catch (error) {
    console.error("Grounding verification failed:", error);
    return false;
  }
}

async function createGroundedReply(message, topic, conversationHistory) {
  const articles = await getHelpCenterArticles(message, topic);
  const helpCenterContext = formatHelpCenterContext(articles);
  const approvedSupportContext = getApprovedSupportContext(topic);

  if (!helpCenterContext && !approvedSupportContext) return UNKNOWN_REPLY;

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [{ role: "system", content: getContextForTopic(topic, helpCenterContext, approvedSupportContext) }, ...conversationHistory.slice(-12)],
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
    const matchAnyGroups = [...body.matchAll(/^MATCH ANY:\s*(.+?)\s*$/gim)].map((line) => splitRouteTerms(line[1]));

    if (answerId && matchAnyGroups.length) {
      routes.push({ id: id.trim(), answerId, matchAnyGroups });
    }
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
  if (lower.includes("member") || lower.includes("membership") || lower.includes("subscription") || lower.includes("bill") || lower.includes("wallet") || lower.includes("payment scheme")) return "memberships";
  if (lower.includes("user") || lower.includes("admin") || lower.includes("superuser") || lower.includes("staff") || lower.includes("login") || lower.includes("permission")) return "user-management";
  if (lower.includes("buggy") || lower.includes("buggies")) return "admin-setup";
  if (lower.includes("booking") || lower.includes("tee") || lower.includes("timesheet") || lower.includes("player") || lower.includes("green fee") || lower.includes("society") || lower.includes("move")) return "teesheet";
  if (lower.includes("configure") || lower.includes("setup") || lower.includes("email template") || lower.includes("green fee rate")) return "admin-setup";
  return "general";
}

function getContextForTopic(topic, helpCenterContext = "", approvedSupportContext = "") {
  const instructions = loadFile("data/instructions.txt");
  const decisionTree = loadFile(`data/decision-trees/${topic}-decision-tree.txt`);
  const knowledge = loadFile(`data/knowledge/${topic}.txt`);
  return `
${instructions}

RESPONSE STYLE:
- Use the relevant BRS Help Center article context and approved local support guidance. Do not answer as a generic IT assistant.
- Try to answer from BRS Help Center articles first.
- If no useful Help Center article is available, answer from approved local support guidance when it clearly supports the answer.
- If neither source supports a useful response, reply exactly: ${UNKNOWN_REPLY}
- Keep replies short and operational.
- Ask only one next-step question at a time.
- Do not ask what system/platform the user means after a BRS topic is detected.
- Use approved BRS navigation labels only.
- If Help Center article context is provided, use it as product documentation and include the most relevant source link at the end.
- You may translate vague user wording into likely BRS product terms and combine related source facts into practical troubleshooting steps.
- Do not invent product workflows, buttons, menu items, prices, policies, or rules that are not present in the provided sources.
- If you ask a question with options, write the options naturally in the question, for example: "Is this for members or visitors?" or "Is this about bookings, payments, or memberships?"

PRIORITY ORDER:
1. Direct approved answers from local knowledge
2. Relevant BRS Help Center article context
3. Approved local support guidance
4. Safe escalation if unsure

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
  return (lower.includes("admin user") || lower.includes("new user") || lower.includes("create user") || lower.includes("add user")) && (lower.includes("create") || lower.includes("add") || lower.includes("setup") || lower.includes("set up"));
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

function isBuggyBookingRequest(text) {
  const lower = text.toLowerCase();
  return lower.includes("buggy") || lower.includes("buggies");
}

function isFullRefundAnswer(text) {
  const lower = text.toLowerCase();
  return lower.includes("full refund") || lower === "full" || lower.includes("full amount");
}

function isPartialRefundAnswer(text) {
  const lower = text.toLowerCase();
  return lower.includes("partial refund") || lower === "partial" || lower.includes("part refund");
}

function approvedRefundReply(type = "refund") {
  const partialLine = type === "partial"
    ? "For the partial refund, type the amount to be refunded into the Amount field before clicking Refund."
    : "The system will automatically add the full refundable amount for you to refund.";

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
  if (state.escalationState === "refund_type_asked" && !isRefundRequest(message) && !isFullRefundAnswer(message) && !isPartialRefundAnswer(message)) {
    state.escalationState = "none";
  }
  if (state.escalationState === "check_asked" && !isPaymentMissingScenario(message) && !userConfirmedNoRecord(message) && !userConfirmedRecordFound(message)) {
    state.escalationState = "none";
  }
}

function createEscalationDraft(conversationHistory) {
  const transcript = conversationHistory.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  return { to: "support@brsgolf.com", subject: "Payment missing in BRS - support investigation required", body: `Hi Support Team,

A payment issue needs investigation.

Conversation transcript:
${transcript}

Kind regards` };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: APP_VERSION });
});

app.post("/api/chat", async (req, res) => {
  const sessionId = getSessionId(req);
  const state = getSessionState(sessionId);

  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.json({ reply: "Please enter a question.", escalationReady: false, options: [], version: APP_VERSION });
    if (isConversationEnd(message)) { resetSessionState(sessionId); return res.json({ reply: "Great - glad that is sorted. Starting fresh for the next issue.", escalationReady: false, options: [], version: APP_VERSION }); }

    clearStaleStateForMessage(state, message);

    const detectedTopic = detectTopic(message);
    if (detectedTopic !== "general") state.currentTopic = detectedTopic;
    let topic = detectedTopic !== "general" ? detectedTopic : (state.currentTopic || detectedTopic);

    const historyText = state.conversationHistory.map((m) => m.content).join(" ");
    const combinedText = `${historyText} ${message}`;

    if (isBuggyBookingRequest(message)) {
      state.currentTopic = "admin-setup";
      state.escalationState = "none";
      topic = "admin-setup";
      const reply = getApprovedAnswer("admin-setup", "buggy-booking-availability");
      if (reply) {
        state.conversationHistory.push({ role: "user", content: message });
        state.conversationHistory.push({ role: "assistant", content: reply });
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic, options: [], version: APP_VERSION });
      }
    }

    const directAnswer = getDirectAnswerForMessage(topic, message);
    if (directAnswer) {
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: directAnswer });
      saveSessionState(sessionId, state);
      return res.json({ reply: directAnswer, escalationReady: false, topic, options: [], version: APP_VERSION });
    }

    if (isAdminUserCreateRequest(message)) {
      state.currentTopic = "user-management";
      const reply = approvedAdminUserReply();
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "user-management", options: [], version: APP_VERSION });
    }

    if (state.escalationState === "refund_type_asked") {
      state.conversationHistory.push({ role: "user", content: message });
      if (isFullRefundAnswer(message)) {
        const reply = approvedRefundReply("full");
        state.escalationState = "none";
        state.conversationHistory.push({ role: "assistant", content: reply });
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic: "payments", options: [], version: APP_VERSION });
      }
      if (isPartialRefundAnswer(message)) {
        const reply = approvedRefundReply("partial");
        state.escalationState = "none";
        state.conversationHistory.push({ role: "assistant", content: reply });
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic: "payments", options: [], version: APP_VERSION });
      }
      state.escalationState = "none";
    }

    if (isRefundRequest(message)) {
      state.currentTopic = "payments";
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
      state.conversationHistory.push({ role: "user", content: message }); state.conversationHistory.push({ role: "assistant", content: reply }); saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic, options: transactionOptions, version: APP_VERSION });
    }

    if (topic === "general") {
      state.conversationHistory.push({ role: "user", content: message });
      const reply = "Got it - just to check, is this about bookings, payments, memberships, users, or system setup?";
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic, options: topicOptions, version: APP_VERSION });
    }

    if (state.escalationState === "check_asked") {
      state.conversationHistory.push({ role: "user", content: message });
      if (userConfirmedRecordFound(message)) {
        state.escalationState = "none";
        const reply = "Thanks. If the transaction is visible in BRS Payments, check whether it is linked to a booking, bill, or failed/abandoned booking reference. What status does the transaction show?";
        state.conversationHistory.push({ role: "assistant", content: reply }); saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic: "payments", options: [], version: APP_VERSION });
      }
      if (userConfirmedNoRecord(message)) {
        state.escalationState = "escalated";
        const reply = "Thanks - if there is no matching transaction in BRS Payments, this needs to be investigated with the payments platform. I have prepared an escalation draft for support below. Please review it before sending.";
        state.conversationHistory.push({ role: "assistant", content: reply }); state.escalationDraft = createEscalationDraft(state.conversationHistory); saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: true, escalationDraft: state.escalationDraft, topic: "payments", options: [], version: APP_VERSION });
      }
      const reply = "Please select whether the matching transaction is visible in Tools >> BRS Payments >> Transactions.";
      state.conversationHistory.push({ role: "assistant", content: reply }); saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "payments", options: transactionOptions, version: APP_VERSION });
    }

    state.conversationHistory.push({ role: "user", content: message });
    const reply = await createGroundedReply(message, topic, state.conversationHistory);
    state.conversationHistory.push({ role: "assistant", content: reply }); saveSessionState(sessionId, state);
    res.json({ reply, escalationReady: false, topic, options: [], version: APP_VERSION });
  } catch (error) {
    console.error("FULL ERROR:", error); saveSessionState(sessionId, state);
    res.status(500).json({ reply: "Sorry - something went wrong. Please try again.", escalationReady: false, options: [], version: APP_VERSION });
  }
});

app.post("/chat", (req, res, next) => { req.url = "/api/chat"; next(); });
app.post("/reset", (req, res) => { resetSessionState(getSessionId(req)); res.json({ message: "Conversation reset." }); });
app.post("/api/reset", (req, res) => { resetSessionState(getSessionId(req)); res.json({ message: "Conversation reset." }); });

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

export default function handler(req, res) { return app(req, res); }
