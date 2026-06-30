import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import baseHandler, { approvedRefundReply, approvedOfflineRefundReply } from "./server.js";
import { getSurveyMetrics } from "./feedbackStore.js";
import { answerFromKnowledge, isBRSWorkflowQuestion } from "./lib/knowledgeAnswer.js";
import { answerFromObjectFirstRouting } from "./lib/objectFirstRouting.js";
import { rewriteAddsUnsupportedDetails } from "./lib/rewriteSafety.js";
import { enqueueWorkflowExploration } from "./lib/workflowExplorationQueue.js";
import { isMemberBalanceReportQuestion } from "./lib/membershipWorkflowAnswers.js";
import { contextualiseShortClarificationFollowUp, exhaustedWorkflowFollowUpPayload, repeatedWorkflowFollowUpPayload } from "./lib/repeatedWorkflowFollowUp.js";
import { routeActionRequest } from "./lib/actionRouter.js";
import { runQaAnalysis } from "./lib/qaAnalysis.js";
import { isSuperuserCreateRequest } from "./lib/staticWorkflowAnswers.js";
import { assertBotAccess, resolveAuthContext } from "./lib/security/authContext.js";
import { expandAffirmationMessage, getConversationHistory, getSessionId, prepareChatPayload, wantsChatDebug, withDebug, wrapJsonForChat } from "./services/chat/chatPayloadService.js";
import { recordResolvedInteractionWithLearning, recordSurveyScoreWithLearning } from "./services/feedback/feedbackSubmissionService.js";
import { runActionRequest, runTimesheetActionRequest } from "./services/timesheet/timesheetActionService.js";
import { rateLimiter, validateChatInput, securityHeaders, getCorsOptions } from "./lib/middleware/security.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const app = express();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(securityHeaders);
app.use(cors(getCorsOptions()));
app.use(express.json({ limit: "100kb" }));

function isMemberBalanceLookup(message = "") {
  return isMemberBalanceReportQuestion(message);
}

