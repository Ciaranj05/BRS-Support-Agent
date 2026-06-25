import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { hasIncompleteWorkflowEvidence } from "../lib/groundingGuards.js";
import { keepReusableProductText, redactText } from "../lib/knowledgeRedaction.js";

dotenv.config();

const BASE_URL = process.env.BRS_BASE_URL || "https://www.brsgolf.com";
const CLUB_ID = process.env.BRS_CLUB_ID || process.env.BRS_DEMO_CLUB_ID || "amysgolfclub";
const USERNAME = process.env.BRS_USERNAME || process.env.BRS_DEMO_USERNAME;
const PASSWORD = process.env.BRS_PASSWORD || process.env.BRS_DEMO_PASSWORD;
const MAX_PAGES = Number(process.env.BRS_RECRAWL_MAX_PAGES || 120);
const OUTPUT_PATH = process.env.BRS_RECRAWL_OUTPUT_PATH || path.join("knowledge", "workflows", "brs-quarantine-recrawl-2026-06-25.json");
const DEBUG = process.env.BRS_RECRAWL_DEBUG === "true";

const BLOCKED_URL = /logout|sign-?out|delete|remove|cancel|refund|checkout|payment.*submit|\[id\]|%5Bid%5D/i;
const GOOD_URL = /dashboard|timesheet|messages|facilities|contacts|membership|users|reports|search|tools|competition|booking|green|configuration|email|text|template|payment|vat|club|course|member|service|catering|reservation|status|rules|upload|gdpr|legal|buggy/i;

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  ingest(headers) {
    const raw = headers.getSetCookie ? headers.getSetCookie() : [];
    const fallback = headers.get("set-cookie");
    const cookieLines = raw.length ? raw : fallback ? String(fallback).split(/,(?=\s*[^;,=\s]+=[^;,]+)/) : [];
    if (DEBUG && cookieLines.length) console.log(`[recrawl:cookies] ${cookieLines.join(" || ")}`);
    for (const line of cookieLines) {
      const segments = String(line).split(";").map((segment) => segment.trim());
      const [pair] = segments;
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const cookiePath = segments.find((segment) => /^path=/i.test(segment))?.slice(5) || "/";
      const key = `${name};${cookiePath}`;
      if (!value || /^deleted$/i.test(value)) {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, { name, value, path: cookiePath });
      }
    }
  }

  header(url = `${BASE_URL}/${CLUB_ID}/`) {
    const pathname = new URL(url).pathname || "/";
    return [...this.cookies.values()]
      .filter((cookie) => pathname.startsWith(cookie.path))
      .sort((a, b) => b.path.length - a.path.length)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }
}

function assertConfig() {
  if (!USERNAME || !PASSWORD) throw new Error("Set BRS_USERNAME and BRS_PASSWORD before recrawling.");
}

function absoluteUrl(value = "", base = `${BASE_URL}/${CLUB_ID}/`) {
  try {
    const parsed = new URL(decodeEntities(value), base);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return "";
  }
}

function sameClub(url = "") {
  try {
    const parsed = new URL(url);
    const base = new URL(BASE_URL);
    return parsed.hostname === base.hostname && parsed.pathname.toLowerCase().startsWith(`/${CLUB_ID.toLowerCase()}`);
  } catch {
    return false;
  }
}

