import { appendRelatedGuides, relatedGuidesForQuestion } from "./relatedGuides.js";

function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isMoveBookingQuestion(message = "") {
  const lower = normalise(message);
  if (/\b(interval|intervals|configure|configuration|setup|set up|first tee time|last tee time)\b/.test(lower)) return false;
  const asksMove = /\b(move|transfer|reschedule|re-schedule|cut|paste|shift|change time|another time)\b/.test(lower);
  const bookingObject = /\bbooking|tee time|teetime|tee sheet|teesheet|timesheet|buggy|buggies|service|hire item|trolley|caddie|caddy|club hire|player|golfer\b/.test(lower);
  return asksMove && bookingObject;
}

export function hasForbiddenMoveBookingAdvice(reply = "") {
  const lower = normalise(reply);
  return /\bdrag|drop|dragging|right-click|right click|move button|reschedule button|change time button\b/.test(lower);
}

export function approvedMoveBookingReply(message = "") {
  return appendRelatedGuides(`Move a booking

I cannot move a live BRS booking for you. Staff need to make the change directly in BRS using this workflow:

1. Open the Timesheet from the main navigation menu for the booking date and course.
2. In the tee-time grid, click the booked tee time or booking name to open the Booking Details page.
3. Click Cut from inside the Booking Details page.
4. Return to the Timesheet.
5. Go to the new date if the booking is moving to a different day.
6. In the tee-time grid, tick the checkbox beside the target tee time you want to move the booking to.
7. Click Paste in the Timesheet action toolbar above the tee-time grid.
8. Check the booking and payment status after moving it.

Important:
Use Cut from inside Booking Details. If the booking has payment information attached, this is the route that keeps the payment information with the booking.`, relatedGuidesForQuestion(message || "move booking"));
}
