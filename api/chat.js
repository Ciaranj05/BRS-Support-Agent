import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import handler from "../server.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const brsSupportContactFallbackReply = `Call us on UK 028 9568 0288 or IE 0353 1800 852 935.
Opening hours are Monday to Friday, 8am through to 5:30pm.
Email the team on support.en@golfnowbusiness.com and we’ll get back to you as soon as possible.

For Golf Now based questions, please contact Golf Now Customer Support.`;
const golfNowSupportReply = "For Golf Now based questions, please contact Golf Now Customer Support.";

function loadFile(filePath) {
  const fullPath = path.join(__dirname, "..", filePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getApprovedAdminSetupAnswer(answerId) {
  const knowledge = loadFile("data/knowledge/admin-setup.txt");
  const answerRegex = new RegExp(`## APPROVED ANSWER:\\s*${escapeRegExp(answerId)}\\s*\\r?\\n([\\s\\S]*?)\\r?\\n## END APPROVED ANSWER`, "i");
  return knowledge.match(answerRegex)?.[1]?.trim() || null;
}

function getBrsSupportContactReply() {
  return getApprovedAdminSetupAnswer("brs-support-contact-details") || brsSupportContactFallbackReply;
}

function parseDirectAnswerRoutes(decisionTree) {
  const routes = [];
  const routeRegex = /^ROUTE:[ \t]*(.+?)[ \t]*$([\s\S]*?)(?=^ROUTE:\s*|^---\s*$|(?![\s\S]))/gim;
  let match;
  while ((match = routeRegex.exec(decisionTree)) !== null) {
    const [, id, body] = match;
    const answerId = body.match(/^ANSWER ID:\s*(.+?)\s*$/im)?.[1]?.trim();
    const matchAnyGroups = [...body.matchAll(/^MATCH ANY:\s*(.+?)\s*$/gim)].map((line) => line[1].split(",").map((term) => term.trim().toLowerCase()).filter(Boolean));
    if (answerId && matchAnyGroups.length) routes.push({ id: id.trim(), answerId, matchAnyGroups });
  }
  return routes;
}

function routeMatchesMessage(route, message) {
  const lower = message.toLowerCase();
  return route.matchAnyGroups.every((group) => group.some((term) => lower.includes(term)));
}

function getApprovedAnswer(topic, answerId) {
  const knowledge = loadFile(`data/knowledge/${topic}.txt`);
  const answerRegex = new RegExp(`## APPROVED ANSWER:\\s*${escapeRegExp(answerId)}\\s*\\r?\\n([\\s\\S]*?)\\r?\\n## END APPROVED ANSWER`, "i");
  return knowledge.match(answerRegex)?.[1]?.trim() || null;
}

function detectTopic(message) {
  const lower = message.toLowerCase();
  if (lower.includes("competition") || lower.includes("draw") || lower.includes("entry sheet")) return "teesheet";
  if (lower.includes("payment scheme") || lower.includes("payment plan") || lower.includes("instalment") || lower.includes("installment") || lower.includes("scheduled payment")) return "memberships";
  if (lower.includes("payment") || lower.includes("paid") || lower.includes("refund") || lower.includes("transaction") || lower.includes("payout") || lower.includes("vat") || lower.includes("bank statement")) return "payments";
  if (lower.includes("member") || lower.includes("membership") || lower.includes("subscription") || lower.includes("bill") || lower.includes("wallet")) return "memberships";
  if (lower.includes("admin user") || lower.includes("staff") || lower.includes("login") || lower.includes("permission")) return "user-management";
  if (lower.includes("buggy") || lower.includes("buggies")) return "admin-setup";
  if (lower.includes("booking") || lower.includes("tee") || lower.includes("timesheet") || lower.includes("player") || lower.includes("green fee") || lower.includes("society") || lower.includes("move")) return "teesheet";
  if (lower.includes("configure") || lower.includes("setup") || lower.includes("email template") || lower.includes("green fee rate")) return "admin-setup";
  return "general";
}

