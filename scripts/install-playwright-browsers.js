import { spawnSync } from "child_process";
import path from "path";

const shouldInstall = process.env.VERCEL === "1" || process.env.INSTALL_PLAYWRIGHT_BROWSERS === "true";

if (!shouldInstall) {
  console.log("Skipping Playwright browser install outside deployment.");
  process.exit(0);
}

process.env.PLAYWRIGHT_BROWSERS_PATH ||= "0";

const cliPath = path.join(process.cwd(), "node_modules", "playwright", "cli.js");
const result = spawnSync(process.execPath, [cliPath, "install", "chromium"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
