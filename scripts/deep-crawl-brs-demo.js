import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { keepReusableProductText, redactText } from "../lib/knowledgeRedaction.js";

dotenv.config();

const CLUB_ID = process.env.BRS_DEEP_CRAWL_CLUB_ID || process.env.BRS_DEMO_CLUB_ID || process.env.BRS_CLUB_ID || "amysgolfclub";
const BASE_URL = (process.env.BRS_DEEP_CRAWL_BASE_URL || process.env.BRS_DEMO_BASE_URL || process.env.BRS_BASE_URL || `https://www.brsgolf.com/${CLUB_ID}`).replace(/\/+$/, "");
const USERNAME = process.env.BRS_DEEP_CRAWL_USERNAME || process.env.BRS_DEMO_USERNAME || process.env.BRS_USERNAME;
const PASSWORD = process.env.BRS_DEEP_CRAWL_PASSWORD || process.env.BRS_DEMO_PASSWORD || process.env.BRS_PASSWORD;
const MAX_PAGES = Number(process.env.BRS_DEEP_CRAWL_MAX_PAGES || 700);
const MAX_ACTIONS_PER_PAGE = Number(process.env.BRS_DEEP_CRAWL_MAX_ACTIONS_PER_PAGE || 18);
const OUTPUT_ROOT = process.env.BRS_DEEP_CRAWL_OUTPUT_DIR || path.join(process.cwd(), "artifacts", "deep-crawl");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const TEST_PREFIX = process.env.BRS_DEEP_CRAWL_TEST_PREFIX || `CODEX CRAWL TEST ${RUN_ID.slice(0, 10)}`;
const FILL_DRAFTS = process.env.BRS_DEEP_CRAWL_FILL_DRAFTS === "true";
const SUBMIT_NON_SETTINGS = process.env.BRS_DEEP_CRAWL_SUBMIT_NON_SETTINGS === "true";
const HEADLESS = process.env.BRS_DEEP_CRAWL_HEADLESS !== "false";
const BROWSER_EXECUTABLE_PATH = process.env.BRS_DEEP_CRAWL_BROWSER_EXECUTABLE_PATH || process.env.BRS_CRAWL_BROWSER_EXECUTABLE_PATH || "";
const NAV_TIMEOUT_MS = Number(process.env.BRS_DEEP_CRAWL_NAV_TIMEOUT_MS || 15000);
const ACTION_TIMEOUT_MS = Number(process.env.BRS_DEEP_CRAWL_ACTION_TIMEOUT_MS || 2500);
const CHECKPOINT_EVERY_PAGES = Number(process.env.BRS_DEEP_CRAWL_CHECKPOINT_EVERY_PAGES || 10);
const MAX_PER_URL_SIGNATURE = Number(process.env.BRS_DEEP_CRAWL_MAX_PER_URL_SIGNATURE || 6);

const EMBEDDED_HOSTS = new Set((process.env.BRS_DEEP_CRAWL_EMBEDDED_HOSTS || "embedded-memberships.brsgolf.com")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean));

