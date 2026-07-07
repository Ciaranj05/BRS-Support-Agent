import { rewriteAddsUnsupportedDetails } from "../../lib/rewriteSafety.js";
import { recordQaInteraction } from "../../lib/qaInteractionStore.js";
import { applyAnswerQualityGate } from "../../lib/answerQuality.js";
import { applyDomainAnswerContract } from "../../lib/brsDomainModel.js";
import { applyContextualAnswerContract } from "../../lib/questionContextProfile.js";

export function getSessionId(req) {
  return (req.headers["x-session-id"] || req.body?.sessionId || req.query?.sessionId || "default-session").toString();
}

function isProductionRuntime() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function bearerToken(req) {
  const auth = String(req.headers?.authorization || "");
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
}

function hasDebugAccess(req) {
  if (!isProductionRuntime()) return true;
  const secret = process.env.BRS_CHAT_DEBUG_SECRET || process.env.QA_ANALYSIS_SECRET || "";
  if (!secret) return false;
  return bearerToken(req) === secret
    || req.headers?.["x-brs-debug-secret"] === secret
    || req.headers?.["x-qa-analysis-secret"] === secret;
}

export function wantsChatDebug(req) {
  const requested = req.body?.debug === true || req.query?.debug === "true" || process.env.BRS_CHAT_DEBUG === "true";
  return requested && hasDebugAccess(req);
}

export function withDebug(payload, debug, enabled) {
  return enabled ? { ...payload, debug } : payload;
}

export function getConversationHistory(req) {
  return Array.isArray(req.body?.conversationHistory) ? req.body.conversationHistory : [];
}

function shouldRewriteReply(reply) {
  return process.env.BRS_ENABLE_REPLY_REWRITE === "true" && typeof reply === "string" && reply.trim().length > 0;
}

function shouldSkipReplyRewrite(payload = {}) {
  return [
    "audience-aware-clarification-routing-v3",
    "knowledge-retrieval-v1",
    "object-first-routing-v1",
    "live-brs-knowledge-v1",
  ].includes(payload?.version);
}

function isBareAffirmation(message = "") {
  return /^(yes|yeah|yep|sure|ok|okay|please|go ahead|do it|guide me|yes please|yes guide me)$/i.test(String(message || "").trim());
}

function lastAssistantPrompt(history = []) {
  return [...history].reverse().find((item) => item.role === "assistant" && /\?\s*$/.test(String(item.content || "").trim())) || null;
}

export function expandAffirmationMessage(message, history = []) {
  if (!isBareAffirmation(message)) return message;
  const prompt = lastAssistantPrompt(history);
  if (!prompt?.content) return message;
  const priorUser = [...history].reverse().find((item) => item.role === "user" && item.content && !isBareAffirmation(item.content));
  return [
    priorUser?.content ? `Original question: ${priorUser.content}` : null,
    `The user answered yes to this assistant prompt: ${prompt.content}`,
    "Provide the detailed steps that were offered. Do not ask another broad clarification question.",
  ].filter(Boolean).join("\n");
}

async function rewriteReplyInOwnWords(client, reply, message) {
  if (!shouldRewriteReply(reply)) return reply;

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `Rewrite the support answer in your own words for a non-technical BRS Golf admin user.

Rules:
- Use a readable format with a short heading and one numbered list when the supplied answer is a workflow.
- Do not mix bullet points inside numbered workflow steps.
- Do not copy sentences or paragraphs from the supplied answer or knowledge source wording.
- Digest the meaning, then explain it in low-level, easy language.
- Keep exact product names, phone numbers, email addresses, URLs, button labels, menu paths, and legally/safety-sensitive values unchanged when changing them would make the answer inaccurate.
- Do not add product facts, UI paths, buttons, policies, prices, workflow steps, field names, filters, exports, or promises that are not present in the supplied answer.
- Preserve any source link at the end.
- Do not end with optional follow-up prompts like "Would you like me to..." when the source answer already contains useful next steps. Include those next steps directly instead.
- Ask a follow-up question only when the answer cannot be safely given without one.`,
        },
        {
          role: "user",
          content: `User message:\n${message || "Unknown"}\n\nAnswer to rewrite:\n${reply}`,
        },
      ],
    });

    const rewritten = response.output_text?.trim() || reply;
    return rewriteAddsUnsupportedDetails(reply, rewritten) ? reply : rewritten;
  } catch (error) {
    console.error("Reply rewrite failed, sending original supported answer:", error);
    return reply;
  }
}