function normaliseMessage(message = "") {
  return String(message || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function hasKnownRefundObject(lower = "") {
  return hasAny(lower, [
    "booking",
    "tee time",
    "tee sheet",
    "teesheet",
    "visitor booking",
    "green fee",
    "member",
    "membership",
    "subscription",
    "bill",
    "bills",
    "billing",
    "invoice",
    "invoices",
    "wallet",
    "account balance",
    "general payment request",
    "payment request",
    "payment link",
  ]);
}

function isRefundRecordsLookup(lower = "") {
  return lower.includes("refund") && hasAny(lower, [
    "record",
    "records",
    "history",
    "previous",
    "report",
    "retrieve",
    "view",
    "see",
    "list",
    "find",
  ]);
}

function isBroadRefundRequest(lower = "") {
  return lower.includes("refund") && !isRefundRecordsLookup(lower) && !hasKnownRefundObject(lower);
}

const brsPaymentOptions = [
  { label: "Yes, BRS Payments", value: "The payment was taken through BRS Payments" },
  { label: "No, other payment method", value: "The payment was not taken through BRS Payments" },
];

const fullPartialRefundOptions = [
  { label: "Full Refund", value: "This is a full refund" },
  { label: "Partial Refund", value: "This is a partial refund" },
];

function historyHasRefundPrompt(history = []) {
  return [...history].reverse().slice(0, 4).some((item) => (
    item?.role === "assistant"
    && /is this a full refund or partial refund|was the payment taken through brs payments/i.test(String(item.content || ""))
  ));
}

function shouldPreferStatefulClarification(message = "", history = []) {
  const lower = normaliseMessage(message);
  if (!lower) return false;
  if (/^clarification answer:/i.test(message)) return true;
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  const refundClarificationAnswer = historyHasRefundPrompt(history) && hasAny(lower, ["full refund", "partial refund", "yes, brs payments", "brs payments", "no, other payment method", "other payment method"]);
  const broadRefund = isBroadRefundRequest(lower);
  const broadCreate = hasAny(lower, ["create an account", "add an account", "new account"]) && !hasAny(lower, ["admin", "staff", "member"]);
  const broadBookingAccess = hasAny(lower, ["cannot book", "can't book", "cant book", "won't let", "wont let", "not visible online"]);
  const riskyBulkDelete = /\bdelete\b/.test(lower) && hasAny(lower, ["all bookings", "all tee times", "next month"]);
  const broadUserAccess = hasAny(lower, ["deactivate user", "deactivate a user", "disable user", "read-only", "read only"]) && wordCount <= 12;
  const broadAdminReport = hasAny(lower, ["facility summary report", "room summary report", "member email addresses", "playing statistics"]);
  const broadCompetition = lower.includes("competition") && hasAny(lower, ["change or cancel", "cannot book", "can't book", "cant book", "people cannot book", "not book"]);
  return refundClarificationAnswer || broadRefund || broadCreate || broadBookingAccess || riskyBulkDelete || broadUserAccess || broadAdminReport || broadCompetition;
}

function vagueWorkflowClarificationPayload(message = "") {
  const lower = normaliseMessage(message);
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  const tooShort = wordCount <= 2 && hasAny(lower, ["report", "refund"]);
  const vagueReport = /^(how do i )?(show|find|view|run|open|where is|where are)?\s*reports?$/i.test(lower);
  const vagueRefund = /^(how do i )?(refund|reverse|money back)$/i.test(lower);
  if (!(tooShort || vagueReport || vagueRefund)) return null;

  return {
    reply: "Which BRS area is this about?",
    escalationReady: false,
    topic: "clarification",
    options: [
      { label: "Bookings", value: "Clarification answer: This is about bookings" },
      { label: "Memberships", value: "Clarification answer: This is about memberships" },
      { label: "BRS Payments", value: "Clarification answer: This is about BRS Payments" },
      { label: "Reports", value: "Clarification answer: This is about reports" },
      { label: "Type details instead", value: "Clarification answer: I need to type more details" },
    ],
    version: "workflow-clarification-v1",
  };
}

function isFullRefundAnswer(message = "") {
  const lower = normaliseMessage(message);
  return lower.includes("full refund") || lower === "full" || lower.includes("full amount");
}

function isPartialRefundAnswer(message = "") {
  const lower = normaliseMessage(message);
  return lower.includes("partial refund") || lower === "partial" || lower.includes("part refund");
}

function isBrsPaymentAnswer(message = "") {
  const lower = normaliseMessage(message);
  return lower.includes("brs payments") || lower.includes("through brs") || lower === "yes";
}

function isNonBrsPaymentAnswer(message = "") {
  const lower = normaliseMessage(message);
  return lower.includes("not taken through brs") || lower.includes("other payment") || lower.includes("cash") || lower.includes("pdq") || lower.includes("cheque") || lower === "no";
}

function latestRefundType(history = []) {
  const latest = [...history].reverse().find((item) => item.role === "user" && (isFullRefundAnswer(item.content) || isPartialRefundAnswer(item.content)));
  return latest && isPartialRefundAnswer(latest.content) ? "partial" : "full";
}

function handleRefundClarificationFlow(message = "", history = [], { includeInitialPrompt = true } = {}) {
  const lower = normaliseMessage(message);
  const lastAssistant = [...history].reverse().find((item) => item.role === "assistant")?.content || "";
  if (/is this a full refund or partial refund/i.test(lastAssistant)) {
    if (isFullRefundAnswer(message) || isPartialRefundAnswer(message)) {
      return { reply: "Was the payment taken through BRS Payments?", escalationReady: false, topic: "payments", options: brsPaymentOptions, version: "audience-aware-clarification-routing-v3" };
    }
    return { reply: "Please choose whether this is a full refund or partial refund.", escalationReady: false, topic: "payments", options: fullPartialRefundOptions, version: "audience-aware-clarification-routing-v3" };
  }
  if (/was the payment taken through brs payments/i.test(lastAssistant)) {
    const reply = isNonBrsPaymentAnswer(message) ? approvedOfflineRefundReply() : approvedRefundReply(latestRefundType(history));
    return { reply, escalationReady: false, topic: "payments", options: [], version: "audience-aware-clarification-routing-v3" };
  }
  if (includeInitialPrompt && isBroadRefundRequest(lower)) {
    return { reply: "Is this a full refund or partial refund?", escalationReady: false, topic: "payments", options: fullPartialRefundOptions, version: "audience-aware-clarification-routing-v3" };
  }
  return null;
}

async function completeInitialAnswer(message, answer) {
  if (!answer || /\b(can you please give me more information|please tell me which part|what (area|part) of brs|which part of brs)\b/i.test(answer)) return answer;
  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `Improve this BRS Golf support answer so it is specific, readable, and complete on the first response.

Rules:
- Use this format where possible:
  1. One short title line.
  2. One numbered list of directly supported steps.
  3. A "Check" section only when checks are already present in the draft answer.
  4. An "Export/download" line only when export/download is already present in the draft answer.
- Do not mix bullet points inside numbered workflow steps.
- Remove optional follow-up prompts such as "Would you like me to..." and include the safe next steps directly.
- When the draft already names a BRS page, section, button, setting, label, dropdown, filter, export, print, or save control, keep that label and add the draft-supported screen location in the same step where possible, such as the main navigation menu, the Tools page section, the Timesheet grid/action toolbar, Booking Details, or the Reports Type of Report dropdown.
- Do not add filters/checks such as statuses, dates, billing cycles, table rows, balances, fields, buttons, paths, reports, or exports unless they are already present in the draft answer.
- Do not invent exact report names, buttons, paths, prices, policies, member data, or club-specific settings.
- Ask a follow-up only if the answer cannot be given without missing critical information.`,
        },
        { role: "user", content: `User question:\n${message}\n\nDraft answer:\n${answer}` },
      ],
    });
    const improved = response.output_text?.trim() || answer;
    return rewriteAddsUnsupportedDetails(answer, improved) ? answer : improved;
  } catch (error) {
    console.error("Initial answer completion failed:", error);
    return answer;
  }
}

