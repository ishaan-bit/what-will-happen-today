/**
 * Server-side proxy for all /api/ops/* backend calls.
 * - Runs in the Next.js server process → no CORS
 * - OPS_KEY is resolved server-side (from bootstrap), never sent to browser
 *
 * Usage: /api/backend/ops/status  →  wwht-backend.vercel.app/api/ops/status
 *        /api/backend/ops/predictions/today  →  …/api/ops/predictions/today
 */
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE = path.resolve(process.cwd(), '..');
const OPS_KEY_FILE = path.join(WORKSPACE, 'backend', '.ops-key.local.txt');
const DEFAULT_BACKEND_URL = 'https://wwht-backend.vercel.app';
const CONFIGURED_BACKEND_URL = process.env.WWHT_BACKEND_URL?.trim();
const BACKEND_URL = normalizeBaseUrl(CONFIGURED_BACKEND_URL || DEFAULT_BACKEND_URL);
const LOCAL_BACKEND_URL = normalizeBaseUrl(process.env.WWHT_LOCAL_BACKEND_URL || 'http://localhost:3000');
const LOCAL_ROUTE_FALLBACKS = new Set([
  'ops/hero-pool',
  'ops/hero-batch-upload',
]);

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function getOpsKey() {
  if (process.env.OPS_KEY) return process.env.OPS_KEY.trim();
  if (fs.existsSync(OPS_KEY_FILE)) return fs.readFileSync(OPS_KEY_FILE, 'utf8').trim();
  return null;
}

function buildUpstreamUrl(baseUrl, segments, search) {
  return `${baseUrl}/api/${segments.join('/')}${search}`;
}

async function fetchUpstream(url, req, headers, body) {
  const upstreamRes = await fetch(url, {
    method: req.method,
    headers,
    ...(body !== null ? { body } : {}),
  });
  const text = await upstreamRes.text();
  let responseBody;
  try { responseBody = JSON.parse(text); } catch { responseBody = { raw: text }; }
  return {
    status: upstreamRes.status,
    body: responseBody,
  };
}

export default async function handler(req, res) {
  const { path: segments = [] } = req.query;
  const routePath = segments.join('/');

  const opsKey = getOpsKey();
  if (!opsKey) {
    return res.status(503).json({ error: 'ops_key_missing', message: 'No OPS_KEY found on server' });
  }

  const headers = {
    'X-Ops-Key': opsKey,
    'Content-Type': 'application/json',
  };

  // Forward query string (e.g. ?date=20260423)
  const qs = new URL(req.url, 'http://localhost').search;
  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? JSON.stringify(req.body)
    : null;
  const upstream = buildUpstreamUrl(BACKEND_URL, segments, qs);

  try {
    let response = await fetchUpstream(upstream, req, headers, body);
    if (
      response.status === 404 &&
      !CONFIGURED_BACKEND_URL &&
      LOCAL_ROUTE_FALLBACKS.has(routePath)
    ) {
      const localUpstream = buildUpstreamUrl(LOCAL_BACKEND_URL, segments, qs);
      try {
        response = await fetchUpstream(localUpstream, req, headers, body);
      } catch {
        // Keep the production 404 when no local backend is listening.
      }
    }
    res.status(response.status).json(response.body);
  } catch (err) {
    res.status(502).json({ error: 'proxy_error', message: err.message, upstream });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '16mb' } } };
