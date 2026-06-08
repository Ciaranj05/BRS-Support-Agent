# Local chatbot testing

Use a feature branch when changing the chatbot so you can test locally without pushing to `main`.

## Branch workflow

```powershell
git switch codex/test-chatbot-local
```

Make your edits on this branch. To confirm you are not on `main`, run:

```powershell
git status --short --branch
```

## Environment

The app reads local secrets from `.env`.

```powershell
Copy-Item .env.example .env
```

Then edit `.env` and set `OPENAI_API_KEY`. Leave `DATABASE_URL` blank for local testing unless you specifically want to use a Postgres database. When `DATABASE_URL` is blank, feedback is stored locally in `data/feedback-store.json`.

## Start the local server

From the repo root:

```powershell
.\scripts\start-local-chatbot.ps1
```

Keep that terminal open while testing. A running server normally appears to "hang" after it prints the localhost URL; that means it is waiting for browser requests. Press `Ctrl+C` in that terminal when you want to stop it.

The chatbot runs at:

```text
http://localhost:3000
```

The admin dashboard runs at:

```text
http://localhost:3000/admin.html
```

To use a different port:

```powershell
.\scripts\start-local-chatbot.ps1 -Port 3001
```

If this Codex workspace is using the portable Node.js download, run npm commands like this:

```powershell
$env:PATH = "..\node-v24.16.0-win-x64;$env:PATH"
..\node-v24.16.0-win-x64\npm.cmd install
```

## Test before sharing changes

```powershell
npm test
```

If `npm` is not available in this Codex terminal, use the bundled Node executable:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests/*.test.js
```
