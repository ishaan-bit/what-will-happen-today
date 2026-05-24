/**
 * GET /api/predictions/daily
 *
 * Serves todays LLM-generated predictions to the mobile app PLUS
 * server-driven control values that influence the rule-based engine
 * (ruleBucket) and the optional hero image at the top of the UI.
 */

import { Redis } from '@upstash/redis';

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const redis = getRedis();
    const dateKey = getTodayKey();

    // Track unique installs (HyperLogLog — tiny memory, ~1% error)
    // Client sends X-Install-Id header (the installSalt). No PII.
    const installId = (req.headers['x-install-id'] || '').toString().slice(0, 64);
    if (installId) {
      try {
        await Promise.all([
          redis.pfadd('wwht:installs:total', installId),
          redis.pfadd(`wwht:installs:dau:${dateKey}`, installId),
          // Keep DAU keys for ~8 days then auto-expire
          redis.expire(`wwht:installs:dau:${dateKey}`, 8 * 24 * 60 * 60),
        ]);
      } catch {
        // Non-critical
      }
    }

    const [raw, ruleBucket, heroRaw, engineModeRaw] = await Promise.all([
      redis.get(`wwht:predictions:${dateKey}`),
      redis.get('wwht:ruleBucket'),
      redis.get('wwht:heroImage'),
      redis.get('wwht:engineMode'),
    ]);

    let data = null;
    let generatedAt = null;
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      data = parsed.predictions || null;
      generatedAt = parsed.generatedAt || null;
    }

    let heroImage = null;
    if (heroRaw) {
      try {
        heroImage = typeof heroRaw === 'string' ? JSON.parse(heroRaw) : heroRaw;
      } catch {
        heroImage = null;
      }
      if (heroImage && (!heroImage.url || heroImage.enabled === false)) {
        heroImage = null;
      } else if (heroImage) {
        heroImage = {
          ...heroImage,
          revision: heroImage.revision || heroImage.updatedAt || null,
        };
      }
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

    // Engine mode controls which source the client renders.
    //   'llm'  -> show LLM payload when present (fallback to rule per-category)
    //   'rule' -> show rule-based picks only, ignore LLM payload entirely
    // Defaults to 'llm' for backwards compatibility.
    const engineMode = engineModeRaw === 'rule' ? 'rule' : 'llm';

    return res.status(200).json({
      data,
      dateKey,
      generatedAt,
      readingUpdatedAt: generatedAt,
      contentRevision: generatedAt || dateKey,
      ruleBucket: ruleBucket ? String(ruleBucket) : '0',
      engineMode,
      heroImage,
      heroImageUpdatedAt: heroImage?.updatedAt || null,
      heroImageRevision: heroImage?.revision || heroImage?.updatedAt || null,
    });
  } catch (err) {
    console.error('[/api/predictions/daily]', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