const SEED_PATHS = [
  "/",
  "/dashboard/",
  "/day.php",
  "/calendar.php",
  "/visitor_menu.php",
  "/visitor_availability_month.php",
  "/fac_day.php",
  "/contacts.php",
  "/contacts.php?operation=view_contacts",
  "/contacts.php?operation=add_contact",
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

const SETTING_URL = /system_conf|config_timesheet|admin_config|tools|green-fee|visitorgreenfee|reservationtype|bookingstatus|paymentmethod|contactcategory|course-restriction|membershiptypemap|term\/|club-news|club-messages|admin_letters|copy_settings|upload/i;
const HIGH_RISK_URL = /payment|refund|payout|transactions|user_admin|permission|password|sms|email|messages?|upload|data[-_]?merge|import/i;
const BLOCKED_NAV = /logout|sign-?out/i;
const MUTATING_LABEL = /\b(save|submit|update|create|add|delete|remove|cancel|refund|charge|send|confirm|apply|process|import|upload)\b/i;
const OPEN_FLOW_LABEL = /\b(add|create|new|edit|view|details|more|manage|setup|configure|report|reports|filter|search|open|show|copy|preview)\b/i;

function requireConfig() {
  if (!USERNAME || !PASSWORD) throw new Error("Set BRS_USERNAME/BRS_PASSWORD or BRS_DEEP_CRAWL_USERNAME/BRS_DEEP_CRAWL_PASSWORD.");
}

function compact(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeText(value = "") {
  return redactText(keepReusableProductText(compact(value)) || compact(value)).slice(0, 1200);
}

function uniqueBy(items = [], keyFn, limit = 500) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function absoluteUrl(href = "", base = BASE_URL) {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

function allowedHost(url = "") {
  try {
    const parsed = new URL(url);
    const base = new URL(BASE_URL);
    return parsed.hostname === base.hostname || EMBEDDED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function allowedUrl(url = "") {
  if (!url || !allowedHost(url) || BLOCKED_NAV.test(url)) return false;
  try {
    const parsed = new URL(url);
    const base = new URL(BASE_URL);
    if (parsed.hostname === base.hostname) return parsed.pathname.toLowerCase().startsWith(`/${CLUB_ID.toLowerCase()}`) || base.pathname === "";
    return true;
  } catch {
    return false;
  }
}

function areaFromUrlAndText(url = "", text = "") {
  const lower = `${url} ${text}`.toLowerCase();
  if (/brs-memberships|membership|member profile|subscription|billing|bill/.test(lower)) return "Memberships";
  if (/payment|refund|payout|transaction|wallet|purse/.test(lower)) return "Payments";
  if (/competition|open_comp|competition_purse/.test(lower)) return "Competitions";
  if (/contact/.test(lower)) return "Contacts";
  if (/user_admin|permission|password|user/.test(lower)) return "Users";
  if (/report/.test(lower)) return "Reports";
  if (/search/.test(lower)) return "Search";
  if (/facilit|resource|room|golf_event/.test(lower)) return "Facilities/Golf Events";
  if (/message|email|sms|club-news|template|letter|term/.test(lower)) return "Messages/Content";
  if (/green-fee|reservationtype|bookingstatus|paymentmethod|course-restriction|admin_config|system_conf|config_timesheet|tools/.test(lower)) return "Tools/Settings";
  if (/visitor|golfnow|online tee|availability/.test(lower)) return "Visitor/Online Booking";
  if (/day\.php|timesheet|calendar|tee/.test(lower)) return "Timesheet";
  return "Other";
}

function riskFor(url = "", label = "") {
  const text = `${url} ${label}`;
  if (SETTING_URL.test(text)) return "settings-confirmation-required";
  if (HIGH_RISK_URL.test(text)) return "high-risk-write-ledger-required";
  if (MUTATING_LABEL.test(label)) return "write-ledger-required";
  return "read-or-navigation";
}

function urlSignature(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const normalizedPath = parsed.pathname
      .replace(/\/\d+(?=\/|$)/g, "/:id")
      .replace(/\/[0-9a-f]{8,}(?=\/|$)/gi, "/:token");
    const params = [...parsed.searchParams.entries()]
      .filter(([key, value]) => value !== "" && !/^_/.test(key))
      .map(([key, value]) => {
        const idParam = /(^id$|_id$|customer|member|booking|reservation|competition|entry|user|contact|payment|transaction|refund)/i.test(key);
        const normalizedValue = idParam && /^\d+$/.test(value)
          ? ":id"
          : value.replace(/\d{3,}/g, ":num");
        return `${key}=${normalizedValue}`;
      })
      .sort()
      .join("&");
    return `${parsed.host}${normalizedPath}${params ? `?${params}` : ""}`;
  } catch {
    return rawUrl.replace(/\d{3,}/g, ":num");
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return await import("playwright-core");
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

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  const userOk = await fillFirstVisible(page, ["input[name='username']", "input[name='login']", "input[type='text']", "input[type='email']"], USERNAME);
  const passOk = await fillFirstVisible(page, ["input[name='password']", "input[type='password']"], PASSWORD);
  if (!userOk || !passOk) throw new Error("Could not find BRS login fields.");
  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT_MS }).catch(() => {}),
    page.locator("button[type='submit'], input[type='submit']").first().click(),
  ]);
  await page.waitForURL((url) => !/\/login\/?$/i.test(url.pathname), { timeout: 8000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
}

async function pageSnapshot(page, source = "page") {
  const frameSnapshots = [];
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    try {
      frameSnapshots.push(await frame.evaluate((frameSource) => {
        const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const labelFor = (node) => {
          const id = node.getAttribute("id");
          const labelledBy = node.getAttribute("aria-labelledby");
          const labels = [];
          if (id) labels.push(document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || "");
          if (labelledBy) labels.push(...labelledBy.split(/\s+/).map((item) => document.getElementById(item)?.textContent || ""));
          labels.push(node.closest("label")?.textContent || "");
          labels.push(node.getAttribute("aria-label") || "");
          labels.push(node.getAttribute("placeholder") || "");
          labels.push(node.getAttribute("title") || node.getAttribute("data-original-title") || node.getAttribute("data-bs-original-title") || "");
          labels.push(node.getAttribute("name") || "");
          return clean(labels.find((item) => clean(item)) || "");
        };
        const textOf = (node) => clean(node?.innerText || node?.textContent || node?.value || "");
        const fieldInfo = (node) => ({
          label: labelFor(node),
          name: node.getAttribute("name") || "",
          id: node.getAttribute("id") || "",
          tagName: node.tagName,
          type: node.getAttribute("type") || node.tagName.toLowerCase(),
          required: Boolean(node.required || node.getAttribute("aria-required") === "true"),
          disabled: Boolean(node.disabled),
          readonly: Boolean(node.readOnly),
          placeholder: node.getAttribute("placeholder") || "",
          valueShape: node.getAttribute("value") ? "[value present]" : "",
          options: node.tagName === "SELECT"
            ? Array.from(node.querySelectorAll("option")).map((option) => clean(option.textContent || option.value)).filter(Boolean).slice(0, 250)
            : [],
        });
        const forms = Array.from(document.querySelectorAll("form")).map((form, index) => ({
          index,
          id: form.getAttribute("id") || "",
          name: form.getAttribute("name") || "",
          method: form.getAttribute("method") || "GET",
          action: form.action || form.getAttribute("action") || "",
          headings: Array.from(form.querySelectorAll("h1,h2,h3,legend")).map(textOf).filter(Boolean).slice(0, 30),
          fields: Array.from(form.querySelectorAll("input,select,textarea")).map(fieldInfo),
          buttons: Array.from(form.querySelectorAll("button,input[type='submit'],input[type='button'],a[role='button']")).map((node) => ({
            label: textOf(node) || node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("value") || "",
            type: node.getAttribute("type") || node.tagName,
            disabled: Boolean(node.disabled),
          })).filter((item) => item.label),
        }));
        const allFields = Array.from(document.querySelectorAll("input,select,textarea")).map(fieldInfo);
        const controls = Array.from(document.querySelectorAll("a[href],button,input[type='submit'],input[type='button'],[role='button']")).map((node, index) => ({
          index,
          label: textOf(node) || node.getAttribute("aria-label") || node.getAttribute("title") || node.getAttribute("value") || node.getAttribute("href") || "",
          tagName: node.tagName,
          type: node.getAttribute("type") || node.tagName,
          href: node.href || node.getAttribute("href") || "",
          title: node.getAttribute("title") || node.getAttribute("data-original-title") || node.getAttribute("data-bs-original-title") || "",
          disabled: Boolean(node.disabled),
        })).filter((item) => item.label || item.href);
        const tables = Array.from(document.querySelectorAll("table")).map((table, index) => ({
          index,
          caption: textOf(table.querySelector("caption")),
          headers: Array.from(table.querySelectorAll("th")).map(textOf).filter(Boolean).slice(0, 100),
          sampleRows: Array.from(table.querySelectorAll("tbody tr, tr")).slice(0, 6).map((row) => Array.from(row.querySelectorAll("td,th")).map(textOf).filter(Boolean).slice(0, 30)).filter((row) => row.length),
        })).filter((table) => table.headers.length || table.sampleRows.length);
        return {
          source: frameSource,
          frameUrl: location.href,
          title: document.title || "",
          headings: Array.from(document.querySelectorAll("h1,h2,h3,.page-title,.title")).map(textOf).filter(Boolean).slice(0, 60),
          breadcrumbs: Array.from(document.querySelectorAll(".breadcrumb,.breadcrumbs,nav[aria-label*='breadcrumb' i]")).map(textOf).filter(Boolean).slice(0, 10),
          forms,
          allFields,
          controls,
          tables,
          bodyTextSample: textOf(document.body).slice(0, 5000),
        };
      }, source));
    } catch {}
  }

  const merged = {
    url: page.url(),
    capturedAt: new Date().toISOString(),
    source,
    title: "",
    area: "",
    headings: [],
    breadcrumbs: [],
    forms: [],
    allFields: [],
    controls: [],
    tables: [],
    bodyTextSample: "",
    frames: frameSnapshots.length,
  };

  for (const frame of frameSnapshots) {
    merged.title ||= safeText(frame.title);
    merged.headings.push(...(frame.headings || []).map(safeText));
    merged.breadcrumbs.push(...(frame.breadcrumbs || []).map(safeText));
    merged.forms.push(...(frame.forms || []));
    merged.allFields.push(...(frame.allFields || []));
    merged.controls.push(...(frame.controls || []));
    merged.tables.push(...(frame.tables || []));
    merged.bodyTextSample ||= safeText(frame.bodyTextSample || "");
  }

  merged.headings = uniqueBy(merged.headings.filter(Boolean), (item) => item.toLowerCase(), 80);
  merged.breadcrumbs = uniqueBy(merged.breadcrumbs.filter(Boolean), (item) => item.toLowerCase(), 20);
  merged.forms = merged.forms.map((form) => ({
    ...form,
    action: absoluteUrl(form.action, page.url()),
    headings: uniqueBy((form.headings || []).map(safeText).filter(Boolean), (item) => item.toLowerCase(), 40),
    fields: sanitizeFields(form.fields || []),
    buttons: uniqueBy((form.buttons || []).map((button) => ({ ...button, label: safeText(button.label) })).filter((button) => button.label), (button) => `${button.label}:${button.type}`, 80),
  })).slice(0, 80);
  merged.allFields = sanitizeFields(merged.allFields).slice(0, 350);
  merged.controls = uniqueBy(merged.controls.map((control) => ({
    ...control,
    label: safeText(control.label),
    title: safeText(control.title),
    href: absoluteUrl(control.href, page.url()),
    risk: riskFor(control.href || page.url(), control.label),
  })).filter((control) => control.label || control.href), (control) => `${control.label}:${control.href}:${control.type}`, 450);
  merged.tables = merged.tables.map((table) => ({
    ...table,
    caption: safeText(table.caption),
    headers: uniqueBy((table.headers || []).map(safeText).filter(Boolean), (item) => item.toLowerCase(), 120),
    sampleRows: (table.sampleRows || []).map((row) => row.map(safeText).filter(Boolean).slice(0, 30)).filter((row) => row.length).slice(0, 6),
  })).slice(0, 60);
  merged.area = areaFromUrlAndText(merged.url, `${merged.title} ${merged.headings.join(" ")} ${merged.breadcrumbs.join(" ")}`);
  return merged;
}

function sanitizeFields(fields = []) {
  return uniqueBy(fields.map((field) => ({
    label: safeText(field.label),
    name: safeText(field.name),
    id: safeText(field.id),
    tagName: field.tagName || "",
    type: field.type || "",
    required: Boolean(field.required),
    disabled: Boolean(field.disabled),
    readonly: Boolean(field.readonly),
    placeholder: safeText(field.placeholder),
    valueShape: field.valueShape || "",
    options: uniqueBy((field.options || []).map(safeText).filter(Boolean), (item) => item.toLowerCase(), 250),
  })).filter((field) => field.label || field.name || field.id), (field) => `${field.label}:${field.name}:${field.type}`, 350);
}

function fieldValue(field = {}, pageUrl = "") {
  const label = `${field.label} ${field.name} ${field.id} ${field.placeholder}`.toLowerCase();
  if (/email/.test(label) || field.type === "email") return "codex-crawl-test@example.invalid";
  if (/phone|mobile|telephone/.test(label)) return "0000000000";
  if (/date|day/.test(label)) return "31/12/2029";
  if (/time/.test(label)) return "10:00";
  if (/amount|price|rate|fee|cost|total|balance/.test(label)) return "1";
  if (/postcode|zip/.test(label)) return "TEST 1AA";
  if (/first/.test(label)) return "Codex";
  if (/last|surname/.test(label)) return "Crawl";
  if (/company|group|contact|name|title|reference|description|message|notes?|reason|subject/.test(label)) return `${TEST_PREFIX} ${areaFromUrlAndText(pageUrl, label)}`;
  return `${TEST_PREFIX}`;
}

async function fillDraftFields(page, snapshot, ledger) {
  if (!FILL_DRAFTS) return;
  for (const field of snapshot.allFields.filter((item) => !item.disabled && !item.readonly).slice(0, 80)) {
    const selector = field.id ? `#${cssEscape(field.id)}` : field.name ? `[name="${cssEscapeAttr(field.name)}"]` : "";
    if (!selector || /hidden|submit|button|reset|file|password/i.test(field.type)) continue;
    const locator = page.locator(selector).first();
    try {
      if (/select/i.test(field.tagName) || /select/i.test(field.type)) {
        const options = (field.options || []).filter((option) => !/^select|choose|--|\s*$/.test(option.toLowerCase()));
        if (options[0]) await locator.selectOption({ label: options[0] }, { timeout: 800 }).catch(async () => locator.selectOption({ index: 1 }, { timeout: 800 }));
      } else if (/checkbox|radio/i.test(field.type)) {
        await locator.check({ timeout: 800 }).catch(() => {});
      } else {
        await locator.fill(fieldValue(field, snapshot.url), { timeout: 800 });
      }
      ledger.push({ timestamp: new Date().toISOString(), type: "draft-filled", url: snapshot.url, field: field.label || field.name, submitted: false });
    } catch {}
  }
}

function cssEscape(value = "") {
  return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function cssEscapeAttr(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function shouldSubmit(snapshot) {
  if (!SUBMIT_NON_SETTINGS) return false;
  if (snapshot.area === "Tools/Settings") return false;
  if (SETTING_URL.test(snapshot.url)) return false;
  return Boolean(snapshot.forms?.length) && !HIGH_RISK_URL.test(snapshot.url);
}

async function maybeSubmitNonSettings(page, snapshot, ledger) {
  if (!shouldSubmit(snapshot)) {
    if (snapshot.forms?.length && (snapshot.area === "Tools/Settings" || SETTING_URL.test(snapshot.url))) {
      ledger.push({
        timestamp: new Date().toISOString(),
        type: "settings-save-not-submitted",
        url: snapshot.url,
        area: snapshot.area,
        reason: "User requires confirmation before settings changes.",
        saveControls: snapshot.controls.filter((control) => MUTATING_LABEL.test(control.label)).map((control) => control.label).slice(0, 20),
      });
    }
    return null;
  }

  const submitControl = page.locator("button,input[type='submit'],input[type='button'],a[role='button']").filter({ hasText: /^(add|save|create|submit|confirm)$/i }).first();
  if (!await submitControl.count().catch(() => 0)) return null;
  const beforeUrl = page.url();
  await submitControl.click({ timeout: ACTION_TIMEOUT_MS }).catch(() => null);
  await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT_MS }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
  const after = await pageSnapshot(page, "post-submit");
  ledger.push({
    timestamp: new Date().toISOString(),
    type: "non-settings-submit-attempted",
    beforeUrl,
    afterUrl: page.url(),
    area: snapshot.area,
    testPrefix: TEST_PREFIX,
    rollbackStatus: "not-automatically-rolled-back",
    note: "Record is intentionally named as a Codex crawl test where creation succeeded; review after crawl.",
  });
  return after;
}

function enqueueLinksFromSnapshot(snapshot, queue, seen, parentUrl) {
  const candidates = [];
  for (const control of snapshot.controls || []) {
    if (!control.href || !allowedUrl(control.href)) continue;
    const text = `${control.label} ${control.title} ${control.href}`;
    if (BLOCKED_NAV.test(text)) continue;
    if (OPEN_FLOW_LABEL.test(text) || /operation=|stage=|add|edit|view|details|retrieve|report|config|setup|list|admin|payment|membership|green|course|booking|contact|user|tools|reports/i.test(control.href)) {
      candidates.push({ url: control.href, reason: `control:${control.label || control.href}`, parentUrl });
    }
  }
  for (const item of candidates) {
    if (!seen.has(item.url)) queue.push(item);
  }
}

async function clickRevealControls(page, snapshot, pages, ledger, outputDir) {
  const revealControls = (snapshot.controls || []).filter((control) => {
    if (control.href) return false;
    if (MUTATING_LABEL.test(control.label)) return false;
    return /help|\?|more|details|filter|search|show|view|expand|options/i.test(`${control.label} ${control.title}`);
  }).slice(0, MAX_ACTIONS_PER_PAGE);

  for (const control of revealControls) {
    const locator = page.locator("button,input[type='button'],[role='button'],a:not([href])").filter({ hasText: control.label }).first();
    if (!await locator.count().catch(() => 0)) continue;
    try {
      await locator.click({ timeout: ACTION_TIMEOUT_MS });
      await page.waitForTimeout(300);
      const modalSnapshot = await pageSnapshot(page, `clicked:${control.label}`);
      await recordPage(outputDir, pages, modalSnapshot);
      ledger.push({ timestamp: new Date().toISOString(), type: "non-mutating-click-captured", url: snapshot.url, label: control.label });
      await page.keyboard.press("Escape").catch(() => {});
    } catch {}
  }
}

function buildCoverage(pages, ledger) {
  const byArea = {};
  for (const page of pages) {
    const area = page.area || "Other";
    byArea[area] ||= {
      area,
      pages: 0,
      forms: 0,
      fields: 0,
      controls: 0,
      tables: 0,
      hasAddCreate: false,
      hasEdit: false,
      hasReportExport: false,
      hasSettingsConfirmationNeeded: false,
      urls: [],
    };
    const item = byArea[area];
    item.pages += 1;
    item.forms += page.forms?.length || 0;
    item.fields += page.allFields?.length || 0;
    item.controls += page.controls?.length || 0;
    item.tables += page.tables?.length || 0;
    item.hasAddCreate ||= (page.controls || []).some((control) => /\b(add|create|new)\b/i.test(control.label));
    item.hasEdit ||= (page.controls || []).some((control) => /\b(edit|update)\b/i.test(control.label));
    item.hasReportExport ||= (page.controls || []).some((control) => /\b(print|export|download|csv|report)\b/i.test(`${control.label} ${control.href}`));
    item.hasSettingsConfirmationNeeded ||= ledger.some((entry) => entry.type === "settings-save-not-submitted" && entry.area === area);
    if (item.urls.length < 50) item.urls.push(page.url);
  }
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      pages: pages.length,
      forms: pages.reduce((sum, page) => sum + (page.forms?.length || 0), 0),
      fields: pages.reduce((sum, page) => sum + (page.allFields?.length || 0), 0),
      controls: pages.reduce((sum, page) => sum + (page.controls?.length || 0), 0),
      tables: pages.reduce((sum, page) => sum + (page.tables?.length || 0), 0),
      mutationLedgerEntries: ledger.length,
    },
    byArea: Object.values(byArea).sort((a, b) => a.area.localeCompare(b.area)),
    settingsConfirmationNeeded: ledger.filter((entry) => entry.type === "settings-save-not-submitted"),
    submittedNonSettings: ledger.filter((entry) => entry.type === "non-settings-submit-attempted"),
  };
}

async function writeCrawlOutputs(outputDir, pages, ledger, stage) {
  await fs.mkdir(outputDir, { recursive: true });
  const redactedPages = pages.map((item, index) => ({ crawlIndex: index + 1, ...item }));
  const coverage = buildCoverage(redactedPages, ledger);
  const manifest = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    stage,
    complete: stage === "complete",
    clubId: CLUB_ID,
    baseUrl: BASE_URL,
    maxPages: MAX_PAGES,
    fillDrafts: FILL_DRAFTS,
    submitNonSettings: SUBMIT_NON_SETTINGS,
    testPrefix: TEST_PREFIX,
    outputs: {
      pageSnapshotsJsonl: path.join(outputDir, "page-snapshots.jsonl"),
      rawPages: path.join(outputDir, "raw-pages.json"),
      coverageMatrix: path.join(outputDir, "coverage-matrix.json"),
      mutationLedger: path.join(outputDir, "mutation-ledger.json"),
    },
  };
  await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  if (stage === "complete") {
    await fs.writeFile(path.join(outputDir, "raw-pages.json"), `${JSON.stringify({ ...manifest, pages: redactedPages }, null, 2)}\n`);
  }
  await fs.writeFile(path.join(outputDir, "coverage-matrix.json"), `${JSON.stringify(coverage, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "mutation-ledger.json"), `${JSON.stringify({ ...manifest, ledger }, null, 2)}\n`);
  return coverage;
}

async function recordPage(outputDir, pages, snapshot) {
  await fs.mkdir(outputDir, { recursive: true });
  const record = { crawlIndex: pages.length + 1, ...snapshot };
  pages.push(snapshot);
  await fs.appendFile(path.join(outputDir, "page-snapshots.jsonl"), `${JSON.stringify(record)}\n`);
}

async function main() {
  requireConfig();
  const outputDir = path.join(OUTPUT_ROOT, RUN_ID);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: HEADLESS, executablePath: BROWSER_EXECUTABLE_PATH || undefined });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  const pages = [];
  const ledger = [];
  const queue = SEED_PATHS.map((seed) => ({ url: absoluteUrl(seed), reason: `seed:${seed}`, parentUrl: null })).filter((item) => allowedUrl(item.url));
  const seen = new Set();
  const signatureCounts = new Map();

  try {
    await login(page);
    const landing = await pageSnapshot(page, "post-login");
    await recordPage(outputDir, pages, landing);
    enqueueLinksFromSnapshot(landing, queue, seen, page.url());
    await writeCrawlOutputs(outputDir, pages, ledger, "checkpoint-post-login");

    while (queue.length && seen.size < MAX_PAGES) {
      const next = queue.shift();
      if (!next?.url || seen.has(next.url) || !allowedUrl(next.url)) continue;
      const signature = urlSignature(next.url);
      const signatureCount = signatureCounts.get(signature) || 0;
      if (MAX_PER_URL_SIGNATURE > 0 && signatureCount >= MAX_PER_URL_SIGNATURE) {
        ledger.push({
          timestamp: new Date().toISOString(),
          type: "url-signature-limit-skipped",
          url: next.url,
          signature,
          limit: MAX_PER_URL_SIGNATURE,
          reason: next.reason,
        });
        continue;
      }
      signatureCounts.set(signature, signatureCount + 1);
      seen.add(next.url);
      console.log(`[deep-crawl] ${seen.size}/${MAX_PAGES} ${next.url}`);
      await page.goto(next.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch((error) => {
        ledger.push({ timestamp: new Date().toISOString(), type: "navigation-error", url: next.url, error: error.message });
      });
      await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
      if (!allowedUrl(page.url())) continue;
      const snapshot = await pageSnapshot(page, next.reason);
      await recordPage(outputDir, pages, snapshot);
      await fillDraftFields(page, snapshot, ledger);
      const submittedSnapshot = await maybeSubmitNonSettings(page, snapshot, ledger);
      if (submittedSnapshot) await recordPage(outputDir, pages, submittedSnapshot);
      await clickRevealControls(page, snapshot, pages, ledger, outputDir);
      enqueueLinksFromSnapshot(snapshot, queue, seen, next.url);
      if (CHECKPOINT_EVERY_PAGES > 0 && seen.size % CHECKPOINT_EVERY_PAGES === 0) {
        await writeCrawlOutputs(outputDir, pages, ledger, `checkpoint-${seen.size}`);
      }
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const coverage = await writeCrawlOutputs(outputDir, pages, ledger, "complete");
  console.log(JSON.stringify({
    outputDir,
    totals: coverage.totals,
    areas: coverage.byArea.map((item) => ({ area: item.area, pages: item.pages, forms: item.forms, fields: item.fields, controls: item.controls, tables: item.tables })),
    settingsConfirmationNeeded: coverage.settingsConfirmationNeeded.length,
    submittedNonSettings: coverage.submittedNonSettings.length,
  }, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("deep-crawl-brs-demo.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
