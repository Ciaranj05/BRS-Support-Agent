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
    assert.equal(result.options.length, 0);
  }
});

test("does not treat unpaid as a paid payment query", () => {
  const result = answerFromObjectFirstRouting("which members have unpaid bills");
  assert.equal(result.topic, "memberships");
  assert.notEqual(result.reply, "Which payment issue is closest?");
});

test("routes membership bill refunds away from booking refunds", () => {
  const result = answerFromObjectFirstRouting("how do I reverse a payment on a member bill");
  assert.equal(result.topic, "memberships");
  assert.match(result.reply, /member billing\/payment record/);
  assert.doesNotMatch(result.reply, /Tee Sheet >> Tee Time/);
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
  assert.ok(broad.options.some((option) => option.label === "Members"));

  const members = answerFromObjectFirstRouting("how do I charge members for a competition");
  assert.equal(members.topic, "teesheet");
  assert.match(members.reply, /competition purse/);

  const visitors = answerFromObjectFirstRouting("how do visitors pay for an open competition");
  assert.equal(visitors.topic, "teesheet");
  assert.match(visitors.reply, /visitor\/open competition fee setup/);
});
