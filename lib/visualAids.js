const SCREENSHOT_OFFER_CATALOG = [
  {
    id: "member-data-export-guide",
    match: {
      any: [
        "create a filtered member data export",
        "download csv members",
        "filter active members",
        "member email addresses for outlook",
      ],
      all: ["member", "email", "export"],
    },
  },
  {
    id: "member-email-delivery-users",
    match: {
      any: [
        "check why a member is not receiving brs emails",
        "unsuppress button",
        "suppressed by the brs/email delivery system",
      ],
      all: ["users", "member", "email"],
    },
  },
];

function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesAid(aid, text) {
  const lower = normalise(text);
  if (!lower) return false;
  const anyMatch = (aid.match?.any || []).some((term) => lower.includes(normalise(term)));
  const allMatch = (aid.match?.all || []).every((term) => lower.includes(normalise(term)));
  return anyMatch || allMatch;
}

function matchedScreenshotOffer(reply = "", message = "") {
  const haystack = `${reply}\n${message}`;
  return SCREENSHOT_OFFER_CATALOG.find((aid) => matchesAid(aid, haystack)) || null;
}

export function visualAidOptionForAnswer(reply = "", message = "") {
  if (!reply || !/\n\d+\.\s+/.test(String(reply))) return null;
  const offer = matchedScreenshotOffer(reply, message);
  if (!offer) return null;
  return {
    label: "Still can't find it?",
    value: "Verified screenshot request: show me where this is in the BRS demo system.",
    visualAidRequest: true,
    visualAidId: offer.id,
  };
}

export function visualAidIds(visualAids = []) {
  return (Array.isArray(visualAids) ? visualAids : [])
    .map((aid) => aid?.id)
    .filter(Boolean);
}

export const VISUAL_AID_COUNT = SCREENSHOT_OFFER_CATALOG.length;
