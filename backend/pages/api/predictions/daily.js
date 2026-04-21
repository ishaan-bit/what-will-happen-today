/**
 * GET /api/predictions/daily
 *
 * Serves today's LLM-generated predictions to the mobile app.
 * Falls back gracefully if predictions haven't been generated yet.
 *
 * Mobile app calls this once per day and falls back to local pool
 * if this endpoint is unavailable or returns an error.
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
    const cacheKey = `wwht:predictions:${dateKey}`;

    const raw = await redis.get(cacheKey);

    if (!raw) {
      // Not yet generated – mobile falls back to local pool
      return res.status(404).json({
        error: 'not_ready',
        message: 'Predictions not yet generated for today',
      });
    }

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // Cache at CDN/browser for 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

    return res.status(200).json({
      data: data.predictions,
      dateKey: data.dateKey,
      generatedAt: data.generatedAt,
    });
  } catch (err) {
    console.error('[/api/predictions/daily]', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
