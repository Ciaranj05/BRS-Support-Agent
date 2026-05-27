import OpenAI from "openai";
import handler from "../server.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

function isMoveBookingRequest(text = "") {
  const lower = text.toLowerCase();
  const hasBooking = lower.includes("booking") || lower.includes("tee time") || lower.includes("tee-time") || lower.includes("teetime");
  const hasMoveIntent = lower.includes("move") || lower.includes("moving") || lower.includes("transfer") || lower.includes("reschedule") || lower.includes("change time") || lower.includes("different time") || lower.includes("different day");
  return hasBooking && hasMoveIntent;
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

  return handler(req, res);
}
