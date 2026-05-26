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
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

const yesNoOptions = [
  { label: "Yes", value: "Yes" },
  { label: "No", value: "No" },
];

function createDefaultState() {
  return {
    conversationHistory: [],
    escalationState: "none",
    escalationDraft: null,
    currentTopic: null,
    updatedAt: Date.now(),
  };
}

function cleanupSessions() {
  const now = Date.now();

  for (const [sessionId, state] of sessions.entries()) {
    if (!state?.updatedAt || now - state.updatedAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }

  if (sessions.size <= SESSION_LIMIT) return;

  const oldest = [...sessions.entries()]
    .sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0))
    .slice(0, sessions.size - SESSION_LIMIT);

  oldest.forEach(([sessionId]) => sessions.delete(sessionId));
}

function getSessionId(req) {
  return (
    req.headers["x-session-id"] ||
    req.body?.sessionId ||
    req.query?.sessionId ||
    "default-session"
  ).toString();
}

function getSessionState(sessionId) {
  cleanupSessions();

  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, createDefaultState());
  }

  const state = sessions.get(sessionId);
  state.updatedAt = Date.now();
  return state;
}

function saveSessionState(sessionId, state) {
  sessions.set(sessionId, {
    ...state,
    updatedAt: Date.now(),
  });
}

function resetSessionState(sessionId) {
  const freshState = createDefaultState();
  sessions.set(sessionId, freshState);
  return freshState;
}

function loadFile(filePath) {
  const fullPath = path.join(__dirname, filePath);

  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath, "utf-8");
  }

  return "";
}

function detectTopic(message) {
  const lower = message.toLowerCase();

  if (
    lower.includes("payment") ||
    lower.includes("paid") ||
    lower.includes("refund") ||
    lower.includes("transaction") ||
    lower.includes("payout") ||
    lower.includes("vat") ||
    lower.includes("bank statement")
  ) return "payments";

  if (
    lower.includes("booking") ||
    lower.includes("tee") ||
    lower.includes("timesheet") ||
    lower.includes("player") ||
    lower.includes("green fee") ||
    lower.includes("society")
  ) return "teesheet";

  if (
    lower.includes("member") ||
    lower.includes("membership") ||
    lower.includes("subscription") ||
    lower.includes("bill") ||
    lower.includes("wallet") ||
    lower.includes("payment scheme")
  ) return "memberships";

  if (
    lower.includes("user") ||
    lower.includes("admin") ||
    lower.includes("superuser") ||
    lower.includes("staff") ||
    lower.includes("login") ||
    lower.includes("permission")
  ) return "user-management";

  if (
    lower.includes("configure") ||
    lower.includes("setup") ||
    lower.includes("email template") ||
    lower.includes("green fee rate")
  ) return "admin-setup";

  return "general";
}

