import assert from "node:assert/strict";
import test from "node:test";
import { answerFromObjectFirstRouting } from "../lib/objectFirstRouting.js";

test("routes unpaid member bill report variants to memberships", () => {
  const variants = [
    "find me a report that shows all members with unpaid bills",
    "where can I list members with outstanding bill balances",
    "show unpaid membership invoices",
  ];

  for (const message of variants) {
    const result = answerFromObjectFirstRouting(message);
    assert.equal(result.topic, "memberships");
    assert.match(result.reply, /Memberships >> Reports/);
    assert.equal(result.routeStrength, "generic");
    assert.doesNotMatch(result.reply, /BRS Payments|booking payments|competition purse/);
    assert.equal(result.options.length, 0);
  }
});

test("does not treat unpaid as a paid payment query", () => {
  const result = answerFromObjectFirstRouting("which members have unpaid bills");
  assert.equal(result.topic, "memberships");
  assert.notEqual(result.reply, "Which payment issue is closest?");
});

test("lets clarification answers continue through stateful chat routing", () => {
  const result = answerFromObjectFirstRouting("Clarification answer: Member bill issue");
  assert.equal(result, null);
});

test("lets action-led membership questions use approved knowledge instead of category buttons", () => {
  const variants = [
    "how do I create a bill",
    "how do I create a membership bill",
    "add a bill for a member",
    "how do I cancel a subscription",
    "set up a payment scheme",
    "change a member invoice",
  ];

  for (const message of variants) {
    const result = answerFromObjectFirstRouting(message);
    assert.equal(result, null);
  }
});

test("uses user-task wording for unclear membership billing prompts", () => {
  const result = answerFromObjectFirstRouting("membership billing issue");
  assert.equal(result.topic, "memberships");
  assert.equal(result.reply, "What are you trying to do for the member?");
  assert.ok(result.options.some((option) => option.label === "Create or change a bill"));
  assert.ok(result.options.some((option) => option.label === "I'm not sure"));
  assert.ok(result.options.every((option) => option.clarificationId === "membership-issue"));
  assert.ok(!result.options.some((option) => option.label === "Bill"));
});

test("routes membership bill refunds away from booking refunds", () => {
  const variants = [
    "how do I reverse a payment on a member bill",
    "how do I refund a bill",
    "how do I refund an invoice",
  ];

  for (const message of variants) {
    const result = answerFromObjectFirstRouting(message);
    assert.equal(result.topic, "memberships");
    assert.match(result.reply, /Refund a Payment on a Membership Bill/);
    assert.match(result.reply, /taken through BRS Payments/);
    assert.match(result.reply, /cannot be refunded through BRS/);
    assert.doesNotMatch(result.reply, /rather than|do not use/i);
    assert.doesNotMatch(result.reply, /Tee Sheet >> Tee Time/);
    assert.doesNotMatch(result.reply, /BRS Payments >> Refunds/);
    assert.equal(result.options.length, 0);
  }
});

test("routes wallet and flexi member variants to memberships", () => {
  const wallet = answerFromObjectFirstRouting("how do I add a wallet to a member profile");
  assert.equal(wallet.topic, "memberships");
  assert.match(wallet.reply, /Account Balances/);

  const flexi = answerFromObjectFirstRouting("I have flexi enabled, how do I add a flexible member");
  assert.equal(flexi.topic, "memberships");
  assert.match(flexi.reply, /flexi\/flexible membership/);
});

test("routes competition payment variants by competition audience", () => {
  const broad = answerFromObjectFirstRouting("how do I charge people for a competition");
  assert.equal(broad.topic, "teesheet");
  assert.equal(broad.reply, "Who are you charging for the competition?");
  assert.equal(broad.routeStrength, "guardrail");
  assert.ok(broad.options.some((option) => option.label === "Members"));

  const members = answerFromObjectFirstRouting("how do I charge members for a competition");
  assert.equal(members.topic, "teesheet");
  assert.equal(members.routeStrength, "guardrail");
  assert.match(members.reply, /competition purse/);
  assert.match(members.reply, /charges/i);
  assert.doesNotMatch(members.reply, /membership bill/i);

  const visitors = answerFromObjectFirstRouting("how do visitors pay for an open competition");
  assert.equal(visitors.topic, "teesheet");
  assert.equal(visitors.routeStrength, "guardrail");
  assert.match(visitors.reply, /visitor\/open competition fee setup/);
});
