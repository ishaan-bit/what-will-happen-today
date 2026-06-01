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

function positiveInteger(value, name) {
  if (typeof value === 'string' && !/^[1-9]\d*$/.test(value.trim())) {
    throw new Error(`${name}_must_be_positive_integer`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name}_must_be_positive_integer`);
  return n;
}

function emptyPool(dateKey, previous = null) {
  return {
    dateKey,
    assignment: previous?.assignment || '',
    images: Array.isArray(previous?.images) ? previous.images : [],
    config: previous?.config || {},
    revision: Number(previous?.revision || 0),
    heroShuffleResetNonce: previous?.heroShuffleResetNonce || null,
    heroShuffleResetAt: previous?.heroShuffleResetAt || null,
    updatedAt: previous?.updatedAt || new Date().toISOString(),
  };
}

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
      const action = String(req.body?.action || '').trim();

      if (action === 'settings') {
        let maxHeroShufflesPerDay;
        let maxHeroImagesPerDay;
        try {
          maxHeroShufflesPerDay = positiveInteger(req.body?.maxRewardedShufflesPerDay ?? req.body?.maxHeroShufflesPerDay, 'maxRewardedShufflesPerDay');
          maxHeroImagesPerDay = positiveInteger(req.body?.maxHeroImagesPerDay ?? req.body?.maxImagesPerDay, 'maxHeroImagesPerDay');
        } catch (err) {
          return res.status(400).json({ error: 'invalid_batch_settings', message: err.message });
        }
        const pool = emptyPool(dateKey, previous);
        const next = {
          ...pool,
          config: {
            ...(pool.config || {}),
            maxHeroShufflesPerDay,
            maxRewardedShufflesPerDay: maxHeroShufflesPerDay,
            maxHeroImagesPerDay,
            maxImagesPerDay: maxHeroImagesPerDay,
          },
          revision: Number(pool.revision || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
        await redis.set(heroPoolKey(next.dateKey), JSON.stringify(next));
        console.log('[hero-pool] batch settings saved', { dateKey: next.dateKey, config: next.config, revision: next.revision });
        return res.status(200).json({
          ok: true,
          dateKey: next.dateKey,
          heroPool: next,
          servableHeroPool: getServableHeroPool(next),
        });
      }

      if (action === 'reset-shuffle-usage') {
        const pool = emptyPool(dateKey, previous);
        const resetAt = new Date().toISOString();
        const resetNonce = `${dateKey}:${Date.now()}`;
        const next = {
          ...pool,
          heroShuffleResetNonce: resetNonce,
          heroShuffleResetAt: resetAt,
          revision: Number(pool.revision || 0) + 1,
          updatedAt: resetAt,
        };
        await redis.set(heroPoolKey(next.dateKey), JSON.stringify(next));
        console.log('[hero-pool] reset nonce changed', { dateKey: next.dateKey, heroShuffleResetNonce: resetNonce, revision: next.revision });
        return res.status(200).json({
          ok: true,
          dateKey: next.dateKey,
          heroPool: next,
          heroShuffleResetNonce: resetNonce,
          heroShuffleResetAt: resetAt,
          servableHeroPool: getServableHeroPool(next),
        });
      }

      const pool = normalizeHeroPool({ ...(req.body || {}), dateKey }, previous);
      if (!pool.images.length) {
        return res.status(400).json({
          error: 'media_url_required',
          message: 'Add at least one public http(s) image or video URL.',
        });
      }
      await redis.set(heroPoolKey(pool.dateKey), JSON.stringify(pool));
      const previousDefaultId = Array.isArray(previous?.images) ? previous.images.find((img) => img?.isDefault || img?.default)?.id : null;
      const nextDefaultId = pool.images.find((img) => img.isDefault)?.id || null;
      console.log('[hero-pool] batch pool saved', { dateKey: pool.dateKey, images: pool.images.length, config: pool.config, revision: pool.revision });
      if (previousDefaultId !== nextDefaultId) {
        console.log('[hero-pool] default asset changed', { dateKey: pool.dateKey, previousDefaultId, nextDefaultId });
      }
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
