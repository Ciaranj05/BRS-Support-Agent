import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import baseHandler from "./server.js";
import { getSurveyMetrics, recordResolvedInteraction, recordSurveyScore } from "./feedbackStore.js";
import { answerFromKnowledge } from "./lib/knowledgeAnswer.js";
import { answerFromObjectFirstRouting } from "./lib/objectFirstRouting.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const app = express();

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

app.post("/api/chat", async (req, res, next) => {
  const debugEnabled = wantsChatDebug(req);
  const debug = { entrypoint: "server-with-feedback", stages: [] };

  try {
    const message = String(req.body?.message || "").trim();

    const objectFirstReply = answerFromObjectFirstRouting(message);
    debug.stages.push({ name: "object-first-routing", matched: Boolean(objectFirstReply), version: objectFirstReply?.version || null, topic: objectFirstReply?.topic || null });
    if (objectFirstReply) return res.json(withDebug(objectFirstReply, debug, debugEnabled));

    const reply = await answerFromKnowledge(message);
    debug.stages.push({ name: "knowledge-answer", matched: Boolean(reply) });
    if (reply) {
      return res.json(withDebug({ reply, escalationReady: false, topic: "knowledge", options: [], version: "knowledge-retrieval-v1" }, debug, debugEnabled));
    }

    debug.stages.push({ name: "legacy-server", matched: true });
    if (debugEnabled) {
      req.body = { ...req.body, chatDebug: debug };
    }
    return baseHandler(req, res, next);
  } catch (error) {
    console.error("Enhanced chat routing failed, falling back to base chatbot:", error);
    debug.stages.push({ name: "enhanced-routing-error", matched: false, error: error.message || "Unknown error" });
    if (debugEnabled) {
      req.body = { ...req.body, chatDebug: debug };
    }
    return baseHandler(req, res, next);
  }
});

app.post("/api/resolved-interactions", async (req, res) => {
  try {
    const resolvedInteraction = await recordResolvedInteraction({
      sessionId: getSessionId(req),
      conversationId: req.body?.conversationId,
      resolvedBy: req.body?.resolvedBy || "user",
      topic: req.body?.topic || null,
      resolved: req.body?.resolved ?? true,
      escalated: req.body?.escalated ?? false,
      comment: req.body?.comment || "",
      conversationHistory: req.body?.conversationHistory || [],
    });
    res.status(201).json({ ok: true, resolvedInteraction });
  } catch (error) {
    console.error("Resolved interaction tracking failed:", error);
    res.status(error.status || 500).json({ ok: false, error: error.message || "Unable to record resolved interaction." });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const result = await recordSurveyScore({
      resolvedInteractionId: req.body?.resolvedInteractionId,
      sessionId: getSessionId(req),
      conversationId: req.body?.conversationId,
      score: req.body?.score,
      type: req.body?.type || "resolution-score",
      comment: req.body?.comment || "",
      topic: req.body?.topic || null,
      conversationHistory: req.body?.conversationHistory || [],
    });
    res.status(201).json({ ok: true, ...result });
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
