function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isMoveBookingQuestion(message = "") {
  const lower = normalise(message);
  const asksMove = /\b(move|transfer|reschedule|re-schedule|cut|paste)\b/.test(lower);
  const bookingObject = /\bbooking|tee time|teetime|tee sheet|teesheet|timesheet|buggy|buggies|service|hire item|trolley|caddie|caddy|club hire\b/.test(lower);
  return asksMove && bookingObject;
}

export function hasForbiddenMoveBookingAdvice(reply = "") {
  const lower = normalise(reply);
  return /\bdrag|drop|dragging|right-click|right click|move button|reschedule button|change time button\b/.test(lower);
}

export function approvedMoveBookingReply() {
  return `Move a booking

1. Click the tee time to open the Booking Details page.
2. Click Cut from inside the Booking Details page.
3. Return to the tee sheet.
4. Go to the new date if the booking is moving to a different day.
5. Tick the checkbox beside the tee time you want to move the booking to.
6. Click Paste.
7. Check the booking and payment status after moving it.

Important:
Use Cut from inside Booking Details. If the booking has payment information attached, this is the route that keeps the payment information with the booking.

Related guides:
- [Buggy Management](https://help.brsgolf.com/hc/en-us/articles/360001478214-Buggy-Management)`;
}