function getContextForTopic(topic) {
  const instructions = loadFile("data/instructions.txt");
  const decisionTree = loadFile(`data/decision-trees/${topic}-decision-tree.txt`);
  const knowledge = loadFile(`data/knowledge/${topic}.txt`);

  return `
${instructions}

PRIORITY ORDER:
1. Core behaviour rules
2. Relevant decision tree
3. Relevant knowledge file
4. Safe escalation if unsure

When you ask a closed logic question, make the options clear in plain language. The UI may turn obvious choices into buttons.

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

  return (
    lower.includes("all good") ||
    lower.includes("thanks") ||
    lower.includes("thank you") ||
    lower.includes("sorted") ||
    lower.includes("that worked") ||
    lower.includes("resolved")
  );
}

function isPaymentMissingScenario(text) {
  const lower = text.toLowerCase();

  const paymentTerms =
    lower.includes("paid") ||
    lower.includes("payment") ||
    lower.includes("money") ||
    lower.includes("bank statement") ||
    lower.includes("receipt") ||
    lower.includes("proof of payment");

  const noRecordTerms =
    lower.includes("no record") ||
    lower.includes("not showing") ||
    lower.includes("can't see") ||
    lower.includes("cant see") ||
    lower.includes("cannot see") ||
    lower.includes("no payment") ||
    lower.includes("no transaction") ||
    lower.includes("not in brs") ||
    lower.includes("not in the system") ||
    lower.includes("nothing there");

  return paymentTerms && noRecordTerms;
}

function userConfirmedNoRecord(message) {
  const lower = message.toLowerCase();

  return (
    lower.includes("yes") ||
    lower.includes("checked") ||
    lower.includes("nothing") ||
    lower.includes("no record") ||
    lower.includes("no transaction") ||
    lower.includes("not there") ||
    lower.includes("still cannot") ||
    lower.includes("still can't") ||
    lower.includes("still cant")
  );
}

function getOptionsForReply(reply, topic, state) {
  const lower = reply.toLowerCase();

  if (topic === "general" && lower.includes("bookings") && lower.includes("payments")) {
    return topicOptions;
  }

  if (state.escalationState === "check_asked") {
    return yesNoOptions;
  }

  if (
    lower.includes("have you") ||
    lower.includes("can you confirm") ||
    lower.includes("is this") ||
    lower.includes("does this") ||
    lower.includes("do you") ||
    lower.includes("are you")
  ) {
    return yesNoOptions;
  }

  return [];
}

function createEscalationDraft(conversationHistory) {
  const transcript = conversationHistory
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  return {
    to: "support@brsgolf.com",
    subject: "Payment missing in BRS – support investigation required",
    body: `Hi Support Team,

A payment issue needs investigation.

Summary:
A customer/golfer has confirmed payment was taken, but no matching record is visible in BRS.

Checks completed:
- Booking / bill checked where available
- Tools >> BRS Payments >> Transactions checked
- No matching record found

Action required:
Please investigate this with the payments platform and advise.

Details to add if available:
- Club:
- Customer / Golfer name:
- Amount:
- Date / Time:
- Booking / Bill reference:

Conversation transcript:
${transcript}

Kind regards`,
  };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/chat", async (req, res) => {
  const sessionId = getSessionId(req);
  const state = getSessionState(sessionId);

  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.json({ reply: "Please enter a question.", escalationReady: false, options: [] });
    }

    if (isConversationEnd(message)) {
      resetSessionState(sessionId);
      return res.json({ reply: "Great — glad that’s sorted. Starting fresh for the next issue.", escalationReady: false, options: [] });
    }

    let detectedTopic = detectTopic(message);
    if (detectedTopic !== "general") state.currentTopic = detectedTopic;
    const topic = state.currentTopic || detectedTopic;

    if (topic === "general") {
      state.conversationHistory.push({ role: "user", content: message });
      const reply = "Got it — just to check, is this about bookings, payments, memberships, users, or system setup?";
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic, options: getOptionsForReply(reply, topic, state) });
    }

    if (state.escalationState === "check_asked") {
      state.conversationHistory.push({ role: "user", content: message });

      if (userConfirmedNoRecord(message)) {
        state.escalationState = "escalated";
        const reply = `I understand — that’s frustrating.

Since there’s no record in BRS, this will need to be checked with our payments platform.

I’ve prepared an escalation draft for support below. Please review it before sending.`;
        state.conversationHistory.push({ role: "assistant", content: reply });
        state.escalationDraft = createEscalationDraft(state.conversationHistory);
        saveSessionState(sessionId, state);
        return res.json({ reply, escalationReady: true, escalationDraft: state.escalationDraft, topic: "payments", options: [] });
      }

      state.escalationState = "none";
      const reply = `No problem — let’s continue checking this carefully.

What did you find in Tools >> BRS Payments >> Transactions?`;
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic: "payments", options: [] });
    }

    const historyText = state.conversationHistory.map((m) => m.content).join(" ");
    const combinedText = `${historyText} ${message}`;

    if (topic === "payments" && isPaymentMissingScenario(combinedText)) {
      state.escalationState = "check_asked";
      const reply = `I understand — that’s frustrating.

Just to confirm — have you checked:
Tools >> BRS Payments >> Transactions
and still cannot see any record?`;
      state.conversationHistory.push({ role: "user", content: message });
      state.conversationHistory.push({ role: "assistant", content: reply });
      saveSessionState(sessionId, state);
      return res.json({ reply, escalationReady: false, topic, options: getOptionsForReply(reply, topic, state) });
    }

    state.conversationHistory.push({ role: "user", content: message });

    const trimmedHistory = state.conversationHistory.slice(-12);
    const dynamicInstructions = getContextForTopic(topic);

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: dynamicInstructions },
        ...trimmedHistory,
      ],
    });

    const reply = response.output_text;
    state.conversationHistory.push({ role: "assistant", content: reply });
    saveSessionState(sessionId, state);

    res.json({ reply, escalationReady: false, topic, options: getOptionsForReply(reply, topic, state) });
  } catch (error) {
    console.error("FULL ERROR:", error);
    saveSessionState(sessionId, state);
    res.status(500).json({ reply: "Sorry — something went wrong. Please try again.", escalationReady: false, options: [] });
  }
});

app.post("/chat", (req, res, next) => {
  req.url = "/api/chat";
  next();
});

app.post("/send-escalation", async (req, res) => {
  const sessionId = getSessionId(req);
  const state = getSessionState(sessionId);

  if (!state.escalationDraft) {
    return res.status(400).json({ message: "No escalation draft is ready." });
  }

  console.log("ESCALATION READY TO SEND:");
  console.log("Session:", sessionId);
  console.log("To:", state.escalationDraft.to);
  console.log("Subject:", state.escalationDraft.subject);
  console.log("Body:", state.escalationDraft.body);

  res.json({
    message: "Escalation prepared. Email sending is not connected yet, but this is the email that would be sent.",
    draft: state.escalationDraft,
  });
});

app.post("/reset", (req, res) => {
  const sessionId = getSessionId(req);
  resetSessionState(sessionId);
  res.json({ message: "Conversation reset." });
});

export default function handler(req, res) {
  return app(req, res);
}