async function respondFromKnowledge({ req, res, message, originalMessage, debug, debugEnabled, routeLabel = "knowledge", allowDynamicKnowledge = true, queueKnowledgeGaps = true }) {
  const reply = await answerFromKnowledge(message, { allowDynamic: allowDynamicKnowledge });
  debug.stages.push({ name: routeLabel, matched: Boolean(reply), directIntent: isMemberBalanceLookup(message) });

  const liveLookup = null;
  const liveReply = null;
  const isWorkflowQuestion = isBRSWorkflowQuestion(message);
  const hasStaticAnswer = Boolean(reply);
  if (isWorkflowQuestion) {
    debug.stages.push({
      name: "live-brs-lookup",
      matched: false,
      attempted: false,
      skipped: true,
      reason: hasStaticAnswer
        ? "approved-knowledge-returned-live-lookup-disabled"
        : "live-lookup-disabled-demo-crawler-primary",
    });
  }

  if (!(liveReply || reply)) {
    if (!queueKnowledgeGaps) return false;
    if (isWorkflowQuestion) {
      const vagueClarification = vagueWorkflowClarificationPayload(message);
      if (vagueClarification) {
        debug.stages.push({ name: "vague-workflow-clarification", matched: true });
        res.json(await prepareChatPayload({ client, payload: vagueClarification, message: originalMessage, debug, debugEnabled, req }));
        return true;
      }
      const queued = await enqueueWorkflowExploration({
        question: message,
        reason: "chat-workflow-knowledge-gap",
        topic: "knowledge",
        staticEvidence: reply || "",
        liveLookup,
      }).catch((error) => {
        console.error("Workflow exploration queueing failed:", error);
        return null;
      });
      debug.stages.push({ name: "workflow-exploration-queue", matched: Boolean(queued), storage: queued?.storage || null, allowedTier: queued?.item?.allowedTier || null });
      const payload = {
        reply: queued?.item?.status === "queued"
          ? "I do not have a complete proven BRS workflow for that yet. I have queued this for automatic exploration against the BRS test system so the workflow family, variants, and routes can be captured safely."
          : "I do not have a complete proven BRS workflow for that yet. This needs workflow exploration before I can give reliable steps.",
        escalationReady: false,
        topic: "knowledge",
        options: [],
        version: "strict-evidence-gap-v1",
      };
      res.json(await prepareChatPayload({ client, payload, message: originalMessage, debug, debugEnabled, req }));
      return true;
    }
    return false;
  }
  if (isWorkflowQuestion && liveLookup?.attempted && !liveReply) {
    await enqueueWorkflowExploration({
      question: message,
      reason: reply ? "live-lookup-incomplete-static-answer-used" : "live-lookup-incomplete",
      topic: "knowledge",
      staticEvidence: reply || "",
      liveLookup,
    }).then((queued) => {
      debug.stages.push({ name: "workflow-exploration-queue", matched: Boolean(queued), storage: queued?.storage || null, allowedTier: queued?.item?.allowedTier || null });
    }).catch((error) => {
      console.error("Workflow exploration queueing failed:", error);
      debug.stages.push({ name: "workflow-exploration-queue", matched: false, error: error.message || "Unknown queue error" });
    });
    if (!reply) {
      const payload = {
        reply: "I do not have a complete directly observed BRS workflow for that yet. I have queued this for automatic exploration against the BRS test system.",
        escalationReady: false,
        topic: "knowledge",
        options: [],
        version: "strict-evidence-gap-v1",
      };
      res.json(await prepareChatPayload({ client, payload, message: originalMessage, debug, debugEnabled, req }));
      return true;
    }
  }
  const rawReply = liveReply || reply;
  const repeatedWorkflowPayload = repeatedWorkflowFollowUpPayload(originalMessage, getConversationHistory(req), rawReply);
  debug.stages.push({ name: "repeated-workflow-follow-up", matched: Boolean(repeatedWorkflowPayload) });
  if (repeatedWorkflowPayload) {
    res.json(await prepareChatPayload({ client, payload: repeatedWorkflowPayload, message: originalMessage, debug, debugEnabled, req }));
    return true;
  }

  let completeReply = rawReply;
  if (process.env.BRS_ENABLE_ANSWER_COMPLETION === "true") {
    completeReply = await completeInitialAnswer(message, rawReply);
    debug.stages.push({ name: "complete-initial-answer", matched: completeReply !== rawReply });
  } else {
    debug.stages.push({ name: "complete-initial-answer", matched: false, skipped: true, reason: "answer-completion-disabled" });
  }
  const payload = {
    reply: completeReply,
    escalationReady: isSuperuserCreateRequest(message),
    topic: "knowledge",
    options: [],
    version: liveReply ? "live-brs-knowledge-v1" : "knowledge-retrieval-v1",
    liveLookup: liveLookup?.successful ? liveLookup : null,
  };
  res.json(await prepareChatPayload({ client, payload, message: originalMessage, debug, debugEnabled, req }));
  return true;
}

