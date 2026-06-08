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
  const baseHistory = Array.isArray(req.body?.conversationHistory) ? req.body.conversationHistory : [];
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
  if (nextPayload && shouldRewriteReply(nextPayload.reply)) {
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
- Give the most complete useful first answer you can from the evidence. Do not hold back known steps behind "would you like me to..." prompts.
- Include safe downstream steps such as filtering, narrowing date ranges/statuses, viewing results, exporting/downloading, and checking columns when the evidence supports them.
- Use live BRS evidence for exact menu names, page headings, filters, buttons, report names, table columns, and navigation hints.
- Do not mention or expose member-specific, club-specific, payment-specific, personal, or financial data.
- Do not claim you changed anything in BRS.
- Do not tell the user to click dangerous actions such as Save, Submit, Create, Delete, Refund, Charge, Send, Update, Confirm, or Apply unless the exact task requires a final user-controlled action and the evidence supports it.
- Generate a fresh answer for this user. Do not copy a stored answer word-for-word.
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
  if (!/\b(would you like|do you want|should i|can i guide|want me to|would you want)\b/i.test(answer)) return answer;
  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `Improve this BRS Golf support answer so it is complete on the first response.

Rules:
- Remove optional follow-up prompts such as "Would you like me to...".
- If the answer hints at a next safe step, include that safe step directly.
- Add only generic safe continuation steps that are already implied by the answer, such as using filters, selecting a billing cycle/date range/status, reviewing the results table, or using Export/Download if available.
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

async function enhancedChatHandler(req, res, next) {
  const debugEnabled = wantsChatDebug(req);
  const debug = { entrypoint: "server-with-feedback", stages: [] };
  const message = String(req.body?.message || "").trim();

  try {
    const objectFirstReply = answerFromObjectFirstRouting(message);
    debug.stages.push({ name: "object-first-routing", matched: Boolean(objectFirstReply), version: objectFirstReply?.version || null, topic: objectFirstReply?.topic || null });
    if (objectFirstReply?.routeStrength === "guardrail") return res.json(await prepareChatPayload(objectFirstReply, message, debug, debugEnabled, req));

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
      return res.json(await prepareChatPayload(payload, message, debug, debugEnabled, req));
    }

    if (objectFirstReply) return res.json(await prepareChatPayload(objectFirstReply, message, debug, debugEnabled, req));

    debug.stages.push({ name: "legacy-server", matched: true });
    if (debugEnabled) {
      req.body = { ...req.body, chatDebug: debug };
    }
    wrapJsonForChat(res, message, debug, debugEnabled, req);
    return baseHandler(req, res, next);
  } catch (error) {
    console.error("Enhanced chat routing failed, falling back to base chatbot:", error);
    debug.stages.push({ name: "enhanced-routing-error", matched: false, error: error.message || "Unknown error" });
    if (debugEnabled) {
      req.body = { ...req.body, chatDebug: debug };
    }
    wrapJsonForChat(res, message, debug, debugEnabled, req);
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
