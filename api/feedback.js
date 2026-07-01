import handler from "../server-with-feedback.js";

export default function feedbackHandler(req, res) {
  return handler(req, res);
}
