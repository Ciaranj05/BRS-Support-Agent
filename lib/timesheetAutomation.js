const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_LABELS = {
  mon: /^mon(day)?$/i,
  tue: /^tue(sday)?$/i,
  wed: /^wed(nesday)?$/i,
  thu: /^thu(rsday)?$/i,
  fri: /^fri(day)?$/i,
  sat: /^sat(urday)?$/i,
  sun: /^sun(day)?$/i,
};

const ALLOWED_INTERVALS = new Set(Array.from({ length: 17 }, (_, index) => String(index + 4)));

function requireSetting(value, name) {
  if (!value) throw new Error(`Missing ${name}. Add it to .env before running timesheet automation.`);
  return value;
}

function normaliseClubUrl(value) {
  const url = requireSetting(value, "BRS_TIMESHEET_URL");
  return url.endsWith("/") ? url : `${url}/`;
}

function normaliseMonth(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+$/.test(text)) return MONTHS[Number(text) - 1] || text;
  return text;
}

function normaliseDay(value) {
  return String(value || "").slice(0, 3).toLowerCase();
}

function monthSelectValue(value) {
  const text = normaliseMonth(value);
  const index = MONTHS.findIndex((month) => month.toLowerCase().startsWith(text.toLowerCase().slice(0, 3)));
  return index >= 0 ? MONTHS[index].slice(0, 3) : text.slice(0, 3);
}

function daySelectValue(value) {
  return String(value || "").padStart(2, "0");
}

function normalisePayload(input = {}) {
  const days = Array.isArray(input.days) ? input.days.map(normaliseDay).filter(Boolean) : [];
  return {
    operation: String(input.operation || "").trim(),
    year: String(input.year || new Date().getFullYear()).trim(),
    startMonth: normaliseMonth(input.startMonth),
    startDay: String(input.startDay || "").trim(),
    endMonth: normaliseMonth(input.endMonth),
    endDay: String(input.endDay || "").trim(),
    firstHour: String(input.firstHour || "").trim(),
    firstMinute: String(input.firstMinute || "").padStart(2, "0").trim(),
    lastHour: String(input.lastHour || "").trim(),
    lastMinute: String(input.lastMinute || "").padStart(2, "0").trim(),
    intervalMinutes: String(input.intervalMinutes || "").trim(),
    firstIntervalMinutes: String(input.firstIntervalMinutes || "").trim(),
    secondIntervalMinutes: String(input.secondIntervalMinutes || "").trim(),
    days: [...new Set(days)],
    submit: input.submit === true,
  };
}

