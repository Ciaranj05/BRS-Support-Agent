import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const APP_VERSION = "buggy-booking-direct-answer-v1";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const SESSION_LIMIT = 1000;
const sessions = globalThis.__brsSupportSessions || new Map();
globalThis.__brsSupportSessions = sessions;

const topicOptions = [
  { label: "Bookings", value: "This is about bookings or the tee sheet" },
  { label: "Payments", value: "This is about payments" },
  { label: "Memberships", value: "This is about memberships" },
  { label: "Users", value: "This is about users, logins or permissions" },
  { label: "System setup", value: "This is about system setup or configuration" },
];

const transactionOptions = [
  { label: "Yes, transaction found", value: "Yes, I found the matching transaction in BRS Payments" },
  { label: "No, no transaction found", value: "No, I cannot find a matching transaction in BRS Payments" },
];

const fullPartialRefundOptions = [
  { label: "Full Refund", value: "This is a full refund" },
  { label: "Partial Refund", value: "This is a partial refund" },
];

function createDefaultState() {
  return { conversationHistory: [], escalationState: "none", escalationDraft: null, currentTopic: null, updatedAt: Date.now() };
}

function cleanupSessions() {
  const now = Date.now();
  for (const [sessionId, state] of sessions.entries()) {
    if (!state?.updatedAt || now - state.updatedAt > SESSION_TTL_MS) sessions.delete(sessionId);
  }
  if (sessions.size <= SESSION_LIMIT) return;
  [...sessions.entries()].sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0)).slice(0, sessions.size - SESSION_LIMIT).forEach(([sessionId]) => sessions.delete(sessionId));
}

function getSessionId(req) {
  return (req.headers["x-session-id"] || req.body?.sessionId || req.query?.sessionId || "default-session").toString();
}

function getSessionState(sessionId) {
  cleanupSessions();
  if (!sessions.has(sessionId)) sessions.set(sessionId, createDefaultState());
  const state = sessions.get(sessionId);
  state.updatedAt = Date.now();
  return state;
}

function saveSessionState(sessionId, state) { sessions.set(sessionId, { ...state, updatedAt: Date.now() }); }
function resetSessionState(sessionId) { const freshState = createDefaultState(); sessions.set(sessionId, freshState); return freshState; }
function loadFile(filePath) { const fullPath = path.join(__dirname, filePath); return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : ""; }

function detectTopic(message) {
  const lower = message.toLowerCase();
  if (lower.includes("payment") || lower.includes("paid") || lower.includes("refund") || lower.includes("transaction") || lower.includes("payout") || lower.includes("vat") || lower.includes("bank statement")) return "payments";
  if (lower.includes("member") || lower.includes("membership") || lower.includes("subscription") || lower.includes("bill") || lower.includes("wallet") || lower.includes("payment scheme")) return "memberships";
  if (lower.includes("user") || lower.includes("admin") || lower.includes("superuser") || lower.includes("staff") || lower.includes("login") || lower.includes("permission")) return "user-management";
  if (lower.includes("buggy") || lower.includes("buggies")) return "admin-setup";
  if (lower.includes("booking") || lower.includes("tee") || lower.includes("timesheet") || lower.includes("player") || lower.includes("green fee") || lower.includes("society") || lower.includes("move")) return "teesheet";
  if (lower.includes("configure") || lower.includes("setup") || lower.includes("email template") || lower.includes("green fee rate")) return "admin-setup";
  return "general";
}

function getContextForTopic(topic) {
  const instructions = loadFile("data/instructions.txt");
  const decisionTree = loadFile(`data/decision-trees/${topic}-decision-tree.txt`);
  const knowledge = loadFile(`data/knowledge/${topic}.txt`);
  return `
${instructions}

RESPONSE STYLE:
- Use the relevant BRS knowledge and decision tree. Do not answer as a generic IT assistant.
- Keep replies short and operational.
- Ask only one next-step question at a time.
- Do not ask what system/platform the user means after a BRS topic is detected.
- Use approved BRS navigation labels only.
- If the answer exists in the knowledge file, provide it directly.
- If you ask a question with options, write the options naturally in the question, for example: "Is this for members or visitors?" or "Is this about bookings, payments, or memberships?"

PRIORITY ORDER:
1. Relevant decision tree
2. Relevant knowledge file
3. Core behaviour rules
4. Safe escalation if unsure

TOPIC:
${topic}

RELEVANT DECISION TREE:
${decisionTree}

RELEVANT KNOWLEDGE:
${knowledge}
`;
}