function getDirectAnswerForMessage(message) {
  const topic = detectTopic(message);
  if (topic === "general") return null;
  const decisionTree = loadFile(`data/decision-trees/${topic}-decision-tree.txt`);
  const route = parseDirectAnswerRoutes(decisionTree).find((candidate) => routeMatchesMessage(candidate, message));
  const reply = route ? getApprovedAnswer(topic, route.answerId) : null;
  return reply ? { reply, topic, routeId: route.id } : null;
}

const moveBookingReply = `To move a booking and keep payment information attached:

1. Click the tee time to open the Booking Details page.
2. Click Cut from inside the Booking Details page.
3. Return to the tee sheet.
4. Go to the new date if the booking is being moved to a different day.
5. Tick the checkbox beside the tee time you want to move the booking to.
6. Click Paste.
7. Check the payment status after moving the booking.

Important:
- Using Cut from inside the booking keeps the payment information attached.
- If the checkbox on the tee sheet is selected first and the booking is cut from there, the payment information will not transfer.`;

const unavailableTeeTimesReply = `If there are no tee times available for a future year, first check whether that year is enabled, then configure the timesheet for the required dates.

Check the year is available:
1. Go to Tools >> System Configuration.
2. Under Display Configuration, check Calendar end year.
3. Change Calendar end year to the year you need, for example 2027.
4. Click Update at the top of the page.

Then configure the tee times:
1. Go to Tools >> Configure Timesheet.
2. Select the relevant year and date range.
3. Choose the tee time interval and tee time range.
4. Select the days of the week this should apply to.
5. Click Configure the Timesheet.

Sources:
[Configure timesheet - Year not available](https://help.brsgolf.com/hc/en-us/articles/360001525034-Configure-timesheet-Year-not-available)
[Configure the timesheet](https://help.brsgolf.com/hc/en-us/articles/360001478994-Configure-the-timesheet)`;

const forbiddenMoveBookingTerms = [
  "drag",
  "drop",
  "right-click",
  "right click",
  "move option",
  "reschedule option",
  "change time",
  "edit the booking",
  "court",
  "member or visitor",
  "single booking",
  "group booking",
];

function hasAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function hasContactIntent(lower) {
  return hasAny(lower, [
    "contact",
    "contact details",
    "contact information",
    "phone",
    "phone number",
    "telephone",
    "number",
    "email",
    "email address",
    "call",
    "ring",
    "speak to",
    "talk to",
    "reach",
    "get in touch",
    "message",
    "opening hours",
    "hours",
    "open",
    "available",
    "availability",
    "details",
    "info",
    "infor",
  ]);
}

function isGolfNowSupportContactRequest(text = "") {
  const lower = text.toLowerCase();
  const mentionsGolfNow = hasAny(lower, ["golf now", "golfnow", "golfnow business"]);
  const mentionsBrs = hasAny(lower, ["brs", "brs golf"]);
  return mentionsGolfNow && !mentionsBrs && hasContactIntent(lower);
}

function isBrsSupportContactRequest(text = "") {
  const lower = text.toLowerCase();
  const mentionsBrs = hasAny(lower, ["brs", "brs golf"]);
  const supportIdentityTerms = [
    "brs support",
    "brs customer support",
    "brs technical support",
    "brs technical support team",
    "brs helpdesk",
    "brs help desk",
    "support team",
    "customer support",
    "technical support",
    "technical support team",
    "helpdesk",
    "help desk",
    "support agent",
    "support department",
  ];
  const brsContactTerms = [
    "contact",
    "contact details",
    "contact information",
    "phone",
    "phone number",
    "telephone",
    "email",
    "email address",
    "call",
    "opening hours",
    "hours",
    "available",
    "availability",
  ];
  const hasSupportIdentity = hasAny(lower, supportIdentityTerms) || (mentionsBrs && hasAny(lower, ["support", "technical support", "helpdesk", "help desk"])) || (mentionsBrs && hasAny(lower, brsContactTerms));
  return hasSupportIdentity && hasContactIntent(lower);
}

