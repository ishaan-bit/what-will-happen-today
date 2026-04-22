# WWHT Local Worker

Lightweight HTTP server that runs on your machine and executes the daily
Ollama-based prediction generation. The wwht ops console talks to this
directly because Vercel cannot reach a local LLM.

## Setup

```powershell
cd local-worker
npm install
copy .env.example .env
# Edit .env — set LOCAL_WORKER_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
npm start
```

Default port: **8788** (trigger-map's worker uses 8787 — no conflict).

## Endpoints

| Method | Path        | Auth | Description                                |
| ------ | ----------- | ---- | ------------------------------------------ |
| GET    | `/health`   | none | Service status + active job snapshot       |
| GET    | `/status`   | yes  | Active job + cancel state                  |
| GET    | `/models`   | yes  | List installed Ollama models               |
| POST   | `/generate` | yes  | Start generation. Body: `{ force?, model? }` |
| POST   | `/cancel`   | yes  | Request cancel of running job              |

Auth: `Authorization: Bearer <LOCAL_WORKER_KEY>`

## CLI

Skip the server, run the job once:

```powershell
node generate.js          # skip if already cached
node generate.js --force  # overwrite existing
```
