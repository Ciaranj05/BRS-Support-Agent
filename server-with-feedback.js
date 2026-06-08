import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import baseHandler from "./server.js";
import { getSurveyMetrics, recordResolvedInteraction, recordSurveyScore } from "./feedbackStore.js";
import { answerFromKnowledge } from "./lib/knowledgeAnswer.js";
import { answerFromObjectFirstRouting } from "./lib/objectFirstRouting.js";
import { rewriteAddsUnsupportedDetails } from "./lib/rewriteSafety.js";
import { formatLiveEvidence, liveBrsLookup, shouldAttemptLiveBrsLookup } from "./lib/liveBrsLookup.js";
import { saveLearnedWorkflowFromResolution } from "./lib/workflowLearning.js";

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

function shouldRewriteReply(reply) {
  return typeof reply === "string" && reply.trim().length > 0;
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
- Do not copy sentences or paragraphs from the supplied answer or knowledge source wording.
- Digest the meaning, then explain it in low-level, easy language.
- Keep the answer short, practical, and step-by-step when steps are useful.
- Keep exact product names, phone numbers, email addresses, URLs, button labels, menu paths, and legally/safety-sensitive values unchanged when changing them would make the answer inaccurate.
- Do not add any new product facts, UI paths, buttons, policies, prices, or promises.
- Preserve any source link at the end.
- If the answer is asking one clarification question, keep it as one simple question.`,
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

async function prepareChatPayload(payload, message, debug, debugEnabled) {
  const nextPayload = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : payload;
  if (nextPayload && shouldRewriteReply(nextPayload.reply)) {
    nextPayload.reply = await rewriteReplyInOwnWords(nextPayload.reply, message);
  }
  return withDebug(nextPayload, debug, debugEnabled);
}

function wrapJsonForChat(res, message, debug, debugEnabled) {
  const originalJson = res.json.bind(res);
  res.json = async (payload) => originalJson(await prepareChatPayload(payload, message, debug, debugEnabled));
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
- Use live BRS evidence for exact menu names, page headings, filters, buttons, report names, table columns, and navigation hints.
- Do not mention or expose member-specific, club-specific, payment-specific, personal, or financial data.
- Do not claim you changed anything in BRS.
- Do not tell the user to click dangerous actions such as Save, Submit, Create, Delete, Refund, Charge, Send, Update, Confirm, or Apply unless the exact task requires a final user-controlled action and the evidence supports it.
- Generate a fresh answer for this user. Do not copy a stored answer word-for-word.
- If the live evidence is not enough, say what area to check next rather than inventing a route.`,
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

function appendLearningMetadata(history = [], assistantPayload = {}) {
  if (!assistantPayload?.reply) return history;
  return [
    ...history,
    {
      role: "assistant",
      content: assistantPayload.reply,
      liveLookup: assistantPayload.liveLookup || null,
      version: assistantPayload.version || null,
      topic: assistantPayload.topic || null,
    },
  ];
}

async function enhancedChatHandler(req, res, next) {
  const debugEnabled = wantsChatDebug(req);
  const debug = { entrypoint: "server-with-feedback", stages: [] };
  const message = String(req.body?.message || "").trim();

  try {
    const objectFirstReply = answerFromObjectFirstRouting(message);
    debug.stages.push({ name: "object-first-routing", matched: Boolean(objectFirstReply), version: objectFirstReply?.version || null, topic: objectFirstReply?.topic || null });
    if (objectFirstReply?.routeStrength === "guardrail") return res.json(await prepareChatPayload(objectFirstReply, message, debug, debugEnabled));

    const reply = await answerFromKnowledge(message);
    debug.stages.push({ name: "knowledge-answer", matched: Boolean(reply) });

    let liveLookup = null;
    let liveReply = null;
    if (shouldAttemptLiveBrsLookup(message, reply || "")) {
      liveLookup = await liveBrsLookup(message, { staticEvidence: reply || "" });
      const liveEvidence = formatLiveEvidence(liveLookup);
      debug.stages.push({ name: "live-brs-lookup", matched: Boolean(liveLookup?.successful), attempted: Boolean(liveLookup?.attempted), error: liveLookup?.error || null });
      if (liveEvidence) liveReply = await answerFromLiveEvidence(message, reply, liveEvidence);
      debug.stages.push({ name: "live-evidence-answer", matched: Boolean(liveReply) });
    }

    if (liveReply || reply) {
      const payload = {
        reply: liveReply || reply,
        escalationReady: false,
        topic: "knowledge",
        options: [],
        version: liveReply ? "live-brs-knowledge-v1" : "knowledge-retrieval-v1",
        liveLookup: liveLookup?.successful ? liveLookup : null,
      };
      return res.json(await prepareChatPayload(payload, message, debug, debugEnabled));
    }

    if (objectFirstReply) return res.json(await prepareChatPayload(objectFirstReply, message, debug, debugEnabled));

    debug.stages.push({ name: "legacy-server", matched: true });
    if (debugEnabled) {
      req.body = { ...req.body, chatDebug: debug };
    }
    wrapJsonForChat(res, message, debug, debugEnabled);
    return baseHandler(req, res, next);
  } catch (error) {
    console.error("Enhanced chat routing failed, falling back to base chatbot:", error);
    debug.stages.push({ name: "enhanced-routing-error", matched: false, error: error.message || "Unknown error" });
    if (debugEnabled) {
      req.body = { ...req.body, chatDebug: debug };
    }
    wrapJsonForChat(res, message, debug, debugEnabled);
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
    res.status(201).json({ ok: true, resolvedInteraction, learnedWorkflow: learnedWorkflow ? { filePath: learnedWorkflow.filePath, sourceId: learnedWorkflow.entry?.sourceId } : null });
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
    res.status(201).json({ ok: true, ...result, learnedWorkflow: learnedWorkflow ? { filePath: learnedWorkflow.filePath, sourceId: learnedWorkflow.entry?.sourceId } : null });
  } catch (error) {
    console.error("Survey feedback tracking failed:", error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "Unable to record survey feedback." });
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

app.use((req, res) => baseHandler(req, res));

if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`BRS Support Agent listening on http://localhost:${port}`));
}

export default function handler(req, res) {
  return app(req, res);
}
