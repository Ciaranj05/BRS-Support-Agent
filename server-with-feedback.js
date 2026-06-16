import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import baseHandler from "./server.js";
import { getSurveyMetrics, recordResolvedInteraction, recordSurveyScore } from "./feedbackStore.js";
import { answerFromKnowledge, isBRSWorkflowQuestion } from "./lib/knowledgeAnswer.js";
import { answerFromObjectFirstRouting } from "./lib/objectFirstRouting.js";
import { rewriteAddsUnsupportedDetails } from "./lib/rewriteSafety.js";
import { formatLiveEvidence, liveBrsLookup, shouldAttemptLiveBrsLookup } from "./lib/liveBrsLookup.js";
import { saveLearnedWorkflowFromResolution } from "./lib/workflowLearning.js";
import { enqueueWorkflowExploration } from "./lib/workflowExplorationQueue.js";
import { isMoveBookingQuestion } from "./lib/bookingWorkflowAnswers.js";
import { routeActionRequest } from "./lib/actionRouter.js";
import { executeTimesheetPlan } from "./lib/timesheetExecutor.js";
import { formatTimesheetConfirmation, planTimesheetRequest } from "./lib/timesheetPlanner.js";
import { assertBotAccess, canRunBotAction, resolveAuthContext } from "./lib/security/authContext.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const app = express();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

function getSessionId(req) {
  return (req.headers["x-session-id"] || req.body?.sessionId || req.query?.sessionId || "default-session").toString();
}

function wantsChatDebug(req) {
  return req.body?.debug === true || req.query?.debug === "true" || process.env.BRS_CHAT_DEBUG === "true";
}

function withDebug(payload, debug, enabled) {
  return enabled ? { ...payload, debug } : payload;
}

function formatTimesheetClarification(missing = []) {
  const labels = {
    year: "the year",
    "start and end time": "the first and last tee time",
    "days of week": "which days to configure",
    "tee time interval": "the tee time interval",
    "both alternative interval values": "both alternative interval values",
    "timesheet configuration details": "the timesheet details",
  };
  const details = missing.map((item) => labels[item] || item);
  return `I can configure that for you. Please send ${details.join(", ")}.`;
}

async function runTimesheetActionRequest(message, authContext) {
  if (!canRunBotAction(authContext, "timesheet.configure")) {
    return {
      ok: false,
      action: "timesheet.configure",
      status: "forbidden",
      error: "You do not have permission to configure the timesheet for this BRS club.",
    };
  }
  const plan = await planTimesheetRequest(client, message);
  if (plan.unsupported.length) {
    const intervalIssue = plan.unsupported.find((item) => item.includes("4 to 20"));
    return {
      ok: true,
      action: "timesheet.configure",
      status: "unsupported",
      reply: intervalIssue
        ? "BRS supports tee time intervals from 4 to 20 minutes for this action. Please choose interval values in that range."
        : `I cannot run that safely yet: ${plan.unsupported.join(", ")}.`,
      plan,
    };
  }

  if (plan.missing.length) {
    return {
      ok: true,
      action: "timesheet.configure",
      status: "needs_clarification",
      reply: formatTimesheetClarification(plan.missing),
      plan,
    };
  }

  if (process.env.BRS_TIMESHEET_AUTOMATION_ENABLED !== "true") {
    return {
      ok: false,
      action: "timesheet.configure",
      status: "disabled",
      error: "Timesheet automation is disabled. Set BRS_TIMESHEET_AUTOMATION_ENABLED=true in .env to use it locally.",
    };
  }

  const results = await executeTimesheetPlan(plan);

  return {
    ok: true,
    action: "timesheet.configure",
    status: "completed",
    reply: formatTimesheetConfirmation(plan.actions),
    plan,
    results,
  };
}

async function runActionRequest(route, message, authContext) {
  if (route?.type === "timesheet.configure") return runTimesheetActionRequest(message, authContext);
  return null;
}

function shouldRewriteReply(reply) {
  return typeof reply === "string" && reply.trim().length > 0;
}

function getHistory(req) {
  return Array.isArray(req.body?.conversationHistory) ? req.body.conversationHistory : [];
}

function isBareAffirmation(message = "") {
  return /^(yes|yeah|yep|sure|ok|okay|please|go ahead|do it|guide me|yes please|yes guide me)$/i.test(String(message || "").trim());
}

