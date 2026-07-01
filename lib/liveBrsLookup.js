import crypto from "crypto";

const LIVE_LOOKUP_FLAG = String(process.env.BRS_LIVE_LOOKUP_ENABLED || "").toLowerCase();
const LIVE_LOOKUP_ENABLED = LIVE_LOOKUP_FLAG === "true";
const LIVE_LOOKUP_TIMEOUT_MS = Number(process.env.BRS_LIVE_LOOKUP_TIMEOUT_MS || 45000);
const CLUB_ID = process.env.BRS_CLUB_ID || process.env.BRS_DEMO_CLUB_ID || process.env.BRS_LOCAL_CLUB_ID || "";
const BASE_URL = resolveBrsBaseUrl(process.env.BRS_BASE_URL, CLUB_ID);
const USERNAME = process.env.BRS_USERNAME;
const PASSWORD = process.env.BRS_PASSWORD;
const BROWSER_WS_ENDPOINT = process.env.BRS_LIVE_BROWSER_WS_ENDPOINT || process.env.BROWSERLESS_WS_ENDPOINT;
const LIVE_WORKER_URL = process.env.BRS_LIVE_WORKER_URL || process.env.BRS_LIVE_LOOKUP_WORKER_URL;
const LIVE_WORKER_SECRET = process.env.BRS_LIVE_WORKER_SECRET || process.env.BRS_LIVE_LOOKUP_WORKER_SECRET;
const ALLOW_DIRECT_LOOKUP = process.env.BRS_LIVE_LOOKUP_ALLOW_DIRECT === "true" || process.env.VERCEL !== "1";
const ALLOW_DIRECT_SCREENSHOT = String(process.env.BRS_VERIFIED_SCREENSHOT_ALLOW_DIRECT || "true").toLowerCase() !== "false";
const LIVE_BROWSER_EXECUTABLE_PATH =
  process.env.BRS_LIVE_BROWSER_EXECUTABLE_PATH ||
  process.env.BRS_CRAWL_BROWSER_EXECUTABLE_PATH ||
  "";

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

