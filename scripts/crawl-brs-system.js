import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { keepReusableProductText, redactText } from "../lib/knowledgeRedaction.js";

dotenv.config();

const BASE_URL = process.env.BRS_BASE_URL || "https://brsgolf.com";
const USERNAME = process.env.BRS_USERNAME;
const PASSWORD = process.env.BRS_PASSWORD;
const OUTPUT_DIR = process.env.BRS_CRAWL_OUTPUT_DIR || path.join("knowledge", "system");
const WORKFLOW_OUTPUT_DIR = process.env.BRS_CRAWL_WORKFLOW_OUTPUT_DIR || path.join("knowledge", "workflows");
const MAX_PAGES = Number(process.env.BRS_CRAWL_MAX_PAGES || 140);
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
  /members?/i,
  /memberships?/i,
  /subscriptions?/i,
  /billing/i,
  /bills?/i,
  /invoices?/i,
  /wallet/i,
  /account balance/i,
  /flexi|flexible/i,
  /payment schemes?/i,
  /users/i,
  /permissions/i,
  /email/i,
  /templates/i,
  /gdpr/i,
  /buggy/i,
  /help/i,
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

function uniqueUsefulText(values = [], limit = 120) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = keepReusableProductText(value);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function normaliseLabel(value = "") {
  return keepReusableProductText(String(value || "").replace(/\s+/g, " ").trim());
}

function uniqueObjects(items = [], key = "label", limit = 120) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const label = normaliseLabel(item?.[key]);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    output.push({ ...item, [key]: label });
    if (output.length >= limit) break;
  }
  return output;
}