function lastAssistantPrompt(history = []) {
  return [...history].reverse().find((item) => item.role === "assistant" && /\?\s*$/.test(String(item.content || "").trim())) || null;
}

function expandAffirmationMessage(message, history = []) {
  if (!isBareAffirmation(message)) return message;
  const prompt = lastAssistantPrompt(history);
  if (!prompt?.content) return message;
  const priorUser = [...history].reverse().find((item) => item.role === "user" && item.content && !isBareAffirmation(item.content));
  return [
    priorUser?.content ? `Original question: ${priorUser.content}` : null,
    `The user answered yes to this assistant prompt: ${prompt.content}`,
    "Provide the detailed steps that were offered. Do not ask another broad clarification question.",
  ].filter(Boolean).join("\n");
}

function isMemberBalanceLookup(message = "") {
  const lower = String(message || "").toLowerCase();
  const mentionsMembers = /\b(member|members|membership|memberships)\b/.test(lower);
  const mentionsDebt = /\b(owe|owes|owed|owing|money|balance|balances|unpaid|outstanding|overdue|arrears|debt|debtor|debtors|bill|bills|invoice|invoices)\b/.test(lower);
  const asksToFind = /\b(which|who|show|see|find|list|report|view|check|download|export)\b/.test(lower);
  return mentionsMembers && mentionsDebt && asksToFind;
}

async function rewriteReplyInOwnWords(reply, message) {
  if (!shouldRewriteReply(reply)) return reply;

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `Rewrite the support answer in your own words for a non-technical BRS Golf admin user.

Rules:
- Use a readable format with a short heading and one numbered list when the supplied answer is a workflow.
- Do not mix bullet points inside numbered workflow steps.
- Do not copy sentences or paragraphs from the supplied answer or knowledge source wording.
- Digest the meaning, then explain it in low-level, easy language.
- Keep exact product names, phone numbers, email addresses, URLs, button labels, menu paths, and legally/safety-sensitive values unchanged when changing them would make the answer inaccurate.
- Do not add product facts, UI paths, buttons, policies, prices, workflow steps, field names, filters, exports, or promises that are not present in the supplied answer.
- Preserve any source link at the end.
- Do not end with optional follow-up prompts like "Would you like me to..." when the source answer already contains useful next steps. Include those next steps directly instead.
- Ask a follow-up question only when the answer cannot be safely given without one.`,
        },
        {
          role: "user",
          content: `User message:\n${message || "Unknown"}\n\nAnswer to rewrite:\n${reply}`,
        },
      ],
    });

    const rewritten = response.output_text?.trim() || reply;
    return rewriteAddsUnsupportedDetails(reply, rewritten) ? reply : rewritten;
  } catch (error) {
    console.error("Reply rewrite failed, sending original supported answer:", error);
    return reply;
  }
}

function buildResponseHistory(req, message, payload) {
  const baseHistory = getHistory(req);
  const hasLatestUser = [...baseHistory].reverse().some((item) => item.role === "user" && item.content === message);
  const history = hasLatestUser ? [...baseHistory] : [...baseHistory, { role: "user", content: message }];
  if (!payload?.reply) return history;
  return [
    ...history,
    {
      role: "assistant",
      content: payload.reply,
      liveLookup: payload.liveLookup || null,
      version: payload.version || null,
      topic: payload.topic || null,
      options: payload.options || [],
      clarificationId: payload.clarificationId || null,
    },
  ];
}

async function prepareChatPayload(payload, message, debug, debugEnabled, req = null) {
  const nextPayload = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : payload;
  if (nextPayload && nextPayload.version !== "strict-evidence-gap-v1" && shouldRewriteReply(nextPayload.reply)) {
    nextPayload.reply = await rewriteReplyInOwnWords(nextPayload.reply, message);
  }
  if (nextPayload && req) {
    nextPayload.conversationHistory = buildResponseHistory(req, message, nextPayload);
  }
  return withDebug(nextPayload, debug, debugEnabled);
}

function wrapJsonForChat(res, message, debug, debugEnabled, req = null) {
  const originalJson = res.json.bind(res);
  res.json = async (payload) => originalJson(await prepareChatPayload(payload, message, debug, debugEnabled, req));
}

