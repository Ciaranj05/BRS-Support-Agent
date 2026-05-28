# Salesforce Case History Reference Layer

This folder stores cleaned Salesforce email cases for reference only.

Case history is not the source of truth. It should support the bot only when there is no approved answer or direct decision-tree route.

Answer priority:

1. Decision-tree direct routes
2. Approved answer blocks in `data/knowledge/`
3. Topic knowledge files
4. Salesforce case history examples
5. Clarification or escalation

Rules:

- Approved knowledge always wins over case history.
- Case history must not overwrite or contradict approved answers.
- If a case conflicts with approved knowledge, ignore the case and flag it for review.
- Case history should help identify patterns and suggested troubleshooting steps.
- Good repeated cases should later be promoted into approved knowledge and decision-tree routes.
