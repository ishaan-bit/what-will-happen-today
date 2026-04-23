/**
 * WWHT Local Worker
 *
 * Lightweight HTTP server that runs on the developer machine and
 * executes the Ollama-based prediction generation job. The wwht ops
 * console calls this directly because Vercel cannot reach a local LLM.
 *
 * Endpoints:
 *   GET  /health                  — public, no auth
 *   GET  /models                  — auth, list available Ollama models
 *   POST /generate                — auth, generate today's predictions
 *   POST /cancel                  — auth, cancel running generation
 *   GET  /status                  — auth, current job state
 *
 * Auth: Bearer LOCAL_WORKER_KEY
 */

import { bootstrapEnv } from './bootstrap.js';
const bootInfo = bootstrapEnv();

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { generateAll, JOB_STATE } from './generate.js';

const PORT = parseInt(process.env.LOCAL_WORKER_PORT || '8788', 10);
const WORKER_KEY = (process.env.LOCAL_WORKER_KEY || '').trim();
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/v1';

if (!WORKER_KEY) {
  console.error('ERROR: LOCAL_WORKER_KEY missing after bootstrap. Aborting.');
  process.exit(1);
}
if (!bootInfo.upstashConfigured) {
  console.warn('[boot] WARNING: UPSTASH_REDIS_REST_URL/TOKEN not found in any env file.');
  console.warn('[boot] Tried: ' + bootInfo.sources.map((p) => p.replace(/.*[\\/]/, '')).join(', '));
}

// ── Active job tracking ──
let activeJob = null; // { startedAt, status: 'running'|'done'|'error', result, error }

// ── Helpers ──
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function verifyBearer(req) {
  const header = (req.headers.authorization || '').toString();
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7).trim();
  if (token.length !== WORKER_KEY.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(WORKER_KEY));
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 64) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── Ollama probe ──
async function listOllamaModels() {
  const base = OLLAMA_API_URL.replace(/\/v1\/?$/, '');
  try {
    const r = await fetch(`${base}/api/tags`);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const data = await r.json();
    return { ok: true, models: (data.models || []).map((m) => m.name) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Routes ──
async function handleRequest(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Health (public)
  if (path === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'wwht-local-worker',
      uptime: process.uptime(),
      activeJob: activeJob ? {
        startedAt: activeJob.startedAt,
        status: activeJob.status,
        elapsedMs: Date.now() - activeJob.startedAt,
      } : null,
    });
  }

  // All other routes require auth
  if (!verifyBearer(req)) {
    return json(res, 401, { error: 'unauthorized' });
  }

  if (path === '/status' && req.method === 'GET') {
    return json(res, 200, { activeJob, lastJobState: JOB_STATE });
  }

  if (path === '/models' && req.method === 'GET') {
    const result = await listOllamaModels();
    return json(res, result.ok ? 200 : 503, result);
  }

  if (path === '/generate' && req.method === 'POST') {
    if (activeJob && activeJob.status === 'running') {
      return json(res, 409, { error: 'job_running', startedAt: activeJob.startedAt });
    }
    const body = await readBody(req);
    const force = !!body.force;
    const model = body.model;
    const variantCount = body.variantCount;

    activeJob = { startedAt: Date.now(), status: 'running', result: null, error: null };

    // Run async — return immediately
    generateAll({ force, model, variantCount })
      .then((result) => {
        activeJob.status = 'done';
        activeJob.result = result;
        activeJob.completedAt = Date.now();
        console.log(`[worker] generation complete in ${Date.now() - activeJob.startedAt}ms`);
      })
      .catch((err) => {
        activeJob.status = 'error';
        activeJob.error = err.message;
        activeJob.completedAt = Date.now();
        console.error(`[worker] generation failed: ${err.message}`);
      });

    return json(res, 202, { ok: true, started: true, startedAt: activeJob.startedAt });
  }

  if (path === '/cancel' && req.method === 'POST') {
    if (!activeJob || activeJob.status !== 'running') {
      return json(res, 404, { error: 'no_active_job' });
    }
    JOB_STATE.cancelRequested = true;
    return json(res, 200, { ok: true, cancelRequested: true });
  }

  return json(res, 404, { error: 'not_found' });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[worker] request error:', err.message);
    json(res, 500, { error: 'internal_error', message: err.message });
  });
});

server.listen(PORT, () => {
  console.log(`[worker] WWHT local worker listening on http://localhost:${PORT}`);
  console.log(`[worker] Ollama: ${OLLAMA_API_URL}`);
});
