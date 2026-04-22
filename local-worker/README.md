# WWHT Local Worker

Lightweight HTTP server that runs the daily Ollama-based prediction generation.
The wwht ops console talks to this directly because Vercel cannot reach a local LLM.

## Quick start

```powershell
cd local-worker
npm install
npm run dev
```

That's it. Bootstrap will:

1. Auto-load env from this chain (first hit wins):
   - `local-worker/.env`
   - `../backend/.env.local`
   - `../backend/.env`
   - `../../trigger-map/backend/.env`
2. Auto-generate `LOCAL_WORKER_KEY` and persist it to `local-worker/.env`
   if not already set.
3. Inherit `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` from
   the wwht backend (which mirrors trigger-map's Upstash).

Default port: **8788** (trigger-map uses 8787 — no conflict).

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

```powershell
node generate.js          # skip if already cached
node generate.js --force  # overwrite existing
```
