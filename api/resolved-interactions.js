import handler from "../server-with-feedback.js";

export default function resolvedInteractionsHandler(req, res) {
  return handler(req, res);
}
