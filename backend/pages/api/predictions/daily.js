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

    const [raw, ruleBucket, heroRaw] = await Promise.all([
      redis.get(`wwht:predictions:${dateKey}`),
      redis.get('wwht:ruleBucket'),
      redis.get('wwht:heroImage'),
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
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');

    return res.status(200).json({
      data,
      dateKey,
      generatedAt,
      ruleBucket: ruleBucket ? String(ruleBucket) : '0',
      heroImage,
    });
  } catch (err) {
    console.error('[/api/predictions/daily]', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}