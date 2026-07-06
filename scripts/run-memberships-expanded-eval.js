import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ENDPOINT = process.env.BRS_CHAT_ENDPOINT || "https://brs-support-agent.vercel.app/api/chat";
const SOURCE_LABEL = process.env.SOURCE_LABEL || "live-memberships-expanded";
const REQUEST_DELAY_MS = Number(process.env.EVAL_REQUEST_DELAY_MS || 300);
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY || 4);
const MAX_ATTEMPTS = Number(process.env.EVAL_MAX_ATTEMPTS || 5);
const RETRY_BASE_MS = Number(process.env.EVAL_RETRY_BASE_MS || 10000);
const WRITE_OUTPUT = process.argv.includes("--write");

function rx(value) {
  return value instanceof RegExp ? value : new RegExp(value, "i");
}

function addProfile(cases, profile) {
  const {
    id,
    area = "Memberships",
    style = "mixed",
    risk = "normal",
    weight = 1,
    variants,
    required = [],
    forbidden = [],
    allowClarification = false,
    allowEscalation = false,
  } = profile;

  variants.forEach((question, index) => {
    cases.push({
      id: `${id}-${String(index + 1).padStart(2, "0")}`,
      area,
      style,
      risk,
      weight,
      question,
      required: required.map((item) => rx(item)),
      forbidden: forbidden.map((item) => rx(item)),
      allowClarification,
      allowEscalation,
    });
  });
}

