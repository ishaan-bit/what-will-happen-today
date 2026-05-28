/**
 * Daily hero pool management.
 *   GET    /api/ops/hero-pool?date=YYYYMMDD
 *   POST   /api/ops/hero-pool
 *   DELETE /api/ops/hero-pool?date=YYYYMMDD
 *
 * Media must be public http(s) image or video URLs. Binary upload storage is
 * intentionally small/dev-friendly; prefer CDN/R2/S3/Cloudinary URLs for scale.
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';
import {
  getServableHeroPool,
  heroPoolKey,
  normalizeDateKey,
  normalizeHeroPool,
  parseStoredJson,
} from '@/lib/heroPool';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  const redis = getRedis();
  const dateKey = normalizeDateKey(req.query.date || req.body?.dateKey || req.body?.date);
  const key = heroPoolKey(dateKey);

  try {
    if (req.method === 'GET') {
      const pool = parseStoredJson(await redis.get(key));
      return res.status(200).json({
        ok: true,
        dateKey,
        heroPool: pool,
        servableHeroPool: getServableHeroPool(pool),
      });
    }

    if (req.method === 'POST') {
      const previous = parseStoredJson(await redis.get(key));
      const pool = normalizeHeroPool({ ...(req.body || {}), dateKey }, previous);
      if (!pool.images.length) {
        return res.status(400).json({
          error: 'media_url_required',
          message: 'Add at least one public http(s) image or video URL.',
        });
      }
      await redis.set(heroPoolKey(pool.dateKey), JSON.stringify(pool));
      return res.status(200).json({
        ok: true,
        dateKey: pool.dateKey,
        heroPool: pool,
        servableHeroPool: getServableHeroPool(pool),
      });
    }

    if (req.method === 'DELETE') {
      await redis.del(key);
      return res.status(200).json({ ok: true, deleted: true, dateKey });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
