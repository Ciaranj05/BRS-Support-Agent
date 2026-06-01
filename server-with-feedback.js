import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import baseHandler from "./server.js";
import { getSurveyMetrics, recordResolvedInteraction, recordSurveyScore } from "./feedbackStore.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const app = express();

app.use(cors());
app.use(express.json());

function getSessionId(req) {
  return (req.headers["x-session-id"] || req.body?.sessionId || req.query?.sessionId || "default-session").toString();
}

app.post("/api/resolved-interactions", async (req, res) => {
  try {
    const resolvedInteraction = await recordResolvedInteraction({
      sessionId: getSessionId(req),
      conversationId: req.body?.conversationId,
      resolvedBy: req.body?.resolvedBy || "user",
      topic: req.body?.topic || null,
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
    res.json(await getSurveyMetrics());
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
