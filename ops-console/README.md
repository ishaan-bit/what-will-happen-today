# WWHT Ops Console

Standalone Next.js app to operate the wwht backend + local worker.
Runs on **port 3400**.

## Quick start

```powershell
cd ops-console
npm install
npm run dev
```

Open <http://localhost:3400>. **No login required** — the console
auto-bootstraps creds from disk:

| Cred              | Source                                   |
| ----------------- | ---------------------------------------- |
| Backend URL       | `https://wwht-backend.vercel.app`        |
| `OPS_KEY`         | `../backend/.ops-key.local.txt`          |
| Worker URL        | `http://localhost:8788`                  |
| `LOCAL_WORKER_KEY`| `../local-worker/.env`                   |

If both files exist, the dashboard loads immediately. Otherwise you'll
get the manual login form.

## What it shows

- **Backend** card: Vercel service health, Redis, env config, today's prediction status
- **Local Worker** card: worker uptime + active job (auto-refresh every 8s)
- **Generate** controls: trigger Ollama job (force or skip), pick model, clear cache
- **Today's Predictions** card: live view of the 4-category JSON

Ollama models are auto-fetched from the worker on mount, so the model
dropdown populates without any clicks.

## Architecture

```
ops-console (3400)  ──► wwht-backend.vercel.app  (X-Ops-Key)
                    └─► local-worker (8788)      (Bearer)
                                      └─► Ollama (11434)
                                      └─► Upstash Redis (writes predictions)
```

trigger-map is not touched — only its `.env` is read for shared Upstash creds.
