import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { keepReusableProductText, redactText } from "./knowledgeRedaction.js";

const BLOCKED_MUTATION_AREAS = [
  /system[_-]?conf|system configuration/i,
  /configure[_-]?timesheet|configure timesheet/i,
  /green[_-]?fee|green fee/i,
  /reservation[_-]?types?|booking[_-]?statuses?/i,
  /payment[_-]?methods?/i,
  /member[_-]?rules?/i,
  /users?|permissions?/i,
  /settings?|setup|tools/i,
];

function compact(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalise(value = "") {
  return compact(value).toLowerCase();
}

function unique(values = [], limit = 80) {
  const seen = new Set();
  const output = [];
  for (const raw of values.map(compact).filter(Boolean)) {
    const value = keepReusableProductText(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function isBlockedMutationUrl(url = "") {
  return BLOCKED_MUTATION_AREAS.some((pattern) => pattern.test(url));
}

function getConfig() {
  return {
    baseUrl: process.env.BRS_BASE_URL || "https://brsgolf.com",
    clubId: process.env.BRS_DEMO_CLUB_ID || process.env.BRS_CLUB_ID,
    username: process.env.BRS_DEMO_USERNAME || process.env.BRS_USERNAME,
    password: process.env.BRS_DEMO_PASSWORD || process.env.BRS_PASSWORD,
    outputDir: process.env.BRS_DEMO_WORKFLOW_OUTPUT_DIR || path.join(process.cwd(), "knowledge", "workflows", "demo"),
    explorationEnabled: process.env.BRS_DEMO_WORKFLOW_EXPLORATION_ENABLED === "true",
    allowBookingCreation: process.env.BRS_DEMO_ALLOW_BOOKING_CREATION === "true",
    bookingCreationMode: process.env.BRS_DEMO_BOOKING_CREATION_MODE === "commit" ? "commit" : "draft",
  };
}

function assertDemoExplorationConfig(config) {
  if (!config.explorationEnabled) throw new Error("Set BRS_DEMO_WORKFLOW_EXPLORATION_ENABLED=true before demo workflow exploration.");
  if (!config.allowBookingCreation) throw new Error("Set BRS_DEMO_ALLOW_BOOKING_CREATION=true before creating test bookings.");
  if (!config.clubId || !config.username || !config.password) throw new Error("Set BRS_DEMO_CLUB_ID, BRS_DEMO_USERNAME, and BRS_DEMO_PASSWORD before demo workflow exploration.");
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is required for demo workflow exploration.");
  }
}

async function fillFirstVisible(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      try {
        await locator.fill(value, { timeout: 1500 });
        return true;
      } catch {}
    }
  }
  return false;
}

async function login(page, config) {
  await page.goto(`${config.baseUrl}/${config.clubId}/login`, { waitUntil: "domcontentloaded" });
  const filledUser = await fillFirstVisible(page, ["input[name='username']", "input[name='login']", "input[type='text']", "input[type='email']"], config.username);
  const filledPassword = await fillFirstVisible(page, ["input[name='password']", "input[type='password']"], config.password);
  if (!filledUser || !filledPassword) throw new Error("Could not find BRS demo login fields.");
  await page.locator("button[type='submit'], input[type='submit']").first().click();
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForURL((url) => !/\/login\/?$/i.test(url.pathname), { timeout: 8000 }).catch(() => {});
}

async function collectEvidence(page) {
  const evidence = await page.evaluate(() => {
    const textOf = (node) => (node?.innerText || node?.textContent || node?.value || "").replace(/\s+/g, " ").trim();
    const controls = Array.from(document.querySelectorAll("button, a, input, select, textarea, [role='button']"))
      .map((node) => ({
        label: textOf(node) || node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("placeholder") || node.getAttribute("name") || node.getAttribute("href") || "",
        tagName: node.tagName,
        type: node.getAttribute("type") || node.tagName,
        href: node.getAttribute("href") || "",
        options: node.tagName === "SELECT" ? Array.from(node.querySelectorAll("option")).map(textOf).filter(Boolean).slice(0, 80) : [],
      }))
      .filter((item) => item.label);
    return {
      title: document.title || "",
      url: location.href,
      headings: Array.from(document.querySelectorAll("h1,h2,h3,.page-title,.title")).map(textOf).filter(Boolean).slice(0, 30),
      tableHeaders: Array.from(document.querySelectorAll("table th,[role='columnheader']")).map(textOf).filter(Boolean).slice(0, 80),
      controls,
    };
  });

  return {
    title: redactText(evidence.title),
    url: evidence.url,
    headings: unique(evidence.headings, 30),
    tableHeaders: unique(evidence.tableHeaders, 80),
    controls: evidence.controls.map((control) => ({
      ...control,
      label: redactText(keepReusableProductText(control.label)),
      options: unique(control.options || [], 80),
    })).filter((control) => control.label).slice(0, 120),
  };
}

async function gotoTimesheet(page, config) {
  const candidates = [
    `${config.baseUrl}/${config.clubId}/timesheet`,
    `${config.baseUrl}/${config.clubId}/tee_sheet.php`,
    `${config.baseUrl}/${config.clubId}/timesheet.php`,
  ];
  for (const url of candidates) {
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => null);
    if (!/login/i.test(page.url())) return;
  }
}

