# BRS live lookup worker

This is the free/low-cost browser runtime for live BRS workflow lookup.

The main Vercel chatbot should stay on Vercel. This worker should run somewhere that can install and launch Chromium, such as Render, Railway, Fly.io, or a small VPS. The worker only performs read-only browsing and blocks non-GET browser requests.

The worker also powers the chatbot's opt-in "Still can't find it?" screenshot button. Screenshots are captured directly from the configured BRS demo system after login. The worker redacts obvious emails, phone numbers, amounts, and dates before returning the screenshot. The chatbot should not use static SVG mock-ups or generated illustrative images for BRS UI guidance.

## Render setup

1. Create a new Render Web Service from this repo.
2. Set the root directory to `browser-worker`.
3. Set the build command to:

```text
npm install
```

4. Set the start command to:

```text
npm start
```

5. Add these environment variables in Render:

```text
BRS_BASE_URL=https://www.brsgolf.com/amysgolfclub
BRS_CLUB_ID=amysgolfclub
BRS_USERNAME=your-rotated-brs-username
BRS_PASSWORD=your-rotated-brs-password
BRS_LIVE_WORKER_SECRET=a-long-random-shared-secret
BRS_LIVE_LOOKUP_TIMEOUT_MS=45000
BRS_LIVE_LOOKUP_STAGE_TIMEOUT_MS=12000
```

6. Copy the Render service URL, then add these environment variables in Vercel:

```text
BRS_LIVE_LOOKUP_ENABLED=true
BRS_LIVE_WORKER_URL=https://your-render-service.onrender.com
BRS_LIVE_WORKER_SECRET=the-same-long-random-shared-secret
```

Leave `BRS_LIVE_BROWSER_WS_ENDPOINT` blank unless you decide to use a paid browser websocket provider instead.

`BRS_BASE_URL` should include the club path. If you only set the host, also set `BRS_CLUB_ID`; the worker will normalize the target to `https://www.brsgolf.com/{clubId}` so it opens the authenticated club system rather than the public BRS website.

## Health check

Open:

```text
https://your-render-service.onrender.com/health
```

You should see `ok: true` and `credentialsConfigured: true`.

## Verified screenshot endpoint

The chatbot calls this endpoint when a user opts in to a screenshot:

```text
POST /screenshot
```

It uses the same `x-brs-live-worker-secret` header as `/lookup`.
