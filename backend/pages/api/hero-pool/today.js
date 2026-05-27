/**
 * Public endpoint for today's servable hero image pool.
 */
import { Redis } from '@upstash/redis';
import {
  assignDailyHeroSet,
  getServableHeroPool,
  getTodayKey,
  heroPoolKey,
  LEGACY_HERO_KEY,
  legacyHeroAsPool,
  parseStoredJson,
} from '@/lib/heroPool';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const redis = getRedis();
    const dateKey = getTodayKey();
    const [poolRaw, legacyRaw] = await Promise.all([
      redis.get(heroPoolKey(dateKey)),
      redis.get(LEGACY_HERO_KEY),
    ]);

    const installId = String(req.headers['x-install-id'] || req.query.installId || '').trim().slice(0, 64);
    const storedPool = getServableHeroPool(parseStoredJson(poolRaw));
    const legacyPool = getServableHeroPool(legacyHeroAsPool(parseStoredJson(legacyRaw), dateKey), { allowData: true });
    const pool = assignDailyHeroSet(storedPool, {
      installId,
      dateKey,
      count: 4,
      fallbackHero: legacyPool,
    }) || legacyPool || null;

    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    return res.status(200).json({
      ok: true,
      dateKey,
      heroPool: pool,
      defaultHero: pool?.images?.find((img) => img.id === pool.defaultHeroId) || pool?.images?.[0] || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