function compact(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function resolveBrsBaseUrl(configuredBaseUrl = "", clubId = "") {
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

async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch (error) {
    return null;
  }
}

async function getChromiumLaunchOptions() {
  if (LIVE_BROWSER_EXECUTABLE_PATH) {
    return { headless: true, executablePath: LIVE_BROWSER_EXECUTABLE_PATH };
  }
  if (process.env.VERCEL !== "1") return { headless: true };
  try {
    const chromium = await import("@sparticuz/chromium");
    return {
      args: chromium.default.args,
      executablePath: await chromium.default.executablePath(),
      headless: true,
    };
  } catch (error) {
    return { headless: true };
  }
}

function sanitizeLookupError(error) {
  const message = error?.message || String(error || "Unknown live lookup error");
  if (/libnss3\.so/i.test(message)) {
    return "Chromium could not start in this serverless runtime because the native library libnss3.so is missing. Configure BRS_LIVE_WORKER_URL to use the free browser worker, configure BRS_LIVE_BROWSER_WS_ENDPOINT to use a managed browser service, or run the bot in a Docker/VM environment with Chrome dependencies installed.";
  }
  if (/Executable doesn't exist|playwright install/i.test(message)) {
    return "Chromium is not installed in this runtime. Configure BRS_LIVE_WORKER_URL to use the free browser worker, redeploy with browser dependencies installed, or configure BRS_LIVE_BROWSER_WS_ENDPOINT to use a managed browser service.";
  }
  if (/headless: expected boolean/i.test(message)) {
    return "Chromium launch configuration is invalid for this runtime.";
  }
  return message.split("\n").slice(0, 6).join("\n").trim();
}

async function lookupViaWorker(question, { staticEvidence = "", knowledgeHints = [] } = {}, baseResult) {
  if (!LIVE_WORKER_SECRET) {
    return {
      ...baseResult,
      attempted: true,
      mode: "read-only-worker",
      error: "BRS_LIVE_WORKER_SECRET must be configured before live lookup can call the browser worker.",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_LOOKUP_TIMEOUT_MS);
  const endpoint = `${LIVE_WORKER_URL.replace(/\/+$/, "")}/lookup`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(LIVE_WORKER_SECRET ? { "x-brs-live-worker-secret": LIVE_WORKER_SECRET } : {}),
      },
      body: JSON.stringify({ question, staticEvidence, knowledgeHints }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ...baseResult,
        attempted: true,
        mode: "read-only-worker",
        timings: Array.isArray(payload.timings) ? payload.timings : [],
        totalMs: payload.totalMs || null,
        error: payload.error || `BRS live worker returned HTTP ${response.status}.`,
      };
    }
    return {
      ...baseResult,
      ...payload,
      enabled: true,
      attempted: true,
      mode: payload.mode || "read-only-worker",
      plan: payload.plan?.length ? payload.plan : baseResult.plan,
      pages: Array.isArray(payload.pages) ? payload.pages : [],
      timings: Array.isArray(payload.timings) ? payload.timings : [],
      totalMs: payload.totalMs || null,
      error: payload.error || null,
    };
  } catch (error) {
    return {
      ...baseResult,
      attempted: true,
      mode: "read-only-worker",
      timings: [],
      totalMs: null,
      error: error?.name === "AbortError"
        ? `BRS live worker timed out after ${LIVE_LOOKUP_TIMEOUT_MS}ms.`
        : sanitizeLookupError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function screenshotViaWorker(question, { staticEvidence = "", knowledgeHints = [] } = {}, baseResult) {
  if (!LIVE_WORKER_SECRET) {
    return {
      ...baseResult,
      attempted: true,
      mode: "verified-screenshot-worker",
      error: "BRS_LIVE_WORKER_SECRET must be configured before screenshot capture can call the browser worker.",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_LOOKUP_TIMEOUT_MS);
  const endpoint = `${LIVE_WORKER_URL.replace(/\/+$/, "")}/screenshot`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(LIVE_WORKER_SECRET ? { "x-brs-live-worker-secret": LIVE_WORKER_SECRET } : {}),
      },
      body: JSON.stringify({ question, staticEvidence, knowledgeHints }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ...baseResult,
        attempted: true,
        mode: "verified-screenshot-worker",
        timings: Array.isArray(payload.timings) ? payload.timings : [],
        totalMs: payload.totalMs || null,
        error: payload.error || `BRS screenshot worker returned HTTP ${response.status}.`,
      };
    }
    return {
      ...baseResult,
      ...payload,
      enabled: true,
      attempted: true,
      mode: payload.mode || "verified-screenshot-worker",
      timings: Array.isArray(payload.timings) ? payload.timings : [],
      totalMs: payload.totalMs || null,
      error: payload.error || null,
    };
  } catch (error) {
    return {
      ...baseResult,
      attempted: true,
      mode: "verified-screenshot-worker",
      timings: [],
      totalMs: null,
      error: error?.name === "AbortError"
        ? `BRS screenshot worker timed out after ${LIVE_LOOKUP_TIMEOUT_MS}ms.`
        : sanitizeLookupError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
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

async function tryLogin(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: LIVE_LOOKUP_TIMEOUT_MS });
  if (!USERNAME || !PASSWORD) return false;
  const username = page.locator("input[type='email'], input[name*='user' i], input[name*='email' i], input[id*='user' i], input[id*='email' i]").first();
  const password = page.locator("input[type='password']").first();
  if (!(await username.count().catch(() => 0)) || !(await password.count().catch(() => 0))) return true;
  await username.fill(USERNAME);
  await password.fill(PASSWORD);
  const submit = page.locator("button[type='submit'], input[type='submit'], button:has-text('Log in'), button:has-text('Login'), button:has-text('Sign in')").first();
  if (await submit.count().catch(() => 0)) await submit.click({ timeout: 5000 });
  await page.waitForLoadState("domcontentloaded", { timeout: LIVE_LOOKUP_TIMEOUT_MS }).catch(() => null);
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
    await page.waitForLoadState("domcontentloaded", { timeout: LIVE_LOOKUP_TIMEOUT_MS }).catch(() => null);
  }
  return visited;
}

export function shouldAttemptLiveBrsLookup(question = "", staticEvidence = "") {
  if (!LIVE_LOOKUP_ENABLED) return false;
  if (!isLiveLookupRuntimeConfigured()) return false;
  const lower = normalise(question);
  const asksWorkflow = /\b(how|where|which|what|show|see|find|list|report|filter|export|download|add|change|edit|configure|set up|setup|refund|reverse|run|open)\b/.test(lower);
  const productArea = /\b(member|membership|bill|payment|refund|booking|tee|timesheet|teesheet|competition|report|user|admin|setting|configuration|service|buggy|buggies|caddie|caddy|club hire|trolley|facility|contact|message)\b/.test(lower);
  const weakStatic = !staticEvidence || staticEvidence.length < 1200;
  return asksWorkflow && productArea && (weakStatic || /\b(exact|specific|where|which|see which|all members)\b/.test(lower));
}

