import fs from "fs/promises";
import path from "path";
import { answerFromKnowledgeDetailed } from "../lib/knowledgeAnswer.js";

const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "end-user-example-comparison");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");

const examples = [
  {
    id: "prorated-member-bill",
    question: "Good morning I need to create a bill for a new member who's joining 3 months into a 2 year deal(red tee deal)so it will be a prorata bill. His first year will run from 1/7/2026 until 31/3/27 so 9 months at GBP30 a month can you advise me how to raise this bill please. Kind regards",
    previousAnswer: `Raise the prorated membership bill

For this one new member prorated bill (GBP30, 1/7/2026, 31/3/27, 3 months, 2 year, 9 months), use "Memberships", not the Timesheet. In this example, 9 months at GBP30 is GBP270.
Open "Memberships" > "Members", create or find the member profile, set the correct "Membership Type" for the deal, set the membership dates from 1/7/2026 to 31/3/27, then save the profile.
From that member profile, open the member billing/bills area and choose the create/add bill or charge option for that individual member.
Use a clear "Billing Reference" or description such as "Red Tee prorata 1/7/2026-31/3/27", set the "Due Date" the club wants, and set the bill/period dates to the prorated dates rather than the full annual cycle.
On the line item/subscription step, choose the correct membership subscription if it exists, or use "ADD ITEM" for a one-off prorated membership charge. Enter the item description, quantity 1, and amount GBP270.
Leave "Payment Schemes" blank unless the club wants instalments or scheduled payments for this bill.
Use "PREVIEW" before confirming. Check the member, reference/description, due date, bill period, line item, amount, payment scheme, publish status, and total.
Use "Memberships" > "Billing/Payments" > "CREATE BILLS" only if the club prefers the batch route; in "Who To Bill", select only this member and check the preview before publishing.
Escalate if the checks do not resolve it.`,
  },
  {
    id: "missing-tour-operator-contact",
    question: "HI We keep a list of our Tour operators and Hotels that we do business with in the Contact area in each site ie Troon, Ayr and Carrick. There should be 20 Tour Operators and 5 Hotels in each site. On three occasions this week, we have noticed that the odd contact has disappeared out of the contacts page, ie to-day, we only have 19 Tour operators in the Ayr site, as A company Called Golf Around Scotland have disappeared from the list. Look forward to hearing back from you.",
    previousAnswer: `Check the missing contact record

For the missing contact issue (5 Hotels, 20 Tour Operators, 19 Tour operators, we only have 19, Tour Operators, Golf Around Scotland), start in "Contacts" and do not assume the record has been deleted until the filters have been checked.
Use "View All" or the full contacts list, then search for the company/person name and clear any category, site, or status filters that could hide it.
Filter by the expected "Contact Categories" such as "Tour Operator" or "Hotel" and compare the count for each affected site.
If the record is found under a different category/site, correct the contact record. If it is not found at all, check whether a user with access to "Contacts" or "Contact Categories" changed the record or category setup.
For reporting or evidence, use contact-related reports such as contact details or revenue by tour operator/hotel where the club needs an export.
Escalate with the site, category, missing record name, expected count, current count, and a screenshot of the filtered Contacts page.`,
  },
  {
    id: "member-guest-count-report",
    question: "Hi, Could you tell me if it is possible to run a report showing how many guests a member has booked in over a specified period of time?",
    previousAnswer: `I do not have a complete verified BRS workflow for that yet, so I should not give steps that may be wrong.

I am escalating this to BRS Support. Please include the BRS area you were working in, what you were trying to do, and a screenshot of the page where you got stuck.`,
  },
  {
    id: "competition-purse-insufficient-funds",
    question: "Hi We have a problem with three users - and there may be more. They have EUR30 - EUR32 in their purse but they are getting a message to say they cannot enter a competition because they have insufficient funds. The competition is EUR20 and they should be allowed. In the office we can see it says the name of the competition and (Cancelled) after it. We did have a competition with the same name (Presidents Prize) that we had to cancel after day 1 because of weather. We would be grateful if you could look into this for us please.",
    previousAnswer: `Check the competition purse block

I cannot inspect or change the club's live BRS records from this chat, so use the checks below before making changes.

For the competition purse problem (EUR30 - EUR32, EUR20, (Cancelled), Presidents Prize), first confirm the active competition record is the one members are entering, especially if there is a cancelled competition with the same name.
In the member competition setup, check the entry fee, charge method, purse/wallet setting, member entry status, and whether the visible competition name includes "(Cancelled)".
Check the affected member in "Competition Purse Transactions" or the member competition purse history for pending or already-processed charges that could reduce the usable balance.
Open "System Configuration" and check the "Competition Purse Module" setting called "Minimum member competition purse balance". If the member would fall below that minimum after the entry fee, BRS can block the entry even when the visible purse balance is above the fee.
Use "Process Competition Charges" only after the competition is over/closed and only for competitions set up to use "Competition Purse" or "Competition Wallet".
If the checks do not explain it, escalate with the competition ID/name/date, whether there is a cancelled duplicate, the member entry fee, the member purse balance, relevant purse transactions, and the minimum balance setting.`,
  },
  {
    id: "nine-hole-golfnow-availability",
    question: "Good Morning, We are having a problem with our booking system for our 5 day members on our Parkland Course. From tomorrow our Parkland course is dropping to a 9 hole golf course (no longer an 18 hole golf course) - all the rates and booking rules are in place but for some reason our 5 Day Members cannot book. Also on your Golf Now Website - we cant see any of our available tee times for the 9 holes and your hot deals are showing as 18 holes for visitors to book and these needs showing as 9 holes and all our availability needs showing? Please can you look into this for us? Thank you",
    previousAnswer: `Check the competition purse block

I cannot inspect or change the club's live BRS records from this chat, so use the checks below before making changes.

For the competition purse problem (EUR30 - EUR32, EUR20, (Cancelled), Presidents Prize), first confirm the active competition record is the one members are entering, especially if there is a cancelled competition with the same name.
In the member competition setup, check the entry fee, charge method, purse/wallet setting, member entry status, and whether the visible competition name includes "(Cancelled)".
Check the affected member in "Competition Purse Transactions" or the member competition purse history for pending or already-processed charges that could reduce the usable balance.
Open "System Configuration" and check the "Competition Purse Module" setting called "Minimum member competition purse balance". If the member would fall below that minimum after the entry fee, BRS can block the entry even when the visible purse balance is above the fee.
Use "Process Competition Charges" only after the competition is over/closed and only for competitions set up to use "Competition Purse" or "Competition Wallet".
If the checks do not explain it, escalate with the competition ID/name/date, whether there is a cancelled duplicate, the member entry fee, the member purse balance, relevant purse transactions, and the minimum balance setting.`,
  },
  {
    id: "flex-member-linked-user",
    question: "Hope you are well today. We have a flexible member Alban Sayers member number 5480. He appears in BRS users but its not filtered across to Flexible memberships - can you take a look a please. Best Regards",
    previousAnswer: `Check the linked flexible member record

I cannot inspect or change the club's live BRS records from this chat, so use the checks below before making changes.

For the flexible member sync issue (today, member number 5480, Alban Sayers, Best), treat "Users" and "Memberships" as linked records, but do not assume the Memberships profile exists just because the user account exists.
Open "Users" first and find the BRS user record by name or member number. Check whether it is linked to a Memberships member profile.
If the linked member profile exists, check its "Membership Type" and confirm it is a flexible/flexi type. In "Memberships" > "Membership Types", the type should have the "Flex" flag enabled.
If the member is not appearing in the flexible membership dashboard/filter, check the Memberships dashboard "FLEX MEMBERS" view and the member filters after confirming the membership type.
If the user exists but no linked member profile appears in "Memberships", check "Club Systems" mapping/import settings such as "Member Category Mapping" and preview/sync behaviour before creating a duplicate profile.
Escalate with the user record, member number, linked profile status, membership type, and whether the Club Systems mapping preview shows the member.`,
  },
  {
    id: "booking-payment-payout-dispute",
    question: "Good afternoon. Please can you assist. I have a customer who made a booking on Saturday the 27th Jun 2026 for golf on Sunday 27th June at 9.40am x 4 people through BRS REF 21494 Name: Jack Dunning. On my BRS System it says the balance is outstanding. Under this reference 21494 I did not receive a payout in payout schedule. The customer has stated that the payment has gone through and is seeking a partial refund. However to me it looks like the customer payment did not go though at all. Can you confirm if these funds were successful in payment and if so that they will be applied. Or provide confirmation that payment was unsuccessful",
    previousAnswer: `Check This Case Before Applying a Workflow

I cannot inspect the club's live BRS data from this chat. For this question, use the details provided (BRS REF, Jack Dunning On, BRS System) to check payments, timesheet rather than applying the first matching workflow.

Start by identifying the exact BRS record, date range, user/member/contact/booking, and screen where the mismatch appears.
Check the relevant workflow evidence against those details before applying a setup or payment change.
Confidence: medium. I can give the checks to run, but the exact cause depends on the club's live configuration and records.`,
  },
  {
    id: "open-competition-withdrawn-payment-reconciliation",
    question: "Dear BRS, We ran a tournament called seniors open on Thursday 18th June 2026 - we had set this up as to take online payments. We are trying to reconcile the tournament entries however we had a number of golfers who signed up had withdrawn their entries however there was a policy of no refunds within 4 weeks. This means when we are counting entries our figures are not adding up. Is there a way to run debit card entry report or total payment entry even if the members name is not the tee sheet. Kind regards,",
    previousAnswer: `Check This Case Before Applying a Workflow

I cannot inspect the club's live BRS data from this chat. For this question, use the details provided (Thursday 18th June 2026, 4 weeks, Dear BRS) to check competitions, memberships, payments, timesheet, reports rather than applying the first matching workflow.

Open the relevant competition record and confirm the active competition is the one users are entering, especially if there is a cancelled or duplicate competition with the same name.
Check the entry fee, purse/payment setting, member entry status, and competition transaction history for one affected member before changing any charge.
Start from booking/member-guest reporting rather than membership balances. Filter by member/player and date range, then export if the report supports it.
Check competition entries, withdrawn/cancelled entries, and BRS Payments transactions separately; the tee sheet alone will not prove all paid entries.
Use transaction/refund/payment exports for the payment total, then compare that against the competition entry list and withdrawal policy.`,
  },
  {
    id: "broad-reporting-help",
    question: "Hope you are keeping well. Please see the below email to your service desk. If available I would like to get some time with you to see if I can utilise the reporting functions better within Golfnow/BRS, is this something you can help with?",
    previousAnswer: `How to Use Reporting Functions in GolfNow/BRS

Yes, I can help you get started with using the reporting functions in GolfNow/BRS. Here are the main steps to access and utilise reports in BRS:

Open "Reports" in the Main Navigation Menu. Select a Report Type. Set Your Report Filters. Run the Report. Export or Print Results.

Specialist Reports: For membership billing or member-specific reports, open "Memberships" and then choose "Reports" instead of the main Reports area. For payment processor or online payment reports, go to "Tools" and select "BRS Payments".`,
  },
];

