/**
 * Shared OpenAI utility functions.
 *
 * Provides timeout handling, graceful fallback, and structured error capture
 * for all OpenAI API calls in the application.
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.BRS_OPENAI_TIMEOUT_MS || 12000);

/**
 * Wraps an OpenAI API call with a timeout.
 * Returns null (instead of throwing) when the call times out or fails,
 * allowing callers to gracefully fall back.
 *
 * @param {Function} apiCall - An async function that makes the OpenAI request.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] - Override the default timeout.
 * @param {string} [options.label] - Label for logging (e.g. "classifySupportIntent").
 * @param {*} [options.fallback] - Value to return on timeout/error (default: null).
 * @returns {Promise<*>} The API response, or the fallback value on failure.
 */
export async function withTimeout(apiCall, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, label = "openai-call", fallback = null } = options;

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`OpenAI call timed out after ${timeoutMs}ms [${label}]`)), timeoutMs);
  });

  try {
    const result = await Promise.race([apiCall(), timeout]);
    clearTimeout(timer);
    return result;
  } catch (error) {
    clearTimeout(timer);
    const isTimeout = error.message?.includes("timed out");
    const isRateLimit = error.status === 429;
    const level = isTimeout ? "warn" : "error";
    console[level](`[${label}] OpenAI ${isTimeout ? "timeout" : isRateLimit ? "rate limited" : "error"}: ${error.message}`);
    return fallback;
  }
}

/**
 * Friendly fallback message when the AI service is unavailable.
 */
export const AI_UNAVAILABLE_REPLY = "I'm currently experiencing high demand and cannot generate a response right now. Please try again in a moment, or contact support directly if your query is urgent.";