async function exploreBookingSurfaces(page, config) {
  await gotoTimesheet(page, config);
  const timesheetEvidence = await collectEvidence(page);
  const openedBooking = await openBookingCandidate(page);
  if (openedBooking) await fillTestBookingDraft(page);
  const bookingEvidence = openedBooking ? await collectEvidence(page) : null;
  const committedBooking = openedBooking && config.bookingCreationMode === "commit"
    ? await commitDemoBookingIfSafe(page)
    : false;
  const routes = [];

  routes.push({
    name: "Admin timesheet booking route",
    actor: "Admin or staff user",
    preconditions: ["User is signed into the demo BRS admin area.", "A tee time row is available on the Timesheet day view."],
    steps: [
      "Open the Timesheet day view.",
      "Open a tee time row or existing booking from the Timesheet.",
      openedBooking ? `Open the booking surface using ${openedBooking}.` : "Open a tee time row or booking control from the Timesheet.",
      "Use the visible booking controls and service/buggy controls shown on the booking page.",
      committedBooking ? "Submit the demo booking in the dedicated demo club." : "Keep the demo booking as a draft unless commit mode is explicitly enabled.",
    ],
    outcome: committedBooking ? "A test booking was created in the dedicated demo club." : "Booking-linked evidence is collected without submitting a booking.",
    verification: ["Return to the Timesheet day view and check the booking row evidence."],
  });

  routes.push({
    name: "Online member or visitor request route",
    actor: "Member or visitor, where club setup allows online buggy booking",
    preconditions: ["Club configuration permits the member or visitor channel to request buggies online."],
    steps: [
      "Member or visitor requests the buggy during the online booking journey.",
      "Admin verifies the request on the Timesheet booking row or booking details.",
      "Admin adds or confirms any service/charge required for the buggy from the booking details/service area.",
    ],
    outcome: "The online request appears operationally on the admin timesheet, but charging/service completion remains an admin-controlled check.",
    verification: ["Check Timesheet booking details and service/charge controls before confirming the customer has been charged."],
  });

  return {
    routes,
    evidencePages: [timesheetEvidence, bookingEvidence].filter(Boolean),
  };
}