async function answerFromLiveEvidence(message, existingReply, liveEvidence) {
  if (!liveEvidence) return null;
  try {
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: `You are a BRS Golf support agent. Answer from the supplied live read-only BRS evidence plus any existing approved answer.

Rules:
- Give a complete answer only when the live evidence directly proves the workflow.
- Use a readable structure: short heading, then one numbered list of directly observed steps.
- Do not mix bullet points inside numbered workflow steps.
- If the evidence contains multiple route names, route actors, or route preconditions, explain each proven route separately and state when that route applies.
- Include filtering, date ranges/statuses, viewing results, exporting/downloading, and checking columns only when the live evidence directly names those controls or columns.
- Use live BRS evidence for exact menu names, page headings, filters, buttons, report names, table columns, and navigation hints.
- Do not mention or expose member-specific, club-specific, payment-specific, personal, or financial data.
- Do not claim you changed anything in BRS.
- Do not tell the user to click dangerous actions such as Save, Submit, Create, Delete, Refund, Charge, Send, Update, Confirm, or Apply unless that exact visible control is present in the supplied evidence and the task requires a final user-controlled action.
- Generate a fresh answer for this user. Do not copy a stored answer word-for-word.
- If the live evidence is incomplete, say: "I do not have a complete directly observed workflow for that yet."
- Ask a follow-up question only when the answer depends on missing information that cannot be inferred from the question or evidence.`,
        },
        {
          role: "user",
          content: `USER QUESTION:\n${message}\n\nEXISTING APPROVED ANSWER, IF ANY:\n${existingReply || "None"}\n\nLIVE READ-ONLY BRS EVIDENCE:\n${liveEvidence}`,
        },
      ],
    });
    return response.output_text?.trim() || null;
  } catch (error) {
    console.error("Live evidence answer generation failed:", error);
    return null;
  }
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

async function respondFromKnowledge({ req, res, message, originalMessage, debug, debugEnabled, routeLabel = "knowledge" }) {
  const reply = await answerFromKnowledge(message);
  debug.stages.push({ name: routeLabel, matched: Boolean(reply), directIntent: isMemberBalanceLookup(message) });

  let liveLookup = null;
  let liveReply = null;
  const isWorkflowQuestion = isBRSWorkflowQuestion(message);
  const hasProtectedApprovedWorkflow = isMoveBookingQuestion(message) && Boolean(reply);
  const shouldUseLiveLookup = !hasProtectedApprovedWorkflow && (shouldAttemptLiveBrsLookup(message, reply || "") || isWorkflowQuestion);
  if (shouldUseLiveLookup) {
    liveLookup = await liveBrsLookup(message, { staticEvidence: reply || "" });
    const liveEvidence = formatLiveEvidence(liveLookup);
    debug.stages.push({
      name: "live-brs-lookup",
      matched: Boolean(liveLookup?.successful),
      attempted: Boolean(liveLookup?.attempted),
      mode: liveLookup?.mode || null,
      timings: liveLookup?.timings || [],
      totalMs: liveLookup?.totalMs || null,
      error: liveLookup?.error || null,
    });
    if (liveEvidence) liveReply = await answerFromLiveEvidence(message, reply, liveEvidence);
    debug.stages.push({ name: "live-evidence-answer", matched: Boolean(liveReply) });
  }

  if (!(liveReply || reply)) {
    if (isWorkflowQuestion) {
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
      res.json(await prepareChatPayload(payload, originalMessage, debug, debugEnabled, req));
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
      res.json(await prepareChatPayload(payload, originalMessage, debug, debugEnabled, req));
      return true;
    }
  }
  const completeReply = await completeInitialAnswer(message, liveReply || reply);
  debug.stages.push({ name: "complete-initial-answer", matched: completeReply !== (liveReply || reply) });
  const payload = {
    reply: completeReply,
    escalationReady: false,
    topic: "knowledge",
    options: [],
    version: liveReply ? "live-brs-knowledge-v1" : "knowledge-retrieval-v1",
    liveLookup: liveLookup?.successful ? liveLookup : null,
  };
  res.json(await prepareChatPayload(payload, originalMessage, debug, debugEnabled, req));
  return true;
}