function inferActionPurpose(action = {}) {
  const text = `${action.label || ""} ${action.ariaLabel || ""} ${action.title || ""} ${action.className || ""} ${action.href || ""}`.toLowerCase();
  if (/download|export|csv|excel|cloud.*down|fa-download|icon-download|download/i.test(text)) return "download/export";
  if (/filter|search|magnif|funnel|apply/i.test(text)) return "filter/search";
  if (/print|printer/i.test(text)) return "print";
  if (/reset|clear/i.test(text)) return "reset filters";
  if (/view|open|details|report|run/i.test(text)) return "open/run";
  return "action";
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

async function readVisibleText(page, selector) {
  return page.locator(selector).evaluateAll((nodes) => nodes
    .map((node) => node.innerText || node.textContent || "")
    .filter(Boolean)).catch(() => []);
}

async function extractInteractiveControls(page) {
  const controls = await page.locator("button, input[type='submit'], input[type='button'], a.btn, a[role='button'], [role='button'], a[href]").evaluateAll((nodes) => nodes.map((node) => {
    const element = node;
    const text = element.innerText || element.textContent || element.value || "";
    const imageAlt = [...element.querySelectorAll("img[alt]")].map((img) => img.getAttribute("alt")).filter(Boolean).join(" ");
    const iconTitle = [...element.querySelectorAll("svg title, i, span[class*='icon'], span[class*='fa'], span[class*='glyphicon']")].map((item) => item.textContent || item.getAttribute("title") || item.getAttribute("aria-label") || item.className || "").filter(Boolean).join(" ");
    const href = element.href || element.getAttribute("href") || "";
    return {
      label: text || element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("data-original-title") || imageAlt || iconTitle || element.className || href,
      ariaLabel: element.getAttribute("aria-label") || "",
      title: element.getAttribute("title") || element.getAttribute("data-original-title") || element.getAttribute("data-bs-original-title") || "",
      className: typeof element.className === "string" ? element.className : "",
      href,
      iconText: imageAlt || iconTitle,
      tagName: element.tagName,
    };
  })).catch(() => []);

  return uniqueObjects(controls.map((control) => ({
    ...control,
    purpose: inferActionPurpose(control),
  })).filter((control) => ALLOW_MUTATIONS || !/delete|remove|cancel|save|update|submit/i.test(`${control.label} ${control.title}`)), "label", 100);
}

async function extractFormControls(page) {
  const controls = await page.locator("input, select, textarea").evaluateAll((nodes) => nodes.map((node) => {
    const id = node.getAttribute("id");
    const name = node.getAttribute("name") || "";
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "" : "";
    const closestLabel = node.closest("label")?.textContent || "";
    const placeholder = node.getAttribute("placeholder") || "";
    const ariaLabel = node.getAttribute("aria-label") || "";
    const title = node.getAttribute("title") || "";
    const tagName = node.tagName.toLowerCase();
    const type = node.getAttribute("type") || tagName;
    const options = tagName === "select" ? [...node.querySelectorAll("option")].map((option) => option.textContent || option.value || "").filter(Boolean).slice(0, 80) : [];
    return {
      label: label || closestLabel || ariaLabel || placeholder || title || name || type,
      name,
      type,
      options,
    };
  })).catch(() => []);

  return uniqueObjects(controls.map((control) => ({
    ...control,
    options: uniqueUsefulText(control.options || [], 80),
  })), "label", 140);
}

async function extractTableEvidence(page) {
  const headers = uniqueUsefulText(await page.locator("table th, [role='columnheader']").evaluateAll((nodes) => nodes.map((node) => node.textContent || "")).catch(() => []), 80);
  const captions = uniqueUsefulText(await page.locator("caption, table h1, table h2, table h3").evaluateAll((nodes) => nodes.map((node) => node.textContent || "")).catch(() => []), 20);
  return { headers, captions };
}

async function extractHelpText(page) {
  const selector = "[title], [aria-label], [data-original-title], [data-bs-original-title], [data-tooltip], [data-help], .help, .tooltip, .popover, [role='tooltip'], a:has-text('?'), button:has-text('?'), [class*='help'], [class*='tooltip'], [class*='popover']";
  const helpCandidates = page.locator(selector);
  const count = Math.min(await helpCandidates.count().catch(() => 0), 80);
  const helpText = [];

  for (let index = 0; index < count; index += 1) {
    const item = helpCandidates.nth(index);
    const attributes = await Promise.all(["title", "aria-label", "data-original-title", "data-bs-original-title", "data-tooltip", "data-help"].map((attribute) => item.getAttribute(attribute).catch(() => "")));
    helpText.push(...attributes);
    helpText.push(await item.textContent().catch(() => ""));

    try {
      await item.hover({ timeout: 500 });
      helpText.push(...await readVisibleText(page, ".tooltip, .popover, [role='tooltip']"));
    } catch {}

    try {
      await item.click({ timeout: 500, trial: false });
      helpText.push(...await readVisibleText(page, ".tooltip, .popover, [role='tooltip'], .modal, [role='dialog']"));
      await page.keyboard.press("Escape").catch(() => {});
    } catch {}
  }

  return uniqueUsefulText(helpText, 100);
}

async function extractPageKnowledge(page, clubId, url) {
  const title = redactText(await page.title().catch(() => "BRS page"));
  const headings = uniqueUsefulText(await page.locator("h1, h2, h3").evaluateAll((nodes) => nodes.map((node) => node.textContent || "")).catch(() => []), 12);
  const labels = await page.locator("label, th, legend, dt").evaluateAll((nodes) => nodes.map((node) => node.textContent || "")).catch(() => []);
  const breadcrumbs = await page.locator(".breadcrumb, .breadcrumbs, nav[aria-label*='breadcrumb' i]").textContent().catch(() => "");
  const helpText = await extractHelpText(page);
  const pageText = uniqueUsefulText(await readVisibleText(page, "main, #content, .content, .container, body"), 12).join("\n");
  const formControls = await extractFormControls(page);
  const interactiveControls = await extractInteractiveControls(page);
  const tableEvidence = await extractTableEvidence(page);

  const fields = uniqueUsefulText(labels, 140).map((label) => ({ label }));
  const actions = interactiveControls.map((control) => ({ label: control.label, purpose: control.purpose, title: control.title, ariaLabel: control.ariaLabel, iconText: control.iconText }));
  const navigationPath = keepReusableProductText(breadcrumbs) || headings.join(" > ") || null;
  const baseId = `brs-system:${clubId}:${Buffer.from(url).toString("base64url").slice(0, 32)}`;
  const titleText = headings[0] || title;

  const pageEntry = {
    id: baseId,
    sourceType: "brs-system",
    clubScope: "template",
    clubId,
    title: titleText,
    area: titleText,
    navigationPath,
    sourceUrl: url,
    purpose: headings.slice(0, 8).join(" | "),
    content: pageText,
    fields: uniqueObjects([...fields, ...formControls], "label", 180),
    actions,
    helpText,
    tableHeaders: tableEvidence.headers,
    relatedAreas: [],
    containsClubSpecificData: false,
    confidence: "needs-review",
    lastObservedAt: new Date().toISOString(),
  };

  const hasWorkflowShape = navigationPath || formControls.length || actions.length || tableEvidence.headers.length;
  const workflowEntry = hasWorkflowShape ? {
    id: `${baseId}:workflow`,
    sourceType: "brs-system-workflow",
    clubScope: "template",
    clubId,
    title: `${titleText} workflow`,
    area: titleText,
    workflow: titleText,
    navigationPath,
    sourceUrl: url,
    purpose: headings.slice(0, 8).join(" | ") || pageText.split("\n")[0] || titleText,
    steps: [
      navigationPath ? `Open ${navigationPath}` : `Open ${titleText}`,
      formControls.length ? "Use the available fields, filters, or selectors to narrow the result." : null,
      actions.length ? "Use the available page actions for the next step, such as run, filter, print, or download/export where shown." : null,
    ].filter(Boolean),
    controls: formControls,
    actions,
    tableHeaders: tableEvidence.headers,
    pageEvidence: {
      headings,
      captions: tableEvidence.captions,
      helpText,
    },
    containsClubSpecificData: false,
    confidence: "needs-review",
    lastObservedAt: new Date().toISOString(),
  } : null;

  return workflowEntry ? [pageEntry, workflowEntry] : [pageEntry];
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
    await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
    if (!sameClubUrl(page.url(), clubId)) continue;
    entries.push(...await extractPageKnowledge(page, clubId, page.url()));
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
  await fs.mkdir(WORKFLOW_OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `brs-system-${Date.now()}.json`);
  const workflowOutputPath = path.join(WORKFLOW_OUTPUT_DIR, `brs-workflows-${Date.now()}.json`);
  const workflowEntries = output.entries.filter((entry) => entry.sourceType === "brs-system-workflow");
  output.entries = output.entries.filter((entry) => entry.sourceType !== "brs-system-workflow");
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  await fs.writeFile(workflowOutputPath, JSON.stringify({ generatedAt: output.generatedAt, sourceType: "brs-system-workflow", entries: workflowEntries }, null, 2));
  console.log(`Wrote ${output.entries.length} BRS system knowledge entries to ${outputPath}`);
  console.log(`Wrote ${workflowEntries.length} BRS workflow knowledge entries to ${workflowOutputPath}`);
}

if (process.argv[1] && process.argv[1].endsWith("crawl-brs-system.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
