# BRS live lookup worker

This is the free/low-cost browser runtime for live BRS workflow lookup.

The main Vercel chatbot should stay on Vercel. This worker should run somewhere that can install and launch Chromium, such as Render, Railway, Fly.io, or a small VPS. The worker only performs read-only browsing and blocks non-GET browser requests.

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
BRS_BASE_URL=https://brsgolf.com
BRS_USERNAME=your-rotated-brs-username
BRS_PASSWORD=your-rotated-brs-password
BRS_LIVE_WORKER_SECRET=a-long-random-shared-secret
BRS_LIVE_LOOKUP_TIMEOUT_MS=45000
```

6. Copy the Render service URL, then add these environment variables in Vercel:

```text
BRS_LIVE_LOOKUP_ENABLED=true
BRS_LIVE_WORKER_URL=https://your-render-service.onrender.com
BRS_LIVE_WORKER_SECRET=the-same-long-random-shared-secret
```

Leave `BRS_LIVE_BROWSER_WS_ENDPOINT` blank unless you decide to use a paid browser websocket provider instead.

## Health check

Open:

```text
https://your-render-service.onrender.com/health
```

You should see `ok: true` and `credentialsConfigured: true`.