async function enhancedChatHandler(req, res, next) {
  const debugEnabled = wantsChatDebug(req);
  const debug = { entrypoint: "server-with-feedback", stages: [] };
  const originalMessage = String(req.body?.message || "").trim();
  const history = getConversationHistory(req);
  const message = expandAffirmationMessage(originalMessage, history);

  try {
    const authContext = resolveAuthContext(req);
    assertBotAccess(authContext);
    debug.stages.push({ name: "auth-context", matched: true, clubId: authContext.clubId, source: authContext.source, authRequired: authContext.authRequired });

    const exhaustedWorkflowPayload = exhaustedWorkflowFollowUpPayload(originalMessage, history);
    debug.stages.push({ name: "exhausted-workflow-follow-up", matched: Boolean(exhaustedWorkflowPayload) });
    if (exhaustedWorkflowPayload) return res.json(await prepareChatPayload({ client, payload: exhaustedWorkflowPayload, message: originalMessage, debug, debugEnabled, req }));

    const contextualMessage = contextualiseShortClarificationFollowUp(message, history);
    if (contextualMessage !== message) debug.stages.push({ name: "contextual-short-follow-up", matched: true });
    const routingMessage = contextualMessage;

    const refundFlowPayload = handleRefundClarificationFlow(routingMessage, history, { includeInitialPrompt: false });
    debug.stages.push({ name: "refund-clarification-flow", matched: Boolean(refundFlowPayload) });
    if (refundFlowPayload) return res.json(await prepareChatPayload({ client, payload: refundFlowPayload, message: originalMessage, debug, debugEnabled, req }));

    const actionRoute = routeActionRequest(routingMessage);
    debug.stages.push({ name: "action-router", matched: Boolean(actionRoute), route: actionRoute?.type || null });
    if (actionRoute) {
      const actionPayload = await runActionRequest({ client, route: actionRoute, message: routingMessage, authContext });
      if (actionPayload) return res.json(await prepareChatPayload({ client, payload: actionPayload, message: originalMessage, debug, debugEnabled, req }));
    }

    if (isMemberBalanceLookup(routingMessage)) {
      debug.stages.push({ name: "direct-member-balance-intent", matched: true });
      const handled = await respondFromKnowledge({ req, res, message: routingMessage, originalMessage, debug, debugEnabled, routeLabel: "knowledge-answer-direct" });
      if (handled) return;
    }

    const objectFirstReply = answerFromObjectFirstRouting(routingMessage);
    debug.stages.push({ name: "object-first-routing", matched: Boolean(objectFirstReply), version: objectFirstReply?.version || null, topic: objectFirstReply?.topic || null });
    if (objectFirstReply?.routeStrength === "guardrail") return res.json(await prepareChatPayload({ client, payload: objectFirstReply, message: originalMessage, debug, debugEnabled, req }));
    if (objectFirstReply?.routeStrength === "specific") return res.json(await prepareChatPayload({ client, payload: objectFirstReply, message: originalMessage, debug, debugEnabled, req }));

    const initialRefundFlowPayload = handleRefundClarificationFlow(routingMessage, history);
    debug.stages.push({ name: "initial-refund-clarification-flow", matched: Boolean(initialRefundFlowPayload) });
    if (initialRefundFlowPayload) return res.json(await prepareChatPayload({ client, payload: initialRefundFlowPayload, message: originalMessage, debug, debugEnabled, req }));

    const preferStatefulClarification = shouldPreferStatefulClarification(routingMessage, history);
    debug.stages.push({ name: "stateful-clarification-precheck", matched: preferStatefulClarification });
    const handled = await respondFromKnowledge({
      req,
      res,
      message: routingMessage,
      originalMessage,
      debug,
      debugEnabled,
      allowDynamicKnowledge: !preferStatefulClarification,
      queueKnowledgeGaps: !preferStatefulClarification,
    });
    if (handled) return;

    if (objectFirstReply) return res.json(await prepareChatPayload({ client, payload: objectFirstReply, message: originalMessage, debug, debugEnabled, req }));

    debug.stages.push({ name: "legacy-server", matched: true });
    req.body = { ...req.body, message: routingMessage };
    if (debugEnabled) {
      req.body = { ...req.body, chatDebug: debug };
    }
    wrapJsonForChat({ client, res, message: originalMessage, debug, debugEnabled, req });
    return baseHandler(req, res, next);
  } catch (error) {
    if (error?.name === "AuthContextError") {
      debug.stages.push({ name: "auth-context", matched: false, error: error.message });
      return res.status(error.status || 403).json(withDebug({ ok: false, status: "forbidden", error: error.message }, debug, debugEnabled));
    }

    console.error("Enhanced chat routing failed, falling back to base chatbot:", error);
    debug.stages.push({ name: "enhanced-routing-error", matched: false, error: error.message || "Unknown error" });
    if (debugEnabled) {
      req.body = { ...req.body, message, chatDebug: debug };
    }
    wrapJsonForChat({ client, res, message: originalMessage, debug, debugEnabled, req });
    return baseHandler(req, res, next);
  }
}

