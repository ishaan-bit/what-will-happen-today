/**
 * Bootstrap helper — runs before server starts.
 *
 * - Loads env from a chain of files (first hit wins per key):
 *     1. local-worker/.env                  (this folder)
 *     2. ../backend/.env.local              (wwht backend local)
 *     3. ../backend/.env                    (wwht backend)
 *     4. ../../trigger-map/backend/.env     (sibling project, same Upstash)
 * - Auto-generates LOCAL_WORKER_KEY if absent and writes it to local-worker/.env
 *   so ops-console can pick it up via /api/bootstrap.
 * - Reads OPS_KEY from backend/.ops-key.local.txt and exposes the path
 *   (used only by ops-console — worker doesn't need it).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const WORKSPACE = path.resolve(ROOT, '..');
const TRIGGER_MAP = path.resolve(WORKSPACE, '..', 'trigger-map');

const LOCAL_ENV = path.join(ROOT, '.env');

const ENV_CHAIN = [
  LOCAL_ENV,
  path.join(WORKSPACE, 'backend', '.env.local'),
  path.join(WORKSPACE, 'backend', '.env'),
  path.join(TRIGGER_MAP, 'backend', '.env'),
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    // strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

export function bootstrapEnv() {
  const loaded = {};
  for (const file of ENV_CHAIN) {
    const parsed = parseEnvFile(file);
    for (const [k, v] of Object.entries(parsed)) {
      // first wins
      if (!(k in loaded)) loaded[k] = v;
    }
  }

  // Apply to process.env (don't override anything already set)
  for (const [k, v] of Object.entries(loaded)) {
    if (!(k in process.env)) process.env[k] = v;
  }

  // Auto-generate worker key if missing
  if (!process.env.LOCAL_WORKER_KEY ||
      process.env.LOCAL_WORKER_KEY === 'change-me-to-a-strong-secret' ||
      process.env.LOCAL_WORKER_KEY === 'change-me') {
    const generated = randomBytes(24).toString('base64url');
    process.env.LOCAL_WORKER_KEY = generated;
    persistWorkerKey(generated);
    console.log('[bootstrap] generated new LOCAL_WORKER_KEY → local-worker/.env');
  }

  if (!process.env.LOCAL_WORKER_PORT) process.env.LOCAL_WORKER_PORT = '8788';
  if (!process.env.OLLAMA_API_URL) process.env.OLLAMA_API_URL = 'http://localhost:11434/v1';

  return {
    sources: ENV_CHAIN.filter(fs.existsSync),
    upstashConfigured: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  };
}

function persistWorkerKey(key) {
  let lines = [];
  if (fs.existsSync(LOCAL_ENV)) {
    lines = fs.readFileSync(LOCAL_ENV, 'utf8').split(/\r?\n/);
  }
  let replaced = false;
  lines = lines.map((line) => {
    if (/^\s*LOCAL_WORKER_KEY\s*=/.test(line)) {
      replaced = true;
      return `LOCAL_WORKER_KEY=${key}`;
    }
    return line;
  });
  if (!replaced) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push(`LOCAL_WORKER_KEY=${key}`);
  }
  fs.writeFileSync(LOCAL_ENV, lines.join('\n'), 'utf8');
}

export const PATHS = { ROOT, WORKSPACE, TRIGGER_MAP, LOCAL_ENV };
