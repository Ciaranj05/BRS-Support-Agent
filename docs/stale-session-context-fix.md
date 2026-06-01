# Stale session context reset fix

The application should reset issue-specific session context before handling a new standalone typed question after a completed answer. This prevents prior clarification selections, such as member or visitor, from influencing the next support question.

Required behavior:
- New typed question after an answer starts a fresh issue.
- Clarification answers continue the active issue.
- Resolution actions still reset the session.
