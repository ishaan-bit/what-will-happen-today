/**
 * GET /api/ops/users
 *
 * Returns install/user counts using HyperLogLog (memory-efficient cardinality).
 *  - total:    distinct installs ever seen (lifetime)
 *  - dau:      distinct installs that hit /api/predictions/daily today
 *  - last7:    array of { date, count } for the last 7 days
 *  - tokens:   number of devices with push registered (subset of installs)
 *
 * Auth: X-Ops-Key
 */
import { Redis } from '@upstash/redis';
import { requireOpsAuth } from '@/lib/opsAuth';

let _redis = null;
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const TOKEN_SET_KEY = 'wwht:pushTokens';

function dateKeyFromDate(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const redis = getRedis();
    const today = new Date();
    const dateKeys = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dateKeys.push(dateKeyFromDate(d));
    }

    const [total, tokenCount, ...dauCounts] = await Promise.all([
      redis.pfcount('wwht:installs:total'),
      redis.scard(TOKEN_SET_KEY),
      ...dateKeys.map((k) => redis.pfcount(`wwht:installs:dau:${k}`)),
    ]);

    const last7 = dateKeys.map((date, i) => ({ date, count: Number(dauCounts[i] || 0) }));
    return res.status(200).json({
      ok: true,
      total: Number(total || 0),
      dau: last7[0].count,
      last7,
      pushTokens: Number(tokenCount || 0),
    });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