app.post("/api/chat", rateLimiter, validateChatInput, enhancedChatHandler);
app.post("/chat", rateLimiter, validateChatInput, enhancedChatHandler);

app.post("/api/resolved-interactions", rateLimiter, async (req, res) => {
  try {
    const result = await recordResolvedInteractionWithLearning({ sessionId: getSessionId(req), payload: req.body });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    console.error("Resolved interaction tracking failed:", error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "Unable to record resolved interaction." });
  }
});

app.post("/api/feedback", rateLimiter, async (req, res) => {
  try {
    const result = await recordSurveyScoreWithLearning({ sessionId: getSessionId(req), payload: req.body });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    console.error("Survey feedback tracking failed:", error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "Unable to record survey feedback." });
  }
});

app.post("/api/actions/timesheet-request", rateLimiter, validateChatInput, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ ok: false, error: "Please enter a timesheet request." });

    const authContext = resolveAuthContext(req);
    assertBotAccess(authContext);
    const payload = await runTimesheetActionRequest({ client, message, authContext });
    res.status(payload.ok === false ? 403 : 200).json(payload);
  } catch (error) {
    console.error("Timesheet request failed:", error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Unable to run the timesheet request.",
    });
  }
});

app.get("/api/admin/survey-metrics", async (req, res) => {
  try {
    if (!hasQaAnalysisAccess(req)) {
      return res.status(403).json({ ok: false, error: "Admin access requires QA_ANALYSIS_SECRET." });
    }
    res.status(200).json(await getSurveyMetrics({
      startDate: req.query?.startDate,
      endDate: req.query?.endDate,
      startAt: req.query?.startAt,
      endAt: req.query?.endAt,
    }));
  } catch (error) {
    console.error("Survey metrics failed:", error);
    res.status(500).json({ ok: false, error: "Unable to load survey metrics." });
  }
});

