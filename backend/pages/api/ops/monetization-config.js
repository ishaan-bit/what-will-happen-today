/**
 * Remote monetization config for app funnel tuning.
 *   GET  /api/ops/monetization-config
 *   POST /api/ops/monetization-config
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';
import { normalizeMonetizationConfig, requirePositiveInteger } from '@/lib/monetization';
import { parseStoredJson } from '@/lib/heroPool';

const KEY = 'wwht:monetizationConfig';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  const redis = getRedis();

  try {
    if (req.method === 'GET') {
      const config = normalizeMonetizationConfig(parseStoredJson(await redis.get(KEY)) || {});
      return res.status(200).json({ ok: true, config });
    }

    if (req.method === 'POST') {
      for (const key of ['freeSignalsPerDay', 'lockedSignalsPerDay', 'maxHeroShufflesPerDay', 'maxRewardedShufflesPerDay', 'maxHeroImagesPerDay']) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
          try {
            req.body[key] = requirePositiveInteger(req.body[key], key);
          } catch (err) {
            console.warn('[monetization-config] save rejected', { key, error: err.message });
            return res.status(400).json({ error: 'invalid_monetization_config', message: err.message });
          }
        }
      }
      const config = normalizeMonetizationConfig(req.body || {});
      const value = {
        ...config,
        updatedAt: new Date().toISOString(),
      };
      await redis.set(KEY, JSON.stringify(value));
      console.log('[monetization-config] save succeeded', {
        maxRewardedShufflesPerDay: value.maxRewardedShufflesPerDay,
        maxHeroImagesPerDay: value.maxHeroImagesPerDay,
        updatedAt: value.updatedAt,
      });
      return res.status(200).json({ ok: true, config: value });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[monetization-config] save/fetch failed', { method: req.method, message: err.message });
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
