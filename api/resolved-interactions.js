import { recordResolvedInteraction } from "../feedbackStore.js";

function getSessionId(req) {
  return (req.headers["x-session-id"] || req.body?.sessionId || req.query?.sessionId || "default-session").toString();
}

export default async function resolvedInteractionsHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

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
    return res.status(201).json({ ok: true, resolvedInteraction });
  } catch (error) {
    console.error("Resolved interaction tracking failed:", error);
    return res.status(error.status || 500).json({ ok: false, error: error.message || "Unable to record resolved interaction." });
  }
}
