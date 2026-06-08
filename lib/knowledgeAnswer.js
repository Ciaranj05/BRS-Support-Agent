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

const TOPICS = ["teesheet", "payments", "memberships", "user-management", "admin-setup", "general"];
const SOURCE_WEIGHT = { workflow: 7, system: 5, manual: 4, local: 4, help: 3 };

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const helpCenterCache = globalThis.__brsKnowledgeAnswerHelpCenterCache || new Map();
globalThis.__brsKnowledgeAnswerHelpCenterCache = helpCenterCache;

function normalise(value = "") {
  return String(value || "").toLowerCase();
}

function truncateText(value = "", limit = 2200) {
  return value.length > limit ? `${value.slice(0, limit).trim()}...` : value;
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
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
    memberships: ["member", "membership", "bill", "invoice", "subscription", "wallet", "account balance", "payment scheme", "flexi", "flexible", "unpaid"],
    payments: ["brs payments", "transaction", "payout", "payment request", "bank statement", "vat", "refund"],
    teesheet: ["tee", "tee sheet", "teesheet", "timesheet", "booking", "visitor", "green fee", "competition", "draw", "entry sheet"],
    "user-management": ["user", "staff", "admin", "permission", "role", "login", "password"],
    "admin-setup": ["report", "settings", "setup", "configure", "email", "text", "gdpr", "printer", "buggy", "device"],
  };
  if (hasAny(lower, ["membership bill", "member bill", "bill payment", "payment on a bill", "unpaid bills", "flexi member", "flexible member"])) return "memberships";
  if (hasAny(lower, ["booking refund", "tee time refund", "visitor booking refund"])) return "payments";
  const ranked = Object.entries(scores).map(([topic, terms]) => [topic, terms.filter((term) => lower.includes(term)).length]).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] > 0 ? ranked[0][0] : "general";
}

function keywordIntent(message = "") {
  const lower = normalise(message);
  const topic = inferTopic(message);
  const object = [
    lower.includes("unpaid") && lower.includes("bill") ? "unpaid membership bills" : null,
    lower.includes("flexi") || lower.includes("flexible") ? "flexible membership" : null,
    lower.includes("bill") || lower.includes("invoice") ? "membership bill" : null,
    lower.includes("refund") ? "refund" : null,
    lower.includes("report") ? "report" : null,
    lower.includes("competition") ? "competition" : null,
    lower.includes("booking") ? "booking" : null,
  ].filter(Boolean).join(", ") || "unknown";
  return {
    topic,
    task: lower.includes("report") || lower.includes("show") || lower.includes("find me") || lower.includes("see") ? "report" : lower.includes("refund") ? "refund" : lower.includes("create") || lower.includes("add") ? "create" : "support-answer",
    object,
    confidence: topic === "general" ? 0.35 : 0.65,
    queryTerms: [message, `${topic} ${object}`].filter(Boolean),
    needsClarification: false,
    clarifyingQuestion: "",
  };
}