function normalizeForOverlap(value = "") {
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 3));
}

function overlapRatio(a = "", b = "") {
  const left = normalizeForOverlap(a);
  const right = normalizeForOverlap(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return Number((overlap / Math.max(left.size, right.size)).toFixed(3));
}

function firstLine(value = "") {
  return String(value).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function fenced(value = "") {
  return "```text\n" + String(value || "").trim() + "\n```";
}

async function main() {
  const outputDir = path.join(OUTPUT_ROOT, RUN_ID);
  await fs.mkdir(outputDir, { recursive: true });
  const results = [];
  for (const example of examples) {
    const result = await answerFromKnowledgeDetailed(example.question, { allowDynamic: true });
    const currentAnswer = result?.reply || "(no answer returned)";
    results.push({
      ...example,
      currentAnswer,
      route: result?.route || null,
      intent: result?.intent || null,
      answerComposition: result?.answerComposition || null,
      previousTitle: firstLine(example.previousAnswer),
      currentTitle: firstLine(currentAnswer),
      overlapRatio: overlapRatio(example.previousAnswer, currentAnswer),
      changed: example.previousAnswer.trim() !== currentAnswer.trim(),
    });
  }
  const payload = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    openAiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
    note: process.env.OPENAI_API_KEY
      ? "Full dynamic local answer generation was available."
      : "OPENAI_API_KEY was not present, so this run used the repository's local fallback/contextual pipeline rather than full production dynamic generation.",
    results,
  };
  await fs.writeFile(path.join(outputDir, "comparison.json"), `${JSON.stringify(payload, null, 2)}\n`);
  const markdown = [
    `# End User Example Comparison`,
    ``,
    `Generated: ${payload.generatedAt}`,
    ``,
    `Environment: ${payload.note}`,
    ``,
    ...results.flatMap((item, index) => [
      `## ${index + 1}. ${item.id}`,
      ``,
      `Route: ${item.route || "none"}`,
      ``,
      `Previous title: ${item.previousTitle || "(none)"}`,
      ``,
      `Current title: ${item.currentTitle || "(none)"}`,
      ``,
      `Token overlap ratio: ${item.overlapRatio}`,
      ``,
      `### Question`,
      fenced(item.question),
      ``,
      `### Previous Answer`,
      fenced(item.previousAnswer),
      ``,
      `### Current Answer`,
      fenced(item.currentAnswer),
      ``,
    ]),
  ].join("\n");
  await fs.writeFile(path.join(outputDir, "comparison.md"), `${markdown}\n`);
  console.log(JSON.stringify({ outputDir, count: results.length, openAiKeyPresent: payload.openAiKeyPresent, routes: results.map((item) => ({ id: item.id, route: item.route, previousTitle: item.previousTitle, currentTitle: item.currentTitle, overlapRatio: item.overlapRatio })) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
