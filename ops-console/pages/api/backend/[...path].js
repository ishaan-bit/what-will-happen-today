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
const BACKEND_URL = process.env.WWHT_BACKEND_URL || 'https://wwht-backend.vercel.app';

function getOpsKey() {
  if (process.env.OPS_KEY) return process.env.OPS_KEY.trim();
  if (fs.existsSync(OPS_KEY_FILE)) return fs.readFileSync(OPS_KEY_FILE, 'utf8').trim();
  return null;
}

export default async function handler(req, res) {
  const { path: segments = [] } = req.query;
  // segments already contain the full path after /api/backend/ e.g. ['ops','status']
  const upstream = `${BACKEND_URL}/api/${segments.join('/')}`;

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
  const url = upstream + qs;

  try {
    const upstreamRes = await fetch(url, {
      method: req.method,
      headers,
      ...(req.method !== 'GET' && req.method !== 'HEAD'
        ? { body: JSON.stringify(req.body) }
        : {}),
    });
    const text = await upstreamRes.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    res.status(upstreamRes.status).json(body);
  } catch (err) {
    res.status(502).json({ error: 'proxy_error', message: err.message, upstream });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };
