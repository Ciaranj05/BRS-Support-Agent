import { tokenize } from "./knowledgeSources.js";

function normalise(value = "") {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(lower = "", terms = []) {
  return terms.some((term) => lower.includes(normalise(term)));
}

function uniqueKey(entry = {}) {
  return entry.id || `${entry.title || ""}|${entry.navigationPath || ""}|${entry.workflowFamily || ""}`;
}

function relationshipTargets(relationship = {}) {
  return [
    relationship.id,
    relationship.workflowId,
    relationship.workflowFamily,
    relationship.family,
    relationship.title,
  ].filter(Boolean).map(normalise);
}

function entrySearchKeys(entry = {}) {
  return [
    entry.id,
    entry.title,
    entry.workflow,
    entry.workflowFamily,
    entry.area,
    entry.navigationPath,
    ...(entry.aliases || []),
    ...(entry.tags || []),
  ].filter(Boolean).map(normalise);
}

function relationshipApplies(relationship = {}, query = "") {
  const lower = normalise(query);
  const includeWhen = relationship.includeWhen || relationship.triggers || [];
  const excludeWhen = relationship.excludeWhen || relationship.exclusions || [];
  if (excludeWhen.length && hasAny(lower, excludeWhen)) return false;
  if (!includeWhen.length) return true;
  return hasAny(lower, includeWhen);
}

function isConfusableUserWorkflow(entry = {}, query = "") {
  const lower = normalise(query);
  const text = normalise([entry.title, entry.workflow, entry.workflowFamily, entry.navigationPath, entry.content].join(" "));
  const asksMemberProfile = hasAny(lower, ["add a member", "create a member", "new member", "member profile", "membership profile"]);
  const asksUserLogin = hasAny(lower, ["staff", "admin", "login", "password", "permission", "privilege", "user account", "new user", "staff user", "read only"]);
  return asksMemberProfile && !asksUserLogin && hasAny(text, ["add a user", "create a new user", "manage users", "user group", "username"]);
}

export function workflowRelationshipScore(query, entry = {}) {
  const lower = normalise(query);
  const familyText = normalise([entry.workflowFamily, entry.workflow, entry.title, ...(entry.aliases || [])].join(" "));
  let bonus = 0;

  if (isConfusableUserWorkflow(entry, query)) bonus -= 40;

  if (
    hasAny(lower, ["add a member", "create a member", "new member", "member profile", "membership profile"]) &&
    hasAny(familyText, ["member profile", "create member", "membership member profile"])
  ) {
    bonus += 30;
  }

  if (
    hasAny(lower, ["staff user", "admin user", "new user", "user account", "login", "password", "permission", "privilege"]) &&
    hasAny(familyText, ["user account", "staff user", "admin user", "login user"])
  ) {
    bonus += 22;
  }

  return bonus;
}

export function expandRelatedKnowledge(scoredEntries = [], allEntries = [], query = "", { limit = 18 } = {}) {
  const byTarget = new Map();
  for (const entry of allEntries) {
    for (const key of entrySearchKeys(entry)) {
      if (!key) continue;
      if (!byTarget.has(key)) byTarget.set(key, []);
      byTarget.get(key).push(entry);
    }
  }

  const output = new Map();
  for (const entry of scoredEntries) output.set(uniqueKey(entry), entry);

  const seeds = scoredEntries
    .filter((entry) => (entry.relatedWorkflows || []).length)
    .slice(0, Math.max(6, limit));

  for (const seed of seeds) {
    for (const relationship of seed.relatedWorkflows || []) {
      if (!relationshipApplies(relationship, query)) continue;
      for (const target of relationshipTargets(relationship)) {
        const matches = byTarget.get(target) || [];
        for (const match of matches) {
          if (match.confidence !== "approved") continue;
          const key = uniqueKey(match);
          const relationshipWeight = Number.isFinite(Number(relationship.weight)) ? Number(relationship.weight) : 4;
          const score = Math.max(1, (seed.score || 1) + relationshipWeight + workflowRelationshipScore(query, match));
          const existing = output.get(key);
          if (!existing || score > existing.score) {
            output.set(key, {
              ...match,
              score,
              relatedFrom: seed.workflowFamily || seed.workflow || seed.title,
              relationshipType: relationship.type || relationship.relation || "related-workflow",
            });
          }
        }
      }
    }
  }

  return [...output.values()]
    .map((entry) => ({ ...entry, score: (entry.score || 0) + workflowRelationshipScore(query, entry) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTokens = new Set(tokenize([a.workflowFamily, a.title, ...(a.aliases || [])].join(" ")));
      const bTokens = new Set(tokenize([b.workflowFamily, b.title, ...(b.aliases || [])].join(" ")));
      const queryTokens = tokenize(query);
      const aExact = queryTokens.filter((token) => aTokens.has(token)).length;
      const bExact = queryTokens.filter((token) => bTokens.has(token)).length;
      return bExact - aExact;
    })
    .slice(0, limit);
}
