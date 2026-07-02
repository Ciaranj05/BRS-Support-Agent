import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import dotenv from "dotenv";
import { keepReusableProductText, redactText } from "../lib/knowledgeRedaction.js";

dotenv.config();

const BASE_URL = process.env.BRS_BASE_URL || "";
const USERNAME = process.env.BRS_USERNAME;
const PASSWORD = process.env.BRS_PASSWORD;
const OUTPUT_DIR = process.env.BRS_CRAWL_OUTPUT_DIR || path.join("knowledge", "system");
const WORKFLOW_OUTPUT_DIR = process.env.BRS_CRAWL_WORKFLOW_OUTPUT_DIR || path.join("knowledge", "workflows");
const MAX_PAGES = Number(process.env.BRS_CRAWL_MAX_PAGES || 140);
const ALLOW_MUTATIONS = process.env.BRS_CRAWL_ALLOW_MUTATIONS === "true";
const BROWSER_EXECUTABLE_PATH = process.env.BRS_CRAWL_BROWSER_EXECUTABLE_PATH || "";
const HELP_MODE = process.env.BRS_CRAWL_HELP_MODE || "full";
const PAGE_NAVIGATION_TIMEOUT_MS = Number(process.env.BRS_CRAWL_PAGE_NAVIGATION_TIMEOUT_MS || 12000);
const PAGE_ACTION_TIMEOUT_MS = Number(process.env.BRS_CRAWL_PAGE_ACTION_TIMEOUT_MS || 3500);
const EMBEDDED_APP_HOSTS = (process.env.BRS_CRAWL_EMBEDDED_APP_HOSTS || "embedded-memberships.brsgolf.com")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
const EXTRA_SEED_PATHS = (process.env.BRS_CRAWL_SEED_PATHS || "")
  .split(",")
  .map((seed) => seed.trim())
  .filter(Boolean);

const CLUB_IDS = (process.env.BRS_CLUB_IDS || process.env.BRS_CLUB_ID || "")
  .split(",")
  .map((clubId) => clubId.trim())
  .filter(Boolean);

