const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
const WEEKENDS = ["sat", "sun"];
const ALLOWED_INTERVALS = new Set(Array.from({ length: 17 }, (_, index) => String(index + 4)));
export const TIMESHEET_ACTIONS = {
  CONFIGURE: "configure_timesheet",
};
const DAY_NAMES = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

// Timesheet-domain planner. It can grow to detect delete/copy/block actions;
// configure_timesheet is the first implemented action type.
function normaliseHour(hour, ampm) {
  let value = Number(hour);
  if (ampm?.toLowerCase() === "pm" && value < 12) value += 12;
  if (ampm?.toLowerCase() === "am" && value === 12) value = 0;
  return String(value).padStart(2, "0");
}

function parseTimeRange(text) {
  const value = String(text || "");
  const match = value.match(/(?:from|starting(?: at)?|start(?:ing)?(?: at)?)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|until|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
    || value.match(/(?:starting(?: at)?|start(?:ing)?(?: at)?)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and\s*)?(?:finishing|ending|finish|end)(?:\s*at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  const startAmPm = match[3] || match[6] || "";
  const endAmPm = match[6] || match[3] || "";
  return {
    firstHour: normaliseHour(match[1], startAmPm),
    firstMinute: match[2] || "00",
    lastHour: normaliseHour(match[4], endAmPm),
    lastMinute: match[5] || "00",
  };
}

function parseDays(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(only\s+)?weekdays?\b|\bmonday\s*(to|-)\s*friday\b|\bmon\s*(to|-)\s*fri\b/.test(lower)) return WEEKDAYS;
  if (/\b(only\s+)?weekends?\b|\bsaturday\s*(and|&|-|to)\s*sunday\b|\bsat\s*(and|&|-|to)\s*sun\b/.test(lower)) return WEEKENDS;
  if (/\bevery day\b|\ball days\b|\b7 days\b|\beach day\b|\bwhole week\b/.test(lower)) return DAYS;
  const found = [];
  const patterns = [
    ["mon", /\bmon(day)?\b/],
    ["tue", /\btue(sday)?\b/],
    ["wed", /\bwed(nesday)?\b/],
    ["thu", /\bthu(rsday)?\b/],
    ["fri", /\bfri(day)?\b/],
    ["sat", /\bsat(urday)?\b/],
    ["sun", /\bsun(day)?\b/],
  ];
  for (const [day, pattern] of patterns) {
    if (pattern.test(lower)) found.push(day);
  }
  return found;
}

function hasExplicitDays(text) {
  return parseDays(text).length > 0;
}

function parseSingleInterval(text) {
  return String(text || "").match(/(\d{1,2})\s*(?:minutes?|mins?)\b/i)?.[1] || "";
}

function parseAlternativeIntervals(text) {
  const lower = String(text || "").toLowerCase();
  const pair = lower.match(/(\d{1,2})\s*(?:and|&|\/|,)\s*(\d{1,2})\s*(?:minutes?|mins?)\b/);
  if (pair) return [pair[1], pair[2]];
  const numbers = [...lower.matchAll(/(\d{1,2})\s*(?:minutes?|mins?)\b/g)].map((match) => match[1]);
  return numbers.length >= 2 ? numbers.slice(0, 2) : [];
}

function parseIntervalForDayGroup(text, groupPattern) {
  const lower = String(text || "").toLowerCase();
  const group = lower.match(new RegExp(groupPattern));
  if (!group || group.index === undefined) return "";
  const before = lower.slice(0, group.index);
  const beforeIntervals = [...before.matchAll(/(\d{1,2})\s*(?:minutes?|mins?)\b/g)].map((match) => match[1]);
  if (beforeIntervals.length) return beforeIntervals[beforeIntervals.length - 1];
  const after = lower.slice(group.index + group[0].length);
  return after.match(/(\d{1,2})\s*(?:minutes?|mins?)\b/)?.[1] || "";
}

function createConfigureAction(base, overrides = {}) {
  return {
    action: TIMESHEET_ACTIONS.CONFIGURE,
    operation: "add_tee_times_same_interval",
    year: "",
    startMonth: "January",
    startDay: "1",
    endMonth: "December",
    endDay: "31",
    firstHour: "",
    firstMinute: "00",
    lastHour: "",
    lastMinute: "00",
    intervalMinutes: "",
    firstIntervalMinutes: "",
    secondIntervalMinutes: "",
    days: [],
    submit: true,
    ...base,
    ...overrides,
  };
}

function deterministicPlan(message) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  const year = lower.match(/\b(20\d{2})\b/)?.[1] || "";
  const timeRange = parseTimeRange(text) || {};
  const base = { year, ...timeRange };

  const weekdayInterval = parseIntervalForDayGroup(text, "(?:weekday|monday\\s*(?:to|-)\\s*friday|mon\\s*(?:to|-)\\s*fri)");
  const weekendInterval = parseIntervalForDayGroup(text, "(?:weekend|saturday\\s*(?:and|&|-|to)\\s*sunday|sat\\s*(?:and|&|-|to)\\s*sun)");
  if (weekdayInterval && weekendInterval) {
    return {
      actions: [
        createConfigureAction(base, { intervalMinutes: weekdayInterval, days: WEEKDAYS }),
        createConfigureAction(base, { intervalMinutes: weekendInterval, days: WEEKENDS }),
      ],
      missing: [],
      unsupported: [],
    };
  }

  const segmented = [...lower.matchAll(/(?:from|between)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|until|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?[^.\n]*?(\d{1,2})\s*(?:minutes?|mins?)/g)];
  if (segmented.length >= 2 && hasExplicitDays(text) && year) {
    return {
      actions: segmented.map((match) => {
        const startAmPm = match[3] || match[6] || "";
        const endAmPm = match[6] || match[3] || "";
        return createConfigureAction(base, {
          firstHour: normaliseHour(match[1], startAmPm),
          firstMinute: match[2] || "00",
          lastHour: normaliseHour(match[4], endAmPm),
          lastMinute: match[5] || "00",
          intervalMinutes: match[7],
          days: parseDays(text),
        });
      }),
      missing: [],
      unsupported: [],
    };
  }

  const alt = parseAlternativeIntervals(text);
  const wantsAlt = /alternative|alternate|alternating|different intervals|two intervals|first interval|second interval/.test(lower);
  const days = parseDays(text);
  if (wantsAlt || alt.length) {
    return {
      actions: [
        createConfigureAction(base, {
          operation: "add_tee_times_alternate_interval",
          firstIntervalMinutes: alt[0] || "",
          secondIntervalMinutes: alt[1] || "",
          days,
        }),
      ],
      missing: [],
      unsupported: [],
    };
  }

  return {
    actions: [
      createConfigureAction(base, {
        intervalMinutes: parseSingleInterval(text),
        days,
      }),
    ],
    missing: [],
    unsupported: [],
  };
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normaliseAction(action = {}) {
  const operation = action.operation === "add_tee_times_alternate_interval" ? "add_tee_times_alternate_interval" : "add_tee_times_same_interval";
  return createConfigureAction({}, {
    action: action.action || TIMESHEET_ACTIONS.CONFIGURE,
    operation,
    year: String(action.year || ""),
    startMonth: action.startMonth || "January",
    startDay: String(action.startDay || "1"),
    endMonth: action.endMonth || "December",
    endDay: String(action.endDay || "31"),
    firstHour: String(action.firstHour || "").padStart(action.firstHour ? 2 : 0, "0"),
    firstMinute: String(action.firstMinute || "00").padStart(2, "0"),
    lastHour: String(action.lastHour || "").padStart(action.lastHour ? 2 : 0, "0"),
    lastMinute: String(action.lastMinute || "00").padStart(2, "0"),
    intervalMinutes: String(action.intervalMinutes || ""),
    firstIntervalMinutes: String(action.firstIntervalMinutes || ""),
    secondIntervalMinutes: String(action.secondIntervalMinutes || ""),
    days: Array.isArray(action.days) ? action.days.map((day) => String(day).slice(0, 3).toLowerCase()).filter((day) => DAYS.includes(day)) : [],
    submit: action.submit !== false,
  });
}

function validatePlan(plan) {
  const actions = Array.isArray(plan?.actions) ? plan.actions.map(normaliseAction) : [];
  const missing = new Set(Array.isArray(plan?.missing) ? plan.missing : []);
  const unsupported = new Set(Array.isArray(plan?.unsupported) ? plan.unsupported : []);

  if (!actions.length) missing.add("timesheet configuration details");

  for (const action of actions) {
    if (action.action !== TIMESHEET_ACTIONS.CONFIGURE) {
      unsupported.add(`unsupported timesheet action: ${action.action || "unknown"}`);
      continue;
    }

    if (!action.year) missing.add("year");
    if (!action.firstHour || !action.lastHour) missing.add("start and end time");
    if (!action.days.length) missing.add("days of week");

    if (action.operation === "add_tee_times_alternate_interval") {
      if (!action.firstIntervalMinutes || !action.secondIntervalMinutes) missing.add("both alternative interval values");
      for (const interval of [action.firstIntervalMinutes, action.secondIntervalMinutes].filter(Boolean)) {
        if (!ALLOWED_INTERVALS.has(interval)) unsupported.add("intervals outside the supported 4 to 20 minute range");
      }
    } else {
      if (!action.intervalMinutes) missing.add("tee time interval");
      if (action.intervalMinutes && !ALLOWED_INTERVALS.has(action.intervalMinutes)) unsupported.add("interval outside the supported 4 to 20 minute range");
    }
  }

  return { actions, missing: [...missing], unsupported: [...unsupported] };
}

async function llmPlan(client, message) {
  if (!client?.responses?.create || !process.env.OPENAI_API_KEY) return null;
  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `Extract a BRS Configure Timesheet plan from the user's text.
Return only JSON with keys: actions, missing, unsupported.
Each action must use:
action: "configure_timesheet"
operation: "add_tee_times_same_interval" or "add_tee_times_alternate_interval"
year, startMonth, startDay, endMonth, endDay, firstHour, firstMinute, lastHour, lastMinute
intervalMinutes for same interval
firstIntervalMinutes and secondIntervalMinutes for BRS alternative intervals
days as lowercase: mon,tue,wed,thu,fri,sat,sun
submit: true

Rules:
- If only a year is given, use the full year: January 1 to December 31.
- Split requests with different intervals by day group into multiple same-interval actions.
- Split requests with different intervals by time block into multiple same-interval actions.
- Use BRS alternative interval operation only when the user asks for alternating/alternative intervals across the same selected range.
- If year, time range, days, or interval values are missing, list them in missing.
- Intervals must be 4 through 20 minutes; otherwise add unsupported.
- Do not invent a year, time range, days, or intervals.`,
        },
        { role: "user", content: message },
      ],
    });
    return extractJson(response.output_text);
  } catch (error) {
    console.error("Timesheet LLM planning failed, using deterministic planner:", error);
    return null;
  }
}

