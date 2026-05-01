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
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let conversationHistory = [];
let escalationState = "none";
let escalationDraft = null;
let currentTopic = null;

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

function createEscalationDraft() {
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

function resetState() {
  conversationHistory = [];
  escalationState = "none";
  escalationDraft = null;
  currentTopic = null;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.json({
        reply: "Please enter a question.",
        escalationReady: false,
      });
    }

    if (isConversationEnd(message)) {
      resetState();

      return res.json({
        reply: "Great — glad that’s sorted. Starting fresh for the next issue.",
        escalationReady: false,
      });
    }

    let detectedTopic = detectTopic(message);

    if (detectedTopic !== "general") {
      currentTopic = detectedTopic;
    }

    const topic = currentTopic || detectedTopic;

    if (topic === "general") {
      conversationHistory.push({ role: "user", content: message });

      const reply =
        "Got it — just to check, is this about bookings, payments, memberships, users, or system setup?";

      conversationHistory.push({ role: "assistant", content: reply });

      return res.json({
        reply,
        escalationReady: false,
        topic,
      });
    }

    if (escalationState === "check_asked") {
      conversationHistory.push({ role: "user", content: message });

      if (userConfirmedNoRecord(message)) {
        escalationState = "escalated";

        const reply = `I understand — that’s frustrating.

Since there’s no record in BRS, this will need to be checked with our payments platform.

I’ve prepared an escalation draft for support below. Please review it before sending.`;

        conversationHistory.push({ role: "assistant", content: reply });
        escalationDraft = createEscalationDraft();

        return res.json({
          reply,
          escalationReady: true,
          escalationDraft,
          topic: "payments",
        });
      }

      escalationState = "none";

      const reply = `No problem — let’s continue checking this carefully.

What did you find in Tools >> BRS Payments >> Transactions?`;

      conversationHistory.push({ role: "assistant", content: reply });

      return res.json({
        reply,
        escalationReady: false,
        topic: "payments",
      });
    }

    const historyText = conversationHistory.map((m) => m.content).join(" ");
    const combinedText = `${historyText} ${message}`;

    if (topic === "payments" && isPaymentMissingScenario(combinedText)) {
      escalationState = "check_asked";

      const reply = `I understand — that’s frustrating.

Just to confirm — have you checked:
Tools >> BRS Payments >> Transactions
and still cannot see any record?`;

      conversationHistory.push({ role: "user", content: message });
      conversationHistory.push({ role: "assistant", content: reply });

      return res.json({
        reply,
        escalationReady: false,
        topic,
      });
    }

    conversationHistory.push({ role: "user", content: message });

    const trimmedHistory = conversationHistory.slice(-12);
    const dynamicInstructions = getContextForTopic(topic);

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: dynamicInstructions },
        ...trimmedHistory,
      ],
    });

    const reply = response.output_text;

    conversationHistory.push({ role: "assistant", content: reply });

    res.json({
      reply,
      escalationReady: false,
      topic,
    });
  } catch (error) {
    console.error("FULL ERROR:", error);

    res.status(500).json({
      reply: "Sorry — something went wrong. Please try again.",
      escalationReady: false,
    });
  }
});

app.post("/send-escalation", async (req, res) => {
  if (!escalationDraft) {
    return res.status(400).json({
      message: "No escalation draft is ready.",
    });
  }

  console.log("ESCALATION READY TO SEND:");
  console.log("To:", escalationDraft.to);
  console.log("Subject:", escalationDraft.subject);
  console.log("Body:", escalationDraft.body);

  res.json({
    message:
      "Escalation prepared. Email sending is not connected yet, but this is the email that would be sent.",
    draft: escalationDraft,
  });
});

app.post("/reset", (req, res) => {
  resetState();
  res.json({ message: "Conversation reset." });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