function isConversationEnd(message) {
  const lower = message.toLowerCase();
  return lower.includes("all good") || lower.includes("thanks") || lower.includes("thank you") || lower.includes("sorted") || lower.includes("that worked") || lower.includes("resolved");
}

function isRefundRequest(text) {
  const lower = text.toLowerCase();
  return lower.includes("refund") && (lower.includes("booking") || lower.includes("payment") || lower.includes("golfer") || lower.includes("customer"));
}

function isAdminUserCreateRequest(text) {
  const lower = text.toLowerCase();
  return (lower.includes("admin user") || lower.includes("new user") || lower.includes("create user") || lower.includes("add user")) && (lower.includes("create") || lower.includes("add") || lower.includes("setup") || lower.includes("set up"));
}

function approvedAdminUserReply() {
  return `Go to:
Users >> Add New

Then:
1. Click the dropdown beside User Group.
2. Choose the correct user type.
3. Complete the required fields: User Group, Username, Membership Type, First Name, and Last Name.
4. Complete Password and Re-type Password to set the user password.
5. Click Create New User.

User group options:
- Admin: overall control of the system. Cannot add other Admin users.
- Staff: can complete most day-to-day tasks, but cannot access the Tools menu or Revenue Reports.
- StaffReadOnly: can view but cannot save changes.
- Member: can only log in through the Members Booking pages to view or book tee times.

To change the password later:
1. Go back to Users.
2. Click Find User.
3. Open the user from the list.
4. Use Change Password, or use Reset Password if an email address is saved for the user.`;
}

function isBuggyBookingRequest(text) {
  const lower = text.toLowerCase();
  const buggyTerm = lower.includes("buggy") || lower.includes("buggies");
  const setupTerm = lower.includes("count") || lower.includes("number") || lower.includes("available") || lower.includes("availability") || lower.includes("book") || lower.includes("booking") || lower.includes("online") || lower.includes("switch on") || lower.includes("enable") || lower.includes("turn on") || lower.includes("setup") || lower.includes("set up") || lower.includes("configure") || lower.includes("update") || lower.includes("modify") || lower.includes("change");
  return buggyTerm && setupTerm;
}

function approvedBuggyBookingReply() {
  return `To switch on the feature go to "Tools">>"System Configuration" and go to the "Buggy Booking" section.

Here you enter the Number of Buggies the club has, and the amount of time each buggy is needed before and after each round (for charging, cleaning etc).
The allow visitors to book buggies online setting, if checked, and the number of buggies setup is greater that zero, visitors will see the number of buggies available against each tee time and will be able to book either 1 or 2 buggies as long as they are available to be booked.
Note that the price of the buggy is not included at the time of the booking so must be added in afterwards by staff at the club.
If any changes are made click "Update" at the top or bottom of the page to save your changes.
Once you have set up this, go back to the timesheet and you will see the number of buggies appearing on the right hand side of the screen. This number will fluctuate depending on how many buggies are available See the image below. The are 10 available buggies, but because the 09:00 tee time has 1 buggy against it, only 9 are available for a time before and after the tee time.`;
}

function isFullRefundAnswer(text) {
  const lower = text.toLowerCase();
  return lower.includes("full refund") || lower === "full" || lower.includes("full amount");
}

function isPartialRefundAnswer(text) {
  const lower = text.toLowerCase();
  return lower.includes("partial refund") || lower === "partial" || lower.includes("part refund");
}

