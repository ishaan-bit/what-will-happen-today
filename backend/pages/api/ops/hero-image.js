/**
 * Hero image management.
 *   GET    /api/ops/hero-image          → current value (or null)
 *   POST   /api/ops/hero-image          → { url, alt?, enabled? } (alt optional)
 *   DELETE /api/ops/hero-image          → remove
 *
 * The mobile app reads this through /api/predictions/daily.
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const KEY = 'wwht:heroImage';

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
};

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  const redis = getRedis();

  try {
    if (req.method === 'GET') {
      const raw = await redis.get(KEY);
      let value = null;
      if (raw) {
        try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; }
        catch { value = null; }
      }
      return res.status(200).json({ ok: true, heroImage: value });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const url = (body.url || '').toString().trim();
      if (!url) return res.status(400).json({ error: 'url_required' });
      // Allow http(s) or data: URLs (small base64 OK, large should be hosted)
      if (!/^(https?:|data:image\/)/i.test(url)) {
        return res.status(400).json({ error: 'invalid_url' });
      }
      const raw = await redis.get(KEY);
      let previous = null;
      if (raw) {
        try { previous = typeof raw === 'string' ? JSON.parse(raw) : raw; }
        catch { previous = null; }
      }
      const revision = Number(previous?.revision || 0) + 1;
      const value = {
        url,
        alt: (body.alt || 'Tarot reader').toString().slice(0, 120),
        enabled: body.enabled !== false,
        revision,
        updatedAt: new Date().toISOString(),
      };
      await redis.set(KEY, JSON.stringify(value));
      return res.status(200).json({ ok: true, heroImage: value });
    }

    if (req.method === 'DELETE') {
      await redis.del(KEY);
      return res.status(200).json({ ok: true, deleted: true });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