async function openBookingCandidate(page) {
  const candidates = await page.locator("a, button, [role='button']").evaluateAll((nodes) => nodes.map((node, index) => ({
    index,
    label: (node.innerText || node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("href") || "").replace(/\s+/g, " ").trim(),
    href: node.getAttribute("href") || "",
  }))).catch(() => []);

  const candidate = candidates.find((item) => {
    const text = `${item.label} ${item.href}`;
    return /available|book|booking|tee time|add/i.test(text) && !/delete|cancel|remove|refund|payment|setup|configuration/i.test(text);
  });
  if (!candidate) return null;

  await page.locator("a, button, [role='button']").nth(candidate.index).click({ timeout: 5000 }).catch(() => null);
  await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => null);
  return keepReusableProductText(candidate.label || candidate.href) || "a booking control";
}

async function fillTestBookingDraft(page) {
  const testName = "BRS Demo Workflow Test";
  const filled = new Set();
  const controls = [
    ["input[name*='player' i], input[id*='player' i], input[name*='name' i], input[id*='name' i]", testName],
    ["input[name*='buggy' i], input[id*='buggy' i]", "1"],
    ["input[name*='email' i], input[id*='email' i], input[type='email']", "demo-workflow@example.invalid"],
  ];

  for (const [selector, value] of controls) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      try {
        await locator.fill(value, { timeout: 1000 });
        filled.add(selector);
      } catch {}
    }
  }

  const buggyToggle = page.locator("input[type='checkbox'][name*='buggy' i], input[type='checkbox'][id*='buggy' i]").first();
  if (await buggyToggle.count().catch(() => 0)) {
    try {
      if (!await buggyToggle.isChecked()) await buggyToggle.check({ timeout: 1000 });
    } catch {}
  }

  return filled.size > 0;
}

async function commitDemoBookingIfSafe(page) {
  if (isBlockedMutationUrl(page.url())) return false;
  const submit = page.locator("button, input[type='submit'], input[type='button'], a[role='button']").filter({
    hasText: /^(book|save|confirm|create|update|submit)$/i,
  }).first();
  if (!await submit.count().catch(() => 0)) return false;
  await submit.click({ timeout: 5000 }).catch(() => null);
  await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => null);
  return true;
}

function buildWorkflowEntry({ question = "Explore demo booking workflows", routes = [], evidencePages = [] } = {}) {
  const sourceId = crypto.createHash("sha256").update(`${normalise(question)}:${routes.map((route) => route.name).join("|")}`).digest("hex").slice(0, 16);
  const page = evidencePages[0] || {};
  return {
    id: `brs-demo-workflow:${sourceId}`,
    sourceType: "brs-system-workflow",
    title: "Demo explored workflow routes",
    area: "BRS demo workflow exploration",
    workflow: question,
    summary: "Workflow routes collected from a controlled demo exploration. Review before approving for chatbot use.",
    navigationPath: page.headings?.join(" > ") || null,
    routes,
    controls: (page.controls || []).map((control) => ({ label: control.label, type: control.type, options: control.options || [] })),
    tableHeaders: page.tableHeaders || [],
    pageEvidence: { headings: page.headings || [] },
    containsClubSpecificData: false,
    confidence: "needs-review",
    safeForChatbot: false,
    tags: ["demo-exploration", "multi-route-workflow", "requires-human-review"],
    sourceId,
    learnedAt: new Date().toISOString(),
  };
}

export async function exploreDemoWorkflows({ question = "Explore demo booking workflows" } = {}) {
  const config = getConfig();
  assertDemoExplorationConfig(config);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: process.env.BRS_AUTOMATION_HEADLESS !== "false" });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = request.url();
    if (method !== "GET" && isBlockedMutationUrl(url)) return route.abort();
    return route.continue();
  });

  try {
    await login(page, config);
    const result = await exploreBookingSurfaces(page, config);
    const entry = buildWorkflowEntry({ question, ...result });
    await fs.mkdir(config.outputDir, { recursive: true });
    const outputPath = path.join(config.outputDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${entry.sourceId}.json`);
    await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), sourceType: "brs-system-workflow", entries: [entry] }, null, 2));
    return { outputPath, entry };
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}
