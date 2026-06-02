import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { keepReusableProductText, redactText } from "../lib/knowledgeRedaction.js";

dotenv.config();

const BASE_URL = process.env.BRS_BASE_URL || "https://brsgolf.com";
const USERNAME = process.env.BRS_USERNAME;
const PASSWORD = process.env.BRS_PASSWORD;
const OUTPUT_DIR = process.env.BRS_CRAWL_OUTPUT_DIR || path.join("knowledge", "system");
const MAX_PAGES = Number(process.env.BRS_CRAWL_MAX_PAGES || 80);
const ALLOW_MUTATIONS = process.env.BRS_CRAWL_ALLOW_MUTATIONS === "true";

const CLUB_IDS = (process.env.BRS_CLUB_IDS || process.env.BRS_CLUB_ID || "")
  .split(",")
  .map((clubId) => clubId.trim())
  .filter(Boolean);

const ALLOWED_NAVIGATION_TEXT = [
  /system configuration/i,
  /configure timesheet/i,
  /tee sheet/i,
  /booking details/i,
  /payments/i,
  /reports/i,
  /competitions/i,
  /members/i,
  /subscriptions/i,
  /users/i,
  /permissions/i,
  /email/i,
  /templates/i,
  /gdpr/i,
  /buggy/i,
];

const BLOCKED_URL_TEXT = [
  /logout/i,
  /delete/i,
  /remove/i,
  /cancel/i,
  /payment.*submit/i,
  /checkout/i,
];

function assertConfig() {
  if (!USERNAME || !PASSWORD) throw new Error("Set BRS_USERNAME and BRS_PASSWORD before crawling.");
  if (!CLUB_IDS.length) throw new Error("Set BRS_CLUB_ID or BRS_CLUB_IDS before crawling.");
  for (const clubId of CLUB_IDS) {
    if (!/^[a-z0-9-]+$/i.test(clubId)) throw new Error(`Invalid BRS club id: ${clubId}`);
  }
}

function sameClubUrl(url, clubId) {
  try {
    const parsed = new URL(url);
    const base = new URL(BASE_URL);
    return parsed.hostname === base.hostname && parsed.pathname.toLowerCase().startsWith(`/${clubId.toLowerCase()}`);
  } catch {
    return false;
  }
}

function isAllowedLink(link, clubId) {
  const text = `${link.text || ""} ${link.href || ""}`;
  if (!sameClubUrl(link.href, clubId)) return false;
  if (BLOCKED_URL_TEXT.some((pattern) => pattern.test(text))) return false;
  return ALLOWED_NAVIGATION_TEXT.some((pattern) => pattern.test(text));
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is required for BRS crawling. Run npm install first.");
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

async function login(page, clubId) {
  await page.goto(`${BASE_URL}/${clubId}/login`, { waitUntil: "domcontentloaded" });
  const filledUser = await fillFirstVisible(page, ["input[name='username']", "input[name='login']", "input[type='text']", "input[type='email']"], USERNAME);
  const filledPassword = await fillFirstVisible(page, ["input[name='password']", "input[type='password']"], PASSWORD);
  if (!filledUser || !filledPassword) throw new Error(`Could not find login fields for ${clubId}.`);
  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    page.locator("button[type='submit'], input[type='submit']").first().click(),
  ]);
}

async function extractLinks(page, clubId) {
  const links = await page.locator("a[href]").evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent || "", href: node.href })));
  return links.filter((link) => isAllowedLink(link, clubId));
}

async function extractHelpText(page) {
  const helpCandidates = page.locator("[title], [aria-label], .help, .tooltip, a:has-text('?'), button:has-text('?')");
  const count = Math.min(await helpCandidates.count().catch(() => 0), 60);
  const helpText = [];
  for (let index = 0; index < count; index += 1) {
    const item = helpCandidates.nth(index);
    const title = await item.getAttribute("title").catch(() => "");
    const aria = await item.getAttribute("aria-label").catch(() => "");
    const text = keepReusableProductText([title, aria, await item.textContent().catch(() => "")].filter(Boolean).join(" "));
    if (text && !helpText.includes(text)) helpText.push(text);
  }
  return helpText;
}

async function extractPageKnowledge(page, clubId, url) {
  const title = redactText(await page.title().catch(() => "BRS page"));
  const headings = await page.locator("h1, h2, h3").evaluateAll((nodes) => nodes.map((node) => node.textContent || "")).catch(() => []);
  const labels = await page.locator("label, th, legend").evaluateAll((nodes) => nodes.map((node) => node.textContent || "")).catch(() => []);
  const buttons = await page.locator("button, input[type='submit'], input[type='button']").evaluateAll((nodes) => nodes.map((node) => node.textContent || node.value || "")).catch(() => []);
  const breadcrumbs = await page.locator(".breadcrumb, .breadcrumbs, nav[aria-label*='breadcrumb' i]").textContent().catch(() => "");
  const helpText = await extractHelpText(page);

  const fields = labels.map(keepReusableProductText).filter(Boolean).slice(0, 120).map((label) => ({ label }));
  const actions = buttons.map(keepReusableProductText).filter(Boolean).filter((label) => ALLOW_MUTATIONS || !/delete|remove|cancel|save|update|submit/i.test(label)).slice(0, 50).map((label) => ({ label }));

  return {
    id: `brs-system:${clubId}:${Buffer.from(url).toString("base64url").slice(0, 32)}`,
    sourceType: "brs-system",
    clubScope: "template",
    clubId,
    title: keepReusableProductText(headings[0]) || title,
    area: keepReusableProductText(headings[0] || title),
    navigationPath: keepReusableProductText(breadcrumbs) || null,
    sourceUrl: url,
    purpose: headings.map(keepReusableProductText).filter(Boolean).slice(0, 8).join(" | "),
    fields,
    actions,
    helpText: helpText.slice(0, 80),
    relatedAreas: [],
    containsClubSpecificData: false,
    confidence: "needs-review",
    lastObservedAt: new Date().toISOString(),
  };
}

async function crawlClub(browser, clubId) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, clubId);

  const queue = await extractLinks(page, clubId);
  const seen = new Set();
  const entries = [];

  while (queue.length && entries.length < MAX_PAGES) {
    const next = queue.shift();
    if (!next?.href || seen.has(next.href)) continue;
    seen.add(next.href);
    await page.goto(next.href, { waitUntil: "domcontentloaded" }).catch(() => null);
    if (!sameClubUrl(page.url(), clubId)) continue;
    entries.push(await extractPageKnowledge(page, clubId, page.url()));
    for (const link of await extractLinks(page, clubId)) {
      if (!seen.has(link.href)) queue.push(link);
    }
  }

  await context.close();
  return entries;
}

async function main() {
  assertConfig();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const output = { generatedAt: new Date().toISOString(), sourceType: "brs-system", entries: [] };
  try {
    for (const clubId of CLUB_IDS) output.entries.push(...await crawlClub(browser, clubId));
  } finally {
    await browser.close();
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `brs-system-${Date.now()}.json`);
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.entries.length} BRS system knowledge entries to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