function isMoveBookingRequest(text = "") {
  const lower = text.toLowerCase();
  const hasBooking = lower.includes("booking") || lower.includes("tee time") || lower.includes("tee-time") || lower.includes("teetime");
  const hasMoveIntent = lower.includes("move") || lower.includes("moving") || lower.includes("transfer") || lower.includes("reschedule") || lower.includes("change time") || lower.includes("different time") || lower.includes("different day");
  return hasBooking && hasMoveIntent;
}

function isUnavailableTeeTimesRequest(text = "") {
  const lower = text.toLowerCase();
  const hasTeeTimes = lower.includes("tee time") || lower.includes("tee times") || lower.includes("teetime") || lower.includes("timesheet") || lower.includes("tee sheet");
  const hasUnavailableIntent = lower.includes("not available") || lower.includes("no tee") || lower.includes("no times") || lower.includes("aren't any") || lower.includes("are not any") || lower.includes("can't see") || lower.includes("cannot see") || lower.includes("missing");
  const hasYear = /20\d{2}/.test(lower);
  return hasTeeTimes && hasUnavailableIntent && hasYear;
}

function containsForbiddenMoveBookingTerm(text = "") {
  const lower = text.toLowerCase();
  return forbiddenMoveBookingTerms.some((term) => lower.includes(term));
}

async function createSafeMoveBookingReply(userMessage) {
  try {
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: `You rewrite BRS Golf support guidance for clarity and a natural tone.

Use ONLY the approved source text below. Do not add new workflow steps, questions, options, product names, or assumptions. Do not mention member vs visitor, single vs group bookings, courts, dragging, dropping, right-clicking, editing, Move, Reschedule, or Change Time.

Keep the answer concise. Preserve every numbered action and the payment warning.

APPROVED SOURCE:
${moveBookingReply}`,
        },
        { role: "user", content: userMessage },
      ],
    });

    const reply = response.output_text?.trim();
    if (!reply || containsForbiddenMoveBookingTerm(reply)) return moveBookingReply;
    return reply;
  } catch (error) {
    console.error("Move booking rewrite failed:", error);
    return moveBookingReply;
  }
}

export default async function chatHandler(req, res) {
  const message = req.body?.message?.toString() || "";
  const contextHint = req.body?.contextHint?.toString() || "";
  const routedMessage = contextHint ? `${contextHint}\n\nUser follow-up: ${message}` : message;

  if (req.method === "POST" && isGolfNowSupportContactRequest(routedMessage)) {
    return res.status(200).json({
      reply: golfNowSupportReply,
      escalationReady: false,
      topic: "admin-setup",
      options: [],
      version: "approved-golf-now-support-contact-v1",
    });
  }

  if (req.method === "POST" && isBrsSupportContactRequest(routedMessage)) {
    return res.status(200).json({
      reply: getBrsSupportContactReply(),
      escalationReady: false,
      topic: "admin-setup",
      options: [],
      version: "approved-brs-support-contact-details-v2",
    });
  }

  const directAnswer = getDirectAnswerForMessage(routedMessage);
  if (req.method === "POST" && directAnswer && !contextHint) {
    return res.status(200).json({
      reply: directAnswer.reply,
      escalationReady: false,
      topic: directAnswer.topic,
      options: [],
      version: `approved-direct-route-${directAnswer.routeId}-v1`,
    });
  }

  if (req.method === "POST" && isMoveBookingRequest(routedMessage)) {
    const reply = await createSafeMoveBookingReply(routedMessage);
    return res.status(200).json({
      reply,
      escalationReady: false,
      topic: "teesheet",
      options: [],
      version: "approved-move-booking-safe-rewrite-v1",
    });
  }

  if (req.method === "POST" && isUnavailableTeeTimesRequest(routedMessage)) {
    return res.status(200).json({
      reply: unavailableTeeTimesReply,
      escalationReady: false,
      topic: "teesheet",
      options: [],
      version: "approved-unavailable-tee-times-v1",
    });
  }

  if (contextHint) req.body.message = routedMessage;
  return handler(req, res);
}