async function collectPlannedRouteEvidence(page, plan) {
  const pages = [];
  const visited = [];
  const routes = unique(plan.map((item) => plannedRouteUrl(item.path)).filter(Boolean), 8);
  for (const routeUrl of routes) {
    await page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: LIVE_LOOKUP_TIMEOUT_MS }).catch(() => null);
    await page.waitForLoadState("domcontentloaded", { timeout: LIVE_LOOKUP_TIMEOUT_MS }).catch(() => null);
    visited.push(routeUrl);
    pages.push(await collectPageEvidence(page));
  }
  return { visited, pages };
}

export function isLiveLookupRuntimeConfigured() {
  if (LIVE_WORKER_URL) return Boolean(LIVE_WORKER_SECRET);
  return Boolean(BROWSER_WS_ENDPOINT || ALLOW_DIRECT_LOOKUP);
}

export function isVerifiedScreenshotRuntimeConfigured() {
  if (LIVE_WORKER_URL) return Boolean(LIVE_WORKER_SECRET);
  return Boolean(BROWSER_WS_ENDPOINT || ALLOW_DIRECT_LOOKUP || ALLOW_DIRECT_SCREENSHOT);
}

export async function liveBrsLookup(question, { staticEvidence = "", knowledgeHints = [] } = {}) {
  const plan = inferSearchPlan(question, [staticEvidence, ...knowledgeHints]);
  const baseResult = {
    enabled: LIVE_LOOKUP_ENABLED,
    attempted: false,
    successful: false,
    mode: "read-only",
    plan,
    pages: [],
    error: null,
  };
  if (!LIVE_LOOKUP_ENABLED) return { ...baseResult, error: "Live lookup disabled. Set BRS_LIVE_LOOKUP_ENABLED=true to enable read-only BRS investigation." };
  if (!BASE_URL) return { ...baseResult, attempted: true, error: "BRS live lookup needs BRS_BASE_URL or BRS_CLUB_ID so it opens the club system rather than the public BRS website." };
  if (LIVE_WORKER_URL) return lookupViaWorker(question, { staticEvidence, knowledgeHints }, baseResult);
  if (!ALLOW_DIRECT_LOOKUP && !BROWSER_WS_ENDPOINT) {
    return {
      ...baseResult,
      attempted: true,
      error: "Live lookup is enabled but no browser worker or browser WebSocket endpoint is configured for this runtime.",
    };
  }
  const playwright = await loadPlaywright();
  if (!playwright) return { ...baseResult, attempted: true, error: "Playwright is not installed in this runtime." };

  let browser;
  try {
    browser = BROWSER_WS_ENDPOINT
      ? await playwright.chromium.connectOverCDP(BROWSER_WS_ENDPOINT)
      : await playwright.chromium.launch(await getChromiumLaunchOptions());
    const context = await browser.newContext();
    const page = await context.newPage();
    await tryLogin(page);
    await page.route("**/*", async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) return route.abort();
      return route.continue();
    });
    const firstEvidence = await collectPageEvidence(page);
    const plannedRoutes = await collectPlannedRouteEvidence(page, plan);
    const visited = [
      ...plannedRoutes.visited.map((routeUrl) => `direct:${routeUrl}`),
      ...(await followSafeNavigation(page, plan)),
    ];
    const finalEvidence = await collectPageEvidence(page);
    const pages = [firstEvidence, ...plannedRoutes.pages, finalEvidence]
      .filter(isUsefulLivePage)
      .filter((pageEvidence, index, arr) => arr.findIndex((item) => item.url === pageEvidence.url) === index);
    const hasPlannedRoutes = plan.some((item) => item.path);
    const successful = hasPlannedRoutes
      ? plannedRoutes.pages.some(isUsefulLivePage)
      : pages.length > 0;
    return { ...baseResult, attempted: true, successful, visited, pages };
  } catch (error) {
    return { ...baseResult, attempted: true, error: sanitizeLookupError(error) };
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

export async function liveBrsScreenshot(question, { staticEvidence = "", knowledgeHints = [] } = {}) {
  const plan = inferSearchPlan(question, [staticEvidence, ...knowledgeHints]);
  const baseResult = {
    enabled: true,
    attempted: false,
    successful: false,
    mode: "verified-screenshot",
    plan,
    image: null,
    page: null,
    error: null,
  };
  if (!BASE_URL) return { ...baseResult, attempted: true, error: "BRS screenshot capture needs BRS_BASE_URL or BRS_CLUB_ID so it opens the club system rather than the public BRS website." };
  if (!USERNAME || !PASSWORD) return { ...baseResult, attempted: true, error: "BRS screenshot capture needs demo-system credentials configured." };
  if (LIVE_WORKER_URL) {
    const workerResult = await screenshotViaWorker(question, { staticEvidence, knowledgeHints }, baseResult);
    if (workerResult?.successful || !ALLOW_DIRECT_SCREENSHOT) return workerResult;
  }
  if (!ALLOW_DIRECT_LOOKUP && !ALLOW_DIRECT_SCREENSHOT && !BROWSER_WS_ENDPOINT) {
    return {
      ...baseResult,
      attempted: true,
      error: "Verified screenshot capture is not configured. Configure BRS_LIVE_WORKER_URL or a browser WebSocket endpoint.",
    };
  }
  const playwright = await loadPlaywright();
  if (!playwright) return { ...baseResult, attempted: true, error: "Playwright is not installed in this runtime." };

  let browser;
  try {
    browser = BROWSER_WS_ENDPOINT
      ? await playwright.chromium.connectOverCDP(BROWSER_WS_ENDPOINT)
      : await playwright.chromium.launch(await getChromiumLaunchOptions());
    const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
    const page = await context.newPage();
    await tryLogin(page);
    await page.route("**/*", async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) return route.abort();
      return route.continue();
    });
    const routeUrl = unique(plan.map((item) => plannedRouteUrl(item.path)).filter(Boolean), 4)[0] || BASE_URL;
    await page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: LIVE_LOOKUP_TIMEOUT_MS }).catch(() => null);
    await page.waitForLoadState("domcontentloaded", { timeout: LIVE_LOOKUP_TIMEOUT_MS }).catch(() => null);
    const pageEvidence = await collectPageEvidence(page);
    await redactPageForScreenshot(page);
    const png = await page.screenshot({ type: "png", fullPage: false });
    return {
      ...baseResult,
      attempted: true,
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
    };
  } catch (error) {
    return { ...baseResult, attempted: true, error: sanitizeLookupError(error) };
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

export function formatLiveEvidence(result = {}) {
  if (!result?.successful) return "";
  return result.pages.map((page, index) => [
    `LIVE BRS PAGE ${index + 1}: ${page.title || "Untitled"}`,
    `URL: ${page.url}`,
    page.headings?.length ? `Headings: ${page.headings.join(" | ")}` : null,
    page.breadcrumbs?.length ? `Breadcrumbs: ${page.breadcrumbs.join(" | ")}` : null,
    page.tableHeaders?.length ? `Table columns: ${page.tableHeaders.join(" | ")}` : null,
    page.captions?.length ? `Captions: ${page.captions.join(" | ")}` : null,
    page.controls?.length ? `Controls: ${page.controls.slice(0, 60).map((control) => `${control.label}${control.unsafeAction ? " [visible action control; do not click during lookup]" : ""}${control.options?.length ? ` (${control.options.join(" / ")})` : ""}`).join(" | ")}` : null,
  ].filter(Boolean).join("\n")).join("\n\n---\n\n");
}

export function buildReusableWorkflowEntry({ question, answer, intent = {}, liveResult = {}, staticEvidenceUsed = false } = {}) {
  const page = liveResult.pages?.at(-1) || {};
  const sourceId = crypto.createHash("sha256").update(`${normalise(question)}:${normalise(page.title)}:${normalise(page.headings?.join("|"))}`).digest("hex").slice(0, 16);
  return {
    sourceType: "brs-system-workflow",
    title: `Learned workflow: ${intent.object || intent.topic || "BRS support question"}`,
    area: intent.topic || null,
    workflow: intent.object || normalise(question).slice(0, 120),
    summary: "Reusable workflow learned from a successfully resolved support conversation and live read-only BRS evidence. Generate a fresh answer from this evidence rather than reusing the original wording.",
    userNeed: normalise(question).replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/g, "[email]"),
    answerPattern: redactSensitive(answer).slice(0, 1600),
    navigationPath: unique([...(page.breadcrumbs || []), ...(page.headings || [])], 12).join(" >> ") || null,
    controls: (page.controls || []).slice(0, 80).map((control) => ({ label: control.label, type: control.type, options: control.options || [] })),
    tableHeaders: page.tableHeaders || [],
    pageEvidence: { headings: page.headings || [], captions: page.captions || [] },
    tags: unique(["learned-workflow", "successful-resolution", intent.topic, intent.task, intent.object].filter(Boolean), 20),
    confidence: liveResult.successful ? "approved" : "draft",
    safeForChatbot: Boolean(liveResult.successful),
    sourceId,
    learnedAt: new Date().toISOString(),
    staticEvidenceUsed: Boolean(staticEvidenceUsed),
  };
}
