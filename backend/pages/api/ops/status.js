/**
 * GET /api/ops/status
 * Lightweight health snapshot for the WWHT ops console.
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}
function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const env = {
    redisConfigured: !!process.env.UPSTASH_REDIS_REST_URL,
    cronSecretConfigured: !!process.env.CRON_SECRET,
    opsKeyConfigured: !!process.env.OPS_KEY,
    blobReadWriteTokenConfigured: !!process.env.BLOB_READ_WRITE_TOKEN,
    blobStoreIdConfigured: !!process.env.BLOB_STORE_ID,
    blobWebhookPublicKeyConfigured: !!process.env.BLOB_WEBHOOK_PUBLIC_KEY,
  };

  let redisOk = false;
  let todayReady = false;
  let generatedAt = null;
  let categories = [];
  try {
    const redis = getRedis();
    await redis.set('wwht:health', new Date().toISOString(), { ex: 60 });
    redisOk = !!(await redis.get('wwht:health'));

    const dateKey = getTodayKey();
    const raw = await redis.get(`wwht:predictions:${dateKey}`);
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      todayReady = true;
      generatedAt = parsed.generatedAt || null;
      categories = Object.keys(parsed.predictions || {});
    }
  } catch (err) {
    return res.status(500).json({ error: 'redis_error', message: err.message, env });
  }

  return res.status(200).json({
    ok: true,
    service: 'wwht-backend',
    checkedAt: new Date().toISOString(),
    env,
    redis: { ok: redisOk },
    today: { ready: todayReady, generatedAt, categories, dateKey: getTodayKey() },
  });
}