async function classifySupportIntent(message) {
  const fallback = keywordIntent(message);
  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `Classify the latest BRS Golf support question for evidence retrieval. Return only JSON with keys: topic, task, object, confidence, needsClarification, clarifyingQuestion, queryTerms. Allowed topics: ${TOPICS.join(", ")}.
Rules:
- membership/member/bill/invoice/subscription/wallet/flexi/unpaid bill questions are memberships, even if payment/refund words appear.
- booking/tee time refunds are payments or teesheet only when booking/tee time is explicit.
- competition purse evidence is only relevant when the user explicitly asks about competitions.
- report questions keep their business object, e.g. unpaid membership bills is memberships/report, not competition purse.
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
    queries.push("membership bill unpaid bills subscriptions member profile billing report flexible membership flexi member");
    if (lower.includes("report") || lower.includes("unpaid")) queries.push("membership reports unpaid bills members outstanding balance billing");
    if (lower.includes("flexi") || lower.includes("flexible")) queries.push("flexible membership flexi member membership tab member profile");
    if (lower.includes("refund")) queries.push("membership bill payment refund member billing payments");
  }
  if (intent.topic === "payments") queries.push("BRS Payments transactions refunds payment requests payouts");
  if (intent.topic === "teesheet") queries.push("tee sheet booking timesheet visitor green fee competition entry");
  if (intent.topic === "user-management") queries.push("users permissions staff admin role login password");
  if (intent.topic === "admin-setup") queries.push("reports settings configuration email text GDPR printer buggy device");
  if (lower.includes("competition")) queries.push("competition setup open competition member visitor booking fees purse");
  return [...new Set(queries.map((query) => query.trim()).filter((query) => query.length > 2))].slice(0, 8);
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
      const score = base + topicBonus + scoreText(query, [entry.title, entry.area, entry.navigationPath, entry.content, ...(entry.tags || [])].join(" ")) - crossTopicPenalty(intent, entry);
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

function isAllMembersUnpaidBillsQuestion(message = "") {
  const lower = normalise(message);
  return hasAny(lower, ["unpaid bill", "unpaid bills", "outstanding bill", "outstanding bills", "owed bills", "overdue bill", "overdue bills"])
    && hasAny(lower, ["all members", "every member", "members", "member list", "list", "report", "see which", "show", "view"]);
}

function deterministicMembershipReportReply(message) {
  if (!isAllMembersUnpaidBillsQuestion(message)) return null;
  return `To see which members have unpaid bills, use the membership reporting route rather than opening each member profile one by one.

Go to:
Reports >> Membership Reports

Then look for a membership billing/bills report and filter it to show unpaid or outstanding bills. Use the report results to review the members with balances still due.

If the club only needs one member, open that member from Memberships and check their Billing tab instead.`;
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
  const entries = rankEvidence(await readApprovedSupportFiles(), message, intent).slice(0, 4);
  return entries.map((entry) => `LOCAL SUPPORT FILE: ${entry.title}\nTOPIC FIT: ${entry.topic}\nSCORE: ${entry.score}\n${truncateText(entry.content, 1800)}`).join("\n\n---\n\n");
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
    return `For a refund on a general payment request, do not use the tee sheet booking refund route.

Go to:
Tools >> BRS Payments >> Transactions

Then:
1. Search for the payment request transaction.
2. Confirm the customer, amount, date, and payment status.
3. Confirm the transaction was taken through BRS Payments and is eligible for refund.
4. Use the Refund action on the correct transaction.
5. For a partial refund, enter only the amount that should be returned.
6. Enter a reason if required and confirm the refund.

To review refund records, go to:
Tools >> BRS Payments >> Refunds`;
  }
  return `For a refund on a membership bill, use the member billing/payment record rather than the tee sheet booking route.

Go to:
Members / Memberships >> Find the member >> Billing >> Open the bill >> Payments

Then:
1. Open the correct member profile.
2. Go to the Billing area and open the relevant bill.
3. Check the Payments section and confirm the payment is attached to that bill.
4. Confirm the payment was taken through BRS Payments and is eligible for refund.
5. Use the Refund action on the correct payment.
6. For a partial refund, enter only the amount that should be returned.
7. Enter a reason if required and confirm the refund.

Before refunding, check allocation so you do not refund the wrong payment or leave the bill balance in an unexpected state.

Refunds processed through BRS Payments normally return to the customer's account in 5-10 days.

To review refund records, go to:
Tools >> BRS Payments >> Refunds`;
}

async function verifyReply(message, intent, evidence, reply) {
  if (!reply || reply === UNKNOWN_REPLY) return false;
  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: "Reply exactly SUPPORTED or UNSUPPORTED. Unsupported means the answer uses unrelated evidence, confuses membership bills with competition purse, confuses membership bill refunds with booking refunds, or invents BRS UI paths/actions not in evidence." },
        { role: "user", content: `QUESTION:\n${message}\n\nINTENT:\n${JSON.stringify(intent)}\n\nEVIDENCE:\n${evidence}\n\nANSWER:\n${reply}` },
      ],
    });
    return response.output_text?.trim().toUpperCase() === "SUPPORTED";
  } catch (error) {
    console.error("Knowledge answer verification failed:", error);
    return false;
  }
}

export async function answerFromKnowledge(message) {
  const contactReply = deterministicContactReply(message);
  if (contactReply) return contactReply;
  if (!shouldAttemptKnowledgeAnswer(message)) return null;
  const membershipReportReply = deterministicMembershipReportReply(message);
  if (membershipReportReply) return membershipReportReply;
  const deterministicReply = deterministicRefundReply(message);
  if (deterministicReply) return deterministicReply;

  const intent = await classifySupportIntent(message);
  if (intent.needsClarification && Number(intent.confidence || 0) < 0.65) {
    return intent.clarifyingQuestion || "Can you confirm which BRS area this is about?";
  }

  const [localEntriesRaw, helpCenter, approvedSupportContext] = await Promise.all([
    retrieveKnowledge([message, intent.topic, intent.task, intent.object, ...(intent.queryTerms || [])].join(" "), { limit: 12 }),
    getHelpCenterContext(message, intent),
    getApprovedSupportContext(message, intent),
  ]);

  const usefulLocalEntries = rankEvidence(localEntriesRaw.filter((entry) => entry.confidence === "approved"), message, intent).slice(0, 6);
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
        content: `You are a technical support agent for BRS Golf admin/staff users. Use dynamic, evidence-led routing: answer from the supplied evidence that best matches the classified topic/object, not from generic keyword overlap. Prefer workflow evidence when it directly matches because it records observed navigation, controls, filters, table columns, and actions. Use Help Center articles first when directly relevant, then approved product/workflow knowledge from admin UI templates, then local guidance. Treat example-club observations as reusable product behaviour only, never as club-specific settings. Do not use competition purse/open competition evidence for membership bill/report/refund questions unless the user explicitly mentions competitions. Do not use booking refund guidance for membership bill refunds. Do not invent workflows, buttons, menu paths, prices, club policies, or live club data. If the evidence is not enough, reply exactly: ${UNKNOWN_REPLY}. Keep the answer concise and operational. Ask one next-step question only if needed.`,
      },
      { role: "user", content: `CLASSIFIED INTENT:\n${JSON.stringify(intent, null, 2)}\n\nUSER QUESTION:\n${message}\n\nAPPROVED EVIDENCE:\n${evidence}` },
    ],
  });

  const reply = response.output_text?.trim();
  if (!reply || reply === UNKNOWN_REPLY) return null;
  const supported = await verifyReply(message, intent, evidence, reply);
  if (!supported) return null;
  if (helpCenter.articles.length && !/https:\/\/help\.brsgolf\.com\/hc\/en-us\/articles\//i.test(reply)) {
    const article = helpCenter.articles[0];
    return `${reply}\n\nSource: [${article.title}](${article.sourceUrl})`;
  }
  return reply;
}
