import { loadKnowledgeBase, scoreKnowledgeEntry } from "./knowledgeSources.js";
import { loadApprovedLearnedWorkflows } from "./learnedWorkflowStore.js";
import { expandRelatedKnowledge, workflowRelationshipScore } from "./workflowRelationships.js";

export async function retrieveKnowledge(query, { limit = 6, indexPath } = {}) {
  const [staticEntries, learnedEntries] = await Promise.all([
    loadKnowledgeBase(indexPath),
    indexPath ? Promise.resolve([]) : loadApprovedLearnedWorkflows(),
  ]);
  const entries = [...learnedEntries, ...staticEntries];
  const approvedEntries = entries.filter((entry) => entry.confidence === "approved");
  const scoredEntries = approvedEntries
    .map((entry) => ({ ...entry, score: scoreKnowledgeEntry(query, entry) + workflowRelationshipScore(query, entry) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return expandRelatedKnowledge(scoredEntries, approvedEntries, query, { limit })
    .filter((entry) => entry.score > 0)
    .slice(0, limit);
}

export function formatRetrievedSources(entries = []) {
  return entries.map((entry, index) => [
    `Source ${index + 1}: ${entry.title}`,
    entry.navigationPath ? `Path: ${entry.navigationPath}` : null,
    entry.sourceType ? `Type: ${entry.sourceType}` : null,
    entry.sourceUrl ? `URL: ${entry.sourceUrl}` : null,
    entry.content,
  ].filter(Boolean).join("\n")).join("\n\n");
}