const ALLOWED_NAVIGATION_TEXT = [
  /dashboard/i,
  /timesheet/i,
  /tools/i,
  /system configuration/i,
  /configure timesheet/i,
  /tee sheet/i,
  /tee time/i,
  /booking details/i,
  /facilities/i,
  /contacts/i,
  /payments/i,
  /reports/i,
  /search/i,
  /competitions/i,
  /golf events?/i,
  /club news/i,
  /club messages?/i,
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

const DEFAULT_SEED_PATHS = [
  "/",
  "/dashboard/",
  "/day.php",
  "/calendar.php",
  "/visitor_availability_month.php",
  "/visitor_menu.php",
  "/fac_day.php",
  "/contacts.php",
  "/contacts.php?operation=add_contact",
  "/contacts.php?operation=view_contacts",
  "/brs-memberships",
  "/user_admin.php?stage=Retrieve",
  "/reports.php",
  "/search.php",
  "/tools",
  "/system_conf.php",
  "/config_timesheet.php",
  "/copy_settings_year_to_year.php",
  "/upload_timesheet.php",
  "/upload.php",
  "/admin_config.php?config_type=services",
  "/admin_config.php?config_type=refreshments",
  "/admin_config.php?config_type=timesheet_msg",
  "/admin_config.php?config_type=timesheet_templates",
  "/admin_config.php?config_type=mem_types",
  "/admin_config.php?config_type=mem_groups",
  "/admin_config.php?config_type=casual_times",
  "/admin_config.php?config_type=competitions",
  "/admin_config.php?config_type=open_comp",
  "/admin_letters.php",
  "/emailmenu.php",
  "/smsmenu.php",
  "/admin-messages/",
  "/club-messages/",
  "/club-news",
  "/green-fee-rates/",
  "/visitorgreenfee/add/",
  "/reservationtype/",
  "/bookingstatus/",
  "/paymentmethod/",
  "/contactcategory/",
  "/course-restriction/",
  "/competitions/member/",
  "/golf_event_admin.php",
  "/competition_purse.php",
  "/payment/payouts",
  "/payment/transactions",
  "/payment/refunds",
  "/payment/booking/list/requests",
  "/payment/general/list/requests",
  "/payment/account/reports",
  "/payment/account/setup",
  "/membershipdatamerge/view/",
  "/membershiptypemap/list/",
  "/term/list",
];

function assertConfig() {
  if (!USERNAME || !PASSWORD) throw new Error("Set BRS_USERNAME and BRS_PASSWORD before crawling.");
  if (!CLUB_IDS.length) throw new Error("Set BRS_CLUB_ID or BRS_CLUB_IDS before crawling.");
  for (const clubId of CLUB_IDS) {
    if (!/^[a-z0-9-]+$/i.test(clubId)) throw new Error(`Invalid BRS club id: ${clubId}`);
  }
}

function compactUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function clubBaseUrl(clubId) {
  const configured = compactUrl(BASE_URL);
  if (configured) {
    try {
      const parsed = new URL(configured);
      const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
      if (path === `/${clubId.toLowerCase()}` || path.startsWith(`/${clubId.toLowerCase()}/`)) return configured;
      if (!path) {
        const host = parsed.hostname === "brsgolf.com" ? "www.brsgolf.com" : parsed.host;
        return `${parsed.protocol}//${host}/${clubId}`;
      }
      return configured;
    } catch {
      return configured;
    }
  }
  return `https://www.brsgolf.com/${clubId}`;
}

function sameClubUrl(url, clubId) {
  try {
    const parsed = new URL(url);
    const base = new URL(clubBaseUrl(clubId));
    const basePath = base.pathname.toLowerCase().replace(/\/+$/, "");
    return parsed.hostname === base.hostname && parsed.pathname.toLowerCase().startsWith(basePath);
  } catch {
    return false;
  }
}

function isAllowedEmbeddedAppUrl(url) {
  try {
    const parsed = new URL(url);
    return EMBEDDED_APP_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isAllowedCrawlUrl(url, clubId) {
  return sameClubUrl(url, clubId) || isAllowedEmbeddedAppUrl(url);
}

function isAllowedLink(link, clubId) {
  const text = `${link.text || ""} ${link.href || ""}`;
  if (!isAllowedCrawlUrl(link.href, clubId)) return false;
  if (BLOCKED_URL_TEXT.some((pattern) => pattern.test(text))) return false;
  return ALLOWED_NAVIGATION_TEXT.some((pattern) => pattern.test(text));
}

function buildSeedLinks(clubId) {
  const base = clubBaseUrl(clubId);
  return [...EXTRA_SEED_PATHS, ...DEFAULT_SEED_PATHS].map((seed) => {
    const href = /^https?:\/\//i.test(seed)
      ? seed
      : `${base}${seed.startsWith("/") ? seed : `/${seed}`}`;
    return { text: seed, href };
  }).filter((link) => isAllowedCrawlUrl(link.href, clubId));
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

function isMetricHeading(value = "") {
  const text = String(value || "").trim();
  return /^-?\d+(\.\d+)?%?$/.test(text) || /^\d+\s+(bookings?|golfers?|members?|visitors?)$/i.test(text);
}

function titleFromUrl(url = "") {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const last = pathname.split("/").filter(Boolean).pop() || "Dashboard";
    const configType = parsed.searchParams.get("config_type");
    if (configType) return configType.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    if (/^day\.php$/i.test(last)) return "Timesheet";
    if (/^dashboard$/i.test(last)) return "Dashboard";
    return last.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "";
  }
}

function choosePageTitle({ headings = [], pageTitle = "", url = "" } = {}) {
  const usefulHeading = headings.find((heading) => !isMetricHeading(heading));
  if (usefulHeading) return usefulHeading;
  const usefulTitle = normaliseLabel(pageTitle);
  if (usefulTitle && !/^brs golf - tee booking system$/i.test(usefulTitle)) return usefulTitle;
  return titleFromUrl(url) || usefulTitle || "BRS page";
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

function joinQuoted(values = [], limit = 18) {
  const useful = values.map((value) => normaliseLabel(value)).filter(Boolean).slice(0, limit);
  if (!useful.length) return "";
  return useful.map((value) => `"${value}"`).join(", ");
}

function actionLabelsForPurpose(actions = [], pattern, limit = 8) {
  return joinQuoted(actions
    .filter((action) => pattern.test(`${action.label || ""} ${action.purpose || ""}`))
    .map((action) => action.label), limit);
}

function buildWorkflowSteps({ titleText, navigationPath, formControls = [], actions = [], tableHeaders = [] } = {}) {
  const steps = [
    navigationPath ? `Open "${navigationPath}".` : `Open "${titleText}".`,
  ];
  const fieldLabels = joinQuoted(formControls.map((control) => control.label), 24);
  if (fieldLabels) steps.push(`Select or enter values in the captured fields for this workflow: ${fieldLabels}.`);
  const filterActions = actionLabelsForPurpose(actions, /filter|search|apply/i);
  if (filterActions) steps.push(`Click the filter/search control to apply the selected criteria: ${filterActions}.`);
  const runActions = actionLabelsForPurpose(actions, /open|run|view|details|report/i);
  if (runActions) steps.push(`Open or run the selected record/report with: ${runActions}.`);
  const exportActions = actionLabelsForPurpose(actions, /download|export/i);
  if (exportActions) steps.push(`Download or export the result with: ${exportActions}.`);
  const printActions = actionLabelsForPurpose(actions, /print/i);
  if (printActions) steps.push(`Print the result with: ${printActions}.`);
  const writeActions = actionLabelsForPurpose(actions, /add|create|save|update|submit/i);
  if (writeActions) steps.push(`For authorised write workflows, click the captured write control only after checking the draft values: ${writeActions}.`);
  const otherActions = joinQuoted(actions
    .filter((action) => !/filter|search|apply|open|run|view|details|report|download|export|print|add|create|save|update|submit/i.test(`${action.label || ""} ${action.purpose || ""}`))
    .map((action) => action.label), 12);
  if (otherActions) steps.push(`Use these captured secondary controls for this workflow: ${otherActions}.`);
  const tableLabels = joinQuoted(tableHeaders, 18);
  if (tableLabels) steps.push(`Verify the displayed records or report output against these captured columns: ${tableLabels}.`);
  return steps;
}

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE_PATH) {
    return await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
  }
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
  await page.goto(`${clubBaseUrl(clubId)}/login`, { waitUntil: "domcontentloaded", timeout: PAGE_NAVIGATION_TIMEOUT_MS });
  const filledUser = await fillFirstVisible(page, ["input[name='username']", "input[name='login']", "input[type='text']", "input[type='email']"], USERNAME);
  const filledPassword = await fillFirstVisible(page, ["input[name='password']", "input[type='password']"], PASSWORD);
  if (!filledUser || !filledPassword) throw new Error(`Could not find login fields for ${clubId}.`);
  await page.locator("button[type='submit'], input[type='submit']").first().click();
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForURL((url) => !/\/login\/?$/i.test(url.pathname), { timeout: 5000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
}

async function extractLinks(page, clubId) {
  const links = await page.locator("a[href]").evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent || "", href: node.href })));
  return links.filter((link) => isAllowedLink(link, clubId));
}

