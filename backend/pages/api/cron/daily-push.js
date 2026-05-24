/**
 * GET /api/cron/daily-push
 *
 * Vercel Hobby cron pings this once per day (configured in vercel.json
 * for 03:30 UTC = 09:00 IST). On Hobby we cannot run the cron more than
 * once per day, so the operator-configured HH:MM in the ops console is
 * informational only — actual fire time is the cron schedule.
 *
 * If it's enabled and we haven't sent today, send now. Use ?force=1
 * (still gated by CRON_SECRET) for ad-hoc verification.
 *
 * Auth: Vercel sends ?key= or Authorization: Bearer <CRON_SECRET>.
 */
import {
  getRedis, TOKEN_SET_KEY, SCHEDULE_KEY, LAST_SENT_PREFIX, SEND_LOG_KEY,
  sendExpoPush, pruneTokens, getDateKeyInTz,
} from '@/lib/push';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unprotected if no secret set
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${secret}`) return true;
  if ((req.query.key || '') === secret) return true;
  return false;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const redis = getRedis();
    const force = req.query.force === '1' || req.query.force === 'true';
    const schedRaw = await redis.get(SCHEDULE_KEY);
    if (!schedRaw && !force) return res.status(200).json({ ok: true, skipped: 'no_schedule' });
    const sched = schedRaw
      ? (typeof schedRaw === 'string' ? JSON.parse(schedRaw) : schedRaw)
      : {};
    if (!force && sched.enabled === false) {
      return res.status(200).json({ ok: true, skipped: 'disabled' });
    }

    const tz = sched.tz || 'Asia/Kolkata';
    const dateKey = getDateKeyInTz(tz);

    const sentKey = LAST_SENT_PREFIX + dateKey;
    const already = await redis.get(sentKey);
    if (already && !force) {
      return res.status(200).json({ ok: true, skipped: 'already_sent', dateKey });
    }

    const tokens = await redis.smembers(TOKEN_SET_KEY);
    if (!tokens || tokens.length === 0) {
      // Don't burn the day's sentinel on transient empty-token state.
      return res.status(200).json({ ok: true, sent: 0, message: 'no_tokens' });
    }

    const result = await sendExpoPush({
      tokens,
      title: sched.title || "Today's reading is ready",
      body: sched.body || 'Open the app to see your four signals.',
    });
    await pruneTokens(result.invalidTokens);
    await redis.set(sentKey, JSON.stringify({ at: new Date().toISOString(), ok: result.ok }), {
      ex: 36 * 60 * 60,
    });
    const entry = {
      at: new Date().toISOString(),
      trigger: 'cron',
      targeted: tokens.length,
      ok: result.ok,
      failed: result.failed,
      prunedInvalid: result.invalidTokens.length,
    };
    await redis.lpush(SEND_LOG_KEY, JSON.stringify(entry));
    await redis.ltrim(SEND_LOG_KEY, 0, 49);

    return res.status(200).json({ ok: true, ...entry });
  } catch (err) {
    console.error('[cron/daily-push]', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