function hasQaAnalysisAccess(req) {
  const secret = process.env.QA_ANALYSIS_SECRET;
  if (secret) {
    const auth = String(req.headers.authorization || "");
    const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    // Accept Bearer token or custom header only — never query string (leaks to logs/history).
    return bearer === secret || req.headers["x-qa-analysis-secret"] === secret;
  }
  return req.headers["x-vercel-cron"] === "1" || process.env.NODE_ENV !== "production";
}

app.all("/api/admin/qa-analysis/run", async (req, res) => {
  try {
    if (!hasQaAnalysisAccess(req)) {
      return res.status(403).json({ ok: false, error: "Q&A analysis requires QA_ANALYSIS_SECRET." });
    }
    const includeMarkdown = req.query?.includeMarkdown === "true" || req.body?.includeMarkdown === true;
    const result = await runQaAnalysis({
      startAt: req.query?.startAt || req.body?.startAt || null,
      endAt: req.query?.endAt || req.body?.endAt || null,
      outputDir: req.query?.outputDir || req.body?.outputDir || undefined,
      writeFile: req.query?.writeFile !== "false" && req.body?.writeFile !== false,
    });
    res.status(200).json({
      ok: true,
      filePath: result.filePath,
      fileName: result.fileName,
      workbookFilePath: result.workbookFilePath,
      workbookFileName: result.workbookFileName,
      summary: result.summary,
      markdown: includeMarkdown ? result.markdown : undefined,
    });
  } catch (error) {
    console.error("Q&A analysis failed:", error);
    res.status(500).json({ ok: false, error: error.message || "Unable to run Q&A analysis." });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, error: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((req, res) => baseHandler(req, res));

if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`BRS Support Agent listening on http://localhost:${port}`));
}

export default function handler(req, res) {
  return app(req, res);
}