function decodeEntities(value = "") {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function stripTags(value = "") {
  return decodeEntities(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function attr(tag = "", name = "") {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return decodeEntities(match?.[1] || match?.[2] || match?.[3] || "");
}

function unique(values = [], limit = 80) {
  const seen = new Set();
  const output = [];
  for (const raw of values.map((value) => keepReusableProductText(redactText(String(value || "").replace(/\s+/g, " ").trim()))).filter(Boolean)) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(raw);
    if (output.length >= limit) break;
  }
  return output;
}

function parseTitle(html = "") {
  return stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function parseHeadings(html = "") {
  return unique([...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((match) => stripTags(match[1])), 12);
}

function meaningfulTitle(html = "") {
  const headings = parseHeadings(html);
  return headings.find((heading) => /[A-Za-z]{3}/.test(heading) && !/^\d+%$/.test(heading) && !/^\d+\s+(Bookings|Golfers)$/i.test(heading))
    || parseTitle(html)
    || "BRS page";
}

function sanitiseSourceUrl(url = "") {
  const parsed = new URL(url);
  const sensitiveParams = new Set([
    "_id",
    "copy_record_id",
    "customer_id",
    "edit_record_id",
    "emailheadid",
    "id",
    "username",
  ]);
  for (const key of [...parsed.searchParams.keys()]) {
    if (sensitiveParams.has(key) || /(^|_)id$/i.test(key)) parsed.searchParams.set(key, "[id]");
  }
  parsed.pathname = parsed.pathname
    .replace(/\/po_[A-Za-z0-9_]+/g, "/[payout-id]")
    .replace(/\/\d+(?=\/|$)/g, "/[id]");
  return parsed.href;
}

function sanitisePathText(url = "") {
  return new URL(sanitiseSourceUrl(url)).pathname
    .replace(`/${CLUB_ID}/`, "")
    .replace(/%5Bid%5D/gi, "id")
    .replace(/[_.-]+/g, " ");
}

function parseLinks(html = "", baseUrl = "") {
  return [...html.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: absoluteUrl(match[1] || match[2] || match[3] || "", baseUrl),
      text: stripTags(match[4]),
    }))
    .filter((link) => link.href && sameClub(link.href) && !BLOCKED_URL.test(`${link.href} ${link.text}`) && GOOD_URL.test(`${link.href} ${link.text}`));
}

function parseLabels(html = "") {
  return unique([...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/gi)].map((match) => stripTags(match[1])), 80);
}

function parseTableHeaders(html = "") {
  return unique([...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => stripTags(match[1])), 80);
}

function parseInputs(html = "") {
  const labelsByFor = new Map([...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)].map((match) => [attr(match[1], "for"), stripTags(match[2])]).filter(([id, label]) => id && label));
  const controls = [];

  for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>([\s\S]*?)(?:<\/\1>)?/gi)) {
    const tagName = match[1].toLowerCase();
    const tag = match[2] || "";
    const type = attr(tag, "type") || tagName;
    if (/hidden|csrf|token/i.test(`${type} ${attr(tag, "name")}`)) continue;
    const label = labelsByFor.get(attr(tag, "id"))
      || attr(tag, "aria-label")
      || attr(tag, "placeholder")
      || attr(tag, "title")
      || attr(tag, "name")
      || type;
    const options = tagName === "select"
      ? unique([...match[3].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((option) => stripTags(option[1])), 60)
      : [];
    controls.push({ label, type, options });
  }

  return unique(controls.map((control) => JSON.stringify({ ...control, label: keepReusableProductText(redactText(control.label)) })), 120)
    .map((item) => JSON.parse(item))
    .filter((control) => control.label);
}

function parseActions(html = "", baseUrl = "") {
  const actions = [
    ...[...html.matchAll(/<(button)\b([^>]*)>([\s\S]*?)<\/button>/gi)].map((match) => ({ tag: match[2], text: stripTags(match[3]) })),
    ...[...html.matchAll(/<input\b([^>]*)>/gi)].filter((match) => /submit|button|reset/i.test(attr(match[1], "type"))).map((match) => ({ tag: match[1], text: attr(match[1], "value") })),
    ...parseLinks(html, baseUrl).map((link) => ({ tag: "", text: link.text, href: link.href })),
  ];
  return unique(actions.map((action) => action.text || attr(action.tag, "aria-label") || attr(action.tag, "title")), 100)
    .map((label) => ({ label, purpose: inferPurpose(label) }));
}

function inferPurpose(label = "") {
  if (/download|export|csv|excel/i.test(label)) return "download/export";
  if (/print/i.test(label)) return "print";
  if (/find|search|filter|show|view|run/i.test(label)) return "filter/search";
  if (/save|update|create|add|submit|send/i.test(label)) return "save/submit";
  if (/clear|reset/i.test(label)) return "reset";
  return "action";
}

