/**
 * Shared push helpers used by ops endpoints and the cron sender.
 */
import { Redis } from '@upstash/redis';

let _redis = null;
export function getRedis() {
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

export const TOKEN_SET_KEY = 'wwht:pushTokens';
export const TOKEN_META_PREFIX = 'wwht:pushMeta:';
export const SCHEDULE_KEY = 'wwht:pushSchedule';
export const LAST_SENT_PREFIX = 'wwht:pushSent:';
export const SEND_LOG_KEY = 'wwht:pushLog';

/** Send via Expo push service in batches of 100. Returns aggregate stats. */
export async function sendExpoPush({ tokens, title, body, data }) {
  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: data || {},
    priority: 'high',
  }));

  const results = { ok: 0, failed: 0, errors: [], invalidTokens: [] };
  const chunks = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const r = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      const json = await r.json();
      const tickets = Array.isArray(json?.data) ? json.data : [];
      tickets.forEach((t, idx) => {
        if (t.status === 'ok') {
          results.ok += 1;
        } else {
          results.failed += 1;
          if (t.details?.error === 'DeviceNotRegistered') {
            results.invalidTokens.push(chunk[idx].to);
          }
          results.errors.push({ token: chunk[idx].to, message: t.message });
        }
      });
    } catch (err) {
      results.failed += chunk.length;
      results.errors.push({ message: err.message });
    }
  }
  return results;
}

/** Remove tokens reported as no-longer-registered. */
export async function pruneTokens(invalidTokens) {
  if (!invalidTokens?.length) return;
  const redis = getRedis();
  await Promise.all([
    redis.srem(TOKEN_SET_KEY, ...invalidTokens),
    ...invalidTokens.map((t) => redis.del(TOKEN_META_PREFIX + t)),
  ]);
}

/** Today's date string in the configured tz (default Asia/Kolkata). */
export function getDateKeyInTz(tz = 'Asia/Kolkata') {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(now).replace(/-/g, ''); // YYYYMMDD
}

/** "HH:MM" in tz right now. */
export function getCurrentHhMm(tz = 'Asia/Kolkata') {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return fmt.format(now); // "HH:MM"
}
