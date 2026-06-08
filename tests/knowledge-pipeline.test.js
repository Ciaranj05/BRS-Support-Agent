import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildKnowledgeBase } from "../scripts/build-knowledge-base.js";
import { retrieveKnowledge } from "../lib/retrieval.js";

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
