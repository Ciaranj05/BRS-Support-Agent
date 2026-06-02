import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import handler from "../server.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const brsSupportContactFallbackReply = `Call us on UK 028 9568 0288 or IE 0353 1800 852 935.
Email the team on support.en@golfnowbusiness.com and we’ll get back to you as soon as possible.`;

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

function isBrsSupportContactRequest(text = "") {
  const lower = text.toLowerCase();
  const mentionsBrs = hasAny(lower, ["brs", "brs golf", "golfnow business", "golfnow"]);
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
  const contactIntentTerms = [
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
  ];
  const hasSupportIdentity = hasAny(lower, supportIdentityTerms) || (mentionsBrs && hasAny(lower, ["support", "technical support", "helpdesk", "help desk"]));
  const hasContactIntent = hasAny(lower, contactIntentTerms);
  return hasSupportIdentity && hasContactIntent;
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

  if (req.method === "POST" && isBrsSupportContactRequest(message)) {
    return res.status(200).json({
      reply: getBrsSupportContactReply(),
      escalationReady: false,
      topic: "admin-setup",
      options: [],
      version: "approved-brs-support-contact-details-v1",
    });
  }

  if (req.method === "POST" && isMoveBookingRequest(message)) {
    const reply = await createSafeMoveBookingReply(message);
    return res.status(200).json({
      reply,
      escalationReady: false,
      topic: "teesheet",
      options: [],
      version: "approved-move-booking-safe-rewrite-v1",
    });
  }

  if (req.method === "POST" && isUnavailableTeeTimesRequest(message)) {
    return res.status(200).json({
      reply: unavailableTeeTimesReply,
      escalationReady: false,
      topic: "teesheet",
      options: [],
      version: "approved-unavailable-tee-times-v1",
    });
  }

  return handler(req, res);
}
