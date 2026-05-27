const FULL_UNLOCK_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;

export function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

export function entitlementKeys(installId, dateKey = getTodayKey()) {
  const id = String(installId || '').trim().slice(0, 64);
  return {
    daily: `wwht:entitlement:${id}:daily:${dateKey}`,
    full: `wwht:entitlement:${id}:full`,
  };
}

export async function recordVerifiedEntitlement(redis, { installId, productId, orderId }) {
  if (!redis || !installId) return null;
  const dateKey = getTodayKey();
  const keys = entitlementKeys(installId, dateKey);
  const now = Date.now();

  if (productId === 'daily_unlock_v1') {
    const entitlement = {
      type: 'today',
      productId,
      orderId: orderId || null,
      dateKey,
      grantedAt: now,
      expiresAt: now + 2 * DAY_SECONDS * 1000,
    };
    await redis.set(keys.daily, JSON.stringify(entitlement), { ex: 2 * DAY_SECONDS });
    return entitlement;
  }

  if (productId === 'full_unlock_v1') {
    const entitlement = {
      type: 'thirty_day',
      productId,
      orderId: orderId || null,
      grantedAt: now,
      expiresAt: now + FULL_UNLOCK_DAYS * DAY_SECONDS * 1000,
    };
    await redis.set(keys.full, JSON.stringify(entitlement), { ex: (FULL_UNLOCK_DAYS + 1) * DAY_SECONDS });
    return entitlement;
  }

  return null;
}

function parse(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function getEntitlementStatus(redis, installId) {
  if (!redis || !installId) {
    return { active: false, today: false, thirtyDay: false, expiresAt: 0 };
  }
  const keys = entitlementKeys(installId);
  const [dailyRaw, fullRaw] = await Promise.all([
    redis.get(keys.daily),
    redis.get(keys.full),
  ]);
  const now = Date.now();
  const daily = parse(dailyRaw);
  const full = parse(fullRaw);
  const today = !!daily && (!daily.expiresAt || Number(daily.expiresAt) > now);
  const thirtyDay = !!full && (!full.expiresAt || Number(full.expiresAt) > now);
  const expiresAt = Math.max(Number(daily?.expiresAt || 0), Number(full?.expiresAt || 0));
  return {
    active: today || thirtyDay,
    today,
    thirtyDay,
    expiresAt,
    daily: today ? daily : null,
    full: thirtyDay ? full : null,
  };
}
