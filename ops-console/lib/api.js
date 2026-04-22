// Default backend URL — override via NEXT_PUBLIC_BACKEND_URL if needed
export const DEFAULT_BACKEND_URL = 'https://wwht-backend.vercel.app';
export const DEFAULT_WORKER_URL = 'http://localhost:8788';

const STORAGE_KEY = 'wwht-ops-creds';

export function loadCreds() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveCreds(creds) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export function clearCreds() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

async function request(url, opts = {}) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) {
    const err = new Error(body.error || body.message || `HTTP ${r.status}`);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const backend = {
  async status({ backendUrl, opsKey }) {
    return request(`${backendUrl}/api/ops/status`, {
      headers: { 'X-Ops-Key': opsKey },
    });
  },
  async getToday({ backendUrl, opsKey }) {
    try {
      const r = await request(`${backendUrl}/api/ops/predictions/today`, {
        headers: { 'X-Ops-Key': opsKey },
      });
      return r.data || r;
    } catch (err) {
      if (err.status === 404) return { empty: true, dateKey: err.body?.dateKey };
      throw err;
    }
  },
  async clearToday({ backendUrl, opsKey }) {
    return request(`${backendUrl}/api/ops/predictions/regenerate`, {
      method: 'POST',
      headers: { 'X-Ops-Key': opsKey },
    });
  },
};

export const worker = {
  async health({ workerUrl }) {
    return request(`${workerUrl}/health`);
  },
  async status({ workerUrl, workerKey }) {
    return request(`${workerUrl}/status`, {
      headers: { Authorization: `Bearer ${workerKey}` },
    });
  },
  async models({ workerUrl, workerKey }) {
    return request(`${workerUrl}/models`, {
      headers: { Authorization: `Bearer ${workerKey}` },
    });
  },
  async generate({ workerUrl, workerKey, force, model }) {
    return request(`${workerUrl}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${workerKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: !!force, model }),
    });
  },
  async cancel({ workerUrl, workerKey }) {
    return request(`${workerUrl}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${workerKey}` },
    });
  },
};
