/**
 * Push notification ops endpoints.
 *
 *   GET  /api/ops/push                  → stats (token count, schedule, last log)
 *   POST /api/ops/push/schedule         → { hour, minute, enabled, title?, body? }
 *   POST /api/ops/push/send-now         → { title, body } send to all tokens immediately
 *
 * Auth: X-Ops-Key.
 */
import { requireOpsAuth } from '@/lib/opsAuth';
import {
  getRedis, TOKEN_SET_KEY, SCHEDULE_KEY, SEND_LOG_KEY,
  sendExpoPush, pruneTokens,
} from '@/lib/push';

export default async function handler(req, res) {
  if (!requireOpsAuth(req, res)) return;
  const redis = getRedis();
  const segs = (req.query.path || []).filter(Boolean);
  const sub = segs[0] || '';

  try {
    if (req.method === 'GET' && sub === '') {
      const [count, schedRaw, logItems] = await Promise.all([
        redis.scard(TOKEN_SET_KEY),
        redis.get(SCHEDULE_KEY),
        redis.lrange(SEND_LOG_KEY, 0, 9),
      ]);
      let schedule = null;
      if (schedRaw) {
        try { schedule = typeof schedRaw === 'string' ? JSON.parse(schedRaw) : schedRaw; }
        catch { schedule = null; }
      }
      const log = (logItems || []).map((it) => {
        try { return typeof it === 'string' ? JSON.parse(it) : it; }
        catch { return { raw: String(it) }; }
      });
      return res.status(200).json({
        ok: true,
        tokenCount: count || 0,
        schedule: schedule || { enabled: false, hour: 8, minute: 0, tz: 'Asia/Kolkata' },
        recentSends: log,
      });
    }

    if (req.method === 'POST' && sub === 'schedule') {
      const body = req.body || {};
      const hour = Math.max(0, Math.min(23, parseInt(body.hour, 10) || 0));
      const minute = Math.max(0, Math.min(59, parseInt(body.minute, 10) || 0));
      const sched = {
        enabled: body.enabled !== false,
        hour, minute,
        tz: 'Asia/Kolkata',
        title: (body.title || "Today's reading is ready").toString().slice(0, 80),
        body: (body.body || 'Your four signals for today are waiting.').toString().slice(0, 160),
        updatedAt: new Date().toISOString(),
      };
      await redis.set(SCHEDULE_KEY, JSON.stringify(sched));
      return res.status(200).json({ ok: true, schedule: sched });
    }

    if (req.method === 'POST' && sub === 'send-now') {
      const body = req.body || {};
      const title = (body.title || "Today's reading is ready").toString().slice(0, 80);
      const text = (body.body || 'Open the app to see your four signals.').toString().slice(0, 160);
      const tokens = await redis.smembers(TOKEN_SET_KEY);
      if (!tokens || tokens.length === 0) {
        return res.status(200).json({ ok: true, sent: 0, message: 'no_tokens' });
      }
      const result = await sendExpoPush({ tokens, title, body: text });
      await pruneTokens(result.invalidTokens);
      const entry = {
        at: new Date().toISOString(),
        trigger: 'manual',
        targeted: tokens.length,
        ok: result.ok,
        failed: result.failed,
        prunedInvalid: result.invalidTokens.length,
      };
      await redis.lpush(SEND_LOG_KEY, JSON.stringify(entry));
      await redis.ltrim(SEND_LOG_KEY, 0, 49);
      return res.status(200).json({ ok: true, ...entry });
    }

    return res.status(404).json({ error: 'not_found' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
