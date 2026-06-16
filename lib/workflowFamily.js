import crypto from "crypto";

function compact(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalise(value = "") {
  return compact(value).toLowerCase();
}

function unique(values = [], limit = 40) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function inferFamilyName(question = "", intent = {}) {
  const lower = normalise(question);
  if (/\b(move|transfer|reschedule|cut|paste)\b/.test(lower) && /\bbooking|tee|timesheet|buggy|service\b/.test(lower)) return "Move a tee sheet booking";
  if (/\b(add|create|make|new|book)\b/.test(lower) && /\bbooking|tee time|timesheet\b/.test(lower)) return "Create a tee sheet booking";
  if (/\b(refund|reverse)\b/.test(lower) && /\bbooking|tee time|payment|transaction\b/.test(lower)) return "Refund a booking payment";
  if (/\b(refund|reverse)\b/.test(lower) && /\bmember|membership|bill|invoice|subscription\b/.test(lower)) return "Refund a membership bill payment";
  if (/\b(show|find|list|report|export|download)\b/.test(lower) && /\bmember|membership|bill|balance|outstanding|unpaid\b/.test(lower)) return "Find membership billing balances";
  if (/\b(configure|set up|setup|change|edit)\b/.test(lower) && /\btimesheet|tee sheet|tee time interval\b/.test(lower)) return "Configure the timesheet";
  if (intent.object && intent.object !== "unknown") return compact(intent.object).replace(/^\w/, (letter) => letter.toUpperCase());
  return "BRS workflow";
}

function inferAliases(question = "", familyName = "") {
  const lower = normalise(question);
  const aliases = [question, familyName];
  if (familyName === "Move a tee sheet booking") aliases.push("move a booking", "reschedule a booking", "transfer a booking", "move a paid booking", "move a booking with services");
  if (familyName === "Create a tee sheet booking") aliases.push("add a booking", "create a booking", "book a tee time", "add a service to a booking");
  if (/\bbuggy|buggies|service|caddie|caddy|trolley|club hire\b/.test(lower)) aliases.push("booking with service attached", "booking with hire item attached");
  return unique(aliases, 20);
}

function inferVariants(question = "", familyName = "") {
  const lower = normalise(question);
  const variants = [];
  if (/\bbuggy|buggies|service|caddie|caddy|trolley|club hire\b/.test(lower)) {
    variants.push({
      name: "Booking with attached service or hire item",
      appliesWhen: "The user's wording includes a service or hire item attached to a tee sheet booking.",
      sameAsWorkflow: familyName,
      answerImpact: "Use the core booking workflow unless observed evidence proves the service changes the route.",
    });
  }
  if (/\bmember\b/.test(lower)) variants.push({ name: "Member booking", appliesWhen: "The booking is for a member.", answerImpact: "Mention only member-specific checks that are proven by evidence." });
  if (/\bvisitor|guest\b/.test(lower)) variants.push({ name: "Visitor booking", appliesWhen: "The booking is for a visitor or guest.", answerImpact: "Mention only visitor-specific checks that are proven by evidence." });
  if (/\bpaid|payment|transaction|refund\b/.test(lower)) variants.push({ name: "Payment-attached workflow", appliesWhen: "The request depends on a BRS payment record.", answerImpact: "Preserve payment-routing warnings and check transaction status before changing money-related records." });
  return variants;
}

export function buildWorkflowFamilyEntry({ question = "", answer = "", intent = {}, routes = [], evidencePages = [], source = "resolved-conversation", explorationStatus = "learned-from-resolution" } = {}) {
  const workflowFamily = inferFamilyName(question, intent);
  const sourceId = crypto.createHash("sha256").update(`${normalise(workflowFamily)}:${normalise(question)}`).digest("hex").slice(0, 16);
  const page = evidencePages.at(-1) || {};
  return {
    id: `brs-workflow-family:${sourceId}`,
    sourceType: "brs-workflow-family",
    title: `Workflow family: ${workflowFamily}`,
    area: intent.topic || null,
    workflow: workflowFamily,
    workflowFamily,
    aliases: inferAliases(question, workflowFamily),
    variants: inferVariants(question, workflowFamily),
    summary: "Reusable BRS workflow-family knowledge. Treat user wording as a possible alias or variant, and answer from all proven routes and preconditions.",
    userNeed: normalise(question),
    answerPattern: compact(answer).slice(0, 1800),
    routes,
    controls: page.controls || [],
    tableHeaders: page.tableHeaders || [],
    pageEvidence: {
      headings: page.headings || [],
      captions: page.captions || [],
    },
    writeActions: [],
    rollbackPolicy: "Automatic exploration may only approve write-tested evidence when the test action is reverted and the rollback is verified.",
    explorationStatus,
    confidence: "approved",
    safeForChatbot: true,
    containsClubSpecificData: false,
    tags: unique(["workflow-family", "multi-route-ready", source, intent.topic, intent.task, intent.object].filter(Boolean), 20),
    sourceId,
    learnedAt: new Date().toISOString(),
  };
}
