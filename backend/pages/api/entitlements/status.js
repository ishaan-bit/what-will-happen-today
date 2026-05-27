/**
 * Public anonymous entitlement status.
 * Clients identify themselves with X-Install-Id, the same install salt used
 * by /api/predictions/daily. Local storage remains the primary source in the
 * current app, but this gives us a backend hardening path.
 */
import { Redis } from '@upstash/redis';
import { getEntitlementStatus } from '@/lib/entitlements';

let _redis = null;
function getRedis() {
  if (!_redis && process.env.UPSTASH_REDIS_REST_URL) _redis = Redis.fromEnv();
  return _redis;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const installId = String(req.headers['x-install-id'] || req.query.installId || '').trim().slice(0, 64);
  if (!installId) return res.status(400).json({ ok: false, error: 'install_id_required' });

  try {
    const status = await getEntitlementStatus(getRedis(), installId);
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    return res.status(200).json({ ok: true, entitlement: status });
  } catch (err) {
    return res.status(200).json({
      ok: true,
      entitlement: { active: false, today: false, thirtyDay: false, expiresAt: 0 },
      fallback: true,
    });
  }
}
