import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildKnowledgeBase } from "../scripts/build-knowledge-base.js";
import { retrieveKnowledge } from "../lib/retrieval.js";
import { buildReusableWorkflowEntry } from "../lib/liveBrsLookup.js";
import { normaliseKnowledgeEntry } from "../lib/knowledgeSources.js";

async function makeKnowledgeDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brs-knowledge-"));
  await fs.mkdir(path.join(dir, "system"), { recursive: true });
  await fs.mkdir(path.join(dir, "workflows"), { recursive: true });
  return dir;
}

test("redacted BRS admin observations are promoted into usable system knowledge", async () => {
  const knowledgeDir = await makeKnowledgeDir();
  await fs.writeFile(path.join(knowledgeDir, "system", "crawl.json"), JSON.stringify({
    entries: [{
      sourceType: "brs-system",
      title: "Membership Billing Reports",
      area: "Memberships",
      navigationPath: "Members > Billing > Reports",
      sourceUrl: "https://brsgolf.com/demo-club/members/billing/reports",
      purpose: "Shows members with unpaid bills and outstanding membership balances.",
      fields: [{ label: "Bill status" }, { label: "Outstanding balance" }],
      actions: [{ label: "Run report" }, { label: "Export" }],
      helpText: ["Use this report to find unpaid membership bills."],
      confidence: "needs-review",
      containsClubSpecificData: false,
    }],
  }));

  const { entries, reviewQueue } = await buildKnowledgeBase({
    knowledgeDir,
    outputPath: path.join(knowledgeDir, "knowledge-index.json"),
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceType, "system");
  assert.equal(entries[0].confidence, "approved");
  assert.equal(entries[0].sourceUrl, null);
  assert.equal(reviewQueue.length, 0);
});

test("retrieval ranks membership bill evidence above competition purse overlap", async () => {
  const knowledgeDir = await makeKnowledgeDir();
  await fs.writeFile(path.join(knowledgeDir, "system", "crawl.json"), JSON.stringify({
    entries: [
      {
        sourceType: "brs-system",
        title: "Competition Purse Top Up",
        area: "Competitions",
        purpose: "Top up a member competition purse wallet for competition entry fees.",
        fields: [{ label: "Purse balance" }],
        actions: [{ label: "Top up" }],
        confidence: "needs-review",
        containsClubSpecificData: false,
      },
      {
        sourceType: "brs-system",
        title: "Members With Unpaid Bills Report",
        area: "Memberships",
        navigationPath: "Members > Billing > Reports",
        purpose: "Report showing all members with unpaid bills and outstanding membership bill balances.",
        fields: [{ label: "Unpaid bill" }, { label: "Member" }],
        actions: [{ label: "Run report" }],
        helpText: ["Use billing reports for unpaid membership bills."],
        confidence: "needs-review",
        containsClubSpecificData: false,
      },
    ],
  }));
  await buildKnowledgeBase({ knowledgeDir, outputPath: path.join(knowledgeDir, "knowledge-index.json") });

  const results = await retrieveKnowledge("find me a report that shows all members with unpaid bills", {
    indexPath: path.join(knowledgeDir, "knowledge-index.json"),
    limit: 2,
  });

  assert.equal(results[0].title, "Members With Unpaid Bills Report");
});

test("workflow knowledge preserves controls, actions, and table evidence", async () => {
  const knowledgeDir = await makeKnowledgeDir();
  await fs.writeFile(path.join(knowledgeDir, "workflows", "workflow.json"), JSON.stringify({
    entries: [{
      sourceType: "brs-system-workflow",
      title: "Operational Report workflow",
      area: "Reports",
      workflow: "Run an operational report",
      navigationPath: "Reports > Operational Report",
      purpose: "Shows operational report output with filters and export controls.",
      steps: ["Open Reports", "Choose the report type", "Apply filters", "Download the report if needed"],
      controls: [
        { label: "Start Date", type: "date" },
        { label: "Type of Report", type: "select", options: ["Operational Report", "Summary Report"] },
      ],
      actions: [
        { label: "Filter", purpose: "filter/search" },
        { label: "Download", purpose: "download/export", iconText: "cloud download" },
      ],
      tableHeaders: ["Member", "Outstanding Balance"],
      confidence: "needs-review",
      containsClubSpecificData: false,
    }],
  }));

  const { entries, reviewQueue } = await buildKnowledgeBase({
    knowledgeDir,
    outputPath: path.join(knowledgeDir, "knowledge-index.json"),
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceType, "workflow");
  assert.equal(entries[0].confidence, "approved");
  assert.equal(reviewQueue.length, 0);
  assert.match(entries[0].content, /Control: Type of Report: select: Operational Report: Summary Report/);
  assert.match(entries[0].content, /Action: Download: download\/export/);
  assert.match(entries[0].content, /Table column: Outstanding Balance/);
});

test("retrieval prefers matching workflow detail over generic page evidence", async () => {
  const knowledgeDir = await makeKnowledgeDir();
  await fs.writeFile(path.join(knowledgeDir, "system", "page.json"), JSON.stringify({
    entries: [{
      sourceType: "brs-system",
      title: "Reports index",
      area: "Reports",
      navigationPath: "Reports",
      purpose: "Reports provide date-filtered outputs.",
      fields: [{ label: "Type of Report" }],
      confidence: "needs-review",
      containsClubSpecificData: false,
    }],
  }));
  await fs.writeFile(path.join(knowledgeDir, "workflows", "workflow.json"), JSON.stringify({
    entries: [{
      sourceType: "brs-system-workflow",
      title: "Member Report workflow",
      area: "Reports",
      workflow: "Find members with balances",
      navigationPath: "Memberships > Reports > Member Balances",
      purpose: "Shows member balances with filter and download controls.",
      steps: ["Open Memberships", "Open Reports", "Choose Member Balances"],
      controls: [{ label: "Member Type", type: "select" }],
      actions: [{ label: "Download", purpose: "download/export", iconText: "cloud download" }],
      tableHeaders: ["Member", "Balance"],
      confidence: "needs-review",
      containsClubSpecificData: false,
    }],
  }));
  await buildKnowledgeBase({ knowledgeDir, outputPath: path.join(knowledgeDir, "knowledge-index.json") });

  const results = await retrieveKnowledge("where can I download a member balance report", {
    indexPath: path.join(knowledgeDir, "knowledge-index.json"),
    limit: 2,
  });

  assert.equal(results[0].sourceType, "workflow");
  assert.equal(results[0].title, "Member Report workflow");
});

test("multi-route workflow knowledge is preserved and searchable", async () => {
  const knowledgeDir = await makeKnowledgeDir();
  await fs.writeFile(path.join(knowledgeDir, "workflows", "workflow.json"), JSON.stringify({
    entries: [{
      sourceType: "brs-system-workflow",
      title: "Buggy booking routes",
      area: "Timesheet",
      workflow: "Add buggies to a booking",
      routes: [
        {
          name: "Online member or visitor request route",
          actor: "Member or visitor",
          preconditions: ["Online buggy booking is enabled for that audience."],
          steps: ["Request a buggy during online booking.", "Admin verifies the request on the Timesheet."],
          outcome: "The request is visible to admin staff.",
        },
        {
          name: "Admin timesheet route",
          actor: "Admin",
          preconditions: ["Admin can open the tee time from the Timesheet."],
          steps: ["Open the tee time.", "Enter the number of buggies.", "Add the service charge."],
          outcome: "The booking is updated by admin staff.",
        },
      ],
      confidence: "needs-review",
      containsClubSpecificData: false,
    }],
  }));
  await buildKnowledgeBase({ knowledgeDir, outputPath: path.join(knowledgeDir, "knowledge-index.json") });

  const results = await retrieveKnowledge("admin add service charge for buggy booking from timesheet", {
    indexPath: path.join(knowledgeDir, "knowledge-index.json"),
    limit: 1,
  });

  assert.equal(results[0].title, "Buggy booking routes");
  assert.match(results[0].content, /Route 1: Online member or visitor request route/);
  assert.match(results[0].content, /Route 2 step 3: Add the service charge/);
});

test("successful live workflows are reusable by the chatbot", () => {
  const entry = buildReusableWorkflowEntry({
    question: "How do I create a membership bill?",
    answer: "Open Memberships, then Billing.",
    intent: { topic: "memberships", task: "create", object: "membership bill" },
    liveResult: {
      successful: true,
      pages: [{
        title: "Create Bills",
        headings: ["Create Bills"],
        breadcrumbs: ["Memberships", "Billing"],
        controls: [{ label: "Preview", type: "button", options: [] }],
        tableHeaders: ["Member", "Bill Status"],
      }],
    },
  });

  assert.equal(entry.confidence, "approved");
  assert.equal(entry.safeForChatbot, true);
  assert.equal(entry.sourceType, "brs-system-workflow");
});

test("learned workflow answers are included in searchable knowledge content", () => {
  const entry = normaliseKnowledgeEntry({
    sourceType: "brs-system-workflow",
    title: "Learned workflow: membership bill",
    workflow: "membership bill",
    userNeed: "how do i create a membership bill",
    answerPattern: "Open Memberships, choose Billing, then use Create Bills.",
    confidence: "approved",
  });

  assert.match(entry.content, /User need: how do i create a membership bill/);
  assert.match(entry.content, /Approved answer pattern: Open Memberships/);
});
