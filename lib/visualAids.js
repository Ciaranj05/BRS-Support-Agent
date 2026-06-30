const VISUAL_AID_CATALOG = [
  {
    id: "member-data-export-guide",
    title: "Members list filters and CSV export",
    source: "visual-guide",
    url: "/visual-guides/member-data-export.svg",
    alt: "Annotated BRS guide showing Memberships, Members, Filter Active Members, Membership Type, Filter Columns, and Download CSV Members.",
    match: {
      any: [
        "create a filtered member data export",
        "download csv members",
        "filter active members",
        "member email addresses for outlook",
      ],
      all: ["member", "email"],
    },
    annotations: [
      { step: 1, label: "Memberships" },
      { step: 2, label: "Members" },
      { step: 3, label: "Membership Type" },
      { step: 4, label: "Filter Columns" },
      { step: 5, label: "Download CSV Members" },
    ],
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

function publicVisualAid(aid) {
  return {
    id: aid.id,
    title: aid.title,
    source: aid.source,
    url: aid.url,
    alt: aid.alt,
    annotations: aid.annotations || [],
  };
}

export function visualAidsForAnswer(reply = "", message = "", { limit = 2 } = {}) {
  const haystack = `${reply}\n${message}`;
  return VISUAL_AID_CATALOG
    .filter((aid) => matchesAid(aid, haystack))
    .slice(0, limit)
    .map(publicVisualAid);
}

export function visualAidIds(visualAids = []) {
  return (Array.isArray(visualAids) ? visualAids : [])
    .map((aid) => aid?.id)
    .filter(Boolean);
}

export const VISUAL_AID_COUNT = VISUAL_AID_CATALOG.length;
