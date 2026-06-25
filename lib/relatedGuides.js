import { candidateGuideMatchesQuestion } from "./groundingGuards.js";

function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function titleFromHelpCenterUrl(url = "") {
  const match = String(url).match(/\/articles\/\d+-([^?#]+)/i);
  if (!match) return "";
  return decodeURIComponent(match[1])
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqueGuides(guides = [], limit = 4) {
  const seen = new Set();
  const output = [];
  for (const guide of guides) {
    const url = guide?.url || guide?.sourceUrl || "";
    const title = guide?.title || titleFromHelpCenterUrl(url);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    output.push({ title, url });
    if (output.length >= limit) break;
  }
  return output;
}

export function relatedGuidesForQuestion(message = "", candidateGuides = []) {
  const lower = normalise(message);
  const guides = [];

  if (/\b(move|transfer|reschedule|re-schedule|cut|paste)\b/.test(lower) && /\bbooking|tee time|teetime|tee sheet|teesheet|timesheet|buggy|buggies|service|hire item|trolley|caddie|caddy|club hire\b/.test(lower)) {
    guides.push({
      title: "Move part of a booking to another tee time",
      url: "https://help.brsgolf.com/hc/en-us/articles/360001644554-Move-part-of-a-booking-to-another-tee-time",
    });
  }

  if (/\bbuggy|buggies\b/.test(lower)) {
    guides.push({
      title: "Buggy Management",
      url: "https://help.brsgolf.com/hc/en-us/articles/360001478214-Buggy-Management",
    });
  }

  return uniqueGuides([
    ...guides,
    ...candidateGuides
      .filter((guide) => candidateGuideMatchesQuestion(message, guide))
      .map((guide) => ({
        title: guide.title,
        url: guide.url || guide.sourceUrl,
      })),
  ]);
}

export function formatRelatedGuides(guides = []) {
  const unique = uniqueGuides(guides);
  if (!unique.length) return "";
  return `Related guides:\n${unique.map((guide) => `- [${guide.title}](${guide.url})`).join("\n")}`;
}

export function appendRelatedGuides(reply = "", guides = []) {
  const formatted = formatRelatedGuides(guides);
  if (!formatted) return reply;
  return `${String(reply || "").trim()}\n\n${formatted}`;
}

export { titleFromHelpCenterUrl };