async function extractEmbeddedAppLinks(page) {
  const frames = await page.locator("iframe[src]").evaluateAll((nodes) => nodes.map((node) => ({
    text: node.getAttribute("title") || node.getAttribute("id") || node.getAttribute("name") || "Embedded BRS app",
    href: node.src,
  }))).catch(() => []);

  return frames.filter((frame) => isAllowedEmbeddedAppUrl(frame.href));
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

  return uniqueObjects(controls.filter((control) => {
    if (control.type !== "hidden") return true;
    const label = normaliseLabel(control.label);
    const name = normaliseLabel(control.name);
    return label && label !== name && label !== "hidden";
  }).map((control) => ({
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
  if (HELP_MODE === "off") return [];
  if (HELP_MODE === "attributes") {
    const selector = "[title], [aria-label], [data-original-title], [data-bs-original-title], [data-tooltip], [data-help]";
    const helpText = await page.locator(selector).evaluateAll((nodes) => nodes.flatMap((node) => [
      node.getAttribute("title") || "",
      node.getAttribute("aria-label") || "",
      node.getAttribute("data-original-title") || "",
      node.getAttribute("data-bs-original-title") || "",
      node.getAttribute("data-tooltip") || "",
      node.getAttribute("data-help") || "",
      node.textContent || "",
    ])).catch(() => []);
    return uniqueUsefulText(helpText, 100);
  }

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
  const titleText = choosePageTitle({ headings, pageTitle: title, url });

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
    steps: buildWorkflowSteps({ titleText, navigationPath, formControls, actions, tableHeaders: tableEvidence.headers }),
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
  page.setDefaultTimeout(PAGE_ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PAGE_NAVIGATION_TIMEOUT_MS);
  await login(page, clubId);

  const queue = [
    ...buildSeedLinks(clubId),
    ...await extractLinks(page, clubId),
  ];
  queue.push(...await extractEmbeddedAppLinks(page));
  const seen = new Set();
  const entries = [];

  while (queue.length && entries.length < MAX_PAGES) {
    const next = queue.shift();
    if (!next?.href || seen.has(next.href)) continue;
    seen.add(next.href);
    console.log(`[crawl:${clubId}] ${seen.size}/${MAX_PAGES} ${next.href}`);
    await page.goto(next.href, { waitUntil: "domcontentloaded", timeout: PAGE_NAVIGATION_TIMEOUT_MS }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
    if (!isAllowedCrawlUrl(page.url(), clubId)) continue;
    entries.push(...await extractPageKnowledge(page, clubId, page.url()));
    for (const link of await extractLinks(page, clubId)) {
      if (!seen.has(link.href)) queue.push(link);
    }
    for (const link of await extractEmbeddedAppLinks(page)) {
      if (!seen.has(link.href)) queue.push(link);
    }
  }

  await context.close();
  return entries;
}

async function main() {
  assertConfig();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE_PATH || undefined });
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