function pageLooksBad({ title = "", headings = [], text = "" } = {}) {
  const combined = `${title} ${headings.join(" ")} ${text}`;
  const hasAuthenticatedPageCue = /\b(Bookings|Dashboard|Timesheet|Members|Reports|Tools|Messages|Contacts|Users)\b/i.test(combined);
  if (hasAuthenticatedPageCue) return false;
  if (/access denied|internal server error/i.test(combined)) return true;
  if (/signed out because|forgot password|you may only login/i.test(combined)) return true;
  return /\b(Sign In|Username|Password)\b/i.test(combined);
}

function buildEntry({ url, html }) {
  const title = redactText(meaningfulTitle(html));
  const headings = parseHeadings(html);
  const labels = parseLabels(html);
  const controls = parseInputs(html);
  const actions = parseActions(html, url);
  const tableHeaders = parseTableHeaders(html);
  const text = unique([stripTags(html)], 1)[0] || "";
  if (pageLooksBad({ title, headings, text })) return { skipped: true, reason: "login/error page", title, headings };
  if (!controls.length && !actions.length && !tableHeaders.length) return { skipped: true, reason: "no confirmed controls/actions/table", title, headings };

  const fieldLabels = unique([...labels, ...controls.map((control) => control.label)], 18);
  const actionLabels = unique(actions.map((action) => action.label), 14);
  const tableLabels = unique(tableHeaders, 12);
  const pathName = keepReusableProductText(sanitisePathText(url)) || title;
  const steps = [
    `Open "${title}" from ${pathName}.`,
    fieldLabels.length ? `Use the confirmed fields/filters on this screen: ${fieldLabels.map((label) => `"${label}"`).join(", ")}.` : null,
    actionLabels.length ? `Use the confirmed actions on this screen as needed: ${actionLabels.map((label) => `"${label}"`).join(", ")}.` : null,
    tableLabels.length ? `Check the result table columns: ${tableLabels.map((label) => `"${label}"`).join(", ")}.` : null,
  ].filter(Boolean);

  const entry = {
    id: `brs-recrawl:${crypto.createHash("sha256").update(url).digest("hex").slice(0, 16)}`,
    sourceType: "brs-system-workflow",
    clubScope: "template",
    title: `${title} confirmed BRS page evidence`,
    area: title,
    workflow: title,
    navigationPath: title,
    sourceUrl: sanitiseSourceUrl(url),
    purpose: headings.slice(0, 6).join(" | ") || title,
    steps,
    controls,
    actions,
    tableHeaders,
    pageEvidence: { headings },
    containsClubSpecificData: false,
    confidence: "needs-review",
    tags: ["quarantine-recrawl", "http-session-confirmed"],
    lastObservedAt: new Date().toISOString(),
  };
  return hasIncompleteWorkflowEvidence(entry) ? { skipped: true, reason: "incomplete workflow evidence guard", title, headings } : entry;
}

async function request(jar, url, options = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    ...options,
    headers: {
      "user-agent": "BRS-Support-Agent-Recrawl/1.0",
      "sec-fetch-site": "same-origin",
      "accept": "text/html,application/xhtml+xml",
      "cookie": jar.header(url),
      ...(options.headers || {}),
    },
  });
  jar.ingest(response.headers);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (location) return request(jar, absoluteUrl(location, url), { method: "GET" });
  }
  return response;
}