function validateRequest(request) {
  const missing = [];
  for (const key of ["year", "startMonth", "startDay", "endMonth", "endDay", "firstHour", "firstMinute", "lastHour", "lastMinute"]) {
    if (!request[key]) missing.push(key);
  }
  if (!request.days.length) missing.push("days");
  if (missing.length) {
    throw new Error(`Missing timesheet fields: ${missing.join(", ")}.`);
  }
  const intervals = [request.intervalMinutes, request.firstIntervalMinutes, request.secondIntervalMinutes].filter(Boolean);
  const invalidIntervals = intervals.filter((value) => !ALLOWED_INTERVALS.has(String(value)));
  if (invalidIntervals.length) {
    throw new Error("BRS supports tee time intervals from 4 to 20 minutes for this action.");
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is required for timesheet automation. Run npm install first.");
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

async function selectByLabelOrValue(select, desired) {
  const text = String(desired || "").trim();
  if (!text) return false;

  const options = await select.locator("option").evaluateAll((nodes) => nodes.map((node) => ({
    label: (node.textContent || "").trim(),
    value: node.value,
  })));
  const match = options.find((option) => option.label.toLowerCase() === text.toLowerCase())
    || options.find((option) => option.value.toLowerCase() === text.toLowerCase())
    || options.find((option) => option.label.toLowerCase().includes(text.toLowerCase()));

  if (!match) return false;
  await select.selectOption(match.value);
  return true;
}

async function selectByName(page, name, value) {
  const field = page.locator(`select[name="${name}"]`).first();
  if (!await field.count().catch(() => 0)) return false;
  return selectByLabelOrValue(field, value);
}

async function selectPreferredOperation(page, desired) {
  const operation = page.locator("select").first();
  if (!await operation.count().catch(() => 0)) return false;
  if (desired && await selectByLabelOrValue(operation, desired)) return true;

  const options = await operation.locator("option").evaluateAll((nodes) => nodes.map((node) => ({
    label: (node.textContent || "").trim(),
    value: node.value,
  })));
  const preferred = options.find((option) => /configure|create|generate|set up|setup|timesheet|tee/i.test(`${option.label} ${option.value}`) && option.value)
    || options.find((option) => option.value);
  if (!preferred) return false;
  await operation.selectOption(preferred.value);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(300).catch(() => {});
  return true;
}

async function selectNearLabel(page, labelPattern, value) {
  const labels = page.locator("label, td, th, div, span").filter({ hasText: labelPattern });
  const count = Math.min(await labels.count().catch(() => 0), 25);

  for (let index = 0; index < count; index += 1) {
    const label = labels.nth(index);
    const localSelect = label.locator("select").first();
    if (await localSelect.count().catch(() => 0)) {
      if (await selectByLabelOrValue(localSelect, value)) return true;
    }

    const nearbySelect = label.locator("xpath=following::select[1]").first();
    if (await nearbySelect.count().catch(() => 0)) {
      if (await selectByLabelOrValue(nearbySelect, value)) return true;
    }
  }

  return false;
}

async function fillInputNearLabel(page, labelPattern, value) {
  const labels = page.locator("label, td, th, div, span").filter({ hasText: labelPattern });
  const count = Math.min(await labels.count().catch(() => 0), 25);

  for (let index = 0; index < count; index += 1) {
    const label = labels.nth(index);
    const localInput = label.locator("input:not([type='checkbox']):not([type='radio'])").first();
    if (await localInput.count().catch(() => 0)) {
      await localInput.fill(String(value));
      return true;
    }

    const nearbyInput = label.locator("xpath=following::input[not(@type='checkbox') and not(@type='radio')][1]").first();
    if (await nearbyInput.count().catch(() => 0)) {
      await nearbyInput.fill(String(value));
      return true;
    }
  }

  return false;
}

async function selectByIndexFallback(page, values, startIndex = 0) {
  const selects = page.locator("select");
  const count = await selects.count().catch(() => 0);
  if (count < values.length + startIndex) return false;

  for (let index = 0; index < values.length; index += 1) {
    const ok = await selectByLabelOrValue(selects.nth(index + startIndex), values[index]);
    if (!ok) return false;
  }
  return true;
}

async function checkDay(page, day) {
  const exactName = {
    mon: "Setup_Mon",
    tue: "Setup_Tue",
    wed: "Setup_Wed",
    thu: "Setup_Thu",
    fri: "Setup_Fri",
    sat: "Setup_Sat",
    sun: "Setup_Sun",
  }[day];
  if (exactName) {
    const exact = page.locator(`input[type="checkbox"][name="${exactName}"]`).first();
    if (await exact.count().catch(() => 0)) {
      await exact.check();
      return true;
    }
  }

  const pattern = DAY_LABELS[day];
  if (!pattern) return false;

  const labelled = page.getByLabel(pattern).first();
  if (await labelled.count().catch(() => 0)) {
    await labelled.check();
    return true;
  }

  const text = page.locator("label, td, span, div").filter({ hasText: pattern }).first();
  const checkbox = text.locator("input[type='checkbox']").first();
  if (await checkbox.count().catch(() => 0)) {
    await checkbox.check();
    return true;
  }

  const nearbyCheckbox = text.locator("xpath=preceding::input[@type='checkbox'][1]").first();
  if (await nearbyCheckbox.count().catch(() => 0)) {
    await nearbyCheckbox.check();
    return true;
  }

  return false;
}

async function login(page, { clubUrl, username, password }) {
  await page.goto(new URL("login", clubUrl).toString(), { waitUntil: "domcontentloaded" });
  const filledUser = await fillFirstVisible(page, ["input[name='username']", "input[name='login']", "input[type='text']", "input[type='email']"], username);
  const filledPassword = await fillFirstVisible(page, ["input[name='password']", "input[type='password']"], password);
  if (!filledUser || !filledPassword) throw new Error("Could not find BRS login fields.");

  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    page.locator("button[type='submit'], input[type='submit']").first().click(),
  ]);
}

async function openConfigureTimesheet(page, clubUrl) {
  const directCandidates = [
    "config_timesheet.php",
    "configure_timesheet.php",
    "configure_timesheet",
    "admin_configure_timesheet.php",
    "timesheet_config.php",
  ];

  for (const path of directCandidates) {
    await page.goto(new URL(path, clubUrl).toString(), { waitUntil: "domcontentloaded" }).catch(() => null);
    if (await page.getByText(/configure timesheet/i).count().catch(() => 0)) return;
  }

  await page.goto(clubUrl, { waitUntil: "domcontentloaded" }).catch(() => null);

  const tools = page.getByText(/^tools$/i).first();
  if (await tools.count().catch(() => 0)) {
    await tools.click().catch(() => {});
  }

  const configureLink = page.getByRole("link", { name: /configure timesheet/i }).first();
  if (await configureLink.count().catch(() => 0)) {
    await configureLink.click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    return;
  }

  throw new Error("Could not open Tools > Configure Timesheet.");
}

