import { getSurveyMetrics } from "../../feedbackStore.js";

export default async function surveyMetricsHandler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    return res.status(200).json(await getSurveyMetrics({ startDate: req.query?.startDate, endDate: req.query?.endDate }));
  } catch (error) {
    console.error("Survey metrics failed:", error);
    return res.status(500).json({ ok: false, error: "Unable to load survey metrics." });
  }
}
