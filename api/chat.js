import handler from "../server.js";

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

function isMoveBookingRequest(text = "") {
  const lower = text.toLowerCase();
  const hasBooking = lower.includes("booking") || lower.includes("tee time") || lower.includes("tee-time") || lower.includes("teetime");
  const hasMoveIntent = lower.includes("move") || lower.includes("moving") || lower.includes("transfer") || lower.includes("reschedule") || lower.includes("change time") || lower.includes("different time") || lower.includes("different day");
  return hasBooking && hasMoveIntent;
}

export default function chatHandler(req, res) {
  const message = req.body?.message?.toString() || "";

  if (req.method === "POST" && isMoveBookingRequest(message)) {
    return res.status(200).json({
      reply: moveBookingReply,
      escalationReady: false,
      topic: "teesheet",
      options: [],
      version: "approved-move-booking-direct-answer-v1",
    });
  }

  return handler(req, res);
}
