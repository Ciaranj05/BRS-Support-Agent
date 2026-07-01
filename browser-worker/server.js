import "dotenv/config";
import cors from "cors";
import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const LIVE_LOOKUP_TIMEOUT_MS = Number(process.env.BRS_LIVE_LOOKUP_TIMEOUT_MS || 45000);
const STAGE_TIMEOUT_MS = Math.min(Number(process.env.BRS_LIVE_LOOKUP_STAGE_TIMEOUT_MS || 12000), LIVE_LOOKUP_TIMEOUT_MS);
const CLUB_ID = process.env.BRS_CLUB_ID || process.env.BRS_DEMO_CLUB_ID || process.env.BRS_LOCAL_CLUB_ID || "";
const BASE_URL = resolveBrsBaseUrl(process.env.BRS_BASE_URL, CLUB_ID);
const USERNAME = process.env.BRS_USERNAME;
const PASSWORD = process.env.BRS_PASSWORD;
const WORKER_SECRET = process.env.BRS_LIVE_WORKER_SECRET || process.env.BRS_LIVE_LOOKUP_WORKER_SECRET;

const BLOCKED_ACTION_PATTERN = /\b(save|submit|create|delete|remove|cancel|refund|charge|send|update|confirm|apply|allocate|debit|credit|email|text|sms)\b/i;
const SAFE_NAVIGATION_TERMS = [
  "dashboard",
  "reports",
  "membership",
  "memberships",
  "members",
  "billing",
  "bill",
  "bills",
  "payments",
  "transactions",
  "tee sheet",
  "teesheet",
  "competition",
  "configuration",
  "settings",
  "users",
  "admin",
  "contacts",
  "contact",
  "messages",
  "tools",
  "categories",
  "rates",
  "restrictions",
];

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function compact(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resolveBrsBaseUrl(configuredBaseUrl = "", clubId = "") {
  const configured = compact(configuredBaseUrl).replace(/\/+$/, "");
  const cleanedClubId = compact(clubId).replace(/^\/+|\/+$/g, "");
  if (configured) {
    if (!cleanedClubId) return configured;
    try {
      const parsed = new URL(configured);
      const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
      if (path === `/${cleanedClubId.toLowerCase()}` || path.startsWith(`/${cleanedClubId.toLowerCase()}/`)) return configured;
      if (!path) {
        const host = parsed.hostname === "brsgolf.com" ? "www.brsgolf.com" : parsed.host;
        return `${parsed.protocol}//${host}/${cleanedClubId}`;
      }
    } catch {
      return configured;
    }
    return configured;
  }
  return cleanedClubId ? `https://www.brsgolf.com/${cleanedClubId}` : "";
}

function normalise(value = "") {
  return compact(value).toLowerCase();
}

function unique(values = [], limit = 80) {
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

function redactSensitive(value = "") {
  return compact(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\+?\d[\d\s().-]{7,}\b/g, "[phone]")
    .replace(/£\s?\d+(?:\.\d{2})?/g, "[amount]")
    .replace(/€\s?\d+(?:\.\d{2})?/g, "[amount]")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, "[date]");
}

function inferSearchPlan(question = "", knowledgeHints = []) {
  const text = normalise(`${question} ${knowledgeHints.join(" ")}`);
  const plan = [];
  if (/unsuppress|suppressed|not receiving.*email|email.*not receiving|accepting emails?/.test(text) && /member|user|users/.test(text)) {
    plan.push({ area: "User management", query: "users member email unsuppress suppressed", path: "/user_admin.php?stage=Retrieve" });
  }
  if (/member|membership|bill|invoice|subscription|wallet|unpaid|outstanding/.test(text)) {
    plan.push({ area: "Membership reports", query: "membership reports billing bills unpaid outstanding", path: "/brs-memberships/" });
    plan.push({ area: "Memberships", query: "memberships members billing bills", path: "/brs-memberships/" });
  }
  if (/payment|refund|transaction|payout|vat/.test(text)) plan.push({ area: "BRS Payments", query: "payments transactions refunds payout vat", path: "/payment/account/reports" });
  if (/green fee|rate|visitor green fee/.test(text)) plan.push({ area: "Green Fee Rates", query: "green fee rates visitors agents", path: "/green-fee-rates/" });
  if (/tee|booking|timesheet|visitor/.test(text)) plan.push({ area: "Tee sheet", query: "tee sheet bookings visitors", path: /visitor/.test(text) ? "/visitor_menu.php" : "/day.php" });
  if (/competition|draw|entry|purse/.test(text)) plan.push({ area: "Competitions", query: "competition setup entries draw purse", path: /purse|charge|payment/.test(text) ? "/competition_purse.php" : "/competitions/member/" });
  if (/report|list|show|see which|export|download/.test(text)) plan.push({ area: "Reports", query: "reports export filters table", path: "/reports.php" });
  if (/user|staff|admin|permission|login/.test(text)) plan.push({ area: "User management", query: "users staff permissions admin", path: "/user_admin.php?stage=Retrieve" });
  if (/contact categor/.test(text)) plan.push({ area: "Contact Categories", query: "contact categories setup", path: "/contactcategory/" });
  else if (/contact/.test(text)) plan.push({ area: "Contacts", query: "contacts categories add view", path: "/contacts.php" });
  if (/reservation type/.test(text)) plan.push({ area: "Reservation Types", query: "reservation types setup", path: "/reservationtype/" });
  if (/booking status/.test(text)) plan.push({ area: "Booking Statuses", query: "booking statuses setup", path: "/bookingstatus/" });
  if (/restriction/.test(text)) plan.push({ area: "Course Restrictions", query: "course restriction setup", path: "/course-restriction/" });
  if (/message|email|sms|text/.test(text)) plan.push({ area: "Messaging", query: "email sms text club messages templates", path: /sms|text/.test(text) ? "/smsmenu.php" : "/emailmenu.php" });
  if (/tool|configuration|configure|setting|setup/.test(text)) plan.push({ area: "System Tools", query: "tools system configuration setup", path: "/tools" });
  return plan.length ? plan : [{ area: "Global navigation", query: question }];
}

function plannedRouteUrl(routePath = "") {
  if (!routePath) return "";
  if (/^https?:\/\//i.test(routePath)) return routePath;
  try {
    return `${BASE_URL.replace(/\/+$/, "")}/${String(routePath).replace(/^\/+/, "")}`;
  } catch {
    return "";
  }
}

function isUsefulLivePage(pageEvidence = {}) {
  const text = normalise(`${pageEvidence.title || ""} ${(pageEvidence.headings || []).join(" ")}`);
  return !/\b(404 not found|page not found)\b/.test(text);
}

function scoreLabel(label = "", plan = []) {
  const lower = normalise(label);
  if (!lower || BLOCKED_ACTION_PATTERN.test(lower)) return -100;
  const safeTermHit = SAFE_NAVIGATION_TERMS.some((term) => lower.includes(term)) ? 4 : 0;
  const queryTokens = new Set(plan.flatMap((item) => normalise(`${item.area} ${item.query}`).split(/\s+/)).filter((token) => token.length > 2));
  let score = safeTermHit;
  for (const token of queryTokens) if (lower.includes(token)) score += 2;
  return score;
}

function checkSecret(req, res, next) {
  if (!WORKER_SECRET) {
    return res.status(503).json({ error: "BRS_LIVE_WORKER_SECRET must be configured before this worker accepts lookup requests." });
  }
  if (req.get("x-brs-live-worker-secret") === WORKER_SECRET) return next();
  return res.status(401).json({ error: "Unauthorized live lookup worker request." });
}

async function collectPageEvidence(page) {
  const evidence = await page.evaluate(() => {
    const textOf = (node) => (node?.innerText || node?.textContent || node?.value || "").replace(/\s+/g, " ").trim();
    const pick = (selector, limit = 80) => Array.from(document.querySelectorAll(selector)).map(textOf).filter(Boolean).slice(0, limit);
    const controls = Array.from(document.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button'], select, input, textarea"))
      .map((node) => ({
        label: textOf(node) || node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("placeholder") || node.getAttribute("name") || node.getAttribute("href") || "",
        tagName: node.tagName,
        type: node.getAttribute("type") || node.tagName,
        href: node.getAttribute("href") || "",
        options: node.tagName === "SELECT" ? Array.from(node.querySelectorAll("option")).map(textOf).filter(Boolean).slice(0, 60) : [],
      }))
      .filter((item) => item.label);
    return {
      title: document.title || "",
      url: location.href,
      headings: pick("h1,h2,h3,.page-title,.title", 30),
      breadcrumbs: pick(".breadcrumb, nav[aria-label*='breadcrumb'], .breadcrumbs", 20),
      tableHeaders: pick("table th,[role='columnheader']", 80),
      captions: pick("caption, table h1, table h2, table h3", 20),
      controls,
    };
  });

  return {
    title: redactSensitive(evidence.title),
    url: evidence.url,
    headings: unique(evidence.headings.map(redactSensitive), 30),
    breadcrumbs: unique(evidence.breadcrumbs.map(redactSensitive), 20),
    tableHeaders: unique(evidence.tableHeaders.map(redactSensitive), 80),
    captions: unique(evidence.captions.map(redactSensitive), 20),
    controls: evidence.controls
      .map((control) => {
        const label = redactSensitive(control.label);
        return {
          ...control,
          label,
          unsafeAction: BLOCKED_ACTION_PATTERN.test(label),
          options: unique((control.options || []).map(redactSensitive), 60),
        };
      })
      .filter((control) => control.label)
      .slice(0, 120),
  };
}

async function redactPageForScreenshot(page) {
  await page.evaluate(() => {
    const redact = (value = "") => String(value)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      .replace(/\b\+?\d[\d\s().-]{7,}\b/g, "[phone]")
      .replace(/[£€]\s?\d+(?:\.\d{2})?/g, "[amount]")
      .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, "[date]");

    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const next = redact(node.nodeValue || "");
      if (next !== node.nodeValue) node.nodeValue = next;
    }

    document.querySelectorAll("input, textarea").forEach((node) => {
      if (node.value) node.value = redact(node.value);
      ["value", "placeholder", "title", "aria-label"].forEach((attr) => {
        const current = node.getAttribute(attr);
        if (current) node.setAttribute(attr, redact(current));
      });
    });
  }).catch(() => null);
}

function summariseError(error) {
  const message = error?.message || String(error || "Unknown worker lookup error");
  return message.split("\n").slice(0, 4).join("\n").trim();
}

function withTimeout(name, promise, timeoutMs = STAGE_TIMEOUT_MS) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms.`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function createTimer() {
  const startedAt = Date.now();
  const stages = [];
  return {
    stages,
    async step(name, fn, timeoutMs = STAGE_TIMEOUT_MS) {
      const stageStartedAt = Date.now();
      try {
        const value = await withTimeout(name, fn(), timeoutMs);
        stages.push({ name, ok: true, ms: Date.now() - stageStartedAt });
        return value;
      } catch (error) {
        stages.push({ name, ok: false, ms: Date.now() - stageStartedAt, error: summariseError(error) });
        throw error;
      }
    },
    totalMs() {
      return Date.now() - startedAt;
    },
  };
}

async function installReadOnlyGuard(page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) return route.abort();
    return route.continue();
  });
}

async function tryLogin(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: STAGE_TIMEOUT_MS });
  if (!USERNAME || !PASSWORD) return false;
  const username = page.locator("input[type='email'], input[name*='user' i], input[name*='email' i], input[id*='user' i], input[id*='email' i]").first();
  const password = page.locator("input[type='password']").first();
  if (!(await username.count().catch(() => 0)) || !(await password.count().catch(() => 0))) return true;
  await username.fill(USERNAME);
  await password.fill(PASSWORD);
  const submit = page.locator("button[type='submit'], input[type='submit'], button:has-text('Log in'), button:has-text('Login'), button:has-text('Sign in')").first();
  if (await submit.count().catch(() => 0)) await submit.click({ timeout: 5000 });
  await page.waitForLoadState("domcontentloaded", { timeout: STAGE_TIMEOUT_MS }).catch(() => null);
  return true;
}

async function followSafeNavigation(page, plan) {
  const visited = [];
  for (let depth = 0; depth < 3; depth += 1) {
    const candidates = await page.locator("a, button, [role='button']").evaluateAll((nodes) => nodes.map((node, index) => ({
      index,
      label: (node.innerText || node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("href") || "").replace(/\s+/g, " ").trim(),
      href: node.getAttribute("href") || "",
    }))).catch(() => []);
    const ranked = candidates.map((item) => ({ ...item, score: scoreLabel(item.label, plan) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    const next = ranked.find((item) => !visited.includes(normalise(item.label)));
    if (!next) break;
    visited.push(normalise(next.label));
    const locator = page.locator("a, button, [role='button']").nth(next.index);
    await locator.click({ timeout: 5000 }).catch(() => null);
    await page.waitForLoadState("domcontentloaded", { timeout: STAGE_TIMEOUT_MS }).catch(() => null);
  }
  return visited;
}

async function collectPlannedRouteEvidence(page, plan) {
  const pages = [];
  const visited = [];
  const routes = unique(plan.map((item) => plannedRouteUrl(item.path)).filter(Boolean), 8);
  for (const routeUrl of routes) {
    await page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: STAGE_TIMEOUT_MS }).catch(() => null);
    await page.waitForLoadState("domcontentloaded", { timeout: STAGE_TIMEOUT_MS }).catch(() => null);
    visited.push(routeUrl);
    pages.push(await collectPageEvidence(page));
  }
  return { visited, pages };
}

async function runLookup(question, { staticEvidence = "", knowledgeHints = [] } = {}) {
  const plan = inferSearchPlan(question, [staticEvidence, ...knowledgeHints]);
  const baseResult = {
    enabled: true,
    attempted: true,
    successful: false,
    mode: "read-only-worker",
    plan,
    pages: [],
    error: null,
  };
  const timer = createTimer();
  if (!BASE_URL) {
    return { ...baseResult, timings: timer.stages, totalMs: timer.totalMs(), error: "BRS_BASE_URL or BRS_CLUB_ID must be configured with the target club system URL." };
  }
  if (!USERNAME || !PASSWORD) {
    return { ...baseResult, timings: timer.stages, totalMs: timer.totalMs(), error: "BRS worker credentials are not configured. Set BRS_USERNAME and BRS_PASSWORD on the worker service." };
  }
  let browser;
  try {
    browser = await timer.step("launch-browser", () => chromium.launch({ headless: process.env.BRS_WORKER_HEADLESS !== "false" }), Math.min(STAGE_TIMEOUT_MS, 8000));
    const context = await timer.step("new-context", () => browser.newContext());
    const page = await timer.step("new-page", () => context.newPage());
    await timer.step("login", () => tryLogin(page));
    await timer.step("install-read-only-guard", () => installReadOnlyGuard(page));
    const firstEvidence = await timer.step("collect-initial-evidence", () => collectPageEvidence(page));
    const plannedRoutes = await timer.step("collect-planned-route-evidence", () => collectPlannedRouteEvidence(page, plan));
    const visited = [
      ...plannedRoutes.visited.map((routeUrl) => `direct:${routeUrl}`),
      ...(await timer.step("follow-safe-navigation", () => followSafeNavigation(page, plan))),
    ];
    const finalEvidence = await timer.step("collect-final-evidence", () => collectPageEvidence(page));
    const pages = [firstEvidence, ...plannedRoutes.pages, finalEvidence]
      .filter(isUsefulLivePage)
      .filter((pageEvidence, index, arr) => arr.findIndex((item) => item.url === pageEvidence.url) === index);
    const hasPlannedRoutes = plan.some((item) => item.path);
    const successful = hasPlannedRoutes
      ? plannedRoutes.pages.some(isUsefulLivePage)
      : pages.length > 0;
    return { ...baseResult, successful, visited, pages, timings: timer.stages, totalMs: timer.totalMs() };
  } catch (error) {
    return { ...baseResult, timings: timer.stages, totalMs: timer.totalMs(), error: summariseError(error) };
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

async function runScreenshot(question, { staticEvidence = "", knowledgeHints = [] } = {}) {
  const plan = inferSearchPlan(question, [staticEvidence, ...knowledgeHints]);
  const baseResult = {
    enabled: true,
    attempted: true,
    successful: false,
    mode: "verified-screenshot-worker",
    plan,
    image: null,
    page: null,
    error: null,
  };
  const timer = createTimer();
  if (!BASE_URL) {
    return { ...baseResult, timings: timer.stages, totalMs: timer.totalMs(), error: "BRS_BASE_URL or BRS_CLUB_ID must be configured with the target club system URL." };
  }
  if (!USERNAME || !PASSWORD) {
    return { ...baseResult, timings: timer.stages, totalMs: timer.totalMs(), error: "BRS worker credentials are not configured. Set BRS_USERNAME and BRS_PASSWORD on the worker service." };
  }
  let browser;
  try {
    browser = await timer.step("launch-browser", () => chromium.launch({ headless: process.env.BRS_WORKER_HEADLESS !== "false" }), Math.min(STAGE_TIMEOUT_MS, 8000));
    const context = await timer.step("new-context", () => browser.newContext({ viewport: { width: 1365, height: 768 } }));
    const page = await timer.step("new-page", () => context.newPage());
    await timer.step("login", () => tryLogin(page));
    await timer.step("install-read-only-guard", () => installReadOnlyGuard(page));
    const routeUrl = unique(plan.map((item) => plannedRouteUrl(item.path)).filter(Boolean), 4)[0] || BASE_URL;
    await timer.step("open-planned-route", () => page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: STAGE_TIMEOUT_MS }).catch(() => null));
    await page.waitForLoadState("domcontentloaded", { timeout: STAGE_TIMEOUT_MS }).catch(() => null);
    const pageEvidence = await timer.step("collect-page-evidence", () => collectPageEvidence(page));
    await timer.step("redact-page", () => redactPageForScreenshot(page));
    const png = await timer.step("capture-screenshot", () => page.screenshot({ type: "png", fullPage: false }));
    return {
      ...baseResult,
      successful: true,
      page: pageEvidence,
      image: {
        id: `verified-screenshot-${Date.now()}`,
        title: pageEvidence.title || "BRS demo system screenshot",
        source: "verified-screenshot",
        url: `data:image/png;base64,${png.toString("base64")}`,
        alt: `Verified BRS demo system screenshot from ${pageEvidence.title || pageEvidence.url || "the selected page"}.`,
        capturedUrl: pageEvidence.url,
      },
      timings: timer.stages,
      totalMs: timer.totalMs(),
    };
  } catch (error) {
    return { ...baseResult, timings: timer.stages, totalMs: timer.totalMs(), error: summariseError(error) };
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    worker: "brs-live-lookup-worker",
    liveBaseUrlConfigured: Boolean(BASE_URL),
    credentialsConfigured: Boolean(USERNAME && PASSWORD),
    workerSecretConfigured: Boolean(WORKER_SECRET),
  });
});

app.post("/lookup", checkSecret, async (req, res) => {
  const question = compact(req.body?.question);
  if (!question) return res.status(400).json({ error: "Missing question." });
  const result = await runLookup(question, {
    staticEvidence: req.body?.staticEvidence || "",
    knowledgeHints: Array.isArray(req.body?.knowledgeHints) ? req.body.knowledgeHints : [],
  });
  return res.status(result.error ? 502 : 200).json(result);
});

app.post("/screenshot", checkSecret, async (req, res) => {
  const question = compact(req.body?.question);
  if (!question) return res.status(400).json({ error: "Missing question." });
  const result = await runScreenshot(question, {
    staticEvidence: req.body?.staticEvidence || "",
    knowledgeHints: Array.isArray(req.body?.knowledgeHints) ? req.body.knowledgeHints : [],
  });
  return res.status(result.error ? 502 : 200).json(result);
});

app.listen(PORT, () => {
  console.log(`BRS live lookup worker listening on ${PORT}`);
});
