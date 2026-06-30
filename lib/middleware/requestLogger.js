/**
 * Lightweight structured request logging middleware.
 *
 * Logs JSON-formatted entries for each API request including:
 * - Request ID (for correlation)
 * - Session ID
 * - Method and path
 * - Response status and latency
 * - Route used and topic (from response payload)
 *
 * Does NOT log message content or conversation history (privacy).
 */

let requestCounter = 0;

/**
 * Generates a short request ID for correlation.
 * Not globally unique across instances — use session ID for cross-instance tracing.
 */
function generateRequestId() {
  requestCounter = (requestCounter + 1) % 1_000_000;
  return `req_${Date.now().toString(36)}_${requestCounter.toString(36)}`;
}

/**
 * Attaches a request ID and logs structured request/response data.
 */
export function requestLogger(req, res, next) {
  // Only log API requests, not static files.
  if (!req.path.startsWith("/api")) return next();

  const requestId = generateRequestId();
  const startTime = Date.now();

  // Attach request ID for downstream use.
  req.requestId = requestId;

  // Capture response finish to log the complete request.
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const sessionId = req.headers["x-session-id"] || req.body?.sessionId || "-";

    const entry = {
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      requestId,
      sessionId: sessionId.slice(0, 16), // Truncate for readability.
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    };

    // Log as single-line JSON for Vercel log ingestion.
    console.log(JSON.stringify(entry));
  });

  next();
}