function buildResponseHistory(req, message, payload) {
  const baseHistory = getConversationHistory(req);
  const hasLatestUser = [...baseHistory].reverse().some((item) => item.role === "user" && item.content === message);
  const history = hasLatestUser ? [...baseHistory] : [...baseHistory, { role: "user", content: message }];
  if (!payload?.reply) return history;
  return [
    ...history,
    {
      role: "assistant",
      content: payload.reply,
      liveLookup: payload.liveLookup || null,
      version: payload.version || null,
      topic: payload.topic || null,
      options: payload.options || [],
      clarificationId: payload.clarificationId || null,
    },
  ];
}

export async function prepareChatPayload({ client, payload, message, debug, debugEnabled, req = null }) {
  let nextPayload = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : payload;
  if (nextPayload && nextPayload.version !== "strict-evidence-gap-v1" && !shouldSkipReplyRewrite(nextPayload) && shouldRewriteReply(nextPayload.reply)) {
    nextPayload.reply = await rewriteReplyInOwnWords(client, nextPayload.reply, message);
  }
  if (nextPayload && typeof nextPayload === "object") {
    const gatedPayload = applyAnswerQualityGate(nextPayload, message);
    if (gatedPayload?.qualityGate?.blocked) debug?.stages?.push?.({ name: "answer-quality-gate", matched: true, reason: gatedPayload.qualityGate.reason, originalVersion: gatedPayload.qualityGate.originalVersion });
    const domainGatedPayload = applyDomainAnswerContract(gatedPayload, message, getConversationHistory(req || {}));
    if (domainGatedPayload?.domainContract?.blocked) debug?.stages?.push?.({ name: "domain-answer-contract", matched: true, reason: domainGatedPayload.domainContract.reason, originalVersion: domainGatedPayload.domainContract.originalVersion });
    const contextGatedPayload = applyContextualAnswerContract(domainGatedPayload, message);
    if (contextGatedPayload?.contextualAnswerContract?.blocked) debug?.stages?.push?.({
      name: "contextual-answer-contract",
      matched: true,
      reason: contextGatedPayload.contextualAnswerContract.reason,
      originalVersion: contextGatedPayload.contextualAnswerContract.originalVersion,
      originalTitle: contextGatedPayload.contextualAnswerContract.originalTitle,
    });
    nextPayload = contextGatedPayload;
  }
  if (nextPayload && req) {
    nextPayload.conversationHistory = buildResponseHistory(req, message, nextPayload);
    if (typeof nextPayload.reply === "string" && String(message || "").trim()) {
      recordQaInteraction({
        sessionId: getSessionId(req),
        conversationId: req.body?.conversationId || req.body?.sessionId || getSessionId(req),
        question: message,
        answer: nextPayload.reply,
        metadata: {
          topic: nextPayload.topic,
          version: nextPayload.version,
          routeStrength: nextPayload.routeStrength,
          escalationReady: nextPayload.escalationReady,
          options: nextPayload.options,
          answerComposition: nextPayload.answerComposition || null,
        },
      }).catch((error) => {
        console.error("Q&A interaction logging failed:", error);
      });
    }
  }
  return withDebug(nextPayload, debug, debugEnabled);
}

export function wrapJsonForChat({ client, res, message, debug, debugEnabled, req = null }) {
  const originalJson = res.json.bind(res);
  res.json = async (payload) => originalJson(await prepareChatPayload({ client, payload, message, debug, debugEnabled, req }));
}