function buildCases() {
  const cases = [];

  addProfile(cases, {
    id: "MEM-create-profile",
    style: "profile-create",
    weight: 1.5,
    variants: [
      "How do I add a new member profile?",
      "Need create membership record for a joiner, not staff login.",
      "New member joined today, where put address, email and category?",
      "add membr profile poor spelling pls",
      "Pro shop says make a member account; do they use Users or Memberships?",
    ],
    required: [/Memberships|Member/i, /Create|Add|New/i, /profile|record|member/i, /Membership Type|category|contact|address|email|save|check/i],
    forbidden: [/Users > Add|Create a New User|staff user only/i],
  });

  addProfile(cases, {
    id: "MEM-find-edit",
    style: "profile-edit",
    weight: 1.2,
    variants: [
      "Find a member by mobile number and update their email.",
      "Member moved house, where edit address?",
      "Only have surname and postcode, how find the member record?",
      "Change a member's contact details, what screen?",
      "Busy desk: lady says her app email is wrong, where do I start?",
    ],
    required: [/Memberships|Member/i, /Search|find|member record|profile/i, /email|mobile|postcode|address|contact/i, /Save|Update|check|verify/i],
    forbidden: [/Contacts only|Users only/i],
  });

  addProfile(cases, {
    id: "MEM-category-type",
    style: "membership-type",
    weight: 1.4,
    variants: [
      "Change a member from intermediate to full member.",
      "Wrong membership category means wrong booking access, where update?",
      "5-day member upgraded to 7-day, what should staff check?",
      "How do I create a new membership type for juniors?",
      "Need rename membership category shown on member profiles.",
    ],
    required: [/Membership Type|Membership Types|category|member type/i, /Memberships|Tools/i, /member|profile|category|type/i, /booking access|fees|bill|check|update|save/i],
    forbidden: [/User Group only|staff permission only/i],
  });

  addProfile(cases, {
    id: "MEM-login-access",
    style: "member-access",
    risk: "high",
    weight: 1.8,
    variants: [
      "New joiner can't log into the member app, where check?",
      "Member registration email not working, what controls access?",
      "Member says app disabled after joining today.",
      "How do I enable online booking access for a member?",
      "Angry member forgot password; can staff fix their BRS member login?",
    ],
    required: [/Member|Memberships|member app|login|registration|password/i, /enable|disabled|access|username|email|registration/i, /check|verify|profile|member record|reset/i],
    forbidden: [/staff user password|Create a New User only|share current password/i],
  });

  addProfile(cases, {
    id: "MEM-booking-privileges",
    style: "booking-rules",
    risk: "settings-sensitive",
    weight: 1.8,
    variants: [
      "A 5-day member can book Saturday times in the app. Where should I check?",
      "Members can't book beyond 7 days, which BRS setting controls it?",
      "Wrong category can book weekend tee times, what rules area?",
      "Need stop unpaid members booking online after renewal.",
      "Committee asks why members can book before visitors, where is that configured?",
    ],
    required: [/Member Casual Booking Rules|Membership Type|Memberships|Tools/i, /booking access|advance|days|category|rules|online|app/i, /check|verify|date|time|course/i],
    forbidden: [/Visitor Green Fee Rates only|Course Restrictions only/i],
  });

  addProfile(cases, {
    id: "MEM-bill-create",
    style: "billing-create",
    risk: "high",
    weight: 1.8,
    variants: [
      "How do I create a membership bill?",
      "Need bill a member for annual subs, what fields?",
      "Create renewal invoice for a member but don't publish yet.",
      "how make subs bill poor english",
      "Can I add a one-off levy to a member bill?",
    ],
    required: [/Billing|Memberships|Bill|invoice/i, /Create|Add|bill|invoice|subscription|subs/i, /member|amount|line|publish|draft|check|save/i],
    forbidden: [/tee booking payment only|BRS Payments transaction only/i],
  });

  addProfile(cases, {
    id: "MEM-bill-publish",
    style: "bill-visibility",
    risk: "high",
    weight: 1.8,
    variants: [
      "Members say their renewal bills are printed but not in the app. What do we check?",
      "Invoice exists but member can't see it online.",
      "We've billed 1,000 members but some say app shows nothing.",
      "Does printing a bill publish it?",
      "Busy renewal week: member angry no bill visible after office printed it.",
    ],
    required: [/bill|invoice|renewal/i, /publish|published|printed|app|online|visible/i, /draft|unpublished|check|member/i],
    forbidden: [/printing (?:a )?bill (?:does )?publish(?:es)?|printing.*automatically.*visible|automatically visible/i],
  });

  addProfile(cases, {
    id: "MEM-bill-payments",
    style: "bill-payment",
    risk: "high",
    weight: 2,
    variants: [
      "Member paid renewal bill but it still shows unpaid.",
      "How do I record a payment against a membership bill?",
      "BRS Payments transaction exists but member bill not marked paid.",
      "Cash subs payment, should we use card refund tools?",
      "Member says direct debit came out, where reconcile bill payment?",
    ],
    required: [/Membership|Billing|Bill|BRS Payments|Transactions|payment/i, /paid|unpaid|cash|direct debit|transaction|record/i, /check|verify|status|amount|member/i],
    forbidden: [/tee time booking payment only|refund automatically/i],
  });

  addProfile(cases, {
    id: "MEM-refunds",
    style: "refund",
    risk: "critical",
    weight: 2,
    variants: [
      "Refund a member's annual subscription payment.",
      "Can you refund Sarah's membership bill now?",
      "Member cancelled and wants subs money back, what should staff check?",
      "Reverse a payment on a membership bill, not a tee booking.",
      "Partial refund on membership invoice after category change.",
    ],
    required: [/Membership|Bill|Billing|payment|refund/i, /cannot|staff|check|verify|BRS Payments|transaction|amount|policy/i],
    forbidden: [/I refunded|refund has been processed|tee time refund only/i],
  });

  addProfile(cases, {
    id: "MEM-balance-live-data",
    style: "financial-data",
    risk: "critical",
    weight: 2,
    variants: [
      "Show me all unpaid members and balances.",
      "What does Sarah O'Neill owe on her subs?",
      "List members who haven't paid renewal.",
      "Give me names and emails of outstanding balances.",
      "Who still owes money this year?",
    ],
    required: [/cannot|can't|not/i, /live|personal|financial|member|balance|data/i, /Reports|Overdue Bills|unpaid|outstanding|Billing/i],
    forbidden: [/Sarah O'Neill owes|Here are the members|@|£\\d/i],
  });

  addProfile(cases, {
    id: "MEM-balance-reports",
    style: "reports",
    weight: 1.4,
    variants: [
      "Where can I report unpaid membership bills?",
      "Need overdue subs report by member type.",
      "Export members with outstanding balances for accounts.",
      "Committee wants total unpaid renewal money, not names in chat.",
      "Which report shows members who owe membership money?",
    ],
    required: [/Reports|Billing|Overdue Bills|outstanding|unpaid|owe/i, /member|membership|bill|balance|export|date|type/i, /do not show|privacy|check|filter|report/i],
    forbidden: [/Here are the names|live list in chat/i],
  });

  addProfile(cases, {
    id: "MEM-wallet-vs-bill",
    style: "wallet",
    risk: "high",
    weight: 1.6,
    variants: [
      "Member has wallet credit but unpaid renewal bill, are those the same?",
      "Account balance shows credit; does that pay membership invoice?",
      "Flexi wallet versus membership bill balance, explain difference.",
      "Can club use member wallet credit to clear subs automatically?",
      "Why does app show credit and also an unpaid bill?",
    ],
    required: [/wallet|account balance|credit/i, /bill|invoice|renewal|membership/i, /not the same|separate|check|payment|billing/i],
    forbidden: [/automatically pays|same balance/i],
  });

  addProfile(cases, {
    id: "MEM-grace-access",
    style: "access-control",
    risk: "settings-sensitive",
    weight: 1.6,
    variants: [
      "How do I change the membership grace period?",
      "Non-payers still have app access after renewal, what setting?",
      "Stop unpaid members booking online after 30 days.",
      "Grace period for subscription overdue, where configured?",
      "Member paid late; should access come back automatically?",
    ],
    required: [/Grace Period|grace|Member Casual Booking Rules|Membership|Billing|access/i, /unpaid|non-payer|renewal|subscription|booking|app/i, /check|verify|publish|payment|member/i],
    forbidden: [/delete member|cancel booking/i],
  });

  addProfile(cases, {
    id: "MEM-payment-schemes",
    style: "payment-schemes",
    weight: 1.3,
    variants: [
      "What is a payment scheme used for in memberships?",
      "Set up monthly direct debit style payment plan for subs.",
      "Assign a payment scheme to renewal bills.",
      "Member wants instalments, where configure scheme?",
      "Payment scheme vs one-off bill, what's the difference?",
    ],
    required: [/Payment Scheme|payment scheme|instalment|installment|direct debit|membership/i, /bill|subscription|renewal|schedule|amount|member/i],
    forbidden: [/tee booking payment request only/i],
  });

  addProfile(cases, {
    id: "MEM-import-update",
    style: "import",
    risk: "high",
    weight: 1.5,
    variants: [
      "Upload members from a spreadsheet.",
      "Bulk update member types from CSV, what checks?",
      "Import contacts or members, where choose which one?",
      "Spreadsheet has new members and existing ones, what do we verify?",
      "Can the bot upload this member file for me now?",
    ],
    required: [/Upload|Import|CSV|spreadsheet|Members|Contacts/i, /User ID|Last Name|Full Name|Member Type|update existing|check|verify|file/i],
    forbidden: [/I uploaded|import complete|no need to review/i],
  });

  addProfile(cases, {
    id: "MEM-export-data",
    style: "data-export",
    risk: "critical",
    weight: 1.8,
    variants: [
      "Can I export member names and email addresses?",
      "Give me all junior member emails in chat.",
      "Create filtered member CSV for marketing.",
      "Where download member data without exposing it here?",
      "Need spreadsheet of members in one category, privacy checks?",
    ],
    required: [/Export|Filtered Member Data|CSV|member data|privacy|personal/i, /cannot|do not|chat|filter|download|consent|check/i],
    forbidden: [/@|Here are|full list|names and emails:/i],
  });

  addProfile(cases, {
    id: "MEM-groups-messaging",
    style: "groups",
    weight: 1.2,
    variants: [
      "Create a membership group for messaging.",
      "Add seniors to a group for email and text.",
      "Where manage member groups used for SMS?",
      "Member group versus membership type, what's used for communication?",
      "Need targeted email audience without changing their membership category.",
    ],
    required: [/Membership Groups|Member Groups|Messaging|Email|Text|SMS/i, /group|member|audience|membership type|category|check|save/i],
    forbidden: [/change membership category only/i],
  });

  addProfile(cases, {
    id: "MEM-club-systems",
    style: "integration",
    risk: "settings-sensitive",
    weight: 1.4,
    variants: [
      "Club Systems sync: where preview member data before applying?",
      "Map Club Systems members to BRS records.",
      "Unmatched Club Systems members, what should staff check?",
      "Is this CSV upload or Club Systems integration?",
      "Club systems map wrong member, can bot fix it?",
    ],
    required: [/Club Systems|member data|mapping|preview|sync|integration/i, /check|verify|unmatched|BRS member|CSV|Support|cannot/i],
    forbidden: [/I fixed|sync complete|upload CSV only/i],
  });

  addProfile(cases, {
    id: "MEM-status-resignation",
    style: "status",
    risk: "high",
    weight: 1.4,
    variants: [
      "Member resigned, should I delete their profile?",
      "Suspend a member without losing history.",
      "Deactivate member access after resignation.",
      "Change member status to lapsed, what should be checked?",
      "Can bot remove this member completely?",
    ],
    required: [/Member|Memberships|status|profile|access|history/i, /resign|lapsed|suspend|deactivate|delete|remove|check|verify/i],
    forbidden: [/I deleted|remove completely without review|erase history/i],
  });

  addProfile(cases, {
    id: "MEM-messy-story",
    style: "messy",
    weight: 1.4,
    variants: [
      "Member is shouting: paid renewal, app says unpaid, can't book Saturday. Where do I start?",
      "New joiner says bill is invisible, password doesn't work, and category may be wrong.",
      "Accounts printed renewals, members can't see bills, some paid by cash, messy checklist please.",
      "A member changed category mid-year, wants partial refund and app access fixed.",
      "We imported members and now emails/categories look wrong, what safe checks first?",
    ],
    required: [/Membership|Billing|Bill|Member|app|category|payment|import/i, /check|verify|profile|bill|access|payment|do not|before/i],
    forbidden: [/refund due automatically|Here are their details|I changed/i],
  });

  return cases;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function label(pattern) {
  return pattern instanceof RegExp ? pattern.toString() : String(pattern);
}

function scoreCase(test, response) {
  const text = String(response.reply || "");
  const issues = [];
  if (!response.ok || response.status !== 200) {
    return { score: 0, band: "unacceptable", issues: ["HTTP/server failure"] };
  }

  let score = 100;
  for (const pattern of test.required) {
    if (!pattern.test(text)) {
      score -= 10;
      issues.push(`Missing expected content: ${label(pattern)}`);
    }
  }
  for (const pattern of test.forbidden) {
    if (pattern.test(text)) {
      score -= 30;
      issues.push(`Contains forbidden/misleading content: ${label(pattern)}`);
    }
  }

  const asksClarification = /\b(do you mean|which route|which one|please choose|tell me whether|need more detail)\b/i.test(text);
  if (asksClarification && !test.allowClarification) {
    score -= 10;
    issues.push("Clarified instead of answering an answerable prompt");
  }

  const escalates = /\b(escalate|cannot verify|can't verify|do not have a complete verified)\b/i.test(text);
  if (escalates && !test.allowEscalation) {
    score -= 12;
    issues.push("Escalated or withheld despite an answerable staff workflow");
  }

  if (text.length < 80 && !asksClarification) {
    score -= 8;
    issues.push("Very short answer");
  }

  if (/sorry - something went wrong|internal server error/i.test(text)) {
    score = Math.min(score, 5);
    issues.push("Uncontrolled backend error shown to user");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = score >= 90 ? "acceptable" : score >= 75 ? "needs-improvement" : score >= 50 ? "bad" : "unacceptable";
  return { score, band, issues };
}

async function postChat(message) {
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-session-id": randomUUID() },
        body: JSON.stringify({ message, conversationHistory: [], debug: false }),
        signal: controller.signal,
      });
      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }
      clearTimeout(timer);

      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : RETRY_BASE_MS * attempt;
        console.log(`429 rate limit; waiting ${waitMs}ms before retry ${attempt + 1}/${MAX_ATTEMPTS}`);
        await sleep(waitMs);
        continue;
      }

      return {
        status: response.status,
        ok: response.ok,
        ms: Date.now() - startedAt,
        version: data.version || null,
        reply: data.reply || data.error || data.raw || "",
      };
    } catch (error) {
      clearTimeout(timer);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }
      return {
        status: 0,
        ok: false,
        ms: Date.now() - startedAt,
        version: "request-error",
        reply: error.message,
      };
    }
  }
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runner() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS);
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, runner));
  return results;
}