async function fillTimesheetForm(page, request) {
  await selectPreferredOperation(page, request.operation);

  const exactSelections = [
    ["Year", request.year],
    ["Start_Month", monthSelectValue(request.startMonth)],
    ["Start_Day", daySelectValue(request.startDay)],
    ["End_Month", monthSelectValue(request.endMonth)],
    ["End_Day", daySelectValue(request.endDay)],
    ["TeeTimeIntervalMins", request.intervalMinutes],
    ["FirstTeeTimeIntervalMins", request.firstIntervalMinutes],
    ["SecondTeeTimeIntervalMins", request.secondIntervalMinutes],
    ["First_Tee_Time_Hour", request.firstHour],
    ["First_Tee_Time_Minute", request.firstMinute],
    ["Last_Tee_Time_Hour", request.lastHour],
    ["Last_Tee_Time_Minute", request.lastMinute],
  ].filter(([, value]) => value);

  const exactResults = [];
  for (const [name, value] of exactSelections) {
    exactResults.push(await selectByName(page, name, value));
  }
  if (exactResults.every(Boolean)) {
    const unchecked = [];
    for (const day of request.days) {
      if (!await checkDay(page, day)) unchecked.push(day);
    }
    if (unchecked.length) throw new Error(`Could not find day checkboxes: ${unchecked.join(", ")}.`);
    return;
  }

  const labelledValues = [
    [/year/i, request.year],
    [/start month/i, request.startMonth],
    [/start day/i, request.startDay],
    [/end month/i, request.endMonth],
    [/end day/i, request.endDay],
    [/first tee time hour/i, request.firstHour],
    [/first tee time minute/i, request.firstMinute],
    [/last tee time hour/i, request.lastHour],
    [/last tee time minute/i, request.lastMinute],
  ];

  const usedLabelMatching = [];
  for (const [label, value] of labelledValues) {
    usedLabelMatching.push(await selectNearLabel(page, label, value));
  }

  if (usedLabelMatching.some((matched) => !matched)) {
    await selectByIndexFallback(page, labelledValues.map(([, value]) => value), 1);
  }

  const unchecked = [];
  for (const day of request.days) {
    if (!await checkDay(page, day)) unchecked.push(day);
  }
  if (unchecked.length) throw new Error(`Could not find day checkboxes: ${unchecked.join(", ")}.`);

  if (request.intervalMinutes) {
    await selectNearLabel(page, /interval|minute gap|time gap|spacing/i, request.intervalMinutes)
      || await fillInputNearLabel(page, /interval|minute gap|time gap|spacing/i, request.intervalMinutes);
  }
  if (request.firstIntervalMinutes) await selectByName(page, "FirstTeeTimeIntervalMins", request.firstIntervalMinutes);
  if (request.secondIntervalMinutes) await selectByName(page, "SecondTeeTimeIntervalMins", request.secondIntervalMinutes);
}

function previewText(request) {
  const intervalText = request.firstIntervalMinutes && request.secondIntervalMinutes
    ? `Alternative intervals: ${request.firstIntervalMinutes} and ${request.secondIntervalMinutes} minutes`
    : request.intervalMinutes ? `Interval: ${request.intervalMinutes} minutes` : null;
  return [
    `Operation: ${request.operation || "Auto-select configure timesheet operation"}`,
    `Dates: ${request.startDay} ${request.startMonth} ${request.year} to ${request.endDay} ${request.endMonth} ${request.year}`,
    `Tee times: ${request.firstHour}:${request.firstMinute} to ${request.lastHour}:${request.lastMinute}`,
    intervalText,
    `Days: ${request.days.map((day) => day[0].toUpperCase() + day.slice(1)).join(", ")}`,
  ].filter(Boolean).join("\n");
}

export async function configureTimesheet(input = {}) {
  const request = normalisePayload(input);
  validateRequest(request);

  const clubUrl = normaliseClubUrl(process.env.BRS_TIMESHEET_URL || process.env.BRS_CLUB_URL);
  const username = requireSetting(process.env.BRS_TIMESHEET_USERNAME || process.env.BRS_USERNAME, "BRS_TIMESHEET_USERNAME");
  const password = requireSetting(process.env.BRS_TIMESHEET_PASSWORD || process.env.BRS_PASSWORD, "BRS_TIMESHEET_PASSWORD");
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: process.env.BRS_AUTOMATION_HEADLESS !== "false" });

  try {
    const page = await browser.newPage();
    await login(page, { clubUrl, username, password });
    await openConfigureTimesheet(page, clubUrl);
    await fillTimesheetForm(page, request);

    if (request.submit) {
      await Promise.all([
        page.waitForLoadState("domcontentloaded").catch(() => {}),
        page.getByRole("button", { name: /configure the timesheet/i }).click(),
      ]);
    }

    return {
      ok: true,
      submitted: request.submit,
      url: page.url(),
      preview: previewText(request),
      message: request.submit
        ? "Timesheet configuration was submitted."
        : "Timesheet form was filled but not submitted.",
    };
  } finally {
    await browser.close();
  }
}