export async function planTimesheetRequest(client, message) {
  const llm = await llmPlan(client, message);
  const fallback = deterministicPlan(message);
  const llmValidated = llm?.actions ? validatePlan(llm) : null;
  const fallbackValidated = validatePlan(fallback);

  if (!llmValidated) return fallbackValidated;
  const llmIssueCount = llmValidated.missing.length + llmValidated.unsupported.length;
  const fallbackIssueCount = fallbackValidated.missing.length + fallbackValidated.unsupported.length;
  return fallbackIssueCount < llmIssueCount ? fallbackValidated : llmValidated;
}

export function formatTimesheetSummary(results = []) {
  return results.map((result, index) => {
    const prefix = results.length > 1 ? `Action ${index + 1}\n` : "";
    return `${prefix}${result.preview || ""}`.trim();
  }).filter(Boolean).join("\n\n");
}

function formatDayList(days = []) {
  if (days.length === 7) return "Every day";
  if (days.join(",") === WEEKDAYS.join(",")) return "Monday to Friday";
  if (days.join(",") === WEEKENDS.join(",")) return "Saturday and Sunday";
  return days.map((day) => DAY_NAMES[day] || day).join(", ");
}

function formatActionConfirmation(action, index, total) {
  const title = total > 1 ? `Change ${index + 1}` : "Configuration details";
  const intervalText = action.operation === "add_tee_times_alternate_interval"
    ? `Alternative intervals of ${action.firstIntervalMinutes} and ${action.secondIntervalMinutes} minutes`
    : `${action.intervalMinutes} minute intervals`;

  return [
    `**${title}**`,
    `- Dates: ${action.startDay} ${action.startMonth} ${action.year} to ${action.endDay} ${action.endMonth} ${action.year}`,
    `- Days: ${formatDayList(action.days)}`,
    `- Tee times: ${action.firstHour}:${action.firstMinute} to ${action.lastHour}:${action.lastMinute}`,
    `- Intervals: ${intervalText}`,
  ].join("\n");
}

export function formatTimesheetConfirmation(actions = []) {
  const countText = actions.length > 1 ? `${actions.length} timesheet changes have` : "The timesheet has";
  const details = actions.map((action, index) => formatActionConfirmation(action, index, actions.length)).join("\n\n");

  return [
    "**Timesheet Updated Successfully**",
    `${countText} been configured in BRS.`,
    details,
    "The update is now complete.",
  ].filter(Boolean).join("\n\n");
}