function approvedRefundReply(type = "refund") {
  const partialLine = type === "partial"
    ? "For the partial refund, type the amount to be refunded into the Amount field before clicking Refund."
    : "The system will automatically add the full refundable amount for you to refund.";

  return `BRS customers using the BRS Payments processor can refund online payments from the Booking Details screen. If the club does not use BRS Payments, use the non-BRS Payments refund process instead.

Go to:
Tee Sheet >> Tee Time >> Booking Details >> Payments tab

Then:
1. From the tee sheet, click the tee time to open the Booking Details screen.
2. Expand the Payments tab.
3. Online payments completed through BRS Payments should have a Refund button beside the payment.
4. Click Refund.
5. ${partialLine}
6. Enter a reason if required.
7. Click Refund to transfer the payment back to the customer.

Please allow 5-10 days for refunds to return to the customer account.

To retrieve a record of refunds, go to:
Tools >> Payments >> Refunds`;
}

function isPaymentMissingScenario(text) {
  const lower = text.toLowerCase();
  const paymentTerms = lower.includes("paid") || lower.includes("payment") || lower.includes("money") || lower.includes("bank statement") || lower.includes("receipt") || lower.includes("proof of payment");
  const missingBookingTerms = lower.includes("no booking") || lower.includes("not on the teesheet") || lower.includes("not on tee sheet") || lower.includes("turned up") || lower.includes("booking not showing");
  const noRecordTerms = lower.includes("no record") || lower.includes("not showing") || lower.includes("can't see") || lower.includes("cant see") || lower.includes("cannot see") || lower.includes("no payment") || lower.includes("no transaction") || lower.includes("not in brs") || lower.includes("not in the system") || lower.includes("nothing there");
  return paymentTerms && (missingBookingTerms || noRecordTerms);
}

function userConfirmedNoRecord(message) {
  const lower = message.toLowerCase();
  return lower.includes("no") || lower.includes("nothing") || lower.includes("no record") || lower.includes("no transaction") || lower.includes("not there") || lower.includes("cannot find") || lower.includes("can't find") || lower.includes("cant find");
}

function userConfirmedRecordFound(message) {
  const lower = message.toLowerCase();
  return lower.includes("yes") || lower.includes("found") || lower.includes("transaction found") || lower.includes("can see") || lower.includes("there is a transaction");
}

function clearStaleStateForMessage(state, message) {
  if (state.escalationState === "refund_type_asked" && !isRefundRequest(message) && !isFullRefundAnswer(message) && !isPartialRefundAnswer(message)) {
    state.escalationState = "none";
  }
  if (state.escalationState === "check_asked" && !isPaymentMissingScenario(message) && !userConfirmedNoRecord(message) && !userConfirmedRecordFound(message)) {
    state.escalationState = "none";
  }
}

function createEscalationDraft(conversationHistory) {
  const transcript = conversationHistory.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  return { to: "support@brsgolf.com", subject: "Payment missing in BRS - support investigation required", body: `Hi Support Team,

A payment issue needs investigation.

Conversation transcript:
${transcript}

Kind regards` };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: APP_VERSION });
});

