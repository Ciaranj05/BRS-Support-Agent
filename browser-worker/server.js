import "dotenv/config";
import cors from "cors";
import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const LIVE_LOOKUP_TIMEOUT_MS = Number(process.env.BRS_LIVE_LOOKUP_TIMEOUT_MS || 45000);
const BASE_URL = process.env.BRS_BASE_URL || "https://brsgolf.com";
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
];

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function compact(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  if (/member|membership|bill|invoice|subscription|wallet|unpaid|outstanding/.test(text)) {
    plan.push({ area: "Membership reports", query: "membership reports billing bills unpaid outstanding" });
    plan.push({ area: "Memberships", query: "memberships members billing bills" });
  }
  if (/payment|refund|transaction|payout/.test(text)) plan.push({ area: "BRS Payments", query: "payments transactions refunds payout" });
  if (/tee|booking|timesheet|visitor/.test(text)) plan.push({ area: "Tee sheet", query: "tee sheet bookings visitors" });
  if (/competition|draw|entry/.test(text)) plan.push({ area: "Competitions", query: "competition setup entries draw purse" });
  if (/report|list|show|see which|export|download/.test(text)) plan.push({ area: "Reports", query: "reports export filters table" });
  if (/user|staff|admin|permission|login/.test(text)) plan.push({ area: "User management", query: "users staff permissions admin" });
  return plan.length ? plan : [{ area: "Global navigation", query: question }];
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
  if (!WORKER_SECRET) return next();
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
  if (!USERNAME || !PASSWORD) {
    return { ...baseResult, error: "BRS worker credentials are not configured. Set BRS_USERNAME and BRS_PASSWORD on the worker service." };
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: process.env.BRS_WORKER_HEADLESS !== "false" });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) return route.abort();
      return route.continue();
    });
    await tryLogin(page);
    const firstEvidence = await collectPageEvidence(page);
    const visited = await followSafeNavigation(page, plan);
    const finalEvidence = await collectPageEvidence(page);
    const pages = [firstEvidence, finalEvidence].filter((pageEvidence, index, arr) => arr.findIndex((item) => item.url === pageEvidence.url) === index);
    return { ...baseResult, successful: pages.length > 0, visited, pages };
  } catch (error) {
    return { ...baseResult, error: error?.message || String(error || "Unknown worker lookup error") };
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

app.listen(PORT, () => {
  console.log(`BRS live lookup worker listening on ${PORT}`);
});
