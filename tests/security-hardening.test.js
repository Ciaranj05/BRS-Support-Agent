import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthContext, canRunBotAction } from "../lib/security/authContext.js";
import { getCorsOptions } from "../lib/middleware/security.js";
import { wantsChatDebug } from "../services/chat/chatPayloadService.js";

const ENV_KEYS = [
  "BRS_ALLOWED_ORIGINS",
  "BRS_BOT_REQUIRE_AUTH",
  "BRS_CHAT_DEBUG",
  "BRS_CHAT_DEBUG_SECRET",
  "BRS_CLUB_ID",
  "BRS_LOCAL_CLUB_ID",
  "BRS_LOCAL_PERMISSIONS",
  "BRS_LOCAL_ROLES",
  "BRS_LOCAL_USER_ID",
  "NODE_ENV",
  "QA_ANALYSIS_SECRET",
  "VERCEL",
];

function withEnv(values, fn) {
  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

function checkOrigin(options, origin) {
  return new Promise((resolve) => {
    options.origin(origin, (error, allowed) => resolve({ error, allowed }));
  });
}

test("production public chat stays open but ignores spoofable body/query context", () => {
  withEnv({ VERCEL: "1" }, () => {
    const context = resolveAuthContext({
      headers: {},
      body: { clubId: "body-club", userId: "body-user", permissions: ["bot:actions"] },
      query: { clubId: "query-club", userId: "query-user" },
    });

    assert.equal(context.authRequired, false);
    assert.equal(context.isAuthenticated, true);
    assert.equal(context.clubId, "local-demo-club");
    assert.equal(context.userId, "local-prototype-user");
    assert.deepEqual(context.permissions, []);
    assert.equal(canRunBotAction(context, "timesheet.configure"), false);
  });
});

test("explicit production auth requires signed context and ignores body/query context", () => {
  withEnv({ VERCEL: "1", BRS_BOT_REQUIRE_AUTH: "true" }, () => {
    const context = resolveAuthContext({
      headers: {},
      body: { clubId: "body-club", userId: "body-user", permissions: ["bot:actions"] },
      query: { clubId: "query-club", userId: "query-user" },
    });

    assert.equal(context.authRequired, true);
    assert.equal(context.isAuthenticated, false);
    assert.equal(context.clubId, "");
    assert.equal(context.userId, "");
    assert.deepEqual(context.permissions, []);
  });
});

test("authenticated production headers can carry club and permission context", () => {
  withEnv({ VERCEL: "1", BRS_BOT_REQUIRE_AUTH: "true" }, () => {
    const context = resolveAuthContext({
      headers: {
        authorization: "Bearer test-token",
        "x-brs-club-id": "club-123",
        "x-brs-user-id": "user-456",
        "x-brs-permissions": "timesheet:write",
      },
    });

    assert.equal(context.authRequired, true);
    assert.equal(context.isAuthenticated, true);
    assert.equal(context.clubId, "club-123");
    assert.equal(context.userId, "user-456");
    assert.equal(canRunBotAction(context, "timesheet.configure"), true);
  });
});

test("production chat debug requires an admin/debug secret", () => {
  withEnv({ NODE_ENV: "production", QA_ANALYSIS_SECRET: "qa-secret" }, () => {
    assert.equal(wantsChatDebug({ headers: {}, body: { debug: true }, query: {} }), false);
    assert.equal(wantsChatDebug({ headers: { authorization: "Bearer qa-secret" }, body: { debug: true }, query: {} }), true);
  });
});

test("production CORS rejects arbitrary Vercel preview origins unless explicitly allowed", async () => {
  await withEnv({ NODE_ENV: "production", BRS_ALLOWED_ORIGINS: "https://brs-support-agent.vercel.app" }, async () => {
    const options = getCorsOptions();
    const rejected = await checkOrigin(options, "https://untrusted-preview.vercel.app");
    const accepted = await checkOrigin(options, "https://brs-support-agent.vercel.app");

    assert.equal(Boolean(rejected.error), true);
    assert.equal(accepted.error, null);
    assert.equal(accepted.allowed, true);
  });
});