app.post("/api/chat", async (req, res) => {
  const sessionId = getSessionId(req);
  const state = getSessionState(sessionId);

  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.json({ reply: "Please enter a question.", escalationReady: false, options: [], version: APP_VERSION });
    if (isConversationEnd(message)) { resetSessionState(sessionId); return res.json({ reply: "Great - glad that is sorted. Starting fresh for the next issue.", escalationReady: false, options: [], version: APP_VERSION }); }

    clearStaleStateForMessage(state, message);

    const detectedTopic = detectTopic(message);
    if (detectedTopic !== "general") state.currentTopic = detectedTopic;
    const topic = detectedTopic !== "general" ? detectedTopic : (state.currentTopic || detectedTopic);

    const historyText = state.conversationHistory.map((m) => m.content).join(" ");
    const combinedText = `${historyText} ${message}`;

    if (isBuggyBookingRequest(message)) {
      state.currentTopic = "admin-setup";
      state.escalationState = "none";
      const reply = approvedBuggyBookingReply();
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "admin-setup", options: [], version: APP_VERSION });
    }

    if (isAdminUserCreateRequest(message)) {
      state.currentTopic = "user-management";
      const reply = approvedAdminUserReply();
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "user-management", options: [], version: APP_VERSION });
    }

    if (state.escalationState === "refund_type_asked") {
      state.conversationHistory.push({ role: "user", content: message });
      if (isFullRefundAnswer(message)) {
        const reply = approvedRefundReply("full");
        state.escalationState = "none";
        state.conversationHistory.push({ role: "assistant", content: reply });
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic: "payments", options: [], version: APP_VERSION });
      }
      if (isPartialRefundAnswer(message)) {
        const reply = approvedRefundReply("partial");
        state.escalationState = "none";
        state.conversationHistory.push({ role: "assistant", content: reply });
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic: "payments", options: [], version: APP_VERSION });
      }
      state.escalationState = "none";
    }

    if (isRefundRequest(message)) {
      state.currentTopic = "payments";
      state.escalationState = "refund_type_asked";
      const reply = "Is this a full refund or partial refund?";
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "payments", options: fullPartialRefundOptions, version: APP_VERSION });
    }

    if (topic === "payments" && isPaymentMissingScenario(combinedText)) {
      state.escalationState = "check_asked";
      const reply = "It sounds like the golfer may have paid, but the booking has not created on the tee sheet. First, check Tools >> BRS Payments >> Transactions. Can you see a matching transaction there?";
      state.conversationHistory.push({ role: "user", content: message }); state.conversationHistory.push({ role: "assistant", content: reply }); saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic, options: transactionOptions, version: APP_VERSION });
    }

    if (topic === "general") {
      state.conversationHistory.push({ role: "user", content: message });
      const reply = "Got it - just to check, is this about bookings, payments, memberships, users, or system setup?";
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic, options: topicOptions, version: APP_VERSION });
    }

    if (state.escalationState === "check_asked") {
      state.conversationHistory.push({ role: "user", content: message });
      if (userConfirmedRecordFound(message)) {
        state.escalationState = "none";
        const reply = "Thanks. If the transaction is visible in BRS Payments, check whether it is linked to a booking, bill, or failed/abandoned booking reference. What status does the transaction show?";
        state.conversationHistory.push({ role: "assistant", content: reply }); saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: false, topic: "payments", options: [], version: APP_VERSION });
      }
      if (userConfirmedNoRecord(message)) {
        state.escalationState = "escalated";
        const reply = "Thanks - if there is no matching transaction in BRS Payments, this needs to be investigated with the payments platform. I have prepared an escalation draft for support below. Please review it before sending.";
        state.conversationHistory.push({ role: "assistant", content: reply }); state.escalationDraft = createEscalationDraft(state.conversationHistory); saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: true, escalationDraft: state.escalationDraft, topic: "payments", options: [], version: APP_VERSION });
      }
      const reply = "Please select whether the matching transaction is visible in Tools >> BRS Payments >> Transactions.";
      state.conversationHistory.push({ role: "assistant", content: reply }); saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "payments", options: transactionOptions, version: APP_VERSION });
    }

    state.conversationHistory.push({ role: "user", content: message });
    const response = await client.responses.create({ model: "gpt-4.1", input: [{ role: "system", content: getContextForTopic(topic) }, ...state.conversationHistory.slice(-12)] });
    const reply = response.output_text;
    state.conversationHistory.push({ role: "assistant", content: reply }); saveSessionState(sessionId, state);
    res.json({ reply, escalationReady: false, topic, options: [], version: APP_VERSION });
  } catch (error) {
    console.error("FULL ERROR:", error); saveSessionState(sessionId, state);
    res.status(500).json({ reply: "Sorry - something went wrong. Please try again.", escalationReady: false, options: [], version: APP_VERSION });
  }
});

app.post("/chat", (req, res, next) => { req.url = "/api/chat"; next(); });
app.post("/reset", (req, res) => { resetSessionState(getSessionId(req)); res.json({ message: "Conversation reset." }); });
app.post("/api/reset", (req, res) => { resetSessionState(getSessionId(req)); res.json({ message: "Conversation reset." }); });

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

export default function handler(req, res) { return app(req, res); }
