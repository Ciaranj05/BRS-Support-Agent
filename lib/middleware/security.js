/**
 * Security middleware for the BRS Support Agent.
 *
 * Provides: rate limiting, input validation, security headers, and CORS configuration.
 */

// ─── RATE LIMITER ───
// Simple in-memory sliding-window rate limiter.
// For production at scale, replace with Redis-backed middleware.
const requestCounts = new Map();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = Number(process.env.BRS_RATE_LIMIT_PER_MINUTE || 30);
const CLEANUP_INTERVAL_MS = 5 * 60_000;

// Periodically clean expired entries to prevent memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts) {
    if (now - entry.windowStart > WINDOW_MS * 2) {
      requestCounts.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Rate limiting middleware.
 * Keyed by IP address (or x-forwarded-for behind a proxy).
 */
export function rateLimiter(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
  const now = Date.now();

  let entry = requestCounts.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    requestCounts.set(ip, entry);
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      ok: false,
      error: "Too many requests. Please wait a moment before trying again.",
    });
    return;
  }

  next();
}

// ─── INPUT VALIDATION ───
const MAX_MESSAGE_LENGTH = Number(process.env.BRS_MAX_MESSAGE_LENGTH || 4000);
const MAX_HISTORY_ITEMS = 50;

/**
 * Validates incoming chat messages for length and type.
 * Applied to POST /api/chat.
 */
export function validateChatInput(req, res, next) {
  const { message, conversationHistory } = req.body || {};

  if (message !== undefined && typeof message !== "string") {
    return res.status(400).json({ ok: false, error: "Message must be a string." });
  }

  if (message && message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      ok: false,
      error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }

  if (conversationHistory !== undefined) {
    if (!Array.isArray(conversationHistory)) {
      return res.status(400).json({ ok: false, error: "conversationHistory must be an array." });
    }
    if (conversationHistory.length > MAX_HISTORY_ITEMS) {
      // Silently truncate to most recent items rather than rejecting.
      req.body.conversationHistory = conversationHistory.slice(-MAX_HISTORY_ITEMS);
    }
  }

  next();
}

// ─── SECURITY HEADERS ───
/**
 * Sets standard security headers on all responses.
 */
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0"); // Modern browsers: CSP is preferred over this header.
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Content-Security-Policy: restrict to self and known external resources.
  // Adjust if additional CDNs or analytics are added.
  if (!req.path.startsWith("/api")) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';"
    );
  }

  next();
}

// ─── CORS CONFIGURATION ───
/**
 * Returns CORS options based on environment.
 * In production (VERCEL=1 or NODE_ENV=production), restricts to configured origins.
 * In development, allows all origins for convenience.
 */
export function getCorsOptions() {
  const isProduction = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

  if (!isProduction) {
    return {}; // Allow all origins in development.
  }

  const allowedOrigins = (process.env.BRS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // If no origins configured in production, allow the Vercel deployment URL pattern.
  if (allowedOrigins.length === 0) {
    allowedOrigins.push("https://brs-support-agent.vercel.app");
  }

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, mobile apps).
      if (!origin) return callback(null, true);
      if (allowedOrigins.some((allowed) => origin === allowed || origin.endsWith(".vercel.app"))) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-session-id", "x-brs-club-id", "x-brs-user-id", "x-brs-permissions", "x-brs-roles", "Authorization"],
    maxAge: 86400,
  };
}
