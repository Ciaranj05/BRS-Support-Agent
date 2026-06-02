# Dynamic routing plan

The support agent should route questions by evidence rather than fixed keyword paths.

Core flow:
1. Classify the latest user intent and product object.
2. Retrieve from all available sources: Help Center, approved local guidance, and demo/admin-site observations when present.
3. Rank evidence by topic/object fit.
4. Penalise cross-topic matches, for example competition purse content for membership bill questions.
5. Answer from matching evidence only.
6. Ask a clarification question only when the evidence is genuinely ambiguous.

This prevents membership billing questions from being answered with competition purse guidance and avoids forcing bill refunds into booking refund flows.