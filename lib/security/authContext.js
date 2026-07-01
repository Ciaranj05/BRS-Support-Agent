function isProductionRuntime() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function isAuthRequired() {
  const flag = String(process.env.BRS_BOT_REQUIRE_AUTH || "").toLowerCase();
  if (flag === "true") return true;
  return false;
}

function isPublicReadOnlyChatAllowed() {
  return String(process.env.BRS_BOT_PUBLIC_CHAT_ENABLED || "true").toLowerCase() !== "false";
}

export class AuthContextError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = "AuthContextError";
    this.status = status;
  }
}

function firstValue(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function listFrom(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function resolveAuthContext(req = {}) {
  const headers = req.headers || {};
  const body = req.body || {};
  const query = req.query || {};
  const authRequired = isAuthRequired();
  const productionRuntime = isProductionRuntime();
  const authHeader = firstValue(headers.authorization);
  const publicReadOnlyFallback = authRequired && isPublicReadOnlyChatAllowed() && !authHeader;
  const localClubFallback = authRequired && !publicReadOnlyFallback ? "" : "local-demo-club";
  const localUserFallback = authRequired && !publicReadOnlyFallback ? "" : "local-prototype-user";
  const clubId = authRequired
    ? firstValue(headers["x-brs-club-id"], process.env.BRS_CLUB_ID, localClubFallback)
    : productionRuntime
      ? firstValue(process.env.BRS_LOCAL_CLUB_ID, process.env.BRS_CLUB_ID, localClubFallback)
    : firstValue(headers["x-brs-club-id"], body.clubId, query.clubId, process.env.BRS_LOCAL_CLUB_ID, process.env.BRS_CLUB_ID, localClubFallback);
  const userId = authRequired
    ? firstValue(headers["x-brs-user-id"], process.env.BRS_LOCAL_USER_ID, localUserFallback)
    : productionRuntime
      ? firstValue(process.env.BRS_LOCAL_USER_ID, localUserFallback)
    : firstValue(headers["x-brs-user-id"], body.userId, query.userId, process.env.BRS_LOCAL_USER_ID, localUserFallback);
  const permissions = authRequired
    ? listFrom(headers["x-brs-permissions"])
    : productionRuntime
      ? []
    : listFrom(headers["x-brs-permissions"] || body.permissions || process.env.BRS_LOCAL_PERMISSIONS);
  const roles = authRequired
    ? listFrom(headers["x-brs-roles"])
    : productionRuntime
      ? []
    : listFrom(headers["x-brs-roles"] || body.roles || process.env.BRS_LOCAL_ROLES);

  return {
    authRequired,
    isAuthenticated: !authRequired || Boolean(authHeader && userId) || publicReadOnlyFallback,
    clubId,
    userId,
    permissions,
    roles,
    source: authHeader ? "authorization-header" : (publicReadOnlyFallback ? "public-read-only" : "local-placeholder"),
  };
}

export function assertBotAccess(authContext = {}) {
  if (!authContext.isAuthenticated) {
    throw new AuthContextError("You must be signed in to BRS to use the support agent.", 401);
  }

  if (!authContext.clubId) {
    throw new AuthContextError("The support agent needs a BRS club context before it can answer this request.", 403);
  }
}

export function canRunBotAction(authContext = {}, actionType = "") {
  if (!authContext.authRequired && isProductionRuntime()) return false;
  if (!authContext.authRequired) return true;
  if (!authContext.isAuthenticated) return false;

  const permissions = new Set((authContext.permissions || []).map((permission) => permission.toLowerCase()));
  const roles = new Set((authContext.roles || []).map((role) => role.toLowerCase()));

  if (permissions.has("bot:actions") || roles.has("superuser") || roles.has("admin")) return true;

  if (actionType === "timesheet.configure") {
    return permissions.has("timesheet:configure") || permissions.has("timesheet:write");
  }

  return false;
}
