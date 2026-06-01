import { recordSurveyScore } from "../feedbackStore.js";

function getSessionId(req) {
  return (req.headers["x-session-id"] || req.body?.sessionId || req.query?.sessionId || "default-session").toString();
}

export default async function feedbackHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

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
    return res.status(201).json({ ok: true, ...result });
  } catch (error) {
    console.error("Survey feedback tracking failed:", error);
    return res.status(error.status || 500).json({ ok: false, error: error.message || "Unable to record survey feedback." });
  }
}