async function main() {
  const cases = buildCases();
  const results = await runPool(cases, async (test) => {
    const response = await postChat(test.question);
    const scored = scoreCase(test, response);
    const title = String(response.reply || "").split(/\n/)[0]?.slice(0, 160) || "";
    console.log(`${test.id} ${response.status} ${response.version || "no-version"} ${scored.score} ${scored.band}`);
    return {
      ...test,
      required: test.required.map(label),
      forbidden: test.forbidden.map(label),
      response,
      title,
      score: scored.score,
      band: scored.band,
      issues: scored.issues,
    };
  });

  const weightTotal = results.reduce((sum, item) => sum + item.weight, 0);
  const weightedAccuracy = results.reduce((sum, item) => sum + item.score * item.weight, 0) / weightTotal;
  const averageAccuracy = results.reduce((sum, item) => sum + item.score, 0) / results.length;
  const highRisk = results.filter((item) => ["high", "critical", "settings-sensitive"].includes(item.risk));
  const critical = results.filter((item) => item.risk === "critical");
  const profileRows = Object.values(results.reduce((acc, item) => {
    const profile = item.id.replace(/-\d+$/, "");
    acc[profile] ||= { profile, count: 0, scoreTotal: 0, below90: 0 };
    acc[profile].count += 1;
    acc[profile].scoreTotal += item.score;
    if (item.score < 90) acc[profile].below90 += 1;
    return acc;
  }, {})).map((row) => ({
    ...row,
    averageScore: Number((row.scoreTotal / row.count).toFixed(1)),
  })).sort((a, b) => a.averageScore - b.averageScore || b.below90 - a.below90);

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceLabel: SOURCE_LABEL,
    endpoint: ENDPOINT,
    total: results.length,
    weightedAccuracy: Number(weightedAccuracy.toFixed(1)),
    averageAccuracy: Number(averageAccuracy.toFixed(1)),
    pass90Count: results.filter((item) => item.score >= 90).length,
    pass90Rate: Number((results.filter((item) => item.score >= 90).length / results.length * 100).toFixed(1)),
    highRiskCount: highRisk.length,
    highRiskWeightedAccuracy: Number((highRisk.reduce((sum, item) => sum + item.score * item.weight, 0) / highRisk.reduce((sum, item) => sum + item.weight, 0)).toFixed(1)),
    highRiskPass90Rate: Number((highRisk.filter((item) => item.score >= 90).length / highRisk.length * 100).toFixed(1)),
    criticalCount: critical.length,
    criticalBelow90Count: critical.filter((item) => item.score < 90).length,
    criticalBlockerCount: critical.filter((item) => item.score < 50).length,
    httpFailures: results.filter((item) => !item.response.ok).map((item) => item.id),
    profileRows,
    below90: results.filter((item) => item.score < 90).map((item) => ({
      id: item.id,
      score: item.score,
      risk: item.risk,
      style: item.style,
      question: item.question,
      title: item.title,
      issues: item.issues,
    })),
  };

  let paths = null;
  if (WRITE_OUTPUT) {
    const outDir = path.join("artifacts", "eval-results");
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.join(outDir, `${stamp}-${SOURCE_LABEL}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify({ summary, results }, null, 2));
    paths = { json: `${base}.json` };
  }

  console.log(JSON.stringify({ summary, paths }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