async function enhancedChatHandler(req, res, next) {
  const debugEnabled = wantsChatDebug(req);
  const debug = { entrypoint: "server-with-feedback", stages: [] };
  const originalMessage = String(req.body?.message || "").trim();
  const history = getHistory(req);
  const message = expandAffirmationMessage(originalMessage, history);

  try {
    const authContext = resolveAuthContext(req);
    assertBotAccess(authContext);
    debug.stages.push({ name: "auth-context", matched: true, clubId: authContext.clubId, source: authContext.source, authRequired: authContext.authRequired });

    const actionRoute = routeActionRequest(message);
    debug.stages.push({ name: "action-router", matched: Boolean(actionRoute), route: actionRoute?.type || null });
    if (actionRoute) {
      const actionPayload = await runActionRequest(actionRoute, message, authContext);
      if (actionPayload) return res.json(withDebug(actionPayload, debug, debugEnabled));
    }

    if (isMemberBalanceLookup(message)) {
      debug.stages.push({ name: "direct-member-balance-intent", matched: true });
      const handled = await respondFromKnowledge({ req, res, message, originalMessage, debug, debugEnabled, routeLabel: "knowledge-answer-direct" });
      if (handled) return;
    }

    const objectFirstReply = answerFromObjectFirstRouting(message);
    debug.stages.push({ name: "object-first-routing", matched: Boolean(objectFirstReply), version: objectFirstReply?.version || null, topic: objectFirstReply?.topic || null });
    if (objectFirstReply?.routeStrength === "guardrail") return res.json(await prepareChatPayload(objectFirstReply, originalMessage, debug, debugEnabled, req));

    const handled = await respondFromKnowledge({ req, res, message, originalMessage, debug, debugEnabled });
    if (handled) return;

    if (objectFirstReply) return res.json(await prepareChatPayload(objectFirstReply, originalMessage, debug, debugEnabled, req));

    debug.stages.push({ name: "legacy-server", matched: true });
    if (debugEnabled) {
      req.body = { ...req.body, message, chatDebug: debug };
    }
    wrapJsonForChat(res, originalMessage, debug, debugEnabled, req);
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
    wrapJsonForChat(res, originalMessage, debug, debugEnabled, req);
    return baseHandler(req, res, next);
  }
}

app.post("/api/chat", enhancedChatHandler);
app.post("/chat", enhancedChatHandler);

app.post("/api/resolved-interactions", async (req, res) => {
  try {
    const conversationHistory = req.body?.conversationHistory || [];
    const resolvedInteraction = await recordResolvedInteraction({
      sessionId: getSessionId(req),
      conversationId: req.body?.conversationId,
      resolvedBy: req.body?.resolvedBy || "user",
      topic: req.body?.topic || null,
      resolved: req.body?.resolved ?? true,
      escalated: req.body?.escalated ?? false,
      comment: req.body?.comment || "",
      conversationHistory,
    });
    const learnedWorkflow = await saveLearnedWorkflowFromResolution({
      conversationHistory,
      topic: req.body?.topic || null,
      resolved: req.body?.resolved ?? true,
      score: 100,
    }).catch((error) => {
      console.error("Workflow learning from resolved interaction failed:", error);
      return null;
    });
    res.status(201).json({ ok: true, resolvedInteraction, learnedWorkflow: learnedWorkflow ? { storage: learnedWorkflow.storage, filePath: learnedWorkflow.filePath, sourceId: learnedWorkflow.entry?.sourceId } : null });
  } catch (error) {
    console.error("Resolved interaction tracking failed:", error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "Unable to record resolved interaction." });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const conversationHistory = req.body?.conversationHistory || [];
    const result = await recordSurveyScore({
      resolvedInteractionId: req.body?.resolvedInteractionId,
      sessionId: getSessionId(req),
      conversationId: req.body?.conversationId,
      score: req.body?.score,
      type: req.body?.type || "resolution-score",
      comment: req.body?.comment || "",
      topic: req.body?.topic || null,
      conversationHistory,
    });
    const learnedWorkflow = await saveLearnedWorkflowFromResolution({
      conversationHistory,
      topic: req.body?.topic || null,
      resolved: Number(req.body?.score) >= 70,
      score: req.body?.score,
    }).catch((error) => {
      console.error("Workflow learning from survey feedback failed:", error);
      return null;
    });
    res.status(201).json({ ok: true, ...result, learnedWorkflow: learnedWorkflow ? { storage: learnedWorkflow.storage, filePath: learnedWorkflow.filePath, sourceId: learnedWorkflow.entry?.sourceId } : null });
  } catch (error) {
    console.error("Survey feedback tracking failed:", error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "Unable to record survey feedback." });
  }
});

app.post("/api/actions/timesheet-request", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ ok: false, error: "Please enter a timesheet request." });

    const authContext = resolveAuthContext(req);
    assertBotAccess(authContext);
    const payload = await runTimesheetActionRequest(message, authContext);
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