async function login(jar) {
  const loginUrl = `${BASE_URL}/${CLUB_ID}/login`;
  const response = await request(jar, loginUrl);
  const html = await response.text();
  if (DEBUG) console.log(`[recrawl:login:get] status=${response.status} title="${parseTitle(html)}" cookies="${jar.header()}"`);
  const formTag = html.match(/<form\b([^>]*)>/i)?.[1] || "";
  const action = absoluteUrl(attr(formTag, "action") || loginUrl, loginUrl);
  const fields = new URLSearchParams();
  for (const match of html.matchAll(/<input\b([^>]*)>/gi)) {
    const name = attr(match[1], "name");
    if (!name) continue;
    fields.set(name, attr(match[1], "value"));
  }
  fields.set("_username", USERNAME);
  fields.set("_password", PASSWORD);
  fields.set("username", USERNAME);
  fields.set("password", PASSWORD);
  fields.set("SUBMIT", "Sign In");
  const posted = await request(jar, action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "referer": loginUrl },
    body: fields.toString(),
  });
  const postedHtml = await posted.text();
  if (DEBUG) {
    console.log(`[recrawl:login:post] status=${posted.status} title="${parseTitle(postedHtml)}" headings="${parseHeadings(postedHtml).slice(0, 4).join(" | ")}" cookies="${jar.header()}"`);
  }
  if (/Sign In|Password:|Username:/i.test(stripTags(postedHtml)) && !/Dashboard|Timesheet|Sign Out/i.test(postedHtml)) {
    throw new Error("BRS login did not reach an authenticated page.");
  }
  return postedHtml;
}

async function collectSourceUrls() {
  const dirs = [path.join("knowledge", "system"), path.join("knowledge", "workflows")];
  const urls = new Set([`${BASE_URL}/${CLUB_ID}/`]);
  for (const dir of dirs) {
    const files = await fs.readdir(dir, { recursive: true }).catch(() => []);
    for (const file of files.filter((name) => String(name).endsWith(".json"))) {
      const raw = await fs.readFile(path.join(dir, file), "utf8").catch(() => "");
      if (path.normalize(path.join(dir, file)) === path.normalize(OUTPUT_PATH)) continue;
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed.entries) ? parsed.entries : Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (entry.sourceUrl && sameClub(entry.sourceUrl) && !BLOCKED_URL.test(entry.sourceUrl)) urls.add(entry.sourceUrl);
      }
    }
  }
  return [...urls].filter((url) => GOOD_URL.test(url)).slice(0, MAX_PAGES);
}

async function main() {
  assertConfig();
  const jar = new CookieJar();
  const firstHtml = await login(jar);
  const seedUrls = await collectSourceUrls();
  const queue = [...new Set([`${BASE_URL}/${CLUB_ID}/`, ...parseLinks(firstHtml, `${BASE_URL}/${CLUB_ID}/`).map((link) => link.href), ...seedUrls])];
  const seen = new Set();
  const routeCounts = new Map();
  const entries = [];

  while (queue.length && seen.size < MAX_PAGES) {
    const url = queue.shift();
    if (!url || seen.has(url) || !sameClub(url) || BLOCKED_URL.test(url)) continue;
    const pathname = new URL(url).pathname;
    const routeLimit = /\/stt\.php$/i.test(pathname) ? 3 : /\/day\.php$/i.test(pathname) || /\/fac_day\.php$/i.test(pathname) ? 12 : 20;
    const routeCount = routeCounts.get(pathname) || 0;
    if (routeCount >= routeLimit) continue;
    routeCounts.set(pathname, routeCount + 1);
    seen.add(url);
    const response = await request(jar, url);
    if (!response.ok) continue;
    const html = await response.text();
    for (const link of parseLinks(html, url)) if (!seen.has(link.href) && queue.length < MAX_PAGES * 3) queue.push(link.href);
    const result = buildEntry({ url, html });
    if (result && !result.skipped) entries.push(result);
    const headingText = result?.skipped && result.headings?.length ? ` headings=${JSON.stringify(result.headings.slice(0, 4))}` : "";
    const reason = result?.skipped ? ` (${result.reason}: ${result.title}${headingText})` : "";
    console.log(`[recrawl] ${seen.size}/${MAX_PAGES} ${result && !result.skipped ? "captured" : "skipped"}${DEBUG ? reason : ""} ${url}`);
  }

  const uniqueEntries = [...new Map(entries.map((entry) => [entry.id, entry])).values()];
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), sourceType: "brs-system-workflow", entries: uniqueEntries }, null, 2)}\n`);
  console.log(`Wrote ${uniqueEntries.length} confirmed recrawl entries to ${OUTPUT_PATH}`);
}

if (process.argv[1] && process.argv[1].endsWith("recrawl-quarantined-brs-workflows.js")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
