/**
 * GET /api/cron/daily-predictions — manual trigger endpoint
 *
 * Calls your local Ollama to generate predictions and stores them in Redis.
 *
 * Trigger from your machine (same pattern as TriggerMap local-worker):
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://wwht-backend.vercel.app/api/cron/daily-predictions
 *
 * NOTE: The Vercel cron in vercel.json is disabled — Ollama runs locally so
 * the backend can't self-trigger LLM generation. Trigger manually or set up
 * a local cron (crontab / Task Scheduler) that POSTs to this endpoint.
 *
 * Secured via CRON_SECRET environment variable.
 */

import { generateDailyPredictions } from '@/jobs/generateDailyPredictions';

export default async function handler(req, res) {
  // Verify Vercel cron secret to prevent unauthorized calls
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await generateDailyPredictions();
    return res.status(200).json({
      ok: true,
      dateKey: result.dateKey,
      categories: Object.keys(result.predictions ?? {}),
    });
  } catch (err) {
    console.error('[cron/daily-predictions]', err);
    return res.status(500).json({ error: err.message });
  }
}
