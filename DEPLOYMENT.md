# DryLog PRO Online Test Setup

This is the quickest path to get the current DryLog PRO build online so it can be opened from a phone, tablet, or another computer.

## Best Test Host

Use Render as a Node web service for the first online test.

GitHub Pages is not enough for this version because the app uses local API routes. Render can run the mock server that already serves both the app screen and the test API.

## What This Deploys

- The current DryLog PRO web app
- The mock job data
- The CAD/sketch screen
- Readings, materials, drying graphs, photo hub, and report preview

Important: this is still a test build. The data is stored in memory, so it can reset when the service restarts or redeploys.

## Step 1: Push The Project To GitHub

Make sure these are included in the GitHub repository:

- `frontend/`
- `tools/`
- `backend/`
- `package.json`
- `README.md`
- `ROADMAP.md`
- `DEPLOYMENT.md`

Repository:

`https://github.com/wellmanrick/DryLogPro-Test-.git`

## Step 2: Create The Render Service

1. Go to Render.
2. Choose New.
3. Choose Web Service.
4. Connect the GitHub repository.
5. Select the DryLogPro test repository.

Use these settings:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm run dev:mock`
- Branch: `main`

Render provides the live website URL after the first deploy finishes.

## Step 3: Test The Live App

Open the Render URL and test:

1. Select the Miller Residence demo claim.
2. Open the job command screen.
3. Add readings.
4. Open Sketch.
5. Try room templates, connectors, and scan import.
6. Open Report and review the packet preview.

Health check URL:

`https://your-render-url.onrender.com/api/health`

If that page returns a small JSON response, the app is running.

## Current Limitations

- No real login yet
- No permanent database yet
- Photos are mock/demo only
- Data can reset after restart
- No production file storage yet

## Next Cloud Upgrade

For a real testing pilot, the next step is to add:

- User login
- A real database
- Photo/document storage
- Job invite links
- Field user roles
- Company/admin settings
- Backup/export workflow

