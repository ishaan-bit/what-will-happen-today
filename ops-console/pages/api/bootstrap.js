/**
 * GET /api/bootstrap
 * Server-side: read OPS_KEY + LOCAL_WORKER_KEY off disk so the dashboard
 * can skip the login screen on `npm run dev`.
 *
 * Looks for:
 *   ../backend/.ops-key.local.txt          → OPS_KEY
 *   ../local-worker/.env  (LOCAL_WORKER_KEY)
 */
import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE = path.resolve(process.cwd(), '..');
const OPS_KEY_FILE = path.join(WORKSPACE, 'backend', '.ops-key.local.txt');
const WORKER_ENV_FILE = path.join(WORKSPACE, 'local-worker', '.env');

const DEFAULT_BACKEND = 'https://wwht-backend.vercel.app';
const DEFAULT_WORKER = 'http://localhost:8788';

function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || m[1] !== key) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return null;
}

export default function handler(req, res) {
  let opsKey = null;
  let workerKey = null;
  const sources = {};

  if (fs.existsSync(OPS_KEY_FILE)) {
    opsKey = fs.readFileSync(OPS_KEY_FILE, 'utf8').trim();
    sources.opsKey = OPS_KEY_FILE;
  }

  workerKey = readEnvKey(WORKER_ENV_FILE, 'LOCAL_WORKER_KEY');
  if (workerKey) sources.workerKey = WORKER_ENV_FILE;

  res.status(200).json({
    backendUrl: DEFAULT_BACKEND,
    workerUrl: DEFAULT_WORKER,
    opsKey: opsKey || null,
    workerKey: workerKey || null,
    sources,
    autoLogin: !!(opsKey),
  });
}
