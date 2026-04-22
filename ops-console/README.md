# WWHT Ops Console

Standalone Next.js app to operate the wwht backend + local worker.
Runs on **port 3200** (trigger-map's console uses 3100 — no conflict).

## Setup

```powershell
cd ops-console
npm install
npm run dev
```

Open <http://localhost:3200>.

## What it shows

- **Backend** card: Vercel service health, Redis, env config, today's prediction status
- **Local Worker** card: worker uptime + active job
- **Generate** controls: trigger Ollama job (force or skip), choose model, clear cached cache
- **Today's Predictions** card: live view of the 4-category JSON

## Login

You'll be asked for:

| Field | Source |
| --- | --- |
| Backend URL | `https://wwht-backend.vercel.app` (default) |
| OPS_KEY | `backend/.ops-key.local.txt` |
| Worker URL | `http://localhost:8788` (default) |
| LOCAL_WORKER_KEY | from `local-worker/.env` |

Credentials are stored in localStorage (this device only).

## Architecture

```
ops-console (3200)  ──► wwht-backend.vercel.app (X-Ops-Key)
                    └─► local-worker (8788, Bearer)
                                      └─► Ollama (11434)
                                      └─► Upstash Redis (writes predictions)
```

The console talks to backend and worker independently — both can be down
without breaking the UI. trigger-map is not touched.
