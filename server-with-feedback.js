import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import baseHandler from "./server.js";
import { getSurveyMetrics } from "./feedbackStore.js";
import { answerFromKnowledge, isBRSWorkflowQuestion } from "./lib/knowledgeAnswer.js";
import { answerFromObjectFirstRouting } from "./lib/objectFirstRouting.js";
import { rewriteAddsUnsupportedDetails } from "./lib/rewriteSafety.js";
import { enqueueWorkflowExploration } from "./lib/workflowExplorationQueue.js";
import { isMemberBalanceReportQuestion } from "./lib/membershipWorkflowAnswers.js";
import { routeActionRequest } from "./lib/actionRouter.js";
import { assertBotAccess, resolveAuthContext } from "./lib/security/authContext.js";
import { expandAffirmationMessage, getConversationHistory, getSessionId, prepareChatPayload, wantsChatDebug, withDebug, wrapJsonForChat } from "./services/chat/chatPayloadService.js";
import { recordResolvedInteractionWithLearning, recordSurveyScoreWithLearning } from "./services/feedback/feedbackSubmissionService.js";
import { runActionRequest, runTimesheetActionRequest } from "./services/timesheet/timesheetActionService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const app = express();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

function isMemberBalanceLookup(message = "") {
  return isMemberBalanceReportQuestion(message);
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
  let completeReply = rawReply;
  if (process.env.BRS_ENABLE_ANSWER_COMPLETION === "true") {
    completeReply = await completeInitialAnswer(message, rawReply);
    debug.stages.push({ name: "complete-initial-answer", matched: completeReply !== rawReply });
  } else {
    debug.stages.push({ name: "complete-initial-answer", matched: false, skipped: true, reason: "answer-completion-disabled" });
  }
  const payload = {
    reply: completeReply,
    escalationReady: false,
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

    const actionRoute = routeActionRequest(message);
    debug.stages.push({ name: "action-router", matched: Boolean(actionRoute), route: actionRoute?.type || null });
    if (actionRoute) {
      const actionPayload = await runActionRequest({ client, route: actionRoute, message, authContext });
      if (actionPayload) return res.json(withDebug(actionPayload, debug, debugEnabled));
    }

    if (isMemberBalanceLookup(message)) {
      debug.stages.push({ name: "direct-member-balance-intent", matched: true });
      const handled = await respondFromKnowledge({ req, res, message, originalMessage, debug, debugEnabled, routeLabel: "knowledge-answer-direct" });
      if (handled) return;
    }

    const objectFirstReply = answerFromObjectFirstRouting(message);
    debug.stages.push({ name: "object-first-routing", matched: Boolean(objectFirstReply), version: objectFirstReply?.version || null, topic: objectFirstReply?.topic || null });
    if (objectFirstReply?.routeStrength === "guardrail") return res.json(await prepareChatPayload({ client, payload: objectFirstReply, message: originalMessage, debug, debugEnabled, req }));

    const handled = await respondFromKnowledge({ req, res, message, originalMessage, debug, debugEnabled });
    if (handled) return;

    if (objectFirstReply) return res.json(await prepareChatPayload({ client, payload: objectFirstReply, message: originalMessage, debug, debugEnabled, req }));

    debug.stages.push({ name: "legacy-server", matched: true });
    if (debugEnabled) {
      req.body = { ...req.body, message, chatDebug: debug };
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

app.post("/api/chat", enhancedChatHandler);
app.post("/chat", enhancedChatHandler);

app.post("/api/resolved-interactions", async (req, res) => {
  try {
    const result = await recordResolvedInteractionWithLearning({ sessionId: getSessionId(req), payload: req.body });
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    console.error("Resolved interaction tracking failed:", error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "Unable to record resolved interaction." });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const result = await recordSurveyScoreWithLearning({ sessionId: getSessionId(req), payload: req.body });
    res.status(201).json({ ok: true, ...result });
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
