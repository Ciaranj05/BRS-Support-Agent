# Chatbot answer flow review

This note summarizes the current chatbot answer flow, knowledge sources, routing order, accuracy strengths, risks, and suggested improvements.

## Short version

The chatbot is not using a single "knowledge base search then answer" path. It has several layers: deterministic shortcuts, decision-tree routes, local approved guidance, Help Center search, crawled BRS system observations, conversation state, and LLM verification.

## Answer flow

When a user asks a question, the bot broadly does this:

1. It receives the message through `/api/chat`.
2. It checks for high-confidence special cases first.
3. If no special case matches, it falls back into `server.js` for broader session, routing, retrieval, answer generation, and verification behavior.

In `api/chat.js`, it catches things like:

- BRS support contact requests
- GolfNow support contact requests
- move/reschedule booking requests
- unavailable future tee times
- direct approved decision-tree answers

If no special case matches, `server.js`:

- tracks session state
- detects the topic
- checks whether clarification is needed
- handles refund/payment escalation flows
- tries direct approved answers
- searches Help Center articles
- builds a grounded LLM answer
- verifies the answer against the supplied sources

There is also a newer wrapper in `server-with-feedback.js`. If the app is run with `npm start`, it tries `lib/knowledgeAnswer.js` and `lib/objectFirstRouting.js` before falling back to `server.js`. On Vercel, because there is an `api/chat.js` file, that serverless route is likely the main deployed chat path.

## Knowledge areas the bot uses

### Global instructions

`data/instructions.txt` controls tone, safety rules, answer format, escalation rules, payment logic, and hard product facts. It is especially strong on:

- moving bookings with Cut from Booking Details, then Paste
- competition charging rules
- avoiding unsupported drag/drop or "Move" guidance
- asking one diagnostic question at a time
- system-first payment checks

### Decision trees

`data/decision-trees` contains topic-specific routing files:

- admin setup
- memberships
- payments
- teesheet
- user management

The code parses `ROUTE`, `MATCH ANY`, and `ANSWER ID` blocks. If every `MATCH ANY` group matches the user's message, it pulls the matching approved answer.

### Approved local knowledge

`data/knowledge` contains approved answers and topic guidance:

- `admin-setup.txt`
- `memberships.txt`
- `payments.txt`
- `teesheet.txt`
- `user-management.txt`
- communication and learning notes

Direct route answers are pulled from `## APPROVED ANSWER: ...` blocks.

### BRS Help Center

The bot searches `https://help.brsgolf.com/api/v2/help_center/articles/search.json`.

It generates keyword searches from the user's question and topic. It fetches up to several Help Center articles, strips HTML, truncates the article body, ranks the results, and includes the best article text in the LLM prompt.

### Crawled BRS system observations

`knowledge/system` contains JSON files extracted from approved or test BRS accounts, for example:

- admin navigation
- dashboard structure
- timesheet day view
- reservation types and statuses
- visible fields, actions, and help text

The repo docs say this should capture reusable product behavior, not club data. That is described in `docs/brs-system-knowledge-ingestion.md`.

### Manual knowledge

`knowledge/manual/brs-system-ingestion-principles.md` sets rules for what crawled system knowledge can safely contain.

### Case history

`data/case-history` is intended as a lower-priority reference layer. The README says case history is not the source of truth and should only support the bot when approved guidance is missing.

## How it decides what to use

The strongest ordering found is:

1. Deterministic hard-coded answers for risky or common flows
2. Clarification if the question is broad or audience-dependent
3. Direct approved answers from decision trees and `data/knowledge`
4. Help Center article search
5. Approved local support guidance
6. Crawled system product knowledge
7. Grounded LLM answer
8. LLM verifier checks whether the answer is supported
9. If unsupported, return "I don't have enough confirmed information..."

That last verifier is important. The bot does not just ask GPT to answer; it asks GPT again to judge whether the answer is grounded in the supplied BRS sources.

## Current accuracy strengths

The bot is strongest where there is explicit routing or approved answer content:

- move booking workflow
- BRS and GolfNow contact questions
- booking refunds
- missing payment or no transaction escalation
- competition member versus visitor charging
- admin or staff user creation
- membership bill versus booking refund separation
- unpaid member bills and report routing

It also has useful guardrails against common bad answers, especially around competition charging and moving bookings.

## Main accuracy risks

The biggest risk is inconsistent routing between the newer and older paths.

There are two answer pipelines:

- `api/chat.js` plus `server.js`
- `server-with-feedback.js` plus `lib/knowledgeAnswer.js` plus `lib/objectFirstRouting.js` plus fallback to `server.js`

Some improvements exist in the newer lib pipeline, especially object-first routing for memberships, reports, and refunds. But if production is using `api/chat.js` directly, those newer checks may not run first.

Other risks:

- Topic detection is mostly keyword-based.
- There is no committed `knowledge/knowledge-index.json`, so retrieval falls back to raw source files.
- Help Center ranking is lightweight keyword scoring, not embeddings or vector search.
- Some deterministic object-first replies are helpful but may be too broad if the exact UI path varies.
- Case history exists but does not appear deeply integrated into the main answer path.
- The bot relies heavily on LLM classification and verification, which helps flexibility but makes exact behavior harder to audit unless logs capture retrieved evidence.

## Best improvements

1. Unify the chat entrypoint so the same routing logic runs in local and production.
2. Commit or generate `knowledge/knowledge-index.json` during deploy so retrieval is predictable.
3. Add an audit/debug mode that logs:
   - detected topic
   - matched direct route
   - clarification profile
   - Help Center queries
   - articles retrieved
   - local or system knowledge entries used
   - verifier result
4. Add eval tests with real support questions and expected source paths.
5. Promote repeated successful case-history patterns into approved `data/knowledge` blocks.
6. Consider embedding or vector retrieval for Help Center plus approved knowledge, then keep the current verifier as a safety layer.

Overall, the bot has good safety instincts and several strong approved-answer paths, but its accuracy will depend heavily on which entrypoint is deployed and whether retrieval evidence is logged and tested.
